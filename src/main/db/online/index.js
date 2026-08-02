const anonSupabase = require('../supabase');
const crypto = require('crypto');

function getDeterministicLedgerId(sourceType, sourceId, direction) {
  const input = `${sourceType}|${sourceId}|${direction}`;
  const hash = crypto.createHash('md5').update(input).digest('hex');
  return `LED-${hash}`.slice(0, 50);
}

const {
  getAdminClient,
  toCloudRow,
  toCloudMatch,
  getRowVal,
  mapTownFromCloud,
  mapPropertyFromCloud,
  mapDailyEntryFromCloud,
  mapSalaryRecordFromCloud,
  mapCeoExpenseFromCloud,
  mapGenericFromCloud,
} = require('../syncHelpers');

let adminSupabase = null;
function getCloudClient() {
  if (adminSupabase) return adminSupabase;
  try {
    adminSupabase = getAdminClient();
    return adminSupabase;
  } catch (_) {
    return anonSupabase;
  }
}

const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getCloudClient();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function uuid() {
  return crypto.randomUUID();
}

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
  daily_reports: 'report_id',
};

function normalizeCloudRow(table, row) {
  if (!row || typeof row !== 'object') return row;
  const type = getRowVal(row, 'Property_Type');
  let mapped;
  if (table === 'towns') mapped = mapTownFromCloud(row);
  else if (table === 'properties') mapped = mapPropertyFromCloud(row, type === 'Shop' ? 'Shop' : 'Plot');
  else if (table === 'daily_entries') mapped = mapDailyEntryFromCloud(row);
  else if (table === 'salary_records' || table === 'salary_payments') mapped = mapSalaryRecordFromCloud(row);
  else if (table === 'ceo_expenses') mapped = mapCeoExpenseFromCloud(row);
  else mapped = mapGenericFromCloud(table, row);
  return { ...row, ...mapped };
}

function normalizeCloudRows(table, rows) {
  return (rows || []).map((row) => normalizeCloudRow(table, row));
}

function isMissingConflictConstraint(error) {
  return String(error?.message || '').toLowerCase().includes('no unique or exclusion constraint matching the on conflict specification');
}

function extractMissingColumn(error) {
  const text = String(error?.message || error || '');
  const patterns = [
    /Could not find the '([^']+)' column/,
    /column "([^"]+)" does not exist/,
    /column ([a-zA-Z0-9_]+) does not exist/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return String(match[1] || '').toLowerCase();
  }
  return '';
}

function getAccountantTownFilter() {
  try {
    const storage = require('../storage');
    const ctx = storage.getSyncContext() || {};
    if (String(ctx.role || '').toLowerCase() === 'accountant') {
      return String(ctx.accountantTown || ctx.town_name || ctx.town_id || '').trim();
    }
  } catch (_) {}
  return '';
}

async function getAll(table) {
  const accountantTown = getAccountantTownFilter();
  let query = supabase.from(table).select('*');
  if (accountantTown && table !== 'towns' && table !== 'system_settings') {
    query = query.eq('town_name', accountantTown);
  }
  let { data, error } = await query.order('created_at', { ascending: false });
  if (error && String(error.message || '').includes('created_at')) {
    let fallbackQuery = supabase.from(table).select('*');
    if (accountantTown && table !== 'towns' && table !== 'system_settings') {
      fallbackQuery = fallbackQuery.eq('town_name', accountantTown);
    }
    ({ data, error } = await fallbackQuery);
  }
  if (error) throw error;
  return normalizeCloudRows(table, data);
}

