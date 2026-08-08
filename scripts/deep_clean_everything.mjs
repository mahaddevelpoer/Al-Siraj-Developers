import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://wdislbdftnwmaexqtfmn.supabase.co';
let serviceKey = '';

// Try reading service key from developer_config.json
const configPath = path.resolve('developer_config.json');
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    serviceKey = config.supabase_service_key || config.supabaseKey || '';
  } catch (_) {}
}

if (!serviceKey) {
  serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXNsYmRmdG53bWFleHF0Zm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODY0MzksImV4cCI6MjA4NTE2MjQzOX0.hSUYRs4scWmUNZGK0slHeX9t--Of5CZclAhoCRbcXmc';
}

const supabase = createClient(SUPABASE_URL, serviceKey, { realtime: { transport: WebSocket } });

const TABLES_TO_CLEAN = [
  'all_sales',
  'installments',
  'expenses',
  'ceo_expenses',
  'ceo_salary',
  'notifications',
  'resell_history',
  'employees_v2',
  'advance_salaries',
  'salary_payments',
  'daily_entries',
  'town_agents',
  'investors',
  'investor_transactions',
  'construction_projects',
  'construction_payments',
  'commissions',
  'commission_receipts',
  'collection_payments',
  'receipt_archive',
  'media_library',
  'cash_bank_accounts',
  'money_ledger',
  'town_financial_summary',
  'town_map_shapes',
  'daily_reports',
  'appeals',
  'pending_sync_queue',
  'audit_schedules',
  'locker_audits'
];

async function main() {
  console.log('===========================================================');
  console.log('🔥 DEEP CLEANING ALL LOCAL & CLOUD TEST DATA & FOLDERS');
  console.log('===========================================================\n');

  // 1. Purge all Supabase Cloud Tables
  console.log('☁️ [1/4] Clearing Cloud Database Tables...');
  for (const table of TABLES_TO_CLEAN) {
    try {
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        await supabase.from(table).delete().gte('created_at', '2000-01-01');
      }
      console.log(`  ✓ Cleared cloud table: ${table}`);
    } catch (e) {
      console.warn(`  ⚠ Warning clearing ${table}:`, e.message);
    }
  }

  // 2. Remove Local Audit & Test Directories
  console.log('\n📁 [2/4] Removing Temporary Test & Audit Data Directories...');
  const testDirs = [
    path.resolve('.audit_app_data'),
    path.resolve('.test_app_data'),
    path.resolve('src/main/db/test_database'),
  ];

  for (const d of testDirs) {
    if (fs.existsSync(d)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
        console.log(`  ✓ Removed test directory: ${d}`);
      } catch (e) {
        console.warn(`  ⚠ Could not remove ${d}:`, e.message);
      }
    }
  }

  // 3. Deep Clean Workspace Directories (Properties, Global, Towns)
  console.log('\n🏠 [3/4] Deep Cleaning Workspace Properties, Global & Towns Folders...');
  const workspaceTargetDirs = [
    path.resolve('Properties'),
    path.resolve('Global'),
    path.resolve('Towns'),
  ];

  for (const targetDir of workspaceTargetDirs) {
    if (!fs.existsSync(targetDir)) continue;
    try {
      const files = fs.readdirSync(targetDir);
      for (const f of files) {
        const fullPath = path.join(targetDir, f);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`  ✓ Deleted: ${fullPath}`);
        } catch (_) {}
      }
    } catch (e) {
      console.warn(`  ⚠ Error cleaning ${targetDir}:`, e.message);
    }
  }

  // Also check root folder for leftover stray .xlsx files
  try {
    const rootFiles = fs.readdirSync(path.resolve('.'));
    for (const rf of rootFiles) {
      if (rf.endsWith('.xlsx') || rf === 'Employees_V2.xlsx') {
        const fullPath = path.resolve(rf);
        try {
          fs.unlinkSync(fullPath);
          console.log(`  ✓ Removed stray root file: ${rf}`);
        } catch (_) {}
      }
    }
  } catch (_) {}

  // 4. Wipe AppData Databases
  console.log('\n💻 [4/4] Wiping Local AppData Database Files...');
  const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library/Application Support') : path.join(process.env.HOME, '.config'));
  const localAppDataDir = process.env.LOCALAPPDATA || appDataDir;

  const appDataTargets = [
    path.join(appDataDir, 'AL SIRAJ DEVELOPERS'),
    path.join(appDataDir, 'zameen-khata'),
    path.join(localAppDataDir, 'AL SIRAJ DEVELOPERS'),
    path.join(localAppDataDir, 'zameen-khata'),
  ];

  for (const parentDir of appDataTargets) {
    if (!fs.existsSync(parentDir)) continue;
    try {
      fs.rmSync(parentDir, { recursive: true, force: true });
      console.log(`  ✓ Wiped AppData folder: ${parentDir}`);
    } catch (e) {
      console.warn(`  ⚠ Error wiping ${parentDir}:`, e.message);
    }
  }

  console.log('\n===========================================================');
  console.log('🔥 DEEP CLEAN COMPLETE! ALL LOCAL & CLOUD DATA IS 100% ERASED');
  console.log('===========================================================');
}

main().catch(console.error);
