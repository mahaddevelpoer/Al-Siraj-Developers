const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const {
  getGlobalsPath,
  readExcelFile,
  appendToExcel,
  generateId,
  ensureSheetColumns,
  withFileWriteLock,
  writeWorkbookAtomic,
  syncMirrorsForFile,
} = require('./core');

const FILE = 'Media_Library.xlsx';
const COLUMNS = [
  'Media_ID',
  'Town_Name',
  'Type',
  'Title',
  'File_Path',
  'Pdf_Path',
  'Excel_Path',
  'Html_Path',
  'Account_Name',
  'Property_Number',
  'Receipt_Number',
  'Report_Date',
  'From_Date',
  'To_Date',
  'Created_At',
];

function mediaPath() {
  return path.join(getGlobalsPath(), FILE);
}

async function ensureMediaFile() {
  const fp = mediaPath();
  if (!fs.existsSync(fp)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(COLUMNS.map((col) => col.replace(/_/g, ' ')));
    sheet.addRow(COLUMNS);
    sheet.getRow(2).hidden = true;
    COLUMNS.forEach((col, idx) => {
      sheet.getColumn(idx + 1).width = Math.max(14, Math.min(34, col.length + 8));
    });
    await withFileWriteLock(fp, async () => {
      await writeWorkbookAtomic(fp, workbook);
      syncMirrorsForFile(fp);
    });
  } else {
    await ensureSheetColumns(fp, 'Data', COLUMNS);
  }
  return fp;
}

function normalizeFilterValue(value) {
  return String(value || '').trim().toLowerCase();
}

async function getMediaLibrary(filter = {}) {
  const fp = await ensureMediaFile();
  const rows = await readExcelFile(fp, 'Data');
  const town = normalizeFilterValue(filter.townName || filter.Town_Name);
  const type = normalizeFilterValue(filter.type || filter.Type);
  const account = normalizeFilterValue(filter.accountName || filter.Account_Name);
  const property = normalizeFilterValue(filter.propertyNumber || filter.Property_Number);
  return rows.filter((row) => {
    if (town && normalizeFilterValue(row.Town_Name) !== town) return false;
    if (type && normalizeFilterValue(row.Type) !== type) return false;
    if (account && !normalizeFilterValue(row.Account_Name).includes(account)) return false;
    if (property && !normalizeFilterValue(row.Property_Number).includes(property)) return false;
    return true;
  }).sort((a, b) => String(b.Created_At || '').localeCompare(String(a.Created_At || '')));
}

async function recordMediaItem(data = {}) {
  const fp = await ensureMediaFile();
  const title = data.Title || data.title || data.Receipt_Number || data.Receipt_Number || 'Generated document';
  const pdfPath = data.Pdf_Path || data.pdfPath || '';
  const excelPath = data.Excel_Path || data.excelPath || '';
  const htmlPath = data.Html_Path || data.htmlPath || '';
  const filePath = data.File_Path || data.filePath || pdfPath || excelPath || htmlPath || '';
  const existing = (await readExcelFile(fp, 'Data')).find((row) =>
    String(row.File_Path || row.Pdf_Path || row.Excel_Path || row.Html_Path || '') === String(filePath || '')
  );
  if (existing) return existing;
  const row = {
    Media_ID: data.Media_ID || generateId(),
    Town_Name: data.Town_Name || data.townName || '',
    Type: data.Type || data.type || 'report',
    Title: title,
    File_Path: filePath,
    Pdf_Path: pdfPath,
    Excel_Path: excelPath,
    Html_Path: htmlPath,
    Account_Name: data.Account_Name || data.accountName || '',
    Property_Number: data.Property_Number || data.propertyNumber || '',
    Receipt_Number: data.Receipt_Number || data.receiptNumber || '',
    Report_Date: data.Report_Date || data.reportDate || new Date().toISOString().slice(0, 10),
    From_Date: data.From_Date || data.fromDate || '',
    To_Date: data.To_Date || data.toDate || '',
    Created_At: data.Created_At || new Date().toISOString(),
  };
  await appendToExcel(fp, 'Data', row);
  return row;
}

module.exports = {
  FILE,
  COLUMNS,
  getMediaLibrary,
  recordMediaItem,
};
