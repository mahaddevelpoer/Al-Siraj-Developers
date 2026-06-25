const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const onlineDb = require('./online');
const storage = require('./storage');
const { getGlobalsPath, getTownsPath, getPropertiesPath, withFileWriteLock, writeWorkbookAtomic, getHeaderKeys } = require('./core');
const { PLOT_COLUMNS, SHOP_COLUMNS } = require('./properties');
const { TOWN_COLUMNS } = require('./towns');
const {
  mapTownFromCloud,
  mapEmployeeFromCloud,
  mapAdvanceFromCloud,
  mapSalaryRecordFromCloud,
  mapDailyEntryFromCloud,
  mapPropertyFromCloud,
  mapCeoExpenseFromCloud,
  getRowVal,
} = require('./syncHelpers');

const DAILY_ENTRIES_COLUMNS = ['Entry_ID', 'Date', 'Time', 'Type', 'Description', 'Amount', 'Town_Name', 'Income_Type', 'Category', 'Subcategory', 'Property_ID', 'Installment_ID', 'Property_Details', 'Installment_Details', 'Reference', 'Created_By', 'Review_Status'];

function safeFolderName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

const toFriendlyHeader = (key) => String(key || '')
  .replace(/_/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
  .join(' ');

function styleHeaderRow(sheet, columns) {
  sheet.addRow(columns.map(toFriendlyHeader));
  sheet.addRow(columns);
  sheet.getRow(2).hidden = true;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FF111827' }, size: 12 };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  columns.forEach((c, idx) => { sheet.getColumn(idx + 1).width = Math.max(14, Math.min(32, toFriendlyHeader(c).length + 8)); });
}

async function overwriteExcelFile(filePath, sheetName, columns, dataArray) {
  await withFileWriteLock(filePath, async () => {
    const workbook = new ExcelJS.Workbook();
    let sheet;
    if (fs.existsSync(filePath)) {
      await workbook.xlsx.readFile(filePath);
      sheet = workbook.getWorksheet(sheetName || 'Data') || workbook.addWorksheet(sheetName || 'Data');
    } else {
      sheet = workbook.addWorksheet(sheetName || 'Data');
      styleHeaderRow(sheet, columns);
    }

    if (sheet.rowCount < 2) {
      sheet.spliceRows(1, sheet.rowCount);
      styleHeaderRow(sheet, columns);
    }

    const { keys, keyRowNumber, firstDataRowNumber } = getHeaderKeys(sheet);
    const headers = {};
    keys.forEach((key, idx) => { if (key) headers[key] = idx; });

    for (const col of columns) {
      if (!headers[col]) {
        const nextCol = sheet.columnCount + 1;
        sheet.getCell(keyRowNumber, nextCol).value = col;
        if (keyRowNumber > 1) sheet.getCell(keyRowNumber - 1, nextCol).value = toFriendlyHeader(col);
        headers[col] = nextCol;
        sheet.getColumn(nextCol).width = Math.max(14, Math.min(32, toFriendlyHeader(col).length + 8));
      }
    }

    const keyCol = columns[0];
    const keyIndex = headers[keyCol] || 1;
    const existing = new Map();
    const incomingKeys = new Set();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < firstDataRowNumber) return;
      const value = row.getCell(keyIndex).value;
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        existing.set(String(value), rowNumber);
      }
    });

    for (const rowObj of dataArray) {
      const rowKey = rowObj[keyCol] !== undefined && rowObj[keyCol] !== null ? String(rowObj[keyCol]) : '';
      if (rowKey) incomingKeys.add(rowKey);
      const targetRow = rowKey && existing.has(rowKey) ? sheet.getRow(existing.get(rowKey)) : sheet.addRow([]);
      for (const col of columns) {
        targetRow.getCell(headers[col]).value = rowObj[col] !== undefined && rowObj[col] !== null ? rowObj[col] : '';
      }
      targetRow.commit?.();
    }

    const rowsToDelete = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < firstDataRowNumber) return;
      const value = row.getCell(keyIndex).value;
      const key = value !== undefined && value !== null ? String(value) : '';
      if (!key || !incomingKeys.has(key)) rowsToDelete.push(rowNumber);
    });
    rowsToDelete.sort((a, b) => b - a).forEach((rowNumber) => {
      sheet.spliceRows(rowNumber, 1);
    });

    await writeWorkbookAtomic(filePath, workbook);
  });
}

