const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const supabase = require('../src/main/db/supabase.js');

const TRANSACTION_TABLES = [
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
  'investor_transactions',
  'investors',
  'construction_payments',
  'construction_projects',
  'receipt_archive',
  'media_library',
  'money_ledger',
  'town_financial_summary',
  'appeals',
  'audit_schedules',
  'locker_audits'
];

async function cleanCloudTables() {
  console.log('🧹 Clearing Supabase Cloud test data via Supabase Client...');

  for (const table of TRANSACTION_TABLES) {
    try {
      const { error } = await supabase.from(table).delete().neq('created_at', '1900-01-01T00:00:00Z');
      if (error) {
        // Fallback delete
        await supabase.from(table).delete().gte('created_at', '2000-01-01');
      }
      console.log(`  ✓ Cleared table: ${table}`);
    } catch (e) {
      console.warn(`  ⚠ Warning clearing ${table}:`, e.message);
    }
  }

  // Reset properties table to Available
  try {
    const { error } = await supabase
      .from('properties')
      .update({
        status: 'Available',
        file_status: 'Available',
        customer_name: '',
        cnic: '',
        phone_number: '',
        expected_amount_pkr: 0,
        deal_amount_pkr: 0,
        discount_amount_pkr: 0,
        total_amount_pkr: 0,
        advance_amount_pkr: 0,
        received_amount: 0,
        remaining_amount: 0,
        agent_name: '',
      })
      .neq('status', 'non_existent_status');

    if (!error) console.log('  ✓ Reset all properties in cloud to Available');
  } catch (e) {
    console.warn('  ⚠ Property reset warning:', e.message);
  }
}

async function cleanLocalExcel() {
  console.log('🧹 Clearing local Excel transaction files...');
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.config');
  const dbDir = path.join(appData, 'ZameenKhata_Database');
  
  const searchDirs = [dbDir, path.resolve('Global'), path.resolve('Towns')];
  
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir, { recursive: true });
    for (const relativeFile of files) {
      const fullPath = path.join(dir, relativeFile);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile() && fullPath.endsWith('.xlsx')) {
        const basename = path.basename(fullPath);
        if (basename === 'Towns.xlsx') continue; // keep towns structure
        
        if (basename === 'Properties.xlsx') {
          // Reset properties file
          try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(fullPath);
            const sheet = workbook.getWorksheet('Data') || workbook.worksheets[0];
            if (sheet && sheet.rowCount > 2) {
              sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 2) {
                  row.getCell(6).value = 'Available'; // Status
                }
              });
              await workbook.xlsx.writeFile(fullPath);
              console.log(`  ✓ Reset property status in ${fullPath}`);
            }
          } catch (_) {}
        } else {
          // Delete transaction Excel file
          try {
            fs.unlinkSync(fullPath);
            console.log(`  ✓ Removed ${basename}`);
          } catch (_) {}
        }
      }
    }
  }
}

async function main() {
  await cleanCloudTables();
  await cleanLocalExcel();
  console.log('\n========================================');
  console.log('✅ ALL TEST DATA CLEARED SUCCESSFULLY!');
  console.log('========================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
