const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { getPropertiesPath, getTownsPath, getGlobalsPath, readExcelFile, appendToExcel, generateId, deleteExcelRow, syncMirrorsForFile, getHeaderKeys, withFileWriteLock, writeWorkbookAtomic, ensureSheetColumns } = require('./core');
const { recordMoneyEvent, getMoneySummary, backfillMoneyLedger } = require('./moneyLedger');

function safeFolderName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTownPropertiesDir(townName) {
  const base = getPropertiesPath();
  const townDir = path.join(base, safeFolderName(townName || ''));
  if (!fs.existsSync(townDir)) fs.mkdirSync(townDir, { recursive: true });
  return townDir;
}

function getLegacyPropertyPath(type, number, townName) {
  const prefix = type === 'Plot' ? 'Plot' : 'Shop';
  const fileName = `${prefix}_${number}_${townName}.xlsx`;
  return path.join(getPropertiesPath(), fileName);
}

function getPropertyPath(type, number, townName) {
  const prefix = type === 'Plot' ? 'Plot' : 'Shop';
  const fileName = `${prefix}_${number}_${townName}.xlsx`;
  // New layout: Properties/<TownName>/<fileName>
  return path.join(getTownPropertiesDir(townName), fileName);
}

async function upsertCommissionForSaleLocal(sale) {
  const amount = parseFloat(sale.Commission_Amount) || 0;
  const agent = String(sale.Agent_Name || '').trim();
  if (amount <= 0 || !agent) return;

  const commissionPath = path.join(getGlobalsPath(), 'Commissions.xlsx');
  await ensureSheetColumns(commissionPath, 'Data', ['Commission_ID','Sale_ID','Town_Name','Plot_Shop_Number','Agent_Name','Agent_Email','Commission_Amount','Paid_Amount','Remaining_Amount','Status','Paid_Date','Last_Paid_Date','Created_At']);
  const rows = await readExcelFile(commissionPath, 'Data');
  const saleId = sale.Sale_ID || `${sale.Type}|${sale.Plot_Shop_Number}|${sale.Town_Name}`;
  const exists = rows.some((r) => String(r.Sale_ID || r.Commission_ID || '') === String(saleId));
  if (exists) return;

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

const PLOT_COLUMNS = [
  'Plot_Number','Town_Name','Plot_Size','Plot_Marla','Length_Ft','Width_Ft','Area_Sqft','Per_Marla_Price','Total_Price','Owner_Name','Customer_Name','CNIC',
  'Phone_Number','Sell_Date','Expected_Amount_PKR','Deal_Amount_PKR','Discount_Amount_PKR','Total_Amount_PKR','Advance_Amount_PKR',
  'Total_Installments','Total_Period_Months','Gap_Days','Gap_Label','Monthly_Installment','Received_Amount',
  'Remaining_Amount','Agent_Name','Commission_Rate','Commission_Amount',
  'Expense_Total','Profit_Loss','Installment_Status','Resell_Status',
  'Resell_Amount','Receipt_Number','File_Status','File_Delivery_Image','Status',
  'Property_Category'
];

const SHOP_COLUMNS = [
  'Shop_Number','Town_Name','Shop_Size','Shop_Marla','Length_Ft','Width_Ft','Area_Sqft','Road_Type','Road_Key','Per_Marla_Price','Total_Price','Owner_Name','Customer_Name','CNIC',
  'Phone_Number','Sell_Date','Expected_Amount_PKR','Deal_Amount_PKR','Discount_Amount_PKR','Total_Amount_PKR','Advance_Amount_PKR',
  'Total_Installments','Total_Period_Months','Gap_Days','Gap_Label','Monthly_Installment','Received_Amount',
  'Remaining_Amount','Agent_Name','Commission_Rate','Commission_Amount',
  'Expense_Total','Profit_Loss','Installment_Status','Resell_Status',
  'Resell_Amount','Receipt_Number','File_Status','File_Delivery_Image','Status',
  'Property_Category'
];

async function createPropertyFile(type, number, townName, data) {
  const prefix = type === 'Plot' ? 'Plot' : 'Shop';
  const fileName = `${prefix}_${number}_${townName}.xlsx`;
  const filePath = getPropertyPath(type, number, townName);

  const workbook = new ExcelJS.Workbook();
  const sheetName = `${prefix}_Details`;
  const sheet = workbook.addWorksheet(sheetName);
  const columns = type === 'Plot' ? PLOT_COLUMNS : SHOP_COLUMNS;

  const toFriendlyHeader = (key) => String(key || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');

  // Row 1: friendly headers; Row 2: internal keys (hidden)
  sheet.addRow(columns.map(toFriendlyHeader));
  sheet.addRow(columns);
  sheet.getRow(2).hidden = true;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FF111827' }, size: 12 };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  columns.forEach((c, idx) => { sheet.getColumn(idx + 1).width = Math.max(14, Math.min(32, toFriendlyHeader(c).length + 8)); });

  const rowData = {};
  columns.forEach(c => { rowData[c] = data[c] || ''; });
  
  if (type === 'Plot') {
    rowData.Plot_Number = number;
  } else {
    rowData.Shop_Number = number;
  }
  rowData.Town_Name = townName;
  rowData.Status = data.Status || 'Available';
  rowData.Installment_Status = data.Installment_Status || '';
  rowData.Resell_Status = 'No';

  // Data row (row 3)
  sheet.addRow(columns.map(c => rowData[c]));

  await withFileWriteLock(filePath, async () => {
    await writeWorkbookAtomic(filePath, workbook);
    syncMirrorsForFile(filePath);
  });
  return rowData;
}

async function addPlot(data) {
  const { Plot_Number, Town_Name, Plot_Size, Plot_Marla, Length_Ft, Width_Ft, Area_Sqft, Per_Marla_Price, Total_Price, Owner_Name, Property_Category } = data;
  return await createPropertyFile('Plot', Plot_Number, Town_Name, {
    Plot_Number,
    Town_Name,
    Plot_Size: Plot_Size || '',
    Plot_Marla: Plot_Marla || '',
    Length_Ft: Length_Ft || '',
    Width_Ft: Width_Ft || '',
    Area_Sqft: Area_Sqft || '',
    Per_Marla_Price: Per_Marla_Price || '',
    Total_Price: Total_Price || '',
    Owner_Name: Owner_Name || '',
    Property_Category: Property_Category || 'Residential',
    Status: 'Available',
  });
}

async function addShop(data) {
  const { Shop_Number, Town_Name, Shop_Size, Shop_Marla, Length_Ft, Width_Ft, Area_Sqft, Road_Type, Road_Key, Per_Marla_Price, Total_Price, Owner_Name, Property_Category } = data;
  return await createPropertyFile('Shop', Shop_Number, Town_Name, {
    Shop_Number,
    Town_Name,
    Shop_Size: Shop_Size || '',
    Shop_Marla: Shop_Marla || '',
    Length_Ft: Length_Ft || '',
    Width_Ft: Width_Ft || '',
    Area_Sqft: Area_Sqft || '',
    Road_Type: Road_Type || '',
    Road_Key: Road_Key || '',
    Per_Marla_Price: Per_Marla_Price || '',
    Total_Price: Total_Price || '',
    Owner_Name: Owner_Name || '',
    Property_Category: Property_Category || 'Residential',
    Status: 'Available',
  });
}

async function getPropertyFile(type, number, townName) {
  const prefix = type === 'Plot' ? 'Plot' : 'Shop';
  const filePathNew = getPropertyPath(type, number, townName);
  const filePathLegacy = getLegacyPropertyPath(type, number, townName);

  const filePath = fs.existsSync(filePathNew) ? filePathNew : (fs.existsSync(filePathLegacy) ? filePathLegacy : null);
  if (!filePath) return null;

  const rows = await readExcelFile(filePath, `${prefix}_Details`);
  return rows.length > 0 ? rows[0] : null;
}

async function updatePropertyFile(type, number, townName, updates) {
  const prefix = type === 'Plot' ? 'Plot' : 'Shop';
  const filePathNew = getPropertyPath(type, number, townName);
  const filePathLegacy = getLegacyPropertyPath(type, number, townName);
  const filePath = fs.existsSync(filePathNew) ? filePathNew : (fs.existsSync(filePathLegacy) ? filePathLegacy : null);
  if (!filePath) return null;

  return await withFileWriteLock(filePath, async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(`${prefix}_Details`);
    if (!sheet || sheet.rowCount < 2) return null;

    const headers = {};
    const { keyRowNumber } = getHeaderKeys(sheet);
    sheet.getRow(keyRowNumber).eachCell((cell, colNumber) => { headers[cell.value] = colNumber; });

    const dataRowNumber = keyRowNumber + 1; // row3 for new format, row2 for legacy
    const row = sheet.getRow(dataRowNumber);
    for (const [key, value] of Object.entries(updates)) {
      if (headers[key]) {
        row.getCell(headers[key]).value = value;
      } else if (value !== undefined && value !== null && value !== '') {
        // Dynamically add key if it's a known schema column
        const nextCol = sheet.columnCount + 1;
        sheet.getCell(keyRowNumber, nextCol).value = key;
        sheet.getCell(keyRowNumber - 1, nextCol).value = key.replace(/_/g, ' ');
        headers[key] = nextCol;
        row.getCell(nextCol).value = value;
      }
    }
    await writeWorkbookAtomic(filePath, workbook);
    syncMirrorsForFile(filePath);

    // Return updated data
    return await getPropertyFile(type, number, townName);
  });
}

async function getAllPropertiesByTown(townName, type) {
  const propPath = getPropertiesPath();
  if (!fs.existsSync(propPath)) return [];

  const prefix = type === 'Plot' ? 'Plot' : 'Shop';
  const collectFiles = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.startsWith(`${prefix}_`) && f.endsWith('.xlsx'))
      .map(f => ({ fileName: f, filePath: path.join(dir, f) }));
  };

  let fileEntries = [];
  if (townName) {
    // New layout: only inside town folder, plus legacy root fallback
    const townDir = path.join(propPath, safeFolderName(townName));
    fileEntries = collectFiles(townDir)
      .filter(e => e.fileName.endsWith(`_${townName}.xlsx`))
      .concat(collectFiles(propPath).filter(e => e.fileName.endsWith(`_${townName}.xlsx`)));
  } else {
    // All towns: scan subfolders + legacy root
    const subDirs = fs.readdirSync(propPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(propPath, d.name));
    for (const d of subDirs) fileEntries.push(...collectFiles(d));
    fileEntries.push(...collectFiles(propPath)); // legacy root
  }

  const results = [];
  for (const entry of fileEntries) {
    const rows = await readExcelFile(entry.filePath, `${prefix}_Details`);
    if (rows.length > 0) {
      rows[0]._fileName = entry.fileName;
      results.push(rows[0]);
    }
  }
  return results;
}

