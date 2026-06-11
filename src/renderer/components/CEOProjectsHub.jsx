import React, { useState, useEffect } from 'react';
import AddTownWizard from './AddTownWizard';
import EditTownWizard from './EditTownWizard';
import { SearchIcon, PlusIcon, BuildingIcon, LockIcon, NeighborhoodIcon, EditIcon, TrashIcon } from './Icons';
import AppealDashboard from '../systems/AppealSystem/AppealDashboard';
import { AgentManagement } from '../systems/AgentManagementSystem';

const fmtPkr = (n) => {
  const num = parseFloat(n) || 0;
  return `PKR ${num.toLocaleString()}`;
};

export default function CEOProjectsHub({ activePage, onTownSelect, onLogout, showToast, onNavigate, userRole }) {
  const [towns, setTowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [editTown, setEditTown] = useState(null);
  const [townStats, setTownStats] = useState({});
  const [showCreateAccountant, setShowCreateAccountant] = useState(false);
  const [acName, setAcName] = useState('');
  const [acEmail, setAcEmail] = useState('');
  const [acPassword, setAcPassword] = useState('');
  const [acLoading, setAcLoading] = useState(false);
  const [acError, setAcError] = useState('');
  const [acSuccess, setAcSuccess] = useState('');
  const [pendingCommissions, setPendingCommissions] = useState([]);
  const [commissionsLoading, setCommissionsLoading] = useState(false);
  const [syncingToCloud, setSyncingToCloud] = useState(false);
  const [syncCloudProgress, setSyncCloudProgress] = useState(0);
  const [syncCloudMsg, setSyncCloudMsg] = useState('');

  useEffect(() => {
    loadTowns();
    loadPendingCommissions();
  }, []);

  useEffect(() => {
    if (window.api?.onSyncToCloudProgress) {
      window.api.onSyncToCloudProgress((percent, msg) => {
        setSyncCloudProgress(percent);
        setSyncCloudMsg(msg);
        if (percent >= 100) {
          setSyncingToCloud(false);
          loadTowns();
          loadPendingCommissions();
        }
      });
    }
    return () => {
      if (window.api?.removeSyncToCloudProgress) {
        window.api.removeSyncToCloudProgress();
      }
    };
  }, []);

  const loadPendingCommissions = async () => {
    setCommissionsLoading(true);
    try {
      const result = await window.api.getCommissions({ status: 'pending' });
      if (result?.data) setPendingCommissions(result.data);
    } catch (e) {
      console.error('Failed to load pending commissions:', e);
    }
    setCommissionsLoading(false);
  };

  const handleMarkCommissionPaid = async (id) => {
    try {
      const result = await window.api.markCommissionPaid(id);
      if (result?.error) {
        showToast(result.error, 'error');
      } else {
        showToast('Commission marked as paid!', 'success');
        loadPendingCommissions();
      }
    } catch (e) {
      showToast('Failed to mark commission paid: ' + (e.message || e), 'error');
    }
  };

  const loadTowns = async () => {
    setLoading(true);
    try {
      const data = await window.api.getTowns();
      if (Array.isArray(data)) {
        setTowns(data);
        await loadSoldCounts(data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadSoldCounts = async (townList) => {
    const stats = {};
    const entries = await Promise.all(
      townList.map(async (town) => {
        try {
          const [plots, shops] = await Promise.all([
            window.api.getAllPlots(town.Town_Name),
            window.api.getAllShops(town.Town_Name),
          ]);
          const soldPlots = Array.isArray(plots)
            ? plots.filter((p) => p.Status === 'Sold').length
            : 0;
          const soldShops = Array.isArray(shops)
            ? shops.filter((s) => s.Status === 'Sold').length
            : 0;
          return { name: town.Town_Name, soldPlots, soldShops };
        } catch {
          return { name: town.Town_Name, soldPlots: 0, soldShops: 0 };
        }
      })
    );
    entries.forEach((e) => {
      stats[e.name] = { soldPlots: e.soldPlots, soldShops: e.soldShops };
    });
    setTownStats(stats);
  };

  const handleSyncToCloud = async () => {
    try {
      setSyncingToCloud(true);
      setSyncCloudProgress(0);
      setSyncCloudMsg('Starting sync...');
      const result = await window.api.syncToCloud();
      if (result?.error) throw new Error(result.error);
      const parts = [];
      if (Number.isFinite(result?.salesSynced)) parts.push(`${result.salesSynced} sales`);
      if (Number.isFinite(result?.filesUploaded)) parts.push(`${result.filesUploaded} files uploaded`);
      if (Number.isFinite(result?.salesSkipped) && result.salesSkipped > 0) parts.push(`${result.salesSkipped} local income rows skipped`);
      showToast(parts.length ? `Cloud sync complete: ${parts.join(', ')}` : 'All data synced to cloud successfully', 'success');
    } catch (e) {
      showToast('Sync to Cloud failed: ' + e.message, 'error');
      setSyncingToCloud(false);
    }
  };

  const handleDeleteTown = async (town) => {
    if (!window.confirm(`Delete "${town.Town_Name}"? This will permanently remove the town and all its data. This cannot be undone.`)) return;
    try {
      const result = await window.api.deleteTown(town.Town_Name);
      if (result?.error) {
        showToast(result.error, 'error');
      } else {
        showToast(`${town.Town_Name} deleted!`);
        loadTowns();
      }
    } catch (e) {
      console.error('Delete town error:', e);
      showToast('Failed to delete town: ' + (e.message || e), 'error');
    }
  };

  const filteredTowns = towns.filter((t) =>
    t.Town_Name.toLowerCase().includes(search.toLowerCase().trim())
  );

  const totalProperties = towns.reduce(
    (sum, t) => sum + (parseInt(t.Total_Plots) || 0) + (parseInt(t.Total_Shops) || 0),
    0
  );
  const totalIncome = towns.reduce(
    (sum, t) => sum + (parseFloat(t.Total_Income_PKR) || 0),
    0
  );
  const totalExpenses = towns.reduce(
    (sum, t) => sum + (parseFloat(t.Total_Expenses_PKR) || 0),
    0
  );
  const netPortfolioPl = towns.reduce(
    (sum, t) => sum + (parseFloat(t.Profit_Loss) || 0),
    0
  );

  const dashboardContent = loading ? (
    <div className="loading flex-center flex-1">
      <div className="spinner" />
    </div>
  ) : (
    <>
      {/* Global P&L Banner */}
      <div className="ui-finance-hero">
        <div className="ui-finance-hero-copy">
          <h2>
            CEO Financial Summary
          </h2>
          <p>
            Total property receipts minus all expenses
          </p>
        </div>

        <div className="ui-finance-hero-metrics">
          <div className="ui-finance-hero-metric">
            <div className="ui-finance-hero-label">
              Total Received
            </div>
            <div className="ui-finance-hero-value text-green">
              {fmtPkr(totalIncome)}
            </div>
          </div>

          <div className="ui-finance-hero-divider" />

          <div className="ui-finance-hero-metric">
            <div className="ui-finance-hero-label">
              Total Expenses
            </div>
            <div className="ui-finance-hero-value text-red">
              {fmtPkr(totalExpenses)}
            </div>
          </div>

          <div className="ui-finance-hero-divider" />

          <div className="ui-finance-hero-metric">
            <div className="ui-finance-hero-label">
              Net Portfolio P&L
            </div>
            <div className={`ui-finance-hero-value ui-finance-hero-value-main ${netPortfolioPl >= 0 ? 'text-green' : 'text-red'}`}>
              {fmtPkr(netPortfolioPl)}
            </div>
          </div>
        </div>
      </div>

      {/* Pending Commissions Section */}
      {pendingCommissions.length > 0 && (
        <div className="ui-alert-strip">
          <div>
            <div className="ui-alert-title">
              ⏳ Pending Commissions ({pendingCommissions.length})
            </div>
            <div className="ui-alert-subtitle">
              Total: {fmtPkr(pendingCommissions.reduce((s, c) => s + (parseFloat(c.commission_amount) || 0), 0))}
            </div>
          </div>
          <div className="ui-alert-items">
            {pendingCommissions.slice(0, 5).map((c) => (
              <div key={c.id} className="ui-alert-mini-card">
                <div className="ui-alert-mini-title">
                  {c.agent_name || c.agent_id?.slice(0, 8) || 'Agent'}
                </div>
                <div className="ui-alert-mini-subtitle">
                  PKR {(parseFloat(c.commission_amount) || 0).toLocaleString()}
                </div>
                <button
                  onClick={() => handleMarkCommissionPaid(c.id)}
                  className="btn btn-success btn-sm"
                >
                  Mark Paid
                </button>
              </div>
            ))}
            {pendingCommissions.length > 5 && (
              <div className="ui-alert-more">
                +{pendingCommissions.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Row */}
      <div className="ui-summary-row">
        <div className="ui-summary-card">
          <div className="ui-label">Total Towns</div>
          <div className="ui-summary-value">{towns.length}</div>
        </div>
        <div className="ui-summary-card">
          <div className="ui-label">Total Properties</div>
          <div className="ui-summary-value">{totalProperties}</div>
        </div>
        <div className="ui-summary-card">
          <div className="ui-label">Net Portfolio P/L</div>
          <div className={`ui-summary-value ${netPortfolioPl >= 0 ? 'text-green' : 'text-red'}`}>{fmtPkr(netPortfolioPl)}</div>
        </div>
      </div>


      {/* Search */}
      <div className="ui-search-wrap" style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><SearchIcon size={14}/></span>
        <input
          placeholder="Search towns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-search-input"
          style={{ paddingLeft: 34 }}
        />
      </div>

      {/* Cards Grid */}
      <div className="ui-card-grid">
        {/* Add New Town Card */}
        <div
          className="ui-card ui-card-add"
          onClick={() => setShowWizard(true)}
        >
          <div className="ui-card-add-icon"><PlusIcon size={26}/></div>
          <div className="ui-card-title">Add New Town</div>
          <div className="ui-card-subtitle">
            Click to setup a new project
          </div>
        </div>

        {/* Town Cards */}
        {filteredTowns.map((town) => {
          const totalPlots = parseInt(town.Total_Plots) || 0;
          const totalShops = parseInt(town.Total_Shops) || 0;
          const stats = townStats[town.Town_Name] || { soldPlots: 0, soldShops: 0 };
          const netPl = parseFloat(town.Profit_Loss) || 0;
          const plotPct = totalPlots > 0 ? Math.min(100, (stats.soldPlots / totalPlots) * 100) : 0;
          const shopPct = totalShops > 0 ? Math.min(100, (stats.soldShops / totalShops) * 100) : 0;

          return (
            <div
              key={town.Town_Name}
              className="ui-card"
              onClick={() => onTownSelect(town)}
            >
              <div className="ui-card-header">
                <div>
                  <div className="ui-card-title">
                    {town.Town_Name}
                  </div>
                  {town.Location_Text && (
                    <div className="ui-card-subtitle">
                      {town.Location_Text}
                    </div>
                  )}
                </div>
                <div className="ui-badge-row">
                  <span className={`ui-badge ${parseFloat(town.Commission_Rate) > 0 ? 'ui-badge-primary' : ''}`}>
                    {town.Commission_Rate || 0}%
                  </span>
                  <span className={`status-badge ${town.Status === 'Active' ? 'status-active' : 'status-upcoming'}`}>
                    {town.Status || 'Active'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditTown(town); }}
                    title="Edit town"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', padding: '2px', display:'flex',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-blue)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <EditIcon size={13}/>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTown(town); }}
                    title="Delete town"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', padding: '2px', display:'flex',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <TrashIcon size={13}/>
                  </button>
                </div>
              </div>

              {totalPlots > 0 && (
                <div>
                  <div className="ui-progress-label">
                    Plots: Sold {stats.soldPlots} / Total {totalPlots}
                  </div>
                  <div className="ui-progress">
                    <div className="ui-progress-fill ui-progress-green" style={{ width: `${plotPct}%` }} />
                  </div>
                </div>
              )}

              {totalShops > 0 && (
                <div>
                  <div className="ui-progress-label">
                    Shops: Sold {stats.soldShops} / Total {totalShops}
                  </div>
                  <div className="ui-progress">
                    <div className="ui-progress-fill ui-progress-blue" style={{ width: `${shopPct}%` }} />
                  </div>
                </div>
              )}

              <div className="ui-card-footer">
                <span className={`ui-money ${netPl >= 0 ? 'text-green' : 'text-red'}`}>
                  {netPl >= 0 ? '▲' : '▼'} {fmtPkr(Math.abs(netPl))}
                </span>
                <span className="ui-muted-inline">
                  {netPl >= 0 ? 'Profit' : 'Loss'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTowns.length === 0 && !loading && (
        <div className="empty-state ui-empty-offset">
          <div className="icon"><NeighborhoodIcon size={36}/></div>
          <h3>{search ? 'No towns match your search' : 'No towns yet'}</h3>
          <p>{search ? 'Try a different search term.' : 'Click "Add New Town" to get started.'}</p>
        </div>
      )}
    </>
  );

  const content = (() => {
    if (activePage === 'appeals') {
      return (
        <div style={{ padding: 8 }}>
          <div className="ui-screen-header">
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Appeals</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              Pending approvals & OTP verification
            </p>
          </div>
          <div style={{ marginTop: 14 }}>
            <AppealDashboard />
          </div>
        </div>
      );
    }

    if (activePage === 'agents') {
      return (
        <div style={{ padding: 8 }}>
          <div className="ui-screen-header">
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Agents</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              Distribution & management
            </p>
          </div>
          <div style={{ marginTop: 14 }}>
            <AgentManagement />
          </div>
        </div>
      );
    }

    return dashboardContent;
  })();

  return (
    <div className="ui-screen">
      {/* Top Bar */}
      <div className="ui-topbar">
        <div className="ui-brand">
          <span className="ui-brand-icon"><BuildingIcon size={16}/></span>
          <span className="ui-brand-title">AL SIRAJ DEVELOPERS</span>
        </div>
        <div className="ui-topbar-title">CEO Portfolio Hub</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(userRole === 'ceo' || userRole === 'accountant') && (
            <>
              <button
                onClick={() => onNavigate?.('dashboard')}
                className="btn btn-ghost btn-sm"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: activePage === 'dashboard' ? 'var(--accent-blue)' : undefined,
                  color: activePage === 'dashboard' ? '#fff' : undefined,
                }}
              >
                Dashboard
              </button>
              <button
                onClick={() => onNavigate?.('appeals')}
                className="btn btn-ghost btn-sm"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: activePage === 'appeals' ? 'var(--accent-blue)' : undefined,
                  color: activePage === 'appeals' ? '#fff' : undefined,
                }}
              >
                Appeals
              </button>
              <button
                onClick={() => onNavigate?.('agents')}
                className="btn btn-ghost btn-sm"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: activePage === 'agents' ? 'var(--accent-blue)' : undefined,
                  color: activePage === 'agents' ? '#fff' : undefined,
                }}
              >
                Agents
              </button>
              {userRole === 'ceo' && (
                <button
                  onClick={() => { setShowCreateAccountant(true); setAcError(''); setAcSuccess(''); }}
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  + Accountant
                </button>
              )}
              <button
                onClick={handleSyncToCloud}
                disabled={syncingToCloud}
                className="btn btn-ghost btn-sm"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: syncingToCloud ? 'var(--accent-green)' : undefined,
                  color: syncingToCloud ? '#fff' : undefined,
                }}
              >
                {syncingToCloud ? `Syncing ${syncCloudProgress}%` : 'Sync to Cloud'}
              </button>
            </>
          )}
          <button
            onClick={onLogout}
            className="btn btn-ghost btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <LockIcon size={13}/> Logout
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="ui-scroll">
        {content}
      </div>

      {showWizard && (
        <AddTownWizard
          onSuccess={() => {
            setShowWizard(false);
            loadTowns();
          }}
          onClose={() => setShowWizard(false)}
          showToast={showToast}
        />
      )}
      {editTown && (
        <EditTownWizard
          town={editTown}
          onSuccess={() => {
            setEditTown(null);
            loadTowns();
          }}
          onClose={() => setEditTown(null)}
          showToast={showToast}
        />
      )}

      {/* ─── Create Accountant Modal ─────────────────────────────────── */}
      {showCreateAccountant && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 18,
            padding: 28, maxWidth: 420, width: '100%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Create Accountant</h3>
              <button onClick={() => setShowCreateAccountant(false)} className="btn btn-ghost btn-sm" style={{ fontSize: 18, padding: '2px 10px' }}>✕</button>
            </div>

            {acSuccess ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>Accountant Created!</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>They can now sign in with their credentials.</div>
                <button onClick={() => setShowCreateAccountant(false)} className="btn btn-primary btn-sm">Done</button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setAcLoading(true);
                setAcError('');
                try {
                  const r = await window.api.createAccountant({ fullName: acName, email: acEmail, password: acPassword });
                  if (r?.error) { setAcError(r.error); setAcLoading(false); return; }
                  setAcSuccess('Account created!');
                } catch (err) { setAcError(err.message); }
                setAcLoading(false);
              }}>
                {acError && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                    background: '#fee2e2', color: '#991b1b', fontSize: 13,
                    border: '1px solid #fecaca',
                  }}>
                    {acError}
                  </div>
                )}
                <div className="form-group">
                  <label>Full Name *</label>
                  <input type="text" value={acName} onChange={(e) => setAcName(e.target.value)} required placeholder="e.g. John Accountant" />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input type="email" value={acEmail} onChange={(e) => setAcEmail(e.target.value)} required placeholder="accountant@example.com" />
                </div>
                <div className="form-group">
                  <label>Password *</label>
                  <input type="password" value={acPassword} onChange={(e) => setAcPassword(e.target.value)} required placeholder="Min 6 characters" minLength={6} />
                </div>
                <button type="submit" disabled={acLoading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  {acLoading ? 'Creating...' : 'Create Accountant'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
