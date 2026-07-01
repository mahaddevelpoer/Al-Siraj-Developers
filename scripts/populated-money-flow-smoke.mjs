import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { runBusinessAudit } from './audit-business-data.mjs';

const today = new Date().toISOString().slice(0, 10);
const townName = 'SMOKE TEST TOWN';
const root = path.join(os.tmpdir(), `al-siraj-smoke-${Date.now()}`);
const globalsDir = path.join(root, 'Global');

function prettyHeader(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

async function writeSheet(fileName, keys, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  sheet.addRow(keys.map(prettyHeader));
  sheet.addRow(keys);
  sheet.getRow(2).hidden = true;
  for (const row of rows) sheet.addRow(keys.map((key) => row[key] ?? ''));
  await workbook.xlsx.writeFile(path.join(globalsDir, fileName));
}

function ledgerRow({
  id,
  sourceType,
  sourceId,
  direction,
  amount,
  party,
  description,
  receipt = '',
}) {
  return {
    Ledger_ID: id,
    Town_Name: townName,
    Date: today,
    Source_Type: sourceType,
    Source_ID: sourceId,
    Direction: direction,
    Amount: amount,
    Debit_Account: direction === 'expense' ? party : 'Cash in Hand',
    Credit_Account: direction === 'income' ? party : 'Cash in Hand',
    Payment_Account_ID: 'cash-in-hand',
    Payment_Account_Name: 'Cash in Hand',
    Payment_Account_Type: 'cash',
    Party_Name: party,
    Description: description,
    Receipt_Number: receipt,
    Status: 'approved',
    Created_By: 'smoke-test',
    Created_At: `${today}T09:00:00.000Z`,
  };
}

async function main() {
  fs.mkdirSync(globalsDir, { recursive: true });
  const reportFile = path.join(root, 'daily-report.pdf');
  fs.writeFileSync(reportFile, 'SMOKE TEST PDF PLACEHOLDER', 'utf8');

  const saleTotal = 20000;
  const advance = 1500;
  const installmentOne = 1542;
  const installmentTwo = 1542;
  const received = advance + installmentOne + installmentTwo;
  const remaining = saleTotal - received;
  const investorCredit = 50000;
  const investorDebit = 10000;
  const dailyIncome = 2000;
  const dailyExpense = 1000;
  const commissionPaid = 800;
  const constructionPaid = 20000;
  const salaryPaid = 500;
  const totalReceived = received + investorCredit + dailyIncome;
  const totalExpenses = dailyExpense + commissionPaid + investorDebit + constructionPaid + salaryPaid;
  const cashBalance = totalReceived - totalExpenses;

  await writeSheet(
    'Cash_Bank_Accounts.xlsx',
    ['Account_ID', 'Town_Name', 'Account_Name', 'Account_Type', 'Opening_Balance', 'Status', 'Created_At', 'Updated_At', 'Sync_Status'],
    [{
      Account_ID: 'cash-in-hand',
      Town_Name: townName,
      Account_Name: 'Cash in Hand',
      Account_Type: 'cash',
      Opening_Balance: 0,
      Status: 'active',
      Created_At: `${today}T08:00:00.000Z`,
      Updated_At: `${today}T08:00:00.000Z`,
      Sync_Status: 'synced',
    }],
  );

  await writeSheet(
    'All_Sales.xlsx',
    ['Sale_ID', 'Plot_Shop_Number', 'Type', 'Town_Name', 'Customer_Name', 'Sell_Date', 'Deal_Amount_PKR', 'Total_Amount_PKR', 'Advance_Amount_PKR', 'Received_Amount', 'Remaining_Amount', 'Receipt_Number', 'Status'],
    [{
      Sale_ID: 'SALE-SMOKE-001',
      Plot_Shop_Number: 'A-1',
      Type: 'Plot',
      Town_Name: townName,
      Customer_Name: 'Smoke Customer',
      Sell_Date: today,
      Deal_Amount_PKR: saleTotal,
      Total_Amount_PKR: saleTotal,
      Advance_Amount_PKR: advance,
      Received_Amount: received,
      Remaining_Amount: remaining,
      Receipt_Number: 'SALE-SMOKE-001',
      Status: 'Sold',
    }],
  );

  await writeSheet(
    'Installments_Tracker.xlsx',
    ['Tracker_ID', 'Plot_Shop_Number', 'Type', 'Town_Name', 'Customer_Name', 'Monthly_Amount', 'Due_Date', 'Status', 'Paid_Date', 'Month_Number', 'Total_Months', 'Received_Amount', 'Remaining_Amount', 'Receipt_Number'],
    [
      { Tracker_ID: 'INS-SMOKE-001', Plot_Shop_Number: 'A-1', Type: 'Plot', Town_Name: townName, Customer_Name: 'Smoke Customer', Monthly_Amount: installmentOne, Due_Date: today, Status: 'Paid', Paid_Date: today, Month_Number: 1, Total_Months: 12, Received_Amount: installmentOne, Remaining_Amount: saleTotal - advance - installmentOne, Receipt_Number: 'INS-SMOKE-001' },
      { Tracker_ID: 'INS-SMOKE-002', Plot_Shop_Number: 'A-1', Type: 'Plot', Town_Name: townName, Customer_Name: 'Smoke Customer', Monthly_Amount: installmentTwo, Due_Date: today, Status: 'Paid', Paid_Date: today, Month_Number: 2, Total_Months: 12, Received_Amount: installmentTwo, Remaining_Amount: remaining, Receipt_Number: 'INS-SMOKE-002' },
      { Tracker_ID: 'INS-SMOKE-003', Plot_Shop_Number: 'A-1', Type: 'Plot', Town_Name: townName, Customer_Name: 'Smoke Customer', Monthly_Amount: 1542, Due_Date: today, Status: 'Due', Paid_Date: '', Month_Number: 3, Total_Months: 12, Received_Amount: 0, Remaining_Amount: remaining, Receipt_Number: '' },
    ],
  );

  await writeSheet(
    'Daily_Entries.xlsx',
    ['Entry_ID', 'Town_Name', 'Date', 'Type', 'Category', 'Amount', 'Description', 'Review_Status'],
    [
      { Entry_ID: 'DE-IN-1', Town_Name: townName, Date: today, Type: 'income', Category: 'General Income', Amount: dailyIncome, Description: 'Approved daily income', Review_Status: 'approved' },
      { Entry_ID: 'DE-EX-1', Town_Name: townName, Date: today, Type: 'expense', Category: 'General Expense', Amount: dailyExpense, Description: 'Approved daily expense', Review_Status: 'approved' },
      { Entry_ID: 'DE-PENDING-1', Town_Name: townName, Date: today, Type: 'income', Category: 'Pending', Amount: 9999, Description: 'Must not affect ledger', Review_Status: 'pending' },
    ],
  );

  await writeSheet(
    'All_Expenses.xlsx',
    ['Expense_ID', 'Town_Name', 'Expense_Name', 'Amount_PKR', 'Description', 'Category', 'Date', 'Added_By'],
    [{ Expense_ID: 'EXP-SMOKE-1', Town_Name: townName, Expense_Name: 'Office expense', Amount_PKR: dailyExpense, Description: 'Approved daily expense', Category: 'General', Date: today, Added_By: 'smoke-test' }],
  );

  await writeSheet(
    'Salary_Records.xlsx',
    ['Receipt_Number', 'Date', 'Month', 'Type', 'Name', 'Amount', 'Town_Name', 'Salary_Amount', 'Salary_Paid_After', 'Salary_Remaining_After', 'Payment_Account_ID'],
    [{ Receipt_Number: 'SAL-SMOKE-001', Date: today, Month: 'June 2026', Type: 'Salary', Name: 'Smoke Employee', Amount: salaryPaid, Town_Name: townName, Salary_Amount: 2000, Salary_Paid_After: salaryPaid, Salary_Remaining_After: 1500, Payment_Account_ID: 'cash-in-hand' }],
  );

  await writeSheet(
    'Commissions.xlsx',
    ['Commission_ID', 'Sale_ID', 'Town_Name', 'Plot_Shop_Number', 'Agent_Name', 'Commission_Amount', 'Paid_Amount', 'Remaining_Amount', 'Status', 'Paid_Date'],
    [{ Commission_ID: 'COM-SMOKE-001', Sale_ID: 'SALE-SMOKE-001', Town_Name: townName, Plot_Shop_Number: 'A-1', Agent_Name: 'Smoke Agent', Commission_Amount: commissionPaid, Paid_Amount: commissionPaid, Remaining_Amount: 0, Status: 'Paid', Paid_Date: today }],
  );

  await writeSheet(
    'Investor_Transactions.xlsx',
    ['Transaction_ID', 'Investor_ID', 'Town_Name', 'Type', 'Amount', 'Balance_After', 'Date', 'Receipt_Number', 'Payment_Account_ID'],
    [
      { Transaction_ID: 'INV-CREDIT-1', Investor_ID: 'INV-SMOKE', Town_Name: townName, Type: 'credit', Amount: investorCredit, Balance_After: investorCredit, Date: today, Receipt_Number: 'INV-CREDIT-1', Payment_Account_ID: 'cash-in-hand' },
      { Transaction_ID: 'INV-DEBIT-1', Investor_ID: 'INV-SMOKE', Town_Name: townName, Type: 'debit', Amount: investorDebit, Balance_After: investorCredit - investorDebit, Date: today, Receipt_Number: 'INV-DEBIT-1', Payment_Account_ID: 'cash-in-hand' },
    ],
  );

  await writeSheet(
    'Construction_Payments.xlsx',
    ['Payment_ID', 'Project_ID', 'Town_Name', 'Amount', 'Payment_Date', 'Receipt_Number', 'Payment_Account_ID'],
    [{ Payment_ID: 'CON-PAY-1', Project_ID: 'CON-SMOKE', Town_Name: townName, Amount: constructionPaid, Payment_Date: today, Receipt_Number: 'CON-PAY-1', Payment_Account_ID: 'cash-in-hand' }],
  );

  await writeSheet(
    'Commission_Receipts.xlsx',
    ['Receipt_ID', 'Commission_ID', 'Town_Name', 'Amount', 'Date', 'Receipt_Number', 'Payment_Account_ID'],
    [{ Receipt_ID: 'COM-REC-1', Commission_ID: 'COM-SMOKE-001', Town_Name: townName, Amount: commissionPaid, Date: today, Receipt_Number: 'COM-REC-1', Payment_Account_ID: 'cash-in-hand' }],
  );

  const receiptRows = ['SAL-SMOKE-001', 'INV-CREDIT-1', 'INV-DEBIT-1', 'CON-PAY-1', 'COM-REC-1', 'SALE-SMOKE-001', 'INS-SMOKE-001', 'INS-SMOKE-002'].map((receipt) => ({
    Receipt_ID: receipt,
    Town_Name: townName,
    Type: 'Smoke Test',
    Receipt_Number: receipt,
    Date: today,
    Amount: receipt === 'SALE-SMOKE-001' ? received : 1,
  }));
  await writeSheet('Receipt_Archive.xlsx', ['Receipt_ID', 'Town_Name', 'Type', 'Receipt_Number', 'Date', 'Amount'], receiptRows);

  await writeSheet(
    'Media_Library.xlsx',
    ['Media_ID', 'Town_Name', 'Type', 'Title', 'File_Path', 'Pdf_Path', 'Report_Date', 'Created_At'],
    [{ Media_ID: 'MEDIA-SMOKE-1', Town_Name: townName, Type: 'daily_ledger_receipt', Title: 'Smoke report', File_Path: reportFile, Pdf_Path: reportFile, Report_Date: today, Created_At: `${today}T10:00:00.000Z` }],
  );

  await writeSheet('Pending_Sync.xlsx', ['Sync_ID', 'Operation', 'Table_Name', 'Client_Write_ID', 'Payload_JSON', 'Status', 'Retry_Count', 'Last_Error', 'Created_At', 'Updated_At'], []);

  await writeSheet(
    'Money_Ledger.xlsx',
    ['Ledger_ID', 'Town_Name', 'Date', 'Source_Type', 'Source_ID', 'Direction', 'Amount', 'Debit_Account', 'Credit_Account', 'Payment_Account_ID', 'Payment_Account_Name', 'Payment_Account_Type', 'Party_Name', 'Description', 'Receipt_Number', 'Status', 'Created_By', 'Created_At'],
    [
      ledgerRow({ id: 'L-SALE-ADV', sourceType: 'sale_advance', sourceId: 'SALE-SMOKE-001', direction: 'income', amount: advance, party: 'Smoke Customer', description: 'Sale advance', receipt: 'SALE-SMOKE-001' }),
      ledgerRow({ id: 'L-INS-1', sourceType: 'installment_payment', sourceId: 'INS-SMOKE-001', direction: 'income', amount: installmentOne, party: 'Smoke Customer', description: 'Installment 1', receipt: 'INS-SMOKE-001' }),
      ledgerRow({ id: 'L-INS-2', sourceType: 'installment_payment', sourceId: 'INS-SMOKE-002', direction: 'income', amount: installmentTwo, party: 'Smoke Customer', description: 'Installment 2', receipt: 'INS-SMOKE-002' }),
      ledgerRow({ id: 'L-DE-IN', sourceType: 'daily_entry', sourceId: 'DE-IN-1', direction: 'income', amount: dailyIncome, party: 'General Income', description: 'Daily income' }),
      ledgerRow({ id: 'L-DE-EX', sourceType: 'daily_entry', sourceId: 'DE-EX-1', direction: 'expense', amount: dailyExpense, party: 'General Expense', description: 'Daily expense' }),
      ledgerRow({ id: 'L-COM', sourceType: 'commission_paid', sourceId: 'COM-REC-1', direction: 'expense', amount: commissionPaid, party: 'Smoke Agent', description: 'Commission paid', receipt: 'COM-REC-1' }),
      ledgerRow({ id: 'L-INV-C', sourceType: 'investor_credit', sourceId: 'INV-CREDIT-1', direction: 'income', amount: investorCredit, party: 'Smoke Investor', description: 'Investor credit', receipt: 'INV-CREDIT-1' }),
      ledgerRow({ id: 'L-INV-D', sourceType: 'investor_debit', sourceId: 'INV-DEBIT-1', direction: 'expense', amount: investorDebit, party: 'Smoke Investor', description: 'Investor debit', receipt: 'INV-DEBIT-1' }),
      ledgerRow({ id: 'L-CON', sourceType: 'construction_payment', sourceId: 'CON-PAY-1', direction: 'expense', amount: constructionPaid, party: 'Smoke Constructor', description: 'Construction payment', receipt: 'CON-PAY-1' }),
      ledgerRow({ id: 'L-SAL', sourceType: 'salary_payment', sourceId: 'SAL-SMOKE-001', direction: 'expense', amount: salaryPaid, party: 'Smoke Employee', description: 'Salary payment', receipt: 'SAL-SMOKE-001' }),
    ],
  );

  await writeSheet(
    'Town_Financial_Summary.xlsx',
    ['Town_Name', 'Total_Received', 'Total_Expenses', 'Cash_Balance', 'Pending_Collection', 'Investor_Balance', 'Updated_At'],
    [{ Town_Name: townName, Total_Received: totalReceived, Total_Expenses: totalExpenses, Cash_Balance: cashBalance, Pending_Collection: remaining, Investor_Balance: investorCredit - investorDebit, Updated_At: `${today}T10:00:00.000Z` }],
  );

  const audit = await runBusinessAudit({ rootPath: root });
  const assertions = [
    ['saleReceived', received === 4584, received],
    ['saleRemaining', remaining === 15416, remaining],
    ['totalReceived', totalReceived === 56584, totalReceived],
    ['totalExpenses', totalExpenses === 32300, totalExpenses],
    ['cashBalance', cashBalance === 24284, cashBalance],
    ['auditIssues', audit.issueCount === 0, audit.issueCount],
  ];
  const failed = assertions.filter(([, ok]) => !ok);
  const result = {
    success: failed.length === 0,
    fixtureRoot: root,
    audit,
    expected: { saleTotal, advance, paidInstallments: installmentOne + installmentTwo, received, remaining, totalReceived, totalExpenses, cashBalance },
    failed: failed.map(([name, , actual]) => ({ name, actual })),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 2;
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
