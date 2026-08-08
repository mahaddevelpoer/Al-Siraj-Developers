const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const SUPABASE_URL = 'https://wdislbdftnwmaexqtfmn.supabase.co';
const BATCH_SIZE = 100;

const UPSERT_CONFLICT = {
  towns: 'town_name',
  properties: 'property_type,property_number,town_name',
  all_sales: 'sale_id',
  installments: 'tracker_id',
  expenses: 'expense_id',
  ceo_expenses: 'expense_id',
  ceo_salary: 'salary_id',
  notifications: 'notification_id',
  employees: 'employee_id',
  employees_v2: 'employee_id',
  advance_salaries: 'advance_id',
  salary_records: 'receipt_number',
  salary_payments: 'receipt_number',
  daily_entries: 'entry_id',
  commissions: 'id',
  town_agents: 'agent_id',
  investors: 'investor_id',
  investor_transactions: 'transaction_id',
  construction_projects: 'project_id',
  construction_payments: 'payment_id',
  commission_receipts: 'receipt_id',
  collection_payments: 'payment_id',
  receipt_archive: 'receipt_id',
  media_library: 'media_id',
  cash_bank_accounts: 'account_id',
  money_ledger: 'source_type,source_id,direction',
  town_financial_summary: 'town_name',
  town_map_shapes: 'shape_id',
  audit_schedules: 'id',
  locker_audits: 'id',
  resell_history: 'resell_id',
  daily_reports: 'report_id',
};

const GLOBAL_KEY_MAP = {
  Location: 'town_location',
  Location_Text: 'town_location',
  Town_Location: 'town_location',
  Location_Lat: 'latitude',
  Location_Lng: 'longitude',
};

const TABLE_KEY_MAP = {
  properties: {
    Plot_Number: 'property_number',
    Shop_Number: 'property_number',
    Plot_Size: 'property_size',
    Shop_Size: 'property_size',
    Plot_Marla: 'marla',
    Shop_Marla: 'marla',
  },
  employees: {
    Employee_ID: 'employee_id',
    Employee_Name: 'employee_name',
    Phone: 'phone_number',
    Role: 'designation',
    Salary: 'base_salary',
    Designation: 'designation',
    Base_Salary: 'base_salary',
  },
  employees_v2: {
    Employee_ID: 'employee_id',
    Employee_Name: 'employee_name',
    Phone: 'phone_number',
    Role: 'designation',
    Salary: 'base_salary',
  },
  salary_records: {
    Payment_ID: 'receipt_number',
    Employee_Name: 'name',
    Payment_Date: 'date',
    Notes: 'note',
    Recorded_By: 'paid_by',
    Name: 'name',
    Note: 'note',
    Paid_By: 'paid_by',
    Payment_Account_ID: 'payment_account_id',
    Payment_Account_Name: 'payment_account_name',
    Payment_Account_Type: 'payment_account_type',
  },
  salary_payments: {
    Payment_ID: 'receipt_number',
    Employee_Name: 'name',
    Payment_Date: 'date',
    Notes: 'note',
    Recorded_By: 'paid_by',
  },
  commissions: {
    Commission_ID: 'id',
    Sale_ID: 'sale_id',
    Town_Name: 'town_name',
    Plot_Shop_Number: 'property_number',
    Agent_Name: 'agent_name',
    Commission_Amount: 'commission_amount',
    Paid_Amount: 'paid_amount',
    Remaining_Amount: 'remaining_amount',
    Paid_Date: 'paid_at',
    Last_Paid_Date: 'last_paid_at',
    Created_At: 'created_at',
  },
  collection_payments: {
    Payment_ID: 'payment_id',
    Sale_ID: 'sale_code',
    Sale_Code: 'sale_code',
    Type: 'property_type',
    Received_Before: 'received_before',
    Received_After: 'received_after',
    Remaining_After: 'remaining_after',
    Payment_Date: 'payment_date',
    Payment_Method: 'payment_method',
    Receipt_Number: 'receipt_number',
    Payment_Account_ID: 'payment_account_id',
    Payment_Account_Name: 'payment_account_name',
    Payment_Account_Type: 'payment_account_type',
  },
  audit_schedules: {
    Schedule_ID: 'id',
    Town_Name: 'town_name',
    Scheduled_Date: 'scheduled_date',
    Status: 'status',
  },
  locker_audits: {
    Audit_ID: 'id',
    Town_Name: 'town_name',
    Audit_Date: 'audit_date',
    System_Balance: 'system_balance',
    Physical_Balance: 'physical_balance',
    Discrepancy: 'discrepancy',
    Audited_By: 'audited_by',
    Audit_Report_JSON: 'audit_report',
  },
  daily_reports: {
    Report_ID: 'report_id',
    Town_Name: 'town_name',
    Date: 'date',
    Generated_At: 'generated_at',
    Total_Received: 'total_received',
    Total_Expenses: 'total_expenses',
    Daily_Entries: 'daily_entries',
    Net_Balance: 'net_balance',
    Properties_Sold: 'properties_sold',
    Report_Data: 'report_data',
  },
  town_financial_summary: {
    Town_Name: 'town_name',
    Total_Received: 'total_received',
    Total_Expenses: 'total_expenses',
    Cash_Balance: 'cash_balance',
    Pending_Collection: 'pending_collection',
    Investor_Balance: 'investor_balance',
    Updated_At: 'updated_at',
  },
  media_library: {
    Media_ID: 'media_id',
    Town_Name: 'town_name',
    Type: 'type',
    Title: 'title',
    File_Path: 'file_path',
    Pdf_Path: 'pdf_path',
    Excel_Path: 'excel_path',
    Html_Path: 'html_path',
    Account_Name: 'account_name',
    Property_Number: 'property_number',
    Receipt_Number: 'receipt_number',
    Report_Date: 'report_date',
    From_Date: 'from_date',
    To_Date: 'to_date',
    Created_At: 'created_at',
  },
};

const TABLE_SKIP_KEYS = {
  commissions: new Set(['agent_email']),
  towns: new Set(['total_plots', 'total_shops']),
  all_sales: new Set(['file_delivery_image', 'sale_type']),
  advance_salaries: new Set(['updated_at']),
  salary_records: new Set(['payment_method']),
  collection_payments: new Set(['receipt_number']),
  media_library: new Set(['pdf_base64', 'html_content', 'report_data_json', 'Pdf_Base64', 'Html_Content', 'Report_Data_Json']),
};

const PROPERTY_TYPES = new Set(['Plot', 'Shop']);

const DATE_COLUMNS = new Set([
  'sell_date', 'due_date', 'paid_date', 'date', 'date_recorded',
  'created_date', 'payment_date', 'start_date', 'month_year',
  'paid_at', 'last_paid_at', 'created_at', 'updated_at', 'audit_date', 'scheduled_date',
]);