async function insert(table, row) {
  const now = new Date().toISOString();
  let cloudRow = toCloudRow(table, {
    client_write_id: row?.client_write_id || row?.Client_Write_ID || row?.clientWriteId || `${table}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: row?.created_at || row?.Created_At || now,
    updated_at: now,
    sync_status: 'synced',
    ...row,
  });
  const conflict = UPSERT_CONFLICT[table];
  let data;
  let error;
  const skippedColumns = new Set();
  for (let attempt = 0; attempt < 25; attempt++) {
    let query = conflict
      ? supabase.from(table).upsert([cloudRow], { onConflict: conflict }).select()
      : supabase.from(table).insert([cloudRow]).select();
    ({ data, error } = await query);
    if (!error) break;
    if (conflict && isMissingConflictConstraint(error)) {
      ({ data, error } = await supabase.from(table).insert([cloudRow]).select());
      if (!error) break;
    }
    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || skippedColumns.has(missingColumn)) break;
    skippedColumns.add(missingColumn);
    delete cloudRow[missingColumn];
  }
  if (error) throw error;
  return normalizeCloudRow(table, data?.[0]) || row;
}

async function updateWhere(table, match, updates) {
  let query = supabase.from(table).update(toCloudRow(table, { ...updates, updated_at: new Date().toISOString(), sync_status: 'synced' })).select();
  const accountantTown = getAccountantTownFilter();
  if (accountantTown && table !== 'towns' && table !== 'system_settings') {
    query = query.eq('town_name', accountantTown);
  }
  for (const [key, val] of Object.entries(toCloudMatch(table, match))) {
    query = query.eq(key, val);
  }
  const { data, error } = await query;
  if (error) throw error;
  return normalizeCloudRows(table, data);
}

async function deleteWhere(table, match) {
  let query = supabase.from(table).delete();
  const accountantTown = getAccountantTownFilter();
  if (accountantTown && table !== 'towns' && table !== 'system_settings') {
    query = query.eq('town_name', accountantTown);
  }
  for (const [key, val] of Object.entries(toCloudMatch(table, match))) {
    query = query.eq(key, val);
  }
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

async function deleteWhereCaseInsensitive(table, match) {
  let query = supabase.from(table).delete();
  for (const [key, val] of Object.entries(toCloudMatch(table, match))) {
    if (typeof val === 'string' && val.length > 0) {
      query = query.ilike(key, val.trim());
    } else {
      query = query.eq(key, val);
    }
  }
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

async function findOne(table, match) {
  let query = supabase.from(table).select('*');
  const accountantTown = getAccountantTownFilter();
  if (accountantTown && table !== 'towns' && table !== 'system_settings') {
    query = query.eq('town_name', accountantTown);
  }
  for (const [key, val] of Object.entries(toCloudMatch(table, match))) {
    query = query.eq(key, val);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return normalizeCloudRow(table, data);
}

function buildSelectQuery(table, match) {
  let query = supabase.from(table).select('*');
  const accountantTown = getAccountantTownFilter();
  if (accountantTown && table !== 'towns' && table !== 'system_settings') {
    query = query.eq('town_name', accountantTown);
  }
  for (const [key, val] of Object.entries(toCloudMatch(table, match))) {
    query = query.eq(key, val);
  }
  return query;
}

async function findMany(table, match) {
  let { data, error } = await buildSelectQuery(table, match).order('created_at', { ascending: false });
  if (error && String(error.message || '').includes('created_at')) {
    ({ data, error } = await buildSelectQuery(table, match));
  }
  if (error) throw error;
  return normalizeCloudRows(table, data);
}

// ─── PROPERTIES ────────────────────────────────────────────────

async function getProperty(type, number, townName) {
  return await findOne('properties', {
    Property_Type: type,
    Property_Number: String(number),
    Town_Name: townName,
  });
}

async function getAllProperties() {
  const [plots, shops] = await Promise.all([
    findMany('properties', { Property_Type: 'Plot' }),
    findMany('properties', { Property_Type: 'Shop' }),
  ]);
  return { plots, shops };
}

async function getSoldProperties() {
  let query = supabase.from('properties').select('*').in('status', ['Sold', 'Resold', 'sold', 'resold']);
  const accountantTown = getAccountantTownFilter();
  if (accountantTown) {
    query = query.eq('town_name', accountantTown);
  }
  const { data, error } = await query;
  if (error) throw error;
  const all = normalizeCloudRows('properties', data);
  return {
    plots: all.filter(p => getRowVal(p, 'Property_Type') === 'Plot' || p.Plot_Number),
    shops: all.filter(p => getRowVal(p, 'Property_Type') === 'Shop' || p.Shop_Number),
  };
}

async function getPropertiesByTown(townName, type) {
  return await findMany('properties', { Town_Name: townName, Property_Type: type });
}

async function updateProperty(type, number, townName, updates) {
  const { data, error } = await supabase
    .from('properties')
    .update(toCloudRow('properties', updates))
    .eq('property_type', type)
    .eq('property_number', String(number))
    .eq('town_name', townName)
    .select();
  if (error) throw error;
  return normalizeCloudRow('properties', data?.[0]);
}

// ─── SALES ─────────────────────────────────────────────────────

async function getAllSales() {
  return await getAll('all_sales');
}

async function createSale(data) {
  const row = {
    Sale_ID: data.Sale_ID || generateId(),
    Plot_Shop_Number: String(data.number || data.Plot_Shop_Number || ''),
    Type: data.Type || data.type || '',
    Town_Name: data.Town_Name || data.townName || '',
    Customer_Name: data.Customer_Name || '',
    CNIC: data.CNIC || '',
    Phone_Number: data.Phone_Number || '',
    Sell_Date: data.Sell_Date || new Date().toISOString().split('T')[0],
    Expected_Amount_PKR: parseFloat(data.Expected_Amount_PKR) || parseFloat(data.Total_Amount_PKR) || 0,
    Deal_Amount_PKR: parseFloat(data.Deal_Amount_PKR ?? data.Total_Amount_PKR) || 0,
    Discount_Amount_PKR: parseFloat(data.Discount_Amount_PKR) || Math.max(0, (parseFloat(data.Expected_Amount_PKR) || parseFloat(data.Total_Amount_PKR) || 0) - (parseFloat(data.Deal_Amount_PKR ?? data.Total_Amount_PKR) || 0)),
    Total_Amount_PKR: parseFloat(data.Deal_Amount_PKR ?? data.Total_Amount_PKR) || 0,
    Advance_Amount_PKR: parseFloat(data.Advance_Amount_PKR) || 0,
    Total_Installments: parseInt(data.Total_Installments) || 0,
    Total_Period_Months: parseInt(data.Total_Period_Months) || 0,
    Gap_Days: parseInt(data.Gap_Days) || 0,
    Gap_Label: data.Gap_Label || '',
    Monthly_Installment: parseFloat(data.Monthly_Installment) || 0,
    Agent_Name: data.Agent_Name || '',
    Commission_Rate: parseFloat(data.Commission_Rate) || 0,
    Commission_Amount: parseFloat(data.Commission_Amount) || 0,
    Company_Income: parseFloat(data.Company_Income) || 0,
    Expense_Total: parseFloat(data.Expense_Total) || 0,
    Profit_Loss: parseFloat(data.Profit_Loss) || 0,
    Receipt_Number: data.Receipt_Number || '',
    Received_Amount: parseFloat(data.Received_Amount || data.Advance_Amount_PKR) || 0,
    Remaining_Amount: parseFloat(data.Remaining_Amount) || Math.max(0, (parseFloat(data.Deal_Amount_PKR ?? data.Total_Amount_PKR) || 0) - (parseFloat(data.Advance_Amount_PKR) || 0)),
    File_Status: data.File_Status || 'Not Delivered',
    File_Delivery_Image: data.File_Delivery_Image || data.deliveryImage || '',
    Status: data.Status || 'Sold',
    Payment_Method: data.Payment_Method || 'Cash',
    Cheque_Number: data.Cheque_Number || '',
    Cheque_Bank: data.Cheque_Bank || '',
    Cheque_Image: data.Cheque_Image || '',
    Transaction_ID: data.Transaction_ID || '',
    Transfer_Bank: data.Transfer_Bank || '',
    Transfer_Image: data.Transfer_Image || '',
  };
  return await insert('all_sales', row);
}

// ─── INSTALLMENTS ──────────────────────────────────────────────

async function createInstallments(installmentsArray) {
  if (!installmentsArray || installmentsArray.length === 0) return [];
  const rows = installmentsArray.map((row) => toCloudRow('installments', row));
  const { data, error } = await supabase.from('installments').insert(rows).select();
  if (error) throw error;
  return normalizeCloudRows('installments', data);
}

async function getAllInstallments() {
  return await getAll('installments');
}

function titleAccount(value) {
  return String(value || 'general')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function accountForSource(sourceType, direction) {
  const source = String(sourceType || 'general').toLowerCase();
  if (source.includes('sale') || source.includes('collection') || source.includes('installment')) return 'Property Revenue';
  if (source.includes('investor')) return direction === 'income' ? 'Investor Capital' : 'Investor Withdrawal';
  if (source.includes('salary_advance')) return 'Employee Advance Receivable';
  if (source.includes('salary')) return 'Salary Expense';
  if (source.includes('commission')) return 'Commission Expense';
  if (source.includes('construction')) return 'Construction Expense';
  if (source.includes('ceo')) return 'CEO Expense';
  if (source.includes('expense')) return 'Operating Expense';
  if (source.includes('daily')) return direction === 'income' ? 'Daily Income' : 'Daily Expense';
  return titleAccount(sourceType);
}

function debitCreditFor({ direction, sourceType, debitAccount, creditAccount }) {
  if (debitAccount || creditAccount) {
    return {
      debit: debitAccount || (direction === 'income' ? 'Cash / Bank' : accountForSource(sourceType, direction)),
      credit: creditAccount || (direction === 'income' ? accountForSource(sourceType, direction) : 'Cash / Bank'),
    };
  }
  return direction === 'income'
    ? { debit: 'Cash / Bank', credit: accountForSource(sourceType, direction) }
    : { debit: accountForSource(sourceType, direction), credit: 'Cash / Bank' };
}

function stableLedgerReceiptNumber({ sourceType, sourceId, direction, date }) {
  const dStr = String(date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const hash = crypto.createHash('md5').update(String(sourceId)).digest('hex').slice(0, 6).toUpperCase();

  if (sourceType === 'installment_payment') {
    return `INS-${dStr}-${hash}`;
  }
  if (sourceType === 'collection_payment') {
    return `COL-${dStr}-${hash}`;
  }
  if (sourceType === 'salary_payment' || sourceType === 'salary_advance') {
    return `SAL-${dStr}-${hash}`;
  }
  
  const rawType = String(sourceType).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  return `LED-${rawType}-${dStr}-${hash}`;
}

function receiptArchivePayload(row) {
  const receiptNumber = row.Receipt_Number || '';
  if (!receiptNumber) return null;
  return {
    Receipt_ID: `REC-${String(receiptNumber).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 110)}`,
    Receipt_Number: receiptNumber,
    Receipt_Type: row.Source_Type || 'ledger',
    Town_Name: row.Town_Name || '',
    Entity_ID: row.Source_ID || '',
    Entity_Name: row.Party_Name || '',
    Amount: parseFloat(row.Amount) || 0,
    Receipt_Date: row.Date || new Date().toISOString().split('T')[0],
    Payload_JSON: {
      receiptNumber,
      receiptType: row.Source_Type || 'ledger',
      townName: row.Town_Name || '',
      partyName: row.Party_Name || '',
      amount: parseFloat(row.Amount) || 0,
      direction: row.Direction || '',
      debitAccount: row.Debit_Account || '',
      creditAccount: row.Credit_Account || '',
      description: row.Description || '',
      sourceId: row.Source_ID || '',
    },
  };
}

async function recordMoneyEvent(data) {
  const amount = parseFloat(data?.amount ?? data?.Amount) || 0;
  if (amount <= 0) return { skipped: true, reason: 'amount_zero' };
  const sourceType = data.sourceType || data.Source_Type || 'manual';
  const sourceId = data.sourceId || data.Source_ID || uuid();
  const direction = String(data.direction || data.Direction || '').toLowerCase() === 'expense' ? 'expense' : 'income';
  const accounts = debitCreditFor({
    direction,
    sourceType,
    debitAccount: data.debitAccount || data.Debit_Account,
    creditAccount: data.creditAccount || data.Credit_Account,
  });
  const date = data.date || data.Date || new Date().toISOString().split('T')[0];
  const row = {
    Ledger_ID: data.ledgerId || data.Ledger_ID || getDeterministicLedgerId(sourceType, sourceId, direction),
    Town_Name: data.townName || data.Town_Name || '',
    Date: date,
    Source_Type: sourceType,
    Source_ID: sourceId,
    Direction: direction,
    Amount: amount,
    Debit_Account: accounts.debit,
    Credit_Account: accounts.credit,
    Party_Name: data.partyName || data.Party_Name || '',
    Description: data.description || data.Description || '',
    Receipt_Number: data.receiptNumber || data.Receipt_Number || stableLedgerReceiptNumber({ sourceType, sourceId, direction, date }),
    Status: data.status || data.Status || 'approved',
    Created_By: data.createdBy || data.Created_By || 'System',
    Created_At: data.createdAt || data.Created_At || new Date().toISOString(),
    Payment_Method: data.paymentMethod || data.Payment_Method || 'cash',
    Payment_Account_ID: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
    Payment_Account_Name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
    Payment_Account_Type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
  };
  const saved = await insert('money_ledger', row);
  const receipt = receiptArchivePayload(row);
  if (receipt) {
    await insert('receipt_archive', receipt).catch(() => {});
  }
  return saved;
}

async function addDailyEntry(data) {
  // Resolve the review status before writing so Supabase never falls back to the
  // column DEFAULT of 'pending'. Empty Review_Status on today's entries should be
  // treated as 'approved', otherwise the ceo_mobile_daily_receipt_rows RPC
  // (and the 8PM PDF) will silently exclude them.
  const resolvedReview = String(data.Review_Status || data.reviewStatus || data.status || 'approved').toLowerCase();
  const normalizedDate = require('../core').normalizeDate(data.Date || data.date || new Date());
  const dataWithStatus = {
    ...data,
    Date: normalizedDate,
    date: normalizedDate,
    Review_Status: resolvedReview === 'pending' || resolvedReview === 'rejected' ? resolvedReview : 'approved',
  };
  const row = await insert('daily_entries', dataWithStatus);
  const review = resolvedReview;
  const category = String(data.Category || data.category || data.Income_Type || data.incomeType || '').toLowerCase();
  const moduleBacked = category.includes('investor') || category.includes('construction') || category.includes('commission');
  const amount = parseFloat(data.Amount ?? data.amount) || 0;
  const skipLedgerWrite = String(data.Skip_Ledger || data.skipLedger || '').toLowerCase() === 'yes';
  if (!skipLedgerWrite && !moduleBacked && review !== 'pending' && review !== 'rejected' && amount > 0) {
    await recordMoneyEvent({
      sourceType: 'daily_entry',
      sourceId: data.Entry_ID || data.entryId || row.Entry_ID || row.entry_id,
      direction: String(data.Type || data.type || '').toLowerCase() === 'expense' ? 'expense' : 'income',
      amount,
      townName: data.Town_Name || data.townName,
      date: data.Date || data.date,
      partyName: data.Account_Name || data.accountName || data.Created_By || data.createdBy || '',
      description: data.Description || data.description || data.Category || data.category || 'Daily entry',
      createdBy: data.Created_By || data.createdBy || 'System',
      status: 'approved',
      paymentAccountId: data.paymentAccountId || data.Payment_Account_ID,
      paymentAccountName: data.paymentAccountName || data.Payment_Account_Name,
      paymentAccountType: data.paymentAccountType || data.Payment_Account_Type,
    });
  }
  return row;
}


async function getInstallmentsByProperty(type, number, townName) {
  return await findMany('installments', {
    Type: type, Plot_Shop_Number: String(number), Town_Name: townName,
  });
}

async function markInstallmentPaid(data) {
  const { Tracker_ID, Paid_Date, Receipt_Number } = data;

  // Get the installment record first
  const inst = await findOne('installments', { Tracker_ID });
  if (!inst) throw new Error('Installment not found');

  const paidAmount = parseFloat(inst.Monthly_Amount) || 0;
  const paidDate = Paid_Date || new Date().toISOString().split('T')[0];

  // Mark installment as paid
  await updateWhere('installments',
    { Tracker_ID },
    {
      Status: 'paid',
      Paid_Date: paidDate,
      Received_Amount: paidAmount,
      Remaining_Amount: 0,
      Receipt_Number: Receipt_Number || '',
      Paid_By: data.Paid_By || data.Created_By || 'Accountant',
      Payee_Name: inst.Customer_Name || '',
      payment_method: data.paymentMethod || data.Payment_Method || 'Cash',
      payment_account_id: data.paymentAccountId || data.Payment_Account_ID || 'cash-in-hand',
      payment_account_name: data.paymentAccountName || data.Payment_Account_Name || 'Cash in Hand',
      payment_account_type: data.paymentAccountType || data.Payment_Account_Type || 'cash',
    }
  );

  await recordMoneyEvent({
    sourceType: 'installment_payment',
    sourceId: Tracker_ID,
    direction: 'income',
    amount: paidAmount,
    townName: inst.Town_Name,
    date: paidDate,
    partyName: inst.Customer_Name || '',
    description: `${inst.Type || 'Property'} ${inst.Plot_Shop_Number || ''} installment ${inst.Month_Number || ''}`,
    receiptNumber: Receipt_Number || '',
    createdBy: data.Created_By || 'Accountant',
    status: 'approved',
    paymentAccountId: data.paymentAccountId || data.Payment_Account_ID,
    paymentAccountName: data.paymentAccountName || data.Payment_Account_Name,
    paymentAccountType: data.paymentAccountType || data.Payment_Account_Type,
  });

  // Find the sale and update received_amount
  const sale = await findOne('all_sales', {
    Type: inst.Type,
    Plot_Shop_Number: String(inst.Plot_Shop_Number),
    Town_Name: inst.Town_Name,
  });

  if (sale) {
    const totalPrice = parseFloat(sale.Total_Amount_PKR) || 0;
    const saleInstallments = await findMany('installments', {
      Type: inst.Type,
      Plot_Shop_Number: String(inst.Plot_Shop_Number),
      Town_Name: inst.Town_Name,
    });
    const paidSum = (saleInstallments || []).reduce((sum, row) => {
      const isPaid = String(row.Tracker_ID || row.tracker_id) === String(Tracker_ID) || String(row.Status || row.status || '').toLowerCase() === 'paid';
      return isPaid ? sum + (parseFloat(row.Monthly_Amount || row.monthly_amount) || 0) : sum;
    }, 0);
    const advance = parseFloat(sale.Advance_Amount_PKR || sale.advance_amount_pkr) || 0;
    const newReceived = Math.min(advance + paidSum, totalPrice);
    const newRemaining = Math.max(0, totalPrice - newReceived);

    const updates = {
      Received_Amount: newReceived,
      Remaining_Amount: newRemaining,
      payment_status: newRemaining <= 0 ? 'fully_paid' : 'installment_active',
    };

    await updateWhere('all_sales', {
      Type: inst.Type,
      Plot_Shop_Number: String(inst.Plot_Shop_Number),
      Town_Name: inst.Town_Name,
    }, updates);

    // Also update properties table so Sold Properties view shows fresh data
    const propType = inst.Type === 'Plot' ? 'Plot' : 'Shop';
    const propNum = propType === 'Plot' ? inst.Plot_Shop_Number : inst.Plot_Shop_Number;
    const prop = await findOne('properties', {
      Property_Type: propType,
      Property_Number: String(propNum),
      Town_Name: getRowVal(inst, 'Town_Name'),
    });
    if (prop) {
      await updateWhere('properties', { id: prop.id }, {
        Received_Amount: newReceived,
        Remaining_Amount: newRemaining,
      });
    }

    // If fully paid → auto-create commission record
    if (newRemaining <= 0) {
      await createCommissionRecord(sale);
    }
  }

  return { success: true };
}

// ─── COMMISSION AUTO-CALCULATION ───────────────────────────────

async function createCommissionRecord(sale) {
  const agentName = sale.Agent_Name || '';
  const totalPrice = parseFloat(sale.Total_Amount_PKR) || 0;
  const commissionPercent = parseFloat(sale.Commission_Rate) || 0;
  const commissionAmount = parseFloat(sale.Commission_Amount) || (totalPrice * (commissionPercent / 100));

  const noAgent = !String(agentName || '').trim() || /^(no agent|none|n\/a|na|null|undefined|-|select agent)$/i.test(String(agentName || '').trim());
  if (commissionAmount <= 0 || noAgent) return;

  const saleId = sale.id || sale.Sale_ID || `${sale.Town_Name || ''}-${sale.Type || ''}-${sale.Plot_Shop_Number || ''}`;
  const stableId = `COM-${String(saleId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`;

  await insert('commissions', {
    id: stableId,
    agent_id: null,
    agent_name: agentName,
    sale_id: saleId,
    town_name: sale.Town_Name,
    property_number: String(sale.Plot_Shop_Number || ''),
    total_price: totalPrice,
    commission_percent: commissionPercent,
    commission_amount: commissionAmount,
    paid_amount: 0,
    remaining_amount: commissionAmount,
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  // Notify CEO
  await createNotification({
    Notification_ID: generateId(),
    Type: 'commission_due',
    Message: `Commission due: PKR ${commissionAmount.toLocaleString()} for ${agentName} — ${sale.Type} #${sale.Plot_Shop_Number}`,
    Plot_Shop_Number: String(sale.Plot_Shop_Number || ''),
    Town_Name: sale.Town_Name || '',
    Customer_Name: sale.Customer_Name || '',
    Due_Date: null,
    Created_Date: new Date().toISOString().split('T')[0],
    Status: 'Active',
    Dismissed: 'No',
  });
}

async function extendInstallmentDueDate(data) {
  const { Tracker_ID, New_Due_Date } = data;
  return await updateWhere('installments',
    { Tracker_ID },
    { Due_Date: New_Due_Date }
  );
}

async function getInstallmentProperties(townName) {
  const [sales, installments] = await Promise.all([
    getAllSales(),
    getAllInstallments(),
  ]);
  const targetTownLower = String(townName || '').trim().toLowerCase();
  const townSales = (sales || []).filter((sale) => {
    if (String(sale.Town_Name || '').trim().toLowerCase() !== targetTownLower) return false;
    const total = parseInt(sale.Total_Installments || sale.Total_Months, 10) || 0;
    const hasRows = (installments || []).some((inst) =>
      String(inst.Town_Name || '').trim().toLowerCase() === targetTownLower &&
      String(inst.Type || '') === String(sale.Type || '') &&
      String(inst.Plot_Shop_Number || '') === String(sale.Plot_Shop_Number || '')
    );
    return total > 0 || hasRows;
  });

  return townSales.map((sale) => {
    const rows = (installments || []).filter((inst) =>
      String(inst.Town_Name || '').trim().toLowerCase() === targetTownLower &&
      String(inst.Type || '') === String(sale.Type || '') &&
      String(inst.Plot_Shop_Number || '') === String(sale.Plot_Shop_Number || '')
    );
    const paidRows = rows.filter((row) => String(row.Status || '').toLowerCase() === 'paid');
    const advance = parseFloat(sale.Advance_Amount_PKR) || 0;
    const paidInstallments = paidRows.reduce((sum, row) => sum + (parseFloat(row.Monthly_Amount || row.Amount || row.Installment_Amount) || 0), 0);
    const totalPrice = parseFloat(sale.Total_Amount_PKR || sale.Deal_Amount_PKR) || 0;
    const totalInstallments = parseInt(sale.Total_Installments || sale.Total_Months || rows[0]?.Total_Months, 10) || rows.length || 0;
    return {
      id: `${sale.Type}|${sale.Plot_Shop_Number}|${sale.Town_Name}`,
      saleId: sale.Sale_ID || '',
      propertyType: sale.Type,
      propertyNumber: sale.Plot_Shop_Number,
      townName: sale.Town_Name,
      buyerName: sale.Customer_Name,
      totalPrice,
      totalPaid: advance + paidInstallments,
      remainingAmount: Math.max(0, totalPrice - advance - paidInstallments),
      totalInstallments,
      monthlyAmount: parseFloat(sale.Monthly_Installment || rows[0]?.Monthly_Amount) || 0,
      activeInstallments: rows.filter((row) => String(row.Status || '').toLowerCase() !== 'paid').length,
      paidInstallments: paidRows.length,
      advanceTaken: advance,
    };
  });
}

async function getPropertyInstallments(propertyId) {
  const parts = String(propertyId || '').split('|');
  const type = parts[0] || '';
  const number = parts[1] || '';
  const townName = parts.slice(2).join('|');
  if (!type || !number || !townName) return [];

  const rows = await getInstallmentsByProperty(type, number, townName);
  return (rows || [])
    .sort((a, b) => (parseInt(a.Month_Number || a.month_number, 10) || 0) - (parseInt(b.Month_Number || b.month_number, 10) || 0))
    .map((inst) => ({
      id: inst.Tracker_ID || inst.tracker_id || inst.id || '',
      installmentNumber: parseInt(inst.Month_Number || inst.month_number, 10) || 0,
      totalInstallments: parseInt(inst.Total_Months || inst.total_months, 10) || 0,
      dueDate: inst.Due_Date || inst.due_date || '',
      dueAmount: parseFloat(inst.Monthly_Amount || inst.monthly_amount || inst.Amount || inst.amount || inst.Installment_Amount || inst.installment_amount) || 0,
      isPaid: String(inst.Status || inst.status || '').toLowerCase() === 'paid',
      status: inst.Status || inst.status || '',
      receiptNumber: inst.Receipt_Number || inst.receipt_number || '',
    }));
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────

async function createNotification(notif) {
  return await insert('notifications', notif);
}

// ─── COMPLETE SELL PROPERTY FLOW ───────────────────────────────

async function sellProperty(data) {
  const { type, number, townName } = data;

  let property = await getProperty(type, number, townName);
  if (!property) {
    const total = parseFloat(data.Deal_Amount_PKR ?? data.Total_Amount_PKR) || 0;
    await insert('properties', {
      Property_Type: type,
      Property_Number: String(number),
      Town_Name: townName,
      Total_Price: total,
      Status: 'Available',
    }).catch(() => {});
    property = await getProperty(type, number, townName);
  }
  if (!property) throw new Error('Property not found in cloud');
  const st = String(property.Status || '').toLowerCase();
  if (st === 'sold' || st === 'resold') {
    throw new Error(`${type} ${number} is already ${property.Status}. Use CEO Resell / Deal Cancel.`);
  }
  if (st !== 'available' && st !== '') {
    throw new Error(`${type} ${number} is not available for sale`);
  }

  const totalAmount = parseFloat(data.Deal_Amount_PKR ?? data.Total_Amount_PKR) || 0;
  const expectedAmount = parseFloat(data.Expected_Amount_PKR) || totalAmount;
  const discountAmount = Math.max(0, expectedAmount - totalAmount);
  const advanceAmount = parseFloat(data.Advance_Amount_PKR) || 0;
  const useInstallment = !!data.useInstallment;
  if (totalAmount <= 0) throw new Error('Final deal amount must be greater than zero');
  if (advanceAmount < 0) throw new Error('Advance amount cannot be negative');
  if (advanceAmount > totalAmount) throw new Error('Advance amount cannot be greater than final deal amount');
  const totalInstallments = useInstallment ? (parseInt(data.Total_Installments) || 1) : 0;
  const totalPeriodMonths = useInstallment ? (parseInt(data.Total_Period_Months) || 1) : 0;
  const gapDays = useInstallment ? (parseInt(data.Gap_Days) || 30) : 0;
  const gapLabel = useInstallment ? (data.Gap_Label || 'Monthly') : '';
  const remaining = totalAmount - advanceAmount;
  const baseInstallment = (useInstallment && totalInstallments > 0) ? Math.floor(remaining / totalInstallments) : 0;
  const installmentRemainder = (useInstallment && totalInstallments > 0) ? Math.round(remaining - (baseInstallment * totalInstallments)) : 0;
  const monthlyInstallment = (useInstallment && totalInstallments > 0) ? baseInstallment + (installmentRemainder > 0 ? 1 : 0) : 0;
  const commissionRate = parseFloat(data.Commission_Rate) || 0;
  const commissionAmount = totalAmount * (commissionRate / 100);
  const expenseTotal = parseFloat(data.Expense_Total) || 0;
  const companyIncome = totalAmount - commissionAmount;
  const profitLoss = companyIncome - expenseTotal;

  const updates = {
    Owner_Name: data.Owner_Name || '',
    Customer_Name: data.Customer_Name || '',
    CNIC: data.CNIC || '',
    Phone_Number: data.Phone_Number || '',
    Sell_Date: data.Sell_Date || new Date().toISOString().split('T')[0],
    Expected_Amount_PKR: expectedAmount,
    Deal_Amount_PKR: totalAmount,
    Discount_Amount_PKR: discountAmount,
    Total_Amount_PKR: totalAmount,
    Advance_Amount_PKR: advanceAmount,
    Total_Installments: totalInstallments,
    Total_Period_Months: totalPeriodMonths,
    Gap_Days: gapDays,
    Gap_Label: gapLabel,
    Monthly_Installment: monthlyInstallment,
    Received_Amount: advanceAmount,
    Remaining_Amount: remaining,
    Agent_Name: data.Agent_Name || '',
    Commission_Rate: commissionRate,
    Commission_Amount: commissionAmount,
    Expense_Total: expenseTotal,
    Profit_Loss: profitLoss,
    Installment_Status: useInstallment && totalInstallments > 0 && remaining > 0 ? 'Active' : (remaining > 0 ? 'No Installment' : 'Completed'),
    Receipt_Number: data.Receipt_Number || '',
    File_Status: 'Not Delivered',
    Status: 'Sold',
  };

  await updateProperty(type, number, townName, updates);
  await createSale(data);

  if (useInstallment && totalInstallments > 0 && remaining > 0) {
    const startDate = new Date(updates.Sell_Date);
    const installments = [];
    for (let i = 1; i <= totalInstallments; i++) {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (gapDays * i));
      const installmentAmount = baseInstallment + (i <= installmentRemainder ? 1 : 0);
      installments.push({
        Tracker_ID: generateId(),
        Plot_Shop_Number: String(number),
        Type: type,
        Town_Name: townName,
        Customer_Name: data.Customer_Name,
        Phone_Number: data.Phone_Number,
        Monthly_Amount: installmentAmount,
        Due_Date: dueDate.toISOString().split('T')[0],
        Status: i === 1 ? 'Due' : 'Upcoming',
        Paid_Date: null,
        Month_Number: i,
        Total_Months: totalInstallments,
        Received_Amount: 0,
        Remaining_Amount: installmentAmount,
        Agent_Name: data.Agent_Name || '',
      });
    }
    await createInstallments(installments);
  }

  if (expenseTotal > 0) {
    await insert('expenses', {
      Expense_ID: generateId(),
      Town_Name: townName,
      Expense_Name: `Sale Expense - ${type} ${number}`,
      Amount_PKR: expenseTotal,
      Description: `Expense for ${type} ${number} sale`,
      Category: 'Sale',
      Date: updates.Sell_Date,
      Added_By: data.Agent_Name || 'System',
    });
  }

  await createNotification({
    Notification_ID: generateId(),
    Type: 'Sale',
    Message: `${type} ${number} sold to ${data.Customer_Name} in ${townName}`,
    Plot_Shop_Number: String(number),
    Town_Name: townName,
    Customer_Name: data.Customer_Name,
    Due_Date: null,
    Created_Date: new Date().toISOString().split('T')[0],
    Status: 'Active',
    Dismissed: 'No',
  });

  return updates;
}

async function cancelDeal(data) {
  const { type, number, townName, Receipt_Number } = data;
  const property = await getProperty(type, number, townName);
  if (!property) throw new Error('Property not found');
  if (String(property.Status || '').toLowerCase() !== 'sold') {
    throw new Error('Only Sold deals can be cancelled');
  }
  const propReceipt = String(property.Receipt_Number || '').trim();
  if (!propReceipt || propReceipt !== String(Receipt_Number).trim()) {
    throw new Error('Receipt number mismatch');
  }

  await deleteWhere('all_sales', {
    Type: type, Plot_Shop_Number: String(number), Town_Name: townName,
    Receipt_Number: String(Receipt_Number).trim(),
  });

  await deleteWhere('installments', {
    Type: type, Plot_Shop_Number: String(number), Town_Name: townName,
  });

  await updateProperty(type, number, townName, {
    Customer_Name: '', CNIC: '', Phone_Number: '', Sell_Date: null,
    Total_Amount_PKR: 0, Advance_Amount_PKR: 0,
    Total_Installments: 0, Total_Period_Months: 0, Gap_Days: 0, Gap_Label: '',
    Monthly_Installment: 0, Received_Amount: 0, Remaining_Amount: 0,
    Agent_Name: '', Commission_Rate: 0, Commission_Amount: 0,
    Expense_Total: 0, Profit_Loss: 0, Installment_Status: '',
    Receipt_Number: '', File_Status: '', Status: 'Available',
    Resell_Status: 'No', Resell_Amount: 0,
  });

  return { success: true };
}

async function updateFileStatus(params) {
  const { type, number, townName, status, deliveryImage } = params;
  const updates = { File_Status: status };
  if (deliveryImage) updates.File_Delivery_Image = deliveryImage;
  await updateProperty(type, number, townName, updates);

  await updateWhere('all_sales', {
    Type: type, Plot_Shop_Number: String(number), Town_Name: townName,
  }, updates);

  return { success: true };
}

async function resellProperty(data) {
  const { type, number, townName } = data;
  const property = await getProperty(type, number, townName);
  if (!property) throw new Error('Property not found');

  const totalAmount = parseFloat(data.Resell_Amount ?? data.Total_Amount_PKR) || 0;
  const useInstallment = !!data.useInstallment;
  const advanceAmount = useInstallment ? (parseFloat(data.Advance_Amount_PKR) || 0) : totalAmount;
  const remaining = totalAmount - advanceAmount;
  const totalInstallments = useInstallment ? (parseInt(data.Total_Installments) || 0) : 0;
  const gapDays = useInstallment ? (parseInt(data.Gap_Days) || 30) : 0;
  const baseInstallment = useInstallment && totalInstallments > 0 ? Math.floor(remaining / totalInstallments) : 0;
  const installmentRemainder = useInstallment && totalInstallments > 0 ? Math.round(remaining - (baseInstallment * totalInstallments)) : 0;
  const monthlyInstallment = useInstallment && totalInstallments > 0 ? (parseFloat(data.Monthly_Installment) || baseInstallment + (installmentRemainder > 0 ? 1 : 0)) : 0;
  const commissionRate = parseFloat(data.Commission_Rate ?? property.Commission_Rate) || 0;
  const commissionAmount = parseFloat(data.Commission_Amount ?? property.Commission_Amount) || 0;
  const refundAmount = parseFloat(data.Refund_Amount ?? data.Expense_Total) || 0;
  const sellDate = data.Sell_Date || new Date().toISOString().split('T')[0];
  const saleId = data.Sale_ID || generateId();

  await updateProperty(type, number, townName, {
    Customer_Name: data.Customer_Name || '',
    CNIC: data.CNIC || '',
    Phone_Number: data.Phone_Number || '',
    Sell_Date: sellDate,
    Total_Amount_PKR: totalAmount,
    Advance_Amount_PKR: advanceAmount,
    Total_Installments: totalInstallments,
    Total_Period_Months: parseInt(data.Total_Period_Months) || 0,
    Gap_Days: gapDays,
    Gap_Label: useInstallment ? (data.Gap_Label || 'Monthly') : '',
    Monthly_Installment: monthlyInstallment,
    Received_Amount: advanceAmount,
    Remaining_Amount: remaining,
    Agent_Name: data.Agent_Name || '',
    Commission_Rate: commissionRate,
    Commission_Amount: commissionAmount,
    Expense_Total: refundAmount,
    Profit_Loss: totalAmount - refundAmount,
    Receipt_Number: data.Receipt_Number || '',
    Status: 'Resold',
    Resell_Status: 'Yes',
    Resell_Amount: totalAmount,
  });

  await createSale({
    ...data,
    Sale_ID: saleId,
    Plot_Shop_Number: String(number),
    Type: type,
    Town_Name: townName,
    Sell_Date: sellDate,
    Total_Amount_PKR: totalAmount,
    Advance_Amount_PKR: advanceAmount,
    Total_Installments: totalInstallments,
    Total_Period_Months: useInstallment ? (parseInt(data.Total_Period_Months) || totalInstallments) : 0,
    Gap_Days: gapDays,
    Gap_Label: useInstallment ? (data.Gap_Label || 'Monthly') : '',
    Monthly_Installment: monthlyInstallment,
    Received_Amount: advanceAmount,
    Remaining_Amount: remaining,
    Agent_Name: data.Agent_Name || property.Agent_Name || '',
    Commission_Rate: commissionRate,
    Commission_Amount: commissionAmount,
    Company_Income: totalAmount,
    Expense_Total: refundAmount,
    Profit_Loss: totalAmount - refundAmount,
    File_Status: property.File_Status || '',
    Status: 'Resold',
  });

  if (totalInstallments > 0 && remaining > 0) {
    const startDate = new Date(data.Sell_Date || new Date());
    const installments = [];
    for (let i = 1; i <= totalInstallments; i++) {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (gapDays * i));
      let installmentAmount = parseFloat(data.Monthly_Installment) || (baseInstallment + (i <= installmentRemainder ? 1 : 0));
      // Adjust the last installment if custom Monthly_Installment is specified to prevent rounding mismatch
      if (parseFloat(data.Monthly_Installment) && i === totalInstallments) {
        const precedingTotal = parseFloat(data.Monthly_Installment) * (totalInstallments - 1);
        installmentAmount = Math.max(0, remaining - precedingTotal);
      }
      installments.push({
        Tracker_ID: generateId(),
        Sale_ID: saleId,
        Plot_Shop_Number: String(number),
        Type: type,
        Town_Name: townName,
        Customer_Name: data.Customer_Name,
        Phone_Number: data.Phone_Number,
        Monthly_Amount: installmentAmount,
        Due_Date: dueDate.toISOString().split('T')[0],
        Status: i === 1 ? 'Due' : 'Upcoming',
        Paid_Date: null,
        Month_Number: i,
        Total_Months: totalInstallments,
        Received_Amount: 0,
        Remaining_Amount: installmentAmount,
        Agent_Name: data.Agent_Name || '',
      });
    }
    await createInstallments(installments);
  }

  return { success: true };
}

