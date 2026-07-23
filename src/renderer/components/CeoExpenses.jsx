import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
import { WalletIcon, BankIcon, NeighborhoodIcon, RulerIcon, CheckIcon, CrossIcon, WarnIcon, SaveIcon, EditIcon, TrashIcon, ChartIcon, SoldIcon, ClockIcon, PlusIcon } from './Icons';
import PaymentMethodSelector from './shared/PaymentMethodSelector';

const CEO_SALARY_RATE = 150000; // Fixed monthly salary per town

export default function CeoExpenses({ showToast, panel }) {
  const isCeo = panel === 'ceo';
  const [activeTab, setActiveTab] = useState('expenses'); // 'expenses' | 'salary'
  const [towns, setTowns] = useState([]);
  const [selectedTown, setSelectedTown] = useState('');
  const [form, setForm] = useState({ Expense_Name: '', Amount_PKR: '', Description: '', Category: 'General' });
  const [salaryForm, setSalaryForm] = useState({ Town_Name: '', Month_Year: getCurrentMonthYear(), Amount_PKR: CEO_SALARY_RATE, Notes: '' });
  const [expenses, setExpenses] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [townData, setTownData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [confirmModal, setConfirmModal] = useState(null);

  function getCurrentMonthYear() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  useEffect(() => { loadTowns(); loadExpenses(); loadSalaries(); }, []);
  useEffect(() => { if (selectedTown) loadTownData(); }, [selectedTown]);

  const loadTowns = async () => { if (!window.api) return; const d = await window.api.getTowns(); if (Array.isArray(d)) setTowns(d); };
  const loadExpenses = async () => { if (!window.api) return; const d = await window.api.getCeoExpenses(); if (Array.isArray(d)) setExpenses(d); };
  const loadSalaries = async () => { if (!window.api) return; const d = await window.api.getCeoSalary(); if (Array.isArray(d)) setSalaries(d); };
  const loadTownData = async () => { if (!window.api) return; const d = await window.api.getTownDetails(selectedTown); if (d && !d.error) setTownData(d); };

  // ─── Expense handlers ───────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isCeo) { showToast('Only CEO can add expenses', 'error'); return; }
    if (!selectedTown) { showToast('Please select a Town first', 'error'); return; }
    if (!form.Expense_Name || !form.Amount_PKR) { showToast('Expense name and Amount are required', 'error'); return; }
    setLoading(true);
    try {
      const result = await window.api.addCeoExpense({ 
        ...form, 
        Town_Name: selectedTown,
        paymentAccountId: form.paymentAccount?.paymentAccountId,
        paymentAccountName: form.paymentAccount?.paymentAccountName,
        paymentAccountType: form.paymentAccount?.paymentAccountType,
      });
      if (result?.error) { showToast(result.error, 'error'); }
      else {
        if (result.isOverLimit) showToast(`Limit exceeded! Total: PKR ${result.totalCeoExpenses?.toLocaleString()}, Limit: PKR ${result.expenseLimit?.toLocaleString()}`, 'warning');
        else showToast('Expense added successfully');
        setForm({ Expense_Name: '', Amount_PKR: '', Description: '', Category: 'General', paymentAccount: null });
        loadExpenses(); loadTownData();
      }
    } catch (e) { showToast('Failed to add expense', 'error'); }
    setLoading(false);
  };

  const handleDelete = async (expenseId) => {
    if (!isCeo) { showToast('Only CEO can delete expenses', 'error'); return; }
    setConfirmModal({
      message: 'Are you sure you want to delete this expense?',
      onConfirm: async () => {
        setConfirmModal(null);
        const result = await window.api.deleteCeoExpense(expenseId);
        if (result?.error) showToast(result.error, 'error');
        else { showToast('Expense deleted successfully'); loadExpenses(); loadTownData(); }
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  const startEdit = (exp) => {
    setEditingId(exp.Expense_ID);
    setEditForm({ Expense_Name: exp.Expense_Name, Amount_PKR: exp.Amount_PKR, Description: exp.Description || '', Category: exp.Category || 'General' });
  };

  const handleEdit = async (expenseId) => {
    if (!isCeo) { showToast('Only CEO can edit expenses', 'error'); return; }
    const result = await window.api.editCeoExpense({ Expense_ID: expenseId, ...editForm });
    if (result?.error) showToast(result.error, 'error');
    else { showToast('Expense updated successfully'); setEditingId(null); loadExpenses(); loadTownData(); }
  };

  // ─── Salary handlers ─────────────────────────────────────────
  const handleSalarySubmit = async (e) => {
    e.preventDefault();
    if (!isCeo) { showToast('Only CEO can record salary', 'error'); return; }
    if (!salaryForm.Town_Name || !salaryForm.Month_Year) { showToast('Town and Month/Year are required', 'error'); return; }
    // Check if this town/month already recorded
    const duplicate = salaries.find(s => s.Town_Name === salaryForm.Town_Name && s.Month_Year === salaryForm.Month_Year);
    if (duplicate) { showToast(`Salary for ${salaryForm.Town_Name} in ${salaryForm.Month_Year} is already recorded`, 'warning'); return; }
    setLoading(true);
    try {
      const result = await window.api.addCeoSalary({ 
        ...salaryForm, 
        Amount_PKR: parseFloat(salaryForm.Amount_PKR) || CEO_SALARY_RATE,
        paymentAccountId: salaryForm.paymentAccount?.paymentAccountId,
        paymentAccountName: salaryForm.paymentAccount?.paymentAccountName,
        paymentAccountType: salaryForm.paymentAccount?.paymentAccountType,
      });
      if (result?.error) { showToast(result.error, 'error'); }
      else {
        showToast(`PKR ${(parseFloat(salaryForm.Amount_PKR)||CEO_SALARY_RATE).toLocaleString()} salary recorded for ${salaryForm.Month_Year}`);
        setSalaryForm({ Town_Name: '', Month_Year: getCurrentMonthYear(), Amount_PKR: CEO_SALARY_RATE, Notes: '', paymentAccount: null });
        loadSalaries();
      }
    } catch (e) { showToast('Failed to record salary', 'error'); }
    setLoading(false);
  };

  const handleSalaryDelete = async (salaryId) => {
    if (!isCeo) { showToast('Only CEO can delete salary records', 'error'); return; }
    setConfirmModal({
      message: 'Are you sure you want to delete this salary record?',
      onConfirm: async () => {
        setConfirmModal(null);
        const result = await window.api.deleteCeoSalary(salaryId);
        if (result?.error) showToast(result.error, 'error');
        else { showToast('Salary record deleted successfully'); loadSalaries(); }
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  // ─── Computed values ──────────────────────────────────────────
  const townIncome = townData ? (parseFloat(townData.Total_Income_PKR) || 0) : 0;
  const expenseLimit = townIncome * 0.10;
  const townCeoTotal = expenses.filter(ex => ex.Town_Name === selectedTown).reduce((s, e) => s + (parseFloat(e.Amount_PKR) || 0), 0);
  const isOverLimit = selectedTown && townCeoTotal > expenseLimit && expenseLimit > 0;

  const totalSalaryPaid = salaries.reduce((s, r) => s + (parseFloat(r.Amount_PKR) || 0), 0);
  const salaryByTown = towns.map(t => ({
    name: t.Town_Name,
    total: salaries.filter(s => s.Town_Name === t.Town_Name).reduce((sum, r) => sum + (parseFloat(r.Amount_PKR) || 0), 0),
    months: salaries.filter(s => s.Town_Name === t.Town_Name).length,
  }));

  const chartData = {
    labels: ['Expense Limit (10%)', 'CEO Expenses Used'],
    datasets: [{ 
      label: 'PKR', 
      data: [expenseLimit, townCeoTotal], 
      backgroundColor: [
        'rgba(37, 99, 235, 0.15)', 
        isOverLimit ? 'rgba(225, 29, 72, 0.8)' : 'rgba(13, 148, 136, 0.8)'
      ], 
      borderColor: [
        'var(--accent-blue)', 
        isOverLimit ? 'var(--accent-red)' : 'var(--accent-green)'
      ],
      borderWidth: 1.5,
      borderRadius: 8 
    }],
  };

  const fmt = (n) => `PKR ${(n || 0).toLocaleString()}`;

  return (
    <div>
      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`btn ${activeTab === 'expenses' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('expenses')}
          style={{ display:'flex', alignItems:'center', gap:5 }}>
          <WalletIcon size={13}/> CEO Expenses
        </button>
        <button className={`btn ${activeTab === 'salary' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('salary')}
          style={{ display:'flex', alignItems:'center', gap:5 }}>
          <BankIcon size={13}/> CEO Salary (PKR 150,000 / town / month)
        </button>
      </div>

      {/* ══════════ EXPENSES TAB ══════════ */}
      {activeTab === 'expenses' && (
        <div>
          {selectedTown && townData && (
            <div className="stat-cards mb-6">
              <div className="stat-card">
                <div className="card-icon"><NeighborhoodIcon size={16}/></div>
                <div className="card-label">Town Income</div>
                <div className="card-value profit">{fmt(townIncome)}</div>
              </div>
              <div className="stat-card">
                <div className="card-icon"><RulerIcon size={16}/></div>
                <div className="card-label">Expense Limit (10% of Income)</div>
                <div className="card-value">{fmt(expenseLimit)}</div>
              </div>
              <div className={`stat-card ${isOverLimit ? 'red' : 'green'}`}>
                <div className="card-icon">{isOverLimit ? <WarnIcon size={16}/> : <CheckIcon size={16}/>}</div>
                <div className="card-label">CEO Expenses Used</div>
                <div className={`card-value ${isOverLimit ? 'loss' : 'profit'}`}>{fmt(townCeoTotal)}</div>
                <div className="card-sub">{isOverLimit ? 'OVER LIMIT - LOSS WARNING' : 'Within Limit'}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {isCeo ? (
              <div className="form-container">
                <div className="form-title" style={{display:'flex',alignItems:'center',gap:5}}><WalletIcon size={13}/> Add CEO Expense</div>
                <form onSubmit={handleSubmit}>
                  <div className="form-grid">
                    <div className="form-group full">
                      <label>Select Town *</label>
                      <select value={selectedTown} onChange={e => setSelectedTown(e.target.value)} required>
                        <option value="">-- Town --</option>
                        {towns.map((t, i) => <option key={i} value={t.Town_Name}>{t.Town_Name}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>Expense Name *</label><input placeholder="Expense name" value={form.Expense_Name} onChange={e => setForm({ ...form, Expense_Name: e.target.value })} required /></div>
                    <div className="form-group"><label>Amount (PKR) *</label><input type="number" placeholder="Amount" value={form.Amount_PKR} onChange={e => setForm({ ...form, Amount_PKR: e.target.value })} required /></div>
                    <div className="form-group">
                      <label>Category</label>
                      <select value={form.Category} onChange={e => setForm({ ...form, Category: e.target.value })}>
                        <option>General</option><option>Travel</option><option>Office</option><option>Marketing</option><option>Legal</option><option>Other</option>
                      </select>
                    </div>
                    <div className="form-group full"><label>Description</label><input placeholder="Description" value={form.Description} onChange={e => setForm({ ...form, Description: e.target.value })} /></div>
                    <div className="form-group full" style={{ marginTop: '4px' }}>
                      <PaymentMethodSelector
                        townName={selectedTown || 'all'}
                        value={form.paymentAccount || null}
                        onChange={(acc) => setForm({ ...form, paymentAccount: acc })}
                        label="Payment Account *"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-lg mt-6" disabled={loading}
                    style={{ display:'flex', alignItems:'center', gap:5 }}>
                    {loading ? <><ClockIcon size={13}/> Adding...</> : <><PlusIcon size={13}/> Add Expense</>}
                  </button>
                </form>
              </div>
            ) : (
              <div className="form-container">
                <div className="form-title" style={{display:'flex',alignItems:'center',gap:5}}><WalletIcon size={13}/> CEO Expenses View</div>
                <div className="form-group full">
                  <label>Filter by Town</label>
                  <select value={selectedTown} onChange={e => setSelectedTown(e.target.value)}>
                    <option value="">-- All Towns --</option>
                    {towns.map((t, i) => <option key={i} value={t.Town_Name}>{t.Town_Name}</option>)}
                  </select>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0', display:'flex', alignItems:'center', gap:4 }}>
                  Only the CEO can add or modify expenses.
                </p>
              </div>
            )}

            <div className="chart-card">
              <h3 style={{display:'flex',alignItems:'center',gap:5}}><ChartIcon size={13}/> Expense Limit vs Used {selectedTown && `(${selectedTown})`}</h3>
              <div style={{ height: 260 }}>
                {selectedTown ? (
                  <Bar 
                    data={chartData} 
                    options={{ 
                      responsive: true, 
                      maintainAspectRatio: false, 
                      plugins: { 
                        legend: { display: false },
                        tooltip: {
                          backgroundColor: 'var(--bg-card)',
                          titleColor: 'var(--text-primary)',
                          bodyColor: 'var(--text-secondary)',
                          borderColor: 'var(--border-color)',
                          borderWidth: 1,
                          padding: 12,
                          cornerRadius: 10,
                          titleFont: { family: 'Plus Jakarta Sans', weight: '700' },
                          bodyFont: { family: 'Plus Jakarta Sans' }
                        }
                      }, 
                      scales: { 
                        x: { 
                          ticks: { color: 'var(--text-muted)', font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } },
                          grid: { display: false }
                        }, 
                        y: { 
                          ticks: { color: 'var(--text-muted)', font: { family: 'Plus Jakarta Sans', size: 11 } },
                          grid: { color: 'var(--border-color)', drawBorder: false }
                        } 
                      } 
                    }} 
                  />
                ) : (
                  <div className="empty-state"><p>Select a town to view the chart</p></div>
                )}
              </div>
            </div>
          </div>

          <div className="table-container mt-6">
            <div className="table-header"><h3 style={{display:'flex',alignItems:'center',gap:5}}><SoldIcon size={13}/> CEO Expenses ({expenses.filter(e => !selectedTown || e.Town_Name === selectedTown).length})</h3></div>
            {expenses.filter(e => !selectedTown || e.Town_Name === selectedTown).length === 0
              ? <div className="empty-state"><p>No CEO expenses found.</p></div>
              : (
                <table className="data-table">
                  <thead><tr>
                    <th>Town</th><th>Expense</th><th>Amount</th><th>Category</th><th>Date</th><th>Over Limit</th>
                    {isCeo && <th>Actions</th>}
                  </tr></thead>
                  <tbody>{expenses.filter(e => !selectedTown || e.Town_Name === selectedTown).map((exp, i) => (
                    <tr key={i}>
                      {editingId === exp.Expense_ID ? (
                        <>
                          <td>{exp.Town_Name}</td>
                          <td><input value={editForm.Expense_Name} onChange={e => setEditForm({ ...editForm, Expense_Name: e.target.value })} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-active)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: 6, width: '100%' }} /></td>
                          <td><input type="number" value={editForm.Amount_PKR} onChange={e => setEditForm({ ...editForm, Amount_PKR: e.target.value })} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-active)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: 6, width: 100 }} /></td>
                          <td><select value={editForm.Category} onChange={e => setEditForm({ ...editForm, Category: e.target.value })} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-active)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: 6 }}><option>General</option><option>Travel</option><option>Office</option><option>Marketing</option><option>Legal</option><option>Other</option></select></td>
                          <td>{exp.Date}</td>
                          <td><span className={`status-badge ${exp.Is_Over_Limit === 'Yes' ? 'status-overdue' : 'status-active'}`}>{exp.Is_Over_Limit === 'Yes' ? 'Yes' : 'No'}</span></td>
                          <td style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-success btn-sm" onClick={() => handleEdit(exp.Expense_ID)}
                              style={{ display:'flex', alignItems:'center', gap:4 }}>
                              <SaveIcon size={12}/> Save
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}
                              style={{ display:'flex', alignItems:'center', gap:4 }}>
                              <CrossIcon size={10}/>
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{exp.Town_Name}</td>
                          <td>{exp.Expense_Name}</td>
                          <td className="text-red">{fmt(parseFloat(exp.Amount_PKR) || 0)}</td>
                          <td>{exp.Category}</td>
                          <td>{exp.Date}</td>
                          <td><span className={`status-badge ${exp.Is_Over_Limit === 'Yes' ? 'status-overdue' : 'status-active'}`}>{exp.Is_Over_Limit === 'Yes' ? 'Yes' : 'No'}</span></td>
                          {isCeo && (
                            <td style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(exp)}
                                style={{ display:'flex', alignItems:'center', gap:4 }}>
                                <EditIcon size={11}/> Edit
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(exp.Expense_ID)}
                                style={{ display:'flex', alignItems:'center', gap:4 }}>
                                <TrashIcon size={11}/> Del
                              </button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}</tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {/* ══════════ SALARY TAB ══════════ */}
      {activeTab === 'salary' && (
        <div>
          {/* Summary Cards */}
          <div className="stat-cards mb-6">
            <div className="stat-card green">
              <div className="card-icon"><BankIcon size={16}/></div>
              <div className="card-label">Total CEO Salary Paid</div>
              <div className="card-value profit">{fmt(totalSalaryPaid)}</div>
            </div>
            <div className="stat-card">
              <div className="card-icon"><CalendarIcon size={16}/></div>
              <div className="card-label">Total Salary Records</div>
              <div className="card-value">{salaries.length}</div>
            </div>
            <div className="stat-card">
              <div className="card-icon"><NeighborhoodIcon size={16}/></div>
              <div className="card-label">Fixed Rate / Town / Month</div>
              <div className="card-value">PKR 1,50,000</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            {/* Add Salary Form */}
            {isCeo ? (
              <div className="form-container">
                <div className="form-title" style={{display:'flex',alignItems:'center',gap:5}}><BankIcon size={13}/> Record CEO Salary</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
                  Fixed CEO salary of PKR 150,000 per town per month. Separate from other expenses.
                </p>
                <form onSubmit={handleSalarySubmit}>
                  <div className="form-grid">
                    <div className="form-group full">
                      <label>Town *</label>
                      <select value={salaryForm.Town_Name} onChange={e => setSalaryForm({ ...salaryForm, Town_Name: e.target.value })} required>
                        <option value="">-- Select Town --</option>
                        {towns.map((t, i) => <option key={i} value={t.Town_Name}>{t.Town_Name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Month/Year * (YYYY-MM)</label>
                      <input type="month" value={salaryForm.Month_Year} onChange={e => setSalaryForm({ ...salaryForm, Month_Year: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Amount (PKR) *</label>
                      <input type="number" value={salaryForm.Amount_PKR} onChange={e => setSalaryForm({ ...salaryForm, Amount_PKR: e.target.value })} placeholder="150000" required />
                    </div>
                    <div className="form-group full">
                      <label>Notes</label>
                      <input placeholder="Optional notes..." value={salaryForm.Notes} onChange={e => setSalaryForm({ ...salaryForm, Notes: e.target.value })} />
                    </div>
                    <div className="form-group full" style={{ marginTop: '4px' }}>
                      <PaymentMethodSelector
                        townName={salaryForm.Town_Name || 'all'}
                        value={salaryForm.paymentAccount || null}
                        onChange={(acc) => setSalaryForm({ ...salaryForm, paymentAccount: acc })}
                        label="Payment Account *"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-lg mt-6" disabled={loading}
                    style={{ display:'flex', alignItems:'center', gap:5 }}>
                    {loading ? <><ClockIcon size={13}/> Adding...</> : <><BankIcon size={13}/> Record Salary</>}
                  </button>
                </form>
              </div>
            ) : (
              <div className="form-container">
                <div className="form-title" style={{display:'flex',alignItems:'center',gap:5}}><BankIcon size={13}/> CEO Salary</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Only the CEO can record salary.</p>
              </div>
            )}

            {/* Per Town Summary */}
            <div className="chart-card">
              <h3 style={{display:'flex',alignItems:'center',gap:5}}><NeighborhoodIcon size={13}/> Town-wise Salary Summary</h3>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {salaryByTown.filter(t => t.total > 0).length === 0
                  ? <div className="empty-state"><p>No salary records yet.</p></div>
                  : salaryByTown.filter(t => t.total > 0).map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.months} month(s) recorded</div>
                      </div>
                      <div className="text-red" style={{ fontWeight: 700 }}>{fmt(t.total)}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Salary Table */}
          <div className="table-container">
            <div className="table-header"><h3 style={{display:'flex',alignItems:'center',gap:5}}><SoldIcon size={13}/> CEO Salary Records ({salaries.length})</h3></div>
            {salaries.length === 0
              ? <div className="empty-state"><p>No salary records yet. Add one using the form above.</p></div>
              : (
                <table className="data-table">
                  <thead><tr>
                    <th>Town</th><th>Month/Year</th><th>Amount</th><th>Date Recorded</th><th>Notes</th>
                    {isCeo && <th>Actions</th>}
                  </tr></thead>
                  <tbody>{salaries.map((sal, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{sal.Town_Name}</td>
                      <td>{sal.Month_Year}</td>
                      <td className="text-red" style={{ fontWeight: 700 }}>{fmt(parseFloat(sal.Amount_PKR) || 0)}</td>
                      <td>{sal.Date_Recorded}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{sal.Notes || '—'}</td>
                      {isCeo && (
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => handleSalaryDelete(sal.Salary_ID)}
                            style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <TrashIcon size={11}/> Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}</tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:440,padding:24}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700}}>Confirm Action</h3>
            <p style={{margin:'0 0 20px',color:'var(--text-secondary)',fontSize:14,lineHeight:1.6}}>{confirmModal.message}</p>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={confirmModal.onCancel}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmModal.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
