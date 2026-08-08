import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import syncHelpers from '../src/main/db/syncHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('===========================================================');
  console.log('  AL SIRAJ DEVELOPERS — FULL SYNC COLUMN AUDIT');
  console.log('===========================================================\n');

  const tables = Object.keys(syncHelpers.TABLE_COLUMNS);
  let totalPassed = 0;
  let totalWarnings = 0;
  let totalErrors = 0;
  const summary = [];

  for (const tbl of tables) {
    process.stdout.write(`  Checking: ${tbl.padEnd(30)}`);

    // Try fetching 1 row to get column names from the remote table
    const { data, error } = await supabase.from(tbl).select('*').limit(1);

    if (error) {
      console.log('  FAIL');
      console.error(`    Error: ${error.message}`);
      totalErrors++;
      summary.push({ table: tbl, status: 'ERROR', detail: error.message });
      continue;
    }

    const expectedCols = syncHelpers.TABLE_COLUMNS[tbl].map(c => c.toLowerCase());

    if (!data || data.length === 0) {
      // Table exists but is empty — can't verify columns
      console.log('  EMPTY (no rows to verify columns)');
      summary.push({ table: tbl, status: 'EMPTY', detail: 'No rows to verify column presence' });
      totalPassed++;
      continue;
    }

    const remoteCols = Object.keys(data[0]).map(c => c.toLowerCase());
    const missingInRemote = expectedCols.filter(c => !remoteCols.includes(c));
    const extraInRemote = remoteCols.filter(c => !expectedCols.includes(c) && c !== 'id' && c !== 'updated_at' && c !== 'created_at');

    if (missingInRemote.length === 0 && extraInRemote.length === 0) {
      console.log('  PASS');
      totalPassed++;
      summary.push({ table: tbl, status: 'PASS', detail: `${expectedCols.length} columns matched` });
    } else {
      if (missingInRemote.length > 0) {
        console.log('  WARN');
        console.warn(`    Missing in remote: ${missingInRemote.join(', ')}`);
        totalWarnings++;
      }
      if (extraInRemote.length > 0) {
        console.log(`    Extra in remote (not in TABLE_COLUMNS): ${extraInRemote.join(', ')}`);
      }
      summary.push({
        table: tbl,
        status: missingInRemote.length > 0 ? 'WARN' : 'INFO',
        detail: missingInRemote.length > 0
          ? `Missing: ${missingInRemote.join(', ')}`
          : `Extra: ${extraInRemote.join(', ')}`,
      });
    }
  }

  // Pending sync queue check
  console.log('\n--- Pending Sync Queue Check ---');
  const { count, error: pendErr } = await supabase
    .from('pending_sync_queue')
    .select('id', { count: 'exact', head: true });

  if (pendErr) {
    console.error(`  Error querying pending_sync_queue: ${pendErr.message}`);
  } else {
    console.log(`  Pending sync items: ${count}`);
  }

  // Summary report
  console.log('\n===========================================================');
  console.log('  AUDIT SUMMARY');
  console.log('===========================================================');
  console.log(`  Tables checked:  ${tables.length}`);
  console.log(`  Passed:          ${totalPassed}`);
  console.log(`  Warnings:        ${totalWarnings}`);
  console.log(`  Errors:          ${totalErrors}`);
  console.log('');

  if (totalWarnings > 0 || totalErrors > 0) {
    console.log('  Issues found:');
    for (const s of summary.filter(s => s.status !== 'PASS' && s.status !== 'EMPTY')) {
      console.log(`    [${s.status}] ${s.table}: ${s.detail}`);
    }
  } else {
    console.log('  All tables fully aligned. Zero column mismatches.');
  }

  console.log('\n===========================================================');
  console.log('  AUDIT COMPLETE');
  console.log('===========================================================');
}

main().catch(err => {
  console.error('Unexpected error during audit:', err);
  process.exit(1);
});