// ─── DASHBOARD STATS ───────────────────────────────────────────

async function getDashboardStats() {
  const [summaries, allTowns, allSales] = await Promise.all([
    getAll('town_financial_summary').catch(() => []),
    getAll('towns'),
    getAllSales().catch(() => []),
  ]);

  const activeTownNames = new Set((allTowns || []).map((t) => String(t.Town_Name || t.town_name || '').trim().toLowerCase()));
  const activeSummaries = (summaries || []).filter((s) => activeTownNames.has(String(s.Town_Name || s.town_name || '').trim().toLowerCase()));
  const activeSales = (allSales || []).filter((s) => activeTownNames.has(String(s.Town_Name || s.town_name || '').trim().toLowerCase()));

  const totalReceived = activeSummaries.reduce((s, r) => s + (parseFloat(r.Total_Received || r.total_received) || 0), 0);
  const totalExpenses = activeSummaries.reduce((s, r) => s + (parseFloat(r.Total_Expenses || r.total_expenses) || 0), 0);
  const cashBalance = activeSummaries.reduce((s, r) => s + (parseFloat(r.Cash_Balance || r.cash_balance) || 0), 0);
  const totalPending = activeSales.reduce((s, r) => s + (parseFloat(r.Remaining_Amount) || 0), 0);
  const totalCommission = 0;
  const soldPlots = activeSales.filter(s => s.Type === 'Plot').length;
  const soldShops = activeSales.filter(s => s.Type === 'Shop').length;

  const townPerformance = allTowns.map(town => {
    const targetTownLower = String(town.Town_Name || '').trim().toLowerCase();
    const summary = summaries.find((s) => String(s.Town_Name || s.town_name || '').trim().toLowerCase() === targetTownLower);
    return {
      name: town.Town_Name,
      income: parseFloat(summary?.Total_Received || summary?.total_received) || 0,
      expenses: parseFloat(summary?.Total_Expenses || summary?.total_expenses) || 0,
      profit: parseFloat(summary?.Cash_Balance || summary?.cash_balance) || 0,
    };
  });

  return {
    totalIncome: totalReceived,
    totalPending,
    totalExpenses,
    totalCommission,
    cashBalance,
    netProfitLoss: cashBalance,
    soldPlots,
    soldShops,
    totalTowns: allTowns.length,
    townPerformance,
    monthlySales: allSales.slice(-12),
  };
}