/**
 * TABLE_COLUMNS — Canonical column list for each synced Excel table.
 *
 * Custom Column Definitions:
 *   towns.Total_Plots       (integer, default 0)  — Total number of plot units in the town.
 *   towns.Total_Shops       (integer, default 0)  — Total number of shop units in the town.
 *   towns.Total_Income_PKR  (numeric, default 0)  — Aggregated income from all sales.
 *   towns.Total_Expenses_PKR(numeric, default 0)  — Aggregated expenses for the town.
 *   towns.Profit_Loss       (numeric, computed)    — Income minus expenses.
 *   all_sales.Sale_Type     (text, nullable)       — 'advance' | 'installment' | 'full'.
 *   all_sales.Payment_Method(text, nullable)       — 'cash' | 'cheque' | 'bank_transfer'.
 *   all_sales.File_Delivery_Image (text, nullable) — Path/URL to scanned file delivery image.
 *   properties.Road_Key     (text, nullable)       — Reference key for road pricing.
 *   properties.Per_Marla_Price (numeric, nullable) — Calculated per-marla rate.
 *   daily_entries.Review_Status (text, default 'approved') — Appeal review status.
 *   cash_bank_accounts.Sync_Status (text, default 'synced') — Cloud sync state.
 */
const TABLE_COLUMNS = {
  towns: ['Town_Name', 'Location', 'Commission_Rate', 'Latitude', 'Longitude', 'Total_Plots', 'Total_Shops', 'Total_Income_PKR', 'Total_Expenses_PKR', 'Profit_Loss', 'Status'],
  all_sales: ['Sale_ID', 'Plot_Shop_Number', 'Type', 'Town_Name', 'Customer_Name', 'CNIC', 'Phone_Number', 'Sell_Date', 'Expected_Amount_PKR', 'Deal_Amount_PKR', 'Discount_Amount_PKR', 'Total_Amount_PKR', 'Advance_Amount_PKR', 'Total_Installments', 'Total_Period_Months', 'Gap_Days', 'Gap_Label', 'Monthly_Installment', 'Received_Amount', 'Remaining_Amount', 'Agent_Name', 'Commission_Rate', 'Commission_Amount', 'Company_Income', 'Expense_Total', 'Profit_Loss', 'Receipt_Number', 'File_Status', 'File_Delivery_Image', 'Status', 'Sale_Type', 'Payment_Method', 'Cheque_Number', 'Cheque_Bank', 'Cheque_Image', 'Transaction_ID', 'Transfer_Bank', 'Transfer_Image','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  installments: ['Tracker_ID', 'Plot_Shop_Number', 'Type', 'Town_Name', 'Customer_Name', 'Phone_Number', 'Monthly_Amount', 'Due_Date', 'Status', 'Paid_Date', 'Month_Number', 'Total_Months', 'Received_Amount', 'Remaining_Amount', 'Agent_Name', 'Receipt_Number', 'Paid_By', 'Payee_Name'],
  expenses: ['Expense_ID', 'Town_Name', 'Expense_Name', 'Amount_PKR', 'Description', 'Category', 'Date', 'Added_By'],
  ceo_expenses: ['Expense_ID', 'Town_Name', 'Expense_Name', 'Amount_PKR', 'Description', 'Category', 'Date', 'Town_Income', 'Expense_Limit', 'Is_Over_Limit'],
  ceo_salary: ['Salary_ID', 'Town_Name', 'Month_Year', 'Amount_PKR', 'Date_Recorded', 'Notes'],
  notifications: ['Notification_ID', 'Type', 'Message', 'Plot_Shop_Number', 'Town_Name', 'Customer_Name', 'Due_Date', 'Created_Date', 'Status', 'Dismissed'],
  resell_history: ['Resell_ID', 'Plot_Shop_Number', 'Type', 'Town_Name', 'Original_Customer', 'Original_Sell_Date', 'Original_Amount', 'Resell_Amount', 'Refund_Amount', 'Resell_Date', 'Receipt_Number', 'Agent_Name', 'Profit_Loss'],
  employees_v2: ['Employee_ID', 'Employee_Name', 'CNIC', 'Phone', 'Town_Name', 'Role', 'Salary', 'Status'],
  advance_salaries: ['Advance_ID', 'Employee_Name', 'Town_Name', 'Amount', 'Date', 'Month', 'Status', 'Notes'],
  salary_payments: ['Payment_ID', 'Employee_Name', 'Town_Name', 'Amount', 'Month', 'Payment_Date', 'Payment_Method', 'Notes', 'Recorded_By','Advance_Deduction','New_Advance_Given','Salary_Amount','Salary_Gross_Amount','Cash_Disbursed_Amount','Salary_Paid_Amount','Salary_Paid_Before','Salary_Paid_After','Salary_Remaining_After','Is_Advance_Salary','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  daily_entries: ['Entry_ID', 'Town_Name', 'Date', 'Time', 'Type', 'Category', 'Amount', 'Description', 'Account_Name', 'Account_Type', 'Reference', 'Created_By', 'Review_Status','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  properties: ['Property_Type', 'Property_Number', 'Town_Name', 'Property_Size', 'Marla', 'Length_Ft', 'Width_Ft', 'Area_Sqft', 'Per_Marla_Price', 'Road_Type', 'Road_Key', 'Total_Price', 'Owner_Name', 'Property_Category', 'Customer_Name', 'CNIC', 'Phone_Number', 'Sell_Date', 'Total_Amount_PKR', 'Advance_Amount_PKR', 'Total_Installments', 'Total_Period_Months', 'Gap_Days', 'Gap_Label', 'Monthly_Installment', 'Received_Amount', 'Remaining_Amount', 'Agent_Name', 'Commission_Rate', 'Commission_Amount', 'Expense_Total', 'Profit_Loss', 'Installment_Status', 'Resell_Status', 'Resell_Amount', 'Receipt_Number', 'File_Status', 'File_Delivery_Image', 'Status'],
  town_agents: ['Agent_ID','Town_Name','Agent_Name','Phone_Number','CNIC','Address','Notes','Status','Created_At'],
  investors: ['Investor_ID','Town_Name','Investor_Name','Phone_Number','CNIC','Address','Notes','Balance','Status','Created_At','Approval_Status'],
  investor_transactions: ['Transaction_ID','Investor_ID','Town_Name','Investor_Name','Type','Amount','Date','Notes','Balance_After','Receipt_Number','Created_By','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  construction_projects: ['Project_ID','Town_Name','Category','Constructor_Name','Phone_Number','Company_Name','Material_Name','Material_Quantity','Material_Rate','Deal_Amount','Paid_Amount','Remaining_Amount','Status','Start_Date','Notes','Deal_Receipt_Number'],
  construction_payments: ['Payment_ID','Project_ID','Town_Name','Category','Constructor_Name','Amount','Payment_Date','Material_Name','Material_Quantity','Material_Rate','Remaining_After','Receipt_Number','Notes','Created_By','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  commissions: ['Commission_ID','Sale_ID','Town_Name','Plot_Shop_Number','Agent_Name','Agent_Email','Commission_Amount','Paid_Amount','Remaining_Amount','Status','Paid_Date','Last_Paid_Date','Created_At'],
  commission_receipts: ['Receipt_ID','Commission_ID','Sale_ID','Town_Name','Agent_Name','Plot_Shop_Number','Amount','Paid_Date','Receipt_Number','Paid_By','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  collection_payments: ['Payment_ID','Sale_ID','Sale_Code','Type','Plot_Shop_Number','Town_Name','Customer_Name','Agent_Name','Amount','Received_Before','Received_After','Remaining_After','Payment_Date','Payment_Method','Notes','Receipt_Number','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type'],
  receipt_archive: ['Receipt_ID','Receipt_Number','Receipt_Type','Town_Name','Entity_ID','Entity_Name','Amount','Receipt_Date','Payload_JSON','Created_At'],
  media_library: ['Media_ID','Town_Name','Type','Title','File_Path','Pdf_Path','Excel_Path','Html_Path','Account_Name','Property_Number','Receipt_Number','Report_Date','From_Date','To_Date','Created_At'],
  cash_bank_accounts: ['Account_ID','Town_Name','Account_Name','Account_Type','Opening_Balance','Status','Created_At','Updated_At','Sync_Status'],
  money_ledger: ['Ledger_ID','Town_Name','Date','Source_Type','Source_ID','Direction','Amount','Debit_Account','Credit_Account','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type','Party_Name','Description','Receipt_Number','Status','Created_By','Created_At'],
  town_financial_summary: ['Town_Name','Total_Received','Total_Expenses','Cash_Balance','Pending_Collection','Investor_Balance','Updated_At'],
  town_map_shapes: ['Shape_ID','Town_Name','Property_Type','Property_Number','Shape_Type','Label','Status','Geometry_JSON','Style_JSON','Sort_Order','Updated_At'],
  audit_schedules: ['Schedule_ID','Town_Name','Scheduled_Date','Status'],
  locker_audits: ['Audit_ID','Town_Name','Audit_Date','System_Balance','Physical_Balance','Discrepancy','Audited_By','Audit_Report_JSON'],
  daily_reports: ['Report_ID', 'Town_Name', 'Date', 'Generated_At', 'Total_Received', 'Total_Expenses', 'Daily_Entries', 'Net_Balance', 'Properties_Sold', 'Report_Data', 'Sync_Status'],
};

function getRowVal(row, key) {
  if (!row || typeof row !== 'object') return undefined;
  if (row[key] !== undefined && row[key] !== null) return row[key];
  const target = String(key).toLowerCase();
  const entry = Object.entries(row).find(([k]) => String(k).toLowerCase() === target);
  return entry ? entry[1] : undefined;
}

function stripInternal(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (k.startsWith('_')) delete out[k];
  }
  return out;
}

function cloudVal(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string' && val.trim() === '') return null;
  return val;
}

function boolFromExcel(val) {
  if (typeof val === 'boolean') return val;
  return String(val || '').toLowerCase() === 'yes' || val === 1 || val === '1' || val === 'true';
}

function boolToExcel(val) {
  return boolFromExcel(val) ? 'Yes' : 'No';
}

function getAdminClient() {
  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'developer_config.json'),
    path.join(__dirname, '..', '..', '..', '..', 'developer_config.json'),
    path.join(process.resourcesPath || '', 'developer_config.json'),
  ];
  let serviceKey = '';
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const config = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (config.supabase_service_key) {
          serviceKey = config.supabase_service_key;
          break;
        }
      }
    } catch (_) {}
  }
  if (!serviceKey) {
    throw new Error('supabase_service_key not found in developer_config.json');
  }
  return createClient(SUPABASE_URL, serviceKey, {
    realtime: { transport: WebSocket },
  });
}