async function getAllProperties() {
  const plots = await getAllPropertiesByTown(null, 'Plot');
  const shops = await getAllPropertiesByTown(null, 'Shop');
  return { plots, shops };
}

async function sellProperty(data) {
  const { type, number, townName } = data;

  const current = await getPropertyFile(type, number, townName);
  if (!current) throw new Error('Property not found');
  const st = String(current.Status || '').toLowerCase();
  if (st === 'sold' || st === 'resold') {
    throw new Error(`${type} ${number} is already ${current.Status}. Use CEO Resell / Deal Cancel.`);
  }
  if (st !== 'available' && st !== '') {
    throw new Error(`${type} ${number} is not available for sale`);
  }
  
  // Calculate installment
  const totalAmount = parseFloat(data.Deal_Amount_PKR ?? data.Total_Amount_PKR) || 0;
  const expectedAmount = parseFloat(data.Expected_Amount_PKR) || totalAmount;
  const discountAmount = Math.max(0, expectedAmount - totalAmount);
  const advanceAmount = parseFloat(data.Advance_Amount_PKR) || 0;
  const useInstallment = !!data.useInstallment;
  if (totalAmount <= 0) throw new Error('Final deal amount must be greater than zero');
  if (advanceAmount < 0) throw new Error('Advance amount cannot be negative');
  if (advanceAmount > totalAmount) throw new Error('Advance amount cannot be greater than final deal amount');
  
  const totalInstallments = useInstallment ? (parseInt(data.Total_Installments) || 1) : 0;
  const totalPeriodMonths = useInstallment ? (parseInt(data.Total_Period_Months) || 1) : 0;
  const gapDays = useInstallment ? (parseInt(data.Gap_Days) || 30) : 0;
  const gapLabel = useInstallment ? (data.Gap_Label || 'Monthly') : '';

  const remaining = totalAmount - advanceAmount;
  const monthlyInstallment = (useInstallment && totalInstallments > 0) ? Math.ceil(remaining / totalInstallments) : 0;
  const commissionRate = parseFloat(data.Commission_Rate) || 0;
  const commissionAmount = totalAmount * (commissionRate / 100);
  const expenseTotal = parseFloat(data.Expense_Total) || 0;
  const companyIncome = totalAmount - commissionAmount;
  const profitLoss = companyIncome - expenseTotal;

  const updates = {
    Owner_Name: data.Owner_Name || '',
    Customer_Name: data.Customer_Name || '',
    CNIC: data.CNIC || '',
    Phone_Number: data.Phone_Number || '',
    Sell_Date: data.Sell_Date || new Date().toISOString().split('T')[0],
    Expected_Amount_PKR: expectedAmount,
    Deal_Amount_PKR: totalAmount,
    Discount_Amount_PKR: discountAmount,
    Total_Amount_PKR: totalAmount,
    Advance_Amount_PKR: advanceAmount,
    Total_Installments: totalInstallments,
    Total_Period_Months: totalPeriodMonths,
    Gap_Days: gapDays,
    Gap_Label: gapLabel,
    Monthly_Installment: monthlyInstallment,
    Received_Amount: advanceAmount,
    Remaining_Amount: remaining,
    Agent_Name: data.Agent_Name || '',
    Commission_Rate: commissionRate,
    Commission_Amount: commissionAmount,
    Expense_Total: expenseTotal,
    Profit_Loss: profitLoss,
    Installment_Status: useInstallment && totalInstallments > 0 && remaining > 0 ? 'Active' : (remaining > 0 ? 'No Installment' : 'Completed'),
    Receipt_Number: data.Receipt_Number || '',
    File_Status: 'Not Delivered',
    Status: 'Sold',
  };

  // Update property file
  await updatePropertyFile(type, number, townName, updates);

  // Add to All_Sales.xlsx
  await ensureSheetColumns(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data', ['Received_Amount','Remaining_Amount','Sale_Type','Expected_Amount_PKR','Deal_Amount_PKR','Discount_Amount_PKR','Payment_Method','Cheque_Number','Cheque_Bank','Cheque_Image','Transaction_ID','Transfer_Bank','Transfer_Image']);
  const saleId = generateId();
  const saleData = {
    Sale_ID: saleId,
    Plot_Shop_Number: number,
    Type: type,
    Town_Name: townName,
    Customer_Name: data.Customer_Name,
    CNIC: data.CNIC,
    Phone_Number: data.Phone_Number,
    Sell_Date: updates.Sell_Date,
    Expected_Amount_PKR: expectedAmount,
    Deal_Amount_PKR: totalAmount,
    Discount_Amount_PKR: discountAmount,
    Total_Amount_PKR: totalAmount,
    Advance_Amount_PKR: advanceAmount,
    Total_Installments: totalInstallments,
    Total_Period_Months: totalPeriodMonths,
    Gap_Days: gapDays,
    Gap_Label: gapLabel,
    Monthly_Installment: monthlyInstallment,
    Received_Amount: advanceAmount,
    Remaining_Amount: remaining,
    Agent_Name: data.Agent_Name,
    Commission_Rate: commissionRate,
    Commission_Amount: commissionAmount,
    Company_Income: companyIncome,
    Expense_Total: expenseTotal,
    Profit_Loss: profitLoss,
    Receipt_Number: data.Receipt_Number,
    File_Status: 'Not Delivered',
    Status: 'Sold',
    Payment_Method: data.Payment_Method || 'Cash',
    Cheque_Number: data.Cheque_Number || '',
    Cheque_Bank: data.Cheque_Bank || '',
    Cheque_Image: data.Cheque_Image || '',
    Transaction_ID: data.Transaction_ID || '',
    Transfer_Bank: data.Transfer_Bank || '',
    Transfer_Image: data.Transfer_Image || '',
  };
  await appendToExcel(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data', saleData);
  if (advanceAmount > 0) {
    await recordMoneyEvent({
      sourceType: 'sale_advance',
      sourceId: saleId,
      direction: 'income',
      amount: advanceAmount,
      townName,
      date: updates.Sell_Date,
      partyName: data.Customer_Name,
      description: `${type} ${number} advance received`,
      receiptNumber: data.Receipt_Number,
      createdBy: data.Agent_Name || 'System',
    });
  }
  if (remaining <= 0) await upsertCommissionForSaleLocal(saleData);

  // Ensure Installments_Tracker has Agent_Name column
  await ensureSheetColumns(path.join(getGlobalsPath(), 'Installments_Tracker.xlsx'), 'Data', ['Agent_Name', 'Sale_ID']);

  // Create installment entries
  if (useInstallment && totalInstallments > 0 && remaining > 0) {
    const startDate = new Date(updates.Sell_Date);
    for (let i = 1; i <= totalInstallments; i++) {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (gapDays * i));
      
      const installmentData = {
        Tracker_ID: generateId(),
        Sale_ID: saleId,
        Plot_Shop_Number: number,
        Type: type,
        Town_Name: townName,
        Customer_Name: data.Customer_Name,
        Phone_Number: data.Phone_Number,
        Monthly_Amount: monthlyInstallment,
        Due_Date: dueDate.toISOString().split('T')[0],
        Status: i === 1 ? 'Due' : 'Upcoming',
        Paid_Date: '',
        Month_Number: i,
        Total_Months: totalInstallments,
        Received_Amount: 0,
        Remaining_Amount: monthlyInstallment,
        Agent_Name: data.Agent_Name || '',
      };
      await appendToExcel(path.join(getGlobalsPath(), 'Installments_Tracker.xlsx'), 'Data', installmentData);
    }
  }

  // Add expense if any
  if (expenseTotal > 0) {
    const expenseData = {
      Expense_ID: generateId(),
      Town_Name: townName,
      Expense_Name: `Sale Expense - ${type} ${number}`,
      Amount_PKR: expenseTotal,
      Description: `Expense for ${type} ${number} sale`,
      Category: 'Sale',
      Date: updates.Sell_Date,
      Added_By: data.Agent_Name || 'System',
    };
    await appendToExcel(path.join(getGlobalsPath(), 'All_Expenses.xlsx'), 'Data', expenseData);
    await recordMoneyEvent({
      sourceType: 'sale_expense',
      sourceId: expenseData.Expense_ID,
      direction: 'expense',
      amount: expenseTotal,
      townName,
      date: updates.Sell_Date,
      partyName: data.Agent_Name || 'System',
      description: expenseData.Expense_Name,
      createdBy: data.Agent_Name || 'System',
    });
  }

  // Update town file
  await updateTownFinancials(townName);

  // Generate notification
  const notifData = {
    Notification_ID: generateId(),
    Type: 'Sale',
    Message: `${type} ${number} sold to ${data.Customer_Name} in ${townName}`,
    Plot_Shop_Number: number,
    Town_Name: townName,
    Customer_Name: data.Customer_Name,
    Due_Date: '',
    Created_Date: new Date().toISOString().split('T')[0],
    Status: 'Active',
    Dismissed: 'No',
  };
  await appendToExcel(path.join(getGlobalsPath(), 'Notifications_Log.xlsx'), 'Data', notifData);

  return updates;
}

async function updateFileStatus(params) {
  const { type, number, townName, status, deliveryImage } = params;
  if (!type || !number || !townName || !status) {
    throw new Error('Missing required fields to update File Status');
  }

  const updates = { File_Status: status };
  if (deliveryImage) {
    updates.File_Delivery_Image = deliveryImage;
  }

  // 1. Update property excel file
  await updatePropertyFile(type, number, townName, updates);

  // 2. Update All_Sales.xlsx
  const salesPath = path.join(getGlobalsPath(), 'All_Sales.xlsx');
  const allSales = await readExcelFile(salesPath, 'Data');
  const match = allSales.find(s => 
    String(s.Type) === String(type) &&
    String(s.Plot_Shop_Number) === String(number) &&
    String(s.Town_Name) === String(townName) &&
    String(s.Status).toLowerCase() === 'sold'
  );
  if (match) {
    await withFileWriteLock(salesPath, async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(salesPath);
      const sheet = workbook.getWorksheet('Data');
      if (sheet) {
        const { keyRowNumber } = getHeaderKeys(sheet);
        const headers = {};
        sheet.getRow(keyRowNumber).eachCell((cell, colNumber) => { headers[cell.value] = colNumber; });

        for (const [field, value] of Object.entries(updates)) {
          if (headers[field]) {
            sheet.getRow(match._rowNumber).getCell(headers[field]).value = value;
          } else {
            const nextCol = sheet.columnCount + 1;
            sheet.getCell(keyRowNumber, nextCol).value = field;
            sheet.getCell(keyRowNumber - 1, nextCol).value = field.replace(/_/g, ' ');
            sheet.getRow(match._rowNumber).getCell(nextCol).value = value;
            headers[field] = nextCol;
          }
        }

        await writeWorkbookAtomic(salesPath, workbook);
        syncMirrorsForFile(salesPath);
      }
    });
  }
  return { success: true };
}

