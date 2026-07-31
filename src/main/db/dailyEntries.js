const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { getGlobalsPath, readExcelFile, appendToExcel, deleteExcelRow, generateId, withFileWriteLock, writeWorkbookAtomic, getHeaderKeys, ensureSheetColumns, normalizeDate } = require('./core');
const { updateTownFinancials } = require('./properties');
const { recordMoneyEvent } = require('./moneyLedger');

const DAILY_ENTRIES_COLUMNS = ['Entry_ID', 'Date', 'Time', 'Type', 'Description', 'Amount', 'Town_Name', 'Account_Name', 'Account_Type', 'Income_Type', 'Category', 'Subcategory', 'Property_ID', 'Installment_ID', 'Property_Details', 'Installment_Details', 'Reference', 'Created_By', 'Review_Status', 'Skip_Ledger', 'Payment_Account_ID', 'Payment_Account_Name', 'Payment_Account_Type'];

function getDailyEntriesPath() {
  return path.join(getGlobalsPath(), 'Daily_Entries.xlsx');
}

async function ensureDailyEntriesFile() {
  const filePath = getDailyEntriesPath();
  if (!fs.existsSync(filePath)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    
    const toFriendlyHeader = (key) => String(key || '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');

    sheet.addRow(DAILY_ENTRIES_COLUMNS.map(toFriendlyHeader));
    sheet.addRow(DAILY_ENTRIES_COLUMNS);
    sheet.getRow(2).hidden = true;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FF111827' }, size: 12 };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    DAILY_ENTRIES_COLUMNS.forEach((c, idx) => {
      sheet.getColumn(idx + 1).width = 18;
    });

    await writeWorkbookAtomic(filePath, workbook);
  }
}

async function getDailyEntries({ date, townName }) {
  await ensureDailyEntriesFile();
  const filePath = getDailyEntriesPath();
  const rows = await readExcelFile(filePath, 'Data');
  
  const normalizedQueryDate = normalizeDate(date);
  const normalizedQueryTown = townName ? String(townName).trim().toLowerCase() : '';

  return rows.filter(r => {
    const matchDate = !normalizedQueryDate || normalizeDate(r.Date) === normalizedQueryDate;
    const matchTown = !normalizedQueryTown || String(r.Town_Name || '').trim().toLowerCase() === normalizedQueryTown;
    return matchDate && matchTown;
  });
}

