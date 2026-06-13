const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const supabase = require('./supabase');
const { getDbPath, getGlobalsPath, getTownsPath, getPropertiesPath } = require('./core');
const { getAdminClient } = require('./syncHelpers');

const BUCKET_NAME = 'zameenkhata-files';
const STORAGE_ROOT = 'zameen-khata';
const CEO_ONLY_GLOBAL_FILES = new Set([
  'Global/CEO_Expenses.xlsx',
  'Global/CEO_Salary.xlsx',
  'Global/Employees.xlsx',
  'Global/Employees_V2.xlsx',
  'Global/Advance_Salaries.xlsx',
  'Global/Salary_Records.xlsx',
  'Global/Profit_Loss_Report.xlsx',
]);
const AGENT_OPERATIONAL_GLOBAL_FILES = new Set([
  'Global/All_Sales.xlsx',
  'Global/All_Expenses.xlsx',
  'Global/Installments_Tracker.xlsx',
  'Global/Notifications_Log.xlsx',
  'Global/Daily_Entries.xlsx',
  'Global/Commissions.xlsx',
  'Global/Resell_History.xlsx',
]);

let syncContext = {
  role: 'ceo',
  userId: null,
  agentTown: '',
  agentTowns: [],
};
const uploadQueue = new Set();
let uploadInFlight = false;
let periodicTimer = null;
let storageAdmin = null;

function getStorageClient() {
  if (storageAdmin) return storageAdmin;
  try {
    storageAdmin = getAdminClient();
    return storageAdmin;
  } catch (_) {
    return supabase;
  }
}

function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function normalizeRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'accountant' || r === 'ceo' || r === 'agent') return r;
  return 'ceo';
}

function authorityRank(role = syncContext.role) {
  return normalizeRole(role) === 'agent' ? 10 : 100;
}

function normalizeRelPath(relPath) {
  return String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function toStoragePath(relPath) {
  const normalized = normalizeRelPath(relPath);
  return normalized.startsWith(`${STORAGE_ROOT}/`) ? normalized : `${STORAGE_ROOT}/${normalized}`;
}

function fromStoragePath(storagePath) {
  const normalized = normalizeRelPath(storagePath);
  return normalized.startsWith(`${STORAGE_ROOT}/`)
    ? normalized.slice(STORAGE_ROOT.length + 1)
    : normalized;
}

function setSyncContext(ctx = {}) {
  const role = normalizeRole(ctx.role || syncContext.role);
  const towns = [];
  if (Array.isArray(ctx.agentTowns)) towns.push(...ctx.agentTowns);
  if (ctx.agentTown) towns.push(ctx.agentTown);
  if (typeof ctx.agent_towns === 'string') towns.push(...ctx.agent_towns.split(','));
  if (typeof ctx.agent_town === 'string') towns.push(ctx.agent_town);
  syncContext = {
    role,
    userId: ctx.userId || ctx.id || syncContext.userId || null,
    agentTown: ctx.agentTown || ctx.agent_town || syncContext.agentTown || '',
    agentTowns: [...new Set(towns.map(t => String(t || '').trim()).filter(Boolean))],
  };
}

function getSyncContext() {
  return { ...syncContext, agentTowns: [...syncContext.agentTowns] };
}

function getAllLocalFiles(options = {}) {
  const results = [];
  const dbPath = getDbPath();
  if (!dbPath) return results;
  const scope = options.scope || null;

  const scan = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full, prefix ? path.join(prefix, entry.name) : entry.name);
      } else if (entry.isFile() && entry.name.endsWith('.xlsx')) {
        const relPath = prefix ? path.join(prefix, entry.name) : entry.name;
        const normalized = normalizeRelPath(relPath);
        if (!scope || scope.allowedFiles.has(normalized) || scope.allowedPrefixes.some(p => normalized.startsWith(p))) {
          results.push({ fullPath: full, relPath: normalized });
        }
      }
    }
  };

  scan(getGlobalsPath(), 'Global');
  scan(getTownsPath(), 'Towns');
  scan(getPropertiesPath(), 'Properties');

  return results;
}

