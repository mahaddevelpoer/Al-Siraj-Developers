const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const {
  getGlobalsPath,
  getTownsPath,
  getDbPath,
  readExcelFile,
  appendToExcel,
  updateExcelRow,
  ensureSheetColumns,
  generateId,
  withFileWriteLock,
  writeWorkbookAtomic,
  syncMirrorsForFile,
} = require('./core');
const { parseMoney } = require('./moneyUtils');

function getDeterministicLedgerId(sourceType, sourceId, direction) {
  const input = `${sourceType}|${sourceId}|${direction}`;
  const hash = crypto.createHash('md5').update(input).digest('hex');
  return `LED-${hash}`.slice(0, 50);
}

const FILE_NAME = 'Money_Ledger.xlsx';
const SUMMARY_FILE_NAME = 'Town_Financial_Summary.xlsx';
const COLUMNS = [
  'Ledger_ID','Town_Name','Date','Source_Type','Source_ID','Direction','Amount',
  'Debit_Account','Credit_Account','Payment_Method','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type',
  'Party_Name','Description','Receipt_Number','Status','Created_By','Created_At'
];
const SUMMARY_COLUMNS = [
  'Town_Name','Total_Received','Total_Expenses','Cash_Balance',
  'Pending_Collection','Investor_Balance','Updated_At'
];

function today() {
  return new Date().toISOString().split('T')[0];
}

