const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { getTownsPath, getGlobalsPath, readExcelFile, appendToExcel, generateId, updateExcelRow, deleteExcelRow, syncMirrorsForFile, getHeaderKeys, withFileWriteLock, writeWorkbookAtomic } = require('./core');
const { recordMoneyEvent } = require('./moneyLedger');

const TOWN_COLUMNS = ['Town_Name','Total_Plots','Total_Shops','Total_Income_PKR','Total_Expenses_PKR','Profit_Loss','Commission_Rate','Status','Location_Text','Location_Lat','Location_Lng'];

async function recomputeCeoLimitFlags(townName) {
  if (!townName) return;
  const { updateTownFinancials } = require('./properties');
  const ceoPath = path.join(getGlobalsPath(), 'CEO_Expenses.xlsx');
  if (!fs.existsSync(ceoPath)) return;

  const town = await getTownDetails(townName);
  const townIncome = town ? (parseFloat(town.Total_Income_PKR) || 0) : 0;
  const expenseLimit = townIncome * 0.10;

  const rows = await readExcelFile(ceoPath, 'Data');
  const townRows = rows.filter(e => e.Town_Name === townName);
  const total = townRows.reduce((s, e) => s + (parseFloat(e.Amount_PKR) || 0), 0);
  const isOver = total > expenseLimit;

  for (const r of townRows) {
    await updateExcelRow(ceoPath, 'Data', r._rowNumber, {
      Town_Income: townIncome,
      Expense_Limit: expenseLimit,
      Is_Over_Limit: isOver ? 'Yes' : 'No',
    });
  }

  await updateTownFinancials(townName);
  syncMirrorsForFile(ceoPath);
}

