const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const {
  getGlobalsPath,
  readExcelFile,
  appendToExcel,
  ensureSheetColumns,
  generateId,
  withFileWriteLock,
  writeWorkbookAtomic,
  syncMirrorsForFile,
} = require('./core');

const FILE_NAME = 'Money_Ledger.xlsx';
const SUMMARY_FILE_NAME = 'Town_Financial_Summary.xlsx';
const COLUMNS = [
  'Ledger_ID','Town_Name','Date','Source_Type','Source_ID','Direction','Amount',
  'Debit_Account','Credit_Account','Party_Name','Description','Receipt_Number','Status','Created_By','Created_At'
];
const SUMMARY_COLUMNS = [
  'Town_Name','Total_Received','Total_Expenses','Cash_Balance',
  'Pending_Collection','Investor_Balance','Updated_At'
];

function today() {
  return new Date().toISOString().split('T')[0];
}

function toMoney(value) {
  return parseFloat(value) || 0;
}

function ledgerPath() {
  return path.join(getGlobalsPath(), FILE_NAME);
}

function summaryPath() {
  return path.join(getGlobalsPath(), SUMMARY_FILE_NAME);
}

async function ensureMoneyLedgerFile() {
  const fp = ledgerPath();
  if (!fs.existsSync(fp)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(COLUMNS.map(c => c.replace(/_/g, ' ')));
    sheet.addRow(COLUMNS);
    sheet.getRow(2).hidden = true;
    COLUMNS.forEach((c, i) => { sheet.getColumn(i + 1).width = Math.max(14, Math.min(30, c.length + 6)); });
    await withFileWriteLock(fp, async () => {
      await writeWorkbookAtomic(fp, workbook);
      syncMirrorsForFile(fp);
    });
  } else {
    await ensureSheetColumns(fp, 'Data', COLUMNS);
  }
  return fp;
}

async function ensureSummaryFile() {
  const fp = summaryPath();
  if (!fs.existsSync(fp)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(SUMMARY_COLUMNS.map(c => c.replace(/_/g, ' ')));
    sheet.addRow(SUMMARY_COLUMNS);
    sheet.getRow(2).hidden = true;
    SUMMARY_COLUMNS.forEach((c, i) => { sheet.getColumn(i + 1).width = Math.max(16, Math.min(32, c.length + 6)); });
    await withFileWriteLock(fp, async () => {
      await writeWorkbookAtomic(fp, workbook);
      syncMirrorsForFile(fp);
    });
  } else {
    await ensureSheetColumns(fp, 'Data', SUMMARY_COLUMNS);
  }
  return fp;
}

function normalizeDirection(direction) {
  return String(direction || '').toLowerCase() === 'expense' ? 'expense' : 'income';
}

