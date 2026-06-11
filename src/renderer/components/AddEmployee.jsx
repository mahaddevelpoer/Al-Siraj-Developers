import React, { useState, useEffect } from 'react';
import { UsersIcon, ClockIcon, PlusIcon, SoldIcon } from './Icons';

export default function AddEmployee({ showToast }) {
  const [form, setForm] = useState({ Employee_Name: '', CNIC: '', Phone_Number: '' });

  const handleCNICChange = (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 13) val = val.slice(0, 13);
    let formatted = val;
    if (val.length > 5) {
      formatted = val.slice(0, 5) + '-' + val.slice(5);
    }
    if (val.length > 12) {
      formatted = val.slice(0, 5) + '-' + val.slice(5, 12) + '-' + val.slice(12, 13);
    }
    setForm(f => ({ ...f, CNIC: formatted }));
  };
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadEmployees(); }, []);
  const loadEmployees = async () => { if (!window.api) return; const d = await window.api.getEmployees(); if (Array.isArray(d)) setEmployees(d); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.Employee_Name.trim()) { showToast('Employee name required', 'error'); return; }
    setLoading(true);
    try {
      const r = await window.api.addEmployee(form);
      if (r?.error) showToast(r.error, 'error');
      else { showToast(`Employee "${form.Employee_Name}" added!`); setForm({ Employee_Name: '', CNIC: '', Phone_Number: '' }); loadEmployees(); }
    } catch (e) { showToast('Failed', 'error'); }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this employee?')) return;
    await window.api.deleteEmployee(id);
    showToast('Employee deactivated');
    loadEmployees();
  };

  return (
    <div>
      <div className="form-container mb-6">
        <div className="form-title" style={{display:'flex',alignItems:'center',gap:6}}><UsersIcon size={14}/> Add Employee</div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group"><label>Employee Name *</label><input placeholder="Full name" value={form.Employee_Name} onChange={e => setForm({...form, Employee_Name: e.target.value})} required /></div>
            <div className="form-group"><label>CNIC / ID Card</label><input placeholder="31301-0699281-9" value={form.CNIC} onChange={handleCNICChange} maxLength={15} /></div>
            <div className="form-group"><label>Phone Number</label><input placeholder="Phone (11 digits)" value={form.Phone_Number} onChange={e => {
              let val = e.target.value.replace(/[^0-9]/g, '');
              if (val.length > 11) val = val.slice(0, 11);
              setForm({...form, Phone_Number: val});
            }} maxLength={11} /></div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg mt-6" disabled={loading}
            style={{display:'flex',alignItems:'center',gap:5}}>
            {loading ? <><ClockIcon size={13}/> Adding...</> : <><PlusIcon size={13}/> Add Employee</>}
          </button>
        </form>
      </div>
      <div className="table-container">
        <div className="table-header"><h3 style={{display:'flex',alignItems:'center',gap:5}}><SoldIcon size={13}/> All Employees ({employees.length})</h3></div>
        {employees.length === 0 ? <div className="empty-state"><div className="icon"><UsersIcon size={36}/></div><h3>No Employees</h3><p>Add employees to assign them to sales.</p></div> : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>CNIC</th><th>Phone</th><th>Date Added</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{employees.map((e,i) => (
              <tr key={i}><td style={{fontWeight:600}}>{e.Employee_Name}</td><td>{e.CNIC||'-'}</td><td>{e.Phone_Number||'-'}</td><td>{e.Date_Added}</td><td><span className={`status-badge ${e.Status==='Active'?'status-active':'status-overdue'}`}>{e.Status}</span></td><td>{e.Status==='Active' && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(e.Employee_ID)}>Deactivate</button>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
