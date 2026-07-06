const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

let DB_PATH = '';
let MIRRORS = {
  enabled: false,
  desktopRoot: '',
  immutableRoot: '',
};

// Prevent concurrent modifications to the same Excel file.
// Without this, two IPC calls can read the same workbook state and the last write wins.
const writeChains = new Map(); // filePath -> Promise
let AFTER_WRITE_HOOK = null;

function setDbPath(p) { DB_PATH = p; }
function getDbPath() { return DB_PATH; }
function setAfterWriteHook(fn) { AFTER_WRITE_HOOK = typeof fn === 'function' ? fn : null; }

// Sub-directories
function getPropertiesPath() { return path.join(DB_PATH, 'Properties'); }
function getTownsPath() { return path.join(DB_PATH, 'Towns'); }
function getGlobalsPath() { return path.join(DB_PATH, 'Global'); }
function getBackupInfoPath() { return path.join(DB_PATH, 'backup_info.json'); }

function ensureDir(dirPath) {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function withFileWriteLock(filePath, fn) {
  const key = String(filePath || '');
  const prev = writeChains.get(key) || Promise.resolve();
  const next = prev.then(() => fn());
  // Keep the chain moving even if this operation fails.
  writeChains.set(key, next.catch(() => {}));
  return next;
}

async function writeWorkbookAtomic(targetPath, workbook) {
  ensureDir(path.dirname(targetPath));
  const base = path.basename(targetPath);
  // Temp file name includes a recognizable marker so backup can ignore it.
  const tempPath = path.join(
    path.dirname(targetPath),
    `${base}.__tmp_write__${process.pid}__${Date.now()}`
  );

  // Signal file watcher to ignore our own writes
  try {
    const { signalWriteStart, signalWriteDone } = require('./fileWatcher');
    signalWriteStart();
    setTimeout(() => signalWriteDone(targetPath), 3000);
  } catch {}

  await workbook.xlsx.writeFile(tempPath);
  try {
    if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
    fs.renameSync(tempPath, targetPath);
  } catch (e) {
    try { if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true }); } catch (_) {}
    throw e;
  }
}

function relFromDb(filePath) {
  const rel = path.relative(DB_PATH, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel;
}

function timestampSlug(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-');
}

function configureMirrors({ desktopRoot, immutableRoot }) {
  MIRRORS.desktopRoot = desktopRoot || '';
  MIRRORS.immutableRoot = immutableRoot || '';
  MIRRORS.enabled = !!(MIRRORS.desktopRoot && MIRRORS.immutableRoot);
  if (!MIRRORS.enabled) return;
  ensureDir(MIRRORS.desktopRoot);
  ensureDir(path.join(MIRRORS.immutableRoot, 'Base'));
  ensureDir(path.join(MIRRORS.immutableRoot, 'Edited'));
}

function syncMirrorsForFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const rel = relFromDb(filePath);
  if (!rel) return;
  try {
    if (AFTER_WRITE_HOOK) AFTER_WRITE_HOOK({ filePath, relPath: rel });
  } catch (e) {
    console.warn('[core] after-write hook failed:', e.message);
  }
  if (!MIRRORS.enabled) return;

  // Desktop mirror always updated
  const desktopDest = path.join(MIRRORS.desktopRoot, rel);
  ensureDir(path.dirname(desktopDest));
  fs.copyFileSync(filePath, desktopDest);

  // Immutable base never overwritten; edits go to Edited snapshots
  const baseDest = path.join(MIRRORS.immutableRoot, 'Base', rel);
  ensureDir(path.dirname(baseDest));
  if (!fs.existsSync(baseDest)) {
    fs.copyFileSync(filePath, baseDest);
  } else {
    const day = new Date().toISOString().split('T')[0];
    const ext = path.extname(rel);
    const baseName = path.basename(rel, ext);
    const dir = path.dirname(rel);
    const editedDest = path.join(
      MIRRORS.immutableRoot,
      'Edited',
      day,
      dir,
      `${baseName}__${timestampSlug()}${ext}`
    );
    ensureDir(path.dirname(editedDest));
    fs.copyFileSync(filePath, editedDest);
  }

}

function toFriendlyHeader(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function sheetUsesKeyRow2(sheet) {
  if (!sheet || sheet.rowCount < 2) return false;
  const row2 = sheet.getRow(2);
  let hits = 0;
  row2.eachCell((cell) => {
    const v = cell.value;
    if (typeof v === 'string' && /[A-Za-z]+_[A-Za-z]+/.test(v)) hits += 1;
  });
  return hits >= 2; // enough signal this is the internal key row
}

function getHeaderKeys(sheet) {
  const keys = [];
  const keyRowNumber = sheetUsesKeyRow2(sheet) ? 2 : 1;
  sheet.getRow(keyRowNumber).eachCell((cell, colNumber) => {
    keys[colNumber] = cell.value;
  });
  return { keys, keyRowNumber, firstDataRowNumber: keyRowNumber + 1 };
}

function styleHeaderRow(sheet, rowNumber) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: 'FF111827' }, size: 12 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 20;
}

