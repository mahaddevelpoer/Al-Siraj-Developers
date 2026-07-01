import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const defaultRoot = process.cwd();

function money(value) {
  const num = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function rawNumber(value) {
  return Number(String(value ?? '').replace(/,/g, ''));
}

function text(value) {
  return String(value ?? '').trim();
}

function isValidIsoDate(value) {
  const s = text(value);
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

async function readSheet(globalsDir, fileName) {
  const filePath = path.join(globalsDir, fileName);
  if (!fs.existsSync(filePath)) return [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Data') || workbook.worksheets[0];
  if (!sheet) return [];
  const headerRow = sheet.getRow(2);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = text(cell.value);
  });
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const item = { _rowNumber: rowNumber };
    headers.forEach((key, colNumber) => {
      if (!key) return;
      item[key] = row.getCell(colNumber).value;
    });
    rows.push(item);
  });
  return rows;
}

function addIssue(issues, severity, area, message, sample = {}) {
  issues.push({ severity, area, message, sample });
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function isPropertySale(row) {
  const type = text(row.Type || row.Property_Type).toLowerCase();
  return ['plot', 'shop', 'house'].includes(type) && Boolean(text(row.Plot_Shop_Number || row.Property_Number));
}

export async function runBusinessAudit(options = {}) {
  const root = options.rootPath || defaultRoot;
  const globalsDir = path.join(root, 'Global');
  const issues = [];
  const [
    ledger,
    summaries,
    sales,
    installments,
    salaryRows,
    commissions,
    cashBankAccounts,
    dailyEntries,
    expenses,
    collectionPayments,
    investorTransactions,
    constructionPayments,
    commissionReceipts,
    receiptArchive,
    mediaLibrary,
    pendingSync,
  ] = await Promise.all([
    readSheet(globalsDir, 'Money_Ledger.xlsx'),
    readSheet(globalsDir, 'Town_Financial_Summary.xlsx'),
    readSheet(globalsDir, 'All_Sales.xlsx'),
    readSheet(globalsDir, 'Installments_Tracker.xlsx'),
    readSheet(globalsDir, 'Salary_Records.xlsx'),
    readSheet(globalsDir, 'Commissions.xlsx'),
    readSheet(globalsDir, 'Cash_Bank_Accounts.xlsx'),
    readSheet(globalsDir, 'Daily_Entries.xlsx'),
    readSheet(globalsDir, 'All_Expenses.xlsx'),
    readSheet(globalsDir, 'Collection_Payments.xlsx'),
    readSheet(globalsDir, 'Investor_Transactions.xlsx'),
    readSheet(globalsDir, 'Construction_Payments.xlsx'),
    readSheet(globalsDir, 'Commission_Receipts.xlsx'),
    readSheet(globalsDir, 'Receipt_Archive.xlsx'),
    readSheet(globalsDir, 'Media_Library.xlsx'),
    readSheet(globalsDir, 'Pending_Sync.xlsx'),
  ]);

  const approvedLedger = ledger.filter((row) => text(row.Status || 'approved').toLowerCase() === 'approved');
  const receiptNumbers = new Set(receiptArchive.map((row) => text(row.Receipt_Number)).filter(Boolean));
  const ledgerSourceKeys = new Set(ledger.map((row) => [
    text(row.Source_Type).toLowerCase(),
    text(row.Source_ID),
    text(row.Direction).toLowerCase(),
  ].join('|')));
  const paymentAccountById = new Map([
    ['cash-in-hand', { Account_ID: 'cash-in-hand', Account_Name: 'Cash in Hand', Account_Type: 'cash', Status: 'active' }],
    ...cashBankAccounts.map((row) => [text(row.Account_ID), row]),
  ]);

  for (const row of ledger) {
    const amount = rawNumber(row.Amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addIssue(issues, 'error', 'money_ledger', 'Invalid ledger amount', row);
    }
    if (!text(row.Town_Name)) addIssue(issues, 'warning', 'money_ledger', 'Ledger row has no town', row);
    const paymentId = text(row.Payment_Account_ID) || 'cash-in-hand';
    const account = paymentAccountById.get(paymentId);
    if (!account) addIssue(issues, 'warning', 'money_ledger', 'Ledger row has invalid payment account', row);
    if (account && text(account.Status || 'active').toLowerCase() !== 'active') {
      addIssue(issues, 'warning', 'money_ledger', 'Ledger row uses inactive payment account', row);
    }
    if (!text(row.Payment_Account_ID)) {
      addIssue(issues, 'info', 'money_ledger', 'Ledger row has no payment account; it will be treated as Cash in Hand', row);
    }
    if (!['income', 'expense'].includes(text(row.Direction).toLowerCase())) {
      addIssue(issues, 'error', 'money_ledger', 'Ledger direction must be income or expense', row);
    }
    if (!isValidIsoDate(row.Date)) addIssue(issues, 'warning', 'money_ledger', 'Ledger row has missing/invalid date', row);
  }

  for (const [key, rows] of groupBy(ledger, (row) => [
    text(row.Source_Type).toLowerCase(),
    text(row.Source_ID),
    text(row.Direction).toLowerCase(),
  ].join('|'))) {
    if (key === '||') continue;
    if (rows.length > 1) addIssue(issues, 'error', 'money_ledger', `Duplicate ledger source key: ${key}`, rows.slice(0, 3));
  }

  const summaryByTown = new Map(summaries.map((row) => [text(row.Town_Name), row]));
  const towns = Array.from(new Set([
    ...ledger.map((row) => text(row.Town_Name)).filter(Boolean),
    ...sales.map((row) => text(row.Town_Name)).filter(Boolean),
  ]));

  for (const town of towns) {
    const townLedger = approvedLedger.filter((row) => text(row.Town_Name) === town);
    const received = townLedger.filter((row) => text(row.Direction).toLowerCase() === 'income').reduce((sum, row) => sum + money(row.Amount), 0);
    const expenses = townLedger.filter((row) => text(row.Direction).toLowerCase() === 'expense').reduce((sum, row) => sum + money(row.Amount), 0);
    const cash = received - expenses;
    const summary = summaryByTown.get(town);
    if (summary) {
      const diff = Math.abs(cash - money(summary.Cash_Balance));
      if (diff > 0.99) {
        addIssue(issues, 'warning', 'summary', `Cash balance summary mismatch for ${town}`, {
          town,
          ledgerCashBalance: cash,
          summaryCashBalance: money(summary.Cash_Balance),
        });
      }
    }
    const summaryReceived = money(summary?.Total_Received);
    const summaryExpenses = money(summary?.Total_Expenses);
    if (summary && Math.abs(received - summaryReceived) > 0.99) {
      addIssue(issues, 'warning', 'summary', `Total received summary mismatch for ${town}`, { town, ledgerReceived: received, summaryReceived });
    }
    if (summary && Math.abs(expenses - summaryExpenses) > 0.99) {
      addIssue(issues, 'warning', 'summary', `Total expenses summary mismatch for ${town}`, { town, ledgerExpenses: expenses, summaryExpenses });
    }
  }

  for (const sale of sales) {
    if (!isPropertySale(sale)) {
      addIssue(issues, 'info', 'sales', 'Non-property row exists in All_Sales; reports must ignore it for receivables', sale);
      continue;
    }
    const total = money(sale.Total_Amount_PKR || sale.Deal_Amount_PKR);
    const advance = money(sale.Advance_Amount_PKR);
    const saleInstallments = installments.filter((inst) =>
      text(inst.Type) === text(sale.Type) &&
      text(inst.Plot_Shop_Number) === text(sale.Plot_Shop_Number) &&
      text(inst.Town_Name) === text(sale.Town_Name)
    );
    const paidInstallments = saleInstallments
      .filter((inst) => text(inst.Status).toLowerCase() === 'paid')
      .reduce((sum, inst) => sum + money(inst.Monthly_Amount || inst.Received_Amount), 0);
    const expectedReceived = saleInstallments.length ? Math.min(total, advance + paidInstallments) : money(sale.Received_Amount || advance);
    const expectedRemaining = Math.max(0, total - expectedReceived);
    const actualReceived = money(sale.Received_Amount || advance);
    const actualRemaining = money(sale.Remaining_Amount);
    if (total > 0 && Math.abs(total - (actualReceived + actualRemaining)) > 1.01) {
      addIssue(issues, 'error', 'sales', 'Sale total must equal received plus remaining', {
        saleId: sale.Sale_ID,
        town: sale.Town_Name,
        property: `${sale.Type} ${sale.Plot_Shop_Number}`,
        total,
        actualReceived,
        actualRemaining,
        diff: total - (actualReceived + actualRemaining),
      });
    }
    if (Math.abs(expectedRemaining - money(sale.Remaining_Amount)) > 1.01) {
      addIssue(issues, 'warning', 'sales', 'Sale remaining does not match advance + paid installments', {
        saleId: sale.Sale_ID,
        town: sale.Town_Name,
        property: `${sale.Type} ${sale.Plot_Shop_Number}`,
        expectedRemaining,
        actualRemaining: money(sale.Remaining_Amount),
      });
    }
    const received = money(sale.Received_Amount || sale.Advance_Amount_PKR);
    if (received < -0.01) addIssue(issues, 'error', 'sales', 'Sale received is negative', sale);
    if (total > 0 && received - total > 1.01) addIssue(issues, 'error', 'sales', 'Sale received exceeds total amount', sale);
    if (money(sale.Remaining_Amount) < -0.01) addIssue(issues, 'error', 'sales', 'Sale remaining is negative', sale);
    if (advance > 0) {
      const key = ['sale_advance', text(sale.Sale_ID), 'income'].join('|');
      if (ledger.length && !ledgerSourceKeys.has(key)) {
        addIssue(issues, 'warning', 'sales', 'Sale advance is missing money ledger row', sale);
      }
    }
  }

  for (const payment of collectionPayments) {
    const key = ['collection_payment', text(payment.Payment_ID), 'income'].join('|');
    if (ledger.length && !ledgerSourceKeys.has(key)) {
      addIssue(issues, 'warning', 'collection_payments', 'Collection payment is missing money ledger row', payment);
    }
  }

  for (const inst of installments) {
    if (text(inst.Status).toLowerCase() !== 'paid') continue;
    const key = ['installment_payment', text(inst.Tracker_ID), 'income'].join('|');
    if (ledger.length && !ledgerSourceKeys.has(key)) {
      addIssue(issues, 'warning', 'installments', 'Paid installment is missing money ledger row', inst);
    }
    const receiptNumber = text(inst.Receipt_Number);
    if (!receiptNumber) {
      addIssue(issues, 'warning', 'installments', 'Paid installment is missing receipt number', inst);
    } else if (receiptArchive.length && !receiptNumbers.has(receiptNumber)) {
      addIssue(issues, 'warning', 'installments', 'Paid installment receipt is missing from Receipt_Archive', inst);
    }
  }

  for (const row of salaryRows) {
    if (money(row.Salary_Remaining_After) < 0) {
      addIssue(issues, 'error', 'salary', 'Salary remaining is negative', row);
    }
    if (!text(row.Payment_Account_ID)) {
      addIssue(issues, 'info', 'salary', 'Salary record has no payment account; legacy row will default to Cash in Hand', row);
    }
  }

  for (const row of commissions) {
    const expected = Math.max(0, money(row.Commission_Amount) - money(row.Paid_Amount));
    if (Math.abs(expected - money(row.Remaining_Amount)) > 0.99) {
      addIssue(issues, 'warning', 'commissions', 'Commission remaining mismatch', row);
    }
  }

  const financialFiles = [
    ['daily_entries', dailyEntries, 'Entry_ID', 'Amount'],
    ['expenses', expenses, 'Expense_ID', 'Amount_PKR'],
    ['collection_payments', collectionPayments, 'Payment_ID', 'Amount'],
    ['investor_transactions', investorTransactions, 'Transaction_ID', 'Amount'],
    ['construction_payments', constructionPayments, 'Payment_ID', 'Amount'],
    ['commission_receipts', commissionReceipts, 'Receipt_ID', 'Amount'],
  ];

  for (const [area, rows, idKey, amountKey] of financialFiles) {
    for (const row of rows) {
      const amount = rawNumber(row[amountKey]);
      if (!Number.isFinite(amount)) addIssue(issues, 'error', area, `Invalid amount in ${amountKey}`, row);
      if (amount < 0) addIssue(issues, 'error', area, `Negative amount in ${amountKey}`, row);
      const id = text(row[idKey]);
      if (!id) addIssue(issues, 'warning', area, `Missing stable id ${idKey}`, row);
    }
    for (const [key, group] of groupBy(rows, (row) => text(row[idKey]))) {
      if (key && group.length > 1) addIssue(issues, 'error', area, `Duplicate stable id ${key}`, group.slice(0, 3));
    }
  }

  for (const [area, rows] of [
    ['salary', salaryRows],
    ['investor_transactions', investorTransactions],
    ['construction_payments', constructionPayments],
    ['commission_receipts', commissionReceipts],
  ]) {
    for (const row of rows) {
      const receiptNumber = text(row.Receipt_Number);
      if (receiptNumber && receiptArchive.length && !receiptNumbers.has(receiptNumber)) {
        addIssue(issues, 'warning', area, 'Financial receipt is missing from Receipt_Archive', row);
      }
    }
  }

  for (const row of mediaLibrary) {
    const paths = [row.File_Path, row.Pdf_Path, row.Excel_Path, row.Html_Path].map(text).filter(Boolean);
    if (!paths.length) addIssue(issues, 'warning', 'media_library', 'Media row has no file path', row);
    for (const p of paths) {
      const absolute = path.isAbsolute(p) ? p : path.join(root, p);
      if (!fs.existsSync(absolute)) addIssue(issues, 'warning', 'media_library', 'Media file path does not exist locally', { ...row, checkedPath: absolute });
    }
  }

  const pendingRows = pendingSync.filter((row) => text(row.Status || 'pending').toLowerCase() === 'pending');
  for (const row of pendingRows) {
    if (!text(row.Client_Write_ID)) addIssue(issues, 'warning', 'pending_sync', 'Pending sync row missing Client_Write_ID', row);
    if (!text(row.Table_Name)) addIssue(issues, 'warning', 'pending_sync', 'Pending sync row missing Table_Name', row);
    if (!text(row.Payload_JSON)) addIssue(issues, 'warning', 'pending_sync', 'Pending sync row missing Payload_JSON', row);
    const retries = Number(row.Retry_Count || 0);
    if (Number.isFinite(retries) && retries >= 3) addIssue(issues, 'warning', 'pending_sync', 'Pending sync row has repeated failures', row);
  }
  for (const [key, group] of groupBy(pendingRows, (row) => text(row.Client_Write_ID))) {
    if (key && group.length > 1) addIssue(issues, 'warning', 'pending_sync', `Duplicate pending Client_Write_ID ${key}`, group.slice(0, 3));
  }

  for (const row of dailyEntries) {
    const review = text(row.Review_Status || 'approved').toLowerCase();
    const skipLedger = text(row.Skip_Ledger).toLowerCase() === 'yes';
    const amount = money(row.Amount);
    const moduleBacked = /investor|construction|commission/i.test(`${row.Category || ''} ${row.Income_Type || ''}`);
    if (!skipLedger && !moduleBacked && review !== 'pending' && review !== 'rejected' && amount > 0) {
      const direction = text(row.Type).toLowerCase() === 'expense' ? 'expense' : 'income';
      const key = ['daily_entry', text(row.Entry_ID), direction].join('|');
      if (ledger.length && !ledgerSourceKeys.has(key)) addIssue(issues, 'warning', 'daily_entries', 'Approved daily entry missing money ledger row', row);
    }
    if ((review === 'pending' || review === 'rejected') && amount > 0) {
      const direction = text(row.Type).toLowerCase() === 'expense' ? 'expense' : 'income';
      const key = ['daily_entry', text(row.Entry_ID), direction].join('|');
      if (ledgerSourceKeys.has(key)) addIssue(issues, 'error', 'approvals', 'Pending/rejected daily entry has ledger impact', row);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    filesChecked: {
      ledger: ledger.length,
      summaries: summaries.length,
      sales: sales.length,
      installments: installments.length,
      salaries: salaryRows.length,
      commissions: commissions.length,
      cashBankAccounts: cashBankAccounts.length,
      dailyEntries: dailyEntries.length,
      expenses: expenses.length,
      collectionPayments: collectionPayments.length,
      investorTransactions: investorTransactions.length,
      constructionPayments: constructionPayments.length,
      commissionReceipts: commissionReceipts.length,
      receiptArchive: receiptArchive.length,
      mediaLibrary: mediaLibrary.length,
      pendingSync: pendingSync.length,
    },
    pendingSyncCount: pendingRows.length,
    issueCount: issues.length,
    issues,
  };

  const outDir = options.outputDir || path.join(root, 'Reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `business-audit-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  return { success: true, outPath, issueCount: issues.length, filesChecked: report.filesChecked, pendingSyncCount: pendingRows.length, hasErrors: issues.some((issue) => issue.severity === 'error') };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runBusinessAudit().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.hasErrors) process.exitCode = 2;
  }).catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
