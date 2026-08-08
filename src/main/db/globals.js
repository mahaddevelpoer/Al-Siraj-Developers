const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { getGlobalsPath, getPropertiesPath, readExcelFile, appendToExcel, updateExcelRow, generateId, ensureSheetColumns } = require('./core');
const { recordMoneyEvent, getMoneySummary, backfillMoneyLedger, getAllTownFinancialSummaries, refreshTownFinancialSummary } = require('./moneyLedger');

function isPropertySale(row) {
  const type = String(row?.Type || '').trim().toLowerCase();
  return type === 'plot' || type === 'shop';
}

async function ensureCollectionPaymentsFile(filePath) {
  if (fs.existsSync(filePath)) return;
  const cols = ['Payment_ID','Sale_ID','Type','Plot_Shop_Number','Town_Name','Customer_Name','Agent_Name','Amount','Received_Before','Received_After','Remaining_After','Payment_Date','Payment_Method','Notes'];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  const friendly = (key) => String(key).replace(/_/g, ' ');
  sheet.addRow(cols.map(friendly));
  sheet.addRow(cols);
  sheet.getRow(2).hidden = true;
  cols.forEach((_, idx) => { sheet.getColumn(idx + 1).width = 18; });
  await workbook.xlsx.writeFile(filePath);
}

function isCeoExpenseRow(row) {
  const cat = String(row?.Category || '').toLowerCase();
  const name = String(row?.Expense_Name || '');
  const addedBy = String(row?.Added_By || '').toLowerCase();
  return cat === 'ceo' || name.startsWith('CEO:') || addedBy.includes('ceo');
}

// Detect agent commission expenses recorded separately in All_Expenses or CEO_Expenses
function isCommissionRow(row) {
  const cat = String(row?.Category || '').toLowerCase();
  const name = String(row?.Expense_Name || '').toLowerCase();
  const desc = String(row?.Description || '').toLowerCase();
  return cat === 'commission' || cat === 'agent commission' ||
    name.includes('commission') || name.includes('agent fee') ||
    desc.includes('commission');
}

function saleMatchesInstallment(sale, installment) {
  if (sale.Sale_ID && installment.Sale_ID) {
    return String(installment.Sale_ID) === String(sale.Sale_ID);
  }
  return String(installment.Plot_Shop_Number) === String(sale.Plot_Shop_Number) &&
    String(installment.Town_Name) === String(sale.Town_Name) &&
    String(installment.Type) === String(sale.Type);
}

function computeSaleReceived(sale, allInstallments) {
  const total = parseFloat(sale.Total_Amount_PKR) || 0;
  const advance = parseFloat(sale.Advance_Amount_PKR) || 0;
  const instMonths = parseInt(sale.Total_Installments) || 0;

  if (instMonths > 0) {
    const paidSum = (allInstallments || [])
      .filter(inst => saleMatchesInstallment(sale, inst) && String(inst.Status || '').toLowerCase() === 'paid')
      .reduce((sum, inst) => sum + (parseFloat(inst.Monthly_Amount) || 0), 0);
    return Math.min(advance + paidSum, total);
  }

  const received = parseFloat(sale.Received_Amount) || 0;
  const remaining = parseFloat(sale.Remaining_Amount) || 0;
  if (received > 0) return Math.min(received, total || received);
  return remaining > 0 ? advance : total;
}

function buildInstallmentReceiptNumber(item, paidDate) {
  const datePart = String(paidDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const type = String(item.Type || 'PROPERTY').replace(/[^a-zA-Z0-9]+/g, '').toUpperCase() || 'PROPERTY';
  const number = String(item.Plot_Shop_Number || 'NA').replace(/[^a-zA-Z0-9]+/g, '').toUpperCase() || 'NA';
  const month = String(parseInt(item.Month_Number, 10) || 0).padStart(2, '0');
  return `INS-${type}-${number}-M${month}-${datePart}`;
}

async function reconcileInstallmentSaleTotals(townName = '') {
  const salesPath = path.join(getGlobalsPath(), 'All_Sales.xlsx');
  const installmentsPath = path.join(getGlobalsPath(), 'Installments_Tracker.xlsx');
  const sales = await readExcelFile(salesPath, 'Data').catch(() => []);
  const installments = await readExcelFile(installmentsPath, 'Data').catch(() => []);
  const touched = [];

  for (const sale of sales) {
    if (townName && String(sale.Town_Name || '') !== String(townName)) continue;
    if (!isPropertySale(sale)) continue;
    if ((parseInt(sale.Total_Installments, 10) || 0) <= 0) continue;
    const total = parseFloat(sale.Total_Amount_PKR) || 0;
    const received = computeSaleReceived(sale, installments);
    const remaining = Math.max(0, total - received);
    const oldReceived = parseFloat(sale.Received_Amount) || 0;
    const oldRemaining = parseFloat(sale.Remaining_Amount) || 0;
    if (Math.abs(oldReceived - received) > 0.009 || Math.abs(oldRemaining - remaining) > 0.009) {
      await updateExcelRow(salesPath, 'Data', sale._rowNumber, {
        Received_Amount: received,
        Remaining_Amount: remaining,
        Installment_Status: remaining <= 0 ? 'Completed' : 'Active',
      });
      const { getPropertyFile, updatePropertyFile } = require('./properties');
      const prop = await getPropertyFile(sale.Type, sale.Plot_Shop_Number, sale.Town_Name);
      if (prop) {
        const oldPropReceived = parseFloat(prop.Received_Amount) || 0;
        const oldPropRemaining = parseFloat(prop.Remaining_Amount) || 0;
        const oldPropStatus = prop.Installment_Status || '';
        const targetStatus = remaining <= 0 ? 'Completed' : 'Active';
        if (Math.abs(oldPropReceived - received) > 0.009 || Math.abs(oldPropRemaining - remaining) > 0.009 || oldPropStatus !== targetStatus) {
          await updatePropertyFile(sale.Type, sale.Plot_Shop_Number, sale.Town_Name, {
            Received_Amount: received,
            Remaining_Amount: remaining,
            Installment_Status: targetStatus,
          });
        }
      }
      touched.push({ sale, received, remaining });
    }
  }

  const towns = new Set(touched.map((row) => row.sale.Town_Name).filter(Boolean));
  const { updateTownFinancials } = require('./properties');
  for (const town of towns) {
    await updateTownFinancials(town).catch(() => {});
    await refreshTownFinancialSummary(town).catch(() => {});
  }
  return touched.length;
}

async function upsertCommissionForSaleLocal(sale) {
  const amount = parseFloat(sale.Commission_Amount) || 0;
  const agent = String(sale.Agent_Name || '').trim();
  if (amount <= 0 || !agent) return;

  const commissionPath = path.join(getGlobalsPath(), 'Commissions.xlsx');
  await ensureSheetColumns(commissionPath, 'Data', ['Commission_ID','Sale_ID','Town_Name','Plot_Shop_Number','Agent_Name','Agent_Email','Commission_Amount','Paid_Amount','Remaining_Amount','Status','Paid_Date','Last_Paid_Date','Created_At']);
  const rows = await readExcelFile(commissionPath, 'Data');
  const saleId = sale.Sale_ID || `${sale.Type}|${sale.Plot_Shop_Number}|${sale.Town_Name}`;
  if (rows.some((r) => String(r.Sale_ID || r.Commission_ID || '') === String(saleId))) return;

  await appendToExcel(commissionPath, 'Data', {
    Commission_ID: saleId,
    Sale_ID: saleId,
    Town_Name: sale.Town_Name || '',
    Plot_Shop_Number: sale.Plot_Shop_Number || '',
    Agent_Name: agent,
    Agent_Email: '',
    Commission_Amount: amount,
    Paid_Amount: 0,
    Remaining_Amount: amount,
    Status: 'pending',
    Paid_Date: '',
    Last_Paid_Date: '',
    Created_At: sale.Sell_Date || new Date().toISOString().split('T')[0],
  });
}

async function getInstallments() {
  return await readExcelFile(path.join(getGlobalsPath(), 'Installments_Tracker.xlsx'), 'Data');
}

function computeDueInstallments(allInstallments, { leadDays = 7 } = {}) {
  const today = new Date().toISOString().split('T')[0];
  const leadDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(0, parseInt(leadDays, 10) || 0));
    return d.toISOString().split('T')[0];
  })();

  return (allInstallments || []).filter(i => {
    const status = (i.Status || '').toLowerCase();
    if (status === 'paid') return false;
    const due = i.Due_Date || '';
    if (!due) return false;
    return due < today || (due >= today && due <= leadDate) || status === 'overdue';
  }).map(i => {
    const due = i.Due_Date || '';
    const status = (i.Status || '').toLowerCase();
    if (due < today && status !== 'paid') {
      return { ...i, Status: 'Overdue' };
    }
    if (due >= today) {
      return { ...i, Status: 'Due' };
    }
    return { ...i };
  });
}