function mapTownToCloud(row) {
  const r = stripInternal(row);
  return {
    Town_Name: String(r.Town_Name || ''),
    Location: String(r.Location_Text || r.Location || ''),
    Latitude: r.Location_Lat !== '' && r.Location_Lat != null ? parseFloat(r.Location_Lat) : null,
    Longitude: r.Location_Lng !== '' && r.Location_Lng != null ? parseFloat(r.Location_Lng) : null,
    Total_Plots: parseInt(r.Total_Plots) || 0,
    Total_Shops: parseInt(r.Total_Shops) || 0,
    Total_Income_PKR: parseFloat(r.Total_Income_PKR) || 0,
    Total_Expenses_PKR: parseFloat(r.Total_Expenses_PKR) || 0,
    Profit_Loss: parseFloat(r.Profit_Loss) || 0,
    Commission_Rate: parseFloat(r.Commission_Rate) || 0,
    Status: String(r.Status || 'Active'),
  };
}

function mapTownFromCloud(row) {
  const lat = getRowVal(row, 'Latitude') ?? getRowVal(row, 'latitude') ?? getRowVal(row, 'Location_Lat') ?? getRowVal(row, 'location_lat');
  const lng = getRowVal(row, 'Longitude') ?? getRowVal(row, 'longitude') ?? getRowVal(row, 'Location_Lng') ?? getRowVal(row, 'location_lng');
  const loc = getRowVal(row, 'Location') ?? getRowVal(row, 'town_location') ?? getRowVal(row, 'Location_Text') ?? getRowVal(row, 'location_text') ?? '';
  return {
    Town_Name: getRowVal(row, 'Town_Name') || getRowVal(row, 'town_name') || '',
    Total_Plots: parseInt(getRowVal(row, 'Total_Plots') || getRowVal(row, 'total_plots')) || 0,
    Total_Shops: parseInt(getRowVal(row, 'Total_Shops') || getRowVal(row, 'total_shops')) || 0,
    Total_Income_PKR: parseFloat(getRowVal(row, 'Total_Income_PKR') || getRowVal(row, 'total_income_pkr')) || 0,
    Total_Expenses_PKR: parseFloat(getRowVal(row, 'Total_Expenses_PKR') || getRowVal(row, 'total_expenses_pkr')) || 0,
    Profit_Loss: parseFloat(getRowVal(row, 'Profit_Loss') || getRowVal(row, 'profit_loss')) || 0,
    Commission_Rate: parseFloat(getRowVal(row, 'Commission_Rate') || getRowVal(row, 'commission_rate')) || 0,
    Status: getRowVal(row, 'Status') || getRowVal(row, 'status') || 'Active',
    Location_Text: String(loc || ''),
    Location_Lat: lat !== undefined && lat !== null && lat !== '' ? parseFloat(lat) : '',
    Location_Lng: lng !== undefined && lng !== null && lng !== '' ? parseFloat(lng) : '',
  };
}
function findPropertyStatus(type, number, town, sales, resellHistory) {
  const targetType = String(type || '').toLowerCase().trim();
  const targetNumber = String(number || '').toLowerCase().trim();
  const targetTown = String(town || '').toLowerCase().trim();

  // Check resell history first (latest)
  if (resellHistory && Array.isArray(resellHistory)) {
    const match = resellHistory.find(r => {
      const rType = String(r.Type || r.type || '').toLowerCase().trim();
      const rNum = String(r.Plot_Shop_Number || r.plot_shop_number || '').toLowerCase().trim();
      const rTown = String(r.Town_Name || r.town_name || '').toLowerCase().trim();
      return rType === targetType && rNum === targetNumber && rTown === targetTown;
    });
    if (match) {
      return {
        Status: 'Resold',
        Customer_Name: match.Customer_Name || match.customer_name || match.Original_Customer || match.original_customer || '',
        CNIC: match.CNIC || match.cnic || '',
        Phone_Number: match.Phone_Number || match.phone_number || '',
        Sell_Date: match.Resell_Date || match.resell_date || '',
        Total_Amount_PKR: parseFloat(match.Resell_Amount || match.resell_amount) || 0,
        Received_Amount: parseFloat(match.Advance_Amount_PKR || match.advance_amount_pkr || match.Resell_Amount || match.resell_amount) || 0,
        Remaining_Amount: parseFloat(match.Remaining_Amount || match.remaining_amount) || 0,
      };
    }
  }

  // Check sales
  if (sales && Array.isArray(sales)) {
    const match = sales.find(s => {
      const sType = String(s.Type || s.type || '').toLowerCase().trim();
      const sNum = String(s.Plot_Shop_Number || s.plot_shop_number || '').toLowerCase().trim();
      const sTown = String(s.Town_Name || s.town_name || '').toLowerCase().trim();
      return sType === targetType && sNum === targetNumber && sTown === targetTown;
    });
    if (match) {
      return {
        Status: 'Sold',
        Customer_Name: match.Customer_Name || match.customer_name || '',
        CNIC: match.CNIC || match.cnic || '',
        Phone_Number: match.Phone_Number || match.phone_number || '',
        Sell_Date: match.Sell_Date || match.sell_date || '',
        Total_Amount_PKR: parseFloat(match.Total_Amount_PKR || match.total_amount_pkr) || 0,
        Received_Amount: parseFloat(match.Received_Amount || match.received_amount || match.Advance_Amount_PKR || match.advance_amount_pkr) || 0,
        Remaining_Amount: parseFloat(match.Remaining_Amount || match.remaining_amount) || 0,
      };
    }
  }

  return null;
}

