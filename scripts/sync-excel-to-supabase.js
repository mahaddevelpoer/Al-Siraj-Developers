/**
 * One-time script to sync ALL Excel data to Supabase.
 * Run on the machine that has the full ZameenKhata_Database with all data.
 * 
 * Usage: node scripts/sync-excel-to-supabase.js
 */

const path = require('path');
const fs = require('fs');

// Determine the database path (same logic as main.js getDataPath)
const APPDATA = process.env.APPDATA;
const DB_PATH = path.join(APPDATA, 'zameen-khata', 'ZameenKhata_Database');

if (!fs.existsSync(DB_PATH)) {
  console.error(`ERROR: Database path not found: ${DB_PATH}`);
  console.error('Make sure the ZameenKhata desktop app has been run on this machine first.');
  process.exit(1);
}

// Set the DB path BEFORE requiring any DB modules
process.env.ZAMEEN_DB_PATH = DB_PATH;

// Now require the sync module
const { setDbPath, getDbPath } = require(path.join(__dirname, '..', 'src', 'main', 'db', 'core'));
setDbPath(DB_PATH);

console.log(`DB path: ${getDbPath()}`);
console.log(`Towns: ${path.join(getDbPath(), 'Towns')}`);
console.log(`Properties: ${path.join(getDbPath(), 'Properties')}`);
console.log(`Global: ${path.join(getDbPath(), 'Global')}`);
console.log('');

async function main() {
  const { performFullSyncUp } = require(path.join(__dirname, '..', 'src', 'main', 'db', 'syncUp'));

  const reportProgress = (percent, msg) => {
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    process.stdout.write(`\r[${bar}] ${percent}% — ${msg}`);
  };

  console.log('Starting Excel → Supabase sync...\n');

  try {
    const result = await performFullSyncUp(reportProgress, {
      includeStorageBackup: false,
    });
    process.stdout.write('\n\n');
    console.log('✓ Sync completed successfully!');
    console.log(`  - Sales synced: ${result.salesSynced}`);
    console.log(`  - Sales skipped: ${result.salesSkipped}`);
    console.log(`  - Files uploaded: ${result.filesUploaded}`);
  } catch (err) {
    process.stdout.write('\n\n');
    console.error('✗ Sync failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
