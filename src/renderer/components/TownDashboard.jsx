import React, { useState, useEffect } from 'react';
import LeafletMap from '../systems/MapSystem/LeafletMap';
import TownPrices from './TownPrices';
import AddProperty from './AddProperty';
import SoldProperties from './SoldProperties';
import ResellProperty from './ResellProperty';
import ResellHistory from './ResellHistory';
import InstallmentTracker from './InstallmentTracker';
import CommissionTracker from './CommissionTracker';
import DailyLedger from '../systems/DailySystem/DailyLedger';
import TownExpenses from './TownExpenses';
import { EmployeeManagement } from '../systems/EmployeeSystem';
import { EmployeeSalary } from '../systems/ExpenseSystem';
import {
  ChartIcon, WalletIcon, PlotIcon, ShopIcon, SoldIcon, ResellIcon,
  HistoryIcon, CalendarIcon, BriefcaseIcon, NeighborhoodIcon, PinIcon, HandshakeIcon, TrendUpIcon, BookIcon, DollarIcon, UsersIcon
} from './Icons';

const fmtPkr = (n) => `PKR ${(parseFloat(n) || 0).toLocaleString()}`;

const menuItems = [
  { key: 'overview',      Icon: ChartIcon,      label: 'Overview',            color: '#3b82f6' },
  { key: 'dailyEntries',  Icon: BookIcon,       label: 'Daily Entries',       color: '#6366f1' },
  { key: 'employees',     Icon: UsersIcon,      label: 'Agents',              color: '#06b6d4' },
  { key: 'prices',        Icon: WalletIcon,     label: 'Town Prices',         color: '#f59e0b' },
  { key: 'addPlot',       Icon: PlotIcon,       label: 'Add Plot',            color: '#10b981' },
  { key: 'addShop',       Icon: ShopIcon,       label: 'Add Shop',            color: '#8b5cf6' },
  { key: 'sold',          Icon: SoldIcon,       label: 'Sold Properties',     color: '#06b6d4' },
  { key: 'resell',        Icon: ResellIcon,     label: 'Resell Property',     color: '#f97316' },
  { key: 'resellHistory', Icon: HistoryIcon,    label: 'Resell History',      color: '#ec4899' },
  { key: 'installments',  Icon: CalendarIcon,   label: 'Installment Tracker', color: '#84cc16' },
  { key: 'commission',    Icon: BriefcaseIcon,  label: 'Commission Tracker',  color: '#ef4444' },
  { key: 'expenses',      Icon: DollarIcon,     label: 'Employees and Salaries', color: '#f43f5e' },
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

function TownOverview({ town }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    if (!window.api || !town?.Town_Name) { setLoading(false); return; }
    try {
      const [plots, shops] = await Promise.all([
        window.api.getAllPlots(town.Town_Name),
        window.api.getAllShops(town.Town_Name),
      ]);
      const soldPlots = Array.isArray(plots) ? plots.filter(p => p.Status === 'Sold').length : 0;
      const soldShops = Array.isArray(shops) ? shops.filter(s => s.Status === 'Sold').length : 0;
      const totalPlots = Array.isArray(plots) ? plots.length : 0;
      const totalShops = Array.isArray(shops) ? shops.length : 0;
      setStats({ soldPlots, soldShops, totalPlots, totalShops });
    } catch { /* silent */ }
    setLoading(false);
  };

  const townData = town || {};
  const totalPlots = parseInt(townData.Total_Plots) || 0;
  const totalShops = parseInt(townData.Total_Shops) || 0;
  const netPl = parseFloat(townData.Profit_Loss) || 0;
  const income = parseFloat(townData.Total_Income_PKR) || 0;
  const expenses = parseFloat(townData.Total_Expenses_PKR) || 0;

  const s = stats || { soldPlots: 0, soldShops: 0, totalPlots: 0, totalShops: 0 };
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
        <KPICard Icon={WalletIcon} label="Income" value={fmtPkr(income)}
          sub="Received" color="#10b981" />
        <KPICard Icon={TrendUpIcon} label="Net P/L" value={fmtPkr(Math.abs(netPl))}
          sub={netPl >= 0 ? 'Profit' : 'Loss'}
          color={netPl >= 0 ? '#10b981' : '#ef4444'} />
      </div>

      {/* Financial Summary Strip */}
      <div className="ui-town-financial-strip">
        {[
          { label: 'Total Income', value: income, color: '#10b981' },
          { label: 'Total Expenses', value: expenses, color: '#ef4444' },
          { label: 'Net Profit / Loss', value: netPl,
            color: netPl >= 0 ? '#10b981' : '#ef4444' },
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

export default function TownDashboard({ selectedTown, onBack, showToast }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [townData, setTownData] = useState(selectedTown || {});
  const [refreshKey, setRefreshKey] = useState(0);

  // Sync when selectedTown changes
  useEffect(() => {
    setTownData(selectedTown || {});
  }, [selectedTown]);

  const refreshTownData = async () => {
    const name = selectedTown?.Town_Name;
    if (!name) return;
    try {
      const updated = await window.api.getTownDetails(name);
      if (updated && !updated.error) {
        setTownData(updated);
      }
    } catch {}
    setRefreshKey(k => k + 1);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview': return <TownOverview key={refreshKey} town={townData} />;
      case 'prices': return <TownPrices townName={townData.Town_Name} showToast={showToast} />;
      case 'addPlot': return <AddProperty type="Plot" townName={townData.Town_Name} showToast={showToast} />;
      case 'addShop': return <AddProperty type="Shop" townName={townData.Town_Name} showToast={showToast} />;
      case 'sold': return <SoldProperties townName={townData.Town_Name} showToast={showToast} />;
      case 'resell': return <ResellProperty townName={townData.Town_Name} showToast={showToast} />;
      case 'resellHistory': return <ResellHistory townName={townData.Town_Name} />;
      case 'installments': return <InstallmentTracker townName={townData.Town_Name} showToast={showToast} />;
      case 'commission': return <CommissionTracker townName={townData.Town_Name} showToast={showToast} />;
      case 'expenses': return <EmployeeSalary townName={townData.Town_Name} showToast={showToast} />;
      case 'employees': return <EmployeeManagement townName={townData.Town_Name} />;
      case 'dailyEntries': return <DailyLedger townName={townData.Town_Name} showToast={showToast} onEntryAdded={refreshTownData} />;
      default: return <TownOverview key={refreshKey} town={townData} />;
    }
  };

  const activeMenuItem = menuItems.find(m => m.key === activeTab);
  const activeColor = activeMenuItem?.color || '#3b82f6';

  return (
    <div className="ui-screen">

      {/* ─── Top Bar ────────────────────────────────────────────────────── */}
      <div className="ui-town-topbar">
        <button className="ui-town-back-btn" onClick={onBack}>
          ← Portfolio
        </button>

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
        </div>

        {/* ─── Content Area ────────────────────────────────────────────── */}
        <div
          key={activeTab}
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
            <TownOverview key={refreshKey} town={townData} />
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