async function addDailyEntry(data) {
  const { date, time, type, description, amount, townName, accountName, accountType, incomeType, category, subcategory, propertyId, installmentId, propertyDetails, installmentDetails, entryId, reference, createdBy, reviewStatus, skipLedger } = data;
  
  await ensureDailyEntriesFile();
  const filePath = getDailyEntriesPath();
  await ensureSheetColumns(filePath, 'Data', DAILY_ENTRIES_COLUMNS);

  const rows = await readExcelFile(filePath, 'Data');
  const stableEntryId = entryId || data.Entry_ID || (reference ? `APP-${String(reference).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}` : generateId());
  const duplicate = rows.find((row) => (
    String(row.Entry_ID || '') === String(stableEntryId) ||
    (reference && String(row.Reference || '') === String(reference))
  ));
  if (duplicate) return { ...duplicate, duplicate: true };
  
  const newEntry = {
    Entry_ID: stableEntryId,
    Date: normalizeDate(date || new Date()),
    Time: time || new Date().toTimeString().split(' ')[0].substring(0, 5),
    Type: type || 'Income',
    Description: description || '',
    Amount: parseFloat(amount) || 0,
    Town_Name: townName || '',
    Account_Name: accountName || data.Account_Name || '',
    Account_Type: accountType || data.Account_Type || '',
    Income_Type: incomeType || '',
    Category: category || '',
    Subcategory: subcategory || '',
    Property_ID: propertyId || '',
    Installment_ID: installmentId || '',
    Property_Details: propertyDetails ? JSON.stringify(propertyDetails) : '',
    Installment_Details: installmentDetails ? JSON.stringify(installmentDetails) : '',
    Reference: reference || '',
    Created_By: createdBy || '',
    Review_Status: reviewStatus || '',
    Skip_Ledger: skipLedger || data.Skip_Ledger || '',
    Payment_Account_ID: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
    Payment_Account_Name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    Payment_Account_Type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
  };
  
  await appendToExcel(filePath, 'Data', newEntry);
  const review = String(newEntry.Review_Status || 'approved').toLowerCase();
  const skipLedgerWrite = String(newEntry.Skip_Ledger || '').toLowerCase() === 'yes';
  if (!skipLedgerWrite && review !== 'pending' && review !== 'rejected' && newEntry.Amount > 0) {
    await recordMoneyEvent({
      sourceType: 'daily_entry',
      sourceId: newEntry.Entry_ID,
      direction: String(newEntry.Type || '').toLowerCase() === 'expense' ? 'expense' : 'income',
      amount: newEntry.Amount,
      townName: newEntry.Town_Name,
      date: newEntry.Date,
      partyName: newEntry.Account_Name || newEntry.Created_By || '',
      description: newEntry.Description || newEntry.Category || 'Daily entry',
      receiptNumber: '',
      createdBy: newEntry.Created_By || 'System',
      status: 'approved',
      paymentAccountId: newEntry.Payment_Account_ID,
      paymentAccountName: newEntry.Payment_Account_Name,
      paymentAccountType: newEntry.Payment_Account_Type,
    });
  }

  // Phase 3: Atomic writes for Employee & Constructor Balance
  if (String(newEntry.Type || '').toLowerCase() === 'expense' && newEntry.Account_Name && newEntry.Town_Name && !skipLedgerWrite && review !== 'pending' && review !== 'rejected') {
    try {
      const { updateEmployeePaidAmount, updateConstructorPaidAmount } = require('./businessExtras');
      const cat = String(newEntry.Category || '').toLowerCase();
      const acctType = String(newEntry.Account_Type || '').toLowerCase();
      
      const paymentAccount = {
        paymentAccountId: newEntry.Payment_Account_ID,
        paymentAccountName: newEntry.Payment_Account_Name,
        paymentAccountType: newEntry.Payment_Account_Type,
      };
      
      if (acctType === 'employee' || cat.includes('salary') || cat.includes('employee') || cat.includes('labour')) {
        await updateEmployeePaidAmount(newEntry.Town_Name, newEntry.Account_Name, newEntry.Amount, paymentAccount);
      } else if (acctType === 'constructor' || cat.includes('construction') || cat.includes('builder')) {
        await updateConstructorPaidAmount(newEntry.Town_Name, newEntry.Account_Name, newEntry.Amount, paymentAccount);
      }
    } catch (e) {
      console.error('Failed to update balance from daily entry:', e);
    }
  }

  // FIX: Only mirror EXPENSE entries into All_Expenses (for backfill compatibility).
  // NEVER mirror Income entries into All_Sales — that caused double-counting bugs:
  // backfillMoneyLedger would re-process All_Sales and create a 2nd ledger entry
  // with sourceType=sale_advance (different key from daily_entry), bypassing deduplication.
  if (!skipLedgerWrite && townName && amount && parseFloat(amount) > 0) {
    try {
      const globalsPath = getGlobalsPath();
      if (type === 'Expense') {
        const expensesPath = path.join(globalsPath, 'All_Expenses.xlsx');
        await ensureSheetColumns(expensesPath, 'Data', ['Daily_Entry_ID']);
        const expData = {
          Expense_ID: newEntry.Entry_ID,
          Daily_Entry_ID: newEntry.Entry_ID,
          Town_Name: townName,
          Expense_Name: description || 'Daily Expense',
          Amount_PKR: parseFloat(amount),
          Description: description || '',
          Category: category || 'Daily',
          Date: date || new Date().toISOString().split('T')[0],
          Added_By: 'Employee',
        };
        await appendToExcel(expensesPath, 'Data', expData);
      }
      // Income entries are already recorded in Money_Ledger via recordMoneyEvent above.
      // DO NOT add them to All_Sales — backfillMoneyLedger scans All_Sales and would
      // create a duplicate ledger entry with sourceType=sale_advance.

      // Update town financials (refresh from Money_Ledger — source of truth)
      await updateTownFinancials(townName);
    } catch (e) {
      console.error('Failed to update town financials from daily entry:', e);
    }
  }

  return newEntry;
}