function mapGenericFromCloud(columns, row) {
  const out = {};
  for (const col of columns) {
    out[col] = getRowVal(row, col) ?? '';
  }
  return out;
}

function scopedRows(rows, townName) {
  if (!townName) return rows || [];
  return (rows || []).filter((row) => String(getRowVal(row, 'Town_Name') || row?.townName || '') === townName);
}

async function performFullSync(reportProgress = () => {}) {
  try {
    reportProgress(5, 'Fetching global data from cloud...');

    const safeGetAll = async (table) => {
      try {
        return await onlineDb.getAll(table);
      } catch (e) {
        console.warn(`[syncDown] Skipping "${table}":`, e.message);
        return [];
      }
    };

    const [
      sales, expenses, ceoExpenses, ceoSalary, installments,
      notifications, employees, advanceSalaries, salaryPayments, towns,
      dailyEntries, commissions, resellHistory, townAgents, investors,
      investorTransactions, constructionProjects, constructionPayments, commissionReceipts, collectionPayments, moneyLedger, townFinancialSummary
    ] = await Promise.all([
      onlineDb.getAllSales(),
      onlineDb.getAll('expenses'),
      onlineDb.getAll('ceo_expenses'),
      onlineDb.getAll('ceo_salary'),
      onlineDb.getAllInstallments(),
      onlineDb.getAll('notifications'),
      safeGetAll('employees'),
      safeGetAll('advance_salaries'),
      safeGetAll('salary_records'),
      onlineDb.getAll('towns'),
      onlineDb.getAll('daily_entries'),
      safeGetAll('commissions'),
      safeGetAll('resell_history'),
      safeGetAll('town_agents'),
      safeGetAll('investors'),
      safeGetAll('investor_transactions'),
      safeGetAll('construction_projects'),
      safeGetAll('construction_payments'),
      safeGetAll('commission_receipts'),
      safeGetAll('collection_payments'),
      safeGetAll('money_ledger'),
      safeGetAll('town_financial_summary'),
    ]);

    const ctx = storage.getSyncContext?.() || {};
    const accountantTown = String(ctx.role || '').toLowerCase() === 'accountant'
      ? String(ctx.accountantTown || ctx.town_name || ctx.town_id || '').trim()
      : '';

    const scoped = (rows) => scopedRows(rows, accountantTown);

    reportProgress(30, 'Writing global files...');
    const globalsPath = getGlobalsPath();

    const COMM_COLS = ['Commission_ID','Sale_ID','Town_Name','Plot_Shop_Number','Agent_Name','Agent_Email','Commission_Amount','Paid_Amount','Remaining_Amount','Status','Paid_Date','Last_Paid_Date','Created_At'];
    const mappedCommissions = scoped(commissions).map(c => ({
      Commission_ID: c.id,
      Sale_ID: c.sale_id,
      Town_Name: c.town_name,
      Plot_Shop_Number: c.plot_shop_number || c.property_number,
      Agent_Name: c.agent_name,
      Agent_Email: c.agent_email,
      Commission_Amount: c.commission_amount,
      Paid_Amount: c.paid_amount || 0,
      Remaining_Amount: c.remaining_amount || Math.max(0, (parseFloat(c.commission_amount) || 0) - (parseFloat(c.paid_amount) || 0)),
      Status: c.status,
      Paid_Date: c.paid_date || c.paid_at,
      Last_Paid_Date: c.last_paid_at,
      Created_At: c.created_at
    }));
    await overwriteExcelFile(path.join(globalsPath, 'Commissions.xlsx'), 'Data', COMM_COLS, mappedCommissions);

    const SALES_COLS = ['Sale_ID','Plot_Shop_Number','Type','Town_Name','Customer_Name','CNIC','Phone_Number','Sell_Date','Expected_Amount_PKR','Deal_Amount_PKR','Discount_Amount_PKR','Total_Amount_PKR','Advance_Amount_PKR','Total_Installments','Total_Period_Months','Gap_Days','Gap_Label','Monthly_Installment','Received_Amount','Remaining_Amount','Agent_Name','Commission_Rate','Commission_Amount','Company_Income','Expense_Total','Profit_Loss','Receipt_Number','File_Status','File_Delivery_Image','Status','Sale_Type','Payment_Method','Cheque_Number','Cheque_Bank','Cheque_Image','Transaction_ID','Transfer_Bank','Transfer_Image'];
    await overwriteExcelFile(path.join(globalsPath, 'All_Sales.xlsx'), 'Data', SALES_COLS, scoped(sales).map((r) => mapGenericFromCloud(SALES_COLS, r)));

    const RESELL_COLS = ['Resell_ID','Plot_Shop_Number','Type','Town_Name','Original_Customer','Original_Sell_Date','Original_Amount','Resell_Amount','Refund_Amount','Resell_Date','Receipt_Number','Agent_Name','Profit_Loss'];
    await overwriteExcelFile(path.join(globalsPath, 'Resell_History.xlsx'), 'Data', RESELL_COLS, scoped(resellHistory).map((r) => mapGenericFromCloud(RESELL_COLS, r)));

    const EXP_COLS = ['Expense_ID','Town_Name','Expense_Name','Amount_PKR','Description','Category','Date','Added_By'];
    await overwriteExcelFile(path.join(globalsPath, 'All_Expenses.xlsx'), 'Data', EXP_COLS, scoped(expenses).map((r) => mapGenericFromCloud(EXP_COLS, r)));

    const INST_COLS = ['Tracker_ID','Plot_Shop_Number','Type','Town_Name','Customer_Name','Phone_Number','Monthly_Amount','Due_Date','Status','Paid_Date','Month_Number','Total_Months','Received_Amount','Remaining_Amount','Agent_Name','Receipt_Number','Paid_By','Payee_Name'];
    await overwriteExcelFile(path.join(globalsPath, 'Installments_Tracker.xlsx'), 'Data', INST_COLS, scoped(installments).map((r) => mapGenericFromCloud(INST_COLS, r)));

    const CEO_EXP_COLS = ['Expense_ID','Town_Name','Expense_Name','Amount_PKR','Description','Category','Date','Town_Income','Expense_Limit','Is_Over_Limit'];
    await overwriteExcelFile(path.join(globalsPath, 'CEO_Expenses.xlsx'), 'Data', CEO_EXP_COLS, scoped(ceoExpenses).map(mapCeoExpenseFromCloud));

    const CEO_SAL_COLS = ['Salary_ID','Town_Name','Month_Year','Amount_PKR','Date_Recorded','Notes'];
    await overwriteExcelFile(path.join(globalsPath, 'CEO_Salary.xlsx'), 'Data', CEO_SAL_COLS, scoped(ceoSalary).map((r) => mapGenericFromCloud(CEO_SAL_COLS, r)));

    const NOTIF_COLS = ['Notification_ID','Type','Message','Plot_Shop_Number','Town_Name','Customer_Name','Due_Date','Created_Date','Status','Dismissed'];
    await overwriteExcelFile(path.join(globalsPath, 'Notifications_Log.xlsx'), 'Data', NOTIF_COLS, scoped(notifications).map((r) => mapGenericFromCloud(NOTIF_COLS, r)));

    const EMP_COLS = ['id', 'Town_Name', 'Name', 'Designation', 'Phone', 'CNIC', 'Base_Salary', 'Join_Date', 'Status'];
    const mappedEmployees = scoped(employees).map((e, idx) => mapEmployeeFromCloud(e, idx));
    await overwriteExcelFile(path.join(globalsPath, 'Employees_V2.xlsx'), 'Employees', EMP_COLS, mappedEmployees);

    const ADV_COLS = ['id', 'Town_Name', 'Employee_Name', 'Advance_Type', 'Total_Amount', 'Total_Installments', 'Current_Installment', 'Monthly_Deduction', 'Start_Date', 'Status'];
    const mappedAdvances = scoped(advanceSalaries).map((a, idx) => mapAdvanceFromCloud(a, idx));
    await overwriteExcelFile(path.join(globalsPath, 'Advance_Salaries.xlsx'), 'Advance_Salaries', ADV_COLS, mappedAdvances);

    const SALREC_COLS = ['Receipt_Number','Date','Month','Type','Name','Designation','Amount','Town_Name','Note','Paid_By','Advance_Deduction','New_Advance_Given','Salary_Amount','Salary_Gross_Amount','Cash_Disbursed_Amount','Salary_Paid_Amount','Salary_Paid_Before','Salary_Paid_After','Salary_Remaining_After','Is_Advance_Salary'];
    const mappedSalaryRecords = scoped(salaryPayments).map(mapSalaryRecordFromCloud);
    await overwriteExcelFile(path.join(globalsPath, 'Salary_Records.xlsx'), 'Data', SALREC_COLS, mappedSalaryRecords);

    const mappedDailyEntries = scoped(dailyEntries).map(mapDailyEntryFromCloud);
    await overwriteExcelFile(path.join(globalsPath, 'Daily_Entries.xlsx'), 'Data', DAILY_ENTRIES_COLUMNS, mappedDailyEntries);

    const TOWN_AGENT_COLS = ['Agent_ID','Town_Name','Agent_Name','Phone_Number','CNIC','Address','Notes','Status','Created_At'];
    await overwriteExcelFile(path.join(globalsPath, 'Town_Agents.xlsx'), 'Data', TOWN_AGENT_COLS, scoped(townAgents).map((r) => mapGenericFromCloud(TOWN_AGENT_COLS, r)));

    const INVESTOR_COLS = ['Investor_ID','Town_Name','Investor_Name','Phone_Number','CNIC','Address','Notes','Balance','Status','Created_At','Approval_Status'];
    await overwriteExcelFile(path.join(globalsPath, 'Investors.xlsx'), 'Data', INVESTOR_COLS, scoped(investors).map((r) => mapGenericFromCloud(INVESTOR_COLS, r)));

    const INVESTOR_TX_COLS = ['Transaction_ID','Investor_ID','Town_Name','Investor_Name','Type','Amount','Date','Notes','Balance_After','Receipt_Number','Created_By'];
    await overwriteExcelFile(path.join(globalsPath, 'Investor_Transactions.xlsx'), 'Data', INVESTOR_TX_COLS, scoped(investorTransactions).map((r) => mapGenericFromCloud(INVESTOR_TX_COLS, r)));

    const CONSTRUCTION_COLS = ['Project_ID','Town_Name','Category','Constructor_Name','Phone_Number','Company_Name','Material_Name','Material_Quantity','Material_Rate','Deal_Amount','Paid_Amount','Remaining_Amount','Status','Start_Date','Notes'];
    await overwriteExcelFile(path.join(globalsPath, 'Construction_Projects.xlsx'), 'Data', CONSTRUCTION_COLS, scoped(constructionProjects).map((r) => mapGenericFromCloud(CONSTRUCTION_COLS, r)));

    const CONSTRUCTION_PAY_COLS = ['Payment_ID','Project_ID','Town_Name','Category','Constructor_Name','Amount','Payment_Date','Material_Name','Material_Quantity','Material_Rate','Remaining_After','Receipt_Number','Notes','Created_By'];
    await overwriteExcelFile(path.join(globalsPath, 'Construction_Payments.xlsx'), 'Data', CONSTRUCTION_PAY_COLS, scoped(constructionPayments).map((r) => mapGenericFromCloud(CONSTRUCTION_PAY_COLS, r)));

    const COMM_RECEIPT_COLS = ['Receipt_ID','Commission_ID','Sale_ID','Town_Name','Agent_Name','Plot_Shop_Number','Amount','Paid_Date','Receipt_Number','Paid_By'];
    await overwriteExcelFile(path.join(globalsPath, 'Commission_Receipts.xlsx'), 'Data', COMM_RECEIPT_COLS, scoped(commissionReceipts).map((r) => mapGenericFromCloud(COMM_RECEIPT_COLS, r)));

    const COLLECTION_PAY_COLS = ['Payment_ID','Sale_ID','Sale_Code','Type','Plot_Shop_Number','Town_Name','Customer_Name','Agent_Name','Amount','Received_Before','Received_After','Remaining_After','Payment_Date','Payment_Method','Notes'];
    await overwriteExcelFile(path.join(globalsPath, 'Collection_Payments.xlsx'), 'Data', COLLECTION_PAY_COLS, scoped(collectionPayments).map((r) => mapGenericFromCloud(COLLECTION_PAY_COLS, r)));

    const MONEY_LEDGER_COLS = ['Ledger_ID','Town_Name','Date','Source_Type','Source_ID','Direction','Amount','Debit_Account','Credit_Account','Party_Name','Description','Receipt_Number','Status','Created_By','Created_At'];
    await overwriteExcelFile(path.join(globalsPath, 'Money_Ledger.xlsx'), 'Data', MONEY_LEDGER_COLS, scoped(moneyLedger).map((r) => mapGenericFromCloud(MONEY_LEDGER_COLS, r)));

    const SUMMARY_COLS = ['Town_Name','Total_Received','Total_Expenses','Cash_Balance','Pending_Collection','Investor_Balance','Updated_At'];
    await overwriteExcelFile(path.join(globalsPath, 'Town_Financial_Summary.xlsx'), 'Data', SUMMARY_COLS, scoped(townFinancialSummary).map((r) => mapGenericFromCloud(SUMMARY_COLS, r)));

    reportProgress(50, 'Writing towns...');
    const townsPath = getTownsPath();
    if (!fs.existsSync(townsPath)) fs.mkdirSync(townsPath, { recursive: true });
    for (const file of fs.readdirSync(townsPath)) {
      if (file.toLowerCase().endsWith('.xlsx')) fs.rmSync(path.join(townsPath, file), { force: true });
    }

    for (const town of scoped(towns)) {
      const mappedTown = mapTownFromCloud(town);
      const townName = mappedTown.Town_Name;
      if (!townName) continue;
      await overwriteExcelFile(path.join(townsPath, `${townName}.xlsx`), 'Data', TOWN_COLUMNS, [mappedTown]);
    }

    reportProgress(70, 'Fetching properties from cloud...');
    const { plots, shops } = await onlineDb.getAllProperties();
    const propsPath = getPropertiesPath();
    if (!fs.existsSync(propsPath)) fs.mkdirSync(propsPath, { recursive: true });
    for (const townDir of fs.readdirSync(propsPath, { withFileTypes: true })) {
      const fullTownDir = path.join(propsPath, townDir.name);
      if (!townDir.isDirectory()) continue;
      for (const file of fs.readdirSync(fullTownDir)) {
        if (file.toLowerCase().endsWith('.xlsx')) fs.rmSync(path.join(fullTownDir, file), { force: true });
      }
    }

    reportProgress(85, 'Writing properties...');
    const writeProperty = async (prop, type) => {
      const mappedProp = mapPropertyFromCloud(prop, type);
      const townName = mappedProp.Town_Name;
      if (!townName) return;
      const townDir = path.join(propsPath, safeFolderName(townName));
      if (!fs.existsSync(townDir)) fs.mkdirSync(townDir, { recursive: true });
      const prefix = type === 'Plot' ? 'Plot' : 'Shop';
      const number = type === 'Plot' ? mappedProp.Plot_Number : mappedProp.Shop_Number;
      if (!number) return;
      const filePath = path.join(townDir, `${prefix}_${number}_${townName}.xlsx`);
      await overwriteExcelFile(filePath, `${prefix}_Details`, type === 'Plot' ? PLOT_COLUMNS : SHOP_COLUMNS, [mappedProp]);
    };

    const allProps = [];
    for (const p of scoped(plots)) allProps.push(writeProperty(p, 'Plot'));
    for (const s of scoped(shops)) allProps.push(writeProperty(s, 'Shop'));

    for (let i = 0; i < allProps.length; i += 50) {
      await Promise.all(allProps.slice(i, i + 50));
    }

    reportProgress(100, 'Sync Complete!');
    return { success: true };
  } catch (err) {
    console.error('Full Sync Failed:', err);
    throw err;
  }
}

module.exports = { performFullSync };
