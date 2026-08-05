const path = require('path');
const fs = require('fs');
const { getGlobalsPath, readExcelFile } = require('./core');

class IntegrityLayer {

  // GUARD 1: Amount Validation
  static validateAmount(amount, context) {
    if (amount === null || amount === undefined) {
      throw new Error(`${context}: Amount is required`);
    }
    const num = parseFloat(amount);
    if (isNaN(num)) {
      throw new Error(`${context}: Amount must be a number, got: ${amount}`);
    }
    if (num < 0) {
      throw new Error(`${context}: Amount cannot be negative: ${amount}`);
    }
    if (num === 0) {
      throw new Error(`${context}: Amount cannot be zero`);
    }
    if (num > 999999999) {
      throw new Error(`${context}: Amount seems too large, verify: ${amount}`);
    }
    return true;
  }

  // GUARD 2: Prevent Double Transaction (Duplicate clicks within 5 seconds)
  static async checkDuplicate(townName, amount, type, description) {
    const fp = path.join(getGlobalsPath(), 'Money_Ledger.xlsx');
    if (!fs.existsSync(fp)) return false;
    const rows = await readExcelFile(fp, 'Data').catch(() => []);
    
    const fiveSecondsAgo = Date.now() - 5000;
    const cleanDesc = String(description || '').trim().toLowerCase();
    const cleanTown = String(townName || '').trim().toLowerCase();

    const isDuplicate = rows.some(row => {
      if (String(row.Status || 'approved').toLowerCase() !== 'approved') return false;
      const createdAtMs = new Date(row.Created_At || row.Created_Date || 0).getTime();
      return (
        createdAtMs > fiveSecondsAgo &&
        parseFloat(row.Amount) === parseFloat(amount) &&
        String(row.Direction).toLowerCase() === String(type).toLowerCase() &&
        String(row.Town_Name).toLowerCase() === cleanTown &&
        String(row.Description || '').trim().toLowerCase() === cleanDesc
      );
    });

    if (isDuplicate) {
      throw new Error(`Duplicate transaction detected: PKR ${parseFloat(amount).toLocaleString('en-PK')} (${description}). Please wait 5 seconds.`);
    }
    return false;
  }

  // GUARD 3: Balance Cannot Go Negative
  static async checkBalanceWontGoNegative(townName, expenseAmount, paymentAccountId) {
    const { getMoneySummary } = require('./moneyLedger');
    const summary = await getMoneySummary(townName);
    const overallBalance = summary?.cashBalance || 0;
    
    if (expenseAmount > overallBalance) {
      throw new Error(
        `Insufficient balance in town. ` +
        `Current Town Balance: PKR ${overallBalance.toLocaleString('en-PK')}, ` +
        `Required: PKR ${expenseAmount.toLocaleString('en-PK')}`
      );
    }

    if (paymentAccountId && paymentAccountId !== 'cash-in-hand') {
      const { getPaymentAccounts } = require('./cashBanks');
      const accounts = await getPaymentAccounts(townName);
      const acc = accounts.find(a => String(a.Account_ID || a.account_id || '').trim().toLowerCase() === String(paymentAccountId).trim().toLowerCase());
      if (acc) {
        const accBalance = acc.Current_Balance || 0;
        if (expenseAmount > accBalance) {
          throw new Error(
            `Insufficient balance in account ${acc.Account_Name}. ` +
            `Available: PKR ${accBalance.toLocaleString('en-PK')}, ` +
            `Required: PKR ${expenseAmount.toLocaleString('en-PK')}`
          );
        }
      }
    }
    return true;
  }

  // GUARD 4: Payment Account Must Exist
  static async validatePaymentAccount(townName, accountId, method) {
    if (method === 'cash') return true;
    if (!accountId) {
      throw new Error('Bank account must be selected for bank payment');
    }
    
    const { getPaymentAccounts } = require('./cashBanks');
    const accounts = await getPaymentAccounts(townName);
    const account = accounts.find(a => String(a.Account_ID || a.account_id || '').trim().toLowerCase() === String(accountId).trim().toLowerCase());
    
    if (!account) {
      throw new Error(`Payment account not found: ${accountId}`);
    }
    return true;
  }

