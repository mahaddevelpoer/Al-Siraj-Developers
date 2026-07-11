const path = require('path');
const fs = require('fs');

const dbPath = 'C:\\Users\\HP\\AppData\\Roaming\\zameen-khata\\ZameenKhata_Database';

// Set up core path
const core = require('../src/main/db/core');
core.setDbPath(dbPath);

const { deleteTown, addTown } = require('../src/main/db/towns');
const accountantAuth = require('../src/main/db/accountantAuth');
const onlineDb = require('../src/main/db/online');
const supabase = require('../src/main/db/supabase');

// Replicate purge functions from ipc.js
async function purgeLocalTownBusinessData(townName) {
  const town = String(townName || '').trim();
  if (!town) return;
  const { readExcelFile, deleteExcelRow, getGlobalsPath } = require('../src/main/db/core');
  const files = [
    'All_Sales.xlsx',
    'All_Expenses.xlsx',
    'Installments_Tracker.xlsx',
    'Collection_Payments.xlsx',
    'Resell_History.xlsx',
    'CEO_Expenses.xlsx',
    'CEO_Salary.xlsx',
    'Salary_Records.xlsx',
    'Daily_Entries.xlsx',
    'Notifications_Log.xlsx',
    'Commissions.xlsx',
    'Commission_Receipts.xlsx',
    'Town_Agents.xlsx',
    'Investors.xlsx',
    'Investor_Transactions.xlsx',
    'Construction_Projects.xlsx',
    'Construction_Payments.xlsx',
    'Receipt_Archive.xlsx',
    'Money_Ledger.xlsx',
    'Town_Financial_Summary.xlsx',
    'Town_Map_Shapes.xlsx',
  ];
  for (const file of files) {
    const fp = path.join(getGlobalsPath(), file);
    if (!fs.existsSync(fp)) continue;
    let rows = [];
    try { rows = await readExcelFile(fp, 'Data'); } catch (_) { continue; }
    const targets = rows
      .filter((row) => String(row.Town_Name || row.town_name || '') === town && row._rowNumber)
      .map((row) => row._rowNumber)
      .sort((a, b) => b - a);
    for (const rowNumber of targets) {
      await deleteExcelRow(fp, 'Data', rowNumber);
    }
  }
}

async function purgeCloudTownBusinessData(townName) {
  const town = String(townName || '').trim();
  if (!town) return;
  const tables = [
    'all_sales',
    'expenses',
    'installments',
    'collection_payments',
    'resell_history',
    'ceo_expenses',
    'ceo_salary',
    'salary_records',
    'salary_payments',
    'advance_salaries',
    'employees',
    'employees_v2',
    'daily_entries',
    'daily_reports',
    'notifications',
    'commissions',
    'commission_receipts',
    'town_agents',
    'investors',
    'investor_transactions',
    'construction_projects',
    'construction_payments',
    'receipt_archive',
    'money_ledger',
    'town_financial_summary',
    'town_map_shapes',
    'properties',
  ];
  for (const table of tables) {
    try { await onlineDb.deleteWhere(table, { Town_Name: town }); } catch (_) {}
  }
  // Deactivate all accountants assigned to this town
  try { await onlineDb.updateWhere('users', { role: 'accountant', town_name: town }, { is_active: false }); } catch (_) {}
  try { await onlineDb.updateWhere('users', { role: 'accountant', town_id: town }, { is_active: false }); } catch (_) {}
}

