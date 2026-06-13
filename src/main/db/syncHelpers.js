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
  },
  salary_payments: {
    Payment_ID: 'receipt_number',
    Employee_Name: 'name',
    Payment_Date: 'date',
    Notes: 'note',
    Recorded_By: 'paid_by',
  },
};

const TABLE_SKIP_KEYS = {
  towns: new Set(['total_plots', 'total_shops', 'Total_Plots', 'Total_Shops']),
};

const PROPERTY_TYPES = new Set(['Plot', 'Shop']);

const DATE_COLUMNS = new Set([
  'sell_date', 'due_date', 'paid_date', 'date', 'date_recorded',
  'created_date', 'payment_date', 'start_date', 'month_year',
]);

const TABLE_COLUMNS = {
  towns: ['Town_Name', 'Location', 'Commission_Rate', 'Latitude', 'Longitude', 'Total_Plots', 'Total_Shops', 'Total_Income_PKR', 'Total_Expenses_PKR', 'Profit_Loss', 'Status'],
  all_sales: ['Sale_ID', 'Plot_Shop_Number', 'Type', 'Town_Name', 'Customer_Name', 'CNIC', 'Phone_Number', 'Sell_Date', 'Total_Amount_PKR', 'Advance_Amount_PKR', 'Total_Installments', 'Total_Period_Months', 'Gap_Days', 'Gap_Label', 'Monthly_Installment', 'Received_Amount', 'Remaining_Amount', 'Agent_Name', 'Commission_Rate', 'Commission_Amount', 'Company_Income', 'Expense_Total', 'Profit_Loss', 'Receipt_Number', 'File_Status', 'Status', 'Sale_Type', 'Payment_Method', 'Cheque_Number', 'Cheque_Bank', 'Cheque_Image', 'Transaction_ID', 'Transfer_Bank', 'Transfer_Image'],
  installments: ['Tracker_ID', 'Plot_Shop_Number', 'Type', 'Town_Name', 'Customer_Name', 'Phone_Number', 'Monthly_Amount', 'Due_Date', 'Status', 'Paid_Date', 'Month_Number', 'Total_Months', 'Received_Amount', 'Remaining_Amount', 'Agent_Name'],
  expenses: ['Expense_ID', 'Town_Name', 'Expense_Name', 'Amount_PKR', 'Description', 'Category', 'Date', 'Added_By'],
  ceo_expenses: ['Expense_ID', 'Town_Name', 'Expense_Name', 'Amount_PKR', 'Description', 'Category', 'Date', 'Town_Income', 'Expense_Limit', 'Is_Over_Limit'],
  ceo_salary: ['Salary_ID', 'Town_Name', 'Month_Year', 'Amount_PKR', 'Date_Recorded', 'Notes'],
  notifications: ['Notification_ID', 'Type', 'Message', 'Plot_Shop_Number', 'Town_Name', 'Customer_Name', 'Due_Date', 'Created_Date', 'Status', 'Dismissed'],
  employees_v2: ['Employee_ID', 'Employee_Name', 'CNIC', 'Phone', 'Town_Name', 'Role', 'Salary', 'Status'],
  advance_salaries: ['Advance_ID', 'Employee_Name', 'Town_Name', 'Amount', 'Date', 'Month', 'Status', 'Notes'],
  salary_payments: ['Payment_ID', 'Employee_Name', 'Town_Name', 'Amount', 'Month', 'Payment_Date', 'Payment_Method', 'Notes', 'Recorded_By'],
  daily_entries: ['Entry_ID', 'Town_Name', 'Date', 'Type', 'Category', 'Amount', 'Description', 'Reference', 'Created_By'],
  properties: ['Property_Type', 'Property_Number', 'Town_Name', 'Property_Size', 'Marla', 'Per_Marla_Price', 'Road_Type', 'Road_Key', 'Total_Price', 'Owner_Name', 'Property_Category', 'Customer_Name', 'CNIC', 'Phone_Number', 'Sell_Date', 'Total_Amount_PKR', 'Advance_Amount_PKR', 'Total_Installments', 'Total_Period_Months', 'Gap_Days', 'Gap_Label', 'Monthly_Installment', 'Received_Amount', 'Remaining_Amount', 'Agent_Name', 'Commission_Rate', 'Commission_Amount', 'Expense_Total', 'Profit_Loss', 'Installment_Status', 'Resell_Status', 'Resell_Amount', 'Receipt_Number', 'File_Status', 'Status'],
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
  return {
    Town_Name: getRowVal(row, 'Town_Name') || '',
    Total_Plots: parseInt(getRowVal(row, 'Total_Plots')) || 0,
    Total_Shops: parseInt(getRowVal(row, 'Total_Shops')) || 0,
    Total_Income_PKR: parseFloat(getRowVal(row, 'Total_Income_PKR')) || 0,
    Total_Expenses_PKR: parseFloat(getRowVal(row, 'Total_Expenses_PKR')) || 0,
    Profit_Loss: parseFloat(getRowVal(row, 'Profit_Loss')) || 0,
    Commission_Rate: parseFloat(getRowVal(row, 'Commission_Rate')) || 0,
    Status: getRowVal(row, 'Status') || 'Active',
    Location_Text: getRowVal(row, 'Location') || getRowVal(row, 'Town_Location') || '',
    Location_Lat: getRowVal(row, 'Latitude') ?? '',
    Location_Lng: getRowVal(row, 'Longitude') ?? '',
  };
}

