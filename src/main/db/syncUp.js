const path = require('path');
const storage = require('./storage');
const { getTowns } = require('./towns');
const { getAllProperties } = require('./properties');
const {
  getAllSales, getAllExpenses, getCeoExpenses, getCeoSalary,
  getInstallments, getSalaryRecords, getResellHistory,
} = require('./globals');
const EmployeeDB = require('./employees');
const { getDailyEntries } = require('./dailyEntries');
const { getGlobalsPath, readExcelFile } = require('./core');
const {
  getAdminClient,
  upsertAll,
  upsertAllSafe,
  pickTableRows,
  mapTownToCloud,
  mapPlotToCloud,
  mapShopToCloud,
  mapEmployeeToCloud,
  mapAdvanceToCloud,
  mapSalaryRecordToCloud,
  mapDailyEntryToCloud,
} = require('./syncHelpers');

let _admin = null;

function getScopedTown() {
  const ctx = storage.getSyncContext?.() || {};
  return String(ctx.role || '').toLowerCase() === 'accountant'
    ? String(ctx.accountantTown || ctx.town_name || ctx.town_id || '').trim()
    : '';
}

function scopedRows(rows, townName) {
  if (!townName) return rows || [];
  return (rows || []).filter((row) => String(row?.Town_Name || row?.town_name || row?.townName || '') === townName);
}

async function performFullSyncUp(reportProgress, options = {}) {
  if (!reportProgress) reportProgress = () => {};

  _admin = getAdminClient();

  reportProgress(2, 'Reading local Excel data...');
  const scopedTown = getScopedTown();

  const [towns, allProps, sales, expenses, ceoExpenses, ceoSalary, installments] = await Promise.all([
    getTowns(),
    getAllProperties(),
    getAllSales(),
    getAllExpenses(),
    getCeoExpenses(),
    getCeoSalary(),
    getInstallments(),
  ]);

  reportProgress(10, 'Syncing towns to cloud...');
  await upsertAll(_admin, 'towns', scopedRows(towns, scopedTown).map(mapTownToCloud));

  reportProgress(18, 'Syncing properties to cloud...');
  const propRows = [
    ...(allProps.plots || []).map(mapPlotToCloud),
    ...(allProps.shops || []).map(mapShopToCloud),
  ].filter((p) => p.Property_Number && p.Town_Name && (!scopedTown || String(p.Town_Name) === scopedTown));
  await upsertAll(_admin, 'properties', propRows);

  reportProgress(26, 'Syncing sales to cloud...');
  const scopedSales = scopedRows(sales, scopedTown);
  const cloudSales = pickTableRows('all_sales', scopedSales);
  const skippedSales = (scopedSales || []).length - cloudSales.length;
  if (skippedSales > 0) reportProgress(25, `Skipping ${skippedSales} local income rows not meant for sales table...`);
  await upsertAll(_admin, 'all_sales', cloudSales);

  reportProgress(34, 'Syncing installments to cloud...');
  await upsertAll(_admin, 'installments', pickTableRows('installments', scopedRows(installments, scopedTown)));

  reportProgress(42, 'Syncing expenses to cloud...');
  await upsertAll(_admin, 'expenses', pickTableRows('expenses', scopedRows(expenses, scopedTown)));

  reportProgress(50, 'Syncing CEO expenses to cloud...');
  await upsertAll(_admin, 'ceo_expenses', pickTableRows('ceo_expenses', scopedRows(ceoExpenses, scopedTown)));

  reportProgress(58, 'Syncing CEO salary to cloud...');
  await upsertAll(_admin, 'ceo_salary', pickTableRows('ceo_salary', scopedRows(ceoSalary, scopedTown)));

  reportProgress(66, 'Syncing notifications to cloud...');
  let notifs = [];
  try {
    notifs = await readExcelFile(path.join(getGlobalsPath(), 'Notifications_Log.xlsx'), 'Data');
  } catch (_) {}
  await upsertAll(_admin, 'notifications', pickTableRows('notifications', scopedRows(notifs, scopedTown)));

  reportProgress(68, 'Syncing resell history to cloud...');
  let resellHistory = [];
  try {
    resellHistory = await getResellHistory();
  } catch (_) {}
  await upsertAll(_admin, 'resell_history', pickTableRows('resell_history', scopedRows(resellHistory, scopedTown)));

  reportProgress(70, 'Syncing employees to cloud...');
  const empDB = new EmployeeDB(getGlobalsPath());
  let empV2 = [];
  try {
    empV2 = await empDB.getEmployees();
  } catch (_) {}
  await upsertAllSafe(_admin, 'employees', scopedRows(empV2, scopedTown).map(mapEmployeeToCloud).filter((e) => e.Employee_ID));

  reportProgress(74, 'Syncing advance salaries to cloud...');
  let advances = [];
  try {
    advances = await empDB.getAdvanceSalaries();
  } catch (_) {}
  await upsertAllSafe(_admin, 'advance_salaries', scopedRows(advances, scopedTown).map(mapAdvanceToCloud).filter((a) => a.Advance_ID));

  reportProgress(78, 'Syncing salary payments to cloud...');
  let salaryPays = [];
  try {
    salaryPays = await getSalaryRecords();
  } catch (_) {}
  await upsertAllSafe(_admin, 'salary_records', scopedRows(salaryPays, scopedTown).map(mapSalaryRecordToCloud).filter((sp) => sp.Payment_ID || sp.Receipt_Number));

  reportProgress(82, 'Syncing daily entries to cloud...');
  let entries = [];
  try {
    entries = await getDailyEntries({});
  } catch (_) {}
  await upsertAll(_admin, 'daily_entries', scopedRows(entries, scopedTown).map(mapDailyEntryToCloud).filter((e) => e.Entry_ID));

  reportProgress(86, 'Syncing town agents, investors and construction...');
  const extraTables = [
    ['town_agents', 'Town_Agents.xlsx'],
    ['investors', 'Investors.xlsx'],
    ['investor_transactions', 'Investor_Transactions.xlsx'],
    ['construction_projects', 'Construction_Projects.xlsx'],
    ['construction_payments', 'Construction_Payments.xlsx'],
    ['commission_receipts', 'Commission_Receipts.xlsx'],
    ['receipt_archive', 'Receipt_Archive.xlsx'],
    ['money_ledger', 'Money_Ledger.xlsx'],
    ['town_financial_summary', 'Town_Financial_Summary.xlsx'],
  ];
  for (const [table, fileName] of extraTables) {
    let rows = [];
    try { rows = await readExcelFile(path.join(getGlobalsPath(), fileName), 'Data'); } catch (_) {}
    await upsertAllSafe(_admin, table, pickTableRows(table, scopedRows(rows, scopedTown)));
  }

  let fileResult = { uploaded: 0, skipped: 0, total: 0 };
  if (options.includeStorageBackup) {
    reportProgress(88, 'Uploading Excel backup files to cloud storage...');
    await storage.ensureBucket();
    fileResult = await storage.uploadChangedFiles((filePath) => {
      reportProgress(90 + Math.round(Math.random() * 8), `Uploading ${path.basename(filePath)}...`);
    });
  } else {
    reportProgress(88, 'Skipping storage backup during DB sync...');
  }

  reportProgress(100, 'Sync to cloud complete!');
  return {
    success: true,
    salesSynced: cloudSales.length,
    salesSkipped: skippedSales,
    filesUploaded: fileResult?.uploaded || 0,
    filesSkipped: fileResult?.skipped || 0,
    filesTotal: fileResult?.total || 0,
  };
}

module.exports = { performFullSyncUp };