function toMoney(value) {
  return parseMoney(value);
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
  if (source.includes('salary_advance')) return 'Employee Advance Receivable';
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

function stableReceiptNumber({ sourceType, sourceId, direction, date }) {
  const dStr = String(date || today()).replace(/-/g, '');
  const hash = crypto.createHash('md5').update(String(sourceId)).digest('hex').slice(0, 6).toUpperCase();

  if (sourceType === 'installment_payment') {
    return `INS-${dStr}-${hash}`;
  }
  if (sourceType === 'collection_payment') {
    return `COL-${dStr}-${hash}`;
  }
  if (sourceType === 'salary_payment' || sourceType === 'salary_advance') {
    return `SAL-${dStr}-${hash}`;
  }
  
  const rawType = String(sourceType).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  return `LED-${rawType}-${dStr}-${hash}`;
}

async function archiveLedgerReceipt(row, receiptType) {
  if (!row?.Receipt_Number) return null;
  try {
    const { saveReceiptArchive } = require('./businessExtras');
    return await saveReceiptArchive({
      Receipt_ID: `REC-${String(row.Receipt_Number).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 110)}`,
      Receipt_Number: row.Receipt_Number,
      Receipt_Type: receiptType || row.Source_Type || 'ledger',
      Town_Name: row.Town_Name,
      Entity_ID: row.Source_ID,
      Entity_Name: row.Party_Name,
      Amount: row.Amount,
      Receipt_Date: row.Date,
      Payload_JSON: {
        receiptNumber: row.Receipt_Number,
        receiptType: receiptType || row.Source_Type || 'ledger',
        townName: row.Town_Name,
        partyName: row.Party_Name,
        amount: row.Amount,
        direction: row.Direction,
        debitAccount: row.Debit_Account,
        creditAccount: row.Credit_Account,
        paymentAccountId: row.Payment_Account_ID || 'cash-in-hand',
        paymentAccountName: row.Payment_Account_Name || 'Cash in Hand',
        paymentAccountType: row.Payment_Account_Type || 'cash',
        description: row.Description,
        sourceId: row.Source_ID,
      },
    });
  } catch (_) {
    return null;
  }
}

async function getMoneyLedger({ townName } = {}) {
  const fp = await ensureMoneyLedgerFile();
  const rows = await readExcelFile(fp, 'Data');
  const filtered = rows.filter(r =>
    String(r.Status || 'approved').toLowerCase() === 'approved' &&
    (!townName || String(r.Town_Name || '') === String(townName))
  );

  // Deduplicate by sourceKey and Source_ID to prevent double-counting from past race conditions
  const unique = [];
  const seenKeys = new Set();
  for (const row of filtered) {
    const key = sourceKey(row);
    const sId = String(row.Source_ID || '').trim();
    const sTown = String(row.Town_Name || '').trim().toLowerCase();
    const sDir = String(row.Direction || '').trim().toLowerCase();
    const idKey = sId ? `id|${sTown}|${sId}|${sDir}` : key;

    if (!seenKeys.has(key) && !seenKeys.has(idKey)) {
      seenKeys.add(key);
      if (sId) seenKeys.add(idKey);
      unique.push(row);
    }
  }
  return unique;
}

async function backfillLedgerReceipts({ townName } = {}) {
  const fp = await ensureMoneyLedgerFile();
  const rows = await readExcelFile(fp, 'Data');
  let updated = 0;
  let archived = 0;
  for (const row of rows) {
    if (townName && String(row.Town_Name || '') !== String(townName)) continue;
    const receiptNumber = row.Receipt_Number || stableReceiptNumber({
      sourceType: row.Source_Type || 'ledger',
      sourceId: row.Source_ID || row.Ledger_ID || generateId(),
      direction: normalizeDirection(row.Direction),
      date: row.Date,
    });
    const next = { ...row, Receipt_Number: receiptNumber };
    if (!row.Receipt_Number && row._rowNumber) {
      await updateExcelRow(fp, 'Data', row._rowNumber, { Receipt_Number: receiptNumber });
      updated += 1;
    }
    const archive = await archiveLedgerReceipt(next, row.Source_Type || 'ledger');
    if (archive) archived += 1;
  }
  return { success: true, updated, archived };
}

let moneyEventMutex = Promise.resolve();

async function recordMoneyEvent(data) {
  return new Promise((resolve, reject) => {
    moneyEventMutex = moneyEventMutex.then(async () => {
      try {
        const result = await _recordMoneyEvent(data);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }).catch(() => {});
  });
}

async function _recordMoneyEvent(data) {
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
  const dTown = String(data.townName || data.Town_Name || '').trim().toLowerCase();
  const match = existing.find(r => {
    if (sourceKey(r) === key) return true;
    if (sourceId && r.Source_ID && String(r.Source_ID).trim() === String(sourceId).trim()) {
      const rTown = String(r.Town_Name || '').trim().toLowerCase();
      const rDir = String(r.Direction || '').trim().toLowerCase();
      if ((!rTown || !dTown || rTown === dTown) && rDir === direction) {
        return true;
      }
    }
    return false;
  });
  if (match) {
    if (!match.Receipt_Number && match._rowNumber) {
      const receiptNumber = stableReceiptNumber({
        sourceType,
        sourceId,
        direction,
        date: match.Date || data.date || data.Date,
      });
      await updateExcelRow(fp, 'Data', match._rowNumber, { Receipt_Number: receiptNumber });
      const updated = { ...match, Receipt_Number: receiptNumber };
      await archiveLedgerReceipt(updated, sourceType);
      return { ...updated, duplicate: true };
    }
    await archiveLedgerReceipt(match, sourceType);
    return { ...match, duplicate: true };
  }

  const row = {
    Ledger_ID: data.ledgerId || data.Ledger_ID || getDeterministicLedgerId(sourceType, sourceId, direction),
    Town_Name: data.townName || data.Town_Name || '',
    Date: data.date || data.Date || today(),
    Source_Type: sourceType,
    Source_ID: sourceId,
    Direction: direction,
    Amount: amount,
    Debit_Account: accounts.debit,
    Credit_Account: accounts.credit,
    Payment_Method: data.paymentMethod || data.Payment_Method || 'cash',
    Payment_Account_ID: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
    Payment_Account_Name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    Payment_Account_Type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
    Party_Name: data.partyName || data.Party_Name || '',
    Description: data.description || data.Description || '',
    Receipt_Number: data.receiptNumber || data.Receipt_Number || stableReceiptNumber({ sourceType, sourceId, direction, date: data.date || data.Date }),
    Status: data.status || data.Status || 'approved',
    Created_By: data.createdBy || data.Created_By || 'System',
    Created_At: data.createdAt || data.Created_At || new Date().toISOString(),
  };
  await appendToExcel(fp, 'Data', row);
  await archiveLedgerReceipt(row, sourceType);
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
    return await refreshTownFinancialSummary(townName);
  }
  const rows = await getMoneyLedger({ townName });
  return computeLedgerSummary(rows);
}

async function computePendingCollection(townName) {
  const globals = getGlobalsPath();
  const safeRead = async (file) => {
    try { return await readExcelFile(path.join(globals, file), 'Data'); } catch (_) { return []; }
  };
  const [sales, installments] = await Promise.all([
    safeRead('All_Sales.xlsx'),
    safeRead('Installments_Tracker.xlsx'),
  ]);
  const saleMatchesInstallment = (sale, installment) => {
    if (sale.Sale_ID && installment.Sale_ID) {
      return String(sale.Sale_ID) === String(installment.Sale_ID);
    }
    return String(sale.Type || '') === String(installment.Type || '') &&
      String(sale.Plot_Shop_Number || '') === String(installment.Plot_Shop_Number || '') &&
      String(sale.Town_Name || '').trim().toLowerCase() === String(installment.Town_Name || '').trim().toLowerCase();
  };
  const targetLower = String(townName || '').trim().toLowerCase();
  return sales
    .filter((s) => !townName || String(s.Town_Name || '').trim().toLowerCase() === targetLower)
    .filter((s) => !['cancelled', 'resold'].includes(String(s.Status || '').trim().toLowerCase()))
    .reduce((sum, s) => {
      const total = toMoney(s.Total_Amount_PKR);
      const installmentCount = parseInt(s.Total_Installments, 10) || 0;
      if (installmentCount > 0 && total > 0) {
        const paidInstallments = installments
          .filter((inst) => saleMatchesInstallment(s, inst) && String(inst.Status || '').toLowerCase() === 'paid')
          .reduce((paid, inst) => paid + toMoney(inst.Received_Amount || inst.Monthly_Amount), 0);
        return sum + Math.max(0, total - toMoney(s.Advance_Amount_PKR) - paidInstallments);
      }
      return sum + toMoney(s.Remaining_Amount);
    }, 0);
}

async function computeInvestorBalance(townName) {
  const globals = getGlobalsPath();
  try {
    const investors = await readExcelFile(path.join(globals, 'Investors.xlsx'), 'Data');
    const targetLower = String(townName || '').trim().toLowerCase();
    return investors
      .filter((i) => !townName || String(i.Town_Name || '').trim().toLowerCase() === targetLower)
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
  const targetLower = town.toLowerCase();
  const existing = rows.find((r) => String(r.Town_Name || '').trim().toLowerCase() === targetLower);
  if (existing?._rowNumber) {
    const { updateExcelRow } = require('./core');
    await updateExcelRow(fp, 'Data', existing._rowNumber, row);
  } else {
    await appendToExcel(fp, 'Data', row);
  }

  // Sync to online Supabase town_financial_summary table
  try {
    const onlineDb = require('./online');
    if (onlineDb && typeof onlineDb.insert === 'function') {
      onlineDb.insert('town_financial_summary', {
        Town_Name: row.Town_Name,
        Total_Received: row.Total_Received,
        Total_Expenses: row.Total_Expenses,
        Cash_Balance: row.Cash_Balance,
        Pending_Collection: row.Pending_Collection,
        Investor_Balance: row.Investor_Balance,
        Updated_At: row.Updated_At,
      }).catch(err => {
        console.error('[moneyLedger] Background cloud sync error for town_financial_summary:', err);
      });
    }
  } catch (err) {
    console.warn('[moneyLedger] onlineDb require deferred:', err.message || err);
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
  const targetLower = town.toLowerCase();
  const row = rows.find((r) => String(r.Town_Name || '').trim().toLowerCase() === targetLower);
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

  // Only process towns whose .xlsx file still exists on disk.
  // Deleted towns must not appear in financials or the CEO dashboard.
  const { getTownsPath } = require('./core');
  const townsPath = getTownsPath();
  const activeTownFiles = require('fs').existsSync(townsPath)
    ? require('fs').readdirSync(townsPath).filter(f => f.endsWith('.xlsx')).map(f => f.replace(/\.xlsx$/i, ''))
    : [];
  const activeTownSet = new Set(activeTownFiles.map(n => String(n).trim().toLowerCase()));

  // Remove stale TFS rows for deleted towns (they can distort CEO dashboard totals)
  for (const row of rows) {
    const town = String(row.Town_Name || '').trim();
    if (town && !activeTownSet.has(town.toLowerCase()) && row._rowNumber) {
      try {
        const { deleteExcelRow } = require('./core');
        await deleteExcelRow(fp, 'Data', row._rowNumber);
      } catch (_) {}
    }
  }

  // Refresh only active towns
  for (const town of activeTownFiles) {
    await refreshTownFinancialSummary(town).catch(() => {});
  }

  const refreshed = await readExcelFile(fp, 'Data');
  return refreshed
    .filter(row => {
      const town = String(row.Town_Name || '').trim();
      return town && activeTownSet.has(town.toLowerCase());
    })
    .map((row) => ({
      Town_Name: row.Town_Name || '',
      Total_Received: toMoney(row.Total_Received),
      Total_Expenses: toMoney(row.Total_Expenses),
      Cash_Balance: toMoney(row.Cash_Balance),
      Pending_Collection: toMoney(row.Pending_Collection),
      Investor_Balance: toMoney(row.Investor_Balance),
      Updated_At: row.Updated_At || '',
    }));
}


async function backfillMoneyLedger() {
  await ensureMoneyLedgerFile();
  const globals = getGlobalsPath();
  const safeRead = async (file) => {
    try { return await readExcelFile(path.join(globals, file), 'Data'); } catch (_) { return []; }
  };

  // Build active town set — only process data belonging to towns that still exist on disk.
  // Records for deleted towns are SKIPPED so they never pollute Money_Ledger or any town balance.
  const townsPath = getTownsPath();
  const activeTownSet = new Set(
    require('fs').existsSync(townsPath)
      ? require('fs').readdirSync(townsPath)
          .filter(f => f.endsWith('.xlsx'))
          .map(f => f.replace(/\.xlsx$/i, '').trim().toLowerCase())
      : []
  );
  // Helper: returns true only if the record belongs to an active (non-deleted) town.
  const isActiveTown = (townName) => {
    const t = String(townName || '').trim();
    return t && activeTownSet.has(t.toLowerCase());
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
    if (s.Daily_Entry_ID) continue;
    if (!isActiveTown(s.Town_Name)) continue;
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
    if (!isActiveTown(c.Town_Name)) continue;
    const sourceId = c.Payment_ID || `${c.Sale_ID}|${c.Payment_Date}|${c.Amount}`;
    const receiptNumber = c.Receipt_Number || stableReceiptNumber({
      sourceType: 'collection_payment',
      sourceId,
      direction: 'income',
      date: c.Payment_Date || today(),
    });
    await recordMoneyEvent({
      sourceType: 'collection_payment',
      sourceId,
      direction: 'income',
      amount: c.Amount,
      townName: c.Town_Name,
      date: c.Payment_Date,
      partyName: c.Customer_Name,
      description: `${c.Type || 'Property'} ${c.Plot_Shop_Number || ''} collection`,
      receiptNumber,
    });
  }

  const installmentsPath = path.join(globals, 'Installments_Tracker.xlsx');
  if (fs.existsSync(installmentsPath)) {
    await ensureSheetColumns(installmentsPath, 'Data', ['Receipt_Number']);
  }

  for (const i of installments || []) {
    if (String(i.Status || '').toLowerCase() !== 'paid') continue;
    if (!isActiveTown(i.Town_Name)) continue;
    const sourceId = i.Tracker_ID || `${i.Town_Name}|${i.Type}|${i.Plot_Shop_Number}|${i.Month_Number}`;
    const receiptNumber = i.Receipt_Number || stableReceiptNumber({
      sourceType: 'installment_payment',
      sourceId,
      direction: 'income',
      date: i.Paid_Date || today(),
    });
    if (!i.Receipt_Number && i._rowNumber && fs.existsSync(installmentsPath)) {
      await updateExcelRow(installmentsPath, 'Data', i._rowNumber, { Receipt_Number: receiptNumber });
    }
    await recordMoneyEvent({
      sourceType: 'installment_payment',
      sourceId,
      direction: 'income',
      amount: i.Received_Amount || i.Monthly_Amount,
      townName: i.Town_Name,
      date: i.Paid_Date,
      partyName: i.Customer_Name,
      description: `${i.Type || 'Property'} ${i.Plot_Shop_Number || ''} installment ${i.Month_Number || ''}`,
      receiptNumber,
    });
  }

  for (const e of expenses || []) {
    if (!isActiveTown(e.Town_Name)) continue;
    const category = String(e.Category || '').toLowerCase();
    const name = String(e.Expense_Name || '').toLowerCase();
    const dailyEntryId = e.Daily_Entry_ID || e.daily_entry_id;
    const expId = String(e.Expense_ID || '');

    // Skip daily entry expenses (addDailyEntry already called recordMoneyEvent with sourceType='daily_entry')
    if (
      dailyEntryId ||
      expId.startsWith('de_') ||
      category === 'daily' ||
      category === 'daily_entry' ||
      category === 'ceo' ||
      category === 'salary' ||
      category.includes('investor') ||
      category.includes('construction') ||
      category.includes('commission') ||
      name.startsWith('ceo:')
    ) {
      continue;
    }
    const expenseSourceType = category === 'sale' ? 'sale_expense' : 'expense';
    await recordMoneyEvent({
      sourceType: expenseSourceType,
      sourceId: e.Expense_ID || `${e.Town_Name}|${e.Date}|${e.Expense_Name}|${e.Amount_PKR}`,
      direction: 'expense',
      amount: e.Amount_PKR,
      townName: e.Town_Name,
      date: e.Date,
      partyName: e.Added_By,
      description: e.Expense_Name || e.Description || 'Expense',
    });
  }

  for (const e of ceoExpenses || []) {
    if (!isActiveTown(e.Town_Name)) continue;
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
    if (!isActiveTown(s.Town_Name)) continue;
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
    if (!isActiveTown(s.Town_Name)) continue;
    const cashDisbursed = toMoney(s.Cash_Disbursed_Amount !== undefined && s.Cash_Disbursed_Amount !== '' ? s.Cash_Disbursed_Amount : s.Amount);
    const salaryApplied = toMoney(s.Salary_Paid_Amount !== undefined && s.Salary_Paid_Amount !== '' ? s.Salary_Paid_Amount : s.Amount);
    const advanceGiven = toMoney(s.New_Advance_Given);
    const salaryPart = Math.max(0, Math.min(cashDisbursed, salaryApplied));
    if (salaryPart > 0) {
      await recordMoneyEvent({
        sourceType: 'salary_payment',
        sourceId: `${s.Receipt_Number}:salary`,
        direction: 'expense',
        amount: salaryPart,
        townName: s.Town_Name,
        date: s.Date,
        partyName: s.Name,
        description: `${s.Type || 'Employee'} salary applied. Cash paid PKR ${Math.round(cashDisbursed).toLocaleString()}`,
        receiptNumber: s.Receipt_Number,
      });
    }
    if (advanceGiven > 0) {
      await recordMoneyEvent({
        sourceType: 'salary_advance',
        sourceId: `${s.Receipt_Number}:advance`,
        direction: 'expense',
        amount: advanceGiven,
        townName: s.Town_Name,
        date: s.Date,
        partyName: s.Name,
        description: `${s.Type || 'Employee'} advance salary`,
        receiptNumber: s.Receipt_Number,
        debitAccount: 'Employee Advance Receivable',
        creditAccount: 'Cash / Bank',
      });
    }
  }

  for (const t of investorTx || []) {
    if (!isActiveTown(t.Town_Name)) continue;
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
    if (!isActiveTown(p.Town_Name)) continue;
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
    if (!isActiveTown(c.Town_Name)) continue;
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

  // Cleanup duplicates from Money_Ledger.xlsx on disk
  try {
    const fp = await ensureMoneyLedgerFile();
    const rows = await readExcelFile(fp, 'Data');
    const seen = new Set();
    const cleanRows = [];
    let hadDuplicates = false;
    for (const r of rows) {
      const sId = String(r.Source_ID || '').trim();
      const sTown = String(r.Town_Name || '').trim().toLowerCase();
      const sDir = String(r.Direction || '').trim().toLowerCase();
      const key = `${String(r.Source_Type || '').trim().toLowerCase()}|${sId}|${sDir}`;
      const idKey = sId ? `id|${sTown}|${sId}|${sDir}` : key;
      if (seen.has(key) || seen.has(idKey)) {
        hadDuplicates = true;
        continue;
      }
      seen.add(key);
      if (sId) seen.add(idKey);
      cleanRows.push(r);
    }
    if (hadDuplicates) {
      const { overwriteExcelFile } = require('./core');
      await overwriteExcelFile(fp, 'Data', COLUMNS, cleanRows);
    }
  } catch (e) {
    console.error('Ledger cleanup failed:', e);
  }

  return await getMoneySummary();
}

async function getBankAccountTransactions({ townName, accountId, fromDate, toDate }) {
  const { getPaymentAccounts } = require('./cashBanks');
  const account_id = String(accountId || 'cash-in-hand').trim().toLowerCase();
  const allLedger = await getMoneyLedger({ townName });
  
  // Filter for approved transactions
  const approved = allLedger.filter(r => String(r.Status || 'approved').toLowerCase() === 'approved');
  
  // Filter for this specific account
  const accountTx = approved.filter(r => {
    const rId = String(r.Payment_Account_ID || 'cash-in-hand').trim().toLowerCase();
    // For legacy rows missing payment account ID, default to cash-in-hand
    return rId === account_id;
  });

  // Sort chronologically (oldest first) to compute running balance
  accountTx.sort((a, b) => {
    const d1 = new Date(a.Date || a.Created_At || 0).getTime();
    const d2 = new Date(b.Date || b.Created_At || 0).getTime();
    if (d1 === d2) return (a._rowNumber || 0) - (b._rowNumber || 0);
    return d1 - d2;
  });

  // Calculate opening balance up to fromDate
  let runningBalance = 0;
  let openingBalance = 0;
  
  // Include initial Bank/Cash opening balance if any?
  // We can get it from Payment_Accounts config if needed, or assume it's calculated from the sum.
  // Actually Payment_Accounts has Opening_Balance. Let's fetch it.
  try {
    const accounts = await getPaymentAccounts(townName);
    const acc = accounts.find(a => String(a.Account_ID).toLowerCase() === account_id);
    if (acc && acc.Opening_Balance) {
      runningBalance = Number(acc.Opening_Balance);
    }
  } catch(e) {}

  const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
  const toTime = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Infinity;

  const result = [];

  for (const tx of accountTx) {
    const txTime = new Date(`${tx.Date || tx.Created_At}T00:00:00`).getTime();
    const amount = Number(tx.Amount) || 0;
    const isIncome = String(tx.Direction || '').toLowerCase() === 'income';
    
    if (isIncome) {
      runningBalance += amount;
    } else {
      runningBalance -= amount;
    }

    if (txTime < fromTime) {
      openingBalance = runningBalance;
    } else if (txTime <= toTime) {
      result.push({
        id: tx.Ledger_ID,
        date: tx.Date,
        type: tx.Source_Type,
        direction: tx.Direction,
        amount: amount,
        partyName: tx.Party_Name,
        description: tx.Description,
        receiptNumber: tx.Receipt_Number,
        runningBalance: runningBalance
      });
    }
  }

  // If no fromDate, openingBalance is just the initial account opening balance
  if (!fromDate) {
    try {
      const accounts = await getPaymentAccounts(townName);
      const acc = accounts.find(a => String(a.Account_ID).toLowerCase() === account_id);
      if (acc && acc.Opening_Balance) openingBalance = Number(acc.Opening_Balance);
      else openingBalance = 0;
    } catch(e) {}
  }

  // For display, usually we want newest first, so reverse the result
  result.reverse();

  return {
    accountId: account_id,
    openingBalance,
    closingBalance: runningBalance,
    transactions: result
  };
}

async function getTownBalanceOnDate(townName, date) {
  const ledger = await getMoneyLedger({ townName });
  const targetDate = String(date || '').trim();
  const upToDate = ledger.filter(row => {
    const rDate = String(row.Date || row.Created_At || '').slice(0, 10);
    return rDate <= targetDate;
  });

  const totalReceived = upToDate
    .filter(row => String(row.Direction || '').toLowerCase() === 'income')
    .reduce((sum, row) => sum + (parseFloat(row.Amount) || 0), 0);

  const totalExpenses = upToDate
    .filter(row => String(row.Direction || '').toLowerCase() === 'expense')
    .reduce((sum, row) => sum + (parseFloat(row.Amount) || 0), 0);

  return {
    cashBalance: totalReceived - totalExpenses,
    totalReceived,
    totalExpenses,
  };
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
  backfillLedgerReceipts,
  backfillMoneyLedger,
  getBankAccountTransactions,
  getTownBalanceOnDate,
};