function mapPlotToCloud(row, sales, resellHistory) {
  const r = stripInternal(row);
  const type = 'Plot';
  const number = String(r.Plot_Number || r.Property_Number || '');
  const townName = String(r.Town_Name || '');
  const base = {
    Property_Type: 'Plot',
    Property_Number: number,
    Town_Name: townName,
    Property_Size: cloudVal(r.Plot_Size),
    Marla: r.Plot_Marla != null && r.Plot_Marla !== '' ? parseFloat(r.Plot_Marla) : null,
    Per_Marla_Price: parseFloat(r.Per_Marla_Price) || 0,
    Road_Type: null,
    Road_Key: null,
    Total_Price: parseFloat(r.Total_Price) || 0,
    Owner_Name: cloudVal(r.Owner_Name),
    Property_Category: cloudVal(r.Property_Category) || 'Residential',
    Customer_Name: cloudVal(r.Customer_Name),
    CNIC: cloudVal(r.CNIC),
    Phone_Number: cloudVal(r.Phone_Number),
    Sell_Date: cloudVal(r.Sell_Date),
    Total_Amount_PKR: parseFloat(r.Total_Amount_PKR) || 0,
    Advance_Amount_PKR: parseFloat(r.Advance_Amount_PKR) || 0,
    Total_Installments: parseInt(r.Total_Installments) || 0,
    Total_Period_Months: parseInt(r.Total_Period_Months) || 0,
    Gap_Days: parseInt(r.Gap_Days) || 0,
    Gap_Label: cloudVal(r.Gap_Label),
    Monthly_Installment: parseFloat(r.Monthly_Installment) || 0,
    Received_Amount: parseFloat(r.Received_Amount) || 0,
    Remaining_Amount: parseFloat(r.Remaining_Amount) || 0,
    Agent_Name: cloudVal(r.Agent_Name),
    Commission_Rate: parseFloat(r.Commission_Rate) || 0,
    Commission_Amount: parseFloat(r.Commission_Amount) || 0,
    Expense_Total: parseFloat(r.Expense_Total) || 0,
    Profit_Loss: parseFloat(r.Profit_Loss) || 0,
    Installment_Status: cloudVal(r.Installment_Status),
    Resell_Status: cloudVal(r.Resell_Status) || 'No',
    Resell_Amount: parseFloat(r.Resell_Amount) || 0,
    Receipt_Number: cloudVal(r.Receipt_Number),
    File_Status: cloudVal(r.File_Status) || 'Not Delivered',
    File_Delivery_Image: cloudVal(r.File_Delivery_Image),
    Status: cloudVal(r.Status) || 'Available',
  };

  const saleInfo = findPropertyStatus(type, number, townName, sales, resellHistory);
  if (saleInfo) {
    base.Status = saleInfo.Status;
    if (saleInfo.Customer_Name) base.Customer_Name = saleInfo.Customer_Name;
    if (saleInfo.CNIC) base.CNIC = saleInfo.CNIC;
    if (saleInfo.Phone_Number) base.Phone_Number = saleInfo.Phone_Number;
    if (saleInfo.Sell_Date) base.Sell_Date = saleInfo.Sell_Date;
    if (saleInfo.Total_Amount_PKR) base.Total_Amount_PKR = saleInfo.Total_Amount_PKR;
    if (saleInfo.Received_Amount) base.Received_Amount = saleInfo.Received_Amount;
    if (saleInfo.Remaining_Amount) base.Remaining_Amount = saleInfo.Remaining_Amount;
    if (saleInfo.Status === 'Resold') base.Resell_Status = 'Yes';
  }
  return base;
}