function createSheetWithFriendlyHeaders(workbook, sheetName, keys) {
  const sheet = workbook.addWorksheet(sheetName || 'Data');
  // Row 1: Friendly headers (visible)
  sheet.addRow(keys.map(toFriendlyHeader));
  // Row 2: Internal keys (hidden) used by code
  sheet.addRow(keys);
  sheet.getRow(2).hidden = true;

  // Column widths
  keys.forEach((k, idx) => {
    sheet.getColumn(idx + 1).width = Math.max(14, Math.min(28, String(toFriendlyHeader(k)).length + 8));
  });

  styleHeaderRow(sheet, 1);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

function appendMissingColumns(sheet, columns) {
  if (!sheet || !Array.isArray(columns) || columns.length === 0) return false;
  const { keys, keyRowNumber } = getHeaderKeys(sheet);
  const existingKeys = new Set(keys.filter(Boolean).map(String));
  const missing = columns
    .map(String)
    .filter((key) => key && !key.startsWith('_') && !existingKeys.has(key));
  if (missing.length === 0) return false;

  const keyRow = sheet.getRow(keyRowNumber);
  const hasFriendlyHeader = keyRowNumber > 1;
  const headerRow = hasFriendlyHeader ? sheet.getRow(keyRowNumber - 1) : null;
  let nextCol = sheet.columnCount + 1;

  for (const col of missing) {
    keyRow.getCell(nextCol).value = col;
    if (headerRow) headerRow.getCell(nextCol).value = toFriendlyHeader(col);
    keyRow.getCell(nextCol).font = { bold: true };
    nextCol++;
  }
  if (headerRow) styleHeaderRow(sheet, keyRowNumber - 1);
  return true;
}

async function initializeDatabase(dbPath) {
  setDbPath(dbPath);

  const dirs = [
    getPropertiesPath(),
    getTownsPath(),
    getGlobalsPath(),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Create global files if they don't exist
  // Migrate old CEO_Admin_Expenses.xlsx to CEO_Expenses.xlsx
  const oldCeoPath = path.join(getGlobalsPath(), 'CEO_Admin_Expenses.xlsx');
  const newCeoPath = path.join(getGlobalsPath(), 'CEO_Expenses.xlsx');
  if (fs.existsSync(oldCeoPath) && !fs.existsSync(newCeoPath)) {
    fs.renameSync(oldCeoPath, newCeoPath);
  }

  const globalFiles = [
  { name: 'All_Sales.xlsx', columns: ['Sale_ID','Plot_Shop_Number','Type','Town_Name','Customer_Name','CNIC','Phone_Number','Sell_Date','Expected_Amount_PKR','Deal_Amount_PKR','Discount_Amount_PKR','Total_Amount_PKR','Advance_Amount_PKR','Total_Installments','Total_Period_Months','Gap_Days','Gap_Label','Monthly_Installment','Received_Amount','Remaining_Amount','Agent_Name','Commission_Rate','Commission_Amount','Company_Income','Expense_Total','Profit_Loss','Receipt_Number','File_Status','File_Delivery_Image','Status','Sale_Type','Payment_Method','Cheque_Number','Cheque_Bank','Cheque_Image','Transaction_ID','Transfer_Bank','Transfer_Image'] },
  { name: 'All_Expenses.xlsx', columns: ['Expense_ID','Town_Name','Expense_Name','Amount_PKR','Description','Category','Date','Added_By'] },
  { name: 'Installments_Tracker.xlsx', columns: ['Tracker_ID','Plot_Shop_Number','Type','Town_Name','Customer_Name','Phone_Number','Monthly_Amount','Due_Date','Status','Paid_Date','Month_Number','Total_Months','Received_Amount','Remaining_Amount','Agent_Name'] },
  { name: 'CEO_Expenses.xlsx', columns: ['Expense_ID','Town_Name','Expense_Name','Amount_PKR','Description','Category','Date','Town_Income','Expense_Limit','Is_Over_Limit'] },
  { name: 'CEO_Salary.xlsx', columns: ['Salary_ID','Town_Name','Month_Year','Amount_PKR','Date_Recorded','Notes'] },
  { name: 'Salary_Records.xlsx', columns: ['Receipt_Number','Date','Month','Type','Name','Designation','Amount','Town_Name','Note','Paid_By','Advance_Deduction','New_Advance_Given','Salary_Amount','Salary_Gross_Amount','Cash_Disbursed_Amount','Salary_Paid_Amount','Salary_Paid_Before','Salary_Paid_After','Salary_Remaining_After','Is_Advance_Salary'] },
  { name: 'Commissions.xlsx', columns: ['Commission_ID','Sale_ID','Town_Name','Plot_Shop_Number','Agent_Name','Agent_Email','Commission_Amount','Paid_Amount','Remaining_Amount','Status','Paid_Date','Last_Paid_Date','Created_At'] },
  { name: 'Collection_Payments.xlsx', columns: ['Payment_ID','Sale_ID','Type','Plot_Shop_Number','Town_Name','Customer_Name','Agent_Name','Amount','Received_Before','Received_After','Remaining_After','Payment_Date','Payment_Method','Notes','Receipt_Number','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'] },
  { name: 'Resell_History.xlsx', columns: ['Resell_ID','Plot_Shop_Number','Type','Town_Name','Original_Customer','Original_Sell_Date','Original_Amount','Resell_Amount','Refund_Amount','Resell_Date','Receipt_Number','Agent_Name','Profit_Loss'] },
  { name: 'Money_Ledger.xlsx', columns: ['Ledger_ID','Town_Name','Date','Source_Type','Source_ID','Direction','Amount','Debit_Account','Credit_Account','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type','Party_Name','Description','Receipt_Number','Status','Created_By','Created_At'] },
  { name: 'Cash_Bank_Accounts.xlsx', columns: ['Account_ID','Town_Name','Account_Name','Account_Type','Opening_Balance','Status','Created_At','Updated_At','Sync_Status'] },
  { name: 'Town_Financial_Summary.xlsx', columns: ['Town_Name','Total_Received','Total_Expenses','Cash_Balance','Pending_Collection','Investor_Balance','Updated_At'] },
  { name: 'Media_Library.xlsx', columns: ['Media_ID','Town_Name','Type','Title','File_Path','Pdf_Path','Excel_Path','Html_Path','Account_Name','Property_Number','Receipt_Number','Report_Date','From_Date','To_Date','Created_At'] },
  { name: 'Pending_Sync.xlsx', columns: ['Sync_ID','Operation','Table_Name','Client_Write_ID','Payload_JSON','Status','Retry_Count','Last_Error','Created_At','Updated_At'] },

    { name: 'Notifications_Log.xlsx', columns: ['Notification_ID','Type','Message','Plot_Shop_Number','Town_Name','Customer_Name','Due_Date','Created_Date','Status','Dismissed'] },
    { name: 'Profit_Loss_Report.xlsx', columns: ['Report_ID','Town_Name','Total_Income','Total_Expenses','CEO_Expenses','CEO_Salary','Commissions','Net_Profit_Loss','Report_Date'] },
    { name: 'Employees.xlsx', columns: ['Employee_ID','Employee_Name','CNIC','Phone_Number','Salary','Date_Added','Status'] },
  ];

  for (const gf of globalFiles) {
    const filePath = path.join(getGlobalsPath(), gf.name);
    if (!fs.existsSync(filePath)) {
      const workbook = new ExcelJS.Workbook();
      createSheetWithFriendlyHeaders(workbook, 'Data', gf.columns);
      await workbook.xlsx.writeFile(filePath);
    }
  }
}

async function readExcelFile(filePath, sheetName) {
  if (!fs.existsSync(filePath)) return [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(sheetName || 1);
  if (!sheet) return [];
  
  const rows = [];
  const { keys, firstDataRowNumber } = getHeaderKeys(sheet);

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < firstDataRowNumber) return;
    const rowData = {};
    row.eachCell((cell, colNumber) => {
      const key = keys[colNumber];
      if (key) {
        rowData[key] = cell.value;
      }
    });
    if (Object.keys(rowData).length > 0) {
      rowData._rowNumber = rowNumber;
      rows.push(rowData);
    }
  });

  return rows;
}

