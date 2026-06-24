import React, { useState, useEffect } from 'react';
import { BriefcaseIcon, UsersIcon, WarnIcon } from './Icons';

export default function CommissionTracker({ showToast, townName, refreshKey = 0 }) {
  const [sales, setSales] = useState([]);
  const [registeredAgents, setRegisteredAgents] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');

  useEffect(() => { loadData(); }, [townName, refreshKey]);

  const loadData = async () => {
    if (!window.api) { setLoading(false); return; }
    try {
      const [d, agents, commissionRes] = await Promise.all([
        window.api.getAllSales(),
        window.api.getTownAgents?.(townName),
        window.api.getCommissions?.({ status: 'pending' }),
      ]);
      if (Array.isArray(d)) setSales(d);
      setRegisteredAgents(Array.isArray(agents) ? agents : []);
      setCommissions(Array.isArray(commissionRes?.data) ? commissionRes.data : []);
    } catch(e) {
      console.error('Failed to load commission data:', e);
      showToast?.('Commission tracker data load failed', 'error');
    }
    setLoading(false);
  };

  const townFiltered = townName ? sales.filter(s => s.Town_Name === townName) : sales;

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const fmt = (n) => `PKR ${(n || 0).toLocaleString()}`;

  const normalizeAgentName = (name) => String(name || '').trim() || 'No Agent';
  const registeredAgentNames = registeredAgents
    .filter(a => !townName || !a.Town_Name || String(a.Town_Name) === String(townName))
    .map(a => a.Agent_Name)
    .filter(Boolean);
  const agents = ['all', ...Array.from(new Set([
    ...registeredAgentNames,
    ...townFiltered.map(s => normalizeAgentName(s.Agent_Name)).filter(Boolean),
  ]))];

  const filtered = townFiltered.filter(s => {
    const matchSearch = !search || [s.Agent_Name, s.Customer_Name, s.Plot_Shop_Number, s.Town_Name]
      .some(v => String(v || '').toLowerCase().includes(search.toLowerCase()));
    const matchAgent = agentFilter === 'all' || normalizeAgentName(s.Agent_Name) === agentFilter;
    return matchSearch && matchAgent;
  });

  const totalCommission = filtered.reduce((s, r) => s + (parseFloat(r.Commission_Amount) || 0), 0);
  const withCommission = filtered.filter(r => (parseFloat(r.Commission_Amount) || 0) > 0).length;
  const noCommission = filtered.length - withCommission;

  // Group by agent for summary
  const agentSummary = {};
  for (const a of registeredAgents) {
    if (townName && a.Town_Name && String(a.Town_Name) !== String(townName)) continue;
    const agent = normalizeAgentName(a.Agent_Name);
    agentSummary[agent] = {
      count: 0,
      commission: 0,
      email: '',
      phone: a.Phone_Number || '',
      isActive: String(a.Status || 'Active') === 'Active',
    };
  }
  for (const s of townFiltered) {
    const agent = normalizeAgentName(s.Agent_Name);
    if (!agentSummary[agent]) agentSummary[agent] = { count: 0, commission: 0, email: '', phone: '', isActive: true };
    agentSummary[agent].count++;
    agentSummary[agent].commission += parseFloat(s.Commission_Amount) || 0;
  }

  return (
    <div>
      {/* Summary Stats */}
      <div className="stat-cards mb-6" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div className="stat-card">
          <div className="card-label">Total Sales</div>
          <div className="card-value">{filtered.length}</div>
        </div>
        <div className="stat-card">
          <div className="card-label">With Commission</div>
          <div className="card-value" style={{ color: 'var(--accent-yellow)' }}>{withCommission}</div>
        </div>
        <div className="stat-card">
          <div className="card-label">No Commission</div>
          <div className="card-value" style={{ color: 'var(--text-muted)' }}>{noCommission}</div>
        </div>
        <div className="stat-card red">
          <div className="card-label">Total Commission Paid</div>
          <div className="card-value loss">{fmt(totalCommission)}</div>
        </div>
      </div>

      {/* Agent Summary Cards */}
      {Object.keys(agentSummary).length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            Agent-wise Commission Summary
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(agentSummary).map(([agent, data]) => {
              const pending = commissions.find(c => normalizeAgentName(c.agent_name || c.Agent_Name) === agent && (!townName || String(c.Town_Name || c.town_name || '') === String(townName)));
              return (
              <div
                key={agent}
                onClick={() => setAgentFilter(agentFilter === agent ? 'all' : agent)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: `2px solid ${agentFilter === agent ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                  background: agentFilter === agent ? '#eff4ff' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  minWidth: 160,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, display:'flex', alignItems:'center', gap:4 }}>
                  {agent === 'No Agent'
                    ? <><WarnIcon size={13}/> No Agent</>
                    : <><UsersIcon size={13}/> {agent}</>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {data.count} sale{data.count !== 1 ? 's' : ''}{data.email ? ` • ${data.email}` : ''}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: data.commission > 0 ? 'var(--accent-red)' : 'var(--text-muted)', marginTop: 4 }}>
                  {data.commission > 0 ? fmt(data.commission) : 'PKR 0'}
                </div>
                {pending && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const r = await window.api.markCommissionPaid(pending.id || pending.Commission_ID);
                      if (r?.error) showToast?.(r.error, 'error');
                      else { showToast?.('Commission paid'); loadData(); }
                    }}
                  >
                    Give Commission
                  </button>
                )}
              </div>
            );})}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder="Search by property, customer, agent, or town..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--border-color)', background: 'var(--bg-input)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
          }}
        />
        {agentFilter !== 'all' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAgentFilter('all')}>
            Clear Filter ×
          </button>
        )}
      </div>

      {/* Commission Table */}
      <div className="table-container">
        <div className="table-header">
          <h3 style={{display:'flex', alignItems:'center', gap:5}}>
            <BriefcaseIcon size={13}/> Commission Records{townName ? ` — ${townName}` : ''} ({filtered.length})
          </h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
            Total: {fmt(totalCommission)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon"><BriefcaseIcon size={36}/></div>
            <h3>No Records Found</h3>
            <p>No commission records match your search.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Property</th>
                  <th>Town</th>
                  <th>Customer Name</th>
                  <th>Agent Name</th>
                  <th>Sale Date</th>
                  <th>Total Amount</th>
                  <th>Commission %</th>
                  <th>Commission (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const commAmt = parseFloat(s.Commission_Amount) || 0;
                  const commRate = parseFloat(s.Commission_Rate) || 0;
                  const total = parseFloat(s.Total_Amount_PKR) || 0;
                  const displayRate = commRate > 0 ? commRate : (total > 0 && commAmt > 0 ? ((commAmt / total) * 100).toFixed(1) : 0);

                  return (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {s.Type}
                          <span style={{
                            marginLeft: 6, color: 'var(--accent-blue)',
                            background: '#eff4ff', padding: '1px 7px', borderRadius: 8, fontSize: 11
                          }}>
                            {s.Plot_Shop_Number}
                          </span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{s.Town_Name || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{s.Customer_Name || '-'}</td>
                      <td>
                        {s.Agent_Name ? (
                          <span style={{
                            background: '#eff4ff', color: 'var(--accent-blue)',
                            padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                            display: 'inline-block'
                          }}>
                            {s.Agent_Name}
                          </span>
                        ) : (
                          <span style={{
                            background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                            padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                            display: 'inline-block'
                          }}>
                            No Agent
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{s.Sell_Date || s.Sale_Date || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(total)}</td>
                      <td>
                        <span style={{
                          background: displayRate > 0 ? 'rgba(249,115,22,0.1)' : 'var(--bg-secondary)',
                          color: displayRate > 0 ? 'var(--accent-orange, #f97316)' : 'var(--text-muted)',
                          padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                          display: 'inline-block'
                        }}>
                          {displayRate > 0 ? `${displayRate}%` : '0%'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontWeight: 800,
                          color: commAmt > 0 ? 'var(--accent-red)' : 'var(--text-muted)',
                          fontSize: 13
                        }}>
                          {commAmt > 0 ? fmt(commAmt) : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-hover)', fontWeight: 700 }}>
                  <td colSpan={6}>TOTAL</td>
                  <td>{fmt(filtered.reduce((s, r) => s + (parseFloat(r.Total_Amount_PKR) || 0), 0))}</td>
                  <td>—</td>
                  <td style={{ color: 'var(--accent-red)', fontWeight: 800 }}>{fmt(totalCommission)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
