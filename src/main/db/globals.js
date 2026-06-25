const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { getGlobalsPath, getPropertiesPath, readExcelFile, appendToExcel, updateExcelRow, generateId, ensureSheetColumns } = require('./core');
const { recordMoneyEvent, getMoneySummary, backfillMoneyLedger, getAllTownFinancialSummaries } = require('./moneyLedger');

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
    const recordedReceived = parseFloat(sale.Received_Amount) || 0;
    return Math.min(Math.max(recordedReceived, advance + paidSum), total);
  }

  const received = parseFloat(sale.Received_Amount) || 0;
  const remaining = parseFloat(sale.Remaining_Amount) || 0;
  if (received > 0) return Math.min(received, total || received);
  return remaining > 0 ? advance : total;
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

async function markInstallmentPaid(data) {
  const { Tracker_ID } = data;
  const filePath = path.join(getGlobalsPath(), 'Installments_Tracker.xlsx');
  await ensureSheetColumns(filePath, 'Data', ['Receipt_Number', 'Paid_By', 'Payee_Name']);
  const all = await readExcelFile(filePath, 'Data');
  const item = all.find(i => i.Tracker_ID === Tracker_ID);
  if (!item) throw new Error('Installment not found');
  if (String(item.Status || '').toLowerCase() === 'paid') {
    return { success: true, alreadyPaid: true, receiptNumber: item.Receipt_Number || '' };
  }

  const paidDate = data.Paid_Date || new Date().toISOString().split('T')[0];
  const receiptNumber = data.Receipt_Number || item.Receipt_Number || `INS-${String(item.Tracker_ID || Date.now()).replace(/[^a-zA-Z0-9]/g, '').slice(-10)}-${paidDate.replace(/-/g, '')}`;

  await updateExcelRow(filePath, 'Data', item._rowNumber, {
    Status: 'Paid',
    Paid_Date: paidDate,
    Received_Amount: item.Monthly_Amount,
    Remaining_Amount: 0,
    Receipt_Number: receiptNumber,
    Paid_By: data.Paid_By || data.createdBy || 'Accountant',
    Payee_Name: data.Payee_Name || item.Customer_Name || '',
  });

  const salesPath = path.join(getGlobalsPath(), 'All_Sales.xlsx');
  const sales = await readExcelFile(salesPath, 'Data');
  const sale = sales.find(s => saleMatchesInstallment(s, item));
  let newReceivedForSale = null;
  let newRemainingForSale = null;
  if (sale?._rowNumber) {
    const paid = parseFloat(item.Monthly_Amount) || 0;
    const currentReceived = parseFloat(sale.Received_Amount || sale.Advance_Amount_PKR || 0);
    const total = parseFloat(sale.Total_Amount_PKR || 0);
    newReceivedForSale = Math.min(currentReceived + paid, total);
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
  const { updateTownFinancials } = require('./properties');
  if (item.Town_Name) await updateTownFinancials(item.Town_Name);
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
  });

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
  const empData = { Employee_ID: generateId(), Employee_Name: data.Employee_Name || '', CNIC: data.CNIC || '', Phone_Number: data.Phone_Number || '', Date_Added: new Date().toISOString().split('T')[0], Status: 'Active' };
  await appendToExcel(path.join(getGlobalsPath(), 'Employees.xlsx'), 'Data', empData);
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
  const { updateTownFinancials } = require('./properties');
  if (item.Town_Name) await updateTownFinancials(item.Town_Name);
  return { success: true };
}

