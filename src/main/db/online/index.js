const supabase = require('../supabase');
const crypto = require('crypto');
const { toCloudRow, toCloudMatch, getRowVal } = require('../syncHelpers');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function uuid() {
  return crypto.randomUUID();
}

// ─── GENERIC ───────────────────────────────────────────────────

async function getAll(table) {
  let { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error && String(error.message || '').includes('created_at')) {
    ({ data, error } = await supabase.from(table).select('*'));
  }
  if (error) throw error;
  return data || [];
}

async function insert(table, row) {
  const { data, error } = await supabase.from(table).insert([toCloudRow(table, row)]).select();
  if (error) throw error;
  return data?.[0] || row;
}

async function updateWhere(table, match, updates) {
  let query = supabase.from(table).update(toCloudRow(table, updates)).select();
  for (const [key, val] of Object.entries(toCloudMatch(table, match))) {
    query = query.eq(key, val);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function deleteWhere(table, match) {
  let query = supabase.from(table).delete();
  for (const [key, val] of Object.entries(toCloudMatch(table, match))) {
    query = query.eq(key, val);
  }
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

async function findOne(table, match) {
  let query = supabase.from(table).select('*');
  for (const [key, val] of Object.entries(toCloudMatch(table, match))) {
    query = query.eq(key, val);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

function buildSelectQuery(table, match) {
  let query = supabase.from(table).select('*');
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
  return data || [];
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
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .in('status', ['Sold', 'Resold', 'sold', 'resold']);
  if (error) throw error;
  const all = data || [];
  return {
    plots: all.filter(p => getRowVal(p, 'Property_Type') === 'Plot'),
    shops: all.filter(p => getRowVal(p, 'Property_Type') === 'Shop'),
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
  return data?.[0];
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
    Total_Amount_PKR: parseFloat(data.Total_Amount_PKR) || 0,
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
    Remaining_Amount: parseFloat(data.Remaining_Amount) || Math.max(0, (parseFloat(data.Total_Amount_PKR) || 0) - (parseFloat(data.Advance_Amount_PKR) || 0)),
    File_Status: data.File_Status || 'Not Delivered',
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
  return data || [];
}

async function getAllInstallments() {
  return await getAll('installments');
}

async function getInstallmentsByProperty(type, number, townName) {
  return await findMany('installments', {
    Type: type, Plot_Shop_Number: String(number), Town_Name: townName,
  });
}

async function markInstallmentPaid(data) {
  const { Tracker_ID, Paid_Date } = data;

  // Get the installment record first
  const inst = await findOne('installments', { Tracker_ID });
  if (!inst) throw new Error('Installment not found');

  const paidAmount = parseFloat(inst.Monthly_Amount) || 0;

  // Mark installment as paid
  await updateWhere('installments',
    { Tracker_ID },
    { Status: 'paid', Paid_Date: Paid_Date || new Date().toISOString().split('T')[0], Received_Amount: paidAmount, Remaining_Amount: 0 }
  );

  // Find the sale and update received_amount
  const sale = await findOne('all_sales', {
    Type: inst.Type,
    Plot_Shop_Number: String(inst.Plot_Shop_Number),
    Town_Name: inst.Town_Name,
  });

  if (sale) {
    const currentReceived = parseFloat(sale.Received_Amount) || 0;
    const totalPrice = parseFloat(sale.Total_Amount_PKR) || 0;
    const newReceived = Math.min(currentReceived + paidAmount, totalPrice);
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

  if (commissionAmount <= 0 || !agentName) return;

  // Find agent by name
  const { data: agents, error: agentErr } = await supabase
    .from('users')
    .select('id')
    .eq('full_name', agentName)
    .eq('role', 'agent')
    .limit(1);

  if (agentErr || !agents || agents.length === 0) return;

  const agentId = agents[0].id;

  await insert('commissions', {
    id: uuid(),
    agent_id: agentId,
    sale_id: sale.id || sale.Sale_ID || null,
    town_name: sale.Town_Name,
    property_number: String(sale.Plot_Shop_Number || ''),
    total_price: totalPrice,
    commission_percent: commissionPercent,
    commission_amount: commissionAmount,
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
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('town_name', townName)
    .in('installment_status', ['Active', 'active']);
  if (error) throw error;
  return data || [];
}

async function getPropertyInstallments(propertyId) {
  const [type, number, townName] = propertyId.split('|');
  return await getInstallmentsByProperty(type, number, townName);
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────

async function createNotification(notif) {
  return await insert('notifications', notif);
}

// ─── COMPLETE SELL PROPERTY FLOW ───────────────────────────────

async function sellProperty(data) {
  const { type, number, townName } = data;

  const property = await getProperty(type, number, townName);
  if (!property) throw new Error('Property not found');
  const st = String(property.Status || '').toLowerCase();
  if (st === 'sold' || st === 'resold') {
    throw new Error(`${type} ${number} is already ${property.Status}. Use CEO Resell / Deal Cancel.`);
  }
  if (st !== 'available' && st !== '') {
    throw new Error(`${type} ${number} is not available for sale`);
  }

  const totalAmount = parseFloat(data.Total_Amount_PKR) || 0;
  const advanceAmount = parseFloat(data.Advance_Amount_PKR) || 0;
  const useInstallment = !!data.useInstallment;
  const totalInstallments = useInstallment ? (parseInt(data.Total_Installments) || 1) : 0;
  const totalPeriodMonths = useInstallment ? (parseInt(data.Total_Period_Months) || 1) : 0;
  const gapDays = useInstallment ? (parseInt(data.Gap_Days) || 30) : 0;
  const gapLabel = useInstallment ? (data.Gap_Label || 'Monthly') : '';
  const remaining = totalAmount - advanceAmount;
  const monthlyInstallment = (useInstallment && totalInstallments > 0) ? Math.ceil(remaining / totalInstallments) : 0;
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
      installments.push({
        Tracker_ID: generateId(),
        Plot_Shop_Number: String(number),
        Type: type,
        Town_Name: townName,
        Customer_Name: data.Customer_Name,
        Phone_Number: data.Phone_Number,
        Monthly_Amount: monthlyInstallment,
        Due_Date: dueDate.toISOString().split('T')[0],
        Status: i === 1 ? 'Due' : 'Upcoming',
        Paid_Date: null,
        Month_Number: i,
        Total_Months: totalInstallments,
        Received_Amount: 0,
        Remaining_Amount: monthlyInstallment,
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
  const monthlyInstallment = useInstallment && totalInstallments > 0 ? (parseFloat(data.Monthly_Installment) || Math.ceil(remaining / totalInstallments)) : 0;
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
      installments.push({
        Tracker_ID: generateId(),
        Sale_ID: saleId,
        Plot_Shop_Number: String(number),
        Type: type,
        Town_Name: townName,
        Customer_Name: data.Customer_Name,
        Phone_Number: data.Phone_Number,
        Monthly_Amount: monthlyInstallment,
        Due_Date: dueDate.toISOString().split('T')[0],
        Status: i === 1 ? 'Due' : 'Upcoming',
        Paid_Date: null,
        Month_Number: i,
        Total_Months: totalInstallments,
        Received_Amount: 0,
        Remaining_Amount: monthlyInstallment,
        Agent_Name: data.Agent_Name || '',
      });
    }
    await createInstallments(installments);
  }

  return { success: true };
}

// ─── DASHBOARD STATS ───────────────────────────────────────────

async function getDashboardStats() {
  const [allSales, allExpenses, allTowns] = await Promise.all([
    getAllSales(),
    getAll('expenses'),
    getAll('towns'),
  ]);

  // INCOME RULE: Only received_amount counts as income
  // Never use total_price until fully received
  const totalReceived = allSales.reduce((s, r) => s + (parseFloat(r.Received_Amount) || 0), 0);
  const totalPending = allSales.reduce((s, r) => s + (parseFloat(r.Remaining_Amount) || 0), 0);

  // Commission: sum of all commission amounts from sales
  const totalCommission = allSales.reduce((s, r) => s + (parseFloat(r.Commission_Amount) || 0), 0);
  const totalExpenses = allExpenses.reduce((s, e) => s + (parseFloat(e.Amount_PKR) || 0), 0);
  const netProfitLoss = totalReceived - totalCommission - totalExpenses;
  const soldPlots = allSales.filter(s => s.Type === 'Plot').length;
  const soldShops = allSales.filter(s => s.Type === 'Shop').length;

  const townPerformance = allTowns.map(town => {
    const townSales = allSales.filter(s => s.Town_Name === town.Town_Name);
    const income = townSales.reduce((s, r) => s + (parseFloat(r.Received_Amount) || 0), 0);
    const expenses = allExpenses
      .filter(e => e.Town_Name === town.Town_Name)
      .reduce((s, e) => s + (parseFloat(e.Amount_PKR) || 0), 0);
    return { name: town.Town_Name, income, expenses };
  });

  return {
    totalIncome: totalReceived,
    totalPending,
    totalExpenses,
    totalCommission,
    netProfitLoss,
    soldPlots,
    soldShops,
    totalTowns: allTowns.length,
    townPerformance,
    monthlySales: allSales.slice(-12),
  };
}

// ─── APPEALS ───────────────────────────────────────────────────

async function getPendingAppeals(userId, appealType) {
  let query = supabase.from('appeals').select('*').eq('status', 'pending');
  if (userId) query = query.eq('requested_by_user_id', userId);
  if (appealType) query = query.eq('appeal_type', appealType);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── PENDING COLLECTIONS ────────────────────────────────────────

async function recordCollectionPayment(saleId, amount, paymentMethod, notes) {
  const { data: sale, error: findErr } = await supabase
    .from('all_sales')
    .select('*')
    .eq('id', saleId)
    .single();
  if (findErr) throw findErr;
  if (!sale) throw new Error('Sale not found');

  const currentReceived = parseFloat(sale.Received_Amount || sale.Advance_Amount_PKR || 0);
  const total = parseFloat(sale.Total_Amount_PKR || 0);
  const newReceived = Math.min(currentReceived + parseFloat(amount), total);
  const newRemaining = Math.max(0, total - newReceived);

  const { error: updErr } = await supabase
    .from('all_sales')
    .update({ received_amount: newReceived, remaining_amount: newRemaining })
    .eq('id', saleId);
  if (updErr) throw updErr;

  // Also update properties table for Sold Properties view
  const propType = getRowVal(sale, 'Type') === 'Plot' ? 'Plot' : 'Shop';
  const propNum = getRowVal(sale, 'Plot_Shop_Number');
  const { data: prop } = await supabase
    .from('properties')
    .select('id')
    .eq('property_type', propType)
    .eq('property_number', String(propNum))
    .eq('town_name', getRowVal(sale, 'Town_Name'))
    .maybeSingle();
  if (prop) {
    await supabase.from('properties').update({
      received_amount: newReceived,
      remaining_amount: newRemaining,
    }).eq('id', prop.id);
  }

  const paymentRecord = {
    sale_id: saleId,
    property_type: getRowVal(sale, 'Type'),
    plot_shop_number: getRowVal(sale, 'Plot_Shop_Number'),
    town_name: getRowVal(sale, 'Town_Name'),
    customer_name: getRowVal(sale, 'Customer_Name'),
    agent_name: getRowVal(sale, 'Agent_Name'),
    amount: parseFloat(amount),
    remaining_before: currentReceived,
    remaining_after: newReceived,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: paymentMethod || 'Cash',
    notes: notes || '',
  };

  const { error: insErr } = await supabase
    .from('collection_payments')
    .insert(paymentRecord);
  if (insErr) throw insErr;

  // If fully paid → auto-create commission record
  if (newRemaining <= 0) {
    await createCommissionRecord(sale);
  }

  return { newReceived, newRemaining };
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
  return data || [];
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
  if (filter?.status) query = query.eq('status', filter.status);
  if (filter?.agent_id) query = query.eq('agent_id', filter.agent_id);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  const enriched = (data || []).map((c) => ({
    ...c,
    agent_name: c.users?.full_name || c.users?.email || c.agent_id,
    agent_email: c.users?.email || '',
  }));
  return enriched;
}

async function markCommissionPaid(commissionId) {
  const { data, error } = await supabase
    .from('commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', commissionId)
    .eq('status', 'pending')
    .select();
  if (error) throw error;
  return data?.[0] || { success: true };
}

module.exports = {
  getAll, insert, updateWhere, deleteWhere, findOne, findMany, generateId,
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
  getDashboardStats,
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
