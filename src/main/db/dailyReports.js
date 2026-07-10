const path = require('path');
const ExcelJS = require('exceljs');
const {
  getGlobalsPath,
  readExcelFile,
  appendToExcel,
  ensureSheetColumns,
  withFileWriteLock,
  writeWorkbookAtomic,
  syncMirrorsForFile,
} = require('./core');

const FILE_NAME = 'Daily_Reports.xlsx';
const COLUMNS = [
  'Report_ID', 'Town_Name', 'Date', 'Generated_At',
  'Total_Received', 'Total_Expenses', 'Daily_Entries',
  'Net_Balance', 'Properties_Sold', 'Report_Data', 'Sync_Status'
];

function filePath() {
  return path.join(getGlobalsPath(), FILE_NAME);
}

async function ensureDailyReportsFile() {
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

async function saveDailyReportLocally(report) {
  const fp = await ensureDailyReportsFile();
  const row = {
    ...report,
    Report_Data: JSON.stringify(report.Report_Data || {}),
    Sync_Status: 'pending',
  };
  await appendToExcel(fp, 'Data', row);
  return row;
}

async function getDailyReportsLocal(townName) {
  const fp = await ensureDailyReportsFile();
  const rows = await readExcelFile(fp, 'Data').catch(() => []);
  return rows
    .filter((row) => !townName || String(row.Town_Name || '') === String(townName))
    .map(r => {
      let parsedData = {};
      try { parsedData = JSON.parse(r.Report_Data || '{}'); } catch(e) {}
      return { ...r, Report_Data: parsedData };
    })
    .sort((a, b) => new Date(b.Date) - new Date(a.Date)); // Newest first
}

module.exports = {
  ensureDailyReportsFile,
  saveDailyReportLocally,
  getDailyReportsLocal,
};