async function getDashboardStats() {
  await backfillMoneyLedger();
  const sales = await readExcelFile(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data');
  const { getTowns } = require('./towns');
  const towns = await getTowns();
  const summaries = await getAllTownFinancialSummaries();
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
  const totalCommission = 0;
  const totalCeoSalary = 0;
  const soldPlots      = sales.filter(s => s.Type === 'Plot').length;
  const soldShops      = sales.filter(s => s.Type === 'Shop').length;

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
    cashBalance: money.cashBalance,
    totalCeoSalary,
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
  const dateStr = now.toISOString().split('T')[0];
  const seq = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0');
  const receiptNumber = `SAL-${dateStr.replace(/-/g,'')}-${seq}`;
  const recordsPath = path.join(getGlobalsPath(), 'Salary_Records.xlsx');
  await ensureSheetColumns(recordsPath, 'Data', [
    'Receipt_Number','Date','Month','Type','Name','Designation','Amount','Town_Name','Note','Paid_By',
    'Advance_Deduction','New_Advance_Given','Salary_Amount','Salary_Gross_Amount','Cash_Disbursed_Amount','Salary_Paid_Amount','Salary_Paid_Before','Salary_Paid_After',
    'Salary_Remaining_After','Is_Advance_Salary'
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
  await recordMoneyEvent({
    sourceType: 'salary_payment',
    sourceId: receiptNumber,
    direction: 'expense',
    amount: cashPaid,
    townName,
    date: dateStr,
    partyName: employeeName || '',
    description: `${type || 'Employee'} ${extraAdvance > 0 ? 'salary/advance' : 'salary'} ${month || ''}`,
    receiptNumber,
    createdBy: 'CEO',
  });

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

  const reports = [];
  for (const t of towns) {
    const money = await getMoneySummary(t.Town_Name);
    reports.push({
      Town_Name: t.Town_Name,
      Total_Income: money.totalReceived,
      Total_Received: money.totalReceived,
      Commission: 0,
      Operation_Expenses: money.totalExpenses,
      CEO_Expenses: 0,
      CEO_Salary: 0,
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
  const opExp = money.totalExpenses;
  const commission = 0;
  const ceo = 0;
  const salary = 0;

  const { getAllPropertiesByTown } = require('./properties');
  const { getTownPrices } = require('./towns');
  const allPlots = await getAllPropertiesByTown(townName, 'Plot');
  const allShops = await getAllPropertiesByTown(townName, 'Shop');
  let prices = {};
  try { prices = await getTownPrices(townName); } catch {}

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
    totalExpenses: opExp,
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
  const sales = await readExcelFile(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data');
  const installments = await readExcelFile(path.join(getGlobalsPath(), 'Installments_Tracker.xlsx'), 'Data');

  // Build a set of properties that actually have installment records
  const propsWithInstRecords = new Set();
  installments.filter(inst => String(inst.Town_Name) === String(townName)).forEach(inst => {
    propsWithInstRecords.add(`${inst.Type}|${inst.Plot_Shop_Number}`);
  });

  // Filter sales: same town AND (has installment in tracker OR has Total_Installments > 0)
  const townSales = sales.filter(s => {
    if (String(s.Town_Name) !== String(townName)) return false;
    const key = `${s.Type}|${s.Plot_Shop_Number}`;
    const hasInstRecords = propsWithInstRecords.has(key);
    const hasInstField = parseInt(s.Total_Installments) > 0;
    return hasInstRecords || hasInstField;
  });

  return townSales.map(sale => {
    const propInstallments = installments.filter(inst =>
      String(inst.Type) === String(sale.Type) &&
      String(inst.Plot_Shop_Number) === String(sale.Plot_Shop_Number) &&
      String(inst.Town_Name) === String(sale.Town_Name)
    );

    const paidInst = propInstallments.filter(inst => String(inst.Status || '').toLowerCase() === 'paid');
    const activeInst = propInstallments.filter(inst => String(inst.Status || '').toLowerCase() !== 'paid');

    const advanceAmount = parseFloat(sale.Advance_Amount_PKR) || 0;
    const paidSum = paidInst.reduce((s, i) => s + (parseFloat(i.Monthly_Amount) || 0), 0);
    const totalPaid = advanceAmount + paidSum;
    const totalPrice = parseFloat(sale.Total_Amount_PKR) || 0;

    return {
      id: `${sale.Type}|${sale.Plot_Shop_Number}|${sale.Town_Name}`,
      propertyType: sale.Type,
      propertyNumber: sale.Plot_Shop_Number,
      townName: sale.Town_Name,
      buyerName: sale.Customer_Name,
      totalPrice,
      totalPaid,
      activeInstallments: activeInst.length,
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
    installmentNumber: parseInt(inst.Month_Number) || 0,
    totalInstallments: parseInt(inst.Total_Months) || 0,
    dueDate: inst.Due_Date || '',
    dueAmount: parseFloat(inst.Monthly_Amount) || 0,
    isPaid: String(inst.Status || '').toLowerCase() === 'paid',
    status: inst.Status || '',
  }));
}

async function recordCollectionPaymentLocal({ saleId, type, plotShopNumber, townName, amount, paymentMethod, notes }) {
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
    await updatePropertyFile(type, plotShopNumber, townName, {
      Received_Amount: newReceived,
      Remaining_Amount: newRemaining,
      Installment_Status: newRemaining <= 0 ? 'Completed' : prop.Installment_Status,
    });
  }

  if (townName) await updateTownFinancials(townName);

  const historyPath = path.join(getGlobalsPath(), 'Collection_Payments.xlsx');
  await ensureCollectionPaymentsFile(historyPath);
  await ensureSheetColumns(historyPath, 'Data', ['Payment_ID','Sale_ID','Type','Plot_Shop_Number','Town_Name','Customer_Name','Agent_Name','Amount','Received_Before','Received_After','Remaining_After','Payment_Date','Payment_Method','Notes']);
  const paymentId = generateId();
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
    Payment_Date: new Date().toISOString().split('T')[0],
    Payment_Method: paymentMethod || 'Cash',
    Notes: notes || '',
  };
  await appendToExcel(historyPath, 'Data', paymentRow);
  await recordMoneyEvent({
    sourceType: 'collection_payment',
    sourceId: paymentId,
    direction: 'income',
    amount: receivedAmount,
    townName: item.Town_Name || townName,
    date: new Date().toISOString().split('T')[0],
    partyName: item.Customer_Name || '',
    description: `${item.Type || type} ${item.Plot_Shop_Number || plotShopNumber} collection received`,
    createdBy: item.Agent_Name || 'System',
  });

  if (newRemaining <= 0) {
    await upsertCommissionForSaleLocal({ ...item, Received_Amount: newReceived, Remaining_Amount: newRemaining });
  }

  return { newReceived, newRemaining, payment: paymentRow };
}

module.exports = { getInstallments, getDueInstallments, upsertDueInstallmentNotifications, markInstallmentPaid, extendInstallmentDate, addEmployee, getEmployees, deleteEmployee, getNotifications, dismissNotification, getDashboardStats, getAllSales, getAllExpenses, getCeoExpenses, getCeoSalary, addCeoSalary, deleteCeoSalary, getResellHistory, getProfitLossReport, recordSalaryPayment, getSalaryRecords, getTownPerformance, getInstallmentProperties, getPropertyInstallments, recordCollectionPaymentLocal };