async function buildAgentScope(ctx = syncContext) {
  const allowedFiles = new Set(AGENT_OPERATIONAL_GLOBAL_FILES);
  const allowedPrefixes = [];
  const towns = new Set((ctx.agentTowns || []).map(t => String(t || '').trim()).filter(Boolean));

  if (ctx.userId) {
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('agent_town, agent_towns')
        .eq('id', ctx.userId)
        .maybeSingle();
      if (userRow?.agent_town) towns.add(userRow.agent_town);
      if (userRow?.agent_towns) String(userRow.agent_towns).split(',').forEach(t => {
        const town = t.trim();
        if (town) towns.add(town);
      });
    } catch (_) {}

    try {
      const { data: accessRows } = await supabase
        .from('agent_property_access')
        .select('property_id, town_name')
        .eq('agent_id', ctx.userId);
      const propertyIds = (accessRows || []).map(r => r.property_id).filter(Boolean);
      (accessRows || []).forEach(r => { if (r.town_name) towns.add(r.town_name); });
      if (propertyIds.length) {
        const { data: props } = await supabase
          .from('properties')
          .select('id, property_type, property_number, town_name')
          .in('id', propertyIds);
        (props || []).forEach(p => {
          const town = p.town_name || p.Town_Name;
          const type = p.property_type || p.Property_Type;
          const number = p.property_number || p.Property_Number;
          if (town) towns.add(town);
          if (town && type && number) {
            allowedFiles.add(`Properties/${town}/${type}_${number}_${town}.xlsx`);
          }
        });
      }
    } catch (_) {}
  }

  towns.forEach(town => {
    allowedFiles.add(`Towns/${town}.xlsx`);
    allowedPrefixes.push(`Properties/${town}/`);
  });

  return { allowedFiles, allowedPrefixes };
}

async function buildScope(options = {}) {
  const ctx = { ...syncContext, ...(options.context || {}) };
  const role = normalizeRole(options.role || ctx.role);
  if (role === 'agent') return await buildAgentScope(ctx);
  return null;
}

async function getManifest() {
  const { data, error } = await supabase
    .from('file_manifest')
    .select('*')
    .order('file_path');
  if (error) throw error;
  return data || [];
}

async function upsertManifestItem(filePath, md5Hash, fileSize, options = {}) {
  const role = normalizeRole(options.role || syncContext.role);
  const manifestPath = toStoragePath(filePath);
  const payload = {
    md5_hash: md5Hash,
    file_size: fileSize,
    last_modified: new Date().toISOString(),
    uploaded_by_role: role,
    uploaded_by_user_id: options.userId || syncContext.userId || null,
    device_type: role === 'agent' ? 'agent_pc' : 'office_pc',
    authority_rank: authorityRank(role),
  };
  const { data: existing } = await supabase
    .from('file_manifest')
    .select('id')
    .eq('file_path', manifestPath)
    .maybeSingle();

  if (existing) {
    let { error } = await supabase
      .from('file_manifest')
      .update(payload)
      .eq('id', existing.id);
    if (error && String(error.message || '').includes('column')) {
      ({ error } = await supabase
        .from('file_manifest')
        .update({ md5_hash: md5Hash, file_size: fileSize, last_modified: payload.last_modified })
        .eq('id', existing.id));
    }
    if (error) throw error;
  } else {
    let { error } = await supabase
      .from('file_manifest')
      .insert({ file_path: manifestPath, ...payload });
    if (error && String(error.message || '').includes('column')) {
      ({ error } = await supabase
        .from('file_manifest')
        .insert({ file_path: manifestPath, md5_hash: md5Hash, file_size: fileSize, last_modified: payload.last_modified }));
    }
    if (error) throw error;
  }
}

