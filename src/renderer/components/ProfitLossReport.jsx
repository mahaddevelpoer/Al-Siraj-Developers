import React, { useState, useEffect } from 'react';
import { WalletIcon, TrendUpIcon, ChartIcon, RulerIcon, SoldIcon } from './Icons';

export default function ProfitLossReport() {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadReport(); }, []);

  const loadReport = async () => {
    if (!window.api) { setLoading(false); return; }
    try {
      const d = await window.api.getProfitLossReport();
      if (Array.isArray(d)) setReport(d);
    } catch (e) {}
    setLoading(false);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const fmt = (n) => `PKR ${(n || 0).toLocaleString()}`;

  const totalIncome       = report.reduce((s, r) => s + (r.Total_Income || 0), 0);
  const totalCommission   = report.reduce((s, r) => s + (r.Commission || 0), 0);
  const totalOpEx         = report.reduce((s, r) => s + (r.Operation_Expenses || 0), 0);
  const totalCeoEx        = report.reduce((s, r) => s + (r.CEO_Expenses || 0), 0);
  const totalSalary       = report.reduce((s, r) => s + (r.CEO_Salary || 0), 0);
  const totalDeductions   = report.reduce((s, r) => s + (r.Total_Expenses || 0), 0);
  const netPL             = totalIncome - totalDeductions;

  return (
    <div>
      {/* ─── Summary Cards ─── */}
      <div className="stat-cards mb-6" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="stat-card green">
          <div className="card-icon"><WalletIcon size={16}/></div>
          <div className="card-label">Total Received (Income)</div>
          <div className="card-value profit">{fmt(totalIncome)}</div>
          <div className="card-sub">Advance + Paid Installments</div>
        </div>
        <div className="stat-card red">
          <div className="card-icon"><ChartIcon size={16}/></div>
          <div className="card-label">Total Deductions</div>
          <div className="card-value loss">{fmt(totalDeductions)}</div>
          <div className="card-sub">Commission + Expenses + CEO</div>
        </div>
        <div className={`stat-card ${netPL >= 0 ? 'green' : 'red'}`}>
          <div className="card-icon"><TrendUpIcon size={16}/></div>
          <div className="card-label">Net Company P / L</div>
          <div className={`card-value ${netPL >= 0 ? 'profit' : 'loss'}`}>{fmt(netPL)}</div>
          <div className="card-sub">{netPL >= 0 ? 'Profitable' : 'In Loss'}</div>
        </div>
      </div>

      {/* ─── Deductions Breakdown ─── */}
      <div className="stat-cards mb-6" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div className="stat-card">
          <div className="card-label">Agent Commission</div>
          <div className="card-value loss">{fmt(totalCommission)}</div>
        </div>
        <div className="stat-card">
          <div className="card-label">Operation Expenses</div>
          <div className="card-value loss">{fmt(totalOpEx)}</div>
        </div>
        <div className="stat-card">
          <div className="card-label">CEO Expenses</div>
          <div className="card-value loss">{fmt(totalCeoEx)}</div>
        </div>
        <div className="stat-card">
          <div className="card-label">CEO Salary</div>
          <div className="card-value" style={{ color: 'var(--accent-orange, #f97316)' }}>{fmt(totalSalary)}</div>
        </div>
      </div>

      {/* ─── Calculation Breakdown Note ─── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: '14px 18px',
        marginBottom: 20,
        fontSize: 13,
        color: 'var(--text-muted)',
        lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--text-primary)', display:'flex', alignItems:'center', gap:5 }}><RulerIcon size={13}/> Calculation Formula:</strong><br />
        <span className="text-green">Income</span> = Advance Received + All Paid Installments (actual cash in hand)<br />
        <span className="text-red">Deductions</span> = Agent Commission + Operation Expenses + CEO Expenses + CEO Salary<br />
        <span style={{ color: netPL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>Net P/L</span> = Income − Deductions
      </div>

      {/* ─── Town-wise Table ─── */}
      <div className="table-container">
        <div className="table-header">
          <h3 style={{display:'flex',alignItems:'center',gap:5}}><SoldIcon size={13}/> Town-wise Profit / Loss Report</h3>
        </div>
        {report.length === 0
          ? <div className="empty-state"><p>No data available. Please add towns and sales first.</p></div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Town</th>
                    <th>Income (Received)</th>
                    <th>Commission</th>
                    <th>Operation Expenses</th>
                    <th>CEO Expenses</th>
                    <th>CEO Salary</th>
                    <th>Total Deductions</th>
                    <th>Net P / L</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.Town_Name}</td>
                      <td className="text-green">{fmt(r.Total_Income || 0)}</td>
                      <td className="text-red">{fmt(r.Commission || 0)}</td>
                      <td className="text-red">{fmt(r.Operation_Expenses || 0)}</td>
                      <td className="text-red">{fmt(r.CEO_Expenses || 0)}</td>
                      <td style={{ color: 'var(--accent-orange, #f97316)', fontWeight: 600 }}>{fmt(r.CEO_Salary || 0)}</td>
                      <td className="text-red" style={{ fontWeight: 600 }}>{fmt(r.Total_Expenses || 0)}</td>
                      <td className={(r.Net_Profit_Loss || 0) >= 0 ? 'text-green' : 'text-red'} style={{ fontWeight: 700 }}>
                        {fmt(r.Net_Profit_Loss || 0)}
                      </td>
                      <td>
                        <span className={`status-badge ${(r.Net_Profit_Loss || 0) >= 0 ? 'status-active' : 'status-overdue'}`}>
                          {(r.Net_Profit_Loss || 0) >= 0 ? 'Profit' : 'Loss'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals Row */}
                <tfoot>
                  <tr style={{ background: 'var(--bg-hover)', fontWeight: 700 }}>
                    <td>TOTAL</td>
                    <td className="text-green">{fmt(totalIncome)}</td>
                    <td className="text-red">{fmt(totalCommission)}</td>
                    <td className="text-red">{fmt(totalOpEx)}</td>
                    <td className="text-red">{fmt(totalCeoEx)}</td>
                    <td style={{ color: 'var(--accent-orange, #f97316)' }}>{fmt(totalSalary)}</td>
                    <td className="text-red">{fmt(totalDeductions)}</td>
                    <td className={netPL >= 0 ? 'text-green' : 'text-red'}>{fmt(netPL)}</td>
                    <td>
                      <span className={`status-badge ${netPL >= 0 ? 'status-active' : 'status-overdue'}`}>
                        {netPL >= 0 ? 'Profit' : 'Loss'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