async function cancelDeal(data) {
  const { type, number, townName, Receipt_Number } = data || {};
  if (!type || !number || !townName) throw new Error('Missing property info');
  if (!Receipt_Number) throw new Error('Receipt number is required to cancel deal');

  const property = await getPropertyFile(type, number, townName);
  if (!property) throw new Error('Property not found');
  if (String(property.Status || '').toLowerCase() !== 'sold') {
    throw new Error('Only Sold deals can be cancelled');
  }
  const propReceipt = String(property.Receipt_Number || '').trim();
  if (!propReceipt || propReceipt !== String(Receipt_Number).trim()) {
    throw new Error('Receipt number mismatch');
  }

  const globalsDir = getGlobalsPath();
  const salesPath = path.join(globalsDir, 'All_Sales.xlsx');
  const instPath = path.join(globalsDir, 'Installments_Tracker.xlsx');
  const expPath = path.join(globalsDir, 'All_Expenses.xlsx');

  // Remove sale row (match by town/type/number/receipt, prefer latest)
  const allSales = await readExcelFile(salesPath, 'Data');
  const matches = allSales
    .filter(s =>
      String(s.Type || '') === String(type) &&
      String(s.Plot_Shop_Number || '') === String(number) &&
      String(s.Town_Name || '') === String(townName) &&
      String(s.Receipt_Number || '').trim() === String(Receipt_Number).trim() &&
      String(s.Status || '').toLowerCase() === 'sold'
    )
    .sort((a, b) => (b._rowNumber || 0) - (a._rowNumber || 0));
  if (matches.length === 0) throw new Error('Sale record not found for this receipt');
  await deleteExcelRow(salesPath, 'Data', matches[0]._rowNumber);

  // Remove all installments rows for this property (if any)
  const allInst = await readExcelFile(instPath, 'Data');
  const instRows = allInst
    .filter(i => String(i.Type || '') === String(type) && String(i.Plot_Shop_Number || '') === String(number) && String(i.Town_Name || '') === String(townName))
    .map(i => i._rowNumber)
    .filter(Boolean)
    .sort((a, b) => b - a); // delete bottom-up
  for (const rn of instRows) {
    await deleteExcelRow(instPath, 'Data', rn);
  }

  // Remove sale expense rows for this property (best-effort)
  const allExp = await readExcelFile(expPath, 'Data');
  const expRows = allExp
    .filter(e => String(e.Town_Name || '') === String(townName) && String(e.Expense_Name || '').includes(`Sale Expense - ${type} ${number}`))
    .map(e => e._rowNumber)
    .filter(Boolean)
    .sort((a, b) => b - a);
  for (const rn of expRows) {
    await deleteExcelRow(expPath, 'Data', rn);
  }

  // Reset property back to Available (clear sale fields)
  await updatePropertyFile(type, number, townName, {
    Customer_Name: '',
    CNIC: '',
    Phone_Number: '',
    Sell_Date: '',
    Total_Amount_PKR: '',
    Advance_Amount_PKR: '',
    Total_Installments: '',
    Total_Period_Months: '',
    Gap_Days: '',
    Gap_Label: '',
    Monthly_Installment: '',
    Received_Amount: '',
    Remaining_Amount: '',
    Agent_Name: '',
    Commission_Rate: '',
    Commission_Amount: '',
    Expense_Total: '',
    Profit_Loss: '',
    Installment_Status: '',
    Receipt_Number: '',
    File_Status: '',
    Status: 'Available',
    Resell_Status: 'No',
    Resell_Amount: '',
  });

  await updateTownFinancials(townName);
  return { success: true };
}

