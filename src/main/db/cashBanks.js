const path = require('path');
const ExcelJS = require('exceljs');
const {
  getGlobalsPath,
  readExcelFile,
  appendToExcel,
  updateExcelRow,
  ensureSheetColumns,
  generateId,
  withFileWriteLock,
  writeWorkbookAtomic,
  syncMirrorsForFile,
} = require('./core');
const { getMoneyLedger, recordMoneyEvent, refreshTownFinancialSummary } = require('./moneyLedger');
const { parseMoney } = require('./moneyUtils');

const FILE_NAME = 'Cash_Bank_Accounts.xlsx';
const COLUMNS = [
  'Account_ID','Town_Name','Account_Name','Account_Type','Opening_Balance',
  'Status','Created_At','Updated_At','Sync_Status'
];

function filePath() {
  return path.join(getGlobalsPath(), FILE_NAME);
}

function nowIso() {
  return new Date().toISOString();
}

function money(value) {
  return parseMoney(value);
}

async function ensureCashBankFile() {
  const fp = filePath();
  const fs = require('fs');
  if (!fs.existsSync(fp)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(COLUMNS.map((c) => c.replace(/_/g, ' ')));
    sheet.addRow(COLUMNS);
    sheet.getRow(2).hidden = true;
    COLUMNS.forEach((c, i) => { sheet.getColumn(i + 1).width = Math.max(16, Math.min(34, c.length + 6)); });
    await withFileWriteLock(fp, async () => {
      await writeWorkbookAtomic(fp, workbook);
      syncMirrorsForFile(fp);
    });
  } else {
    await ensureSheetColumns(fp, 'Data', COLUMNS);
  }
  return fp;
}

function cashAccount(townName = '') {
  const now = nowIso();
  return {
    Account_ID: 'cash-in-hand',
    Town_Name: townName || '',
    Account_Name: 'Cash in Hand',
    Account_Type: 'cash',
    Opening_Balance: 0,
    Status: 'active',
    Created_At: now,
    Updated_At: now,
    Sync_Status: 'local',
  };
}

async function getRawAccounts(townName = '') {
  const fp = await ensureCashBankFile();
  const rows = await readExcelFile(fp, 'Data').catch(() => []);
  const targetTownLower = String(townName || '').trim().toLowerCase();
  return rows.filter((row) => !townName || String(row.Town_Name || '').trim().toLowerCase() === targetTownLower);
}

async function getPaymentAccounts(townName = '') {
  const raw = await getRawAccounts(townName);
  const accounts = [cashAccount(townName), ...raw.filter((row) => String(row.Account_ID || '') !== 'cash-in-hand')];
  const ledger = await getMoneyLedger({ townName });
  return accounts.map((account) => {
    const id = String(account.Account_ID || '').trim();
    const type = String(account.Account_Type || '').toLowerCase() === 'bank' ? 'bank' : 'cash';
    const related = ledger.filter((row) => {
      const rowId = String(row.Payment_Account_ID || '').trim() || 'cash-in-hand';
      const rowType = String(row.Payment_Account_Type || '').toLowerCase() || 'cash';
      if (id === 'cash-in-hand') return rowId === 'cash-in-hand' || (!row.Payment_Account_ID && rowType === 'cash');
      return rowId === id;
    });
    const totalCredit = related
      .filter((row) => String(row.Direction || '').toLowerCase() === 'income' && String(row.Source_Type || '').toLowerCase() !== 'bank_opening')
      .reduce((sum, row) => sum + money(row.Amount), 0);
    const totalDebit = related
      .filter((row) => String(row.Direction || '').toLowerCase() === 'expense')
      .reduce((sum, row) => sum + money(row.Amount), 0);
    const opening = money(account.Opening_Balance);
    return {
      ...account,
      Account_Type: type,
      Total_Credit: totalCredit,
      Total_Debit: totalDebit,
      Current_Balance: opening + totalCredit - totalDebit,
      Is_Default: id === 'cash-in-hand' ? 'Yes' : 'No',
    };
  });
}

async function addBankAccount(data = {}) {
  const townName = String(data.Town_Name || data.townName || '').trim();
  const accountName = String(data.Account_Name || data.accountName || '').trim();
  if (!townName) throw new Error('Town name is required');
  if (!accountName) throw new Error('Bank/account name is required');
  const fp = await ensureCashBankFile();
  const rows = await readExcelFile(fp, 'Data').catch(() => []);
  const exists = rows.find((row) =>
    String(row.Town_Name || '').trim().toLowerCase() === townName.toLowerCase() &&
    String(row.Account_Name || '').trim().toLowerCase() === accountName.toLowerCase() &&
    String(row.Status || 'active').toLowerCase() !== 'archived'
  );
  if (exists) throw new Error('This bank account already exists for this town');
  const now = nowIso();
  const row = {
    Account_ID: data.Account_ID || data.accountId || generateId(),
    Town_Name: townName,
    Account_Name: accountName,
    Account_Type: 'bank',
    Opening_Balance: money(data.Opening_Balance || data.openingBalance),
    Status: 'active',
    Created_At: now,
    Updated_At: now,
    Sync_Status: 'pending',
  };
  await appendToExcel(fp, 'Data', row);

  if (data.IncludeInTownBalance && row.Opening_Balance > 0) {
    try {
      await recordMoneyEvent({
        townName: row.Town_Name,
        direction: 'income',
        amount: row.Opening_Balance,
        sourceType: 'bank_opening',
        sourceId: row.Account_ID,
        paymentAccountId: row.Account_ID,
        paymentAccountType: row.Account_Type,
        description: `Opening balance added for ${row.Account_Name}`,
        date: now.split('T')[0]
      });
      await refreshTownFinancialSummary(row.Town_Name);
    } catch (e) {
      console.error('Failed to record opening balance in money ledger:', e);
    }
  }

  return row;
}

async function updateBankAccount(accountId, updates = {}) {
  const id = String(accountId || '').trim();
  if (!id) throw new Error('Account ID is required');
  if (id === 'cash-in-hand') throw new Error('Cash in Hand cannot be edited');
  const fp = await ensureCashBankFile();
  const rows = await readExcelFile(fp, 'Data').catch(() => []);
  const row = rows.find((item) => String(item.Account_ID || '') === id);
  if (!row?._rowNumber) throw new Error('Bank account not found');
  const next = {
    ...(updates.Account_Name || updates.accountName ? { Account_Name: String(updates.Account_Name || updates.accountName).trim() } : {}),
    ...(updates.Status || updates.status ? { Status: String(updates.Status || updates.status).trim() } : {}),
    Updated_At: nowIso(),
    Sync_Status: 'pending',
  };
  if (updates.Opening_Balance !== undefined || updates.openingBalance !== undefined) {
    next.Opening_Balance = money(updates.Opening_Balance ?? updates.openingBalance);
  }
  await updateExcelRow(fp, 'Data', row._rowNumber, next);
  return { ...row, ...next };
}

module.exports = {
  FILE_NAME,
  COLUMNS,
  ensureCashBankFile,
  getPaymentAccounts,
  addBankAccount,
  updateBankAccount,
};
