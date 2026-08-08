import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://wdislbdftnwmaexqtfmn.supabase.co';
let serviceKey = '';

// Read service key from developer_config.json
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
  console.log('💥 MASTER NUCLEAR CLEANUP — ERASING ALL LOCAL & CLOUD STATE');
  console.log('===========================================================\n');

  // Step 1: Kill any active app processes to release file locks
  console.log('🔪 [1/5] Terminating any running application processes...');
  try {
    execSync('taskkill /IM "AL SIRAJ DEVELOPERS.exe" /F', { stdio: 'ignore' });
  } catch (_) {}
  try {
    execSync('taskkill /IM electron.exe /F', { stdio: 'ignore' });
  } catch (_) {}
  console.log('  ✓ Process locks released.');

  // Step 2: Purge all Supabase Cloud Tables
  console.log('\n☁️ [2/5] Purging 30 Supabase Cloud Tables...');
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

  // Reset properties table to clean empty state in cloud
  try {
    await supabase.from('properties').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('  ✓ Cleared cloud properties table');
  } catch (_) {}

  // Step 3: Delete Mirror Export Folders (Desktop & Drives)
  console.log('\n🖥️ [3/5] Deleting Mirror Export Folders (Desktop & Drives)...');
  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\HP';
  const mirrorTargets = [
    path.join(userHome, 'Desktop', 'ZameenKhata_Exports'),
    'D:\\ZameenKhata_Exports',
    'E:\\ZameenKhata_Exports',
    'F:\\ZameenKhata_Exports',
  ];

  for (const mirrorDir of mirrorTargets) {
    if (fs.existsSync(mirrorDir)) {
      try {
        fs.rmSync(mirrorDir, { recursive: true, force: true });
        console.log(`  ✓ Erased mirror directory: ${mirrorDir}`);
      } catch (e) {
        console.warn(`  ⚠ Error erasing ${mirrorDir}:`, e.message);
      }
    }
  }

  // Step 4: Wipe AppData User Data Folders
  console.log('\n💻 [4/5] Wiping AppData User Data Directories...');
  const appData = process.env.APPDATA || path.join(userHome, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local');

  const appDataDirs = [
    path.join(appData, 'AL SIRAJ DEVELOPERS'),
    path.join(appData, 'zameen-khata'),
    path.join(appData, 'ZameenKhata_Database'),
    path.join(localAppData, 'AL SIRAJ DEVELOPERS'),
    path.join(localAppData, 'zameen-khata'),
  ];

  for (const ad of appDataDirs) {
    if (fs.existsSync(ad)) {
      try {
        fs.rmSync(ad, { recursive: true, force: true });
        console.log(`  ✓ Wiped AppData folder: ${ad}`);
      } catch (e) {
        console.warn(`  ⚠ Error wiping ${ad}:`, e.message);
      }
    }
  }

  // Step 5: Clean Local Workspace Project Directories (Properties, Global, Towns)
  console.log('\n🏠 [5/5] Wiping Workspace Properties, Global & Towns Folders...');
  const workspaceDirs = [
    path.resolve('Properties'),
    path.resolve('Global'),
    path.resolve('Towns'),
    path.resolve('.audit_app_data'),
    path.resolve('.test_app_data'),
    path.resolve('src/main/db/test_database'),
  ];

  for (const wdir of workspaceDirs) {
    if (!fs.existsSync(wdir)) continue;
    try {
      fs.rmSync(wdir, { recursive: true, force: true });
      fs.mkdirSync(wdir, { recursive: true }); // Re-create empty directory structure
      console.log(`  ✓ Re-created clean empty folder: ${wdir}`);
    } catch (e) {
      console.warn(`  ⚠ Error wiping ${wdir}:`, e.message);
    }
  }

  // Delete stray root Excel files
  try {
    const rootFiles = fs.readdirSync(path.resolve('.'));
    for (const rf of rootFiles) {
      if (rf.endsWith('.xlsx') || rf.endsWith('.wal')) {
        const fullPath = path.resolve(rf);
        try {
          fs.unlinkSync(fullPath);
          console.log(`  ✓ Removed stray root file: ${rf}`);
        } catch (_) {}
      }
    }
  } catch (_) {}

  console.log('\n===========================================================');
  console.log('💥 MASTER NUCLEAR CLEAN COMPLETE!');
  console.log('   - 30 Cloud Supabase tables erased');
  console.log('   - Desktop & Drive mirror export folders erased');
  console.log('   - AppData user data databases erased');
  console.log('   - Workspace Properties, Global & Towns folders wiped clean');
  console.log('===========================================================');
}

main().catch(console.error);