async function appendToExcel(filePath, sheetName, rowData) {
  return withFileWriteLock(filePath, async () => {
    const workbook = new ExcelJS.Workbook();
    if (fs.existsSync(filePath)) {
      await workbook.xlsx.readFile(filePath);
    }
    let sheet = workbook.getWorksheet(sheetName || 'Data');
    if (!sheet) {
      sheet = workbook.addWorksheet(sheetName || 'Data');
    }
    
    // If sheet is empty (shouldn't happen), create keys from rowData
    if (sheet.rowCount < 1) {
      const keys = Object.keys(rowData).filter(k => !k.startsWith('_'));
      createSheetWithFriendlyHeaders(workbook, sheetName || 'Data', keys);
      sheet = workbook.getWorksheet(sheetName || 'Data');
    }

    appendMissingColumns(sheet, Object.keys(rowData || {}));

    const { keys, keyRowNumber } = getHeaderKeys(sheet);
    if (keyRowNumber === 1 && sheet.rowCount === 1) {
      // Legacy sheet with only a single header row; still ok.
    }

    // Add row
    const newRow = [];
    for (let i = 1; i <= keys.length; i++) {
      const key = keys[i];
      newRow.push(rowData[key] !== undefined ? rowData[key] : '');
    }
    sheet.addRow(newRow);
    await writeWorkbookAtomic(filePath, workbook);
    syncMirrorsForFile(filePath);
  });
}