async function uploadToStorage(relPath, fullPath, onProgress) {
  const content = fs.readFileSync(fullPath);
  const storagePath = toStoragePath(relPath);

  try {
    await getStorageClient().storage.from(BUCKET_NAME).remove([storagePath]);
  } catch (e) {
    console.warn('[storage] Pre-upload delete skipped for', relPath, e.message);
  }

  let { error } = await getStorageClient().storage
    .from(BUCKET_NAME)
    .upload(storagePath, content, { upsert: false, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  if (error && String(error.message || '').toLowerCase().includes('duplicate')) {
    try { await getStorageClient().storage.from(BUCKET_NAME).remove([storagePath]); } catch (_) {}
    ({ error } = await getStorageClient().storage
      .from(BUCKET_NAME)
      .upload(storagePath, content, { upsert: false, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  if (error) {
    throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`);
  }

  if (onProgress) onProgress(relPath);
  return true;
}

function backupLocalFile(targetPath, relPath) {
  if (!fs.existsSync(targetPath)) return null;
  const dbPath = getDbPath();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dbPath, '_sync_backups', stamp, normalizeRelPath(relPath));
  const dir = path.dirname(backupPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(targetPath, backupPath);
  return backupPath;
}

async function isWorkbookEffectivelyEmpty(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    for (const sheet of workbook.worksheets) {
      let dataRows = 0;
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 2) return;
        const hasValue = row.values.some((value, index) => index > 0 && value !== null && value !== undefined && String(value).trim() !== '');
        if (hasValue) dataRows++;
      });
      if (dataRows > 0) return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function downloadFromStorage(relPath, targetPath, onProgress) {
  const storagePath = toStoragePath(relPath);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { data, error } = await getStorageClient().storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) {
    console.warn('[storage] Download failed for', relPath, error.message);
    return false;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const tmp = path.join(dir, `${path.basename(targetPath)}.__tmp_download__${process.pid}__${Date.now()}`);
  fs.writeFileSync(tmp, buffer);
  if (fs.existsSync(targetPath)) backupLocalFile(targetPath, relPath);
  if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
  fs.renameSync(tmp, targetPath);

  if (onProgress) onProgress(relPath);
  return true;
}

async function downloadFromStorageLegacy(relPath, targetPath, onProgress) {
  const storagePath = normalizeRelPath(relPath);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { data, error } = await getStorageClient().storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) {
    console.warn('[storage] Legacy download failed for', relPath, error.message);
    return false;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const tmp = path.join(dir, `${path.basename(targetPath)}.__tmp_download__${process.pid}__${Date.now()}`);
  fs.writeFileSync(tmp, buffer);
  if (fs.existsSync(targetPath)) backupLocalFile(targetPath, relPath);
  if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
  fs.renameSync(tmp, targetPath);

  if (onProgress) onProgress(relPath);
  return true;
}

async function deleteFromStorage(relPath) {
  const storagePath = toStoragePath(relPath);
  const { error } = await getStorageClient().storage.from(BUCKET_NAME).remove([storagePath]);
  if (error) console.warn('[storage] Delete failed for', relPath, error.message);
}

function queueFile(relPath) {
  const normalized = normalizeRelPath(relPath);
  if (normalized && normalized.endsWith('.xlsx')) uploadQueue.add(normalized);
}

function queueFiles(relPaths = []) {
  for (const relPath of relPaths) queueFile(relPath);
}

function queueAllLocalFiles(options = {}) {
  for (const f of getAllLocalFiles(options)) uploadQueue.add(f.relPath);
}

async function uploadChangedFiles(onProgress, options = {}) {
  const scope = await buildScope(options);
  const localFiles = options.files
    ? options.files.map(relPath => {
        const normalized = normalizeRelPath(relPath);
        return { relPath: normalized, fullPath: path.join(getDbPath(), normalized) };
      }).filter(f => fs.existsSync(f.fullPath))
    : getAllLocalFiles({ scope });
  let manifest;
  try {
    manifest = await getManifest();
  } catch {
    manifest = [];
  }
  const manifestMap = {};
  for (const m of manifest) manifestMap[m.file_path] = m;

  let uploaded = 0;
  let skipped = 0;

  for (const { relPath, fullPath } of localFiles) {
    if (scope && !scope.allowedFiles.has(relPath) && !scope.allowedPrefixes.some(p => relPath.startsWith(p))) {
      skipped++;
      continue;
    }
    if (normalizeRole(options.role || syncContext.role) === 'agent' && CEO_ONLY_GLOBAL_FILES.has(relPath)) {
      skipped++;
      continue;
    }
    const hash = await computeFileHash(fullPath);
    const stat = fs.statSync(fullPath);
    const storagePath = toStoragePath(relPath);
    const existing = manifestMap[storagePath];

    if (existing && existing.md5_hash === hash) {
      skipped++;
      continue;
    }

    const existingRank = parseInt(existing?.authority_rank ?? (existing?.uploaded_by_role === 'agent' ? 10 : 100), 10);
    const newRank = authorityRank(options.role || syncContext.role);
    const existingTime = Date.parse(existing?.last_modified || existing?.uploaded_at || 0) || 0;
    if (existing && newRank < existingRank && existingTime >= stat.mtimeMs) {
      skipped++;
      continue;
    }

    const ok = await uploadToStorage(relPath, fullPath, onProgress);
    if (ok) {
      await upsertManifestItem(relPath, hash, stat.size, options);
      uploaded++;
    }
  }

  return { uploaded, skipped, total: localFiles.length };
}

async function flushUploadQueue(onProgress, options = {}) {
  if (uploadInFlight) return { uploaded: 0, skipped: 0, total: uploadQueue.size, inFlight: true };
  uploadInFlight = true;
  try {
    const files = [...uploadQueue];
    uploadQueue.clear();
    if (!files.length) return { uploaded: 0, skipped: 0, total: 0 };
    const result = await uploadChangedFiles(onProgress, { ...options, files });
    if (result.error) files.forEach(f => uploadQueue.add(f));
    return result;
  } catch (e) {
    throw e;
  } finally {
    uploadInFlight = false;
  }
}

async function downloadMissingFiles(onProgress, options = {}) {
  let manifest;
  try {
    manifest = await getManifest();
  } catch {
    return { downloaded: 0, skipped: 0, total: 0, error: 'Could not fetch file manifest' };
  }

  if (!manifest.length) return { downloaded: 0, skipped: 0, total: 0, error: 'No files in cloud manifest' };

  const hasRootManifest = manifest.some(item => normalizeRelPath(item.file_path).startsWith(`${STORAGE_ROOT}/`));
  if (hasRootManifest) {
    manifest = manifest.filter(item => normalizeRelPath(item.file_path).startsWith(`${STORAGE_ROOT}/`));
  }

  const dbPath = getDbPath();
  const scope = await buildScope(options);
  const role = normalizeRole(options.role || syncContext.role);
  let downloaded = 0;
  let skipped = 0;

  for (const item of manifest) {
    const filePath = fromStoragePath(item.file_path);
    if (scope && !scope.allowedFiles.has(filePath) && !scope.allowedPrefixes.some(p => filePath.startsWith(p))) {
      skipped++;
      continue;
    }
    if (role === 'agent' && CEO_ONLY_GLOBAL_FILES.has(filePath)) {
      skipped++;
      continue;
    }
    const targetPath = path.join(dbPath, filePath);
    const dir = path.dirname(targetPath);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let needsDownload = true;

    if (fs.existsSync(targetPath)) {
      try {
        const localHash = await computeFileHash(targetPath);
        if (localHash === item.md5_hash) {
          needsDownload = false;
          skipped++;
        } else if (await isWorkbookEffectivelyEmpty(targetPath)) {
          needsDownload = true;
        } else {
          const cloudRank = parseInt(item.authority_rank ?? (item.uploaded_by_role === 'agent' ? 10 : 100), 10);
          const localRank = authorityRank(role);
          const cloudTime = Date.parse(item.last_modified || item.uploaded_at || 0) || 0;
          const localTime = fs.statSync(targetPath).mtimeMs || 0;
          if ((localRank > cloudRank && localTime > cloudTime) || (localRank === cloudRank && localTime > cloudTime)) {
            needsDownload = false;
            skipped++;
          }
        }
      } catch {
        needsDownload = true;
      }
    }

    if (needsDownload) {
      const ok = hasRootManifest
        ? await downloadFromStorage(filePath, targetPath, onProgress)
        : await downloadFromStorageLegacy(filePath, targetPath, onProgress);
      if (ok) downloaded++;
    }
  }

  return { downloaded, skipped, total: manifest.length };
}

async function ensureBucket() {
  try {
    const { data: buckets } = await getStorageClient().storage.listBuckets();
    const exists = (buckets || []).some((b) => b.name === BUCKET_NAME);
    if (!exists) {
      const { error } = await getStorageClient().storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 52428800,
      });
      if (error) console.warn('[storage] Could not create bucket:', error.message);
    }
  } catch (e) {
    console.warn('[storage] ensureBucket error:', e.message);
  }
}

async function runFileSyncCycle(onProgress, options = {}) {
  await ensureBucket();
  const download = await downloadMissingFiles(onProgress, options);
  const upload = await flushUploadQueue(onProgress, options);
  return { success: true, upload, download };
}

function startPeriodicFileSync({ intervalMs = 5 * 60 * 1000, onProgress, onError } = {}) {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(() => {
    runFileSyncCycle(onProgress).catch((e) => {
      if (onError) onError(e);
    });
  }, intervalMs);
  return periodicTimer;
}

function stopPeriodicFileSync() {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = null;
}

module.exports = {
  computeFileHash,
  getAllLocalFiles,
  getManifest,
  setSyncContext,
  getSyncContext,
  queueFile,
  queueFiles,
  queueAllLocalFiles,
  flushUploadQueue,
  uploadToStorage,
  downloadFromStorage,
  deleteFromStorage,
  uploadChangedFiles,
  downloadMissingFiles,
  runFileSyncCycle,
  startPeriodicFileSync,
  stopPeriodicFileSync,
  ensureBucket,
  BUCKET_NAME,
  STORAGE_ROOT,
};