  // GUARD 5: Property Must Exist Before Sale
  static async validatePropertyAvailable(townName, propertyType, propertyNumber) {
    const { getPropertyFile } = require('./properties');
    const property = await getPropertyFile(propertyType, propertyNumber, townName);
    
    if (!property) {
      throw new Error(`Property not found: ${propertyType} #${propertyNumber}`);
    }
    const status = String(property.Status || '').toLowerCase();
    if (status !== 'available' && status !== '') {
      throw new Error(
        `Property not available: ${propertyType} #${propertyNumber} ` +
        `is ${property.Status}`
      );
    }
    return true;
  }

  // GUARD 6: Installment Amount Must Match Plan
  static async validateInstallmentAmount(installmentId, paidAmount, townName) {
    if (!installmentId || String(installmentId).startsWith('missing|')) return true;
    const { getInstallments } = require('./globals');
    const installments = await getInstallments();
    const inst = installments.find(i => String(i.Tracker_ID || '') === String(installmentId));
    
    if (!inst) {
      throw new Error(`Installment not found: ${installmentId}`);
    }
    if (String(inst.Status || '').toLowerCase() === 'paid') {
      throw new Error(`Installment already paid: Month ${inst.Month_Number} of ${inst.Total_Months}`);
    }
    const dueAmount = parseFloat(inst.Monthly_Amount || inst.Due_Amount || 0);
    if (parseFloat(paidAmount) !== dueAmount) {
      throw new Error(
        `Installment amount mismatch. ` +
        `Expected: PKR ${dueAmount.toLocaleString('en-PK')}, ` +
        `Got: PKR ${parseFloat(paidAmount).toLocaleString('en-PK')}`
      );
    }
    return true;
  }

  // GUARD 7: Required Fields
  static validateRequired(data, requiredFields, context) {
    for (const field of requiredFields) {
      if (!data[field] && data[field] !== 0) {
        throw new Error(`${context}: ${field} is required`);
      }
    }
    return true;
  }

