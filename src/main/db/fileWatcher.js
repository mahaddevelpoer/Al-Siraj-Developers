/**
 * FileWatcher — Detect external Excel file modifications
 *
 * Watches all Excel files in Global/, Towns/, Properties/ directories.
 * On every file change, compares SHA-256 hash against the baseline.
 * If hash changed but NOT from our app's write hook → external tamper detected.
 * Sends desktop notification + IPC event to renderer toast.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Notification } = require('electron');

let watchers = [];
let fileHashes = {}; // filePath → last known hash (from our writes)
let scanInterval = null;
let isWriting = false; // Set by write hook to suppress false positives
let writeGracePeriod = 3000; // ms — ignore changes within this window after our write

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

function buildBaseline(dbPath) {
  const baseline = {};
  const dirs = [
    path.join(dbPath, 'Global'),
    path.join(dbPath, 'Towns'),
    path.join(dbPath, 'Properties'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      try {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) { walk(full); continue; }
          if (!entry.name.endsWith('.xlsx')) continue;
          const h = hashFile(full);
          if (h) baseline[full] = h;
        }
      } catch {}
    };
    walk(dir);
  }
  return baseline;
}

function sendTamperAlert(filePath, relPath, mainWindow) {
  // Desktop notification
  try {
    const notif = new Notification({
      title: '⚠️ File Tamper Detected',
      body: `Excel file was modified outside the app: ${relPath}`,
      icon: path.join(__dirname, '../../public/splash.png'),
      urgency: 'critical',
      silent: false,
    });
    notif.show();
  } catch {}

  // IPC event to renderer (shows toast)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file-tamper-alert', {
      filePath,
      relPath,
      timestamp: new Date().toISOString(),
      message: `SECURITY: Excel file was modified outside the app — ${relPath}`,
    });
  }

  // Log
  console.error(`[file-watcher] TAMPER DETECTED: ${relPath}`);
}

function startFileWatcher(dbPath, mainWindow) {
  stopFileWatcher();
  fileHashes = buildBaseline(dbPath);

  const dirs = [
    path.join(dbPath, 'Global'),
    path.join(dbPath, 'Towns'),
    path.join(dbPath, 'Properties'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      // fs.watch fires on changes — but can be flaky on Windows
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.xlsx')) return;
        if (isWriting) return; // Our own write — skip

        const fullPath = path.join(dir, filename);
        if (!fs.existsSync(fullPath)) return;

        const newHash = hashFile(fullPath);
        if (!newHash) return;

        const oldHash = fileHashes[fullPath];
        if (oldHash && newHash !== oldHash) {
          const relPath = path.relative(dbPath, fullPath);
          sendTamperAlert(fullPath, relPath, mainWindow);
        }
        // Update baseline so we don't alert again for the same change
        fileHashes[fullPath] = newHash;
      });
      watchers.push(watcher);
    } catch (e) {
      console.warn(`[file-watcher] Could not watch ${dir}:`, e.message);
    }
  }

  // Fallback: periodic scan every 30 seconds (catches what fs.watch misses)
  scanInterval = setInterval(() => {
    if (isWriting) return;
    const currentHashes = buildBaseline(dbPath);
    for (const [filePath, newHash] of Object.entries(currentHashes)) {
      const oldHash = fileHashes[filePath];
      if (oldHash && newHash !== oldHash) {
        const relPath = path.relative(dbPath, filePath);
        sendTamperAlert(filePath, relPath, mainWindow);
      }
    }
    // Merge new files into baseline
    Object.assign(fileHashes, currentHashes);
  }, 30000);

  console.log('[file-watcher] Started watching Excel files');
}

function stopFileWatcher() {
  for (const w of watchers) {
    try { w.close(); } catch {}
  }
  watchers = [];
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  console.log('[file-watcher] Stopped');
}

function signalWriteStart() {
  isWriting = true;
  setTimeout(() => { isWriting = false; }, writeGracePeriod);
}

function signalWriteDone(filePath) {
  // Update baseline hash immediately after our write
  if (filePath && fs.existsSync(filePath)) {
    const h = hashFile(filePath);
    if (h) fileHashes[filePath] = h;
  }
}

function getBaseline() {
  return { ...fileHashes };
}

module.exports = {
  startFileWatcher,
  stopFileWatcher,
  signalWriteStart,
  signalWriteDone,
  buildBaseline,
  getBaseline,
};
