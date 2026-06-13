const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const onlineDb = require('./online');
const { getGlobalsPath, getTownsPath, getPropertiesPath, withFileWriteLock, writeWorkbookAtomic } = require('./core');
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

const DAILY_ENTRIES_COLUMNS = ['Entry_ID', 'Date', 'Time', 'Type', 'Description', 'Amount', 'Town_Name', 'Income_Type', 'Category', 'Subcategory', 'Property_ID', 'Installment_ID', 'Property_Details', 'Installment_Details'];

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
    const sheet = workbook.addWorksheet(sheetName || 'Data');

    styleHeaderRow(sheet, columns);

    for (const rowObj of dataArray) {
      const rowArr = columns.map(col => rowObj[col] !== undefined && rowObj[col] !== null ? rowObj[col] : '');
      sheet.addRow(rowArr);
    }

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
      dailyEntries, commissions
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
    ]);

    reportProgress(30, 'Writing global files...');
    const globalsPath = getGlobalsPath();

    const COMM_COLS = ['Commission_ID','Sale_ID','Town_Name','Plot_Shop_Number','Agent_Name','Agent_Email','Commission_Amount','Status','Paid_Date','Created_At'];
    const mappedCommissions = (commissions || []).map(c => ({
      Commission_ID: c.id,
      Sale_ID: c.sale_id,
      Town_Name: c.town_name,
      Plot_Shop_Number: c.plot_shop_number,
      Agent_Name: c.agent_name,
      Agent_Email: c.agent_email,
      Commission_Amount: c.commission_amount,
      Status: c.status,
      Paid_Date: c.paid_date,
      Created_At: c.created_at
    }));
    await overwriteExcelFile(path.join(globalsPath, 'Commissions.xlsx'), 'Data', COMM_COLS, mappedCommissions);

    const SALES_COLS = ['Sale_ID','Plot_Shop_Number','Type','Town_Name','Customer_Name','CNIC','Phone_Number','Sell_Date','Total_Amount_PKR','Advance_Amount_PKR','Total_Installments','Total_Period_Months','Gap_Days','Gap_Label','Monthly_Installment','Received_Amount','Remaining_Amount','Agent_Name','Commission_Rate','Commission_Amount','Company_Income','Expense_Total','Profit_Loss','Receipt_Number','File_Status','Status','Sale_Type','Payment_Method','Cheque_Number','Cheque_Bank','Cheque_Image','Transaction_ID','Transfer_Bank','Transfer_Image'];
    await overwriteExcelFile(path.join(globalsPath, 'All_Sales.xlsx'), 'Data', SALES_COLS, (sales || []).map((r) => mapGenericFromCloud(SALES_COLS, r)));

    const EXP_COLS = ['Expense_ID','Town_Name','Expense_Name','Amount_PKR','Description','Category','Date','Added_By'];
    await overwriteExcelFile(path.join(globalsPath, 'All_Expenses.xlsx'), 'Data', EXP_COLS, (expenses || []).map((r) => mapGenericFromCloud(EXP_COLS, r)));

    const INST_COLS = ['Tracker_ID','Plot_Shop_Number','Type','Town_Name','Customer_Name','Phone_Number','Monthly_Amount','Due_Date','Status','Paid_Date','Month_Number','Total_Months','Received_Amount','Remaining_Amount','Agent_Name'];
    await overwriteExcelFile(path.join(globalsPath, 'Installments_Tracker.xlsx'), 'Data', INST_COLS, (installments || []).map((r) => mapGenericFromCloud(INST_COLS, r)));

    const CEO_EXP_COLS = ['Expense_ID','Town_Name','Expense_Name','Amount_PKR','Description','Category','Date','Town_Income','Expense_Limit','Is_Over_Limit'];
    await overwriteExcelFile(path.join(globalsPath, 'CEO_Expenses.xlsx'), 'Data', CEO_EXP_COLS, (ceoExpenses || []).map(mapCeoExpenseFromCloud));

    const CEO_SAL_COLS = ['Salary_ID','Town_Name','Month_Year','Amount_PKR','Date_Recorded','Notes'];
    await overwriteExcelFile(path.join(globalsPath, 'CEO_Salary.xlsx'), 'Data', CEO_SAL_COLS, (ceoSalary || []).map((r) => mapGenericFromCloud(CEO_SAL_COLS, r)));

    const NOTIF_COLS = ['Notification_ID','Type','Message','Plot_Shop_Number','Town_Name','Customer_Name','Due_Date','Created_Date','Status','Dismissed'];
    await overwriteExcelFile(path.join(globalsPath, 'Notifications_Log.xlsx'), 'Data', NOTIF_COLS, (notifications || []).map((r) => mapGenericFromCloud(NOTIF_COLS, r)));

    const EMP_COLS = ['id', 'Town_Name', 'Name', 'Designation', 'Phone', 'CNIC', 'Base_Salary', 'Join_Date', 'Status'];
    const mappedEmployees = (employees || []).map((e, idx) => mapEmployeeFromCloud(e, idx));
    await overwriteExcelFile(path.join(globalsPath, 'Employees_V2.xlsx'), 'Employees', EMP_COLS, mappedEmployees);

    const ADV_COLS = ['id', 'Town_Name', 'Employee_Name', 'Advance_Type', 'Total_Amount', 'Total_Installments', 'Current_Installment', 'Monthly_Deduction', 'Start_Date', 'Status'];
    const mappedAdvances = (advanceSalaries || []).map((a, idx) => mapAdvanceFromCloud(a, idx));
    await overwriteExcelFile(path.join(globalsPath, 'Advance_Salaries.xlsx'), 'Advance_Salaries', ADV_COLS, mappedAdvances);

    const SALREC_COLS = ['Receipt_Number','Date','Month','Type','Name','Designation','Amount','Town_Name','Note','Paid_By'];
    const mappedSalaryRecords = (salaryPayments || []).map(mapSalaryRecordFromCloud);
    await overwriteExcelFile(path.join(globalsPath, 'Salary_Records.xlsx'), 'Data', SALREC_COLS, mappedSalaryRecords);

    const mappedDailyEntries = (dailyEntries || []).map(mapDailyEntryFromCloud);
    await overwriteExcelFile(path.join(globalsPath, 'Daily_Entries.xlsx'), 'Data', DAILY_ENTRIES_COLUMNS, mappedDailyEntries);

    reportProgress(50, 'Writing towns...');
    const townsPath = getTownsPath();
    if (!fs.existsSync(townsPath)) fs.mkdirSync(townsPath, { recursive: true });

    for (const town of towns || []) {
      const mappedTown = mapTownFromCloud(town);
      const townName = mappedTown.Town_Name;
      if (!townName) continue;
      await overwriteExcelFile(path.join(townsPath, `${townName}.xlsx`), 'Data', TOWN_COLUMNS, [mappedTown]);
    }

    reportProgress(70, 'Fetching properties from cloud...');
    const { plots, shops } = await onlineDb.getAllProperties();
    const propsPath = getPropertiesPath();

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
    for (const p of plots || []) allProps.push(writeProperty(p, 'Plot'));
    for (const s of shops || []) allProps.push(writeProperty(s, 'Shop'));

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