function titleAccount(value) {
  return String(value || 'general')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function accountForSource(sourceType, direction) {
  const source = String(sourceType || 'general').toLowerCase();
  if (source.includes('sale') || source.includes('collection') || source.includes('installment')) return 'Property Revenue';
  if (source.includes('investor')) return direction === 'income' ? 'Investor Capital' : 'Investor Withdrawal';
  if (source.includes('salary')) return 'Salary Expense';
  if (source.includes('commission')) return 'Commission Expense';
  if (source.includes('construction')) return 'Construction Expense';
  if (source.includes('ceo')) return 'CEO Expense';
  if (source.includes('expense')) return 'Operating Expense';
  if (source.includes('daily')) return direction === 'income' ? 'Daily Income' : 'Daily Expense';
  return titleAccount(sourceType);
}

function debitCreditFor({ direction, sourceType, debitAccount, creditAccount }) {
  if (debitAccount || creditAccount) {
    return {
      debit: debitAccount || (direction === 'income' ? 'Cash / Bank' : accountForSource(sourceType, direction)),
      credit: creditAccount || (direction === 'income' ? accountForSource(sourceType, direction) : 'Cash / Bank'),
    };
  }
  return direction === 'income'
    ? { debit: 'Cash / Bank', credit: accountForSource(sourceType, direction) }
    : { debit: accountForSource(sourceType, direction), credit: 'Cash / Bank' };
}

function sourceKey(row) {
  return [
    String(row.Source_Type || '').trim().toLowerCase(),
    String(row.Source_ID || '').trim(),
    String(row.Direction || '').trim().toLowerCase(),
  ].join('|');
}

async function getMoneyLedger({ townName } = {}) {
  const fp = await ensureMoneyLedgerFile();
  const rows = await readExcelFile(fp, 'Data');
  return rows.filter(r =>
    String(r.Status || 'approved').toLowerCase() === 'approved' &&
    (!townName || String(r.Town_Name || '') === String(townName))
  );
}

async function recordMoneyEvent(data) {
  const amount = toMoney(data?.amount ?? data?.Amount);
  if (amount <= 0) return { skipped: true, reason: 'amount_zero' };
  const sourceType = data.sourceType || data.Source_Type || 'manual';
  const sourceId = data.sourceId || data.Source_ID || generateId();
  const direction = normalizeDirection(data.direction || data.Direction);
  const accounts = debitCreditFor({
    direction,
    sourceType,
    debitAccount: data.debitAccount || data.Debit_Account,
    creditAccount: data.creditAccount || data.Credit_Account,
  });
  const fp = await ensureMoneyLedgerFile();
  const existing = await readExcelFile(fp, 'Data');
  const key = `${String(sourceType).trim().toLowerCase()}|${String(sourceId).trim()}|${direction}`;
  const match = existing.find(r => sourceKey(r) === key);
  if (match) return { ...match, duplicate: true };

  const row = {
    Ledger_ID: data.ledgerId || data.Ledger_ID || generateId(),
    Town_Name: data.townName || data.Town_Name || '',
    Date: data.date || data.Date || today(),
    Source_Type: sourceType,
    Source_ID: sourceId,
    Direction: direction,
    Amount: amount,
    Debit_Account: accounts.debit,
    Credit_Account: accounts.credit,
    Party_Name: data.partyName || data.Party_Name || '',
    Description: data.description || data.Description || '',
    Receipt_Number: data.receiptNumber || data.Receipt_Number || '',
    Status: data.status || data.Status || 'approved',
    Created_By: data.createdBy || data.Created_By || 'System',
    Created_At: data.createdAt || data.Created_At || new Date().toISOString(),
  };
  await appendToExcel(fp, 'Data', row);
  if (row.Town_Name) await refreshTownFinancialSummary(row.Town_Name);
  return row;
}

function computeLedgerSummary(rows = []) {
  const approved = rows.filter(r => String(r.Status || 'approved').toLowerCase() === 'approved');
  const totalReceived = approved
    .filter(r => String(r.Direction || '').toLowerCase() === 'income')
    .reduce((s, r) => s + toMoney(r.Amount), 0);
  const totalExpenses = approved
    .filter(r => String(r.Direction || '').toLowerCase() === 'expense')
    .reduce((s, r) => s + toMoney(r.Amount), 0);
  return {
    totalReceived,
    totalExpenses,
    cashBalance: totalReceived - totalExpenses,
  };
}

async function getMoneySummary(townName) {
  if (townName) {
    const summary = await getTownFinancialSummary(townName);
    if (summary) return summary;
  }
  const rows = await getMoneyLedger({ townName });
  return computeLedgerSummary(rows);
}

async function computePendingCollection(townName) {
  const globals = getGlobalsPath();
  const safeRead = async (file) => {
    try { return await readExcelFile(path.join(globals, file), 'Data'); } catch (_) { return []; }
  };
  const sales = await safeRead('All_Sales.xlsx');
  return sales
    .filter((s) => !townName || String(s.Town_Name || '') === String(townName))
    .reduce((sum, s) => sum + toMoney(s.Remaining_Amount), 0);
}

async function computeInvestorBalance(townName) {
  const globals = getGlobalsPath();
  try {
    const investors = await readExcelFile(path.join(globals, 'Investors.xlsx'), 'Data');
    return investors
      .filter((i) => !townName || String(i.Town_Name || '') === String(townName))
      .reduce((sum, i) => sum + toMoney(i.Balance), 0);
  } catch (_) {
    return 0;
  }
}

async function refreshTownFinancialSummary(townName) {
  const town = String(townName || '').trim();
  if (!town) return null;
  const fp = await ensureSummaryFile();
  const rows = await readExcelFile(fp, 'Data');
  const ledgerRows = await getMoneyLedger({ townName: town });
  const money = computeLedgerSummary(ledgerRows);
  const row = {
    Town_Name: town,
    Total_Received: money.totalReceived,
    Total_Expenses: money.totalExpenses,
    Cash_Balance: money.cashBalance,
    Pending_Collection: await computePendingCollection(town),
    Investor_Balance: await computeInvestorBalance(town),
    Updated_At: new Date().toISOString(),
  };
  const existing = rows.find((r) => String(r.Town_Name || '') === town);
  if (existing?._rowNumber) {
    const { updateExcelRow } = require('./core');
    await updateExcelRow(fp, 'Data', existing._rowNumber, row);
  } else {
    await appendToExcel(fp, 'Data', row);
  }
  return {
    totalReceived: row.Total_Received,
    totalExpenses: row.Total_Expenses,
    cashBalance: row.Cash_Balance,
    pendingCollection: row.Pending_Collection,
    investorBalance: row.Investor_Balance,
    updatedAt: row.Updated_At,
  };
}

async function getTownFinancialSummary(townName) {
  const town = String(townName || '').trim();
  if (!town) return null;
  const fp = await ensureSummaryFile();
  const rows = await readExcelFile(fp, 'Data');
  const row = rows.find((r) => String(r.Town_Name || '') === town);
  if (!row) return null;
  return {
    totalReceived: toMoney(row.Total_Received),
    totalExpenses: toMoney(row.Total_Expenses),
    cashBalance: toMoney(row.Cash_Balance),
    pendingCollection: toMoney(row.Pending_Collection),
    investorBalance: toMoney(row.Investor_Balance),
    updatedAt: row.Updated_At || '',
  };
}

async function getAllTownFinancialSummaries() {
  const fp = await ensureSummaryFile();
  const rows = await readExcelFile(fp, 'Data');
  return rows.map((row) => ({
    Town_Name: row.Town_Name || '',
    Total_Received: toMoney(row.Total_Received),
    Total_Expenses: toMoney(row.Total_Expenses),
    Cash_Balance: toMoney(row.Cash_Balance),
    Pending_Collection: toMoney(row.Pending_Collection),
    Investor_Balance: toMoney(row.Investor_Balance),
    Updated_At: row.Updated_At || '',
  })).filter((row) => row.Town_Name);
}

async function backfillMoneyLedger() {
  await ensureMoneyLedgerFile();
  const globals = getGlobalsPath();
  const safeRead = async (file) => {
    try { return await readExcelFile(path.join(globals, file), 'Data'); } catch (_) { return []; }
  };

  const [sales, installments, collections, expenses, ceoExpenses, ceoSalary, salaries, investorTx, constructionPayments, commissionReceipts] = await Promise.all([
    safeRead('All_Sales.xlsx'),
    safeRead('Installments_Tracker.xlsx'),
    safeRead('Collection_Payments.xlsx'),
    safeRead('All_Expenses.xlsx'),
    safeRead('CEO_Expenses.xlsx'),
    safeRead('CEO_Salary.xlsx'),
    safeRead('Salary_Records.xlsx'),
    safeRead('Investor_Transactions.xlsx'),
    safeRead('Construction_Payments.xlsx'),
    safeRead('Commission_Receipts.xlsx'),
  ]);

  for (const s of sales || []) {
    const saleId = s.Sale_ID || `${s.Type}|${s.Plot_Shop_Number}|${s.Town_Name}|${s.Receipt_Number}`;
    const advance = toMoney(s.Advance_Amount_PKR);
    if (advance > 0) {
      const sourceType = String(s.Sale_Type || s.Status || '').toLowerCase().includes('resell')
        ? 'resell_advance'
        : 'sale_advance';
      await recordMoneyEvent({
        sourceType,
        sourceId: saleId,
        direction: 'income',
        amount: advance,
        townName: s.Town_Name,
        date: s.Sell_Date,
        partyName: s.Customer_Name,
        description: `${s.Type || 'Property'} ${s.Plot_Shop_Number || ''} advance`,
        receiptNumber: s.Receipt_Number,
      });
    }
  }

  for (const c of collections || []) {
    await recordMoneyEvent({
      sourceType: 'collection_payment',
      sourceId: c.Payment_ID || `${c.Sale_ID}|${c.Payment_Date}|${c.Amount}`,
      direction: 'income',
      amount: c.Amount,
      townName: c.Town_Name,
      date: c.Payment_Date,
      partyName: c.Customer_Name,
      description: `${c.Type || 'Property'} ${c.Plot_Shop_Number || ''} collection`,
    });
  }

  for (const i of installments || []) {
    if (String(i.Status || '').toLowerCase() !== 'paid') continue;
    await recordMoneyEvent({
      sourceType: 'installment_payment',
      sourceId: i.Tracker_ID,
      direction: 'income',
      amount: i.Received_Amount || i.Monthly_Amount,
      townName: i.Town_Name,
      date: i.Paid_Date,
      partyName: i.Customer_Name,
      description: `${i.Type || 'Property'} ${i.Plot_Shop_Number || ''} installment ${i.Month_Number || ''}`,
    });
  }

  for (const e of expenses || []) {
    const category = String(e.Category || '').toLowerCase();
    const name = String(e.Expense_Name || '').toLowerCase();
    if (
      category === 'ceo' ||
      category === 'salary' ||
      category.includes('investor') ||
      category.includes('construction') ||
      category.includes('commission') ||
      name.startsWith('ceo:')
    ) {
      continue;
    }
    const expenseSourceType = category === 'sale' ? 'sale_expense' : (e.Daily_Entry_ID ? 'daily_entry' : 'expense');
    await recordMoneyEvent({
      sourceType: expenseSourceType,
      sourceId: e.Daily_Entry_ID || e.Expense_ID || `${e.Town_Name}|${e.Date}|${e.Expense_Name}|${e.Amount_PKR}`,
      direction: 'expense',
      amount: e.Amount_PKR,
      townName: e.Town_Name,
      date: e.Date,
      partyName: e.Added_By,
      description: e.Expense_Name || e.Description || 'Expense',
    });
  }

  for (const e of ceoExpenses || []) {
    await recordMoneyEvent({
      sourceType: 'ceo_expense',
      sourceId: e.Expense_ID || `${e.Town_Name}|${e.Date}|${e.Expense_Name}|${e.Amount_PKR}`,
      direction: 'expense',
      amount: e.Amount_PKR,
      townName: e.Town_Name,
      date: e.Date,
      partyName: 'CEO',
      description: e.Expense_Name || e.Description || 'CEO expense',
    });
  }

  for (const s of ceoSalary || []) {
    await recordMoneyEvent({
      sourceType: 'ceo_salary',
      sourceId: s.Salary_ID || `${s.Town_Name}|${s.Month_Year}`,
      direction: 'expense',
      amount: s.Amount_PKR,
      townName: s.Town_Name,
      date: s.Date_Recorded,
      partyName: 'CEO',
      description: `CEO salary ${s.Month_Year || ''}`,
    });
  }

  for (const s of salaries || []) {
    const cashDisbursed = toMoney(s.Cash_Disbursed_Amount || s.Amount);
    const salaryApplied = toMoney(s.Salary_Paid_Amount || s.Amount);
    const advanceGiven = toMoney(s.New_Advance_Given);
    await recordMoneyEvent({
      sourceType: 'salary_payment',
      sourceId: s.Receipt_Number,
      direction: 'expense',
      amount: cashDisbursed,
      townName: s.Town_Name,
      date: s.Date,
      partyName: s.Name,
      description: `${s.Type || 'Employee'} salary cash paid. Salary applied PKR ${Math.round(salaryApplied).toLocaleString()}${advanceGiven > 0 ? `, advance PKR ${Math.round(advanceGiven).toLocaleString()}` : ''}`,
      receiptNumber: s.Receipt_Number,
    });
  }

  for (const t of investorTx || []) {
    await recordMoneyEvent({
      sourceType: 'investor_transaction',
      sourceId: t.Transaction_ID,
      direction: String(t.Type || '').toLowerCase() === 'debit' ? 'expense' : 'income',
      amount: t.Amount,
      townName: t.Town_Name,
      date: t.Date,
      partyName: t.Investor_Name,
      description: `Investor ${t.Type || 'Credit'}`,
      receiptNumber: t.Receipt_Number,
    });
  }

  for (const p of constructionPayments || []) {
    await recordMoneyEvent({
      sourceType: 'construction_payment',
      sourceId: p.Payment_ID,
      direction: 'expense',
      amount: p.Amount,
      townName: p.Town_Name,
      date: p.Payment_Date,
      partyName: p.Constructor_Name,
      description: `Construction ${p.Category || ''}`,
      receiptNumber: p.Receipt_Number,
    });
  }

  for (const c of commissionReceipts || []) {
    await recordMoneyEvent({
      sourceType: 'commission_payment',
      sourceId: c.Receipt_ID || c.Commission_ID || c.Receipt_Number,
      direction: 'expense',
      amount: c.Amount,
      townName: c.Town_Name,
      date: c.Paid_Date,
      partyName: c.Agent_Name,
      description: 'Agent commission paid',
      receiptNumber: c.Receipt_Number,
    });
  }

  return await getMoneySummary();
}

module.exports = {
  COLUMNS,
  SUMMARY_COLUMNS,
  FILE_NAME,
  SUMMARY_FILE_NAME,
  ensureMoneyLedgerFile,
  ensureSummaryFile,
  recordMoneyEvent,
  getMoneyLedger,
  getMoneySummary,
  getTownFinancialSummary,
  getAllTownFinancialSummaries,
  refreshTownFinancialSummary,
  computeLedgerSummary,
  backfillMoneyLedger,
};
