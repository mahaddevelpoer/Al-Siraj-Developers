const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const {
  getGlobalsPath,
  readExcelFile,
  ensureDir,
} = (() => {
  const core = require('./core');
  return {
    ...core,
    ensureDir: (dirPath) => {
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    },
  };
})();

function money(value) {
  return parseFloat(value) || 0;
}

function clean(value) {
  return String(value ?? '').trim();
}

function sameTown(row, townName) {
  return clean(row.Town_Name || row.town_name) === clean(townName);
}

function isPropertySale(row) {
  const type = clean(row.Type || row.Property_Type).toLowerCase();
  if (!['plot', 'shop', 'house'].includes(type)) return false;
  return Boolean(clean(row.Plot_Shop_Number || row.Property_Number));
}

function rowDate(row, keys = ['Date', 'date', 'Created_At', 'created_at']) {
  for (const key of keys) {
    const value = row[key];
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return '';
}

function inRange(dateValue, fromDate, toDate) {
  if (!dateValue) return false;
  const d = clean(dateValue).slice(0, 10);
  return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
}

function groupBy(rows, keyFn, seedFn, eachFn) {
  const map = new Map();
  for (const row of rows) {
    const key = clean(keyFn(row)) || 'Unknown';
    if (!map.has(key)) map.set(key, seedFn(key));
    eachFn(map.get(key), row);
  }
  return Array.from(map.values());
}

async function safeRead(fileName) {
  try {
    return await readExcelFile(path.join(getGlobalsPath(), fileName), 'Data');
  } catch (_) {
    return [];
  }
}

async function buildTownLedgerReport({ townName, fromDate, toDate }) {
  const town = clean(townName);
  if (!town) throw new Error('Town name is required');
  const today = new Date().toISOString().slice(0, 10);
  const from = clean(fromDate) || today;
  const to = clean(toDate) || today;

  const [
    ledgerRows,
    salesRows,
    salaryRows,
    commissionRows,
    commissionReceiptRows,
    investorRows,
    investorTxRows,
    constructionRows,
    constructionPaymentRows,
    receiptArchiveRows,
  ] = await Promise.all([
    safeRead('Money_Ledger.xlsx'),
    safeRead('All_Sales.xlsx'),
    safeRead('Salary_Records.xlsx'),
    safeRead('Commissions.xlsx'),
    safeRead('Commission_Receipts.xlsx'),
    safeRead('Investors.xlsx'),
    safeRead('Investor_Transactions.xlsx'),
    safeRead('Construction_Projects.xlsx'),
    safeRead('Construction_Payments.xlsx'),
    safeRead('Receipt_Archive.xlsx'),
  ]);

  const ledger = ledgerRows
    .filter((row) => sameTown(row, town))
    .filter((row) => inRange(rowDate(row), from, to))
    .filter((row) => clean(row.Status || 'approved').toLowerCase() === 'approved')
    .map((row) => ({
      date: rowDate(row),
      sourceType: row.Source_Type || '',
      direction: clean(row.Direction || '').toLowerCase() === 'expense' ? 'expense' : 'income',
      amount: money(row.Amount),
      debitAccount: row.Debit_Account || row.debit_account || '',
      creditAccount: row.Credit_Account || row.credit_account || '',
      partyName: row.Party_Name || '',
      description: row.Description || '',
      receiptNumber: row.Receipt_Number || '',
    }));

  const totalReceived = ledger
    .filter((row) => row.direction === 'income')
    .reduce((sum, row) => sum + row.amount, 0);
  const totalPaid = ledger
    .filter((row) => row.direction === 'expense')
    .reduce((sum, row) => sum + row.amount, 0);

  const sales = salesRows.filter((row) => sameTown(row, town)).filter(isPropertySale);
  const salesInRange = sales.filter((row) => inRange(rowDate(row, ['Sell_Date', 'Date', 'Created_At']), from, to));
  const pendingReceivable = sales.reduce((sum, row) => sum + money(row.Remaining_Amount), 0);
  const customerLedgers = salesInRange.map((row) => ({
    property: `${row.Type || 'Property'} ${row.Plot_Shop_Number || ''}`.trim(),
    customer: row.Customer_Name || '',
    dealAmount: money(row.Deal_Amount_PKR || row.Total_Amount_PKR),
    received: money(row.Received_Amount || row.Advance_Amount_PKR),
    remaining: money(row.Remaining_Amount),
    receiptNumber: row.Receipt_Number || '',
    date: rowDate(row, ['Sell_Date', 'Date', 'Created_At']),
  }));

  const salaries = salaryRows
    .filter((row) => sameTown(row, town))
    .filter((row) => inRange(rowDate(row), from, to));
  const employeeLedgers = groupBy(
    salaries,
    (row) => row.Name,
    (name) => ({
      name,
      paid: 0,
      salaryApplied: 0,
      cashDisbursed: 0,
      salaryAmount: 0,
      advance: 0,
      advanceDeducted: 0,
      remaining: 0,
      payments: 0,
    }),
    (item, row) => {
      const salaryApplied = money(row.Salary_Paid_Amount || row.Amount);
      const cashDisbursed = money(row.Cash_Disbursed_Amount || row.Amount);
      item.paid += salaryApplied;
      item.salaryApplied += salaryApplied;
      item.cashDisbursed += cashDisbursed;
      item.salaryAmount = Math.max(item.salaryAmount, money(row.Salary_Amount));
      item.advance += money(row.New_Advance_Given || (clean(row.Is_Advance_Salary).toLowerCase() === 'yes' ? row.Amount : 0));
      item.advanceDeducted += money(row.Advance_Deduction);
      item.remaining = money(row.Salary_Remaining_After || item.remaining);
      item.payments += 1;
    },
  );
  const buildSalaryRollup = (rows, keyFn, labelKey = 'group') => groupBy(
    rows,
    keyFn,
    (label) => ({
      [labelKey]: label,
      people: new Set(),
      salaryByPerson: new Map(),
      salaryApplied: 0,
      cashDisbursed: 0,
      salaryAmount: 0,
      advance: 0,
      advanceDeducted: 0,
      remaining: 0,
      payments: 0,
    }),
    (item, row) => {
      const person = clean(row.Name);
      if (person) item.people.add(person);
      const salaryApplied = money(row.Salary_Paid_Amount || row.Amount);
      const cashDisbursed = money(row.Cash_Disbursed_Amount || row.Amount);
      item.salaryApplied += salaryApplied;
      item.cashDisbursed += cashDisbursed;
      const salary = money(row.Salary_Amount);
      if (person && salary > 0) item.salaryByPerson.set(person, Math.max(item.salaryByPerson.get(person) || 0, salary));
      else item.salaryAmount += salary;
      item.advance += money(row.New_Advance_Given || (clean(row.Is_Advance_Salary).toLowerCase() === 'yes' ? row.Amount : 0));
      item.advanceDeducted += money(row.Advance_Deduction);
      item.remaining += money(row.Salary_Remaining_After);
      item.payments += 1;
    },
  ).map((row) => {
    const { salaryByPerson, ...publicRow } = row;
    return {
      ...publicRow,
      people: row.people.size,
      salaryAmount: row.salaryAmount + Array.from(salaryByPerson.values()).reduce((sum, value) => sum + value, 0),
    };
  });
  const employeeGroupLedgers = buildSalaryRollup(
    salaries,
    (row) => row.Type || row.Designation || 'Employees',
  );
  const employeeOverall = employeeGroupLedgers.reduce((total, row) => ({
    group: 'All Employees',
    people: total.people + row.people,
    salaryApplied: total.salaryApplied + row.salaryApplied,
    cashDisbursed: total.cashDisbursed + row.cashDisbursed,
    salaryAmount: total.salaryAmount + row.salaryAmount,
    advance: total.advance + row.advance,
    advanceDeducted: total.advanceDeducted + row.advanceDeducted,
    remaining: total.remaining + row.remaining,
    payments: total.payments + row.payments,
  }), { group: 'All Employees', people: 0, salaryApplied: 0, cashDisbursed: 0, salaryAmount: 0, advance: 0, advanceDeducted: 0, remaining: 0, payments: 0 });

  const commissions = commissionRows.filter((row) => sameTown(row, town));
  const commissionReceipts = commissionReceiptRows
    .filter((row) => sameTown(row, town))
    .filter((row) => inRange(rowDate(row, ['Paid_Date', 'Date', 'Created_At']), from, to));
  const agentLedgers = groupBy(
    commissions,
    (row) => row.Agent_Name,
    (name) => ({ name, earned: 0, paid: 0, remaining: 0, receiptsInRange: 0 }),
    (item, row) => {
      item.earned += money(row.Commission_Amount);
      item.paid += money(row.Paid_Amount);
      item.remaining += money(row.Remaining_Amount || Math.max(0, money(row.Commission_Amount) - money(row.Paid_Amount)));
    },
  ).map((agent) => {
    const receipts = commissionReceipts.filter((row) => clean(row.Agent_Name) === agent.name);
    return {
      ...agent,
      paidInRange: receipts.reduce((sum, row) => sum + money(row.Amount), 0),
      receiptsInRange: receipts.length,
    };
  });
  const agentGroupLedgers = [{
    group: 'Sales Agents',
    agents: agentLedgers.filter((row) => clean(row.name) && row.name !== 'Unknown').length,
    earned: agentLedgers.reduce((sum, row) => sum + row.earned, 0),
    paid: agentLedgers.reduce((sum, row) => sum + row.paid, 0),
    paidInRange: agentLedgers.reduce((sum, row) => sum + row.paidInRange, 0),
    remaining: agentLedgers.reduce((sum, row) => sum + row.remaining, 0),
    receiptsInRange: agentLedgers.reduce((sum, row) => sum + row.receiptsInRange, 0),
  }];
  const agentOverall = { ...agentGroupLedgers[0], group: 'All Agents' };

  const investorTx = investorTxRows
    .filter((row) => sameTown(row, town))
    .filter((row) => inRange(rowDate(row), from, to));
  const investorLedgers = groupBy(
    investorTx,
    (row) => row.Investor_Name,
    (name) => ({ name, credit: 0, debit: 0, balance: 0, transactions: 0 }),
    (item, row) => {
      if (clean(row.Type).toLowerCase() === 'debit') item.debit += money(row.Amount);
      else item.credit += money(row.Amount);
      item.transactions += 1;
    },
  );
  for (const item of investorLedgers) {
    const investor = investorRows.find((row) => sameTown(row, town) && clean(row.Investor_Name) === item.name);
    item.balance = money(investor?.Balance);
  }

  const construction = constructionRows.filter((row) => sameTown(row, town));
  const constructionPayments = constructionPaymentRows
    .filter((row) => sameTown(row, town))
    .filter((row) => inRange(rowDate(row, ['Payment_Date', 'Date', 'Created_At']), from, to));
  const constructionLedgers = construction.map((row) => ({
    category: row.Category || '',
    constructor: row.Constructor_Name || '',
    dealAmount: money(row.Deal_Amount),
    paid: money(row.Paid_Amount),
    remaining: money(row.Remaining_Amount),
    status: row.Status || '',
  }));

  const payable = agentLedgers.reduce((sum, row) => sum + row.remaining, 0)
    + employeeLedgers.reduce((sum, row) => sum + Math.max(0, row.remaining), 0)
    + constructionLedgers.reduce((sum, row) => sum + row.remaining, 0);

  const accountLedgers = groupBy(
    ledger,
    (row) => `${row.debitAccount || 'Unknown'} -> ${row.creditAccount || 'Unknown'}`,
    (account) => ({ account, debit: account.split(' -> ')[0], credit: account.split(' -> ')[1], amount: 0, rows: 0 }),
    (item, row) => {
      item.amount += row.amount;
      item.rows += 1;
    },
  );

  const receiptArchive = receiptArchiveRows
    .filter((row) => sameTown(row, town))
    .filter((row) => inRange(rowDate(row, ['Receipt_Date', 'Date', 'Created_At']), from, to))
    .map((row) => ({
      receiptNumber: row.Receipt_Number || '',
      receiptType: row.Receipt_Type || '',
      townName: row.Town_Name || '',
      entityName: row.Entity_Name || '',
      amount: money(row.Amount),
      receiptDate: rowDate(row, ['Receipt_Date', 'Date', 'Created_At']),
      entityId: row.Entity_ID || '',
    }))
    .sort((a, b) => clean(b.receiptDate).localeCompare(clean(a.receiptDate)) || clean(a.receiptNumber).localeCompare(clean(b.receiptNumber)));

  return {
    townName: town,
    fromDate: from,
    toDate: to,
    generatedAt: new Date().toISOString(),
    summary: {
      totalReceived,
      totalPaid,
      cashBalance: totalReceived - totalPaid,
      receivable: pendingReceivable,
      payable,
      investorCredit: investorTx.reduce((sum, row) => sum + (clean(row.Type).toLowerCase() === 'debit' ? 0 : money(row.Amount)), 0),
      investorDebit: investorTx.reduce((sum, row) => sum + (clean(row.Type).toLowerCase() === 'debit' ? money(row.Amount) : 0), 0),
      constructionPaid: constructionPayments.reduce((sum, row) => sum + money(row.Amount), 0),
    },
    ledger,
    accountLedgers,
    customerLedgers,
    employeeLedgers,
    employeeGroupLedgers,
    employeeOverall,
    agentLedgers,
    agentGroupLedgers,
    agentOverall,
    investorLedgers,
    constructionLedgers,
    receiptArchive,
  };
}

function safeFilePart(value) {
  return clean(value).replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'report';
}

function pkr(value) {
  return `PKR ${Math.round(money(value)).toLocaleString()}`;
}

function htmlTable(headers, rows) {
  const cells = (row) => headers.map((h) => `<td>${escapeHtml(row[h.key] ?? '')}</td>`).join('');
  return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cells(r)}</tr>`).join('') || `<tr><td colspan="${headers.length}">No records</td></tr>`}</tbody></table>`;
}

