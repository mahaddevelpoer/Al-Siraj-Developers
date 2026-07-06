const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const {
  getGlobalsPath,
  readExcelFile,
  appendToExcel,
  updateExcelRow,
  ensureSheetColumns,
  generateId,
  withFileWriteLock,
  writeWorkbookAtomic,
  syncMirrorsForFile,
} = require('./core');

const FILE_NAME = 'Pending_Sync.xlsx';
const MAX_RETRY_COUNT = 10;
const COLUMNS = [
  'Sync_ID','Operation','Table_Name','Client_Write_ID','Payload_JSON','Status',
  'Retry_Count','Last_Error','Created_At','Updated_At'
];

function filePath() {
  return path.join(getGlobalsPath(), FILE_NAME);
}

async function ensurePendingSyncFile() {
  const fp = filePath();
  if (!fs.existsSync(fp)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(COLUMNS.map(c => c.replace(/_/g, ' ')));
    sheet.addRow(COLUMNS);
    sheet.getRow(2).hidden = true;
    COLUMNS.forEach((c, i) => { sheet.getColumn(i + 1).width = Math.max(14, Math.min(34, c.length + 8)); });
    await withFileWriteLock(fp, async () => {
      await writeWorkbookAtomic(fp, workbook);
      syncMirrorsForFile(fp);
    });
  } else {
    await ensureSheetColumns(fp, 'Data', COLUMNS);
  }
  return fp;
}

async function addPendingSync({ operation = 'upsert', tableName = 'unknown', clientWriteId, payload, error }) {
  const fp = await ensurePendingSyncFile();
  const rows = await readExcelFile(fp, 'Data');
  const stableId = clientWriteId || generateId();
  const existing = rows.find(r =>
    String(r.Client_Write_ID || '') === String(stableId) &&
    String(r.Status || '').toLowerCase() === 'pending'
  );
  const now = new Date().toISOString();
  if (existing?._rowNumber) {
    await updateExcelRow(fp, 'Data', existing._rowNumber, {
      Last_Error: error || existing.Last_Error || '',
      Updated_At: now,
    });
    return { ...existing, duplicate: true };
  }
  const row = {
    Sync_ID: generateId(),
    Operation: operation,
    Table_Name: tableName,
    Client_Write_ID: stableId,
    Payload_JSON: JSON.stringify(payload || {}),
    Status: 'pending',
    Retry_Count: 0,
    Last_Error: error || '',
    Created_At: now,
    Updated_At: now,
  };
  await appendToExcel(fp, 'Data', row);
  return row;
}

async function getPendingSyncRows() {
  const fp = await ensurePendingSyncFile();
  const rows = await readExcelFile(fp, 'Data');
  return rows.filter(r => String(r.Status || '').toLowerCase() === 'pending');
}

async function markAllPendingSynced() {
  const fp = await ensurePendingSyncFile();
  const rows = await readExcelFile(fp, 'Data');
  const now = new Date().toISOString();
  for (const row of rows) {
    if (String(row.Status || '').toLowerCase() === 'pending' && row._rowNumber) {
      await updateExcelRow(fp, 'Data', row._rowNumber, {
        Status: 'synced',
        Updated_At: now,
      });
    }
  }
}

async function markPendingSynced(clientWriteId) {
  if (!clientWriteId) return;
  const fp = await ensurePendingSyncFile();
  const rows = await readExcelFile(fp, 'Data');
  const now = new Date().toISOString();
  for (const row of rows) {
    if (
      String(row.Client_Write_ID || '') === String(clientWriteId) &&
      String(row.Status || '').toLowerCase() === 'pending' &&
      row._rowNumber
    ) {
      await updateExcelRow(fp, 'Data', row._rowNumber, {
        Status: 'synced',
        Updated_At: now,
      });
    }
  }
}

async function markPendingAttemptFailed(error) {
  const fp = await ensurePendingSyncFile();
  const rows = await readExcelFile(fp, 'Data');
  const now = new Date().toISOString();
  const message = error && error.message ? error.message : String(error || 'Sync failed');
  for (const row of rows) {
    if (String(row.Status || '').toLowerCase() === 'pending' && row._rowNumber) {
      const retryCount = (parseInt(row.Retry_Count, 10) || 0) + 1;
      if (retryCount >= MAX_RETRY_COUNT) {
        // Mark as permanently failed after max retries
        await updateExcelRow(fp, 'Data', row._rowNumber, {
          Retry_Count: retryCount,
          Status: 'failed',
          Last_Error: `FAILED after ${retryCount} retries: ${message}`,
          Updated_At: now,
        });
      } else {
        await updateExcelRow(fp, 'Data', row._rowNumber, {
          Retry_Count: retryCount,
          Last_Error: message,
          Updated_At: now,
        });
      }
    }
  }
}

async function hasPendingSyncRows() {
  const rows = await getPendingSyncRows();
  return rows.length > 0;
}

module.exports = {
  FILE_NAME,
  COLUMNS,
  ensurePendingSyncFile,
  addPendingSync,
  getPendingSyncRows,
  markAllPendingSynced,
  markPendingSynced,
  markPendingAttemptFailed,
  hasPendingSyncRows,
};