function mapShopToCloud(row, sales, resellHistory) {
  const r = stripInternal(row);
  const type = 'Shop';
  const number = String(r.Shop_Number || r.Property_Number || '');
  const townName = String(r.Town_Name || '');
  const base = {
    Property_Type: 'Shop',
    Property_Number: number,
    Town_Name: townName,
    Property_Size: cloudVal(r.Shop_Size),
    Marla: r.Shop_Marla != null && r.Shop_Marla !== '' ? parseFloat(r.Shop_Marla) : null,
    Per_Marla_Price: parseFloat(r.Per_Marla_Price) || 0,
    Road_Type: cloudVal(r.Road_Type),
    Road_Key: cloudVal(r.Road_Key),
    Total_Price: parseFloat(r.Total_Price) || 0,
    Owner_Name: cloudVal(r.Owner_Name),
    Property_Category: cloudVal(r.Property_Category) || 'Commercial',
    Customer_Name: cloudVal(r.Customer_Name),
    CNIC: cloudVal(r.CNIC),
    Phone_Number: cloudVal(r.Phone_Number),
    Sell_Date: cloudVal(r.Sell_Date),
    Total_Amount_PKR: parseFloat(r.Total_Amount_PKR) || 0,
    Advance_Amount_PKR: parseFloat(r.Advance_Amount_PKR) || 0,
    Total_Installments: parseInt(r.Total_Installments) || 0,
    Total_Period_Months: parseInt(r.Total_Period_Months) || 0,
    Gap_Days: parseInt(r.Gap_Days) || 0,
    Gap_Label: cloudVal(r.Gap_Label),
    Monthly_Installment: parseFloat(r.Monthly_Installment) || 0,
    Received_Amount: parseFloat(r.Received_Amount) || 0,
    Remaining_Amount: parseFloat(r.Remaining_Amount) || 0,
    Agent_Name: cloudVal(r.Agent_Name),
    Commission_Rate: parseFloat(r.Commission_Rate) || 0,
    Commission_Amount: parseFloat(r.Commission_Amount) || 0,
    Expense_Total: parseFloat(r.Expense_Total) || 0,
    Profit_Loss: parseFloat(r.Profit_Loss) || 0,
    Installment_Status: cloudVal(r.Installment_Status),
    Resell_Status: cloudVal(r.Resell_Status) || 'No',
    Resell_Amount: parseFloat(r.Resell_Amount) || 0,
    Receipt_Number: cloudVal(r.Receipt_Number),
    File_Status: cloudVal(r.File_Status) || 'Not Delivered',
    File_Delivery_Image: cloudVal(r.File_Delivery_Image),
    Status: cloudVal(r.Status) || 'Available',
  };

  const saleInfo = findPropertyStatus(type, number, townName, sales, resellHistory);
  if (saleInfo) {
    base.Status = saleInfo.Status;
    if (saleInfo.Customer_Name) base.Customer_Name = saleInfo.Customer_Name;
    if (saleInfo.CNIC) base.CNIC = saleInfo.CNIC;
    if (saleInfo.Phone_Number) base.Phone_Number = saleInfo.Phone_Number;
    if (saleInfo.Sell_Date) base.Sell_Date = saleInfo.Sell_Date;
    if (saleInfo.Total_Amount_PKR) base.Total_Amount_PKR = saleInfo.Total_Amount_PKR;
    if (saleInfo.Received_Amount) base.Received_Amount = saleInfo.Received_Amount;
    if (saleInfo.Remaining_Amount) base.Remaining_Amount = saleInfo.Remaining_Amount;
    if (saleInfo.Status === 'Resold') base.Resell_Status = 'Yes';
  }
  return base;
}

function mapPropertyFromCloud(row, type, sales, resellHistory) {
  const base = {
    Property_Type: type,
    Town_Name: getRowVal(row, 'Town_Name') || '',
    Per_Marla_Price: parseFloat(getRowVal(row, 'Per_Marla_Price')) || 0,
    Total_Price: parseFloat(getRowVal(row, 'Total_Price')) || 0,
    Owner_Name: getRowVal(row, 'Owner_Name') || '',
    Customer_Name: getRowVal(row, 'Customer_Name') || '',
    CNIC: getRowVal(row, 'CNIC') || '',
    Phone_Number: getRowVal(row, 'Phone_Number') || '',
    Sell_Date: getRowVal(row, 'Sell_Date') || '',
    Total_Amount_PKR: parseFloat(getRowVal(row, 'Total_Amount_PKR')) || 0,
    Advance_Amount_PKR: parseFloat(getRowVal(row, 'Advance_Amount_PKR')) || 0,
    Total_Installments: parseInt(getRowVal(row, 'Total_Installments')) || 0,
    Total_Period_Months: parseInt(getRowVal(row, 'Total_Period_Months')) || 0,
    Gap_Days: parseInt(getRowVal(row, 'Gap_Days')) || 0,
    Gap_Label: getRowVal(row, 'Gap_Label') || '',
    Monthly_Installment: parseFloat(getRowVal(row, 'Monthly_Installment')) || 0,
    Received_Amount: parseFloat(getRowVal(row, 'Received_Amount')) || 0,
    Remaining_Amount: parseFloat(getRowVal(row, 'Remaining_Amount')) || 0,
    Agent_Name: getRowVal(row, 'Agent_Name') || '',
    Commission_Rate: parseFloat(getRowVal(row, 'Commission_Rate')) || 0,
    Commission_Amount: parseFloat(getRowVal(row, 'Commission_Amount')) || 0,
    Expense_Total: parseFloat(getRowVal(row, 'Expense_Total')) || 0,
    Profit_Loss: parseFloat(getRowVal(row, 'Profit_Loss')) || 0,
    Installment_Status: getRowVal(row, 'Installment_Status') || '',
    Resell_Status: getRowVal(row, 'Resell_Status') || 'No',
    Resell_Amount: parseFloat(getRowVal(row, 'Resell_Amount')) || 0,
    Receipt_Number: getRowVal(row, 'Receipt_Number') || '',
    File_Status: getRowVal(row, 'File_Status') || 'Not Delivered',
    File_Delivery_Image: getRowVal(row, 'File_Delivery_Image') || '',
    Status: getRowVal(row, 'Status') || 'Available',
    Property_Category: getRowVal(row, 'Property_Category') || (type === 'Plot' ? 'Residential' : 'Commercial'),
  };
  const number = getRowVal(row, 'Property_Number') || '';
  
  const saleInfo = findPropertyStatus(type, number, base.Town_Name, sales, resellHistory);
  if (saleInfo) {
    base.Status = saleInfo.Status;
    if (saleInfo.Customer_Name) base.Customer_Name = saleInfo.Customer_Name;
    if (saleInfo.CNIC) base.CNIC = saleInfo.CNIC;
    if (saleInfo.Phone_Number) base.Phone_Number = saleInfo.Phone_Number;
    if (saleInfo.Sell_Date) base.Sell_Date = saleInfo.Sell_Date;
    if (saleInfo.Total_Amount_PKR) base.Total_Amount_PKR = saleInfo.Total_Amount_PKR;
    if (saleInfo.Received_Amount) base.Received_Amount = saleInfo.Received_Amount;
    if (saleInfo.Remaining_Amount) base.Remaining_Amount = saleInfo.Remaining_Amount;
    if (saleInfo.Status === 'Resold') base.Resell_Status = 'Yes';
  }

  if (type === 'Plot') {
    return { ...base, Plot_Number: number, Plot_Size: getRowVal(row, 'Property_Size') || '', Plot_Marla: getRowVal(row, 'Marla') ?? '' };
  }
  return {
    ...base,
    Shop_Number: number,
    Shop_Size: getRowVal(row, 'Property_Size') || '',
    Shop_Marla: getRowVal(row, 'Marla') ?? '',
    Road_Type: getRowVal(row, 'Road_Type') || '',
    Road_Key: getRowVal(row, 'Road_Key') || '',
  };
}