  // Normalization logic mapping different request properties to standard names
  static async normalizeData(operation, data) {
    let amount = 0;
    let townName = '';
    let direction = 'income';
    let description = '';
    let paymentMethod = 'cash';
    let paymentAccountId = null;
    let installmentId = null;

    if (operation === 'add-expense') {
      amount = parseFloat(data.Amount_PKR || data.amount || 0);
      townName = data.Town_Name || data.townName;
      direction = 'expense';
      description = data.Expense_Name || data.Description || 'General Expense';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'add-daily-entry' || operation === 'addDailyEntry') {
      amount = parseFloat(data.amount || data.Amount || 0);
      townName = data.townName || data.Town_Name;
      direction = String(data.type || data.Direction || 'income').toLowerCase() === 'income' ? 'income' : 'expense';
      description = data.description || data.Description || 'Daily Entry';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'sell-property') {
      amount = parseFloat(data.Advance_Amount_PKR || data.advance || data.amount || 0);
      townName = data.Town_Name || data.townName;
      direction = 'income';
      description = data.Description || 'Property sale advance';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'mark-installment-paid') {
      installmentId = data.Tracker_ID || data.installmentId || data.tracker_id;
      amount = parseFloat(data.Monthly_Amount || data.amount || data.Amount || data.monthly_amount || 0);
      townName = data.Town_Name || data.townName;
      if (amount <= 0 && installmentId) {
        try {
          const fp = path.join(getGlobalsPath(), 'Installments_Tracker.xlsx');
          if (fs.existsSync(fp)) {
            const rows = await readExcelFile(fp, 'Data');
            const match = (rows || []).find(r => String(r.Tracker_ID || r.tracker_id || '').trim() === String(installmentId).trim());
            if (match) {
              amount = parseFloat(match.Monthly_Amount || match.monthly_amount || match.Amount || match.amount || 0);
              if (!townName) townName = match.Town_Name || match.town_name;
            }
          }
        } catch (_) {}
      }
      direction = 'income';
      description = data.Description || 'Installment Payment';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'record-pending-collection' || operation === 'recordPendingCollection') {
      amount = parseFloat(data.amount || data.Amount || 0);
      townName = data.townName || data.Town_Name;
      direction = 'income';
      description = data.notes || data.Description || 'Pending Collection Payment';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'record-salary-payment' || operation === 'recordSalaryPayment' || operation === 'add-salary-payment') {
      amount = parseFloat(data.amount || data.Amount || 0);
      townName = data.townName || data.Town_Name;
      direction = 'expense';
      description = data.description || data.notes || 'Salary Payment';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'record-construction-payment' || operation === 'add-construction-payment') {
      amount = parseFloat(data.Amount_PKR || data.amount || data.Amount || 0);
      townName = data.Town_Name || data.townName;
      direction = 'expense';
      description = data.Description || 'Construction Payment';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'record-investor-transaction' || operation === 'add-investor-transaction') {
      amount = parseFloat(data.amount || data.Amount || data.Amount_PKR || 0);
      townName = data.townName || data.Town_Name;
      const typeStr = String(data.transactionType || data.type || data.Direction || 'deposit').toLowerCase();
      direction = (typeStr === 'deposit' || typeStr === 'income') ? 'income' : 'expense';
      description = data.notes || data.description || 'Investor Transaction';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'add-ceo-expense') {
      amount = parseFloat(data.Amount_PKR || data.amount || data.Amount || 0);
      townName = data.Town_Name || data.townName;
      direction = 'expense';
      description = data.Expense_Name || data.Description || 'CEO Expense';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    } else if (operation === 'resell-property') {
      amount = parseFloat(data.Resell_Advance || data.amount || data.Amount || 0);
      townName = data.Town_Name || data.townName;
      direction = 'income';
      description = data.Description || 'Resell Advance';
      paymentMethod = data.paymentMethod || data.Payment_Method || 'cash';
      paymentAccountId = data.paymentAccountId || data.Payment_Account_ID || null;
    }

    return {
      amount,
      townName: String(townName || '').trim(),
      direction,
      description,
      paymentMethod: String(paymentMethod).toLowerCase() === 'bank' ? 'bank' : 'cash',
      paymentAccountId,
      installmentId
    };
  }

  // RUN ALL GUARDS
  static async runAll(operation, data, townName) {
    const normalized = await this.normalizeData(operation, data);
    const targetTown = townName || normalized.townName;

    // Guard 1: Amount Validation
    this.validateAmount(normalized.amount, operation);
    
    // Guard 2: Prevent Double Transaction (duplicate checks within 5 seconds)
    await this.checkDuplicate(targetTown, normalized.amount, normalized.direction, normalized.description);
    
    // Guard 3: Balance Checks (insufficient funds)
    if (normalized.direction === 'expense') {
      await this.checkBalanceWontGoNegative(targetTown, normalized.amount, normalized.paymentAccountId);
    }
    
    // Guard 4: Payment Account Validation
    await this.validatePaymentAccount(targetTown, normalized.paymentAccountId, normalized.paymentMethod);

    // Guard 5: Property availability check (only for brand-new sales)
    if (operation === 'sell-property') {
      await this.validatePropertyAvailable(targetTown, data.type, data.number);
    }

    // Guard 6: Installment due verification
    if (operation === 'mark-installment-paid' && normalized.installmentId) {
      await this.validateInstallmentAmount(normalized.installmentId, normalized.amount, targetTown);
    }

    // Guard 7: Double-Entry Mathematical Balancing & Precision Rounding
    this.validateDoubleEntryMath(normalized.amount, normalized.direction);

    return true;
  }

  static validateDoubleEntryMath(amount, direction, debitAccount, creditAccount) {
    const parsed = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (parsed <= 0) throw new Error('Transaction amount must be greater than zero');
    if (debitAccount && creditAccount && String(debitAccount).trim().toLowerCase() === String(creditAccount).trim().toLowerCase()) {
      throw new Error(`Debit and Credit accounts cannot be identical (${debitAccount})`);
    }
    return parsed;
  }
}

module.exports = IntegrityLayer;
