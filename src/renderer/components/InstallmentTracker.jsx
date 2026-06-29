import React, { useState, useEffect, useRef } from 'react';
import { CalendarIcon, PlotIcon, ShopIcon, UsersIcon, BellIcon } from './Icons';
import { useAuth } from '../contexts/AuthContext';

export default function InstallmentTracker({ showToast, townName, panel, refreshKey = 0 }) {
  const { userProfile } = useAuth();
  const [installments, setInstallments] = useState([]);
  const [dueReport, setDueReport] = useState(null);
  const [reportFrom, setReportFrom] = useState(new Date().toISOString().split('T')[0]);
  const [reportTo, setReportTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [reportBusy, setReportBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [extendModal, setExtendModal] = useState(null); // item being extended
  const [extendDate, setExtendDate] = useState('');
  const notifiedRef = useRef('');

  useEffect(() => { loadData(); }, [townName, refreshKey]);
  useEffect(() => { loadDueReport(); }, [townName, reportFrom, reportTo, refreshKey]);
  const loadData = async () => {
    if (!window.api) { setLoading(false); return; }
    try { const d = await window.api.getInstallments(); if (Array.isArray(d)) setInstallments(d); } catch(e) {}
    setLoading(false);
  };

  const loadDueReport = async () => {
    if (!window.api?.getDueInstallmentsReport) return;
    try {
      const res = await window.api.getDueInstallmentsReport({ townName, fromDate: reportFrom, toDate: reportTo, leadDays: 7 });
      if (res?.error) throw new Error(res.error);
      setDueReport(res);
      const count = res?.summary?.count || 0;
      const key = `${townName || 'all'}:${reportFrom}:${reportTo}:${count}`;
      if (count > 0 && notifiedRef.current !== key) {
        notifiedRef.current = key;
        window.api?.showNotification?.(
          'Installment reminders',
          `${count} installment(s) due/overdue between ${reportFrom} and ${reportTo}`
        );
      }
    } catch (e) {
      showToast?.(e.message || 'Due installment report failed', 'error');
    }
  };

  const exportDueReport = async (kind) => {
    if (!window.api?.exportDueInstallmentsReport) return;
    setReportBusy(true);
    try {
      const res = await window.api.exportDueInstallmentsReport({ townName, fromDate: reportFrom, toDate: reportTo, leadDays: 7 });
      if (res?.error) throw new Error(res.error);
      setDueReport(res.report);
      const file = kind === 'excel' ? res.excelPath : res.pdfPath || res.htmlPath;
      await window.api.openReportFile?.(file);
      showToast?.(`${kind === 'excel' ? 'Excel' : 'PDF'} due installment report ready`);
    } catch (e) {
      showToast?.(e.message || 'Due installment export failed', 'error');
    } finally {
      setReportBusy(false);
    }
  };

  const handlePay = async (item) => {
    try {
      const r = await window.api.markInstallmentPaid({ Tracker_ID: item.Tracker_ID });
      if (r?.error) showToast(r.error, 'error');
      else { showToast('Installment marked as paid!'); loadData(); }
    } catch(e) { showToast('Failed', 'error'); }
  };

  const handleExtend = (item) => {
    setExtendDate(item.Due_Date || new Date().toISOString().split('T')[0]);
    setExtendModal(item);
  };

  const confirmExtend = async () => {
    if (!extendModal || !extendDate) return;
    try {
      const r = await window.api.extendInstallmentDate({ Tracker_ID: extendModal.Tracker_ID, New_Due_Date: extendDate });
      if (r?.error) showToast(r.error, 'error');
      else { showToast('Due date extended successfully!'); setExtendModal(null); loadData(); }
    } catch(e) { showToast('Failed to extend date', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const today = new Date().toISOString().split('T')[0];
  const display = installments
    .filter(i => townName ? i.Town_Name === townName : true)
    .filter(i => (panel === 'employee' && userProfile?.full_name) ? i.Agent_Name === userProfile.full_name : true)
    .map(i => {
      const s = (i.Status || '').toLowerCase();
      if (s !== 'paid' && i.Due_Date && i.Due_Date < today) return { ...i, Status: 'Overdue' };
      return i;
    });

  const leadDate = new Date();
  leadDate.setDate(leadDate.getDate() + 7);
  const leadStr = leadDate.toISOString().split('T')[0];
  const unpaidRows = display.filter((i) => String(i.Status || '').toLowerCase() !== 'paid');
  const reminderStats = unpaidRows.reduce((acc, row) => {
    const amount = parseFloat(row.Monthly_Amount) || parseFloat(row.Due_Amount) || 0;
    acc.pendingCount += 1;
    acc.pendingAmount += amount;
    if (row.Due_Date && row.Due_Date < today) {
      acc.overdueCount += 1;
      acc.overdueAmount += amount;
    } else if (row.Due_Date && row.Due_Date <= leadStr) {
      acc.dueSoonCount += 1;
      acc.dueSoonAmount += amount;
    } else {
      acc.futureCount += 1;
      acc.futureAmount += amount;
    }
    return acc;
  }, { pendingCount: 0, pendingAmount: 0, overdueCount: 0, overdueAmount: 0, dueSoonCount: 0, dueSoonAmount: 0, futureCount: 0, futureAmount: 0 });

  // Group by property key
  const groupKey = (i) => `${i.Type}|${i.Plot_Shop_Number}|${i.Town_Name}`;
  const groups = new Map();
  for (const inst of display) {
    const k = groupKey(inst);
    if (!groups.has(k)) {
      groups.set(k, { key: k, type: inst.Type, number: inst.Plot_Shop_Number, town: inst.Town_Name, customer: inst.Customer_Name, phone: inst.Phone_Number, items: [] });
    }
    groups.get(k).items.push(inst);
  }

  // Sort each group's items by month number
  for (const g of groups.values()) {
    g.items.sort((a, b) => (parseInt(a.Month_Number) || 0) - (parseInt(b.Month_Number) || 0));
    g.totalMonths = g.items.length;
    g.paidCount = g.items.filter(x => (x.Status || '').toLowerCase() === 'paid').length;
    g.dueCount = g.items.filter(x => (x.Status || '').toLowerCase() === 'due' || (x.Status || '').toLowerCase() === 'overdue').length;
    g.monthlyAmount = parseFloat(g.items[0]?.Monthly_Amount) || 0;
    g.totalPaid = g.items.filter(x => (x.Status || '').toLowerCase() === 'paid').reduce((s, x) => s + (parseFloat(x.Monthly_Amount) || 0), 0);
    g.totalDue = g.items.filter(x => (x.Status || '').toLowerCase() !== 'paid').reduce((s, x) => s + (parseFloat(x.Monthly_Amount) || 0), 0);
  }

  const allGroups = Array.from(groups.values());

  // Filter groups based on filter
  const filteredGroups = filter === 'all' ? allGroups : allGroups.filter(g => {
    if (filter === 'paid') return g.paidCount === g.totalMonths;
    if (filter === 'due') return g.dueCount > 0;
    if (filter === 'overdue') return g.items.some(x => (x.Status || '').toLowerCase() === 'overdue');
    return true;
  });

  const paidCount = display.filter(i => (i.Status||'').toLowerCase() === 'paid').length;
  const dueCount = display.filter(i => (i.Status||'').toLowerCase() === 'due').length;
  const overdueCount = display.filter(i => (i.Status||'').toLowerCase() === 'overdue').length;

  const fmt = (n) => `PKR ${(n || 0).toLocaleString()}`;

  return (
    <div>
      {/* ─── Extend Date Modal ─── */}
      {extendModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 14, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.18)'
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Extend Due Date</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
              {extendModal.Type} {extendModal.Plot_Shop_Number} — Month {extendModal.Month_Number}/{extendModal.Total_Months}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>New Due Date</label>
              <input
                type="date"
                value={extendDate}
                onChange={e => setExtendDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                  color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setExtendModal(null)}>Cancel</button>
              <button className="btn btn-warning" onClick={confirmExtend} disabled={!extendDate}>
                Confirm Extension
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="stat-cards mb-6">
        <div className="stat-card green"><div className="card-label">Paid</div><div className="card-value profit">{paidCount}</div></div>
        <div className="stat-card"><div className="card-label">Due</div><div className="card-value" style={{color:'var(--accent-yellow)'}}>{dueCount}</div></div>
        <div className="stat-card red"><div className="card-label">Overdue</div><div className="card-value loss">{overdueCount}</div></div>
        <div className="stat-card purple"><div className="card-label">Properties</div><div className="card-value">{allGroups.length}</div></div>
      </div>

      <div className="installment-reminder-panel">
        <div className="installment-reminder-head">
          <div>
            <div className="installment-reminder-kicker">7 Day Reminder Report</div>
            <h3>Upcoming / Overdue Installments</h3>
            <p>Due date se 7 din pehle local notification, list, PDF aur Excel report.</p>
          </div>
          <div className="installment-reminder-actions">
            <input type="date" value={reportFrom} max={reportTo} onChange={(e) => setReportFrom(e.target.value)} />
            <span>to</span>
            <input type="date" value={reportTo} min={reportFrom} onChange={(e) => setReportTo(e.target.value)} />
            <button className="btn btn-ghost" disabled={reportBusy} onClick={() => exportDueReport('pdf')}>PDF</button>
            <button className="btn btn-primary" disabled={reportBusy} onClick={() => exportDueReport('excel')}>Excel</button>
          </div>
        </div>
        <div className="installment-reminder-stats">
          <div><span>Total Pending Rows</span><b>{reminderStats.pendingCount}</b></div>
          <div><span>Total Pending Amount</span><b>{fmt(reminderStats.pendingAmount)}</b></div>
          <div><span>Overdue</span><b className="danger">{reminderStats.overdueCount}</b></div>
          <div><span>Due Soon 7 Days</span><b className="warn">{reminderStats.dueSoonCount}</b></div>
          <div><span>Future Pending</span><b>{reminderStats.futureCount}</b></div>
          <div><span>Report Range Rows</span><b>{dueReport?.summary?.count || 0}</b></div>
        </div>
        <div className="installment-due-list">
          {(dueReport?.rows || []).slice(0, 8).map((row, index) => (
            <div key={`${row.trackerId || index}`} className={`installment-due-row ${row.status === 'Overdue' ? 'overdue' : ''}`}>
              <div>
                <strong>{row.property}</strong>
                <span>{row.customer || '-'} | {row.townName || townName || '-'}</span>
              </div>
              <div>{row.dueDate}</div>
              <div>{fmt(row.amount)}</div>
              <b>{row.status}</b>
            </div>
          ))}
          {!(dueReport?.rows || []).length && <div className="empty-state" style={{ padding: 18 }}><p>No installments due in this range.</p></div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('all')}>All</button>
        <button className={`btn ${filter === 'due' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('due')}>Due</button>
        <button className={`btn ${filter === 'overdue' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('overdue')}>Overdue</button>
        <button className={`btn ${filter === 'paid' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('paid')}>Paid</button>
      </div>

      <div className="table-container">
        <div className="table-header"><h3 style={{display:'flex',alignItems:'center',gap:6}}><CalendarIcon/> Installment Properties ({filteredGroups.length})</h3></div>
        {filteredGroups.length === 0 ? <div className="empty-state"><p>No installments found.</p></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
            {filteredGroups.map((g) => {
              const isExpanded = expandedKey === g.key;
              const hasOverdue = g.items.some(x => (x.Status || '').toLowerCase() === 'overdue');
              const allPaid = g.paidCount === g.totalMonths;
              const progressPct = g.totalMonths > 0 ? Math.round((g.paidCount / g.totalMonths) * 100) : 0;

              return (
                <div key={g.key} style={{
                  border: `1px solid ${hasOverdue ? 'var(--accent-red, #ef4444)' : allPaid ? 'var(--accent-green, #10b981)' : 'var(--border-color, #e2e8f0)'}`,
                  borderRadius: 12,
                  background: 'var(--bg-card, #fff)',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s',
                  boxShadow: isExpanded ? '0 4px 20px rgba(0,0,0,0.08)' : 'none',
                }}>
                  {/* Property Header — Click to expand */}
                  <div
                    onClick={() => setExpandedKey(isExpanded ? null : g.key)}
                    style={{
                      padding: '14px 18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      background: isExpanded ? 'var(--bg-hover, #f8fafc)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                      {/* Property Icon */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 10,
                        background: g.type === 'Plot' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0,
                      }}>
                        {g.type === 'Plot' ? <PlotIcon size={18}/> : <ShopIcon size={18}/>}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                          {g.type} {g.number}
                          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>{g.town}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, display:'flex', alignItems:'center', gap:4 }}>
                          <UsersIcon size={12}/> {g.customer} {g.phone ? `\u2022 ${g.phone}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Summary chips */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>PAID</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-green, #10b981)' }}>{fmt(g.totalPaid)}</div>
                      </div>
                      <div style={{ width: 1, height: 28, background: 'var(--border-color)' }} />
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>DUES</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: g.totalDue > 0 ? 'var(--accent-red, #ef4444)' : 'var(--text-muted)' }}>{fmt(g.totalDue)}</div>
                      </div>
                      <div style={{ width: 1, height: 28, background: 'var(--border-color)' }} />
                      <div style={{ textAlign: 'center', minWidth: 50 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>PROGRESS</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{g.paidCount}/{g.totalMonths}</div>
                      </div>
                      <div style={{ fontSize: 18, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 3, background: 'var(--bg-secondary, #f1f5f9)' }}>
                    <div style={{
                      height: '100%',
                      width: `${progressPct}%`,
                      background: allPaid ? 'var(--accent-green, #10b981)' : 'var(--accent-blue, #3b82f6)',
                      transition: 'width 0.3s',
                      borderRadius: 2,
                    }} />
                  </div>

                  {/* Expanded: individual installments */}
                  {isExpanded && (
                    <div style={{ padding: '0 4px 8px' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ marginBottom: 0 }}>
                          <thead>
                            <tr>
                              <th>Month</th>
                              <th>Amount</th>
                              <th>Due Date</th>
                              <th>Paid Date</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.items.map((item, idx) => {
                              const status = (item.Status || '').toLowerCase();
                              return (
                                <tr key={idx}>
                                  <td style={{ fontWeight: 600 }}>{item.Month_Number}/{item.Total_Months}</td>
                                  <td>{fmt(parseFloat(item.Monthly_Amount) || 0)}</td>
                                  <td>{item.Due_Date || '-'}</td>
                                  <td>{item.Paid_Date || '-'}</td>
                                  <td><span className={`status-badge status-${status}`}>{item.Status}</span></td>
                                  <td>{status !== 'paid' && (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                      <button
                                        className="btn btn-success btn-sm"
                                        onClick={(e) => { e.stopPropagation(); handlePay(item); }}
                                        style={{ whiteSpace: 'nowrap', minWidth: 60 }}
                                      >
                                        Pay
                                      </button>
                                      <button
                                        className="btn btn-warning btn-sm"
                                        onClick={(e) => { e.stopPropagation(); handleExtend(item); }}
                                        style={{ whiteSpace: 'nowrap', minWidth: 90 }}
                                      >
                                        Extend Date
                                      </button>
                                    </div>
                                  )}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
