import React, { useState, useEffect } from 'react';
import LeafletMap from '../systems/MapSystem/LeafletMap';
import TownPrices from './TownPrices';
import AddProperty from './AddProperty';
import SoldProperties from './SoldProperties';
import ResellProperty from './ResellProperty';
import ResellHistory from './ResellHistory';
import InstallmentTracker from './InstallmentTracker';
import CommissionTracker from './CommissionTracker';
import TownAgents from './TownAgents';
import InvestorDashboard from './InvestorDashboard';
import ConstructionDashboard from './ConstructionDashboard';
import DailyLedger from '../systems/DailySystem/DailyLedger';
import TownExpenses from './TownExpenses';
import { EmployeeSalary } from '../systems/ExpenseSystem';
import {
  ChartIcon, WalletIcon, PlotIcon, ShopIcon, SoldIcon, ResellIcon,
  HistoryIcon, CalendarIcon, BriefcaseIcon, NeighborhoodIcon, PinIcon, HandshakeIcon, TrendUpIcon, BookIcon, DollarIcon, UsersIcon
} from './Icons';

const fmtPkr = (n) => `PKR ${(parseFloat(n) || 0).toLocaleString()}`;
const isoDate = (date = new Date()) => date.toISOString().slice(0, 10);
const firstDayOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const menuItems = [
  { key: 'overview',      Icon: ChartIcon,      label: 'Overview',            color: '#3b82f6' },
  { key: 'expenses',      Icon: DollarIcon,     label: 'Employees and Salaries', color: '#f43f5e' },
  { key: 'dailyEntries',  Icon: BookIcon,       label: 'Daily Entries',       color: '#6366f1' },
  { key: 'townAgents',    Icon: UsersIcon,      label: 'Sales Agents',        color: '#06b6d4' },
  { key: 'investors',     Icon: WalletIcon,     label: 'Investors',           color: '#0ea5e9' },
  { key: 'construction',  Icon: BriefcaseIcon,  label: 'Construction',        color: '#64748b' },
  { key: 'prices',        Icon: WalletIcon,     label: 'Town Prices',         color: '#f59e0b' },
  { key: 'addPlot',       Icon: PlotIcon,       label: 'Add Plot',            color: '#10b981' },
  { key: 'addShop',       Icon: ShopIcon,       label: 'Add Shop',            color: '#8b5cf6' },
  { key: 'sold',          Icon: SoldIcon,       label: 'Sold Properties',     color: '#06b6d4' },
  { key: 'resell',        Icon: ResellIcon,     label: 'Resell Property',     color: '#f97316' },
  { key: 'resellHistory', Icon: HistoryIcon,    label: 'Resell History',      color: '#ec4899' },
  { key: 'installments',  Icon: CalendarIcon,   label: 'Installment Tracker', color: '#84cc16' },
  { key: 'commission',    Icon: BriefcaseIcon,  label: 'Commission Tracker',  color: '#ef4444' },
];

// ─── Reusable Components ────────────────────────────────────────────────────

