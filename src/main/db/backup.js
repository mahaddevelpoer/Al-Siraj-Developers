const path = require('path');
const fs = require('fs');
const { getBackupInfoPath } = require('./core');

function findBackupDrive() {
  const drives = ['D:', 'E:', 'F:', 'G:'];
  for (const drive of drives) {
    try {
      if (fs.existsSync(drive + '\\')) return drive;
    } catch (e) { /* skip */ }
  }
  return 'C:';
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      // Ignore in-progress atomic write temp files.
      if (entry.name.includes('__tmp_write__') || entry.name.includes('.tmp-')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

let backupInProgress = false;

async function performBackup(dbPath) {
  try {
    if (backupInProgress) {
      return { success: true, skipped: true, error: 'Backup already in progress' };
    }
    backupInProgress = true;
    const drive = findBackupDrive();
    const backupRoot = path.join(drive + '\\', 'TownEstate_Backup');
    // Include time to avoid same-day folder collisions.
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_');
    const backupDir = path.join(backupRoot, `Backup_${timestamp}`);
    copyDirSync(dbPath, backupDir);
    const infoPath = getBackupInfoPath();
    fs.writeFileSync(infoPath, JSON.stringify({ lastBackup: new Date().toISOString(), location: backupDir, drive }, null, 2));
    return { success: true, location: backupDir };
  } catch (err) {
    console.error('Backup failed:', err);
    return { success: false, error: err.message };
  } finally {
    backupInProgress = false;
  }
}

function startBackupScheduler(dbPath) {
  const infoPath = getBackupInfoPath();
  let lastBackup = null;
  if (fs.existsSync(infoPath)) {
    try {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
      lastBackup = new Date(info.lastBackup);
    } catch (e) { /* ignore */ }
  }
  const now = new Date();
  if (!lastBackup || (now - lastBackup) > 24 * 60 * 60 * 1000) {
    setTimeout(() => performBackup(dbPath), 5000);
  }
  setInterval(() => performBackup(dbPath), 24 * 60 * 60 * 1000);
}

module.exports = { performBackup, startBackupScheduler };
