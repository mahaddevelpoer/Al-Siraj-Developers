import React, { useEffect, useState } from 'react';
import { UsersIcon, PlusIcon } from './Icons';

export default function TownAgents({ townName, showToast }) {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ Agent_Name: '', Phone_Number: '', CNIC: '', Address: '', Notes: '' });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const rows = await window.api?.getTownAgents?.(townName);
    setAgents(Array.isArray(rows) ? rows : []);
  };

  useEffect(() => { load(); }, [townName]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.Agent_Name.trim()) return showToast?.('Agent name required', 'error');
    setLoading(true);
    const result = await window.api.addTownAgent({ ...form, Town_Name: townName });
    setLoading(false);
    if (result?.error) return showToast?.(result.error, 'error');
    showToast?.('Town agent added');
    setForm({ Agent_Name: '', Phone_Number: '', CNIC: '', Address: '', Notes: '' });
    load();
  };

  const u = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <div className="form-container mb-6">
        <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UsersIcon size={16} /> Add Town Sales Agent
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input value={form.Agent_Name} onChange={u('Agent_Name')} /></div>
            <div className="form-group"><label>Phone</label><input value={form.Phone_Number} onChange={u('Phone_Number')} /></div>
            <div className="form-group"><label>CNIC</label><input value={form.CNIC} onChange={u('CNIC')} /></div>
            <div className="form-group"><label>Address</label><input value={form.Address} onChange={u('Address')} /></div>
            <div className="form-group full"><label>Notes</label><input value={form.Notes} onChange={u('Notes')} /></div>
          </div>
          <button className="btn btn-primary" disabled={loading} style={{ marginTop: 12 }}>
            <PlusIcon size={13} /> {loading ? 'Adding...' : 'Add Agent'}
          </button>
        </form>
      </div>

      <div className="stat-cards">
        {agents.map((agent) => (
          <div className="stat-card" key={agent.Agent_ID || agent.Agent_Name}>
            <div className="card-label">Sales Agent</div>
            <div className="card-value" style={{ fontSize: 20 }}>{agent.Agent_Name}</div>
            <p style={{ color: 'var(--text-muted)', margin: '8px 0 0', fontSize: 12 }}>
              {agent.Phone_Number || 'No phone'} {agent.CNIC ? `- ${agent.CNIC}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
