import React, { useState, useEffect } from 'react';
import { NeighborhoodIcon, ClockIcon, PlusIcon, SoldIcon } from './Icons';

export default function AddTown({ showToast }) {
  const [form, setForm] = useState({ Town_Name: '', Total_Plots: '', Total_Shops: '', Commission_Rate: '' });
  const [towns, setTowns] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadTowns(); }, []);

  const loadTowns = async () => {
    if (!window.api) return;
    const data = await window.api.getTowns();
    if (Array.isArray(data)) setTowns(data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.Town_Name.trim()) { showToast('Town name is required', 'error'); return; }
    setLoading(true);
    try {
      const result = await window.api.addTown(form);
      if (result?.error) { showToast(result.error, 'error'); }
      else { showToast(`Town "${form.Town_Name}" added successfully!`); setForm({ Town_Name: '', Total_Plots: '', Total_Shops: '', Commission_Rate: '' }); loadTowns(); }
    } catch (e) { showToast('Crash adding town: ' + (e.message || String(e)), 'error'); }
    setLoading(false);
  };

  const u = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <div className="form-container mb-6">
        <div className="form-title" style={{display:'flex',alignItems:'center',gap:6}}><NeighborhoodIcon size={14}/> Add New Town</div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Town Name *</label>
              <input placeholder="e.g. Lahore" value={form.Town_Name} onChange={u('Town_Name')} required />
            </div>
            <div className="form-group">
              <label>Total Plots</label>
              <input type="number" placeholder="e.g. 100" value={form.Total_Plots} onChange={u('Total_Plots')} />
            </div>
            <div className="form-group">
              <label>Total Shops</label>
              <input type="number" placeholder="e.g. 50" value={form.Total_Shops} onChange={u('Total_Shops')} />
            </div>
            <div className="form-group">
              <label>Commission Rate (%)</label>
              <input type="number" step="0.1" placeholder="e.g. 5" value={form.Commission_Rate} onChange={u('Commission_Rate')} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg mt-6" disabled={loading}
            style={{display:'flex',alignItems:'center',gap:5}}>
            {loading ? <><ClockIcon size={13}/> Adding...</> : <><PlusIcon size={13}/> Add Town</>}
          </button>
        </form>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3 style={{display:'flex',alignItems:'center',gap:5}}><SoldIcon size={13}/> All Towns ({towns.length})</h3>
        </div>
        {towns.length === 0 ? (
          <div className="empty-state"><div className="icon"><NeighborhoodIcon size={36}/></div><h3>No Towns Added</h3><p>Add your first town to get started.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Town Name</th><th>Plots</th><th>Shops</th><th>Commission</th><th>Income</th><th>Expenses</th><th>Profit/Loss</th><th>Status</th></tr></thead>
            <tbody>
              {towns.map((t, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{t.Town_Name}</td>
                  <td>{t.Total_Plots}</td>
                  <td>{t.Total_Shops}</td>
                  <td>{t.Commission_Rate}%</td>
                  <td className="text-green">PKR {(parseFloat(t.Total_Income_PKR)||0).toLocaleString()}</td>
                  <td className="text-red">PKR {(parseFloat(t.Total_Expenses_PKR)||0).toLocaleString()}</td>
                  <td className={(parseFloat(t.Profit_Loss)||0) >= 0 ? 'text-green' : 'text-red'}>PKR {(parseFloat(t.Profit_Loss)||0).toLocaleString()}</td>
                  <td><span className="status-badge status-active">{t.Status || 'Active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