async function deleteMatchingMirrorRows(filePath, predicate) {
  const rows = await readExcelFile(filePath, 'Data');
  const rowNumbers = rows
    .filter(predicate)
    .map(r => r._rowNumber)
    .filter(Boolean)
    .sort((a, b) => b - a);

  for (const rowNumber of rowNumbers) {
    await deleteExcelRow(filePath, 'Data', rowNumber);
  }
}

async function deleteDailyEntry({ entryId }) {
  await ensureDailyEntriesFile();
  const filePath = getDailyEntriesPath();
  const rows = await readExcelFile(filePath, 'Data');
  const match = rows.find(r => String(r.Entry_ID) === String(entryId));
  if (!match) {
    throw new Error('Entry not found');
  }
  
  await deleteExcelRow(filePath, 'Data', match._rowNumber);

  const globalsPath = getGlobalsPath();
  const normalizedType = String(match.Type || '').toLowerCase();
  const amount = parseFloat(match.Amount) || 0;
  const date = String(match.Date || '');
  const town = String(match.Town_Name || '');
  const description = String(match.Description || '');

  try {
    if (normalizedType === 'expense') {
      await deleteMatchingMirrorRows(path.join(globalsPath, 'All_Expenses.xlsx'), (e) => {
        const linked = String(e.Daily_Entry_ID || e.Expense_ID || '') === String(entryId);
        const legacyMatch =
          String(e.Town_Name || '') === town &&
          String(e.Date || '') === date &&
          (parseFloat(e.Amount_PKR) || 0) === amount &&
          String(e.Category || '').toLowerCase() === String(match.Category || 'Daily').toLowerCase() &&
          String(e.Expense_Name || '') === (description || 'Daily Expense');
        return linked || legacyMatch;
      });
    } else if (normalizedType === 'income') {
      await deleteMatchingMirrorRows(path.join(globalsPath, 'All_Sales.xlsx'), (s) => {
        const linked = String(s.Daily_Entry_ID || s.Sale_ID || '') === String(entryId);
        const legacyMatch =
          String(s.Type || '').toLowerCase() === 'daily income' &&
          String(s.Town_Name || '') === town &&
          String(s.Sell_Date || '') === date &&
          (parseFloat(s.Total_Amount_PKR) || 0) === amount &&
          (!description || String(s.Customer_Name || '') === description || String(s.Customer_Name || '') === 'Daily Income');
        return linked || legacyMatch;
      });
    }

    const skipLedgerWrite = String(match.Skip_Ledger || '').toLowerCase() === 'yes';
    const reviewStatus = String(match.Review_Status || '').toLowerCase();
    
    // Reverse the ledger entry if it was recorded
    if (!skipLedgerWrite && reviewStatus !== 'rejected' && amount > 0) {
      const { recordMoneyEvent } = require('./moneyLedger');
      await recordMoneyEvent({
        sourceType: 'daily_entry',
        sourceId: `REVERSE-${entryId}`,
        direction: normalizedType === 'income' ? 'expense' : 'income',
        amount: amount,
        townName: town,
        date: new Date().toISOString().split('T')[0],
        partyName: match.Account_Name || 'System',
        description: `Daily Entry Deleted (Reversal): ${description || 'Entry ' + entryId}`,
        receiptNumber: match.Reference || '',
        paymentAccountId: match.Payment_Account_ID || 'cash-in-hand',
        paymentAccountName: match.Payment_Account_Name || 'Cash in Hand',
        paymentAccountType: match.Payment_Account_Type || 'cash',
        skipLedger: 'no'
      });
    }

    if (town) await updateTownFinancials(town);
  } catch (e) {
    console.error('Failed to clean mirrored daily entry rows:', e);
  }

  return { success: true };
}

module.exports = {
  getDailyEntries,
  addDailyEntry,
  deleteDailyEntry,
};