async function updateExcelRow(filePath, sheetName, rowNumber, updates) {
  return withFileWriteLock(filePath, async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(sheetName || 'Data');
    if (!sheet) return;

    appendMissingColumns(sheet, Object.keys(updates || {}));
    const { keys } = getHeaderKeys(sheet);
    const headers = {};
    keys.forEach((k, idx) => {
      if (k) headers[k] = idx;
    });

    const row = sheet.getRow(rowNumber);
    for (const [key, value] of Object.entries(updates)) {
      if (headers[key]) {
        row.getCell(headers[key]).value = value;
      }
    }
    await writeWorkbookAtomic(filePath, workbook);
    syncMirrorsForFile(filePath);
  });
}

async function deleteExcelRow(filePath, sheetName, rowNumber) {
  return withFileWriteLock(filePath, async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(sheetName || 'Data');
    if (!sheet) return;
    sheet.spliceRows(rowNumber, 1);
    await writeWorkbookAtomic(filePath, workbook);
    syncMirrorsForFile(filePath);
  });
}

async function ensureSheetColumns(filePath, sheetName, columns) {
  return withFileWriteLock(filePath, async () => {
    if (!fs.existsSync(filePath)) return;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(sheetName || 'Data');
    if (!sheet) return;

    const changed = appendMissingColumns(sheet, columns);
    if (!changed) return;

    await writeWorkbookAtomic(filePath, workbook);
    syncMirrorsForFile(filePath);
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

module.exports = {
  setDbPath,
  getDbPath,
  getPropertiesPath,
  getTownsPath,
  getGlobalsPath,
  getBackupInfoPath,
  configureMirrors,
  setAfterWriteHook,
  syncMirrorsForFile,
  getHeaderKeys,
  initializeDatabase,
  readExcelFile,
  appendToExcel,
  // Used by other DB modules for read-modify-write safety.
  withFileWriteLock,
  writeWorkbookAtomic,
  updateExcelRow,
  deleteExcelRow,
  generateId,
  ensureSheetColumns,
  // File integrity
  hashExcelFile,
  verifyAllFileHashes,
  updateAllFileHashes,
};

// ═══════════════════════════════════════════════════════════════
// FILE INTEGRITY — SHA-256 hash for Excel files
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');

async function hashExcelFile(filePath) {
  const content = await fs.promises.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function verifyAllFileHashes() {
  const hashPath = path.join(DB_PATH, 'Global', 'File_Integrity_Hashes.json');
  if (!fs.existsSync(hashPath)) return { valid: true, message: 'No baseline hashes yet' };
  const hashes = JSON.parse(fs.readFileSync(hashPath, 'utf-8'));
  const results = {};
  let allValid = true;
  for (const [relPath, expectedHash] of Object.entries(hashes)) {
    const fullPath = path.join(DB_PATH, relPath);
    if (!fs.existsSync(fullPath)) {
      results[relPath] = 'MISSING';
      allValid = false;
    } else {
      const actualHash = await hashExcelFile(fullPath);
      if (actualHash !== expectedHash) {
        results[relPath] = 'TAMPERED';
        allValid = false;
      } else {
        results[relPath] = 'OK';
      }
    }
  }
  return { valid: allValid, details: results };
}

async function updateAllFileHashes() {
  const hashes = {};
  const dirs = [
    path.join(DB_PATH, 'Global'),
    path.join(DB_PATH, 'Towns'),
    path.join(DB_PATH, 'Properties'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.xlsx')) continue;
        const rel = path.relative(DB_PATH, full);
        hashes[rel] = await hashExcelFile(full);
      }
    };
    walk(dir);
  }
  const hashPath = path.join(DB_PATH, 'Global', 'File_Integrity_Hashes.json');
  fs.writeFileSync(hashPath, JSON.stringify(hashes, null, 2));
  return hashes;
}