async function updateTownFinancials(townName) {
  const townFilePath = path.join(getTownsPath(), `${townName}.xlsx`);
  if (!fs.existsSync(townFilePath)) return;

  await backfillMoneyLedger();
  const money = await getMoneySummary(townName);
  // Get all sales for this town
  const sales = await readExcelFile(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data');
  const townSales = sales.filter(s => s.Town_Name === townName);
  const totalIncome = money.totalReceived;
  const totalExpenses = money.totalExpenses;
  const profitLoss = money.cashBalance;

  // Count sold plots and shops
  const plots = await getAllPropertiesByTown(townName, 'Plot');
  const shops = await getAllPropertiesByTown(townName, 'Shop');
  const soldPlots = plots.filter(p => p.Status === 'Sold').length;
  const soldShops = shops.filter(s => s.Status === 'Sold').length;

  await withFileWriteLock(townFilePath, async () => {
    // Update town file (read-modify-write must be inside the lock).
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(townFilePath);
    const sheet = workbook.getWorksheet('Data');
    if (!sheet || sheet.rowCount < 2) return;

    const headers = {};
    const { keyRowNumber } = getHeaderKeys(sheet);
    sheet.getRow(keyRowNumber).eachCell((cell, colNumber) => { headers[cell.value] = colNumber; });

    const row = sheet.getRow(keyRowNumber + 1);
    if (headers.Total_Income_PKR) row.getCell(headers.Total_Income_PKR).value = totalIncome;
    if (headers.Total_Expenses_PKR) row.getCell(headers.Total_Expenses_PKR).value = totalExpenses;
    if (headers.Profit_Loss) row.getCell(headers.Profit_Loss).value = profitLoss;

    // reserved: soldPlots/soldShops computed above for future use
    await writeWorkbookAtomic(townFilePath, workbook);
    syncMirrorsForFile(townFilePath);
  });
}

async function resellProperty(data) {
  const {
    type,
    number,
    townName,
    Resell_Amount,
    Refund_Amount,
    Receipt_Number,
    Customer_Name,
    CNIC,
    Phone_Number,
    useInstallment,
    Total_Installments,
    Total_Period_Months,
    Gap_Days,
    Gap_Label,
    Monthly_Installment,
    Advance_Amount_PKR,
    Payment_Method,
    Cheque_Number,
    Cheque_Bank,
    Transaction_ID,
    Transfer_Bank,
  } = data;
  
  // Get current property data
  const property = await getPropertyFile(type, number, townName);
  if (!property) throw new Error('Property not found');

  const resellAmount = parseFloat(Resell_Amount) || 0;
  const refundAmount = parseFloat(Refund_Amount) || 0;
  const installmentsEnabled = !!useInstallment;
  const totalInstallments = installmentsEnabled ? (parseInt(Total_Installments, 10) || 0) : 0;
  const totalPeriodMonths = installmentsEnabled ? (parseInt(Total_Period_Months, 10) || totalInstallments) : 0;
  const gapDays = installmentsEnabled ? (parseInt(Gap_Days, 10) || 30) : 0;
  const gapLabel = installmentsEnabled ? (Gap_Label || `${gapDays} days`) : '';
  const rawAdvanceAmount = parseFloat(Advance_Amount_PKR);
  const advanceAmount = Math.min(
    resellAmount,
    Math.max(0, Number.isFinite(rawAdvanceAmount) ? rawAdvanceAmount : resellAmount)
  );
  const remaining = Math.max(0, resellAmount - advanceAmount);
  const monthlyInstallment = installmentsEnabled && totalInstallments > 0
    ? (parseFloat(Monthly_Installment) || Math.ceil(remaining / totalInstallments))
    : 0;
  const resellDate = new Date().toISOString().split('T')[0];

  // Update property file
  await updatePropertyFile(type, number, townName, {
    Customer_Name: Customer_Name || property.Customer_Name || '',
    CNIC: CNIC || property.CNIC || '',
    Phone_Number: Phone_Number || property.Phone_Number || '',
    Resell_Status: 'Yes',
    Resell_Amount: resellAmount,
    Total_Amount_PKR: resellAmount,
    Advance_Amount_PKR: advanceAmount,
    Total_Installments: totalInstallments,
    Total_Period_Months: totalPeriodMonths,
    Gap_Days: gapDays,
    Gap_Label: gapLabel,
    Monthly_Installment: monthlyInstallment,
    Received_Amount: advanceAmount,
    Remaining_Amount: remaining,
    Receipt_Number: Receipt_Number || '',
    Status: 'Resold',
    Installment_Status: installmentsEnabled && totalInstallments > 0 && remaining > 0 ? 'Active' : 'Completed',
  });

  // Add to Resell_History.xlsx
  await ensureSheetColumns(path.join(getGlobalsPath(), 'Resell_History.xlsx'), 'Data', ['Total_Installments', 'Advance_Amount_PKR', 'Remaining_Amount', 'Monthly_Installment']);
  const resellId = generateId();
  const resellData = {
    Resell_ID: resellId,
    Plot_Shop_Number: number,
    Type: type,
    Town_Name: townName,
    Original_Customer: property.Customer_Name || '',
    Original_Sell_Date: property.Sell_Date || '',
    Original_Amount: property.Total_Amount_PKR || 0,
    Resell_Amount: resellAmount,
    Refund_Amount: refundAmount,
    Resell_Date: resellDate,
    Receipt_Number: Receipt_Number || '',
    Agent_Name: property.Agent_Name || '',
    Profit_Loss: resellAmount - refundAmount,
    Total_Installments: totalInstallments,
    Advance_Amount_PKR: advanceAmount,
    Remaining_Amount: remaining,
    Monthly_Installment: monthlyInstallment,
  };
  await appendToExcel(path.join(getGlobalsPath(), 'Resell_History.xlsx'), 'Data', resellData);
  if (refundAmount > 0) {
    await recordMoneyEvent({
      sourceType: 'resell_refund',
      sourceId: resellId,
      direction: 'expense',
      amount: refundAmount,
      townName,
      date: resellDate,
      partyName: property.Customer_Name || '',
      description: `${type} ${number} resell refund`,
      receiptNumber: Receipt_Number || '',
    });
  }

  const saleId = resellId;
  await ensureSheetColumns(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data', ['Sale_ID', 'Received_Amount','Remaining_Amount','Payment_Method','Cheque_Number','Cheque_Bank','Transaction_ID','Transfer_Bank', 'Sale_Type']);
  await appendToExcel(path.join(getGlobalsPath(), 'All_Sales.xlsx'), 'Data', {
    Sale_ID: saleId,
    Plot_Shop_Number: number,
    Type: type,
    Town_Name: townName,
    Customer_Name: Customer_Name || property.Customer_Name || '',
    CNIC: CNIC || property.CNIC || '',
    Phone_Number: Phone_Number || property.Phone_Number || '',
    Sell_Date: resellDate,
    Total_Amount_PKR: resellAmount,
    Advance_Amount_PKR: advanceAmount,
    Total_Installments: totalInstallments,
    Total_Period_Months: totalPeriodMonths,
    Gap_Days: gapDays,
    Gap_Label: gapLabel,
    Monthly_Installment: monthlyInstallment,
    Received_Amount: advanceAmount,
    Remaining_Amount: remaining,
    Agent_Name: property.Agent_Name || '',
    Commission_Rate: property.Commission_Rate || 0,
    Commission_Amount: property.Commission_Amount || 0,
    Company_Income: resellAmount,
    Expense_Total: refundAmount,
    Profit_Loss: resellAmount - refundAmount,
    Receipt_Number: Receipt_Number || '',
    File_Status: property.File_Status || '',
    Status: 'Resold',
    Sale_Type: 'Resell',
    Payment_Method: Payment_Method || 'Cash',
    Cheque_Number: Cheque_Number || '',
    Cheque_Bank: Cheque_Bank || '',
    Transaction_ID: Transaction_ID || '',
    Transfer_Bank: Transfer_Bank || '',
  });
  if (advanceAmount > 0) {
    await recordMoneyEvent({
      sourceType: 'resell_advance',
      sourceId: saleId,
      direction: 'income',
      amount: advanceAmount,
      townName,
      date: resellDate,
      partyName: Customer_Name || property.Customer_Name || '',
      description: `${type} ${number} resell advance received`,
      receiptNumber: Receipt_Number || '',
    });
  }
  if (remaining <= 0) {
    await upsertCommissionForSaleLocal({
      Sale_ID: saleId,
      Plot_Shop_Number: number,
      Type: type,
      Town_Name: townName,
      Agent_Name: property.Agent_Name || '',
      Commission_Amount: property.Commission_Amount || 0,
      Sell_Date: resellDate,
    });
  }

  await ensureSheetColumns(path.join(getGlobalsPath(), 'Installments_Tracker.xlsx'), 'Data', ['Sale_ID', 'Agent_Name']);
  if (installmentsEnabled && totalInstallments > 0 && remaining > 0) {
    const startDate = new Date(resellDate);
    for (let i = 1; i <= totalInstallments; i++) {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (gapDays * i));
      await appendToExcel(path.join(getGlobalsPath(), 'Installments_Tracker.xlsx'), 'Data', {
        Tracker_ID: generateId(),
        Sale_ID: saleId,
        Plot_Shop_Number: number,
        Type: type,
        Town_Name: townName,
        Customer_Name: Customer_Name || property.Customer_Name || '',
        Phone_Number: Phone_Number || property.Phone_Number || '',
        Monthly_Amount: monthlyInstallment,
        Due_Date: dueDate.toISOString().split('T')[0],
        Status: i === 1 ? 'Due' : 'Upcoming',
        Paid_Date: '',
        Month_Number: i,
        Total_Months: totalInstallments,
        Received_Amount: 0,
        Remaining_Amount: monthlyInstallment,
        Agent_Name: property.Agent_Name || '',
      });
    }
  }

  // Notification
  const notifData = {
    Notification_ID: generateId(),
    Type: 'Resell',
    Message: `${type} ${number} in ${townName} has been resold`,
    Plot_Shop_Number: number,
    Town_Name: townName,
    Customer_Name: property.Customer_Name || '',
    Due_Date: '',
    Created_Date: new Date().toISOString().split('T')[0],
    Status: 'Active',
    Dismissed: 'No',
  };
  await appendToExcel(path.join(getGlobalsPath(), 'Notifications_Log.xlsx'), 'Data', notifData);

  await updateTownFinancials(townName);
  return resellData;
}

async function getSoldProperties() {
  const { plots, shops } = await getAllProperties();
  return {
    plots: plots.filter(p => p.Status === 'Sold'),
    shops: shops.filter(s => s.Status === 'Sold'),
  };
}

module.exports = {
  addPlot,
  addShop,
  getPropertyFile,
  updatePropertyFile,
  getAllPropertiesByTown,
  getAllProperties,
  sellProperty,
  updateFileStatus,
  resellProperty,
  getSoldProperties,
  cancelDeal,
  updateTownFinancials,
  PLOT_COLUMNS,
  SHOP_COLUMNS,
};