// ─── APPEALS ───────────────────────────────────────────────────

async function getTownPerformance(townName) {
  const summary = await findOne('town_financial_summary', { Town_Name: townName }).catch(() => null);
  if (summary) {
    const [plots, shops] = await Promise.all([
      getPropertiesByTown(townName, 'Plot').catch(() => []),
      getPropertiesByTown(townName, 'Shop').catch(() => []),
    ]);
    const totalReceived = parseFloat(summary.Total_Received || summary.total_received) || 0;
    const totalExpenses = parseFloat(summary.Total_Expenses || summary.total_expenses) || 0;
    const cashBalance = parseFloat(summary.Cash_Balance || summary.cash_balance) || (totalReceived - totalExpenses);
    return {
      townName,
      actualIncome: totalReceived,
      totalReceived,
      totalExpenses,
      cashBalance,
      netProfit: cashBalance,
      pendingCollection: parseFloat(summary.Pending_Collection || summary.pending_collection) || 0,
      investorBalance: parseFloat(summary.Investor_Balance || summary.investor_balance) || 0,
      soldPlots: (plots || []).filter((p) => String(p.Status || p.status || '').toLowerCase() === 'sold').length,
      soldShops: (shops || []).filter((s) => String(s.Status || s.status || '').toLowerCase() === 'sold').length,
      totalPlots: (plots || []).length,
      totalShops: (shops || []).length,
    };
  }
  const [sales, expenses, ceoExpenses, ceoSalary, salaryRecords, investorTx, constructionPayments, commissionReceipts, plots, shops] = await Promise.all([
    findMany('all_sales', { Town_Name: townName }).catch(() => []),
    findMany('expenses', { Town_Name: townName }).catch(() => []),
    findMany('ceo_expenses', { Town_Name: townName }).catch(() => []),
    findMany('ceo_salary', { Town_Name: townName }).catch(() => []),
    findMany('salary_records', { Town_Name: townName }).catch(() => []),
    findMany('investor_transactions', { Town_Name: townName }).catch(() => []),
    findMany('construction_payments', { Town_Name: townName }).catch(() => []),
    findMany('commission_receipts', { Town_Name: townName }).catch(() => []),
    getPropertiesByTown(townName, 'Plot').catch(() => []),
    getPropertiesByTown(townName, 'Shop').catch(() => []),
  ]);

  const saleReceived = (sales || []).reduce((s, r) => s + (parseFloat(r.Received_Amount || r.received_amount || r.Advance_Amount_PKR) || 0), 0);
  const investorCredit = (investorTx || []).filter((t) => String(t.Type || t.type || '').toLowerCase() !== 'debit').reduce((s, t) => s + (parseFloat(t.Amount || t.amount) || 0), 0);
  const investorDebit = (investorTx || []).filter((t) => String(t.Type || t.type || '').toLowerCase() === 'debit').reduce((s, t) => s + (parseFloat(t.Amount || t.amount) || 0), 0);
  const dailyExpenses = (expenses || []).reduce((s, e) => s + (parseFloat(e.Amount_PKR || e.amount_pkr) || 0), 0);
  const ceoExpenseTotal = (ceoExpenses || []).reduce((s, e) => s + (parseFloat(e.Amount_PKR || e.amount_pkr) || 0), 0);
  const ceoSalaryTotal = (ceoSalary || []).reduce((s, e) => s + (parseFloat(e.Amount_PKR || e.amount_pkr) || 0), 0);
  const salaryTotal = (salaryRecords || []).reduce((s, e) => s + (parseFloat(e.Amount || e.amount) || 0), 0);
  const constructionTotal = (constructionPayments || []).reduce((s, e) => s + (parseFloat(e.Amount || e.amount) || 0), 0);
  const commissionTotal = (commissionReceipts || []).reduce((s, e) => s + (parseFloat(e.Amount || e.amount) || 0), 0);
  const totalReceived = saleReceived + investorCredit;
  const totalExpenses = dailyExpenses + ceoExpenseTotal + ceoSalaryTotal + salaryTotal + constructionTotal + commissionTotal + investorDebit;

  return {
    townName,
    actualIncome: totalReceived,
    totalReceived,
    totalExpenses,
    cashBalance: totalReceived - totalExpenses,
    netProfit: totalReceived - totalExpenses,
    soldPlots: (plots || []).filter((p) => String(p.Status || p.status || '').toLowerCase() === 'sold').length,
    soldShops: (shops || []).filter((s) => String(s.Status || s.status || '').toLowerCase() === 'sold').length,
    totalPlots: (plots || []).length,
    totalShops: (shops || []).length,
  };
}

