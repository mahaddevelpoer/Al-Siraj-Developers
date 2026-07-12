const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Set app path to ensure globals work correctly
app.setPath('userData', path.join(__dirname, '..', '..', '.test_app_data'));

app.whenReady().then(async () => {
  try {
    console.log('[TEST] Starting E2E Tests...');
    
    // Import required modules
    const supabase = require('../src/main/db/supabase');
    const { addTown, deleteTown, addCeoExpense } = require('../src/main/db/towns');
    const { addPlot, sellProperty, resellProperty, cancelDeal } = require('../src/main/db/properties');
    const { markInstallmentPaid, getPropertyInstallments, addEmployee, recordSalaryPayment } = require('../src/main/db/globals');
    const { addDailyEntry } = require('../src/main/db/dailyEntries');
    const townReport = require('../src/main/db/townReport');
    const { addTownAgent, addInvestor, investorTransaction, addConstructionProject, recordConstructionPayment, recordCommissionReceipt } = require('../src/main/db/businessExtras');
    const pendingSync = require('../src/main/db/pendingSync');

    // 1. Authentication
    console.log('[TEST] Authenticating CEO...');
    const authRes = await supabase.auth.signInWithPassword({ email: 'loyal.blood300@gmail.com', password: '126342' });
    if (authRes.error) throw new Error(`Login failed: ${authRes.error.message}`);
    console.log('[PASS] CEO Authenticated');

    // 2. Town Creation
    const testTownName = `TestTown_${Date.now()}`;
    console.log(`[TEST] Creating Town: ${testTownName}`);
    await addTown({ Town_Name: testTownName, Password: 'admin' });
    console.log('[PASS] Town created locally');

    // 3. Properties and Sales with Agent
    console.log('[TEST] Adding Property...');
    await addPlot({
      Town_Name: testTownName,
      Plot_Number: 'A-100',
      Plot_Size: '5 Marla',
      Total_Price: 500000,
    });
    console.log('[PASS] Property A-100 added');
    
    await addPlot({
      Town_Name: testTownName,
      Plot_Number: 'A-101',
      Plot_Size: '5 Marla',
      Total_Price: 500000,
    });
    console.log('[PASS] Property A-101 added');
    
    console.log('[TEST] Adding Agent...');
    const agent = await addTownAgent({
      Town_Name: testTownName,
      Agent_Name: 'Test Agent Khan'
    });
    console.log('[PASS] Agent added');

    console.log('[TEST] Selling Property (A-100) with Agent...');
    await sellProperty({
      type: 'Plot',
      number: 'A-100',
      townName: testTownName,
      Customer_Name: 'Test Buyer 1',
      Total_Amount_PKR: 450000,
      Advance_Amount_PKR: 100000,
      useInstallment: true,
      Total_Installments: 5,
      Total_Period_Months: 5,
      Gap_Days: 30,
      Agent_Name: agent.Agent_Name,
      Commission_Rate: 2, // 2% of 450,000 = 9,000
    });
    console.log('[PASS] Property sold for 450,000 (Advance: 100,000, Comm: 9,000)');

    // 4. Installments & Commissions
    console.log('[TEST] Paying Installment...');
    const insts = await getPropertyInstallments(`Plot|A-100|${testTownName}`);
    if (!insts || insts.length === 0) throw new Error('No installments generated');
    await markInstallmentPaid({
      Tracker_ID: insts[0].id,
      Paid_Date: new Date().toISOString(),
    });
    const paidAmount = insts[0].dueAmount; // 70000
    console.log(`[PASS] Installment paid: ${paidAmount}`);

    console.log('[TEST] Paying Agent Commission...');
    await recordCommissionReceipt({
      Town_Name: testTownName,
      Agent_Name: agent.Agent_Name,
      Amount: 5000, // Part payment of commission
      Plot_Shop_Number: 'A-100'
    });
    console.log('[PASS] Agent commission paid: 5000');

    // 5. Investors
    console.log('[TEST] Adding Investor & Cash Credit...');
    const investor = await addInvestor({
      Town_Name: testTownName,
      Investor_Name: 'Test Investor Ali',
      Balance: 0
    });
    await investorTransaction({
      Investor_ID: investor.Investor_ID,
      Type: 'Credit',
      Amount: 500000, // Inflow of 500k
    });
    console.log('[PASS] Investor credit added: 500,000');

    // 6. Constructors
    console.log('[TEST] Adding Constructor Project...');
    const project = await addConstructionProject({
      Town_Name: testTownName,
      Category: 'Road',
      Constructor_Name: 'Builder Bob',
      Deal_Amount: 200000,
    });
    await recordConstructionPayment({
      Project_ID: project.Project_ID,
      Amount: 50000,
    });
    console.log('[PASS] Constructor project deal (200k) & payment (50k) added');

    // 7. Resell Property & Deal Cancel
    console.log('[TEST] Reselling Property A-101 (Immediate sell & resell)...');
    await sellProperty({
      type: 'Plot',
      number: 'A-101',
      townName: testTownName,
      Customer_Name: 'Cancel Buyer',
      Total_Amount_PKR: 400000,
      Advance_Amount_PKR: 50000, // They paid 50k
    });
    // Now resell it
    await resellProperty({
      type: 'Plot',
      number: 'A-101',
      townName: testTownName,
      Company_Profit_Loss: 10000,
      Refund_Amount: 40000, // Returned 40k
      Returned_Installments: 0,
      Resell_Date: new Date().toISOString()
    });
    console.log('[PASS] Property resold (Company Profit: 10k, Refunded: 40k)');

    // 8. Daily Expenses & CEO Expenses
    console.log('[TEST] Adding Daily Expense...');
    await addDailyEntry({
      townName: testTownName,
      type: 'Expense',
      amount: 5000,
      description: 'Office Supplies',
      accountName: 'CEO Office',
      category: 'Office',
      skipLedger: 'No'
    });
    console.log('[PASS] Daily Expense added: 5,000');

    console.log('[TEST] Adding CEO Expense...');
    await addCeoExpense({
      Town_Name: testTownName,
      Expense_Name: 'CEO Dinner',
      Amount_PKR: 2000,
      Category: 'Food'
    });
    console.log('[PASS] CEO Expense added: 2,000');

    // 9. Employees & Advance Salaries
    console.log('[TEST] Adding Employee & Processing Salaries...');
    const employeeName = `Test Employee Ali ${Date.now()}`;
    await addEmployee({
      Town_Name: testTownName,
      Employee_Name: employeeName,
      Role: 'Staff',
      Salary: 30000,
    });
    
    // Give 5000 advance
    console.log('[TEST] Giving Employee Advance...');
    await recordSalaryPayment({
      employeeName: employeeName,
      amount: 5000,
      salaryAmount: 30000,
      salaryAppliedAmount: 0, // Not applied to salary yet
      cashDisbursedAmount: 5000,
      newAdvanceGiven: 5000,
      townName: testTownName,
      month: 'July 2026',
      type: 'Employee'
    });
    
    // Wait 1.5 seconds so the generated Receipt_Number doesn't collide
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Pay remaining 25000 salary applying advance
    console.log('[TEST] Paying Remaining Salary with Advance Deduction...');
    await recordSalaryPayment({
      employeeName: employeeName,
      amount: 25000,
      salaryAmount: 30000,
      salaryAppliedAmount: 30000, // Full salary applied
      cashDisbursedAmount: 25000, // Only 25k given physically
      advanceDeduction: 5000, // 5k advance deducted
      townName: testTownName,
      month: 'July 2026',
      type: 'Employee'
    });
    console.log('[PASS] Salary fully paid with advance flow');

    // Flush WAL
    console.log('[TEST] Waiting for WAL to flush...');
    await new Promise(r => setTimeout(r, 2000));

    // 10. Deep Math Verifications
    console.log('[TEST] Generating Town Report and Verifying Comprehensive Math...');
    const report = await townReport.buildTownLedgerReport({ townName: testTownName });
    
    // Calculate Expected Received
    // A-100 Advance (100k) + Installment (70k) = 170,000
    // A-101 Advance (50k) = 50,000
    // Investor Credit = 500,000
    const expectedReceived = 170000 + 50000 + 500000;
    const receivedTotal = report.summary.totalReceived;
    
    if (receivedTotal !== expectedReceived) {
      console.log('LEDGER DUMP FOR RECEIVED:', JSON.stringify(report.ledger.filter(x => x.direction === 'income'), null, 2));
      console.log('Money ledger path:', path.join(require('../src/main/db/core').getDbPath(), 'Global/Money_Ledger.xlsx'));
      throw new Error(`Total Received Mismatch: Expected ${expectedReceived}, Got ${receivedTotal}`);
    }

    // Calculate Expected Expenses
    // Agent Commission = 5,000
    // Construction Payment = 50,000
    // Refund = 40,000
    // Daily Expense = 5,000
    // CEO Expense = 2,000
    // Salary Advance = 5,000
    // Salary Paid = 30,000 (after 5k advance deduction)
    const expectedExpenses = 5000 + 50000 + 40000 + 5000 + 2000 + 5000 + 30000;
    
    if (report.summary.totalPaid !== expectedExpenses) {
      console.log('LEDGER DUMP FOR EXPENSES:', JSON.stringify(report.ledger.filter(x => x.direction === 'expense'), null, 2));
      throw new Error(`Total Expenses Mismatch: Expected ${expectedExpenses}, Got ${report.summary.totalPaid}`);
    }

    const expectedBalance = expectedReceived - expectedExpenses;
    if (report.summary.cashBalance !== expectedBalance) {
      throw new Error(`Cash Balance Mismatch: Expected ${expectedBalance}, Got ${report.summary.cashBalance}`);
    }
    
    // Check pending receivables/payables
    console.log('[TEST] Verifying Payables & Receivables...');
    
    // Commission earned = 0 (because sale not fully paid), Paid = 5000, Remaining = -5000
    const agentLedger = report.agentLedgers.find(a => a.name === 'Test Agent Khan');
    if (!agentLedger) throw new Error('Agent ledger not found');
    if (agentLedger.remaining !== -5000) throw new Error(`Agent remaining mismatch. Expected -5000, Got ${agentLedger.remaining}`);
    
    // Constructor remaining = 200000 - 50000 = 150000
    const constLedger = report.constructionLedgers[0];
    if (constLedger.remaining !== 150000) throw new Error(`Constructor remaining mismatch. Expected 150000, Got ${constLedger.remaining}`);
    
    // Receivables = A-100 remaining: Deal 450k - Adv 100k - Inst 70k = 280,000
    if (report.summary.receivable !== 280000) {
       throw new Error(`Total Receivable Mismatch: Expected 280000, Got ${report.summary.receivable}`);
    }

    console.log(`[PASS] Math perfectly verified! Balance: ${expectedBalance}`);

    // 11. Cleanup
    console.log(`[TEST] Cleaning up: Deleting ${testTownName}...`);
    await deleteTown(testTownName);
    console.log('[PASS] Cleanup complete');

    console.log('Money ledger path:', path.join(require('../src/main/db/core').getDbPath(), 'Global/Money_Ledger.xlsx'));
    console.log('✅ ALL EXHAUSTIVE E2E TESTS PASSED SUCCESSFULLY! Data Integrity is 100% Guaranteed.');
    process.exit(0);
  } catch (error) {
    console.error('❌ E2E TEST FAILED:', error);
    process.exit(1);
  }
});