async function main() {
  console.log('1. Logging in as CEO (loyal.blood300@gmail.com)...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'loyal.blood300@gmail.com',
    password: '126342',
  });

  if (authError) {
    console.error('Failed to log in as CEO:', authError.message);
    process.exit(1);
  }
  console.log('Successfully logged in! User ID:', authData.user.id);

  const oldTown = 'Laha';
  console.log(`\n2. Cleaning and deleting old town "${oldTown}"...`);

  // Deactivate local accountants
  console.log('Deactivating local accountants for Laha...');
  accountantAuth.deactivateByTown(dbPath, oldTown);

  // Local Delete
  console.log('Performing local DB cleanup for Laha...');
  await deleteTown(oldTown);
  await purgeLocalTownBusinessData(oldTown);

  // Cloud Delete
  console.log('Performing cloud DB cleanup for Laha...');
  await purgeCloudTownBusinessData(oldTown);
  try {
    await supabase.from('users').update({ is_active: false }).eq('town_id', oldTown).eq('role', 'accountant');
  } catch (e) {
    console.error('Error deactivating cloud users for Laha:', e.message);
  }
  await onlineDb.deleteWhere('towns', { Town_Name: oldTown });

  // Delete local town file
  const townFile = path.join(dbPath, 'Towns', `${oldTown}.xlsx`);
  if (fs.existsSync(townFile)) {
    console.log(`Removing local file: ${townFile}`);
    fs.unlinkSync(townFile);
  }

  const newTown = 'SirajTown';
  console.log(`\n3. Adding new town "${newTown}"...`);
  const townPayload = {
    Town_Name: newTown,
    Total_Plots: 200,
    Total_Shops: 100,
    Commission_Rate: 15,
    Location_Text: 'Multan, Pakistan',
    Location_Lat: '30.1575',
    Location_Lng: '71.5249',
    Status: 'Active'
  };

  // Local insert
  console.log('Performing local insert for SirajTown...');
  await purgeLocalTownBusinessData(newTown);
  await addTown(townPayload);

  // Cloud insert
  console.log('Performing cloud insert for SirajTown...');
  await purgeCloudTownBusinessData(newTown);
  await onlineDb.insert('towns', {
    Town_Name: townPayload.Town_Name,
    Location: townPayload.Location_Text,
    Status: townPayload.Status,
    Total_Plots: townPayload.Total_Plots,
    Total_Shops: townPayload.Total_Shops
  });

  console.log('\n4. Creating accountant for SirajTown...');
  const accFullName = 'Siraj Accountant';
  const accEmail = 'siraj.accountant@gmail.com';
  const accPassword = 'sirajaccountant123';

  const cleanEmail = String(accEmail).trim().toLowerCase();

  // Sign up accountant in Supabase
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: cleanEmail,
    password: accPassword,
    options: { data: { full_name: accFullName, role: 'accountant', town_id: newTown, town_name: newTown } },
  });

  let accountantUserId = '';
  if (signUpError) {
    const msg = String(signUpError.message).toLowerCase();
    if (msg.includes('already') || msg.includes('registered')) {
      console.log('Accountant email already exists in auth. Fetching user profile...');
      const { data: existingProfile, error: lookupError } = await supabase
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!existingProfile?.id) {
        throw new Error('This email is already registered in auth but has no user profile.');
      }

      accountantUserId = existingProfile.id;
      console.log(`Updating existing profile id: ${accountantUserId}...`);
      const { error: updateError } = await supabase
        .from('users')
        .update({
          full_name: accFullName,
          role: 'accountant',
          town_id: newTown,
          town_name: newTown,
          is_active: true,
        })
        .eq('id', accountantUserId);

      if (updateError) throw updateError;
    } else {
      throw signUpError;
    }
  } else {
    accountantUserId = signUpData.user.id;
    console.log(`Created new auth account for accountant. User ID: ${accountantUserId}`);
    
    const profilePayload = {
      id: accountantUserId,
      email: cleanEmail,
      full_name: accFullName,
      role: 'accountant',
      town_id: newTown,
      town_name: newTown,
      is_active: true,
    };
    console.log('Upserting user profile in Supabase...');
    const { error: profileError } = await supabase
      .from('users')
      .upsert([profilePayload], { onConflict: 'id' });
    if (profileError) throw profileError;
  }

  // Save in local offline login table
  console.log('Upserting accountant offline credentials locally...');
  accountantAuth.upsertAccountant(dbPath, {
    id: accountantUserId,
    full_name: accFullName,
    email: cleanEmail,
    password: accPassword,
    town_name: newTown,
  });

  console.log('\n--- SUCCESS! ---');
  console.log(`Old town "${oldTown}" has been purged from both local Excel and cloud databases.`);
  console.log(`New town "${newTown}" has been added and synced.`);
  console.log(`Accountant "${accFullName}" has been configured for "${newTown}".`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('Workflow error:', err);
  process.exit(1);
});