async function getPendingAppeals(userId, appealType) {
  let query = supabase.from('appeals').select('*').eq('status', 'pending');
  const accountantTown = getAccountantTownFilter();
  if (accountantTown) {
    query = query.eq('town_name', accountantTown);
  }
  if (userId) query = query.eq('requested_by_user_id', userId);
  if (appealType) query = query.eq('appeal_type', appealType);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── PENDING SYNC ENGINE ──────────────────────────────────────────

async function nukeCloudData() {
  const TABLES = [
    'towns', 'properties', 'all_sales', 'installments', 'expenses', 'ceo_expenses', 'ceo_salary',
    'salary_records', 'resell_history', 'daily_entries', 'notifications', 'user_activity', 'receipt_log',
    'employees', 'employees_v2', 'advance_salaries', 'salary_payments', 'commissions',
    'investors', 'investor_transactions', 'construction_projects', 'construction_payments',
    'commission_receipts', 'collection_payments', 'receipt_archive', 'media_library',
    'cash_bank_accounts', 'money_ledger', 'town_financial_summary', 'town_map_shapes', 'daily_reports'
  ];
  
  // Try to use the admin client to bypass RLS, otherwise fallback to anon
  const client = getCloudClient();

  for (const table of TABLES) {
    try {
      // Deleting where id is not an empty string deletes all rows effectively.
      const { error } = await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error && error.code !== '42P01') {
        console.error(`Failed to truncate ${table} in cloud:`, error.message);
      }
    } catch (e) {
      console.error(`Error dropping rows from ${table}:`, e.message);
    }
  }

  // Also remove local pending sync data just in case
  try {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    const qPath = path.join(app.getPath('userData'), 'pending_sync_queue.json');
    if (fs.existsSync(qPath)) fs.unlinkSync(qPath);
  } catch (e) { }

  return { success: true };
}