function mapGenericToCloud(table, row) {
  const r = stripInternal(row);
  const cols = TABLE_COLUMNS[table] || [];
  const out = {};
  for (const col of cols) {
    let val = getRowVal(r, col);
    if (col === 'Is_Over_Limit') val = boolFromExcel(val);
    if (val === undefined || val === null) val = null;
    out[col] = val;
  }
  return out;
}

function mapGenericFromCloud(table, row) {
  const cols = TABLE_COLUMNS[table];
  if (!cols || !row || typeof row !== 'object') return stripInternal(row);
  const mapped = {};
  for (const col of cols) {
    let val = getRowVal(row, col);
    if (col === 'Is_Over_Limit') val = boolToExcel(val);
    mapped[col] = val ?? '';
  }
  return mapped;
}

function mapEmployeeToCloud(e) {
  const empName = String(e.name || e.Employee_Name || e.Name || '').trim();
  return {
    Employee_ID: String(e.id || e.Employee_ID || ''),
    Employee_Name: empName,
    CNIC: String(e.cnic || e.CNIC || ''),
    Phone: String(e.phone || e.Phone || e.Phone_Number || ''),
    Role: String(e.designation || e.Role || e.Designation || 'Employee'),
    Town_Name: String(e.townName || e.Town_Name || ''),
    Salary: parseFloat(e.baseSalary || e.Salary || e.Base_Salary || 0),
    Status: String(e.status || e.Status || 'Active'),
  };
}

function mapEmployeeFromCloud(e, idx) {
  return {
    id: idx + 1,
    Town_Name: getRowVal(e, 'Town_Name') || '',
    Name: getRowVal(e, 'Employee_Name') || getRowVal(e, 'Name') || '',
    Designation: getRowVal(e, 'Role') || getRowVal(e, 'Designation') || '',
    Phone: getRowVal(e, 'Phone') || getRowVal(e, 'Phone_Number') || '',
    CNIC: getRowVal(e, 'CNIC') || '',
    Base_Salary: parseFloat(getRowVal(e, 'Salary') || getRowVal(e, 'Base_Salary')) || 0,
    Join_Date: String(getRowVal(e, 'created_at') || getRowVal(e, 'date_added') || '').split('T')[0] || '',
    Status: getRowVal(e, 'Status') || 'Active',
  };
}

function mapAdvanceToCloud(a) {
  return {
    Advance_ID: String(a.id || a.Advance_ID || ''),
    Town_Name: String(a.townName || a.Town_Name || ''),
    Employee_Name: String(a.employeeName || a.Employee_Name || ''),
    Amount: parseFloat(a.totalAmount || a.Amount || 0),
    Date: String(a.startDate || a.Start_Date || a.Date || new Date().toISOString().split('T')[0]),
    Month: String(a.month || a.Month || ''),
    Status: String(a.status || a.Status || 'Active'),
    Notes: String(a.notes || a.Notes || ''),
  };
}

function mapAdvanceFromCloud(a, idx) {
  const amount = parseFloat(getRowVal(a, 'Amount')) || 0;
  return {
    id: idx + 1,
    Town_Name: getRowVal(a, 'Town_Name') || '',
    Employee_Name: getRowVal(a, 'Employee_Name') || '',
    Advance_Type: 'installment',
    Total_Amount: amount,
    Total_Installments: 1,
    Current_Installment: 0,
    Monthly_Deduction: amount,
    Start_Date: getRowVal(a, 'Date') || '',
    Status: getRowVal(a, 'Status') || 'Active',
  };
}

function mapSalaryRecordToCloud(sp) {
  const r = stripInternal(sp);
  return {
    Payment_ID: String(r.Receipt_Number || r.Payment_ID || ''),
    Town_Name: String(r.Town_Name || ''),
    Employee_Name: String(r.Name || r.Employee_Name || ''),
    Payment_Date: String(r.Date || r.Payment_Date || ''),
    Amount: parseFloat(r.Amount) || 0,
    Month: String(r.Month || ''),
    Payment_Method: String(r.Payment_Method || 'Cash'),
    Notes: String(r.Note || r.Notes || ''),
    Recorded_By: String(r.Paid_By || r.Recorded_By || ''),
    Advance_Deduction: parseFloat(r.Advance_Deduction) || 0,
    New_Advance_Given: parseFloat(r.New_Advance_Given) || 0,
    Salary_Amount: parseFloat(r.Salary_Amount) || 0,
    Salary_Gross_Amount: parseFloat(r.Salary_Gross_Amount) || 0,
    Cash_Disbursed_Amount: parseFloat(r.Cash_Disbursed_Amount || r.Amount) || 0,
    Salary_Paid_Amount: parseFloat(r.Salary_Paid_Amount) || 0,
    Salary_Paid_Before: parseFloat(r.Salary_Paid_Before) || 0,
    Salary_Paid_After: parseFloat(r.Salary_Paid_After) || 0,
    Salary_Remaining_After: parseFloat(r.Salary_Remaining_After) || 0,
    Is_Advance_Salary: String(r.Is_Advance_Salary || 'No'),
  };
}

function mapSalaryRecordFromCloud(sp) {
  return {
    Receipt_Number: getRowVal(sp, 'Payment_ID') || getRowVal(sp, 'Receipt_Number') || '',
    Date: getRowVal(sp, 'Payment_Date') || getRowVal(sp, 'Date') || '',
    Month: getRowVal(sp, 'Month') || '',
    Type: getRowVal(sp, 'Type') || 'Employee',
    Name: getRowVal(sp, 'Employee_Name') || getRowVal(sp, 'Name') || '',
    Designation: getRowVal(sp, 'Designation') || '',
    Amount: parseFloat(getRowVal(sp, 'Amount')) || 0,
    Town_Name: getRowVal(sp, 'Town_Name') || '',
    Note: getRowVal(sp, 'Notes') || getRowVal(sp, 'Note') || '',
    Paid_By: getRowVal(sp, 'Recorded_By') || getRowVal(sp, 'Paid_By') || '',
    Advance_Deduction: parseFloat(getRowVal(sp, 'Advance_Deduction')) || 0,
    New_Advance_Given: parseFloat(getRowVal(sp, 'New_Advance_Given')) || 0,
    Salary_Amount: parseFloat(getRowVal(sp, 'Salary_Amount')) || 0,
    Salary_Gross_Amount: parseFloat(getRowVal(sp, 'Salary_Gross_Amount')) || 0,
    Cash_Disbursed_Amount: parseFloat(getRowVal(sp, 'Cash_Disbursed_Amount') || getRowVal(sp, 'Amount')) || 0,
    Salary_Paid_Amount: parseFloat(getRowVal(sp, 'Salary_Paid_Amount')) || 0,
    Salary_Paid_Before: parseFloat(getRowVal(sp, 'Salary_Paid_Before')) || 0,
    Salary_Paid_After: parseFloat(getRowVal(sp, 'Salary_Paid_After')) || 0,
    Salary_Remaining_After: parseFloat(getRowVal(sp, 'Salary_Remaining_After')) || 0,
    Is_Advance_Salary: getRowVal(sp, 'Is_Advance_Salary') || 'No',
  };
}

