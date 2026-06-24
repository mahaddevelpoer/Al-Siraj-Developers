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

  const sales = salesRows.filter((row) => sameTown(row, town));
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
    (name) => ({ name, paid: 0, salaryAmount: 0, advance: 0, remaining: 0, payments: 0 }),
    (item, row) => {
      item.paid += money(row.Salary_Paid_Amount || row.Amount);
      item.salaryAmount = Math.max(item.salaryAmount, money(row.Salary_Amount));
      item.advance += clean(row.Is_Advance_Salary).toLowerCase() === 'yes' ? money(row.Amount) : 0;
      item.remaining = money(row.Salary_Remaining_After || item.remaining);
      item.payments += 1;
    },
  );

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
    customerLedgers,
    employeeLedgers,
    agentLedgers,
    investorLedgers,
    constructionLedgers,
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
  addSheet('Customers', report.customerLedgers);
  addSheet('Employees', report.employeeLedgers);
  addSheet('Agents', report.agentLedgers);
  addSheet('Investors', report.investorLedgers);
  addSheet('Construction', report.constructionLedgers);
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
<h2>Money Ledger</h2>${htmlTable([{key:'date',label:'Date'},{key:'direction',label:'Side'},{key:'amount',label:'Amount'},{key:'partyName',label:'Party'},{key:'description',label:'Description'},{key:'receiptNumber',label:'Receipt'}], report.ledger.map((r)=>({...r,amount:pkr(r.amount)})))}
<h2>Customer Receivables</h2>${htmlTable([{key:'date',label:'Date'},{key:'property',label:'Property'},{key:'customer',label:'Customer'},{key:'dealAmount',label:'Deal'},{key:'received',label:'Received'},{key:'remaining',label:'Remaining'}], report.customerLedgers.map((r)=>({...r,dealAmount:pkr(r.dealAmount),received:pkr(r.received),remaining:pkr(r.remaining)})))}
<h2>Employee Ledger</h2>${htmlTable([{key:'name',label:'Employee'},{key:'salaryAmount',label:'Salary'},{key:'paid',label:'Paid'},{key:'remaining',label:'Remaining'},{key:'advance',label:'Advance'}], report.employeeLedgers.map((r)=>({...r,salaryAmount:pkr(r.salaryAmount),paid:pkr(r.paid),remaining:pkr(r.remaining),advance:pkr(r.advance)})))}
<h2>Agent Commission Ledger</h2>${htmlTable([{key:'name',label:'Agent'},{key:'earned',label:'Earned'},{key:'paid',label:'Paid Total'},{key:'paidInRange',label:'Paid In Range'},{key:'remaining',label:'Remaining'}], report.agentLedgers.map((r)=>({...r,earned:pkr(r.earned),paid:pkr(r.paid),paidInRange:pkr(r.paidInRange),remaining:pkr(r.remaining)})))}
<h2>Investor Ledger</h2>${htmlTable([{key:'name',label:'Investor'},{key:'credit',label:'Credit'},{key:'debit',label:'Debit'},{key:'balance',label:'Balance'}], report.investorLedgers.map((r)=>({...r,credit:pkr(r.credit),debit:pkr(r.debit),balance:pkr(r.balance)})))}
<h2>Construction Ledger</h2>${htmlTable([{key:'category',label:'Category'},{key:'constructor',label:'Constructor'},{key:'dealAmount',label:'Deal'},{key:'paid',label:'Paid'},{key:'remaining',label:'Remaining'},{key:'status',label:'Status'}], report.constructionLedgers.map((r)=>({...r,dealAmount:pkr(r.dealAmount),paid:pkr(r.paid),remaining:pkr(r.remaining)})))}
</body></html>`;
  fs.writeFileSync(htmlPath, html, 'utf8');

  return { success: true, report, excelPath, htmlPath };
}

module.exports = {
  buildTownLedgerReport,
  exportTownLedgerReport,
};