async function getDueInstallments() {
  const all = await getInstallments();
  return computeDueInstallments(all, { leadDays: 7 });
}

/**
 * Create/persist due installment notifications into Notifications_Log.xlsx so:
 *  - reminders survive when the app is closed
 *  - we can avoid duplicate desktop toasts
 *
 * Returns only notifications that were newly inserted (so caller can show OS notification).
 */
async function upsertDueInstallmentNotifications({ leadDays = 7 } = {}) {
  const allInstallments = await getInstallments();
  const today = new Date().toISOString().split('T')[0];
  const due = computeDueInstallments(allInstallments, { leadDays });

  const filePath = path.join(getGlobalsPath(), 'Notifications_Log.xlsx');
  const existing = await readExcelFile(filePath, 'Data');

  // Build an index of "active" notifications so we can avoid duplicates.
  // Key: Notification_ID + Due_Date + Type
  const activeKeySet = new Set(
    (existing || [])
      .filter(n => (n.Dismissed || '').toLowerCase() !== 'yes')
      .map(n => `${n.Notification_ID}__${n.Due_Date || ''}__${n.Type || ''}`)
  );

  const created = [];
  const rowsToInsert = [];

  for (const d of due) {
    const type = d.Status === 'Overdue' ? 'Overdue' : 'Due';
    const key = `${d.Tracker_ID}__${d.Due_Date || ''}__${type}`;
    if (activeKeySet.has(key)) continue;

    const unpaid = (d.Status === 'Overdue' || d.Status === 'Due')
      ? (allInstallments || []).filter(x => String(x.Type) === String(d.Type) && String(x.Plot_Shop_Number) === String(d.Plot_Shop_Number) && String(x.Town_Name) === String(d.Town_Name) && String(x.Status || '').toLowerCase() !== 'paid')
      : [];

    const remainingInstallments = unpaid.length;
    const totalInstallments = (allInstallments || []).filter(x => String(x.Type) === String(d.Type) && String(x.Plot_Shop_Number) === String(d.Plot_Shop_Number) && String(x.Town_Name) === String(d.Town_Name)).length;

    const msg = `${d.Type} ${d.Plot_Shop_Number} • PKR ${d.Monthly_Amount} • ${d.Month_Number}/${d.Total_Months} • Remaining: ${remainingInstallments}`;

    rowsToInsert.push({
      Notification_ID: d.Tracker_ID,
      Type: type,
      Message: msg,
      Plot_Shop_Number: d.Plot_Shop_Number,
      Town_Name: d.Town_Name,
      Customer_Name: d.Customer_Name,
      Due_Date: d.Due_Date,
      Created_Date: today,
      Status: 'Active',
      Dismissed: 'No',
      Monthly_Amount: d.Monthly_Amount,
      Month_Number: d.Month_Number,
      Total_Months: d.Total_Months,
      Remaining_Installments: remainingInstallments,
      Total_Installments: totalInstallments,
    });

    created.push({
      Notification_ID: d.Tracker_ID,
      Type: type,
      Message: msg,
      Town_Name: d.Town_Name,
      Due_Date: d.Due_Date,
      Status: 'Active',
    });

    // Mark as active so duplicates within the same run are avoided
    activeKeySet.add(key);
  }

  // Insert rows one-by-one using appendToExcel for key-row format safety
  for (const row of rowsToInsert) {
    // appendToExcel expects a rowData object with columns as keys
    await appendToExcel(filePath, 'Data', row);
  }

  return created;
}

let markInstallmentMutex = Promise.resolve();