function mapDailyEntryToCloud(row) {
  const r = stripInternal(row);
  const now = new Date();
  const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);
  return {
    Entry_ID: String(r.Entry_ID || r.entryId || r.entry_id || ''),
    Town_Name: String(r.Town_Name || r.townName || r.town_name || ''),
    Date: String(r.Date || r.date || now.toISOString().split('T')[0]),
    Time: String(r.Time || r.time || currentTime),
    Type: String(r.Type || r.type || 'Income'),
    Category: String(r.Category || r.category || r.Income_Type || r.incomeType || ''),
    Amount: parseFloat(r.Amount ?? r.amount) || 0,
    Description: String(r.Description || r.description || ''),
    Account_Name: String(r.Account_Name || r.accountName || r.account_name || ''),
    Account_Type: String(r.Account_Type || r.accountType || r.account_type || ''),
    Reference: String(r.Property_ID || r.propertyId || r.Installment_ID || r.installmentId || r.Reference || r.reference || ''),
    Created_By: String(r.Created_By || r.createdBy || r.created_by || ''),
    Review_Status: String(r.Review_Status || r.reviewStatus || r.review_status || ''),
    Payment_Account_ID: String(r.Payment_Account_ID || r.paymentAccountId || r.payment_account_id || 'cash-in-hand'),
    Payment_Account_Name: String(r.Payment_Account_Name || r.paymentAccountName || r.payment_account_name || 'Cash in Hand'),
    Payment_Account_Type: String(r.Payment_Account_Type || r.paymentAccountType || r.payment_account_type || 'cash'),
  };
}

function mapDailyEntryFromCloud(row) {
  let rawDate = String(getRowVal(row, 'Date') || getRowVal(row, 'date') || getRowVal(row, 'created_at') || '').trim();
  if (rawDate.includes('T')) rawDate = rawDate.split('T')[0];
  if (rawDate.includes(' ')) rawDate = rawDate.split(' ')[0];
  rawDate = rawDate.slice(0, 10);

  let rawTime = String(getRowVal(row, 'Time') || getRowVal(row, 'time') || '').trim();
  if (!rawTime || rawTime === '00:00' || rawTime === '00:00:00') {
    const rawCreatedAt = String(getRowVal(row, 'created_at') || getRowVal(row, 'Created_At') || '').trim();
    if (rawCreatedAt.includes('T')) {
      rawTime = rawCreatedAt.split('T')[1].substring(0, 8);
    }
  }

  const entryId = String(getRowVal(row, 'Entry_ID') || getRowVal(row, 'entry_id') || getRowVal(row, 'client_write_id') || '').trim();

  return {
    Entry_ID: entryId,
    Date: rawDate,
    Time: rawTime || '00:00:00',
    Type: getRowVal(row, 'Type') || getRowVal(row, 'type') || 'Income',
    Description: getRowVal(row, 'Description') || getRowVal(row, 'description') || '',
    Amount: parseFloat(getRowVal(row, 'Amount') ?? getRowVal(row, 'amount')) || 0,
    Town_Name: getRowVal(row, 'Town_Name') || getRowVal(row, 'town_name') || '',
    Account_Name: getRowVal(row, 'Account_Name') || getRowVal(row, 'account_name') || 'Cash in Hand',
    Account_Type: getRowVal(row, 'Account_Type') || getRowVal(row, 'account_type') || 'cash',
    Income_Type: getRowVal(row, 'Category') || getRowVal(row, 'category') || '',
    Category: getRowVal(row, 'Category') || getRowVal(row, 'category') || 'Daily',
    Subcategory: getRowVal(row, 'Subcategory') || getRowVal(row, 'subcategory') || '',
    Property_ID: getRowVal(row, 'Reference') || getRowVal(row, 'reference') || '',
    Installment_ID: '',
    Property_Details: '',
    Installment_Details: '',
    Reference: getRowVal(row, 'Reference') || getRowVal(row, 'reference') || '',
    Created_By: getRowVal(row, 'Created_By') || getRowVal(row, 'created_by') || 'System',
    Review_Status: getRowVal(row, 'Review_Status') || getRowVal(row, 'review_status') || 'approved',
    Payment_Account_ID: getRowVal(row, 'Payment_Account_ID') || getRowVal(row, 'payment_account_id') || 'cash-in-hand',
    Payment_Account_Name: getRowVal(row, 'Payment_Account_Name') || getRowVal(row, 'payment_account_name') || 'Cash in Hand',
    Payment_Account_Type: getRowVal(row, 'Payment_Account_Type') || getRowVal(row, 'payment_account_type') || 'cash',
  };
}

function mapCeoExpenseFromCloud(row) {
  const mapped = {};
  for (const col of TABLE_COLUMNS.ceo_expenses) {
    let val = getRowVal(row, col);
    if (col === 'Is_Over_Limit') val = boolToExcel(val);
    mapped[col] = val ?? '';
  }
  return mapped;
}

function pickTableRows(table, rows) {
  if (!rows || rows.length === 0) return [];
  const cols = TABLE_COLUMNS[table];
  if (!cols) return rows.map(stripInternal);
  return rows
    .map((row) => mapGenericToCloud(table, row))
    .filter((r) => {
      if (!r || Object.keys(r).length === 0) return false;
      if (['all_sales', 'installments', 'resell_history'].includes(table)) {
        return PROPERTY_TYPES.has(String(r.Type || '').trim());
      }
      return true;
    });
}