function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

async function exportTownLedgerReport(params) {
  const report = await buildTownLedgerReport(params);
  const reportsDir = path.join(getGlobalsPath(), 'Reports', safeFilePart(report.townName));
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const base = `${safeFilePart(report.townName)}-${report.fromDate}-to-${report.toDate}`;
  const excelPath = path.join(reportsDir, `${base}.xlsx`);
  const htmlPath = path.join(reportsDir, `${base}.html`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AL SIRAJ DEVELOPERS';
  workbook.created = new Date();

  const addSheet = (name, rows) => {
    const sheet = workbook.addWorksheet(name);
    if (!rows.length) {
      sheet.addRow(['No records']);
      return;
    }
    const keys = Object.keys(rows[0]);
    sheet.addRow(keys);
    rows.forEach((row) => sheet.addRow(keys.map((key) => row[key])));
    sheet.getRow(1).font = { bold: true };
    keys.forEach((key, index) => {
      sheet.getColumn(index + 1).width = Math.max(14, Math.min(32, key.length + 8));
    });
  };

  addSheet('Summary', Object.entries(report.summary).map(([Metric, Value]) => ({
    Metric,
    Value: typeof Value === 'number' ? Value : String(Value),
  })));
  addSheet('Money Ledger', report.ledger);
  addSheet('Debit Credit', report.accountLedgers);
  addSheet('Customers', report.customerLedgers);
  addSheet('Employees', report.employeeLedgers);
  addSheet('Employee Groups', report.employeeGroupLedgers);
  addSheet('Employee Overall', [report.employeeOverall]);
  addSheet('Agents', report.agentLedgers);
  addSheet('Agent Groups', report.agentGroupLedgers);
  addSheet('Agent Overall', [report.agentOverall]);
  addSheet('Investors', report.investorLedgers);
  addSheet('Construction', report.constructionLedgers);
  addSheet('Receipts', report.receiptArchive);
  await workbook.xlsx.writeFile(excelPath);

  const summaryCards = [
    ['Total Received', report.summary.totalReceived],
    ['Total Paid', report.summary.totalPaid],
    ['Cash Balance', report.summary.cashBalance],
    ['Receivable', report.summary.receivable],
    ['Payable', report.summary.payable],
  ].map(([label, value]) => `<div class="card"><span>${label}</span><strong>${pkr(value)}</strong></div>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.townName)} Ledger Report</title><style>
body{font-family:Arial,sans-serif;color:#111827;margin:28px;background:#f8fafc}h1{margin:0 0 4px;font-size:24px}h2{margin-top:28px;font-size:17px}.meta{color:#64748b;margin-bottom:20px}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px}.card span{display:block;font-size:11px;color:#64748b;text-transform:uppercase}.card strong{font-size:17px}table{width:100%;border-collapse:collapse;background:#fff;margin-top:8px}th,td{border:1px solid #e5e7eb;padding:7px 8px;text-align:left;font-size:12px}th{background:#eef2ff} @media print{body{background:#fff;margin:12mm}.cards{grid-template-columns:repeat(3,1fr)}}
</style></head><body><h1>AL SIRAJ DEVELOPERS - Town Ledger Report</h1><div class="meta">${escapeHtml(report.townName)} | ${report.fromDate} to ${report.toDate} | Generated ${new Date(report.generatedAt).toLocaleString()}</div><div class="cards">${summaryCards}</div>
<h2>Money Ledger</h2>${htmlTable([{key:'date',label:'Date'},{key:'direction',label:'Side'},{key:'amount',label:'Amount'},{key:'debitAccount',label:'Debit'},{key:'creditAccount',label:'Credit'},{key:'partyName',label:'Party'},{key:'description',label:'Description'},{key:'receiptNumber',label:'Receipt'}], report.ledger.map((r)=>({...r,amount:pkr(r.amount)})))}
<h2>Debit / Credit Summary</h2>${htmlTable([{key:'debit',label:'Debit Account'},{key:'credit',label:'Credit Account'},{key:'amount',label:'Amount'},{key:'rows',label:'Rows'}], report.accountLedgers.map((r)=>({...r,amount:pkr(r.amount)})))}
<h2>Customer Receivables</h2>${htmlTable([{key:'date',label:'Date'},{key:'property',label:'Property'},{key:'customer',label:'Customer'},{key:'dealAmount',label:'Deal'},{key:'received',label:'Received'},{key:'remaining',label:'Remaining'}], report.customerLedgers.map((r)=>({...r,dealAmount:pkr(r.dealAmount),received:pkr(r.received),remaining:pkr(r.remaining)})))}
<h2>Employee Ledger</h2>${htmlTable([{key:'name',label:'Employee'},{key:'salaryAmount',label:'Salary'},{key:'salaryApplied',label:'Salary Applied'},{key:'cashDisbursed',label:'Cash Disbursed'},{key:'remaining',label:'Salary Remaining'},{key:'advance',label:'New Advance'},{key:'advanceDeducted',label:'Advance Deducted'}], report.employeeLedgers.map((r)=>({...r,salaryAmount:pkr(r.salaryAmount),salaryApplied:pkr(r.salaryApplied),cashDisbursed:pkr(r.cashDisbursed),remaining:pkr(r.remaining),advance:pkr(r.advance),advanceDeducted:pkr(r.advanceDeducted)})))}
<h2>Employee Group / Overall</h2>${htmlTable([{key:'group',label:'Group'},{key:'people',label:'People'},{key:'salaryApplied',label:'Salary Applied'},{key:'cashDisbursed',label:'Cash Disbursed'},{key:'remaining',label:'Remaining'},{key:'advance',label:'Advance'}], [...report.employeeGroupLedgers, report.employeeOverall].map((r)=>({...r,salaryApplied:pkr(r.salaryApplied),cashDisbursed:pkr(r.cashDisbursed),remaining:pkr(r.remaining),advance:pkr(r.advance)})))}
<h2>Agent Commission Ledger</h2>${htmlTable([{key:'name',label:'Agent'},{key:'earned',label:'Earned'},{key:'paid',label:'Paid Total'},{key:'paidInRange',label:'Paid In Range'},{key:'remaining',label:'Remaining'}], report.agentLedgers.map((r)=>({...r,earned:pkr(r.earned),paid:pkr(r.paid),paidInRange:pkr(r.paidInRange),remaining:pkr(r.remaining)})))}
<h2>Agent Group / Overall</h2>${htmlTable([{key:'group',label:'Group'},{key:'agents',label:'Agents'},{key:'earned',label:'Earned'},{key:'paid',label:'Paid'},{key:'paidInRange',label:'Paid In Range'},{key:'remaining',label:'Remaining'}], [...report.agentGroupLedgers, report.agentOverall].map((r)=>({...r,earned:pkr(r.earned),paid:pkr(r.paid),paidInRange:pkr(r.paidInRange),remaining:pkr(r.remaining)})))}
<h2>Investor Ledger</h2>${htmlTable([{key:'name',label:'Investor'},{key:'credit',label:'Credit'},{key:'debit',label:'Debit'},{key:'balance',label:'Balance'}], report.investorLedgers.map((r)=>({...r,credit:pkr(r.credit),debit:pkr(r.debit),balance:pkr(r.balance)})))}
<h2>Construction Ledger</h2>${htmlTable([{key:'category',label:'Category'},{key:'constructor',label:'Constructor'},{key:'dealAmount',label:'Deal'},{key:'paid',label:'Paid'},{key:'remaining',label:'Remaining'},{key:'status',label:'Status'}], report.constructionLedgers.map((r)=>({...r,dealAmount:pkr(r.dealAmount),paid:pkr(r.paid),remaining:pkr(r.remaining)})))}
<h2>Receipt Archive</h2>${htmlTable([{key:'receiptDate',label:'Date'},{key:'receiptNumber',label:'Receipt #'},{key:'receiptType',label:'Type'},{key:'entityName',label:'Party'},{key:'amount',label:'Amount'},{key:'entityId',label:'Source'}], report.receiptArchive.map((r)=>({...r,amount:pkr(r.amount)})))}
</body></html>`;
  fs.writeFileSync(htmlPath, html, 'utf8');

  return { success: true, report, excelPath, htmlPath };
}

async function buildDueInstallmentsReport({ townName = '', fromDate = '', toDate = '', leadDays = 7 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const lead = new Date();
  lead.setDate(lead.getDate() + (parseInt(leadDays, 10) || 7));
  const defaultTo = lead.toISOString().slice(0, 10);
  const from = clean(fromDate) || today;
  const to = clean(toDate) || defaultTo;
  const town = clean(townName);
  const rows = await safeRead('Installments_Tracker.xlsx');
  const dueRows = rows
    .filter((row) => !town || sameTown(row, town))
    .filter((row) => clean(row.Status || '').toLowerCase() !== 'paid')
    .filter((row) => inRange(rowDate(row, ['Due_Date', 'Installment_Date', 'Date']), from, to))
    .map((row) => {
      const dueDate = rowDate(row, ['Due_Date', 'Installment_Date', 'Date']);
      const status = dueDate && dueDate < today ? 'Overdue' : 'Due Soon';
      return {
        townName: row.Town_Name || '',
        property: `${row.Type || 'Property'} ${row.Plot_Shop_Number || row.Property_Number || ''}`.trim(),
        customer: row.Customer_Name || '',
        phone: row.Phone_Number || row.Phone || '',
        month: `${row.Month_Number || ''}/${row.Total_Months || row.Total_Months || ''}`.replace(/\/$/, ''),
        dueDate,
        amount: money(row.Monthly_Amount || row.Amount || row.Installment_Amount),
        status,
        trackerId: row.Tracker_ID || '',
      };
    })
    .sort((a, b) => clean(a.dueDate).localeCompare(clean(b.dueDate)) || clean(a.townName).localeCompare(clean(b.townName)));

  const byTown = groupBy(
    dueRows,
    (row) => row.townName,
    (name) => ({ townName: name, count: 0, amount: 0, overdue: 0, dueSoon: 0 }),
    (item, row) => {
      item.count += 1;
      item.amount += money(row.amount);
      if (row.status === 'Overdue') item.overdue += 1;
      else item.dueSoon += 1;
    },
  );

  return {
    townName: town || 'All Towns',
    fromDate: from,
    toDate: to,
    generatedAt: new Date().toISOString(),
    summary: {
      count: dueRows.length,
      amount: dueRows.reduce((sum, row) => sum + money(row.amount), 0),
      overdue: dueRows.filter((row) => row.status === 'Overdue').length,
      dueSoon: dueRows.filter((row) => row.status !== 'Overdue').length,
    },
    byTown,
    rows: dueRows,
  };
}

async function exportDueInstallmentsReport(params = {}) {
  const report = await buildDueInstallmentsReport(params);
  const reportsDir = path.join(getGlobalsPath(), 'Reports', 'Installments');
  ensureDir(reportsDir);
  const base = `due-installments-${safeFilePart(report.townName)}-${report.fromDate}-to-${report.toDate}`;
  const excelPath = path.join(reportsDir, `${base}.xlsx`);
  const htmlPath = path.join(reportsDir, `${base}.html`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AL SIRAJ DEVELOPERS';
  workbook.created = new Date();
  const addSheet = (name, rows) => {
    const sheet = workbook.addWorksheet(name);
    if (!rows.length) {
      sheet.addRow(['No records']);
      return;
    }
    const keys = Object.keys(rows[0]);
    sheet.addRow(keys);
    rows.forEach((row) => sheet.addRow(keys.map((key) => row[key])));
    sheet.getRow(1).font = { bold: true };
    keys.forEach((key, index) => {
      sheet.getColumn(index + 1).width = Math.max(14, Math.min(34, key.length + 8));
    });
  };
  addSheet('Due Installments', report.rows);
  addSheet('Town Summary', report.byTown);
  addSheet('Overall', [report.summary]);
  await workbook.xlsx.writeFile(excelPath);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Due Installments</title><style>
body{font-family:Arial,sans-serif;color:#111827;margin:28px;background:#f8fafc}h1{margin:0 0 4px;font-size:24px}.meta{color:#64748b;margin-bottom:18px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px}.card span{display:block;font-size:11px;color:#64748b;text-transform:uppercase}.card strong{font-size:18px}table{width:100%;border-collapse:collapse;background:#fff;margin-top:14px}th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:12px}th{background:#eef2ff}.bad{color:#dc2626;font-weight:bold}.soon{color:#b45309;font-weight:bold}@media print{body{background:#fff;margin:12mm}.cards{grid-template-columns:repeat(2,1fr)}}
</style></head><body><h1>AL SIRAJ DEVELOPERS - Due Installments Report</h1><div class="meta">${escapeHtml(report.townName)} | ${report.fromDate} to ${report.toDate} | Generated ${new Date(report.generatedAt).toLocaleString()}</div>
<div class="cards"><div class="card"><span>Total Due Rows</span><strong>${report.summary.count}</strong></div><div class="card"><span>Total Amount</span><strong>${pkr(report.summary.amount)}</strong></div><div class="card"><span>Overdue</span><strong>${report.summary.overdue}</strong></div><div class="card"><span>Due Soon</span><strong>${report.summary.dueSoon}</strong></div></div>
<h2>Town Summary</h2>${htmlTable([{key:'townName',label:'Town'},{key:'count',label:'Rows'},{key:'amount',label:'Amount'},{key:'overdue',label:'Overdue'},{key:'dueSoon',label:'Due Soon'}], report.byTown.map((r)=>({...r,amount:pkr(r.amount)})))}
<h2>Due Properties</h2>${htmlTable([{key:'townName',label:'Town'},{key:'property',label:'Property'},{key:'customer',label:'Customer'},{key:'phone',label:'Phone'},{key:'month',label:'Installment'},{key:'dueDate',label:'Due Date'},{key:'amount',label:'Amount'},{key:'status',label:'Status'}], report.rows.map((r)=>({...r,amount:pkr(r.amount),status:r.status})))}
</body></html>`;
  fs.writeFileSync(htmlPath, html, 'utf8');
  return { success: true, report, excelPath, htmlPath };
}

module.exports = {
  buildTownLedgerReport,
  exportTownLedgerReport,
  buildDueInstallmentsReport,
  exportDueInstallmentsReport,
};
