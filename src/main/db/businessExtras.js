const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const {
  getGlobalsPath,
  readExcelFile,
  appendToExcel,
  updateExcelRow,
  deleteExcelRow,
  generateId,
  ensureSheetColumns,
  withFileWriteLock,
  writeWorkbookAtomic,
  syncMirrorsForFile,
} = require('./core');
const { recordMoneyEvent } = require('./moneyLedger');
const { parseMoney } = require('./moneyUtils');

const TODAY = () => new Date().toISOString().split('T')[0];

const FILES = {
  agents: 'Town_Agents.xlsx',
  investors: 'Investors.xlsx',
  investorTx: 'Investor_Transactions.xlsx',
  construction: 'Construction_Projects.xlsx',
  constructionPayments: 'Construction_Payments.xlsx',
  commissionReceipts: 'Commission_Receipts.xlsx',
  receiptArchive: 'Receipt_Archive.xlsx',
};

const COLUMNS = {
  agents: ['Agent_ID','Town_Name','Agent_Name','Phone_Number','CNIC','Address','Notes','Status','Created_At'],
  investors: ['Investor_ID','Town_Name','Investor_Name','Phone_Number','CNIC','Address','Notes','Balance','Status','Created_At','Approval_Status'],
  investorTx: ['Transaction_ID','Investor_ID','Town_Name','Investor_Name','Type','Amount','Date','Notes','Balance_After','Receipt_Number','Created_By','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  construction: ['Project_ID','Town_Name','Category','Constructor_Name','Phone_Number','Company_Name','Material_Name','Material_Quantity','Material_Rate','Deal_Amount','Paid_Amount','Remaining_Amount','Status','Start_Date','Notes','Deal_Receipt_Number'],
  constructionPayments: ['Payment_ID','Project_ID','Town_Name','Category','Constructor_Name','Amount','Payment_Date','Material_Name','Material_Quantity','Material_Rate','Remaining_After','Receipt_Number','Notes','Created_By','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  commissionReceipts: ['Receipt_ID','Commission_ID','Sale_ID','Town_Name','Agent_Name','Plot_Shop_Number','Amount','Paid_Date','Receipt_Number','Paid_By','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  receiptArchive: ['Receipt_ID','Receipt_Number','Receipt_Type','Town_Name','Entity_ID','Entity_Name','Amount','Receipt_Date','Payload_JSON','Created_At'],
};

function filePath(key) {
  return path.join(getGlobalsPath(), FILES[key]);
}

async function ensureFile(key) {
  const fp = filePath(key);
  const cols = COLUMNS[key];
  if (!fs.existsSync(fp)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(cols.map(c => String(c).replace(/_/g, ' ')));
    sheet.addRow(cols);
    sheet.getRow(2).hidden = true;
    cols.forEach((c, i) => { sheet.getColumn(i + 1).width = Math.max(14, Math.min(28, c.length + 6)); });
    await withFileWriteLock(fp, async () => {
      await writeWorkbookAtomic(fp, workbook);
      syncMirrorsForFile(fp);
    });
  } else {
    await ensureSheetColumns(fp, 'Data', cols);
  }
  return fp;
}

async function rows(key) {
  const fp = await ensureFile(key);
  return readExcelFile(fp, 'Data');
}

function toMoney(value) {
  return parseMoney(value);
}

async function saveReceiptArchive(data) {
  const fp = await ensureFile('receiptArchive');
  const receiptNumber = data?.Receipt_Number || data?.receiptNumber;
  if (!receiptNumber) throw new Error('Receipt_Number is required');
  const existing = (await readExcelFile(fp, 'Data')).find((row) =>
    String(row.Receipt_Number || '').trim() === String(receiptNumber || '').trim()
  );
  if (existing) return existing;
  const payload = data?.Payload_JSON || data?.payload || data;
  const row = {
    Receipt_ID: data.Receipt_ID || generateId(),
    Receipt_Number: receiptNumber,
    Receipt_Type: data.Receipt_Type || data?.type || '',
    Town_Name: data.Town_Name || data?.townName || '',
    Entity_ID: data.Entity_ID || data?.entityId || '',
    Entity_Name: data.Entity_Name || data?.entityName || data?.investorName || data?.constructorName || '',
    Amount: toMoney(data.Amount ?? data?.amount),
    Receipt_Date: data.Receipt_Date || data?.date || data?.paymentDate || TODAY(),
    Payload_JSON: typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
    Created_At: data.Created_At || new Date().toISOString(),
  };
  await appendToExcel(fp, 'Data', row);
  return row;
}

async function getReceiptArchive(townName, receiptType) {
  const all = await rows('receiptArchive');
  return all.filter(r =>
    (!townName || String(r.Town_Name) === String(townName)) &&
    (!receiptType || String(r.Receipt_Type) === String(receiptType))
  );
}

async function getTownAgents(townName) {
  const all = await rows('agents');
  return all.filter(a => (!townName || String(a.Town_Name) === String(townName)) && String(a.Status || 'Active') !== 'Deleted');
}

async function addTownAgent(data) {
  const fp = await ensureFile('agents');
  if (!data?.Town_Name) throw new Error('Town_Name is required');
  if (!data?.Agent_Name) throw new Error('Agent_Name is required');
  const row = {
    Agent_ID: data.Agent_ID || generateId(),
    Town_Name: data.Town_Name,
    Agent_Name: data.Agent_Name,
    Phone_Number: data.Phone_Number || '',
    CNIC: data.CNIC || '',
    Address: data.Address || '',
    Notes: data.Notes || '',
    Status: data.Status || 'Active',
    Created_At: data.Created_At || TODAY(),
  };
  await appendToExcel(fp, 'Data', row);
  return row;
}

async function getInvestors(townName) {
  const all = await rows('investors');
  return all.filter(i => (!townName || String(i.Town_Name) === String(townName)) && String(i.Status || 'Active') !== 'Deleted');
}

async function addInvestor(data) {
  const fp = await ensureFile('investors');
  if (!data?.Town_Name) throw new Error('Town_Name is required');
  if (!data?.Investor_Name) throw new Error('Investor_Name is required');
  const row = {
    Investor_ID: data.Investor_ID || generateId(),
    Town_Name: data.Town_Name,
    Investor_Name: data.Investor_Name,
    Phone_Number: data.Phone_Number || '',
    CNIC: data.CNIC || '',
    Address: data.Address || '',
    Notes: data.Notes || '',
    Balance: toMoney(data.Balance),
    Status: data.Status || 'Active',
    Created_At: data.Created_At || TODAY(),
    Approval_Status: data.Approval_Status || 'approved',
  };
  await appendToExcel(fp, 'Data', row);
  return row;
}

async function investorTransaction(data) {
  const investorsPath = await ensureFile('investors');
  const txPath = await ensureFile('investorTx');
  const all = await readExcelFile(investorsPath, 'Data');
  const inv = all.find(i => String(i.Investor_ID) === String(data.Investor_ID));
  if (!inv) throw new Error('Investor not found');
  const amount = toMoney(data.Amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  const type = String(data.Type || '').toLowerCase() === 'debit' ? 'Debit' : 'Credit';
  const current = toMoney(inv.Balance);
  const next = type === 'Credit' ? current + amount : current - amount;
  await updateExcelRow(investorsPath, 'Data', inv._rowNumber, { Balance: next });
  const row = {
    Transaction_ID: data.Transaction_ID || generateId(),
    Investor_ID: inv.Investor_ID,
    Town_Name: inv.Town_Name,
    Investor_Name: inv.Investor_Name,
    Type: type,
    Amount: amount,
    Date: data.Date || TODAY(),
    Notes: data.Notes || '',
    Balance_After: next,
    Receipt_Number: data.Receipt_Number || `INV-${TODAY().replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    Created_By: data.Created_By || '',
    Payment_Account_ID: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
    Payment_Account_Name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    Payment_Account_Type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
  };
  await appendToExcel(txPath, 'Data', row);
  await saveReceiptArchive({
    Receipt_Number: row.Receipt_Number,
    Receipt_Type: 'investor',
    Town_Name: row.Town_Name,
    Entity_ID: row.Investor_ID,
    Entity_Name: row.Investor_Name,
    Amount: row.Amount,
    Receipt_Date: row.Date,
    Payload_JSON: {
      type: 'investor',
      townName: row.Town_Name,
      date: row.Date,
      receiptNumber: row.Receipt_Number,
      investorName: row.Investor_Name,
      transactionType: row.Type,
      amount: row.Amount,
      balanceAfter: row.Balance_After,
      paymentAccountName: row.Payment_Account_Name,
      note: row.Notes,
    },
  });
  await recordMoneyEvent({
    sourceType: 'investor_transaction',
    sourceId: row.Transaction_ID,
    direction: type === 'Debit' ? 'expense' : 'income',
    amount: row.Amount,
    townName: row.Town_Name,
    date: row.Date,
    partyName: row.Investor_Name,
    description: `Investor ${type}`,
    receiptNumber: row.Receipt_Number,
    createdBy: row.Created_By || 'System',
    paymentAccountId: row.Payment_Account_ID,
    paymentAccountName: row.Payment_Account_Name,
    paymentAccountType: row.Payment_Account_Type,
  });
  return row;
}

async function getInvestorTransactions(townName, investorId) {
  const all = await rows('investorTx');
  return all.filter(t => (!townName || String(t.Town_Name) === String(townName)) && (!investorId || String(t.Investor_ID) === String(investorId)));
}

async function getConstructionProjects(townName) {
  const all = await rows('construction');
  return all.filter(p => (!townName || String(p.Town_Name) === String(townName)) && String(p.Status || 'Active') !== 'Deleted');
}

async function addConstructionProject(data) {
  const fp = await ensureFile('construction');
  if (!data?.Town_Name) throw new Error('Town_Name is required');
  if (!data?.Category) throw new Error('Category is required');
  if (!data?.Constructor_Name) throw new Error('Constructor_Name is required');
  const deal = toMoney(data.Deal_Amount);
  const receiptNumber = data.Deal_Receipt_Number || `CON-DEAL-${TODAY().replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const row = {
    Project_ID: data.Project_ID || generateId(),
    Town_Name: data.Town_Name,
    Category: data.Category,
    Constructor_Name: data.Constructor_Name,
    Phone_Number: data.Phone_Number || '',
    Company_Name: data.Company_Name || '',
    Material_Name: data.Material_Name || '',
    Material_Quantity: data.Material_Quantity || '',
    Material_Rate: data.Material_Rate || '',
    Deal_Amount: deal,
    Paid_Amount: 0,
    Remaining_Amount: deal,
    Status: data.Status || 'Active',
    Start_Date: data.Start_Date || TODAY(),
    Notes: data.Notes || '',
    Deal_Receipt_Number: receiptNumber,
  };
  await appendToExcel(fp, 'Data', row);
  await saveReceiptArchive({
    Receipt_Number: receiptNumber,
    Receipt_Type: 'construction_deal',
    Town_Name: row.Town_Name,
    Entity_ID: row.Project_ID,
    Entity_Name: row.Constructor_Name,
    Amount: row.Deal_Amount,
    Receipt_Date: row.Start_Date,
    Payload_JSON: {
      type: 'construction_deal',
      townName: row.Town_Name,
      date: row.Start_Date,
      receiptNumber,
      category: row.Category,
      constructorName: row.Constructor_Name,
      phoneNumber: row.Phone_Number,
      companyName: row.Company_Name,
      materialName: row.Material_Name,
      materialQuantity: row.Material_Quantity,
      materialRate: row.Material_Rate,
      dealAmount: row.Deal_Amount,
      paidAmount: 0,
      remainingAmount: row.Remaining_Amount,
      note: row.Notes,
    },
  });
  return row;
}

async function recordConstructionPayment(data) {
  const projectsPath = await ensureFile('construction');
  const payPath = await ensureFile('constructionPayments');
  const all = await readExcelFile(projectsPath, 'Data');
  const project = all.find(p => String(p.Project_ID) === String(data.Project_ID));
  if (!project) throw new Error('Construction project not found');
  const amount = toMoney(data.Amount);
  const paid = toMoney(project.Paid_Amount);
  const deal = toMoney(project.Deal_Amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  if (paid + amount > deal) throw new Error('Payment exceeds construction deal amount');
  const nextPaid = paid + amount;
  const remaining = Math.max(0, deal - nextPaid);
  await updateExcelRow(projectsPath, 'Data', project._rowNumber, {
    Paid_Amount: nextPaid,
    Remaining_Amount: remaining,
    Status: remaining <= 0 ? 'Completed' : (project.Status || 'Active'),
  });
  const row = {
    Payment_ID: data.Payment_ID || generateId(),
    Project_ID: project.Project_ID,
    Town_Name: project.Town_Name,
    Category: project.Category,
    Constructor_Name: project.Constructor_Name,
    Amount: amount,
    Payment_Date: data.Payment_Date || TODAY(),
    Material_Name: data.Material_Name || project.Material_Name || '',
    Material_Quantity: data.Material_Quantity || project.Material_Quantity || '',
    Material_Rate: data.Material_Rate || project.Material_Rate || '',
    Remaining_After: remaining,
    Receipt_Number: data.Receipt_Number || `CON-${TODAY().replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    Notes: data.Notes || '',
    Created_By: data.Created_By || '',
    Payment_Account_ID: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
    Payment_Account_Name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    Payment_Account_Type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
  };
  await appendToExcel(payPath, 'Data', row);
  await saveReceiptArchive({
    Receipt_Number: row.Receipt_Number,
    Receipt_Type: 'construction_payment',
    Town_Name: row.Town_Name,
    Entity_ID: row.Project_ID,
    Entity_Name: row.Constructor_Name,
    Amount: row.Amount,
    Receipt_Date: row.Payment_Date,
    Payload_JSON: {
      type: 'construction_payment',
      townName: row.Town_Name,
      date: row.Payment_Date,
      receiptNumber: row.Receipt_Number,
      category: row.Category,
      constructorName: row.Constructor_Name,
      materialName: row.Material_Name,
      materialQuantity: row.Material_Quantity,
      materialRate: row.Material_Rate,
      amount: row.Amount,
      remainingAmount: row.Remaining_After,
      paymentAccountName: row.Payment_Account_Name,
      note: row.Notes,
    },
  });
  await recordMoneyEvent({
    sourceType: 'construction_payment',
    sourceId: row.Payment_ID,
    direction: 'expense',
    amount: row.Amount,
    townName: row.Town_Name,
    date: row.Payment_Date,
    partyName: row.Constructor_Name,
    description: `Construction ${row.Category}`,
    receiptNumber: row.Receipt_Number,
    createdBy: row.Created_By || 'System',
    paymentAccountId: row.Payment_Account_ID,
    paymentAccountName: row.Payment_Account_Name,
    paymentAccountType: row.Payment_Account_Type,
  });
  return row;
}

async function getConstructionPayments(townName) {
  const all = await rows('constructionPayments');
  return all.filter(p => !townName || String(p.Town_Name) === String(townName));
}

async function recordCommissionReceipt(data) {
  const fp = await ensureFile('commissionReceipts');
  const receiptId = data.Receipt_ID || generateId();
  const existing = (await rows('commissionReceipts')).find((r) => String(r.Receipt_ID || '') === String(receiptId));
  if (existing) return existing;
  const row = {
    Receipt_ID: receiptId,
    Commission_ID: data.Commission_ID || '',
    Sale_ID: data.Sale_ID || '',
    Town_Name: data.Town_Name || '',
    Agent_Name: data.Agent_Name || '',
    Plot_Shop_Number: data.Plot_Shop_Number || '',
    Amount: toMoney(data.Amount),
    Paid_Date: data.Paid_Date || TODAY(),
    Receipt_Number: data.Receipt_Number || `COM-${TODAY().replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    Paid_By: data.Paid_By || '',
    Payment_Account_ID: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
    Payment_Account_Name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    Payment_Account_Type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
  };
  await appendToExcel(fp, 'Data', row);
  await saveReceiptArchive({
    Receipt_Number: row.Receipt_Number,
    Receipt_Type: 'commission',
    Town_Name: row.Town_Name,
    Entity_ID: row.Commission_ID,
    Entity_Name: row.Agent_Name,
    Amount: row.Amount,
    Receipt_Date: row.Paid_Date,
    Payload_JSON: row,
  });
  await recordMoneyEvent({
    sourceType: 'commission_payment',
    sourceId: row.Receipt_ID,
    direction: 'expense',
    amount: row.Amount,
    townName: row.Town_Name,
    date: row.Paid_Date,
    partyName: row.Agent_Name,
    description: 'Agent commission paid',
    receiptNumber: row.Receipt_Number,
    createdBy: row.Paid_By || 'Accountant',
    paymentAccountId: row.Payment_Account_ID,
    paymentAccountName: row.Payment_Account_Name,
    paymentAccountType: row.Payment_Account_Type,
  });
  return row;
}

async function cleanupLegacyAgentData() {
  const globals = getGlobalsPath();
  const removed = {};
  const deleteFiles = ['Commissions.xlsx'];
  for (const name of deleteFiles) {
    const fp = path.join(globals, name);
    if (fs.existsSync(fp)) {
      fs.rmSync(fp, { force: true });
      removed[name] = 'deleted';
    }
  }

  const salesPath = path.join(globals, 'All_Sales.xlsx');
  if (fs.existsSync(salesPath)) {
    const rows = await readExcelFile(salesPath, 'Data');
    const agentRows = rows.filter(r => String(r.Agent_Name || '').trim());
    for (const row of agentRows.sort((a, b) => b._rowNumber - a._rowNumber)) {
      await deleteExcelRow(salesPath, 'Data', row._rowNumber);
    }
    removed.agent_sales = agentRows.length;
  }
  return { success: true, removed };
}

async function updateEmployeePaidAmount(townName, employeeName, amount, paymentAccount = {}) {
  const { getDbPath, ensureSheetColumns, appendToExcel } = require('./core');
  
  let employeeExists = false;
  let salaryAmount = 0;
  
  try {
    const EmployeeDB = require('./employees');
    const empDb = new EmployeeDB(getDbPath());
    const emps = await empDb.getEmployees(townName);
    const emp = emps.find(e => String(e.name || '').trim().toLowerCase() === String(employeeName || '').trim().toLowerCase() && String(e.status || 'Active').toLowerCase() !== 'deleted');
    if (emp) {
      employeeExists = true;
      salaryAmount = parseFloat(emp.baseSalary) || 0;
    } else {
      const { getTownAgents } = module.exports; // just to verify if anything else is needed, but we check legacy Employees below
      const { getEmployees } = require('./globals');
      const legacyEmps = await getEmployees(townName);
      const legEmp = legacyEmps.find(e => String(e.Employee_Name || '').trim().toLowerCase() === String(employeeName || '').trim().toLowerCase());
      if (legEmp) {
         employeeExists = true;
         salaryAmount = parseFloat(legEmp.Salary) || 0;
      }
    }
  } catch (e) {
    console.warn('[updateEmployeePaidAmount] Error checking employee existence:', e);
  }

  if (!employeeExists) {
    console.warn(`[updateEmployeePaidAmount] No employee found matching "${employeeName}" in "${townName}". Skipping balance update. Entry will continue saving.`);
    return { success: true, updated: false, reason: 'not_found' };
  }

  try {
    const globals = getDbPath();
    const salaryPath = path.join(globals, 'Salary_Records.xlsx');
    
    const cols = ['Receipt_Number','Date','Payment_Date','Month','Type','Name','Designation','Amount','Town_Name','Note','Paid_By','Advance_Deduction','New_Advance_Given','Salary_Amount','Salary_Gross_Amount','Cash_Disbursed_Amount','Salary_Paid_Amount','Salary_Paid_Before','Salary_Paid_After','Salary_Remaining_After','Is_Advance_Salary','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'];
    
    const TODAY = new Date().toISOString().split('T')[0];
    const receiptNum = `SAL-D-${TODAY.replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    
    const newRow = {
      Receipt_Number: receiptNum,
      Date: TODAY,
      Payment_Date: TODAY,
      Month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
      Type: 'Salary',
      Name: employeeName,
      Designation: 'Employee',
      Amount: amount,
      Town_Name: townName,
      Note: 'Paid via Daily Entries',
      Paid_By: 'System',
      Advance_Deduction: 0,
      New_Advance_Given: 0,
      Salary_Amount: salaryAmount,
      Salary_Gross_Amount: salaryAmount,
      Cash_Disbursed_Amount: amount,
      Salary_Paid_Amount: amount,
      Salary_Paid_Before: 0,
      Salary_Paid_After: amount,
      Salary_Remaining_After: salaryAmount - amount,
      Is_Advance_Salary: 'No',
      Payment_Account_ID: paymentAccount.paymentAccountId || 'daily-entry',
      Payment_Account_Name: paymentAccount.paymentAccountName || 'Daily Entry Ledger',
      Payment_Account_Type: paymentAccount.paymentAccountType || 'daily',
    };
    
    await ensureSheetColumns(salaryPath, 'Data', cols);
    await appendToExcel(salaryPath, 'Data', newRow);

    // Sync to Supabase
    try {
      const onlineDb = require('./online/index');
      await onlineDb.recordSalaryPayment(newRow);
    } catch (onlineErr) {
      console.warn('[updateEmployeePaidAmount] Online sync warning:', onlineErr);
    }

    return { success: true, updated: true };
  } catch (err) {
    console.error('[updateEmployeePaidAmount] Error updating salary record:', err);
    // Entry must not fail, so swallow the error
    return { success: false, error: err.message };
  }
}

async function updateConstructorPaidAmount(townName, constructorName, amount, paymentAccount = {}) {
  const projectsPath = await ensureFile('construction');
  const payPath = await ensureFile('constructionPayments');
  const allProjects = await readExcelFile(projectsPath, 'Data');
  
  // Find projects matching constructor name in this town that are active
  const project = allProjects.find(p => 
    String(p.Town_Name || '').trim().toLowerCase() === String(townName || '').trim().toLowerCase() &&
    String(p.Constructor_Name || '').trim().toLowerCase() === String(constructorName || '').trim().toLowerCase() &&
    String(p.Status || 'Active').toLowerCase() === 'active'
  );
  
  if (!project) {
    console.warn(`[updateConstructorPaidAmount] No active construction project found for constructor "${constructorName}" in "${townName}". Skipping balance update.`);
    return { success: true, updated: false, reason: 'not_found' };
  }
  
  const paid = toMoney(project.Paid_Amount);
  const deal = toMoney(project.Deal_Amount);
  const nextPaid = paid + amount;
  const remaining = Math.max(0, deal - nextPaid);
  
  // Update project Excel row
  await updateExcelRow(projectsPath, 'Data', project._rowNumber, {
    Paid_Amount: nextPaid,
    Remaining_Amount: remaining,
    Status: remaining <= 0 ? 'Completed' : (project.Status || 'Active'),
  });
  
  // Append to construction payments
  const paymentId = generateId();
  const TODAY_DATE = TODAY();
  const receiptNumber = `CON-D-${TODAY_DATE.replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const row = {
    Payment_ID: paymentId,
    Project_ID: project.Project_ID,
    Town_Name: project.Town_Name,
    Category: project.Category,
    Constructor_Name: project.Constructor_Name,
    Amount: amount,
    Payment_Date: TODAY_DATE,
    Material_Name: '',
    Material_Quantity: '',
    Material_Rate: '',
    Remaining_After: remaining,
    Receipt_Number: receiptNumber,
    Notes: 'Paid via Daily Entries',
    Created_By: 'System',
    Payment_Account_ID: paymentAccount.paymentAccountId || 'cash-in-hand',
    Payment_Account_Name: paymentAccount.paymentAccountName || 'Cash in Hand',
    Payment_Account_Type: paymentAccount.paymentAccountType || 'cash',
  };
  await appendToExcel(payPath, 'Data', row);
  
  // Sync online
  try {
    const onlineDb = require('./online/index');
    await onlineDb.insert('construction_payments', row);
    // Update construction project online
    const matchObj = { Project_ID: project.Project_ID };
    const updatesObj = {
      Paid_Amount: nextPaid,
      Remaining_Amount: remaining,
      Status: remaining <= 0 ? 'Completed' : (project.Status || 'Active'),
    };
    await onlineDb.updateWhere('construction_projects', matchObj, updatesObj);
  } catch (onlineErr) {
    console.warn('[updateConstructorPaidAmount] Online sync warning:', onlineErr);
  }
  
  return { success: true, updated: true };
}

module.exports = {
  getTownAgents,
  addTownAgent,
  getInvestors,
  addInvestor,
  investorTransaction,
  getInvestorTransactions,
  getConstructionProjects,
  addConstructionProject,
  recordConstructionPayment,
  getConstructionPayments,
  recordCommissionReceipt,
  saveReceiptArchive,
  getReceiptArchive,
  cleanupLegacyAgentData,
  updateEmployeePaidAmount,
  updateConstructorPaidAmount,
};