async function addTown(data) {
  const { Town_Name, Total_Plots, Total_Shops, Commission_Rate } = data;
  const filePath = path.join(getTownsPath(), `${Town_Name}.xlsx`);
  if (fs.existsSync(filePath)) throw new Error(`Town "${Town_Name}" already exists`);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  const toFriendlyHeader = (key) => String(key || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');

  sheet.addRow(TOWN_COLUMNS.map(toFriendlyHeader));
  sheet.addRow(TOWN_COLUMNS);
  sheet.getRow(2).hidden = true;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FF111827' }, size: 12 };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  TOWN_COLUMNS.forEach((c, idx) => { sheet.getColumn(idx + 1).width = Math.max(14, Math.min(28, toFriendlyHeader(c).length + 8)); });
  const rowData = { Town_Name, Total_Plots: parseInt(Total_Plots)||0, Total_Shops: parseInt(Total_Shops)||0, Total_Income_PKR: 0, Total_Expenses_PKR: 0, Profit_Loss: 0, Commission_Rate: parseFloat(Commission_Rate)||0, Status: data.Status || 'Active', Location_Text: data.Location_Text || '', Location_Lat: data.Location_Lat || '', Location_Lng: data.Location_Lng || '' };
  sheet.addRow(TOWN_COLUMNS.map(c => rowData[c]));
  await withFileWriteLock(filePath, async () => {
    await writeWorkbookAtomic(filePath, workbook);
    syncMirrorsForFile(filePath);
  });
  return rowData;
}

async function getTowns() {
  const townsPath = getTownsPath();
  if (!fs.existsSync(townsPath)) return [];
  const files = fs.readdirSync(townsPath).filter(f => f.endsWith('.xlsx'));
  const towns = [];
  for (const file of files) {
    const rows = await readExcelFile(path.join(townsPath, file), 'Data');
    if (rows.length > 0) {
      const row = rows[0];
      towns.push({
        ...row,
        Location_Text: row.Location_Text || '',
        Location_Lat: parseFloat(row.Location_Lat) || null,
        Location_Lng: parseFloat(row.Location_Lng) || null,
      });
    }
  }
  return towns;
}

async function getTownDetails(townName) {
  const filePath = path.join(getTownsPath(), `${townName}.xlsx`);
  if (!fs.existsSync(filePath)) return null;
  const rows = await readExcelFile(filePath, 'Data');
  return rows.length > 0 ? rows[0] : null;
}

async function getTownPrices(townName) {
  const filePath = path.join(getGlobalsPath(), 'Town_Prices.xlsx');
  if (!fs.existsSync(filePath)) return null;
  const rows = await readExcelFile(filePath, 'Data');
  const townRow = rows.find(r => r.Town_Name === townName);
  if (!townRow) return null;
  return {
    ...townRow,
    Road_30_Residential: townRow.Road_30_Residential || townRow.Road_30 || '',
    Road_30_Commercial: townRow.Road_30_Commercial || townRow.Road_30 || '',
    Road_40_Residential: townRow.Road_40_Residential || townRow.Road_40 || '',
    Road_40_Commercial: townRow.Road_40_Commercial || townRow.Road_40 || '',
    Road_50_Residential: townRow.Road_50_Residential || townRow.Road_50 || '',
    Road_50_Commercial: townRow.Road_50_Commercial || townRow.Road_50 || '',
    Road_60_Residential: townRow.Road_60_Residential || townRow.Road_60 || '',
    Road_60_Commercial: townRow.Road_60_Commercial || townRow.Road_60 || '',
    Road_80_Residential: townRow.Road_80_Residential || townRow.Road_80 || '',
    Road_80_Commercial: townRow.Road_80_Commercial || townRow.Road_80 || '',
    Custom_Residential: townRow.Custom_Residential || townRow.Custom_Price || '',
    Custom_Commercial: townRow.Custom_Commercial || townRow.Custom_Price || '',
  };
}

async function setTownPrices(townName, prices) {
  const filePath = path.join(getGlobalsPath(), 'Town_Prices.xlsx');
  const COLUMNS = [
    'Town_Name', 
    'Road_30_Residential', 'Road_30_Commercial',
    'Road_40_Residential', 'Road_40_Commercial',
    'Road_50_Residential', 'Road_50_Commercial',
    'Road_60_Residential', 'Road_60_Commercial',
    'Road_80_Residential', 'Road_80_Commercial',
    'Custom_Name', 'Custom_Residential', 'Custom_Commercial',
    'Road_30', 'Road_40', 'Road_50', 'Road_60', 'Road_80', 'Custom_Price',
    'Plot_Price', 'Residential_Plot_Price', 'Commercial_Plot_Price', 'Residential_Shop_Price', 'Commercial_Shop_Price'
  ];
  
  if (!fs.existsSync(filePath)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(COLUMNS);
    await withFileWriteLock(filePath, async () => {
      await writeWorkbookAtomic(filePath, workbook);
      syncMirrorsForFile(filePath);
    });
  }

  const rows = await readExcelFile(filePath, 'Data');
  const existingIndex = rows.findIndex(r => r.Town_Name === townName);
  
  const updatedData = {
    Town_Name: townName,
    Road_30_Residential: prices.Road_30_Residential || '',
    Road_30_Commercial: prices.Road_30_Commercial || '',
    Road_40_Residential: prices.Road_40_Residential || '',
    Road_40_Commercial: prices.Road_40_Commercial || '',
    Road_50_Residential: prices.Road_50_Residential || '',
    Road_50_Commercial: prices.Road_50_Commercial || '',
    Road_60_Residential: prices.Road_60_Residential || '',
    Road_60_Commercial: prices.Road_60_Commercial || '',
    Road_80_Residential: prices.Road_80_Residential || '',
    Road_80_Commercial: prices.Road_80_Commercial || '',
    Custom_Name: prices.Custom_Name || '',
    Custom_Residential: prices.Custom_Residential || '',
    Custom_Commercial: prices.Custom_Commercial || '',
    Road_30: prices.Road_30_Residential || '',
    Road_40: prices.Road_40_Residential || '',
    Road_50: prices.Road_50_Residential || '',
    Road_60: prices.Road_60_Residential || '',
    Road_80: prices.Road_80_Residential || '',
    Custom_Price: prices.Custom_Residential || '',
    Plot_Price: prices.Plot_Price || prices.Residential_Plot_Price || '',
    Residential_Plot_Price: prices.Residential_Plot_Price || prices.Plot_Price || '',
    Commercial_Plot_Price: prices.Commercial_Plot_Price || '',
    Residential_Shop_Price: prices.Residential_Shop_Price || '',
    Commercial_Shop_Price: prices.Commercial_Shop_Price || ''
  };

  if (existingIndex >= 0) {
    await updateExcelRow(filePath, 'Data', rows[existingIndex]._rowNumber, updatedData);
  } else {
    await appendToExcel(filePath, 'Data', updatedData);
  }

  return { success: true };
}

async function addCeoExpense(data) {
  const { Town_Name, Expense_Name, Amount_PKR, Description, Category } = data;
  const town = await getTownDetails(Town_Name);
  const townIncome = town ? (parseFloat(town.Total_Income_PKR)||0) : 0;
  const expenseLimit = townIncome * 0.10;
  const ceoExpenses = await readExcelFile(path.join(getGlobalsPath(), 'CEO_Expenses.xlsx'), 'Data');
  const townCeoExp = ceoExpenses.filter(e => e.Town_Name === Town_Name);
  const totalExisting = townCeoExp.reduce((s,e) => s+(parseFloat(e.Amount_PKR)||0), 0);
  const newTotal = totalExisting + (parseFloat(Amount_PKR)||0);
  const isOverLimit = newTotal > expenseLimit;

  const expenseData = { Expense_ID: generateId(), Town_Name, Expense_Name, Amount_PKR: parseFloat(Amount_PKR)||0, Description: Description||'', Category: Category||'General', Date: new Date().toISOString().split('T')[0], Town_Income: townIncome, Expense_Limit: expenseLimit, Is_Over_Limit: isOverLimit?'Yes':'No' };
  await appendToExcel(path.join(getGlobalsPath(), 'CEO_Expenses.xlsx'), 'Data', expenseData);

  const allExpData = { Expense_ID: expenseData.Expense_ID, Town_Name, Expense_Name: `CEO: ${Expense_Name}`, Amount_PKR: parseFloat(Amount_PKR)||0, Description: Description||'', Category: Category||'CEO', Date: expenseData.Date, Added_By: 'CEO' };
  await appendToExcel(path.join(getGlobalsPath(), 'All_Expenses.xlsx'), 'Data', allExpData);
  await recordMoneyEvent({
    sourceType: 'ceo_expense',
    sourceId: expenseData.Expense_ID,
    direction: 'expense',
    amount: expenseData.Amount_PKR,
    townName: Town_Name,
    date: expenseData.Date,
    partyName: 'CEO',
    description: Expense_Name,
    createdBy: 'CEO',
    paymentAccountId: data.paymentAccountId || 'cash-in-hand',
    paymentAccountName: data.paymentAccountName || 'Cash in Hand',
    paymentAccountType: data.paymentAccountType || 'cash',
  });

  if (isOverLimit) {
    await appendToExcel(path.join(getGlobalsPath(), 'Notifications_Log.xlsx'), 'Data', { Notification_ID: generateId(), Type: 'Warning', Message: `CEO Expenses for ${Town_Name} exceeded 10% limit! Total: PKR ${newTotal}, Limit: PKR ${expenseLimit}`, Plot_Shop_Number: '', Town_Name, Customer_Name: '', Due_Date: '', Created_Date: new Date().toISOString().split('T')[0], Status: 'Active', Dismissed: 'No' });
  }

  const { updateTownFinancials } = require('./properties');
  await updateTownFinancials(Town_Name);
  await recomputeCeoLimitFlags(Town_Name);
  return { ...expenseData, isOverLimit, totalCeoExpenses: newTotal, expenseLimit };
}

async function deleteCeoExpense(expenseId) {
  const filePath = path.join(getGlobalsPath(), 'CEO_Expenses.xlsx');
  if (!fs.existsSync(filePath)) return { error: 'No expenses file found' };
  const rows = await readExcelFile(filePath, 'Data');
  const item = rows.find(r => String(r.Expense_ID) === String(expenseId));
  if (!item) return { error: 'Expense not found' };
  await deleteExcelRow(filePath, 'Data', item._rowNumber);

  // Also remove from All_Expenses (it uses same Expense_ID)
  const allExpPath = path.join(getGlobalsPath(), 'All_Expenses.xlsx');
  if (fs.existsSync(allExpPath)) {
    const all = await readExcelFile(allExpPath, 'Data');
    const match = all.find(e => String(e.Expense_ID) === String(expenseId));
    if (match) {
      await deleteExcelRow(allExpPath, 'Data', match._rowNumber);
    }
  }

  await recomputeCeoLimitFlags(item.Town_Name);

  const ledgerPath = path.join(getGlobalsPath(), 'Money_Ledger.xlsx');
  if (require('fs').existsSync(ledgerPath)) {
    const ledger = await readExcelFile(ledgerPath, 'Data');
    const ledgerMatch = ledger.find(r => 
      String(r.Source_Type) === 'ceo_expense' && 
      String(r.Source_ID) === String(expenseId)
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

async function editCeoExpense(data) {
  const { Expense_ID, Expense_Name, Amount_PKR, Description, Category } = data;
  const filePath = path.join(getGlobalsPath(), 'CEO_Expenses.xlsx');
  if (!fs.existsSync(filePath)) return { error: 'No expenses file found' };
  const rows = await readExcelFile(filePath, 'Data');
  const item = rows.find(r => String(r.Expense_ID) === String(Expense_ID));
  if (!item) return { error: 'Expense not found' };
  const updates = {};
  if (Expense_Name) updates.Expense_Name = Expense_Name;
  if (Amount_PKR !== undefined) updates.Amount_PKR = parseFloat(Amount_PKR) || 0;
  if (Description !== undefined) updates.Description = Description;
  if (Category) updates.Category = Category;
  await updateExcelRow(filePath, 'Data', item._rowNumber, updates);

  // Mirror update into All_Expenses row (same Expense_ID)
  const allExpPath = path.join(getGlobalsPath(), 'All_Expenses.xlsx');
  if (fs.existsSync(allExpPath)) {
    const all = await readExcelFile(allExpPath, 'Data');
    const match = all.find(e => String(e.Expense_ID) === String(Expense_ID));
    if (match) {
      const allUpdates = {};
      if (Expense_Name) allUpdates.Expense_Name = `CEO: ${Expense_Name}`;
      if (Amount_PKR !== undefined) allUpdates.Amount_PKR = parseFloat(Amount_PKR) || 0;
      if (Description !== undefined) allUpdates.Description = Description;
      if (Category) allUpdates.Category = Category || 'CEO';
      await updateExcelRow(allExpPath, 'Data', match._rowNumber, allUpdates);
    }
  }

  await recomputeCeoLimitFlags(item.Town_Name);
  return { success: true };
}

async function updateTown(townName, data) {
  const filePath = path.join(getTownsPath(), `${townName}.xlsx`);
  if (!fs.existsSync(filePath)) throw new Error(`Town "${townName}" not found`);

  const allowed = ['Total_Plots','Total_Shops','Commission_Rate','Status','Location_Text','Location_Lat','Location_Lng'];
  const updates = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }
  if (Object.keys(updates).length === 0) return { success: true, noChanges: true };

  const rows = await readExcelFile(filePath, 'Data');
  if (rows.length === 0) throw new Error('No data row found');
  await updateExcelRow(filePath, 'Data', rows[0]._rowNumber, updates);
  syncMirrorsForFile(filePath);
  return { success: true };
}

async function deleteTown(townName) {
  const filePath = path.join(getTownsPath(), `${townName}.xlsx`);
  if (!fs.existsSync(filePath)) throw new Error(`Town "${townName}" not found`);
  fs.unlinkSync(filePath);
  syncMirrorsForFile(filePath);
  return { success: true };
}

module.exports = { addTown, getTowns, getTownDetails, getTownPrices, setTownPrices, addCeoExpense, deleteCeoExpense, editCeoExpense, updateTown, deleteTown, TOWN_COLUMNS };
