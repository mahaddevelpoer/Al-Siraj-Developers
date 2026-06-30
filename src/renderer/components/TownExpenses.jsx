import React, { useState, useEffect } from 'react';
import { UsersIcon, BriefcaseIcon, IconExpense, IconMoney } from './Icons';
import OfficialReceipt from './OfficialReceipt';
import PaymentAccountSelect from './PaymentAccountSelect';

export default function TownExpenses({ townName, showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('employee'); // 'employee' or 'ceo'
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [salaryAmount, setSalaryAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [note, setNote] = useState('');
  const [ceoName, setCeoName] = useState('');
  const [loading, setLoading] = useState(false);
  const [salaryRecords, setSalaryRecords] = useState([]);
  const [paymentAccount, setPaymentAccount] = useState(null);
  
  // Receipt Modal State
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    loadEmployees();
    loadSalaryRecords();
    const now = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    setSelectedMonth(`${months[now.getMonth()]} ${now.getFullYear()}`);
  }, []);

  useEffect(() => {
    if (selectedEmployee?.Salary && !salaryAmount) setSalaryAmount(String(selectedEmployee.Salary));
  }, [selectedEmployee]);

  const loadEmployees = async () => {
    if (!window.api) return;
    const res = await window.api.getEmployees();
    if (Array.isArray(res)) {
      setEmployees(res.filter(e => e.Status === 'Active'));
    }
  };

  const loadSalaryRecords = async () => {
    if (!window.api?.getSalaryRecords) return;
    const rows = await window.api.getSalaryRecords({ townName });
    if (Array.isArray(rows)) setSalaryRecords(rows);
  };

  const getEmployeeSalarySnapshot = (employee, month) => {
    const fixedSalary = parseFloat(employee?.Salary || employee?.Base_Salary || 0) || 0;
    const paid = salaryRecords
      .filter((row) =>
        String(row.Name || row.Employee_Name || '').trim().toLowerCase() === String(employee?.Employee_Name || '').trim().toLowerCase() &&
        String(row.Month || '').trim().toLowerCase() === String(month || '').trim().toLowerCase()
      )
      .reduce((sum, row) => {
        const applied = parseFloat(row.Salary_Paid_Amount);
        if (Number.isFinite(applied)) return sum + applied;
        return sum + Math.max(0, (parseFloat(row.Amount) || 0) - (parseFloat(row.New_Advance_Given) || 0));
      }, 0);
    return {
      fixedSalary,
      paid,
      remaining: Math.max(0, fixedSalary - paid),
    };
  };

  const getEmployeeLedgerRows = (employee) => {
    const name = String(employee?.Employee_Name || '').trim().toLowerCase();
    if (!name) return [];
    return salaryRecords
      .filter((row) => String(row.Name || row.Employee_Name || '').trim().toLowerCase() === name)
      .sort((a, b) => String(b.Date || '').localeCompare(String(a.Date || '')));
  };

  const getEmployeeLedgerTotals = (rows) => rows.reduce((totals, row) => {
    const cash = parseFloat(row.Cash_Disbursed_Amount || row.Amount) || 0;
    const salaryApplied = parseFloat(row.Salary_Paid_Amount || row.Amount) || 0;
    const advance = parseFloat(row.New_Advance_Given) || 0;
    return {
      cash: totals.cash + cash,
      salaryApplied: totals.salaryApplied + salaryApplied,
      advance: totals.advance + advance,
      rows: totals.rows + 1,
    };
  }, { cash: 0, salaryApplied: 0, advance: 0, rows: 0 });

  const handleGiveSalary = async (type) => {
    const name = type === 'Employee' ? selectedEmployee?.Employee_Name : ceoName;
    const designation = type === 'Employee' ? 'Staff' : 'CEO';
    const amount = parseFloat(salaryAmount);

    if (!name || !amount || !selectedMonth) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    setLoading(true);
    try {
      let salaryPayload = {};
      let advanceGiven = 0;
      let salaryApplied = amount;
      let fixedSalary = amount;
      let remainingBefore = amount;
      if (type === 'Employee') {
        const snapshot = getEmployeeSalarySnapshot(selectedEmployee, selectedMonth);
        fixedSalary = snapshot.fixedSalary || amount;
        remainingBefore = snapshot.fixedSalary ? snapshot.remaining : amount;
        if (snapshot.fixedSalary && amount > snapshot.remaining) {
          advanceGiven = amount - snapshot.remaining;
          const ok = window.confirm(`${name} ki ${selectedMonth} salary me PKR ${snapshot.remaining.toLocaleString()} remaining hai. Extra PKR ${advanceGiven.toLocaleString()} ko advance salary record karna hai?`);
          if (!ok) {
            setLoading(false);
            return;
          }
        }
        salaryApplied = snapshot.fixedSalary ? Math.min(amount, snapshot.remaining) : amount;
        salaryPayload = {
          salaryAmount: fixedSalary,
          baseSalary: fixedSalary,
          salaryGrossAmount: amount,
          cashDisbursedAmount: amount,
          salaryAppliedAmount: salaryApplied,
          newAdvanceGiven: advanceGiven,
          isAdvanceSalary: advanceGiven > 0,
        };
      }
      const data = {
        employeeName: name,
        designation,
        amount,
        month: selectedMonth,
        townName,
        type,
        note,
        ...paymentAccount,
        ...salaryPayload,
      };
      
      const res = await window.api.recordSalaryPayment(data);
      if (res && !res.error) {
        showToast(`Salary recorded for ${name}`);
        setReceiptData({
          type: 'salary',
          receiptNumber: res.Receipt_Number,
          date: res.Date,
          employeeName: name,
          designation,
          month: selectedMonth,
          amount,
          baseSalary: fixedSalary,
          salaryAppliedAmount: salaryApplied,
          newAdvanceGiven: advanceGiven,
          salaryRemainingBefore: remainingBefore,
          paymentAccountName: res.Payment_Account_Name || paymentAccount?.paymentAccountName,
          paymentAccountType: res.Payment_Account_Type || paymentAccount?.paymentAccountType,
          townName,
          note
        });
        setShowReceipt(true);
        await loadSalaryRecords();
        // Clear form
        setSalaryAmount('');
        setNote('');
        if (type === 'CEO') setCeoName('');
        else setSelectedEmployee(null);
      } else {
        showToast(res?.error || 'Failed to record salary', 'error');
      }
    } catch (e) {
      showToast('Error recording salary', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="ui-town-expenses-container">
      {showReceipt && receiptData && (
        <OfficialReceipt 
          data={receiptData} 
          townName={townName} 
          onClose={() => setShowReceipt(false)} 
        />
      )}

      <div className="ui-town-header-subtitle" style={{ marginBottom: 20 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconExpense size={16} /> Town Expenses — {townName}</span>
      </div>

      {/* Sub Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 25 }}>
        <button 
          className={`btn ${activeSubTab === 'employee' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveSubTab('employee')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <UsersIcon size={14} /> Employee Salaries
        </button>
        <button 
          className={`btn ${activeSubTab === 'ceo' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveSubTab('ceo')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <BriefcaseIcon size={14} /> CEO Salary
        </button>
      </div>

      <div className="ui-town-tab-wrapper" style={{ padding: 25, background: 'var(--bg-secondary)', borderRadius: 18 }}>
        
        {activeSubTab === 'employee' ? (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 15, fontSize: 13, color: 'var(--text-muted)' }}>SELECT EMPLOYEE:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 30 }}>
              {employees.length > 0 ? employees.map(emp => (
                <div 
                  key={emp.Employee_ID}
                  onClick={() => setSelectedEmployee(emp)}
                  style={{
                    padding: '15px',
                    borderRadius: 12,
                    border: '2px solid',
                    borderColor: selectedEmployee?.Employee_ID === emp.Employee_ID ? 'var(--accent-blue)' : 'var(--border-color)',
                    background: selectedEmployee?.Employee_ID === emp.Employee_ID ? 'white' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    boxShadow: selectedEmployee?.Employee_ID === emp.Employee_ID ? '0 4px 12px rgba(59,130,246,0.1)' : 'none'
                  }}
                >
                  <div style={{ color: 'var(--accent-blue)', marginBottom: 5 }}><UsersIcon size={20} /></div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{emp.Employee_Name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Staff</div>
                </div>
              )) : (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                  No active employees found. Add employees from CEO Hub.
                </div>
              )}
            </div>

            {selectedEmployee && (
              <div className="form-grid" style={{ background: 'white', padding: 20, borderRadius: 14, border: '1px solid var(--border-color)' }}>
                <div className="form-group full">
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', marginBottom: 10 }}>Selected: {selectedEmployee.Employee_Name}</div>
                  {(() => {
                    const snapshot = getEmployeeSalarySnapshot(selectedEmployee, selectedMonth);
                    return snapshot.fixedSalary > 0 ? (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>Fixed salary: <b style={{ color: 'var(--text-primary)' }}>PKR {snapshot.fixedSalary.toLocaleString()}</b></span>
                        <span>Paid this month: <b style={{ color: '#047857' }}>PKR {snapshot.paid.toLocaleString()}</b></span>
                        <span>Remaining: <b style={{ color: snapshot.remaining > 0 ? '#b45309' : '#047857' }}>PKR {snapshot.remaining.toLocaleString()}</b></span>
                      </div>
                    ) : null;
                  })()}
                </div>
                {(() => {
                  const rows = getEmployeeLedgerRows(selectedEmployee);
                  const totals = getEmployeeLedgerTotals(rows);
                  return (
                    <div className="form-group full">
                      <div className="employee-ledger-panel">
                        <div className="employee-ledger-head">
                          <div>
                            <div className="employee-ledger-kicker">Individual employee ledger</div>
                            <strong>{selectedEmployee.Employee_Name}</strong>
                          </div>
                          <span>{totals.rows} payment{totals.rows === 1 ? '' : 's'}</span>
                        </div>
                        <div className="employee-ledger-stats">
                          <div><span>Cash Paid</span><b>PKR {totals.cash.toLocaleString()}</b></div>
                          <div><span>Salary Applied</span><b>PKR {totals.salaryApplied.toLocaleString()}</b></div>
                          <div><span>Advance Given</span><b>PKR {totals.advance.toLocaleString()}</b></div>
                        </div>
                        <div className="employee-ledger-list">
                          {rows.slice(0, 5).map((row) => (
                            <div key={row.Receipt_Number || `${row.Date}-${row.Amount}`}>
                              <span>{row.Date || '-'} | {row.Month || '-'}</span>
                              <b>Cash PKR {Number(row.Cash_Disbursed_Amount || row.Amount || 0).toLocaleString()}</b>
                              <small>Salary PKR {Number(row.Salary_Paid_Amount || row.Amount || 0).toLocaleString()} {Number(row.New_Advance_Given || 0) > 0 ? `| Advance PKR ${Number(row.New_Advance_Given || 0).toLocaleString()}` : ''}</small>
                            </div>
                          ))}
                          {!rows.length && <div className="employee-ledger-empty">No salary payments yet for this employee.</div>}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div className="form-group">
                  <label>Month *</label>
                  <input value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} placeholder="e.g. June 2026" />
                </div>
                <div className="form-group">
                  <label>Salary Amount (PKR) *</label>
                  <input type="number" value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)} placeholder="Enter amount" />
                </div>
                <div className="form-group full">
                  <label>Note (Optional)</label>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add any notes..." />
                </div>
                <div className="form-group full">
                  <PaymentAccountSelect
                    townName={townName}
                    value={paymentAccount}
                    onChange={setPaymentAccount}
                    label="Pay Salary From"
                  />
                </div>
                <div className="form-group full" style={{ marginTop: 10 }}>
                   <button className="btn btn-success btn-lg" onClick={() => handleGiveSalary('Employee')} disabled={loading}>
                     <IconMoney size={14} /> Give Salary & Print Receipt
                   </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="form-grid" style={{ background: 'white', padding: 25, borderRadius: 14, border: '1px solid var(--border-color)' }}>
            <div className="form-group full">
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <BriefcaseIcon size={20} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>CEO Salary Payment</div>
               </div>
            </div>
            <div className="form-group">
              <label>CEO Name *</label>
              <input value={ceoName} onChange={(e) => setCeoName(e.target.value)} placeholder="Enter name" />
            </div>
            <div className="form-group">
              <label>Month *</label>
              <input value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} placeholder="e.g. June 2026" />
            </div>
            <div className="form-group">
              <label>Amount (PKR) *</label>
              <input type="number" value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)} placeholder="Enter amount" />
            </div>
            <div className="form-group">
              <label>Note (Optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add any notes..." />
            </div>
            <div className="form-group full">
              <PaymentAccountSelect
                townName={townName}
                value={paymentAccount}
                onChange={setPaymentAccount}
                label="Pay Salary From"
              />
            </div>
            <div className="form-group full" style={{ marginTop: 15 }}>
               <button className="btn btn-primary btn-lg" onClick={() => handleGiveSalary('CEO')} disabled={loading}>
                 <IconMoney size={14} /> Give Salary & Print Receipt
               </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
