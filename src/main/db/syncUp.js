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

async function performFullSyncUp(reportProgress) {
  if (!reportProgress) reportProgress = () => {};

  _admin = getAdminClient();

  reportProgress(2, 'Reading local Excel data...');

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
  await upsertAll(_admin, 'towns', (towns || []).map(mapTownToCloud));

  reportProgress(18, 'Syncing properties to cloud...');
  const propRows = [
    ...(allProps.plots || []).map(mapPlotToCloud),
    ...(allProps.shops || []).map(mapShopToCloud),
  ].filter((p) => p.Property_Number && p.Town_Name);
  await upsertAll(_admin, 'properties', propRows);

  reportProgress(26, 'Syncing sales to cloud...');
  const cloudSales = pickTableRows('all_sales', sales);
  const skippedSales = (sales || []).length - cloudSales.length;
  if (skippedSales > 0) reportProgress(25, `Skipping ${skippedSales} local income rows not meant for sales table...`);
  await upsertAll(_admin, 'all_sales', cloudSales);

  reportProgress(34, 'Syncing installments to cloud...');
  await upsertAll(_admin, 'installments', pickTableRows('installments', installments));

  reportProgress(42, 'Syncing expenses to cloud...');
  await upsertAll(_admin, 'expenses', pickTableRows('expenses', expenses));

  reportProgress(50, 'Syncing CEO expenses to cloud...');
  await upsertAll(_admin, 'ceo_expenses', pickTableRows('ceo_expenses', ceoExpenses));

  reportProgress(58, 'Syncing CEO salary to cloud...');
  await upsertAll(_admin, 'ceo_salary', pickTableRows('ceo_salary', ceoSalary));

  reportProgress(66, 'Syncing notifications to cloud...');
  let notifs = [];
  try {
    notifs = await readExcelFile(path.join(getGlobalsPath(), 'Notifications_Log.xlsx'), 'Data');
  } catch (_) {}
  await upsertAll(_admin, 'notifications', pickTableRows('notifications', notifs));

  reportProgress(68, 'Syncing resell history to cloud...');
  let resellHistory = [];
  try {
    resellHistory = await getResellHistory();
  } catch (_) {}
  await upsertAll(_admin, 'resell_history', pickTableRows('resell_history', resellHistory));

  reportProgress(70, 'Syncing employees to cloud...');
  const empDB = new EmployeeDB(getGlobalsPath());
  let empV2 = [];
  try {
    empV2 = await empDB.getEmployees();
  } catch (_) {}
  await upsertAllSafe(_admin, 'employees', (empV2 || []).map(mapEmployeeToCloud).filter((e) => e.Employee_ID));

  reportProgress(74, 'Syncing advance salaries to cloud...');
  let advances = [];
  try {
    advances = await empDB.getAdvanceSalaries();
  } catch (_) {}
  await upsertAllSafe(_admin, 'advance_salaries', (advances || []).map(mapAdvanceToCloud).filter((a) => a.Advance_ID));

  reportProgress(78, 'Syncing salary payments to cloud...');
  let salaryPays = [];
  try {
    salaryPays = await getSalaryRecords();
  } catch (_) {}
  await upsertAllSafe(_admin, 'salary_records', (salaryPays || []).map(mapSalaryRecordToCloud).filter((sp) => sp.Payment_ID || sp.Receipt_Number));

  reportProgress(82, 'Syncing daily entries to cloud...');
  let entries = [];
  try {
    entries = await getDailyEntries({});
  } catch (_) {}
  await upsertAll(_admin, 'daily_entries', (entries || []).map(mapDailyEntryToCloud).filter((e) => e.Entry_ID));

  reportProgress(88, 'Uploading files to cloud storage...');
  await storage.ensureBucket();
  const fileResult = await storage.uploadChangedFiles((filePath) => {
    reportProgress(90 + Math.round(Math.random() * 8), `Uploading ${path.basename(filePath)}...`);
  });

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
