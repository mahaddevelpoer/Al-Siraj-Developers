import React, { useState, useEffect } from 'react';
import { Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, ArcElement, PointElement, LineElement, Filler, Title, Tooltip, Legend } from 'chart.js';
import { useLang } from '../LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import PendingCollections from './PendingCollections';

ChartJS.register(CategoryScale, LinearScale, ArcElement, PointElement, LineElement, Filler, Title, Tooltip, Legend);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#94a3b8', font: { size: 12 } } } },
  scales: { x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(42,49,80,0.3)' } }, y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(42,49,80,0.3)' } } },
};

const fmt = (n) => `PKR ${(n || 0).toLocaleString()}`;
const APPEAL_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

function AgentDashboard({ sales }) {
  const { t } = useLang();
  const { userProfile, user } = useAuth();
  const agentName = userProfile?.full_name || 'Agent';
  const [agentTab, setAgentTab] = useState('overview');
  const [pendingAppeals, setPendingAppeals] = useState([]);
  const [loadingAppeals, setLoadingAppeals] = useState(false);
  const [lastAppealTimes, setLastAppealTimes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agent_appeal_times') || '{}'); }
    catch { return {}; }
  });
  const [appealMsg, setAppealMsg] = useState(null);

  const mySales = sales.filter(s => {
    const type = String(s.Type || '').trim().toLowerCase();
    return (type === 'plot' || type === 'shop') &&
      s.Agent_Name &&
      s.Agent_Name.toLowerCase() === agentName.toLowerCase();
  });

  const totalSold = mySales.length;
  // Agent view: "Received Amount" = total money actually received from customers (advance + paid installments, or full for lump sum)
  // "Income" = commission only (agent's actual earnings)
  const totalReceived = mySales.reduce((s, r) => {
    const total = parseFloat(r.Total_Amount_PKR) || 0;
    const advance = parseFloat(r.Advance_Amount_PKR) || 0;
    const instMonths = parseInt(r.Total_Installments) || 0;
    if (instMonths > 0) {
      return s + advance; // advance only; installments tracked separately
    }
    const received = parseFloat(r.Received_Amount) || 0;
    const remaining = parseFloat(r.Remaining_Amount) || 0;
    if (received > 0) return s + received;
    return s + (remaining > 0 ? advance : total);
  }, 0);
  // Agent's actual income is the commission they earn
  const totalIncome = mySales.reduce((s, r) => s + (parseFloat(r.Commission_Amount) || 0), 0);
  // Pending income for agent = remaining commission to be earned (total commission - received commission)
  const totalCommissionExpected = mySales.reduce((s, r) => s + (parseFloat(r.Commission_Amount) || 0), 0);
  const pendingIncome = Math.max(0, totalCommissionExpected - totalIncome);

  useEffect(() => {
    if (agentTab === 'pendings' && user?.id) {
      loadPendingAppeals();
    }
  }, [agentTab, user?.id]);

  const loadPendingAppeals = async () => {
    setLoadingAppeals(true);
    try {
      const { data, error } = await supabase
        .from('appeals')
        .select('*')
        .eq('requested_by_user_id', user.id)
        .eq('appeal_type', 'custom_installment_plan')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (!error) setPendingAppeals(data || []);
    } catch (e) { /* silent */ }
    setLoadingAppeals(false);
  };

  const handleAppeal = async (appeal) => {
    const appealId = appeal.id;
    const now = Date.now();
    const lastTime = lastAppealTimes[appealId] || 0;
    if (now - lastTime < APPEAL_COOLDOWN_MS) {
      const remaining = Math.ceil((APPEAL_COOLDOWN_MS - (now - lastTime)) / 60000);
      setAppealMsg({ type: 'error', text: `Please wait ${remaining} min before next appeal` });
      setTimeout(() => setAppealMsg(null), 3000);
      return;
    }

    const otpCode = Math.random().toString().substring(2, 8);
    try {
      await supabase.from('appeals').update({ otp_code: otpCode }).eq('id', appealId);

      if (window.api?.sendInstallmentOtpEmail) {
        window.api.sendInstallmentOtpEmail({
          otpCode,
          agentName,
          agentTown: appeal.requested_data?.town || '',
          propertyType: appeal.entity_type,
          propertyNumber: appeal.entity_id,
          customerName: appeal.requested_data?.customer_name || '',
          totalInstallments: appeal.requested_data?.total_installments || 0,
          monthlyInstallment: appeal.requested_data?.monthly_installment || 0,
        }).catch(() => {});
      }

      const updatedTimes = { ...lastAppealTimes, [appealId]: now };
      setLastAppealTimes(updatedTimes);
      localStorage.setItem('agent_appeal_times', JSON.stringify(updatedTimes));
      setAppealMsg({ type: 'success', text: 'Appeal sent! OTP re-sent to CEO email.' });
      setTimeout(() => setAppealMsg(null), 3000);
    } catch (e) {
      setAppealMsg({ type: 'error', text: 'Failed to send appeal' });
      setTimeout(() => setAppealMsg(null), 3000);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-overview">
        <div>
          <h3>Agent Dashboard</h3>
          <p>Welcome, <strong>{agentName}</strong></p>
        </div>
        <div className="dashboard-toolbar">
          <span className="header-chip">{new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['overview', 'collections', 'pendings'].map(tab => (
          <button key={tab} onClick={() => setAgentTab(tab)}
            style={{
              padding: '10px 20px', border: 'none', borderRadius: 'var(--radius-md)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize',
              background: agentTab === tab ? 'var(--accent-blue)' : 'var(--border-color)',
              color: agentTab === tab ? 'white' : 'var(--text-primary)',
              transition: 'all 0.15s',
            }}
          >
            {tab === 'overview' ? '\u{1F4CA} Overview' : tab === 'collections' ? '\u{1F4B0} Collections' : '\u23F3 Pendings'}
            {tab === 'pendings' && pendingAppeals.length > 0 && (
              <span style={{ marginLeft: 6, background: '#ef4444', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>
                {pendingAppeals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toast Messages */}
      {appealMsg && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
          background: appealMsg.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: appealMsg.type === 'success' ? '#065f46' : '#991b1b',
          fontWeight: 600, fontSize: 13, border: `1px solid ${appealMsg.type === 'success' ? '#6ee7b7' : '#fecaca'}`,
        }}>
          {appealMsg.type === 'success' ? '✅ ' : '❌ '}{appealMsg.text}
        </div>
      )}

      {agentTab === 'overview' && (
        <>
          <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <div className="kpi-item">
              <div className="kpi-label">Properties Sold</div>
              <div className="kpi-value">{totalSold}</div>
              <div className="kpi-sub">Total by you</div>
            </div>
            <div className="kpi-item">
              <div className="kpi-label">Received Amount</div>
              <div className="kpi-value" style={{ color: '#3b82f6' }}>{fmt(totalReceived)}</div>
              <div className="kpi-sub">Customer payments</div>
            </div>
            <div className="kpi-item">
              <div className="kpi-label">My Income (Commission)</div>
              <div className="kpi-value pos">{fmt(totalIncome)}</div>
              <div className="kpi-sub">Your earnings</div>
            </div>
            <div className="kpi-item">
              <div className="kpi-label">Pending Commission</div>
              <div className="kpi-value" style={{ color: 'var(--accent-orange, #f97316)' }}>{fmt(pendingIncome)}</div>
              <div className="kpi-sub">Awaiting payment</div>
            </div>
          </div>

          <div className="dashboard-bottom-grid">
            <div className="table-container">
              <div className="table-header">
                <h3>My Recent Sales</h3>
              </div>
              {mySales.length === 0 ? (
                <div className="empty-state"><p>No sales yet. Sell your first property!</p></div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Type</th><th>Number</th><th>Town</th><th>Customer</th><th>Amount</th><th>Date</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mySales.slice().reverse().slice(0, 10).map((item, i) => (
                        <tr key={i}>
                          <td>{item.Type}</td>
                          <td style={{fontWeight:600}}>{item.Plot_Shop_Number || item.Plot_Number || item.Shop_Number}</td>
                          <td>{item.Town_Name}</td>
                          <td>{item.Customer_Name}</td>
                          <td>{fmt(item.Total_Amount_PKR)}</td>
                          <td>{item.Sell_Date}</td>
                          <td><span className="status-badge status-active">{item.Status || 'Sold'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {agentTab === 'collections' && (
        <PendingCollections roleView="agent" />
      )}

      {agentTab === 'pendings' && (
        <div className="table-container">
          <div className="table-header">
            <h3>⏳ Pending CEO Approvals — Installment Plans</h3>
          </div>
          {loadingAppeals ? (
            <div className="empty-state"><p>Loading...</p></div>
          ) : pendingAppeals.length === 0 ? (
            <div className="empty-state"><p>No pending installment plan approvals.</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Property</th><th>Town</th><th>Customer</th><th>Installments</th><th>Amount</th><th>Date</th><th>Cooldown</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingAppeals.map((item) => {
                    const rd = item.requested_data || {};
                    const lastTime = lastAppealTimes[item.id] || 0;
                    const elapsed = Date.now() - lastTime;
                    const canAppeal = elapsed >= APPEAL_COOLDOWN_MS;
                    const cooldownRemaining = canAppeal ? 0 : Math.ceil((APPEAL_COOLDOWN_MS - elapsed) / 60000);

                    return (
                      <tr key={item.id}>
                        <td style={{fontWeight:600}}>{item.entity_type} #{item.entity_id}</td>
                        <td>{rd.town || ''}</td>
                        <td>{rd.customer_name || ''}</td>
                        <td>{rd.total_installments || 0}</td>
                        <td>PKR {(parseFloat(rd.monthly_installment) || 0).toLocaleString()}/month</td>
                        <td>{new Date(item.created_at).toLocaleDateString()}</td>
                        <td>
                          {canAppeal ? (
                            <span style={{color:'#16a34a', fontWeight:600, fontSize:12}}>Ready</span>
                          ) : (
                            <span style={{color:'#dc2626', fontWeight:600, fontSize:12}}>{cooldownRemaining}m</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-warning btn-sm"
                            disabled={!canAppeal}
                            onClick={() => handleAppeal(item)}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            ⏳ Appeal
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ onNavigate, panel }) {
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const { userProfile } = useAuth();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    if (!window.api) { setLoading(false); return; }
    try {
      const [data, allSales] = await Promise.all([
        window.api.getDashboardStats(),
        window.api.getAllSales(),
      ]);
      if (data && !data.error) setStats(data);
      if (Array.isArray(allSales)) setSales(allSales);
    } catch (e) { /* silent */ }
    setLoading(false);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  // ─── Agent Dashboard ────────────────────────────────────────────────────
  if (panel === 'employee') {
    return <AgentDashboard sales={sales} />;
  }

  // ─── CEO Dashboard ──────────────────────────────────────────────────────
  const s = stats || { totalIncome: 0, totalExpenses: 0, netProfitLoss: 0, soldPlots: 0, soldShops: 0, totalTowns: 0, townPerformance: [] };

  const timelineSource = (s.townPerformance || []).slice(0, 6);
  const incomeTrendData = {
    labels: timelineSource.map(t => t.name),
    datasets: [
      { label: 'Income', data: timelineSource.map(t => t.income || 0), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.18)', fill: true, tension: 0.35 },
      { label: 'Expenses', data: timelineSource.map(t => t.expenses || 0), borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.12)', fill: true, tension: 0.35 },
    ],
  };

  const doughnutData = {
    labels: ['Income', 'Expenses'],
    datasets: [{ data: [s.totalIncome, s.totalExpenses], backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(239,68,68,0.8)'], borderWidth: 0 }],
  };

  const performanceTotal = (s.townPerformance || []).reduce((acc, item) => acc + (item.income || 0), 0);
  const recentSales = [...sales]
    .sort((a, b) => new Date(b.Sell_Date || b.Sale_Date || b.Date || 0) - new Date(a.Sell_Date || a.Sale_Date || a.Date || 0))
    .slice(0, 5);

  return (
    <div className="dashboard-page">
      <div className="dashboard-overview">
        <div>
          <h3>{t.dashboardOverview}</h3>
          <p>{t.dashboardWelcome}</p>
        </div>
        <div className="dashboard-toolbar">
          <span className="header-chip">All Towns</span>
          <span className="header-chip">{new Date().toLocaleDateString()}</span>
        </div>
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(6, minmax(0,1fr))' }}>
        <div className="kpi-item">
          <div className="kpi-label">{t.totalIncome}</div>
          <div className="kpi-value pos">{fmt(s.totalIncome)}</div>
          <div className="kpi-sub">{t.actualCashReceived}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">{t.totalExpenses}</div>
          <div className="kpi-value neg">{fmt(s.totalExpenses)}</div>
          <div className="kpi-sub" style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }}>{t.ceoEmployee}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">{t.commissionPaid}</div>
          <div className="kpi-value" style={{ color: 'var(--accent-orange, #f97316)' }}>{fmt(s.totalCommission || 0)}</div>
          <div className="kpi-sub">{t.agentCommission}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">{t.netProfitLoss}</div>
          <div className={`kpi-value ${s.netProfitLoss >= 0 ? 'pos' : 'neg'}`}>{fmt(s.netProfitLoss)}</div>
          <div className="kpi-sub">{s.netProfitLoss >= 0 ? t.profitPosition : t.lossPosition}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">{t.plotsSold}</div>
          <div className="kpi-value">{s.soldPlots}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">{t.shopsSold}</div>
          <div className="kpi-value">{s.soldShops}</div>
        </div>
      </div>

      <div className="charts-grid dashboard-main-grid">
        <div className="chart-card">
          <div className="section-header">
            <h3>{t.incomeVsExpenses}</h3>
            <span>{t.thisMonth}</span>
          </div>
          <div style={{ height: 300 }}>
            {timelineSource.length > 0 ? <Line data={incomeTrendData} options={chartOptions} /> : <div className="empty-state"><p>{t.noTownData}</p></div>}
          </div>
        </div>
        <div className="chart-card">
          <div className="section-header">
            <h3>{t.townPerformance}</h3>
            <span>{t.distribution}</span>
          </div>
          <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {s.totalIncome > 0 || s.totalExpenses > 0 ? <Doughnut data={doughnutData} options={{ ...chartOptions, scales: undefined }} /> : <div className="empty-state"><p>{t.noFinancialData}</p></div>}
          </div>
          <div className="town-performance-list">
            {(s.townPerformance || []).map((town, index) => {
              const pct = performanceTotal ? Math.round(((town.income || 0) / performanceTotal) * 100) : 0;
              return (
                <div className="town-row" key={`${town.name}-${index}`}>
                  <span>{town.name}</span>
                  <span>{pct}%</span>
                  <strong>{fmt(town.income || 0)}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="dashboard-bottom-grid">
        <div className="table-container">
          <div className="table-header">
            <h3>{t.recentSales}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('soldProperties')}>{t.viewAll}</button>
          </div>
          {recentSales.length === 0 ? <div className="empty-state"><p>{t.noSalesFound}</p></div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>{t.type}</th><th>{t.propertyNo}</th><th>{t.town}</th><th>{t.customer}</th><th>{t.amount}</th><th>{t.date}</th><th>{t.agent}</th><th>{t.status}</th></tr></thead>
                <tbody>{recentSales.map((item, index) => (
                  <tr key={index}>
                    <td>{item.Type}</td>
                    <td>{item.Plot_Number || item.Shop_Number || item.Plot_Shop_Number || '-'}</td>
                    <td>{item.Town_Name || '-'}</td>
                    <td>{item.Customer_Name || '-'}</td>
                    <td>{fmt(parseFloat(item.Total_Amount_PKR || item.Total_Amount || 0))}</td>
                    <td>{item.Sell_Date || item.Sale_Date || item.Date || '-'}</td>
                    <td>{item.Agent_Name || '-'}</td>
                    <td><span className="status-badge status-active">{item.Status || 'Active'}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>

        <div className="quick-actions-panel">
          <div className="section-header">
            <h3>{t.quickActions}</h3>
            <span>{t.shortcuts}</span>
          </div>
          <button className="quick-action-btn" onClick={() => onNavigate?.('addTown')}>{t.addNewTown}</button>
          <button className="quick-action-btn" onClick={() => onNavigate?.('addProperty')}>{t.addPlotShop}</button>
          <button className="quick-action-btn" onClick={() => onNavigate?.('sellFlow')}>{t.sellPropertyBtn}</button>
          <button className="quick-action-btn" onClick={() => onNavigate?.('profitLoss')}>{t.viewReports}</button>
        </div>
      </div>

      <div className="table-container" style={{ marginTop: 24 }}>
        <div className="table-header">
          <h3>{'\u{1F4B0}'} Pending Collections</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('pendingCollections')}>{t.viewAll || 'View All'}</button>
        </div>
        <PendingCollections roleView="ceo" />
      </div>
    </div>
  );
}
