const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { getGlobalsPath, readExcelFile, appendToExcel, deleteExcelRow, generateId, withFileWriteLock, writeWorkbookAtomic, getHeaderKeys, ensureSheetColumns } = require('./core');
const { updateTownFinancials } = require('./properties');
const { recordMoneyEvent } = require('./moneyLedger');

const DAILY_ENTRIES_COLUMNS = ['Entry_ID', 'Date', 'Time', 'Type', 'Description', 'Amount', 'Town_Name', 'Income_Type', 'Category', 'Subcategory', 'Property_ID', 'Installment_ID', 'Property_Details', 'Installment_Details', 'Reference', 'Created_By', 'Review_Status'];

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
  
  return rows.filter(r => {
    const matchDate = !date || String(r.Date) === String(date);
    const matchTown = !townName || String(r.Town_Name) === String(townName);
    return matchDate && matchTown;
  });
}

async function addDailyEntry(data) {
  const { date, time, type, description, amount, townName, incomeType, category, subcategory, propertyId, installmentId, propertyDetails, installmentDetails, entryId, reference, createdBy, reviewStatus } = data;
  
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
    Date: date || new Date().toISOString().split('T')[0],
    Time: time || new Date().toTimeString().split(' ')[0].substring(0, 5),
    Type: type || 'Income',
    Description: description || '',
    Amount: parseFloat(amount) || 0,
    Town_Name: townName || '',
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
  };
  
  await appendToExcel(filePath, 'Data', newEntry);
  const review = String(newEntry.Review_Status || 'approved').toLowerCase();
  const normalizedCategory = String(newEntry.Category || '').toLowerCase();
  const moduleBacked = normalizedCategory.includes('investor') ||
    normalizedCategory.includes('construction') ||
    normalizedCategory.includes('commission');
  if (!moduleBacked && review !== 'pending' && review !== 'rejected' && newEntry.Amount > 0) {
    await recordMoneyEvent({
      sourceType: 'daily_entry',
      sourceId: newEntry.Entry_ID,
      direction: String(newEntry.Type || '').toLowerCase() === 'expense' ? 'expense' : 'income',
      amount: newEntry.Amount,
      townName: newEntry.Town_Name,
      date: newEntry.Date,
      partyName: newEntry.Created_By || '',
      description: newEntry.Description || newEntry.Category || 'Daily entry',
      receiptNumber: '',
      createdBy: newEntry.Created_By || 'System',
      status: 'approved',
    });
  }

  // Also update town financials: record income in All_Sales, expense in All_Expenses
  if (townName && amount && parseFloat(amount) > 0) {
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
        console.log('Adding daily expense to All_Expenses:', expData);
        await appendToExcel(expensesPath, 'Data', expData);
      } else if (type === 'Income') {
        const salesPath = path.join(globalsPath, 'All_Sales.xlsx');
        await ensureSheetColumns(salesPath, 'Data', ['Daily_Entry_ID']);
        const saleData = {
          Sale_ID: newEntry.Entry_ID,
          Daily_Entry_ID: newEntry.Entry_ID,
          Plot_Shop_Number: '',
          Type: 'Daily Income',
          Town_Name: townName,
          Customer_Name: description || 'Daily Income',
          CNIC: '',
          Phone_Number: '',
          Sell_Date: date || new Date().toISOString().split('T')[0],
          Total_Amount_PKR: parseFloat(amount),
          Advance_Amount_PKR: 0,
          Total_Installments: 0,
          Total_Period_Months: 0,
          Gap_Days: 0,
          Gap_Label: '',
          Monthly_Installment: 0,
          Received_Amount: parseFloat(amount),
          Remaining_Amount: 0,
          Agent_Name: '',
          Commission_Rate: 0,
          Commission_Amount: 0,
          Company_Income: parseFloat(amount),
          Expense_Total: 0,
          Profit_Loss: parseFloat(amount),
          Receipt_Number: '',
          File_Status: '',
          Status: 'Sold',
        };
        console.log('Adding daily income to All_Sales:', saleData);
        await appendToExcel(salesPath, 'Data', saleData);
      }
      // Update town financials
      console.log('Updating town financials for:', townName);
      await updateTownFinancials(townName);
      console.log('Town financials updated successfully');
    } catch (e) {
      console.error('Failed to update town financials from daily entry:', e);
    }
  } else {
    console.log('Skipping financial update - condition not met:', { townName, amount, type });
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
