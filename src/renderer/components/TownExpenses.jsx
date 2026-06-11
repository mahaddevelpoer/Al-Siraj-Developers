import React, { useState, useEffect } from 'react';
import { UsersIcon, BriefcaseIcon, IconExpense, IconMoney } from './Icons';
import OfficialReceipt from './OfficialReceipt';

export default function TownExpenses({ townName, showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('employee'); // 'employee' or 'ceo'
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [salaryAmount, setSalaryAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [note, setNote] = useState('');
  const [ceoName, setCeoName] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Receipt Modal State
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    loadEmployees();
    const now = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    setSelectedMonth(`${months[now.getMonth()]} ${now.getFullYear()}`);
  }, []);

  const loadEmployees = async () => {
    if (!window.api) return;
    const res = await window.api.getEmployees();
    if (Array.isArray(res)) {
      setEmployees(res.filter(e => e.Status === 'Active'));
    }
  };

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
      const data = {
        employeeName: name,
        designation,
        amount,
        month: selectedMonth,
        townName,
        type,
        note
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
          townName,
          note
        });
        setShowReceipt(true);
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
                </div>
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