function pascalToSnake(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function toCloudKey(table, key) {
  const tableMap = TABLE_KEY_MAP[table] || {};
  if (tableMap[key]) return tableMap[key];
  if (GLOBAL_KEY_MAP[key]) return GLOBAL_KEY_MAP[key];
  return pascalToSnake(key);
}

function sanitizeCloudValue(col, val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string' && val.trim() === '') return null;
  if (col === 'is_over_limit') return boolFromExcel(val);
  if (DATE_COLUMNS.has(col)) {
    const s = String(val).trim();
    if (!s || s === 'Invalid Date' || s === 'null' || s === 'undefined') return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return col.endsWith('_at') && s.includes('T') ? s : s.split('T')[0];
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return col.endsWith('_at') ? d.toISOString() : d.toISOString().split('T')[0];
    return null;
  }
  // Preserve non-empty string values as string (e.g. description, names, notes, references)
  if (typeof val === 'string') return val;
  return val;
}

function toCloudRow(table, row) {
  const skip = TABLE_SKIP_KEYS[table] || new Set();
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (!k || k.startsWith('_')) continue;
    const cloudKey = toCloudKey(table, k);
    if (!cloudKey || skip.has(k) || skip.has(cloudKey)) continue;
    out[cloudKey] = sanitizeCloudValue(cloudKey, v);
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  if (!out.created_at) {
    const origDate = getRowVal(row, 'Created_At') || getRowVal(row, 'Date') || getRowVal(row, 'Sell_Date') || getRowVal(row, 'Payment_Date') || dateStr;
    out.created_at = sanitizeCloudValue('created_at', origDate);
  }

  const rawTime = getRowVal(row, 'Time') || getRowVal(row, 'time');
  if (rawTime && out.time === undefined) {
    out.time = rawTime;
  }

  const creator = getRowVal(row, 'Created_By') || getRowVal(row, 'Added_By') || getRowVal(row, 'Recorded_By') || getRowVal(row, 'Paid_By') || getRowVal(row, 'created_by');
  if (creator && out.created_by === undefined && ['daily_entries', 'user_activity', 'money_ledger'].includes(table)) {
    out.created_by = creator;
  }

  if (!skip.has('updated_at')) {
    out.updated_at = now.toISOString();
  }
  return out;
}

function toCloudMatch(table, match) {
  const out = {};
  for (const [k, v] of Object.entries(match || {})) {
    if (!k || k.startsWith('_')) continue;
    out[toCloudKey(table, k)] = v;
  }
  return out;
}

function extractMissingColumn(msg) {
  const text = String(msg || '');
  const patterns = [
    /Could not find the '([^']+)' column/,
    /column "([^"]+)" does not exist/,
    /column ([a-zA-Z0-9_]+) does not exist/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

function isMissingTableError(msg) {
  return String(msg || '').includes('Could not find the table');
}

function isMissingConflictConstraint(msg) {
  return String(msg || '').toLowerCase().includes('no unique or exclusion constraint matching the on conflict specification');
}

async function insertBatchFallback(admin, table, batch) {
  const { error } = await admin.from(table).insert(batch);
  if (!error) return;
  if (String(error.message || '').toLowerCase().includes('duplicate')) return;
  throw error;
}

function isNetworkFetchError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('failed to fetch');
}

async function upsertAll(admin, table, rows) {
  if (!rows || rows.length === 0) return;

  const conflict = UPSERT_CONFLICT[table];
  let skipCols = new Set();

  for (let attempt = 0; attempt < 50; attempt++) {
    let filtered = rows
      .map((row) => {
        const cloud = toCloudRow(table, row);
        for (const col of skipCols) delete cloud[col];
        return cloud;
      })
      .filter((r) => r && Object.keys(r).length > 0);

    if (filtered.length === 0) return;

    if (conflict) {
      const keys = conflict.split(',').map((k) => k.trim());
      const seen = new Map();
      for (const row of filtered) {
        const hasKeys = keys.every(k => row[k] !== undefined && row[k] !== null);
        if (hasKeys) {
          const keyVal = keys.map((k) => String(row[k])).join('|');
          seen.set(keyVal, row);
        } else {
          seen.set(`__nomatch__${Math.random()}`, row);
        }
      }
      filtered = Array.from(seen.values());
    }

    try {
      for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        const batch = filtered.slice(i, i + BATCH_SIZE);
        const opts = conflict ? { onConflict: conflict, ignoreDuplicates: false } : { ignoreDuplicates: false };
        
        let lastError = null;
        for (let retry = 0; retry < 3; retry++) {
          try {
            const { error } = await admin.from(table).upsert(batch, opts);
            if (!error) {
              lastError = null;
              break;
            }
            lastError = error;
            if (conflict && isMissingConflictConstraint(error.message)) {
              console.warn(`[syncUp] "${table}" is missing unique constraint for "${conflict}". Falling back to insert.`);
              await insertBatchFallback(admin, table, batch);
              lastError = null;
              break;
            }
            if (isNetworkFetchError(error.message)) {
              await new Promise(r => setTimeout(r, 800 * (retry + 1)));
              continue;
            }
            break;
          } catch (netErr) {
            lastError = netErr;
            if (isNetworkFetchError(netErr.message || netErr)) {
              await new Promise(r => setTimeout(r, 800 * (retry + 1)));
              continue;
            }
            throw netErr;
          }
        }

        if (lastError) {
          const sample = batch.find((row) => Object.values(row || {}).some((v) => typeof v === 'string' && v.length > 10)) || batch[0];
          lastError.message = `${lastError.message || lastError} [table=${table}, batch=${Math.floor(i / BATCH_SIZE) + 1}, sample=${JSON.stringify(sample).slice(0, 300)}]`;
          throw lastError;
        }
      }
      return;
    } catch (e) {
      const badCol = extractMissingColumn(e.message || '');
      if (badCol) {
        console.warn(`[syncUp] Skipping unknown column "${badCol}" for "${table}"`);
        skipCols.add(badCol.toLowerCase());
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Failed to upsert "${table}" — too many unknown columns`);
}

async function upsertAllSafe(admin, table, rows) {
  try {
    await upsertAll(admin, table, rows);
    return { ok: true };
  } catch (e) {
    if (isMissingTableError(e.message)) {
      console.warn(`[syncUp] Skipping "${table}" — table not found in cloud`);
      return { ok: false, skipped: true, reason: e.message };
    }
    if (isNetworkFetchError(e.message || e)) {
      console.warn(`[syncUp] Network offline/unstable during sync for "${table}". Queued background sync.`);
      return { ok: false, offline: true, reason: e.message || String(e) };
    }
    throw e;
  }
}

module.exports = {
  getAdminClient,
  upsertAll,
  upsertAllSafe,
  toCloudRow,
  toCloudMatch,
  toCloudKey,
  getRowVal,
  pickTableRows,
  mapTownToCloud,
  mapTownFromCloud,
  mapPlotToCloud,
  mapShopToCloud,
  mapPropertyFromCloud,
  mapEmployeeToCloud,
  mapEmployeeFromCloud,
  mapAdvanceToCloud,
  mapAdvanceFromCloud,
  mapSalaryRecordToCloud,
  mapSalaryRecordFromCloud,
  mapDailyEntryToCloud,
  mapDailyEntryFromCloud,
  mapCeoExpenseFromCloud,
  mapGenericFromCloud,
  TABLE_COLUMNS,
  stripInternal,
};
