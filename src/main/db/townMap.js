const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const {
  getGlobalsPath,
  readExcelFile,
  appendToExcel,
  updateExcelRow,
  deleteExcelRow,
  generateId,
  ensureSheetColumns,
  withFileWriteLock,
  writeWorkbookAtomic,
  syncMirrorsForFile,
} = require('./core');

const FILE_NAME = 'Town_Map_Shapes.xlsx';
const COLUMNS = [
  'Shape_ID',
  'Town_Name',
  'Property_Type',
  'Property_Number',
  'Shape_Type',
  'Label',
  'Status',
  'Geometry_JSON',
  'Style_JSON',
  'Sort_Order',
  'Updated_At',
];

function filePath() {
  return path.join(getGlobalsPath(), FILE_NAME);
}

async function ensureTownMapFile() {
  const fp = filePath();
  if (!fs.existsSync(fp)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(COLUMNS.map((c) => c.replace(/_/g, ' ')));
    sheet.addRow(COLUMNS);
    sheet.getRow(2).hidden = true;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    COLUMNS.forEach((c, i) => {
      sheet.getColumn(i + 1).width = Math.max(14, Math.min(34, c.length + 6));
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

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

function toRow(shape, townName, index = 0) {
  const geometry = shape.geometry || safeJson(shape.Geometry_JSON);
  const style = shape.style || safeJson(shape.Style_JSON);
  return {
    Shape_ID: shape.Shape_ID || shape.shapeId || shape.id || generateId(),
    Town_Name: shape.Town_Name || shape.townName || townName || '',
    Property_Type: shape.Property_Type || shape.propertyType || '',
    Property_Number: shape.Property_Number || shape.propertyNumber || '',
    Shape_Type: shape.Shape_Type || shape.shapeType || shape.type || 'plot',
    Label: shape.Label || shape.label || '',
    Status: shape.Status || shape.status || 'available',
    Geometry_JSON: typeof geometry === 'string' ? geometry : JSON.stringify(geometry || {}),
    Style_JSON: typeof style === 'string' ? style : JSON.stringify(style || {}),
    Sort_Order: Number(shape.Sort_Order ?? shape.sortOrder ?? index) || 0,
    Updated_At: shape.Updated_At || shape.updatedAt || new Date().toISOString(),
  };
}

function fromRow(row) {
  return {
    id: row.Shape_ID,
    shapeId: row.Shape_ID,
    townName: row.Town_Name || '',
    propertyType: row.Property_Type || '',
    propertyNumber: row.Property_Number || '',
    type: row.Shape_Type || 'plot',
    label: row.Label || '',
    status: String(row.Status || 'available').toLowerCase(),
    geometry: safeJson(row.Geometry_JSON),
    style: safeJson(row.Style_JSON),
    sortOrder: Number(row.Sort_Order) || 0,
    updatedAt: row.Updated_At || '',
  };
}

async function getTownMapShapes(townName) {
  const town = String(townName || '').trim();
  const fp = await ensureTownMapFile();
  const rows = await readExcelFile(fp, 'Data');
  return rows
    .filter((row) => !town || String(row.Town_Name || '') === town)
    .map(fromRow)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

async function saveTownMapShapes(townName, shapes = []) {
  const town = String(townName || '').trim();
  if (!town) throw new Error('Town name is required');
  const fp = await ensureTownMapFile();
  const rows = await readExcelFile(fp, 'Data');
  const existingById = new Map(rows.map((row) => [String(row.Shape_ID || ''), row]));
  const incomingIds = new Set();

  for (let i = 0; i < shapes.length; i += 1) {
    const row = toRow(shapes[i], town, i);
    incomingIds.add(String(row.Shape_ID));
    const existing = existingById.get(String(row.Shape_ID));
    if (existing?._rowNumber) await updateExcelRow(fp, 'Data', existing._rowNumber, row);
    else await appendToExcel(fp, 'Data', row);
  }

  const toDelete = rows
    .filter((row) => String(row.Town_Name || '') === town && !incomingIds.has(String(row.Shape_ID || '')))
    .map((row) => row._rowNumber)
    .filter(Boolean)
    .sort((a, b) => b - a);
  for (const rowNumber of toDelete) await deleteExcelRow(fp, 'Data', rowNumber);
  return { success: true, count: shapes.length };
}

async function deleteTownMapShape(shapeId) {
  const id = String(shapeId || '').trim();
  if (!id) throw new Error('Shape id is required');
  const fp = await ensureTownMapFile();
  const rows = await readExcelFile(fp, 'Data');
  const found = rows.find((row) => String(row.Shape_ID || '') === id);
  if (found?._rowNumber) await deleteExcelRow(fp, 'Data', found._rowNumber);
  return { success: true };
}

module.exports = {
  FILE_NAME,
  COLUMNS,
  ensureTownMapFile,
  getTownMapShapes,
  saveTownMapShapes,
  deleteTownMapShape,
  toRow,
  fromRow,
};
