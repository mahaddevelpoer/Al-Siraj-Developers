const fs = require('fs');
const path = require('path');
const { app } = require('electron');

async function clearData() {
  const dbPath = 'd:/ZameenKhata/src/main/db';
  const dataPath = 'C:/Users/HP/AppData/Roaming/ZameenKhata_Database'; // Common path for user data
  
  // Actually, we don't need to guess the dataPath. We can just use the DB modules.
  const { initializeDatabase, getGlobalsPath, getPropertiesPath, getTownsPath } = require('d:/ZameenKhata/src/main/db/core.js');
  
  console.log("We need to wipe the global files, but let's just wipe the tables in Supabase first.");
  
  const supabase = require('d:/ZameenKhata/src/main/db/supabase.js');
  
  const tables = [
    'all_sales', 'expenses', 'installments', 'collection_payments', 
    'resell_history', 'ceo_expenses', 'ceo_salary', 'salary_records', 
    'salary_payments', 'advance_salaries', 'employees', 'employees_v2', 
    'daily_entries', 'daily_reports', 'notifications', 'commissions', 
    'commission_receipts', 'town_agents', 'investor_transactions', 
    'investors', 'construction_payments', 'construction_projects', 
    'receipt_archive', 'media_library', 'money_ledger', 
    'town_financial_summary', 'appeals'
  ];

  for (const table of tables) {
    console.log(`Clearing ${table} online...`);
    await supabase.from(table).delete().neq('client_write_id', 'dummy_value_to_match_all');
    // Using a trick: neq client_write_id a dummy value deletes all rows since all rows have client_write_id != dummy
  }
  
  console.log("Online tables cleared.");
}

clearData().catch(console.error);
