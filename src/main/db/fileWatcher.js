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
let fileHashes = {}; // Normalized filePath → last known hash (from our writes)
let scanInterval = null;
let isWriting = false; // Set by write hook to suppress false positives (legacy compatibility)
let writeGracePeriod = 3000; // ms — ignore changes within this window after our write

// Set of normalized file paths currently being written by our app
const writingFiles = new Set();

function normalizePath(p) {
  if (!p) return '';
  try {
    return path.resolve(p).replace(/\\/g, '/').toLowerCase();
  } catch {
    return String(p).replace(/\\/g, '/').toLowerCase();
  }
}

function hashFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
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
          const norm = normalizePath(full);
          const h = hashFile(full);
          if (h && norm) baseline[norm] = h;
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

function isFileTamperingCheckEnabled(dbPath) {
  try {
    const settingsPath = path.join(dbPath, 'Global', 'System_Settings.json');
    if (fs.existsSync(settingsPath)) {
      const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (config.file_tampering_check_enabled === false || config.file_tampering_check_enabled === 'false') {
        return false;
      }
    }
  } catch (e) {
    console.error('[file-watcher] Error reading system settings:', e.message);
  }
  return true; // default to enabled
}

function startFileWatcher(dbPath, mainWindow) {
  stopFileWatcher();
  if (!isFileTamperingCheckEnabled(dbPath)) {
    console.log('[file-watcher] File Tampering Integrity Check is disabled by CEO.');
    return;
  }

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

        const fullPath = path.join(dir, filename);
        const norm = normalizePath(fullPath);

        // Skip if this file is currently flagged as being written by our app, or if global override is active
        if (writingFiles.has(norm) || isWriting) return;

        if (!fs.existsSync(fullPath)) return;

        const newHash = hashFile(fullPath);
        if (!newHash) return;

        const oldHash = fileHashes[norm];
        if (oldHash && newHash !== oldHash) {
          const relPath = path.relative(dbPath, fullPath);
          sendTamperAlert(fullPath, relPath, mainWindow);
        }
        // Update baseline so we don't alert again for the same change
        fileHashes[norm] = newHash;
      });
      watchers.push(watcher);
    } catch (e) {
      console.warn(`[file-watcher] Could not watch ${dir}:`, e.message);
    }
  }

  // Fallback: periodic scan every 30 seconds (catches what fs.watch misses)
  scanInterval = setInterval(() => {
    const currentHashes = buildBaseline(dbPath);
    for (const [normPath, newHash] of Object.entries(currentHashes)) {
      if (writingFiles.has(normPath) || isWriting) continue;

      const oldHash = fileHashes[normPath];
      if (oldHash && newHash !== oldHash) {
        // Find the actual file path from normalized path or construct it
        // Since normPath is resolved/lowercase, we find its relative path
        const relPath = path.relative(dbPath, normPath);
        sendTamperAlert(normPath, relPath, mainWindow);
      }
    }
    // Merge new files/hashes into baseline (only if not currently writing them)
    for (const [normPath, newHash] of Object.entries(currentHashes)) {
      if (!writingFiles.has(normPath)) {
        fileHashes[normPath] = newHash;
      }
    }
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

function signalWriteStart(filePath) {
  isWriting = true;
  
  if (filePath) {
    const norm = normalizePath(filePath);
    if (norm) {
      writingFiles.add(norm);
      // Safety timeout: remove from active writes after 10s if signalWriteDone is not called
      setTimeout(() => {
        writingFiles.delete(norm);
      }, 10000);
    }
  }

  // Global legacy safety timeout
  setTimeout(() => {
    isWriting = false;
  }, writeGracePeriod);
}

function signalWriteDone(filePath) {
  if (filePath) {
    const norm = normalizePath(filePath);
    if (norm) {
      // Update baseline hash immediately to the current file content
      if (fs.existsSync(filePath)) {
        const h = hashFile(filePath);
        if (h) {
          fileHashes[norm] = h;
        }
      }
      // Hold the file in the writingFiles set for 1.5 seconds to absorb delayed OS events
      setTimeout(() => {
        writingFiles.delete(norm);
        isWriting = false;
      }, 1500);
      return;
    }
  }
  
  // Fallback for parameterless calls
  isWriting = false;
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
