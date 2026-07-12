const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Initialize Supabase Client
const configPath = path.join(__dirname, '..', 'developer_config.json');
let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('Failed to read developer_config.json:', e.message);
  }
}

const SUPABASE_URL = 'https://wdislbdftnwmaexqtfmn.supabase.co';
const supabaseKey = config.supabase_service_key || config.supabase_service_role_key;

if (!supabaseKey) {
  console.error('ERROR: No supabase_service_key found in developer_config.json. Cannot clean up online database.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, supabaseKey, {
  auth: { persistSession: false }
});

const tablesToClear = [
  'appeal_notifications',
  'appeals',
  'notifications',
  'ceo_push_delivery_log',
  'audit_log',
  'user_activity',
  'town_map_shapes',
  'money_ledger',
  'receipt_archive',
  'media_library',
  'file_manifest',
  'commission_receipts',
  'commissions',
  'collection_payments',
  'construction_payments',
  'construction_projects',
  'investor_transactions',
  'investors',
  'town_agents',
  'salary_payments',
  'advance_salaries',
  'employees_v2',
  'employees',
  'salary_records',
  'ceo_salary',
  'ceo_expenses',
  'expenses',
  'daily_entries',
  'installments',
  'all_sales',
  'properties',
  'town_prices',
  'towns',
  'agent_property_access'
];

async function clearOnlineDatabase() {
  console.log('\n--- CLEANING UP SUPABASE DATABASE ---');
  for (const table of tablesToClear) {
    try {
      let hasMore = true;
      let totalDeleted = 0;
      while (hasMore) {
        // Fetch rows to get primary key values
        const { data, error } = await supabase.from(table).select('*').limit(1000);
        if (error) {
          console.error(`  [${table}] Failed to select:`, error.message);
          break;
        }
        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        // Determine primary key column
        const pkCandidate = ['id', 'ID', 'Town_Name', 'Price_ID', 'Plot_Shop_Number', 'Sale_ID', 'Tracker_ID', 'Entry_ID', 'Expense_ID', 'Salary_ID', 'Employee_ID', 'Payment_ID', 'Project_ID', 'Transaction_ID', 'Investor_ID', 'Agent_ID', 'Commission_ID', 'Receipt_ID', 'Notification_ID', 'Media_ID']
          .find(k => k in data[0]);

        if (!pkCandidate) {
          console.error(`  [${table}] Could not determine primary key.`);
          break;
        }

        const pkValues = data.map(r => r[pkCandidate]);
        const { error: delError } = await supabase.from(table).delete().in(pkCandidate, pkValues);
        if (delError) {
          console.error(`  [${table}] Delete failed:`, delError.message);
          break;
        }
        totalDeleted += pkValues.length;
        if (data.length < 1000) {
          hasMore = false;
        }
      }
      if (totalDeleted > 0) {
        console.log(`  [${table}] Deleted ${totalDeleted} row(s).`);
      } else {
        console.log(`  [${table}] Already empty.`);
      }
    } catch (e) {
      console.error(`  [${table}] Exception:`, e.message);
    }
  }

  // Clear assigned towns for accountants and agents
  try {
    const { error: usersError } = await supabase
      .from('users')
      .update({
        town_id: null,
        town_name: null,
        agent_town: null,
        agent_towns: null
      })
      .in('role', ['accountant', 'agent']);

    if (usersError) {
      console.error('  [users] Failed to clear town assignments:', usersError.message);
    } else {
      console.log('  [users] Successfully cleared accountant/agent town assignments.');
    }
  } catch (e) {
    console.error('  [users] Exception clearing assignments:', e.message);
  }

  // Clear storage objects
  console.log('\n--- CLEANING UP SUPABASE STORAGE ---');
  const buckets = ['zameenkhata-files', 'zameen-khata', 'receipts', 'property-files', 'property_images', 'property-images'];
  for (const bucket of buckets) {
    try {
      const { data: objects, error: listError } = await supabase.storage.from(bucket).list();
      if (listError) {
        // bucket might not exist, skip silently
        continue;
      }
      if (objects && objects.length > 0) {
        const fileNames = objects.map(o => o.name);
        const { error: delError } = await supabase.storage.from(bucket).remove(fileNames);
        if (delError) {
          console.error(`  [Storage: ${bucket}] Remove failed:`, delError.message);
        } else {
          console.log(`  [Storage: ${bucket}] Deleted ${fileNames.length} file(s).`);
        }
      }
    } catch (_) {}
  }
}

// 2. Clear Local Data
function cleanLocalDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      cleanLocalDirectory(fullPath);
      // Clean up empty directories
      try {
        if (fs.readdirSync(fullPath).length === 0) {
          fs.rmdirSync(fullPath);
          console.log(`  Deleted empty folder: ${fullPath}`);
        }
      } catch (_) {}
    } else {
      const ext = path.extname(item.name).toLowerCase();
      const isConfig = ['accountant_offline_logins.json', 'ceo_offline_credentials.json']
        .includes(item.name.toLowerCase());
      
      const isExcelOrData = ['.xlsx', '.xlsm', '.xls', '.csv', '.json', '.db', '.sqlite', '.sqlite3']
        .includes(ext);

      if (isExcelOrData && !isConfig) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`  Deleted file: ${fullPath}`);
        } catch (e) {
          console.error(`  Failed to delete file ${fullPath}:`, e.message);
        }
      }
    }
  }
}

function clearLocalData() {
  console.log('\n--- CLEANING UP LOCAL CACHE/EXCEL FILES ---');
  
  const appDataRoot = process.env.APPDATA;
  const localPaths = [];

  if (appDataRoot) {
    localPaths.push(path.join(appDataRoot, 'AL SIRAJ DEVELOPERS', 'ZameenKhata_Database'));
    localPaths.push(path.join(appDataRoot, 'zameen-khata', 'ZameenKhata_Database'));
  }

  // Also include project root folders
  const projectRoot = path.join(__dirname, '..');
  localPaths.push(path.join(projectRoot, 'Global'));
  localPaths.push(path.join(projectRoot, 'Properties'));
  localPaths.push(path.join(projectRoot, 'Towns'));
  localPaths.push(path.join(projectRoot, 'Reports'));

  for (const lp of localPaths) {
    if (fs.existsSync(lp)) {
      console.log(`Cleaning local database path: ${lp}`);
      cleanLocalDirectory(lp);
    }
  }
}

async function run() {
  try {
    await clearOnlineDatabase();
    clearLocalData();
    console.log('\nCleanup successfully completed! All test and business data has been reset.');
  } catch (e) {
    console.error('Cleanup failed:', e.message);
  }
}

run();