// ─── PENDING COLLECTIONS ────────────────────────────────────────

async function recordCollectionPayment(saleId, amount, paymentMethod, notes, paymentOverride = null) {
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(saleId || ''));
  let sale = null;
  if (uuidLike) {
    const { data, error: findErr } = await supabase
      .from('all_sales')
      .select('*')
      .eq('id', saleId)
      .maybeSingle();
    if (!data && findErr) throw findErr;
    sale = data;
  }
  if (!sale) {
    const bySaleId = await supabase
      .from('all_sales')
      .select('*')
      .eq('sale_id', saleId)
      .maybeSingle();
    if (bySaleId.error) throw bySaleId.error;
    sale = bySaleId.data;
  }
  if (!sale) throw new Error('Sale not found');

  const currentReceived = parseFloat(getRowVal(sale, 'Received_Amount') || getRowVal(sale, 'Advance_Amount_PKR') || 0);
  const total = parseFloat(getRowVal(sale, 'Total_Amount_PKR') || 0);
  const newReceived = Math.min(currentReceived + parseFloat(amount), total);
  const newRemaining = Math.max(0, total - newReceived);

  const { error: updErr } = await supabase
    .from('all_sales')
    .update({ received_amount: newReceived, remaining_amount: newRemaining })
    .eq(sale.id ? 'id' : 'sale_id', sale.id || saleId);
  if (updErr) throw updErr;

  // Also update properties table for Sold Properties view
  const propType = getRowVal(sale, 'Type') === 'Plot' ? 'Plot' : 'Shop';
  const propNum = getRowVal(sale, 'Plot_Shop_Number');
  const { data: prop } = await supabase
    .from('properties')
    .select('id, received_amount, remaining_amount')
    .eq('property_type', propType)
    .eq('property_number', String(propNum))
    .eq('town_name', getRowVal(sale, 'Town_Name'))
    .maybeSingle();
  if (prop) {
    const oldReceived = parseFloat(prop.received_amount) || 0;
    const oldRemaining = parseFloat(prop.remaining_amount) || 0;
    if (Math.abs(oldReceived - newReceived) > 0.009 || Math.abs(oldRemaining - newRemaining) > 0.009) {
      await supabase.from('properties').update({
        received_amount: newReceived,
        remaining_amount: newRemaining,
      }).eq('id', prop.id);
    }
  }

  const localPaymentId = paymentOverride?.Payment_ID || paymentOverride?.payment_id || generateId();
  const paymentDate = paymentOverride?.Payment_Date || paymentOverride?.payment_date || new Date().toISOString().split('T')[0];
  const receiptNumber = paymentOverride?.Receipt_Number || paymentOverride?.receiptNumber ||
    `COL-${paymentDate.replace(/-/g, '')}-${String(localPaymentId).replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
  const paymentRecord = {
    payment_id: localPaymentId,
    sale_code: paymentOverride?.Sale_Code || paymentOverride?.Sale_ID || saleId || getRowVal(sale, 'Sale_ID') || '',
    sale_id: sale.id || (uuidLike ? saleId : null),
    property_type: getRowVal(sale, 'Type'),
    plot_shop_number: getRowVal(sale, 'Plot_Shop_Number'),
    town_name: getRowVal(sale, 'Town_Name'),
    customer_name: getRowVal(sale, 'Customer_Name'),
    agent_name: getRowVal(sale, 'Agent_Name'),
    amount: parseFloat(amount),
    remaining_before: Math.max(0, total - currentReceived),
    received_before: currentReceived,
    received_after: newReceived,
    remaining_after: newRemaining,
    payment_date: paymentDate,
    payment_method: paymentMethod || 'Cash',
    notes: notes || '',
    receipt_number: receiptNumber,
    payment_account_id: paymentOverride?.Payment_Account_ID || paymentOverride?.paymentAccountId || 'cash-in-hand',
    payment_account_name: paymentOverride?.Payment_Account_Name || paymentOverride?.paymentAccountName || 'Cash in Hand',
    payment_account_type: paymentOverride?.Payment_Account_Type || paymentOverride?.paymentAccountType || 'cash',
  };

  await insert('collection_payments', paymentRecord);
  await recordMoneyEvent({
    sourceType: 'collection_payment',
    sourceId: localPaymentId,
    direction: 'income',
    amount: parseFloat(amount),
    townName: getRowVal(sale, 'Town_Name'),
    date: paymentRecord.payment_date,
    partyName: getRowVal(sale, 'Customer_Name') || '',
    description: `${getRowVal(sale, 'Type') || 'Property'} ${getRowVal(sale, 'Plot_Shop_Number') || ''} collection received`,
    createdBy: getRowVal(sale, 'Agent_Name') || 'System',
    status: 'approved',
    receiptNumber,
    paymentAccountId: paymentRecord.payment_account_id,
    paymentAccountName: paymentRecord.payment_account_name,
    paymentAccountType: paymentRecord.payment_account_type,
  });

  // If fully paid → auto-create commission record
  if (newRemaining <= 0) {
    await createCommissionRecord(sale);
  }

  return { newReceived, newRemaining, receiptNumber };
}

async function getPendingCollections(agentName) {
  let query = supabase
    .from('all_sales')
    .select('*')
    .gt('remaining_amount', 0)
    .order('created_at', { ascending: false });

  if (agentName) {
    query = query.eq('agent_name', agentName);
  }

  const { data, error } = await query;
  if (error) throw error;
  return normalizeCloudRows('all_sales', data);
}

async function getCollectionHistory(saleId) {
  const { data, error } = await supabase
    .from('collection_payments')
    .select('*')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function deliverFileAfterPayment(saleId) {
  const { data: sale, error: findErr } = await supabase
    .from('all_sales')
    .select('*')
    .eq('id', saleId)
    .single();
  if (findErr) throw findErr;
  if (!sale) throw new Error('Sale not found');

  const remaining = parseFloat(sale.Remaining_Amount || 0);
  if (remaining > 0) {
    throw new Error('Cannot deliver file. Remaining payment of PKR ' + remaining.toLocaleString() + ' must be collected first.');
  }

  const { error: updErr } = await supabase
    .from('all_sales')
    .update({ File_Status: 'Delivered' })
    .eq('id', saleId);
  if (updErr) throw updErr;

  return { success: true };
}

// ─── COMMISSIONS ────────────────────────────────────────────────

async function getCommissions(filter) {
  let query = supabase.from('commissions').select('*, users(full_name, email)');
  const accountantTown = getAccountantTownFilter();
  if (accountantTown) {
    query = query.eq('town_name', accountantTown);
  }
  if (filter?.status) query = query.eq('status', filter.status);
  if (filter?.agent_id) query = query.eq('agent_id', filter.agent_id);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  const enriched = (data || []).map((c) => ({
    ...c,
    agent_name: c.agent_name || c.users?.full_name || c.users?.email || c.agent_id,
    agent_email: c.users?.email || '',
  }));
  return enriched;
}

async function markCommissionPaid(commissionId) {
  const stableId = `COM-${String(commissionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`;
  const { data, error } = await supabase
    .from('commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .or(`id.eq.${commissionId},id.eq.${stableId},sale_id.eq.${commissionId}`)
    .eq('status', 'pending')
    .select();
  if (error) throw error;
  return data?.[0] || { success: true };
}

module.exports = {
  nukeCloudData,
  getAll, insert, updateWhere, deleteWhere, deleteWhereCaseInsensitive, findOne, findMany, generateId,
  addDailyEntry, recordMoneyEvent,
  // Properties
  getProperty, getAllProperties, getSoldProperties, getPropertiesByTown, updateProperty,
  // Sales
  getAllSales, createSale,
  // Installments
  createInstallments, getAllInstallments, getInstallmentsByProperty,
  markInstallmentPaid, extendInstallmentDueDate,
  getInstallmentProperties, getPropertyInstallments,
  // Notifications
  createNotification,
  // Complete flows
  sellProperty, cancelDeal, updateFileStatus, resellProperty,
  // Stats
  getDashboardStats, getTownPerformance,
  // Appeals
  getPendingAppeals,
  // Commissions
  createCommissionRecord, getCommissions, markCommissionPaid,
  // Pending Collections
  recordCollectionPayment,
  getPendingCollections,
  getCollectionHistory,
  deliverFileAfterPayment,
};