function KPICard({ Icon, label, value, sub, color, progressValue }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="ui-kpi-card-interactive"
      style={{
        borderColor: hover ? color : `${color}33`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="ui-kpi-card-icon" style={{ color }}><Icon size={20}/></div>
      <div className="ui-kpi-card-lbl">{label}</div>
      <div className="ui-kpi-card-val" style={{ color }}>{value}</div>
      {sub && <div className="ui-kpi-card-sub">{sub}</div>}
      {progressValue > 0 && (
        <div className="ui-kpi-card-progress">
          <div
            className="ui-kpi-card-progress-bar"
            style={{
              width: `${Math.min(progressValue, 100)}%`,
              background: color,
            }}
          />
        </div>
      )}
      <div
        className="ui-kpi-card-glow"
        style={{
          background: color,
        }}
      />
    </div>
  );
}

function SimpleDonut({ sold, total, color }) {
  const available = total - sold;
  const soldPct = total > 0 ? (sold / total) : 0;
  const r = 45, circ = 2 * Math.PI * r;
  return (
    <div className="ui-donut-wrap">
      <svg width={110} height={110} viewBox="0 0 110 110" className="ui-donut-svg">
        <circle cx={55} cy={55} r={r} className="ui-donut-circle-bg" />
        <circle cx={55} cy={55} r={r} className="ui-donut-circle-fill" stroke={color}
          strokeDasharray={`${soldPct * circ} ${circ}`}
          strokeDashoffset={circ * 0.25}
        />
        <text x={55} y={50} className="ui-donut-text-sold">
          {sold}
        </text>
        <text x={55} y={66} className="ui-donut-text-lbl">sold</text>
      </svg>
      <div className="ui-donut-legend">
        <div className="ui-donut-legend-item">
          <div className="ui-donut-legend-color" style={{ background: color }} />
          <span className="ui-donut-legend-text">Sold: <b>{sold}</b></span>
        </div>
        <div className="ui-donut-legend-item">
          <div className="ui-donut-legend-color" style={{ background: 'var(--bg-secondary)' }} />
          <span className="ui-donut-legend-text">Available: <b>{available}</b></span>
        </div>
        <div className="ui-donut-legend-pct" style={{ color }}>
          {total > 0 ? Math.round(soldPct * 100) : 0}% Sold
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────────────

function TownOverview({ town, refreshKey = 0 }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportFrom, setReportFrom] = useState(firstDayOfMonth());
  const [reportTo, setReportTo] = useState(isoDate());
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { loadStats(); }, []);

  useEffect(() => {
    if (refreshKey > 0) loadStats();
  }, [refreshKey]);

  useEffect(() => {
    loadReport();
  }, [town?.Town_Name, reportFrom, reportTo, refreshKey]);

  const loadStats = async () => {
    if (!window.api || !town?.Town_Name) { setLoading(false); return; }
    try {
      const [plots, shops] = await Promise.all([
        window.api.getAllPlots(town.Town_Name),
        window.api.getAllShops(town.Town_Name),
      ]);
      const [investors, construction, performance] = await Promise.all([
        window.api.getInvestors?.(town.Town_Name).catch(() => []),
        window.api.getConstructionProjects?.(town.Town_Name).catch(() => []),
        window.api.getTownPerformance?.(town.Town_Name).catch(() => null),
      ]);
      const soldPlots = Array.isArray(plots) ? plots.filter(p => p.Status === 'Sold').length : 0;
      const soldShops = Array.isArray(shops) ? shops.filter(s => s.Status === 'Sold').length : 0;
      const totalPlots = Array.isArray(plots) ? plots.length : 0;
      const totalShops = Array.isArray(shops) ? shops.length : 0;
      const investorBalance = Array.isArray(investors) ? investors.reduce((sum, i) => sum + (parseFloat(i.Balance) || 0), 0) : 0;
      const constructionPaid = Array.isArray(construction) ? construction.reduce((sum, p) => sum + (parseFloat(p.Paid_Amount) || 0), 0) : 0;
      setStats({ soldPlots, soldShops, totalPlots, totalShops, investorBalance, constructionPaid, performance });
    } catch { /* silent */ }
    setLoading(false);
  };

  const loadReport = async () => {
    if (!window.api?.getTownLedgerReport || !town?.Town_Name) return;
    setReportLoading(true);
    setReportMessage('');
    try {
      const res = await window.api.getTownLedgerReport({
        townName: town.Town_Name,
        fromDate: reportFrom,
        toDate: reportTo,
      });
      if (res?.error) throw new Error(res.error);
      setReport(res);
    } catch (e) {
      setReportMessage(e.message || 'Report could not be loaded');
    } finally {
      setReportLoading(false);
    }
  };

  const exportReport = async (kind) => {
    if (!window.api?.exportTownLedgerReport || !town?.Town_Name) return;
    setExporting(true);
    setReportMessage('');
    try {
      const res = await window.api.exportTownLedgerReport({
        townName: town.Town_Name,
        fromDate: reportFrom,
        toDate: reportTo,
      });
      if (res?.error) throw new Error(res.error);
      setReport(res.report);
      await window.api.openReportFile?.(kind === 'excel' ? res.excelPath : res.htmlPath);
      setReportMessage(`${kind === 'excel' ? 'Excel' : 'Print/PDF'} report ready`);
    } catch (e) {
      setReportMessage(e.message || 'Report export failed');
    } finally {
      setExporting(false);
    }
  };

  const townData = town || {};
  const totalPlots = parseInt(townData.Total_Plots) || 0;
  const totalShops = parseInt(townData.Total_Shops) || 0;
  const netPl = parseFloat(townData.Profit_Loss) || 0;
  const income = parseFloat(townData.Total_Income_PKR) || 0;
  const expenses = parseFloat(townData.Total_Expenses_PKR) || 0;

  const s = stats || { soldPlots: 0, soldShops: 0, totalPlots: 0, totalShops: 0, investorBalance: 0, constructionPaid: 0 };
  const totalReceived = s.performance?.actualIncome ?? income;
  const totalExpenses = s.performance?.totalExpenses ?? expenses;
  const cashBalance = s.performance?.cashBalance ?? s.performance?.netProfit ?? netPl;
  const actualPlots = s.totalPlots || totalPlots;
  const actualShops = s.totalShops || totalShops;

  if (loading) {
    return <div className="loading" style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>;
  }

  return (
    <div>
      {/* Row 1 — 4 KPI Cards with progress bars */}
      <div className="ui-kpi-grid-4">
        <KPICard Icon={PlotIcon} label="Total Plots" value={actualPlots}
          sub={`${s.soldPlots} Sold`} color="#3b82f6"
          progressValue={actualPlots > 0 ? (s.soldPlots / actualPlots) * 100 : 0} />
        <KPICard Icon={ShopIcon} label="Total Shops" value={actualShops}
          sub={`${s.soldShops} Sold`} color="#10b981"
          progressValue={actualShops > 0 ? (s.soldShops / actualShops) * 100 : 0} />
        <KPICard Icon={WalletIcon} label="Total Received" value={fmtPkr(totalReceived)}
          sub="Received" color="#10b981" />
        <KPICard Icon={TrendUpIcon} label="Cash Balance" value={fmtPkr(Math.abs(cashBalance))}
          sub={cashBalance >= 0 ? 'Positive' : 'Negative'}
          color={cashBalance >= 0 ? '#10b981' : '#ef4444'} />
        <KPICard Icon={WalletIcon} label="Investor Balance" value={fmtPkr(s.investorBalance)}
          sub="Town investment" color="#0ea5e9" />
        <KPICard Icon={BriefcaseIcon} label="Construction Paid" value={fmtPkr(s.constructionPaid)}
          sub="Town expenses" color="#64748b" />
      </div>

      {/* Financial Summary Strip */}
      <div className="ui-town-financial-strip">
        {[
          { label: 'Total Received', value: totalReceived, color: '#10b981' },
          { label: 'Total Expenses', value: totalExpenses, color: '#ef4444' },
          { label: 'Cash Balance', value: cashBalance,
            color: cashBalance >= 0 ? '#10b981' : '#ef4444' },
        ].map((item, i) => (
          <div key={i} className="ui-town-financial-item">
            <div className="ui-town-financial-lbl">
              {item.label}
            </div>
            <div className="ui-town-financial-val" style={{ color: item.color }}>
              PKR {Number(item.value || 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Row 2 — Two side by side panels */}
      <div className="ui-town-map-card" style={{ padding: 18, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div className="ui-label">Date range ledger</div>
            <h3 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>
              Full received, paid, receivable and payable report
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>From</label>
            <input type="date" value={reportFrom} max={reportTo} onChange={(e) => setReportFrom(e.target.value)} style={{ height: 36, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', background: '#fff', color: '#111827' }} />
            <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>To</label>
            <input type="date" value={reportTo} min={reportFrom} onChange={(e) => setReportTo(e.target.value)} style={{ height: 36, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', background: '#fff', color: '#111827' }} />
            <button className="btn btn-secondary" type="button" onClick={() => exportReport('print')} disabled={exporting || reportLoading}>Print / PDF</button>
            <button className="btn btn-primary" type="button" onClick={() => exportReport('excel')} disabled={exporting || reportLoading}>Excel</button>
          </div>
        </div>
        {reportMessage && (
          <div style={{ marginBottom: 12, color: reportMessage.toLowerCase().includes('fail') || reportMessage.toLowerCase().includes('could') ? '#dc2626' : '#047857', fontSize: 12, fontWeight: 700 }}>
            {reportMessage}
          </div>
        )}
        <div className="ui-kpi-grid-4" style={{ marginBottom: 16 }}>
          {[
            { label: 'Range Received', value: report?.summary?.totalReceived, color: '#10b981' },
            { label: 'Range Paid', value: report?.summary?.totalPaid, color: '#ef4444' },
            { label: 'Cash Balance', value: report?.summary?.cashBalance, color: (report?.summary?.cashBalance || 0) >= 0 ? '#10b981' : '#ef4444' },
            { label: 'Receivable', value: report?.summary?.receivable, color: '#f59e0b' },
            { label: 'Payable', value: report?.summary?.payable, color: '#8b5cf6' },
          ].map((item) => (
            <div key={item.label} className="ui-town-financial-item" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div className="ui-town-financial-lbl">{item.label}</div>
              <div className="ui-town-financial-val" style={{ color: item.color }}>
                {reportLoading ? 'Loading...' : fmtPkr(item.value)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Employee Ledger</div>
            {(report?.employeeLedgers || []).slice(0, 4).map((row) => (
              <div key={row.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <span>{row.name}</span><b>{fmtPkr(row.paid)} paid / {fmtPkr(row.remaining)} left</b>
              </div>
            ))}
            {!reportLoading && !(report?.employeeLedgers || []).length && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No employee salary rows.</div>}
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Agent Commission Ledger</div>
            {(report?.agentLedgers || []).slice(0, 4).map((row) => (
              <div key={row.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <span>{row.name}</span><b>{fmtPkr(row.paid)} paid / {fmtPkr(row.remaining)} left</b>
              </div>
            ))}
            {!reportLoading && !(report?.agentLedgers || []).length && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No agent commission rows.</div>}
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Customer Receivables</div>
            {(report?.customerLedgers || []).slice(0, 4).map((row, idx) => (
              <div key={`${row.property}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <span>{row.property || row.customer}</span><b>{fmtPkr(row.remaining)} left</b>
              </div>
            ))}
            {!reportLoading && !(report?.customerLedgers || []).length && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No sales in selected range.</div>}
          </div>
        </div>
      </div>

      <div className="ui-town-donut-grid">
        <div className="ui-town-donut-card">
          <div className="ui-town-donut-title">
            <PlotIcon size={15}/> Plot Availability
          </div>
          <SimpleDonut sold={s.soldPlots} total={actualPlots} color="#3b82f6" />
        </div>
        <div className="ui-town-donut-card">
          <div className="ui-town-donut-title">
            <ShopIcon size={15}/> Shop Availability
          </div>
          <SimpleDonut sold={s.soldShops} total={actualShops} color="#10b981" />
        </div>
      </div>

      {/* Row 3 — Full width location + info panel */}
      <div className="ui-town-map-card">
        {townData.Location_Lat && townData.Location_Lng ? (
          <LeafletMap
            initialLat={parseFloat(townData.Location_Lat)}
            initialLng={parseFloat(townData.Location_Lng)}
            searchEnabled={false}
            readOnly={true}
            markerLabel={townData.Town_Name}
          />
        ) : (
          <div className="ui-town-map-empty">
            <span><PinIcon size={18}/></span> No location set for this town
          </div>
        )}
        <div className="ui-town-map-footer">
          <div><span className="ui-town-map-footer-lbl">Commission</span><div className="ui-town-map-footer-val">{townData.Commission_Rate || 0}%</div></div>
          <div><span className="ui-town-map-footer-lbl">Status</span><div className="ui-town-map-footer-val">{townData.Status || 'Active'}</div></div>
          <div><span className="ui-town-map-footer-lbl">Expenses</span><div className="ui-town-map-footer-val" style={{ color: '#ef4444' }}>{fmtPkr(expenses)}</div></div>
          {townData.Location_Text && (
            <div><span className="ui-town-map-footer-lbl">Location</span><div className="ui-town-map-footer-val" style={{ fontWeight: 600 }}>{townData.Location_Text}</div></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function TownDashboard({
  selectedTown,
  refreshKey: externalRefreshKey = 0,
  onBack,
  showToast,
  isAccountant = false,
  onSwitchToSelling,
  onLogout,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [townData, setTownData] = useState(selectedTown || {});
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0);

  // Sync when selectedTown changes
  useEffect(() => {
    setTownData(selectedTown || {});
  }, [selectedTown]);

  useEffect(() => {
    if (externalRefreshKey > 0) refreshTownData();
  }, [externalRefreshKey]);

  const refreshTownData = async () => {
    const name = selectedTown?.Town_Name;
    if (!name) return;
    try {
      const updated = await window.api.getTownDetails(name);
      if (updated && !updated.error) {
        setTownData(updated);
      }
    } catch {}
    setOverviewRefreshKey(k => k + 1);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview': return <TownOverview town={townData} refreshKey={overviewRefreshKey} />;
      case 'prices': return <TownPrices townName={townData.Town_Name} showToast={showToast} />;
      case 'addPlot': return <AddProperty type="Plot" townName={townData.Town_Name} showToast={showToast} />;
      case 'addShop': return <AddProperty type="Shop" townName={townData.Town_Name} showToast={showToast} />;
      case 'sold': return <SoldProperties townName={townData.Town_Name} showToast={showToast} refreshKey={overviewRefreshKey} />;
      case 'resell': return <ResellProperty townName={townData.Town_Name} showToast={showToast} />;
      case 'resellHistory': return <ResellHistory townName={townData.Town_Name} refreshKey={overviewRefreshKey} />;
      case 'installments': return <InstallmentTracker townName={townData.Town_Name} showToast={showToast} refreshKey={overviewRefreshKey} />;
      case 'commission': return <CommissionTracker townName={townData.Town_Name} showToast={showToast} refreshKey={overviewRefreshKey} />;
      case 'expenses': return <EmployeeSalary townName={townData.Town_Name} showToast={showToast} refreshKey={overviewRefreshKey} />;
      case 'townAgents': return <TownAgents townName={townData.Town_Name} showToast={showToast} />;
      case 'investors': return <InvestorDashboard townName={townData.Town_Name} showToast={showToast} refreshKey={overviewRefreshKey} />;
      case 'construction': return <ConstructionDashboard townName={townData.Town_Name} showToast={showToast} refreshKey={overviewRefreshKey} />;
      case 'dailyEntries': return <DailyLedger townName={townData.Town_Name} showToast={showToast} onEntryAdded={refreshTownData} refreshKey={overviewRefreshKey} />;
      default: return <TownOverview town={townData} refreshKey={overviewRefreshKey} />;
    }
  };

  const activeMenuItem = menuItems.find(m => m.key === activeTab);
  const activeColor = activeMenuItem?.color || '#3b82f6';

  return (
    <div className="ui-screen">

      {/* ─── Top Bar ────────────────────────────────────────────────────── */}
      <div className="ui-town-topbar">
        {isAccountant ? (
          <button className="ui-town-back-btn" onClick={onSwitchToSelling}>
            Switch to Property Selling Section
          </button>
        ) : (
          <button className="ui-town-back-btn" onClick={onBack}>
          ← Portfolio
          </button>
        )}

        <div className="ui-town-topbar-icon"><NeighborhoodIcon size={18}/></div>

        <div style={{ flex: 1 }}>
          <div className="ui-town-topbar-title">
            {townData.Town_Name}
          </div>
          {townData.Location_Text && (
            <div className="ui-town-topbar-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <PinIcon size={11}/> {townData.Location_Text}
            </div>
          )}
        </div>

        <div className="ui-town-topbar-badges">
          <span className="ui-town-topbar-badge active">● Active</span>
          <span className="ui-town-topbar-badge commission" style={{ display:'flex', alignItems:'center', gap:4 }}>
            <HandshakeIcon size={12}/> {townData.Commission_Rate || 0}% Commission
          </span>
          {isAccountant && (
            <button
              className="ui-town-topbar-badge"
              type="button"
              onClick={onLogout}
              style={{ cursor: 'pointer', color: '#dc2626', border: '1px solid rgba(220,38,38,0.22)' }}
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────────────────────────── */}
      <div className="ui-town-body">

        {/* ─── Left Sidebar ────────────────────────────────────────────── */}
        <div className="ui-town-sidebar">
          {/* Town mini-stats */}
          <div className="ui-town-sidebar-stats">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>
              QUICK STATS
            </div>
            <div className="ui-town-sidebar-stats-row">
              <div className="ui-town-sidebar-stats-col">
                <div className="ui-town-sidebar-stats-val" style={{ color: '#3b82f6' }}>{parseInt(townData.Total_Plots) || 0}</div>
                <div className="ui-town-sidebar-stats-lbl">Plots</div>
              </div>
              <div className="ui-town-sidebar-stats-divider" />
              <div className="ui-town-sidebar-stats-col">
                <div className="ui-town-sidebar-stats-val" style={{ color: '#8b5cf6' }}>{parseInt(townData.Total_Shops) || 0}</div>
                <div className="ui-town-sidebar-stats-lbl">Shops</div>
              </div>
              <div className="ui-town-sidebar-stats-divider" />
              <div className="ui-town-sidebar-stats-col">
                <div className="ui-town-sidebar-stats-val" style={{ color: '#10b981' }}>{townData.Commission_Rate || 0}%</div>
                <div className="ui-town-sidebar-stats-lbl">Comm.</div>
              </div>
            </div>
          </div>

          <div className="ui-town-sidebar-title">Navigation</div>

          {menuItems.map(item => {
            const isActive = activeTab === item.key;
            const IconComp = item.Icon;
            return (
              <div
                key={item.key}
                className={`ui-town-sidebar-item${isActive ? ' active' : ''}`}
                onClick={() => setActiveTab(item.key)}
                style={{
                  color: isActive ? item.color : 'var(--text-secondary)',
                  background: isActive
                    ? `linear-gradient(135deg, ${item.color}18, ${item.color}08)`
                    : 'transparent',
                  borderLeftColor: isActive
                    ? item.color
                    : 'transparent',
                }}
              >
                <span style={{ display:'flex', alignItems:'center' }}><IconComp size={15}/></span>
                {item.label}
                {isActive && (
                  <div
                    className="ui-town-sidebar-dot"
                    style={{ background: item.color }}
                  />
                )}
              </div>
            );
          })}
          {isAccountant && (
            <button
              type="button"
              className="ui-town-sidebar-item"
              onClick={onLogout}
              style={{
                width: '100%',
                marginTop: 14,
                color: '#dc2626',
                borderLeftColor: 'transparent',
                background: 'rgba(220,38,38,0.06)',
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          )}
        </div>

        {/* ─── Content Area ────────────────────────────────────────────── */}
        <div
          className="ui-town-content"
        >
          {/* Tab Header */}
          <div className="ui-town-content-header">
            <div className="ui-town-header-info">
              <div
                className="ui-town-header-icon-box"
                style={{
                  background: `linear-gradient(135deg, ${activeColor}25, ${activeColor}10)`,
                  border: `1.5px solid ${activeColor}30`,
                  boxShadow: `0 4px 12px ${activeColor}20`,
                  color: activeColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {activeMenuItem && <activeMenuItem.Icon size={18}/>}
              </div>
              <div>
                <h2 className="ui-town-header-title">
                  {activeMenuItem?.label}
                </h2>
                <div className="ui-town-header-subtitle" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <NeighborhoodIcon size={12}/> {townData.Town_Name} — scoped to this town only
                </div>
              </div>
            </div>
            <div
              className="ui-town-header-badge"
              style={{
                background: `linear-gradient(135deg, ${activeColor}15, ${activeColor}08)`,
                border: `1px solid ${activeColor}25`,
                color: activeColor,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {activeMenuItem && <activeMenuItem.Icon size={12}/>} {townData.Town_Name}
            </div>
          </div>

          {/* Divider */}
          <div
            className="ui-town-divider"
            style={{
              background: `linear-gradient(90deg, ${activeColor}40, transparent)`,
            }}
          />

          {/* Component container */}
          {activeTab === 'overview' ? (
            <TownOverview key={overviewRefreshKey} town={townData} refreshKey={overviewRefreshKey} />
          ) : (
            <div className="ui-town-tab-wrapper">
              {renderTabContent()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