function mapPlotToCloud(row) {
  const r = stripInternal(row);
  return {
    Property_Type: 'Plot',
    Property_Number: String(r.Plot_Number || r.Property_Number || ''),
    Town_Name: String(r.Town_Name || ''),
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
    Status: cloudVal(r.Status) || 'Available',
  };
}

function mapShopToCloud(row) {
  const r = stripInternal(row);
  return {
    Property_Type: 'Shop',
    Property_Number: String(r.Shop_Number || r.Property_Number || ''),
    Town_Name: String(r.Town_Name || ''),
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
    Status: cloudVal(r.Status) || 'Available',
  };
}

function mapPropertyFromCloud(row, type) {
  const base = {
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
    Status: getRowVal(row, 'Status') || 'Available',
    Property_Category: getRowVal(row, 'Property_Category') || (type === 'Plot' ? 'Residential' : 'Commercial'),
  };
  const number = getRowVal(row, 'Property_Number') || '';
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

function mapEmployeeToCloud(e) {
  return {
    Employee_ID: String(e.id || e.Employee_ID || ''),
    Employee_Name: String(e.name || e.Employee_Name || ''),
    CNIC: String(e.cnic || e.CNIC || ''),
    Phone: String(e.phone || e.Phone || ''),
    Role: String(e.designation || e.Role || 'Employee'),
    Town_Name: String(e.townName || e.Town_Name || ''),
    Salary: parseFloat(e.baseSalary || e.Salary || 0),
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
  };
}

function mapDailyEntryToCloud(row) {
  const r = stripInternal(row);
  return {
    Entry_ID: String(r.Entry_ID || ''),
    Town_Name: String(r.Town_Name || ''),
    Date: String(r.Date || ''),
    Type: String(r.Type || 'Income'),
    Category: String(r.Category || r.Income_Type || ''),
    Amount: parseFloat(r.Amount) || 0,
    Description: String(r.Description || ''),
    Reference: String(r.Property_ID || r.Installment_ID || r.Reference || ''),
    Created_By: String(r.Created_By || ''),
  };
}

function mapDailyEntryFromCloud(row) {
  return {
    Entry_ID: getRowVal(row, 'Entry_ID') || '',
    Date: getRowVal(row, 'Date') || '',
    Time: '',
    Type: getRowVal(row, 'Type') || 'Income',
    Description: getRowVal(row, 'Description') || '',
    Amount: parseFloat(getRowVal(row, 'Amount')) || 0,
    Town_Name: getRowVal(row, 'Town_Name') || '',
    Income_Type: getRowVal(row, 'Category') || '',
    Category: getRowVal(row, 'Category') || '',
    Subcategory: '',
    Property_ID: getRowVal(row, 'Reference') || '',
    Installment_ID: '',
    Property_Details: '',
    Installment_Details: '',
    Reference: getRowVal(row, 'Reference') || '',
    Created_By: getRowVal(row, 'Created_By') || '',
    Review_Status: getRowVal(row, 'Review_Status') || '',
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
    if (!s || s === 'Invalid Date') return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
  }
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

async function upsertAll(admin, table, rows) {
  if (!rows || rows.length === 0) return;

  const conflict = UPSERT_CONFLICT[table];
  let skipCols = new Set();

  for (let attempt = 0; attempt < 50; attempt++) {
    const filtered = rows
      .map((row) => {
        const cloud = toCloudRow(table, row);
        for (const col of skipCols) delete cloud[col];
        return cloud;
      })
      .filter((r) => r && Object.keys(r).length > 0);

    if (filtered.length === 0) return;

    try {
      for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        const batch = filtered.slice(i, i + BATCH_SIZE);
        const opts = conflict ? { onConflict: conflict, ignoreDuplicates: false } : { ignoreDuplicates: false };
        const { error } = await admin.from(table).upsert(batch, opts);
        if (error) {
          const sample = batch.find((row) => Object.values(row || {}).some((v) => typeof v === 'string' && v.length > 10)) || batch[0];
          error.message = `${error.message} [table=${table}, batch=${Math.floor(i / BATCH_SIZE) + 1}, sample=${JSON.stringify(sample).slice(0, 300)}]`;
          throw error;
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
  stripInternal,
};