async function markInstallmentPaid(data) {
  return new Promise((resolve, reject) => {
    markInstallmentMutex = markInstallmentMutex.then(async () => {
      try {
        const result = await _markInstallmentPaid(data);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }).catch(() => {});
  });
}

async function _markInstallmentPaid(data) {
  const { Tracker_ID } = data;
  const filePath = path.join(getGlobalsPath(), 'Installments_Tracker.xlsx');
  await ensureSheetColumns(filePath, 'Data', ['Sale_ID', 'Receipt_Number', 'Paid_By', 'Payee_Name', 'Payment_Method', 'Payment_Account_ID', 'Payment_Account_Name', 'Payment_Account_Type']);
  let all = await readExcelFile(filePath, 'Data');
  let item = all.find(i => i.Tracker_ID === Tracker_ID);
  if (!item && String(Tracker_ID || '').startsWith('missing|')) {
    const syntheticRow = {
      Tracker_ID,
      Sale_ID: data.Sale_ID || data.saleId || '',
      Plot_Shop_Number: data.Plot_Shop_Number || data.propertyNumber || '',
      Type: data.Type || data.propertyType || 'Property',
      Town_Name: data.Town_Name || data.townName || '',
      Customer_Name: data.Customer_Name || data.customerName || data.buyerName || '',
      Phone_Number: data.Phone_Number || data.phoneNumber || '',
      Monthly_Amount: parseFloat(data.Monthly_Amount || data.dueAmount || data.amount) || 0,
      Due_Date: data.Due_Date || data.dueDate || '',
      Status: 'Due',
      Paid_Date: '',
      Month_Number: parseInt(data.Month_Number || data.installmentNumber, 10) || 1,
      Total_Months: parseInt(data.Total_Months || data.totalInstallments, 10) || 1,
      Received_Amount: 0,
      Remaining_Amount: parseFloat(data.Monthly_Amount || data.dueAmount || data.amount) || 0,
      Agent_Name: data.Agent_Name || data.agentName || '',
    };
    await appendToExcel(filePath, 'Data', syntheticRow);
    all = await readExcelFile(filePath, 'Data');
    item = all.find(i => i.Tracker_ID === Tracker_ID);
  }
  if (!item) throw new Error('Installment not found');
  if (String(item.Status || '').toLowerCase() === 'paid') {
    await reconcileInstallmentSaleTotals(item.Town_Name);
    return { success: true, alreadyPaid: true, receiptNumber: item.Receipt_Number || '' };
  }

  // SECURITY FIX: Enforce sequential installment payment — can't pay #N unless #1..N-1 are paid
  const targetMonth = parseInt(item.Month_Number || 1, 10);
  const saleId = item.Sale_ID;
  if (saleId && targetMonth > 1) {
    const sameSale = all.filter(i => String(i.Sale_ID || '') === String(saleId))
                       .sort((a, b) => (parseInt(a.Month_Number) || 0) - (parseInt(b.Month_Number) || 0));
    for (const prev of sameSale) {
      const prevMonth = parseInt(prev.Month_Number || 0, 10);
      if (prevMonth < targetMonth && String(prev.Status || '').toLowerCase() !== 'paid') {
        throw new Error(`Installment #${prevMonth} must be paid before installment #${targetMonth}. Payments must be sequential.`);
      }
    }
  }

  const paidDate = data.Paid_Date || new Date().toISOString().split('T')[0];
  const receiptNumber = data.Receipt_Number || item.Receipt_Number || buildInstallmentReceiptNumber(item, paidDate);

  await updateExcelRow(filePath, 'Data', item._rowNumber, {
    Status: 'Paid',
    Paid_Date: paidDate,
    Received_Amount: item.Monthly_Amount,
    Remaining_Amount: 0,
    Receipt_Number: receiptNumber,
    Paid_By: data.Paid_By || data.createdBy || 'Accountant',
    Payee_Name: data.Payee_Name || item.Customer_Name || '',
    Payment_Method: data.paymentMethod || data.Payment_Method || 'Cash',
    Payment_Account_ID: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
    Payment_Account_Name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    Payment_Account_Type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
  });

  const salesPath = path.join(getGlobalsPath(), 'All_Sales.xlsx');
  const sales = await readExcelFile(salesPath, 'Data');
  const sale = sales.find(s => saleMatchesInstallment(s, item));
  let newReceivedForSale = null;
  let newRemainingForSale = null;
  if (sale?._rowNumber) {
    const total = parseFloat(sale.Total_Amount_PKR || 0);
    const markedInstallments = all.map((inst) => String(inst.Tracker_ID) === String(Tracker_ID) ? { ...inst, Status: 'Paid' } : inst);
    newReceivedForSale = Math.min(computeSaleReceived(sale, markedInstallments), total);
    newRemainingForSale = Math.max(0, total - newReceivedForSale);
    await updateExcelRow(salesPath, 'Data', sale._rowNumber, {
      Received_Amount: newReceivedForSale,
      Remaining_Amount: newRemainingForSale,
    });
  }

  // Update property received amount
  const { getPropertyFile, updatePropertyFile } = require('./properties');
  const prop = await getPropertyFile(item.Type, item.Plot_Shop_Number, item.Town_Name);
  if (prop) {
    const paid = (parseFloat(item.Monthly_Amount) || 0);
    const prevReceived = (parseFloat(prop.Received_Amount) || 0);
    const prevRemaining = (parseFloat(prop.Remaining_Amount) || 0);

    const newReceived = newReceivedForSale ?? (prevReceived + paid);
    const newRemaining = newRemainingForSale ?? Math.max(0, prevRemaining - paid);
    const updates = { Received_Amount: newReceived, Remaining_Amount: newRemaining };

    // Check if all installments paid
    const allInst = all.filter(ii => {
      if (item.Sale_ID && ii.Sale_ID) return String(ii.Sale_ID) === String(item.Sale_ID);
      return ii.Plot_Shop_Number === item.Plot_Shop_Number && ii.Town_Name === item.Town_Name && ii.Type === item.Type;
    });
    const paidCount = allInst.filter(ii => ii.Status === 'Paid' || ii.Tracker_ID === Tracker_ID).length;
    if (paidCount >= allInst.length) {
      updates.Installment_Status = 'Completed';
    }
    await updatePropertyFile(item.Type, item.Plot_Shop_Number, item.Town_Name, updates);
  }

  // Mark next installment as Due
  const nextItems = all.filter(i => {
    const sameSale = item.Sale_ID && i.Sale_ID
      ? String(i.Sale_ID) === String(item.Sale_ID)
      : i.Plot_Shop_Number === item.Plot_Shop_Number && i.Town_Name === item.Town_Name && i.Type === item.Type;
    return sameSale && i.Status === 'Upcoming';
  });
  if (nextItems.length > 0) {
    const sorted = nextItems.sort((a, b) => (a.Month_Number || 0) - (b.Month_Number || 0));
    await updateExcelRow(filePath, 'Data', sorted[0]._rowNumber, { Status: 'Due' });
  }

  // Recalculate town financials

  if (sale && newRemainingForSale !== null && newRemainingForSale <= 0) {
    await upsertCommissionForSaleLocal({ ...sale, Received_Amount: newReceivedForSale, Remaining_Amount: newRemainingForSale });
  }
  await recordMoneyEvent({
    sourceType: 'installment_payment',
    sourceId: item.Tracker_ID,
    direction: 'income',
    amount: item.Monthly_Amount,
    townName: item.Town_Name,
    date: paidDate,
    partyName: item.Customer_Name,
    description: `${item.Type || 'Property'} ${item.Plot_Shop_Number || ''} installment ${item.Month_Number || ''}`,
    receiptNumber,
    createdBy: item.Agent_Name || 'System',
    paymentMethod: data.paymentMethod || data.Payment_Method,
    paymentAccountId: data.paymentAccountId || data.Payment_Account_ID,
    paymentAccountName: data.paymentAccountName || data.Payment_Account_Name,
    paymentAccountType: data.paymentAccountType || data.Payment_Account_Type,
  });

  const { updateTownFinancials } = require('./properties');
  if (item.Town_Name) await updateTownFinancials(item.Town_Name);
  if (item.Town_Name) await refreshTownFinancialSummary(item.Town_Name).catch(() => {});

  const receiptPayload = {
    receiptNumber,
    receiptType: 'installment_payment',
    townName: item.Town_Name,
    date: paidDate,
    amount: parseFloat(item.Monthly_Amount) || 0,
    propertyType: item.Type || '',
    propertyNumber: item.Plot_Shop_Number || '',
    customerName: item.Customer_Name || '',
    payeeSignature: item.Customer_Name || 'Payee',
    accountantSignature: data.Paid_By || data.createdBy || 'Accountant',
    installmentNumber: item.Month_Number || '',
    totalInstallments: item.Total_Months || '',
    dueDate: item.Due_Date || '',
    paymentMethod: data.paymentMethod || data.Payment_Method || 'Cash',
    paymentAccountName: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    paymentAccountType: data.paymentAccountType || data.Payment_Account_Type || 'cash',
    remainingAmount: newRemainingForSale !== null ? newRemainingForSale : (prop ? (parseFloat(prop.Remaining_Amount) - parseFloat(item.Monthly_Amount)) : 0),
  };
  let receiptArchive = null;
  try {
    const { saveReceiptArchive } = require('./businessExtras');
    receiptArchive = await saveReceiptArchive({
      Receipt_ID: `REC-${receiptNumber}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120),
      Receipt_Number: receiptNumber,
      Receipt_Type: 'installment_payment',
      Town_Name: item.Town_Name,
      Entity_ID: item.Tracker_ID,
      Entity_Name: item.Customer_Name || '',
      Amount: parseFloat(item.Monthly_Amount) || 0,
      Receipt_Date: paidDate,
      Payload_JSON: receiptPayload,
    });
  } catch (_) {}

  return { success: true, receiptNumber, receipt: receiptPayload, receiptArchive };
}

async function extendInstallmentDate(data) {
  const { Tracker_ID, New_Due_Date } = data;
  const filePath = path.join(getGlobalsPath(), 'Installments_Tracker.xlsx');
  const all = await readExcelFile(filePath, 'Data');
  const item = all.find(i => i.Tracker_ID === Tracker_ID);
  if (!item) throw new Error('Installment not found');
  await updateExcelRow(filePath, 'Data', item._rowNumber, { Due_Date: New_Due_Date, Status: 'Due' });
  return { success: true };
}

async function addEmployee(data) {
  const empData = { Employee_ID: generateId(), Employee_Name: data.Employee_Name || '', CNIC: data.CNIC || '', Phone_Number: data.Phone_Number || data.Phone || '', Salary: parseFloat(data.Salary) || 0, Date_Added: new Date().toISOString().split('T')[0], Status: 'Active' };
  const filePath = path.join(getGlobalsPath(), 'Employees.xlsx');
  await ensureSheetColumns(filePath, 'Data', ['Salary']);
  await appendToExcel(filePath, 'Data', empData);
  return empData;
}

async function getEmployees() {
  return await readExcelFile(path.join(getGlobalsPath(), 'Employees.xlsx'), 'Data');
}

async function deleteEmployee(id) {
  const filePath = path.join(getGlobalsPath(), 'Employees.xlsx');
  const all = await readExcelFile(filePath, 'Data');
  const item = all.find(e => e.Employee_ID === id);
  if (item) {
    await updateExcelRow(filePath, 'Data', item._rowNumber, { Status: 'Inactive' });
  }
  return { success: true };
}

async function getNotifications() {
  const all = await readExcelFile(path.join(getGlobalsPath(), 'Notifications_Log.xlsx'), 'Data');
  // Also add due installment notifications
  const allInstallments = await getInstallments();
  const due = computeDueInstallments(allInstallments);
  const notifs = all.filter(n => n.Dismissed !== 'Yes');
  const byProperty = new Map();
  for (const inst of allInstallments) {
    const k = `${inst.Type}|${inst.Plot_Shop_Number}|${inst.Town_Name}`;
    const list = byProperty.get(k) || [];
    list.push(inst);
    byProperty.set(k, list);
  }
  for (const d of due) {
    const k = `${d.Type}|${d.Plot_Shop_Number}|${d.Town_Name}`;
    const list = (byProperty.get(k) || []);
    const unpaid = list.filter(x => (x.Status || '').toLowerCase() !== 'paid');
    const remainingInstallments = unpaid.length;
    const totalInstallments = list.length;
    const msg = `${d.Type} ${d.Plot_Shop_Number} • PKR ${d.Monthly_Amount} • ${d.Month_Number}/${d.Total_Months} • Remaining: ${remainingInstallments}`;
    notifs.push({
      Notification_ID: d.Tracker_ID,
      Type: d.Status === 'Overdue' ? 'Overdue' : 'Due',
      Message: msg,
      Plot_Shop_Number: d.Plot_Shop_Number,
      Town_Name: d.Town_Name,
      Customer_Name: d.Customer_Name,
      Due_Date: d.Due_Date,
      Created_Date: new Date().toISOString().split('T')[0],
      Status: 'Active',
      Dismissed: 'No',
      Monthly_Amount: d.Monthly_Amount,
      Month_Number: d.Month_Number,
      Total_Months: d.Total_Months,
      Remaining_Installments: remainingInstallments,
      Total_Installments: totalInstallments,
    });
  }
  return notifs.slice(0, 50);
}

async function dismissNotification(id) {
  const filePath = path.join(getGlobalsPath(), 'Notifications_Log.xlsx');
  const all = await readExcelFile(filePath, 'Data');
  const item = all.find(n => n.Notification_ID === id);
  if (item) {
    await updateExcelRow(filePath, 'Data', item._rowNumber, { Dismissed: 'Yes' });
  }
  return { success: true };
}

async function getCeoSalary() {
  return await readExcelFile(path.join(getGlobalsPath(), 'CEO_Salary.xlsx'), 'Data');
}

async function addCeoSalary(data) {
  const { Town_Name, Month_Year, Amount_PKR, Notes } = data;
  const salaryData = {
    Salary_ID: generateId(),
    Town_Name: Town_Name || '',
    Month_Year: Month_Year || '',
    Amount_PKR: parseFloat(Amount_PKR) || 150000,
    Date_Recorded: new Date().toISOString().split('T')[0],
    Notes: Notes || '',
  };
  await appendToExcel(path.join(getGlobalsPath(), 'CEO_Salary.xlsx'), 'Data', salaryData);
  const { recordMoneyEvent } = require('./moneyLedger');
  await recordMoneyEvent({
    sourceType: 'ceo_salary',
    sourceId: salaryData.Salary_ID,
    direction: 'expense',
    amount: salaryData.Amount_PKR,
    townName: salaryData.Town_Name,
    date: salaryData.Date_Recorded,
    partyName: 'CEO',
    description: `CEO salary ${salaryData.Month_Year || ''}`,
    createdBy: 'CEO',
    paymentAccountId: data.paymentAccountId || 'cash-in-hand',
    paymentAccountName: data.paymentAccountName || 'Cash in Hand',
    paymentAccountType: data.paymentAccountType || 'cash',
  });

  // Also trigger town financial update
  const { updateTownFinancials } = require('./properties');
  if (Town_Name) await updateTownFinancials(Town_Name);
  return salaryData;
}

async function deleteCeoSalary(salaryId) {
  const filePath = path.join(getGlobalsPath(), 'CEO_Salary.xlsx');
  const all = await readExcelFile(filePath, 'Data');
  const item = all.find(r => String(r.Salary_ID) === String(salaryId));
  if (!item) return { error: 'Salary record not found' };
  const { deleteExcelRow } = require('./core');
  await deleteExcelRow(filePath, 'Data', item._rowNumber);
  
  const ledgerPath = path.join(getGlobalsPath(), 'Money_Ledger.xlsx');
  if (require('fs').existsSync(ledgerPath)) {
    const ledger = await readExcelFile(ledgerPath, 'Data');
    const ledgerMatch = ledger.find(r => 
      String(r.Source_Type) === 'ceo_salary' && 
      String(r.Source_ID) === String(salaryId)
    );
    if (ledgerMatch) {
      await deleteExcelRow(ledgerPath, 'Data', ledgerMatch._rowNumber);
    }
  }

  const { refreshTownFinancialSummary } = require('./moneyLedger');
  if (item.Town_Name) await refreshTownFinancialSummary(item.Town_Name).catch(() => {});
  const { updateTownFinancials } = require('./properties');
  if (item.Town_Name) await updateTownFinancials(item.Town_Name);
  return { success: true };
}

async function getDashboardStats() {
  await backfillMoneyLedger();
  const sales = await readExcelFile(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data');
  const { getTowns } = require('./towns');
  const towns = await getTowns();
  const activeTownNames = new Set((towns || []).map((t) => String(t.Town_Name || '').trim().toLowerCase()));
  for (const town of towns) {
    if (town?.Town_Name) {
      await refreshTownFinancialSummary(town.Town_Name).catch(() => {});
    }
  }
  const allSummaries = await getAllTownFinancialSummaries();
  const summaries = (allSummaries || []).filter((s) => activeTownNames.has(String(s.Town_Name || '').trim().toLowerCase()));
  const money = summaries.length
    ? {
      totalReceived: summaries.reduce((s, r) => s + (parseFloat(r.Total_Received) || 0), 0),
      totalExpenses: summaries.reduce((s, r) => s + (parseFloat(r.Total_Expenses) || 0), 0),
      cashBalance: summaries.reduce((s, r) => s + (parseFloat(r.Cash_Balance) || 0), 0),
    }
    : await getMoneySummary();

  // REAL ESTATE FORMULA:
  // Income   = Gross money actually received (advance + paid installments, or full for lump-sum)
  // Commission = Commission_Amount from All_Sales + any expense entries tagged as commission
  // Net P/L  = Income - Commission - Operation Expenses - CEO Expenses - CEO Salary

  const totalIncome = money.totalReceived;
  const totalExpenses = money.totalExpenses;
  const soldPlots = sales.filter(s => s.Type === 'Plot').length;
  const soldShops = sales.filter(s => s.Type === 'Shop').length;

  // Compute actual commission paid and CEO salary from money ledger
  let totalCommission = 0;
  let totalCeoSalary = 0;
  let totalSalaries = 0;
  let totalInvestorBalance = 0;
  try {
    const { getMoneyLedger } = require('./moneyLedger');
    const ledger = await getMoneyLedger({});
    for (const row of ledger) {
      const src = String(row.Source_Type || '').toLowerCase();
      const amt = parseFloat(row.Amount) || 0;
      const dir = String(row.Direction || '').toLowerCase();
      if (dir === 'expense') {
        if (src.includes('commission')) totalCommission += amt;
        else if (src === 'ceo_salary') totalCeoSalary += amt;
        else if (src.includes('salary')) totalSalaries += amt;
      }
    }
    // Investor balance from summaries
    totalInvestorBalance = summaries.reduce((s, r) => s + (parseFloat(r.Investor_Balance) || 0), 0);
  } catch (_) {}

  const townPerformance = towns.map(t => {
    const summary = summaries.find((s) => String(s.Town_Name) === String(t.Town_Name));
    return {
      name: t.Town_Name,
      income: parseFloat(summary?.Total_Received ?? t.Total_Income_PKR) || 0,
      expenses: parseFloat(summary?.Total_Expenses ?? t.Total_Expenses_PKR) || 0,
      profit: parseFloat(summary?.Cash_Balance ?? t.Profit_Loss) || 0,
    };
  });

  return {
    totalIncome,
    totalReceived: totalIncome,
    totalCommission,
    totalExpenses,
    totalSalaries,
    totalCeoSalary,
    totalInvestorBalance,
    cashBalance: money.cashBalance,
    netProfitLoss: money.cashBalance,
    soldPlots, soldShops, totalTowns: towns.length, townPerformance,
    monthlySales: sales.slice(-12)
  };
}

async function getAllSales() {
  return await readExcelFile(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data');
}

async function getAllExpenses() {
  return await readExcelFile(path.join(getGlobalsPath(), 'All_Expenses.xlsx'), 'Data');
}

async function getCeoExpenses() {
  return await readExcelFile(path.join(getGlobalsPath(), 'CEO_Expenses.xlsx'), 'Data');
}

async function getResellHistory() {
  return await readExcelFile(path.join(getGlobalsPath(), 'Resell_History.xlsx'), 'Data');
}

async function recordSalaryPayment(data) {
  const { employeeName, amount, month, townName, type, note, designation, advanceDeduction, newAdvanceGiven, salaryAmount, isAdvanceSalary } = data;
  const now = new Date();
  const dateStr = data.Payment_Date || data.Date || now.toISOString().split('T')[0];
  const seq = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0');
  const receiptNumber = `SAL-${dateStr.replace(/-/g,'')}-${seq}`;
  const recordsPath = path.join(getGlobalsPath(), 'Salary_Records.xlsx');
  await ensureSheetColumns(recordsPath, 'Data', [
    'Receipt_Number','Date','Payment_Date','Month','Type','Name','Designation','Amount','Town_Name','Note','Paid_By',
    'Advance_Deduction','New_Advance_Given','Salary_Amount','Salary_Gross_Amount','Cash_Disbursed_Amount','Salary_Paid_Amount','Salary_Paid_Before','Salary_Paid_After',
    'Salary_Remaining_After','Is_Advance_Salary','Payment_Method','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'
  ]);
  const previousRows = await readExcelFile(recordsPath, 'Data').catch(() => []);
  const cleanName = String(employeeName || '').trim().toLowerCase();
  const cleanMonth = String(month || '').trim().toLowerCase();
  const fixedSalary = parseFloat(salaryAmount ?? data.baseSalary ?? amount) || 0;
  const cashPaid = parseFloat(data.cashDisbursedAmount ?? amount) || 0;
  const grossSalaryPayment = parseFloat(data.salaryGrossAmount ?? amount) || 0;
  const salaryAppliedAmount = parseFloat(data.salaryAppliedAmount ?? Math.max(0, grossSalaryPayment - (parseFloat(newAdvanceGiven) || 0))) || 0;
  const declaredAdvance = parseFloat(newAdvanceGiven) || 0;
  const alreadyPaid = previousRows
    .filter((r) =>
      String(r.Name || '').trim().toLowerCase() === cleanName &&
      String(r.Month || '').trim().toLowerCase() === cleanMonth
    )
    .reduce((sum, r) => {
      const storedSalaryPart = parseFloat(r.Salary_Paid_Amount);
      if (Number.isFinite(storedSalaryPart)) return sum + storedSalaryPart;
      return sum + Math.max(0, (parseFloat(r.Amount) || 0) - (parseFloat(r.New_Advance_Given) || 0));
    }, 0);
  const remainingBefore = Math.max(0, fixedSalary - alreadyPaid);
  const salaryPart = Math.min(salaryAppliedAmount, remainingBefore || salaryAppliedAmount);
  const extraAdvance = declaredAdvance + Math.max(0, salaryAppliedAmount - remainingBefore);
  const paidAfter = Math.min(fixedSalary, alreadyPaid + salaryPart);
  const remainingAfter = Math.max(0, fixedSalary - paidAfter);

  const salaryData = {
    Receipt_Number: receiptNumber,
    Date: dateStr,
    Payment_Date: dateStr,
    Month: month || '',
    Type: type || 'Employee',
    Name: employeeName || '',
    Designation: designation || '',
    Amount: cashPaid,
    Town_Name: townName || '',
    Note: note || '',
    Paid_By: 'CEO',
    Advance_Deduction: parseFloat(advanceDeduction) || 0,
    New_Advance_Given: extraAdvance,
    Salary_Amount: fixedSalary,
    Salary_Gross_Amount: grossSalaryPayment,
    Cash_Disbursed_Amount: cashPaid,
    Salary_Paid_Amount: salaryPart,
    Salary_Paid_Before: alreadyPaid,
    Salary_Paid_After: paidAfter,
    Salary_Remaining_After: remainingAfter,
    Is_Advance_Salary: isAdvanceSalary || extraAdvance > 0 ? 'Yes' : 'No',
    Payment_Method: data.paymentMethod || data.Payment_Method || 'Cash',
    Payment_Account_ID: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
    Payment_Account_Name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    Payment_Account_Type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
  };
  await appendToExcel(recordsPath, 'Data', salaryData);

  // Also record as town expense
  const { appendToExcel: appendExp } = require('./core');
  const expData = {
    Expense_ID: generateId(),
    Town_Name: townName || '',
    Expense_Name: `${type || 'Employee'} Salary: ${employeeName || ''}`,
    Amount_PKR: cashPaid,
    Description: note || `${extraAdvance > 0 ? 'Salary/advance' : 'Salary'} for ${month || ''}`,
    Category: 'Salary',
    Date: dateStr,
    Added_By: 'CEO',
  };
  await appendToExcel(path.join(getGlobalsPath(), 'All_Expenses.xlsx'), 'Data', expData);
  if (salaryPart > 0) {
    await recordMoneyEvent({
      sourceType: 'salary_payment',
      sourceId: `${receiptNumber}:salary`,
      direction: 'expense',
      amount: salaryPart,
      townName,
      date: dateStr,
      partyName: employeeName || '',
      description: `${type || 'Employee'} salary applied ${month || ''}`,
      receiptNumber,
      createdBy: 'CEO',
      paymentMethod: salaryData.Payment_Method,
      paymentAccountId: salaryData.Payment_Account_ID,
      paymentAccountName: salaryData.Payment_Account_Name,
      paymentAccountType: salaryData.Payment_Account_Type,
    });
  }
  if (extraAdvance > 0) {
    await recordMoneyEvent({
      sourceType: 'salary_advance',
      sourceId: `${receiptNumber}:advance`,
      direction: 'expense',
      amount: extraAdvance,
      townName,
      date: dateStr,
      partyName: employeeName || '',
      description: `${type || 'Employee'} advance salary ${month || ''}`,
      receiptNumber,
      debitAccount: 'Employee Advance Receivable',
      creditAccount: 'Cash / Bank',
      createdBy: 'CEO',
      paymentMethod: salaryData.Payment_Method,
      paymentAccountId: salaryData.Payment_Account_ID,
      paymentAccountName: salaryData.Payment_Account_Name,
      paymentAccountType: salaryData.Payment_Account_Type,
    });
  }

  // Update town financials
  const { updateTownFinancials } = require('./properties');
  if (townName) await updateTownFinancials(townName);

  return salaryData;
}

async function getSalaryRecords(townName) {
  const all = await readExcelFile(path.join(getGlobalsPath(), 'Salary_Records.xlsx'), 'Data');
  return townName ? all.filter(r => r.Town_Name === townName) : all;
}

async function getProfitLossReport() {
  const { getTowns } = require('./towns');
  await backfillMoneyLedger();
  const towns = await getTowns();
  const { getMoneyLedger } = require('./moneyLedger');

  const reports = [];
  for (const t of towns) {
    const money = await getMoneySummary(t.Town_Name);
    const ledgerRows = await getMoneyLedger({ townName: t.Town_Name });
    
    // Filter approved expenses only to break down totals accurately
    const approvedExpenses = ledgerRows.filter(r => 
      String(r.Status || 'approved').toLowerCase() === 'approved' &&
      String(r.Direction || '').toLowerCase() === 'expense'
    );

    let commission = 0;
    let ceoExpenses = 0;
    let ceoSalary = 0;
    let opExpenses = 0;

    approvedExpenses.forEach(r => {
      const amt = parseFloat(r.Amount) || 0;
      const src = String(r.Source_Type || '').toLowerCase();
      if (src === 'ceo_expense') {
        ceoExpenses += amt;
      } else if (src === 'ceo_salary') {
        ceoSalary += amt;
      } else if (src === 'commission_payment') {
        commission += amt;
      } else {
        opExpenses += amt;
      }
    });

    reports.push({
      Town_Name: t.Town_Name,
      Total_Income: money.totalReceived,
      Total_Received: money.totalReceived,
      Commission: commission,
      Operation_Expenses: opExpenses,
      CEO_Expenses: ceoExpenses,
      CEO_Salary: ceoSalary,
      Total_Expenses: money.totalExpenses,
      Cash_Balance: money.cashBalance,
      Net_Profit_Loss: money.cashBalance,
    });
  }
  return reports;
}

async function getTownPerformance(townName) {
  const { getTowns } = require('./towns');
  await backfillMoneyLedger();
  const towns = await getTowns();
  const town = towns.find(t => t.Town_Name === townName);
  if (!town) return { error: 'Town not found' };

  const sales = await readExcelFile(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data');
  const money = await getMoneySummary(townName);

  const tSales = sales.filter(s => s.Town_Name === townName);
  const income = money.totalReceived;
  
  const { getMoneyLedger } = require('./moneyLedger');
  const ledgerRows = await getMoneyLedger({ townName });
  
  // Filter approved expenses only to break down totals accurately
  const approvedExpenses = ledgerRows.filter(r => 
    String(r.Status || 'approved').toLowerCase() === 'approved' &&
    String(r.Direction || '').toLowerCase() === 'expense'
  );

  let commission = 0;
  let ceo = 0;
  let salary = 0;
  let opExp = 0;

  approvedExpenses.forEach(r => {
    const amt = parseFloat(r.Amount) || 0;
    const src = String(r.Source_Type || '').toLowerCase();
    if (src === 'ceo_expense') {
      ceo += amt;
    } else if (src === 'ceo_salary') {
      salary += amt;
    } else if (src === 'commission_payment') {
      commission += amt;
    } else {
      opExp += amt;
    }
  });

  const { getAllPropertiesByTown } = require('./properties');
  const { getTownPrices } = require('./towns');
  const allPlots = await getAllPropertiesByTown(townName, 'Plot');
  const allShops = await getAllPropertiesByTown(townName, 'Shop');
  let prices = {};
  try { prices = await getTownPrices(townName) || {}; } catch {}

  const soldPlots = tSales.filter(s => s.Type === 'Plot').length;
  const soldShops = tSales.filter(s => s.Type === 'Shop').length;

  const monthlyMap = {};
  tSales.forEach(s => {
    const month = (s.Sell_Date || '').substring(0, 7);
    if (month) monthlyMap[month] = (monthlyMap[month] || 0) + (parseFloat(s.Total_Amount_PKR) || 0);
  });
  const monthlyTrend = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => ({ month: m, income: v }));

  const plotPricePerMarla = parseFloat(prices.Residential_Plot_Price || prices.Plot_Price || 0) || 0;

  const plotBreakdown = allPlots.map(p => {
    const marla = parseFloat(p.Plot_Marla || p.Marla || p.Plot_Size) || 0;
    const isSold = tSales.some(s => s.Type === 'Plot' && String(s.Plot_Shop_Number) === String(p.Plot_Number));
    const pricePerMarla = parseFloat(p.Per_Marla_Price) || plotPricePerMarla;
    return { number: p.Plot_Number, marla, pricePerMarla, estimate: marla * pricePerMarla, status: isSold || p.Status === 'Sold' || p.Status === 'Resold' ? 'Sold' : 'Available' };
  });
  const estimatePlots = plotBreakdown.filter(p => p.status !== 'Sold').reduce((s, p) => s + p.estimate, 0);

  const roadMap = {};
  allShops.forEach(s => {
    const road = s.Road_Type || 'General';
    const size = parseFloat(s.Shop_Marla || s.Marla || s.Shop_Size) || 0;
    const price = parseFloat(s.Per_Marla_Price || prices.Commercial_Shop_Price || prices.Residential_Shop_Price || 0) || 0;
    const estimate = size * price;
    const isSold = tSales.some(sl => sl.Type === 'Shop' && String(sl.Plot_Shop_Number) === String(s.Shop_Number));
    if (!roadMap[road]) roadMap[road] = { label: road, count: 0, totalMarla: 0, estimate: 0 };
    roadMap[road].count++;
    roadMap[road].totalMarla += size;
    if (!isSold) roadMap[road].estimate += estimate;
  });
  const shopByRoad = Object.values(roadMap);
  const estimateShops = shopByRoad.reduce((s, r) => s + r.estimate, 0);

  return {
    actualIncome: income,
    totalExpenses: money.totalExpenses,
    cashBalance: money.cashBalance,
    netProfit: money.cashBalance,
    estimateTotal: estimatePlots + estimateShops,
    estimatePlots, estimateShops,
    totalPlots: allPlots.length, soldPlots,
    totalShops: allShops.length, soldShops,
    commission, opExpenses: opExp, ceoExpenses: ceo, salary,
    monthlyTrend, plotPricePerMarla, plotBreakdown, shopByRoad,
  };
}

async function getInstallmentProperties(townName) {
  await reconcileInstallmentSaleTotals(townName).catch(() => {});
  const sales = await readExcelFile(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data');
  const installments = await readExcelFile(path.join(getGlobalsPath(), 'Installments_Tracker.xlsx'), 'Data');

  // Build a set of properties that actually have installment records
  const propsWithInstRecords = new Set();
  installments.filter(inst => String(inst.Town_Name) === String(townName)).forEach(inst => {
    if (inst.Sale_ID) propsWithInstRecords.add(`sale:${inst.Sale_ID}`);
    propsWithInstRecords.add(`${inst.Type}|${inst.Plot_Shop_Number}`);
  });

  // Filter sales: same town AND (has installment in tracker OR has Total_Installments > 0)
  const townSales = sales.filter(s => {
    if (String(s.Town_Name) !== String(townName)) return false;
    const key = `${s.Type}|${s.Plot_Shop_Number}`;
    const hasInstRecords = propsWithInstRecords.has(key) || propsWithInstRecords.has(`sale:${s.Sale_ID}`);
    const hasInstField = parseInt(s.Total_Installments) > 0;
    return hasInstRecords || hasInstField;
  });

  return townSales.map(sale => {
    const propInstallments = installments.filter(inst => saleMatchesInstallment(sale, inst));

    const paidInst = propInstallments.filter(inst => String(inst.Status || '').toLowerCase() === 'paid');
    const activeInst = propInstallments.filter(inst => String(inst.Status || '').toLowerCase() !== 'paid');

    const advanceAmount = parseFloat(sale.Advance_Amount_PKR) || 0;
    const paidSum = paidInst.reduce((s, i) => s + (parseFloat(i.Monthly_Amount) || 0), 0);
    const totalPaid = advanceAmount + paidSum;
    const totalPrice = parseFloat(sale.Total_Amount_PKR) || 0;
    const totalInstallments = parseInt(sale.Total_Installments || sale.Total_Months || propInstallments[0]?.Total_Months, 10) || propInstallments.length || 0;
    const monthlyAmount = parseFloat(sale.Monthly_Installment || sale.Installment_Amount || propInstallments[0]?.Monthly_Amount) || 0;

    return {
      id: `${sale.Type}|${sale.Plot_Shop_Number}|${sale.Town_Name}`,
      saleId: sale.Sale_ID || '',
      propertyType: sale.Type,
      propertyNumber: sale.Plot_Shop_Number,
      townName: sale.Town_Name,
      buyerName: sale.Customer_Name,
      totalPrice,
      totalPaid,
      remainingAmount: Math.max(0, totalPrice - totalPaid),
      totalInstallments,
      monthlyAmount,
      activeInstallments: activeInst.length,
      paidInstallments: paidInst.length,
      advanceTaken: advanceAmount,
    };
  });
}

async function getPropertyInstallments(propertyId) {
  const parts = propertyId.split('|');
  if (parts.length < 3) throw new Error('Invalid property ID');
  const type = parts[0];
  const number = parts[1];
  const townName = parts.slice(2).join('|');

  const allInstallments = await readExcelFile(path.join(getGlobalsPath(), 'Installments_Tracker.xlsx'), 'Data');

  const propInstallments = allInstallments.filter(inst =>
    String(inst.Type) === String(type) &&
    String(inst.Plot_Shop_Number) === String(number) &&
    String(inst.Town_Name) === String(townName)
  ).sort((a, b) => (parseInt(a.Month_Number) || 0) - (parseInt(b.Month_Number) || 0));

  return propInstallments.map(inst => ({
    id: inst.Tracker_ID,
    saleId: inst.Sale_ID || '',
    propertyType: inst.Type || type,
    propertyNumber: inst.Plot_Shop_Number || number,
    townName: inst.Town_Name || townName,
    customerName: inst.Customer_Name || '',
    installmentNumber: parseInt(inst.Month_Number) || 0,
    totalInstallments: parseInt(inst.Total_Months) || 0,
    dueDate: inst.Due_Date || '',
    dueAmount: parseFloat(inst.Monthly_Amount || inst.Amount || inst.Installment_Amount) || 0,
    isPaid: String(inst.Status || '').toLowerCase() === 'paid',
    status: inst.Status || '',
    receiptNumber: inst.Receipt_Number || '',
  }));
}
let recordCollectionMutex = Promise.resolve();

async function recordCollectionPaymentLocal(data) {
  return new Promise((resolve, reject) => {
    recordCollectionMutex = recordCollectionMutex.then(async () => {
      try {
        const result = await _recordCollectionPaymentLocal(data);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }).catch(() => {});
  });
}

async function _recordCollectionPaymentLocal({ saleId, type, plotShopNumber, townName, amount, paymentMethod, notes, paymentAccountId, paymentAccountName, paymentAccountType }) {
  const filePath = path.join(getGlobalsPath(), 'All_Sales.xlsx');
  const all = await readExcelFile(filePath, 'Data');
  const item = all.find(i =>
    String(i.Sale_ID || '') === String(saleId || '') ||
    (
      String(i.Type) === String(type) &&
      String(i.Plot_Shop_Number) === String(plotShopNumber) &&
      String(i.Town_Name) === String(townName)
    )
  );
  if (!item) throw new Error('Sale not found in local database');
  if (!isPropertySale(item)) throw new Error('Only plot/shop sales can receive collection payments');

  // SECURITY: Installment properties MUST use the Installment Tracker — not free-form collection
  const totalInstallments = parseInt(item.Total_Installments, 10) || 0;
  if (totalInstallments > 0) {
    throw new Error(
      `This property is on an installment plan (${totalInstallments} installments). ` +
      'Please use the Installments Tracker tab to pay. ' +
      'Only the exact installment amount can be collected, in sequential order.'
    );
  }

  const currentReceived = parseFloat(item.Received_Amount || item.Advance_Amount_PKR || 0);
  const total = parseFloat(item.Total_Amount_PKR || 0);
  const receivedAmount = parseFloat(amount) || 0;
  if (receivedAmount <= 0) throw new Error('Collection amount must be greater than zero');
  const newReceived = Math.min(currentReceived + receivedAmount, total);
  const newRemaining = Math.max(0, total - newReceived);

  await updateExcelRow(filePath, 'Data', item._rowNumber, {
    Received_Amount: newReceived,
    Remaining_Amount: newRemaining,
  });

  const { getPropertyFile, updatePropertyFile, updateTownFinancials } = require('./properties');
  const prop = await getPropertyFile(type, plotShopNumber, townName);
  if (prop) {
    const oldReceived = parseFloat(prop.Received_Amount) || 0;
    const oldRemaining = parseFloat(prop.Remaining_Amount) || 0;
    if (Math.abs(oldReceived - newReceived) > 0.009 || Math.abs(oldRemaining - newRemaining) > 0.009) {
      await updatePropertyFile(type, plotShopNumber, townName, {
        Received_Amount: newReceived,
        Remaining_Amount: newRemaining,
        Installment_Status: newRemaining <= 0 ? 'Completed' : prop.Installment_Status,
      });
    }
  }


  const historyPath = path.join(getGlobalsPath(), 'Collection_Payments.xlsx');
  await ensureCollectionPaymentsFile(historyPath);
  await ensureSheetColumns(historyPath, 'Data', ['Payment_ID','Sale_ID','Type','Plot_Shop_Number','Town_Name','Customer_Name','Agent_Name','Amount','Received_Before','Received_After','Remaining_After','Payment_Date','Payment_Method','Notes','Receipt_Number','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type']);
  const paymentId = generateId();
  const paymentDate = new Date().toISOString().split('T')[0];
  const receiptNumber = `COL-${paymentDate.replace(/-/g, '')}-${String(paymentId).replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
  const paymentRow = {
    Payment_ID: paymentId,
    Sale_ID: item.Sale_ID || saleId || `${item.Type}|${item.Plot_Shop_Number}|${item.Town_Name}`,
    Sale_Code: item.Sale_ID || saleId || `${item.Type}|${item.Plot_Shop_Number}|${item.Town_Name}`,
    Type: item.Type || type,
    Plot_Shop_Number: item.Plot_Shop_Number || plotShopNumber,
    Town_Name: item.Town_Name || townName,
    Customer_Name: item.Customer_Name || '',
    Agent_Name: item.Agent_Name || '',
    Amount: receivedAmount,
    Received_Before: currentReceived,
    Received_After: newReceived,
    Remaining_After: newRemaining,
    Payment_Date: paymentDate,
    Payment_Method: paymentMethod || 'Cash',
    Notes: notes || '',
    Receipt_Number: receiptNumber,
    Payment_Account_ID: paymentAccountId || 'cash-in-hand',
    Payment_Account_Name: paymentAccountName || 'Cash in Hand',
    Payment_Account_Type: paymentAccountType || 'cash',
  };
  await appendToExcel(historyPath, 'Data', paymentRow);
  await recordMoneyEvent({
    sourceType: 'collection_payment',
    sourceId: paymentId,
    direction: 'income',
    amount: receivedAmount,
    townName: item.Town_Name || townName,
    date: paymentDate,
    partyName: item.Customer_Name || '',
    description: `${item.Type || type} ${item.Plot_Shop_Number || plotShopNumber} collection received`,
    createdBy: item.Agent_Name || 'System',
    receiptNumber,
    paymentAccountId: paymentRow.Payment_Account_ID,
    paymentAccountName: paymentRow.Payment_Account_Name,
    paymentAccountType: paymentRow.Payment_Account_Type,
  });

  if (newRemaining <= 0) {
    await upsertCommissionForSaleLocal({ ...item, Received_Amount: newReceived, Remaining_Amount: newRemaining });
  }

  if (townName) await updateTownFinancials(townName);

  return { newReceived, newRemaining, payment: paymentRow };
}

module.exports = { getInstallments, getDueInstallments, upsertDueInstallmentNotifications, markInstallmentPaid, extendInstallmentDate, addEmployee, getEmployees, deleteEmployee, getNotifications, dismissNotification, getDashboardStats, getAllSales, getAllExpenses, getCeoExpenses, getCeoSalary, addCeoSalary, deleteCeoSalary, getResellHistory, getProfitLossReport, recordSalaryPayment, getSalaryRecords, getTownPerformance, getInstallmentProperties, getPropertyInstallments, recordCollectionPaymentLocal, reconcileInstallmentSaleTotals };
