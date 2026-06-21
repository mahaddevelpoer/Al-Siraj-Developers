import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import AddTown from './components/AddTown';
import AddProperty from './components/AddProperty';
import CeoExpenses from './components/CeoExpenses';
import AddEmployee from './components/AddEmployee';
import ResellProperty from './components/ResellProperty';
import SoldProperties from './components/SoldProperties';
import SellFlow from './components/SellFlow';
import InstallmentTracker from './components/InstallmentTracker';
import ProfitLossReport from './components/ProfitLossReport';
import ResellHistory from './components/ResellHistory';
import CommissionTracker from './components/CommissionTracker';
import TownPrices from './components/TownPrices';
import CEOProjectsHub from './components/CEOProjectsHub';
import TownDashboard from './components/TownDashboard';
import AuthScreen from './components/AuthScreen';
import AppealDashboard from './systems/AppealSystem/AppealDashboard';
import PendingCollections from './components/PendingCollections';
import { LanguageProvider } from './LanguageContext';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';

const PAGE_TITLES = {
  dashboard: 'Dashboard', addTown: 'Add Town', addProperty: 'Add Plot / Shop',
  townPrices: 'Town Prices Setup', pendingCollections: 'Pending Collections',
  ceoExpenses: 'CEO Expenses', addEmployee: 'Manage Employees',
  resellProperty: 'Resell Property', soldProperties: 'Sold Properties',
  sellFlow: 'Sell Property', installments: 'Installment Tracker',
  profitLoss: 'Profit / Loss Report', resellHistory: 'Resell History',
  commission: 'Commission Tracker',
  townDashboard: 'Town Dashboard',
  agentProperties: 'My Properties',
};

function PoweredByFooter({ compact }) {
  const [devUrl, setDevUrl] = React.useState('https://example.com');
  React.useEffect(() => {
    if (window.api?.getDevConfig) {
      window.api.getDevConfig().then(cfg => {
        if (cfg?.developer_website) setDevUrl(cfg.developer_website);
      }).catch(() => {});
    }
  }, []);
  const handleClick = () => {
    if (window.api?.openExternalUrl) window.api.openExternalUrl(devUrl);
    else window.open(devUrl, '_blank');
  };
  return (
    <div className="powered-by-footer" style={compact ? { padding: '8px', fontSize: '8px' } : {}} onClick={handleClick} title={devUrl}>
      POWERED BY&nbsp;<strong>MAHAD AND MAHDI DEVELOPERS</strong>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('ErrorBoundary caught:', error, info); }
  recover(resetState = false) {
    if (resetState) {
      try {
        localStorage.removeItem('zameen_panel');
        localStorage.removeItem('zameen_page');
        localStorage.removeItem('zameen_selected_town');
      } catch {}
    }
    this.setState({ error: null });
    if (resetState) window.location.reload();
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fbff', padding: 24 }}>
          <div style={{ width: 'min(560px, 100%)', background: '#fff', border: '1px solid #dbeafe', boxShadow: '0 24px 70px rgba(15,23,42,.12)', padding: 26, borderRadius: 18, fontFamily: 'Inter, Segoe UI, Arial, sans-serif' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#1455d9', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, marginBottom: 14 }}>AS</div>
            <h2 style={{ color: '#0f172a', margin: '0 0 8px', fontSize: 20 }}>Screen Recovered</h2>
            <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.6, margin: '0 0 16px' }}>Is screen mein error aaya tha. App ko reload ya saved screen reset karke continue kar sakte hain.</p>
            <details style={{ marginBottom: 16 }}>
              <summary style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 700, fontSize: 13 }}>Technical error</summary>
              <pre style={{ background: '#fef2f2', padding: 14, borderRadius: 10, border: '1px solid #fecaca', whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 220, overflow: 'auto' }}>
            {this.state.error.stack || this.state.error.message || String(this.state.error)}
              </pre>
            </details>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload App</button>
              <button className="btn btn-secondary" onClick={() => this.recover(true)}>Reset Saved Screen</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast ${type}`}>{message}</div>;
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      <span className="theme-toggle-dot" />
      <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}

function StartupSplash() {
  return (
    <div className="startup-splash">
      <div className="startup-splash-card">
        <div className="startup-mark">AS</div>
        <div>
          <div className="startup-title">AL SIRAJ DEVELOPERS</div>
          <div className="startup-subtitle">Preparing secure workspace...</div>
        </div>
      </div>
    </div>
  );
}

function CloudRefreshStatus({ state }) {
  if (!state?.visible) return null;
  const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
  return (
    <div className="cloud-refresh-status" aria-live="polite">
      <div className="cloud-refresh-row">
        <span className="cloud-refresh-dot" />
        <span>{state.msg || 'Syncing database...'}</span>
        <strong>{percent}%</strong>
      </div>
      <div className="cloud-refresh-track">
        <div className="cloud-refresh-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </LanguageProvider>
  );
}

function AppInner() {
  const { user, userRole, userProfile, loading: authLoading, signOut } = useAuth();
  const [loggedIn, setLoggedIn] = useState(false);
  const [panel, setPanel] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [toast, setToast] = useState(null);
  const [ready, setReady] = useState(false);
  const [selectedTown, setSelectedTown] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('zameen_theme') || 'light');
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [cloudRefresh, setCloudRefresh] = useState({ visible: false, percent: 0, msg: '' });
  const sessionHydratedRef = useRef(false);

  const assignedAccountantTown = userRole === 'accountant'
    ? String(userProfile?.town_name || userProfile?.town_id || '').trim()
    : '';

  const logoutCurrentUser = useCallback(() => {
    localStorage.removeItem('zameen_panel');
    localStorage.removeItem('zameen_page');
    localStorage.removeItem('zameen_selected_town');
    setLoggedIn(false);
    setPanel(null);
    setSelectedTown(null);
    setPage('dashboard');
    signOut();
  }, [signOut]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (ready) return undefined;
    const timer = setTimeout(() => {
      setLoggedIn(false);
      setPanel(null);
      setSelectedTown(null);
      setReady(true);
      showToast('Startup recovered. Please login again if needed.', 'warning');
    }, 7000);
    return () => clearTimeout(timer);
  }, [ready, showToast]);

  useEffect(() => {
    document.body.classList.remove('light-mode', 'dark-mode');
    document.body.classList.add(theme === 'dark' ? 'dark-mode' : 'light-mode');
    localStorage.setItem('zameen_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
  }, []);

  // Restore session from Supabase localStorage on app start
  useEffect(() => {
    if (authLoading) return;
    if (sessionHydratedRef.current) return;
    if (user && userRole) { // Wait for both user and userRole to be resolved
      sessionHydratedRef.current = true;
      let finalPanel = 'employee';
      let finalPage = 'sellFlow';
      let finalTown = null;
      
      if (userRole === 'agent') {
        signOut();
        setLoggedIn(false);
        setReady(true);
        return;
      } else if (userRole === 'ceo') {
        finalPanel = 'ceo';
        finalPage = localStorage.getItem('zameen_page') || 'dashboard';
      } else if (userRole === 'accountant') {
        const assignedTown = assignedAccountantTown;
        if (assignedTown) {
          finalPanel = 'ceo';
          finalPage = 'townDashboard';
          finalTown = { Town_Name: assignedTown };
        } else {
          finalPanel = 'choose';
          finalPage = 'dashboard';
        }
      }

      if (finalPage === 'townDashboard' && userRole !== 'accountant') {
        finalPage = 'dashboard';
        localStorage.setItem('zameen_page', 'dashboard');
      }

      setPanel(finalPanel);
      setPage(finalPage);
      if (finalTown) setSelectedTown(finalTown);
      setLoggedIn(true);
      setReady(true);
    } else if (!user) {
      sessionHydratedRef.current = true;
      setReady(true);
    }
  }, [authLoading, user, userRole, assignedAccountantTown]);

  // Persist panel/page choice
  useEffect(() => {
    if (panel) {
      localStorage.setItem('zameen_panel', panel);
      localStorage.setItem('zameen_page', page);
    }
  }, [panel, page]);

  useEffect(() => {
    if (page === 'dashboard' && panel === 'ceo') {
      setSelectedTown(null);
    }
  }, [page, panel]);

  useEffect(() => {
    if (panel === 'ceo' && page === 'townDashboard' && !selectedTown?.Town_Name) {
      localStorage.setItem('zameen_page', 'dashboard');
      setPage('dashboard');
    }
  }, [panel, page, selectedTown?.Town_Name]);

  useEffect(() => {
    if (panel === 'employee' && page !== 'sellFlow') {
      localStorage.setItem('zameen_page', 'sellFlow');
      setPage('sellFlow');
    }
  }, [panel, page]);

  useEffect(() => {
    if (!loggedIn) return;
    if (userRole !== 'accountant') return;
    if (!assignedAccountantTown) return;
    if (selectedTown?.Town_Name !== assignedAccountantTown) {
      setSelectedTown({ Town_Name: assignedAccountantTown });
    }
    if (panel !== 'ceo' && panel !== 'employee') setPanel('ceo');
    if (panel === 'employee' && page !== 'sellFlow') setPage('sellFlow');
    if (panel === 'ceo' && page !== 'townDashboard') setPage('townDashboard');
  }, [loggedIn, userRole, assignedAccountantTown, selectedTown?.Town_Name, panel, page]);


  useEffect(() => {
    if (window.api?.onSyncWarning) {
      window.api.onSyncWarning((msg) => showToast(msg, 'error'));
    }
  }, [showToast]);

  useEffect(() => {
    if (!window.api?.onCloudRefreshProgress) return undefined;
    let hideTimer = null;
    window.api.onCloudRefreshProgress((data = {}) => {
      if (hideTimer) clearTimeout(hideTimer);
      setCloudRefresh({
        visible: true,
        percent: data.percent || 0,
        msg: data.msg || 'Refreshing cloud data...',
      });
      if ((data.percent || 0) >= 100) {
        hideTimer = setTimeout(() => {
          setCloudRefresh((current) => ({ ...current, visible: false }));
        }, 1800);
      }
    });
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      window.api?.removeCloudRefreshProgress?.();
    };
  }, []);

  useEffect(() => {
    if (!window.api?.onCloudDataRefreshed) return undefined;
    window.api.onCloudDataRefreshed((data) => {
      setDataRefreshKey((k) => k + 1);
      try {
        window.dispatchEvent(new CustomEvent('al-siraj-data-refreshed', { detail: data || {} }));
      } catch {}
    });
    return () => window.api?.removeCloudDataRefreshed?.();
  }, []);

  useEffect(() => {
    if (!user?.id || !userRole || !window.api?.configureFileSyncContext) return;
    let cancelled = false;
    window.api.configureFileSyncContext({
      role: userRole,
      userId: user.id,
      accountantTown: userProfile?.town_name || userProfile?.town_id || '',
      agentTown: userProfile?.agent_town || '',
      agentTowns: userProfile?.agent_towns
        ? String(userProfile.agent_towns).split(',').map(t => t.trim()).filter(Boolean)
        : [],
    }).then((res) => {
      if (!cancelled && res && !res.error) {
        setDataRefreshKey((k) => k + 1);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, userRole, userProfile?.agent_town, userProfile?.agent_towns, userProfile?.town_name, userProfile?.town_id]);

  // ─── Real-time desktop notifications ───────────────────────────
  useEffect(() => {
    if (!user?.id || !window.api?.showNotification) return;

    const channels = [];

    if (userRole === 'ceo') {
      const ch = supabase
        .channel('global-appeals')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'appeals' },
          (payload) => {
            const a = payload.new;
            window.api.showNotification(
              'New Appeal: ' + (a.appeal_type || 'Agent'),
              'Agent needs approval for ' + (a.entity_type || '') + ' ' + (a.entity_id || '')
            );
          }
        )
        .subscribe();
      channels.push(ch);
    }

    if (userRole === 'ceo') {
      const ch = supabase
        .channel('global-installments')
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'installments' },
          (payload) => {
            if (payload.new?.Status === 'overdue') {
              window.api.showNotification(
                'Installment Overdue',
                payload.new.Plot_Shop_Number + ' - ' + payload.new.Town_Name + ' is overdue!'
              );
            }
          }
        )
        .subscribe();
      channels.push(ch);
    }

    if (userRole === 'accountant') {
      const ch = supabase
        .channel(`accountant-appeals-${user.id}`)
        .on('postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'appeals',
            filter: `requested_by_user_id=eq.${user.id}`,
          },
          (payload) => {
            const a = payload.new;
            if (a?.status !== 'rejected') return;
            if (a.appeal_type !== 'backdated_daily_entry' && a.appeal_type !== 'future_daily_entry') return;

            const seenKey = `daily_entry_rejection_notified_${a.id}`;
            if (localStorage.getItem(seenKey)) return;
            localStorage.setItem(seenKey, '1');

            const rd = a.requested_data || {};
            const body = `${rd.type || 'Entry'} ${rd.date || ''} was rejected by CEO`;
            window.api?.sendDailyEntryRejectionEmail?.({
              accountantEmail: user.email,
              accountantName: userProfile?.full_name || user.email || 'Accountant',
              townName: rd.townName,
              entryDate: rd.date,
              entryType: rd.type || 'Entry',
              amount: rd.amount,
              description: rd.description,
              reason: 'Rejected from CEO review',
            }).catch(() => {});
          }
        )
        .subscribe();
      channels.push(ch);
    }

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [user?.id, user?.email, userRole, userProfile?.full_name]);

  // Keep startup visually clean while auth is checked.
  if (!ready) {
    return <StartupSplash />;
  }

  // ─── Not logged in → Show Auth Screen ──────────────────────────────────
  if (!loggedIn) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <AuthScreen
          onLogin={(role, optionsOrMessage) => {
            const loginOptions = typeof optionsOrMessage === 'object' && optionsOrMessage !== null ? optionsOrMessage : {};
            if (role === 'accountant') {
              const assignedTown = loginOptions.townName || assignedAccountantTown;
              if (assignedTown) {
                setPanel('ceo');
                setSelectedTown({ Town_Name: assignedTown });
                setPage('townDashboard');
              } else {
                setPanel('choose');
                setPage('dashboard');
              }
            } else {
              setPanel(role === 'ceo' ? 'ceo' : 'employee');
              setPage(role === 'ceo' ? 'dashboard' : 'sellFlow');
            }
            setLoggedIn(true);
            if (typeof optionsOrMessage === 'string') showToast(optionsOrMessage);
          }}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <CloudRefreshStatus state={cloudRefresh} />
      </>
    );
  }

  // ─── Workspace Selection (Accountant) ──────────────────────────────────
  if (panel === 'choose') {
    return (
      <div className="auth-screen workspace-select-screen">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <div className="auth-screen-bg" />
        <div className="workspace-select-panel auth-enter">
          <div className="auth-brand workspace-select-brand">
            <div className="auth-logo-wrap workspace-select-mark"><span>AS</span></div>
            <h1 className="auth-title">AL SIRAJ DEVELOPERS</h1>
            <p className="auth-subtitle">Select the workspace you want to open.</p>
          </div>
          <div className="workspace-cards">
            <button
              className="workspace-card workspace-card-ceo"
              onClick={() => { setPanel('ceo'); setPage('dashboard'); }}
            >
              <span className="svg-emoji svg-emoji-ceo" aria-hidden="true" />
              <span className="workspace-card-title">CEO Workspace</span>
              <span className="workspace-card-desc">Dashboard, towns, reports, approvals and settings</span>
            </button>
            <button
              className="workspace-card workspace-card-employee"
              onClick={() => { setPanel('employee'); setPage('sellFlow'); }}
            >
              <span className="svg-emoji svg-emoji-agent" aria-hidden="true" />
              <span className="workspace-card-title">Employee Workspace</span>
              <span className="workspace-card-desc">Property selling only. Reports stay inside town dashboard.</span>
            </button>
          </div>
          <div className="workspace-select-footer">
            <button className="btn btn-ghost btn-sm" onClick={logoutCurrentUser}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── CEO full-screen hub (no sidebar) ───────────────────────────────────
  if (panel === 'ceo' && (page === 'dashboard' || page === 'appeals')) {
    return (
      <ErrorBoundary>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <CEOProjectsHub
          activePage={page}
          refreshKey={dataRefreshKey}
          onTownSelect={(town) => { setSelectedTown(town); setPage('townDashboard'); }}
          onLogout={logoutCurrentUser}
          showToast={showToast}
          onNavigate={setPage}
          userRole={userRole}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <CloudRefreshStatus state={cloudRefresh} />
      </ErrorBoundary>
    );
  }

  // ─── TownDashboard (full-screen) ────────────────────────────────────────
  if ((panel === 'ceo' || userRole === 'accountant') && page === 'townDashboard') {
    return (
      <ErrorBoundary>
        {userRole !== 'accountant' && <ThemeToggle theme={theme} onToggle={toggleTheme} />}
        <TownDashboard
          selectedTown={selectedTown}
          refreshKey={dataRefreshKey}
          onBack={() => {
            if (userRole === 'accountant') return;
            setPage('dashboard');
          }}
          showToast={showToast}
          isAccountant={userRole === 'accountant'}
          onSwitchToSelling={() => {
            if (userRole === 'accountant' && assignedAccountantTown) {
              setSelectedTown({ Town_Name: assignedAccountantTown });
            }
            setPanel('employee');
            setPage('sellFlow');
          }}
          onLogout={logoutCurrentUser}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <CloudRefreshStatus state={cloudRefresh} />
      </ErrorBoundary>
    );
  }

  // ─── Sidebar Layout Pages ───────────────────────────────────────────────
  const renderPage = () => {
    const props = {
      showToast,
      panel,
      onNavigate: setPage,
      refreshKey: dataRefreshKey,
      lockedTownName: userRole === 'accountant' ? assignedAccountantTown : '',
    };
    switch (page) {
      case 'dashboard': return <Dashboard {...props} />;
      case 'addTown': return <AddTown {...props} />;
      case 'addProperty': return <AddProperty {...props} />;
      case 'ceoExpenses': return <CeoExpenses {...props} />;
      case 'addEmployee': return <AddEmployee {...props} />;
      case 'resellProperty': return <ResellProperty {...props} />;
      case 'soldProperties': return <SoldProperties {...props} />;
      case 'sellFlow': return <SellFlow {...props} />;
      case 'installments': return <InstallmentTracker {...props} />;
      case 'profitLoss': return <ProfitLossReport {...props} />;
      case 'resellHistory': return <ResellHistory {...props} />;
      case 'commission': return <CommissionTracker {...props} />;
      case 'townPrices': return <TownPrices {...props} />;
      case 'pendingCollections': return <PendingCollections />;
      default: return <Dashboard {...props} />;
    }
  };

  return (
    <div className="app-layout">
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <Sidebar
        panel={panel}
        page={page}
        setPage={setPage}
        userRole={userRole}
        onSwitchWorkspace={() => {
          const newPanel = panel === 'ceo' ? 'employee' : 'ceo';
          if (userRole === 'accountant' && assignedAccountantTown) {
            setSelectedTown({ Town_Name: assignedAccountantTown });
          }
          setPanel(newPanel);
          setPage(newPanel === 'ceo'
            ? (userRole === 'accountant' ? 'townDashboard' : 'dashboard')
            : 'sellFlow');
        }}
        onLogout={logoutCurrentUser}
      />
      <div className="main-content">
        <div className="main-header">
          <div>
            <div className="header-eyebrow">AL SIRAJ DEVELOPERS</div>
            <h2>{PAGE_TITLES[page] || 'Dashboard'}</h2>
          </div>
          <div className="main-header-actions">
            <span className="header-chip">Shared Live Data</span>
            <span className={`panel-badge ${panel}`}>
              {panel === 'ceo'
                ? (userRole === 'accountant' ? 'Accountant — CEO View' : 'CEO Workspace')
                : (userRole === 'accountant' ? 'Accountant — Employee View' : 'Employee Workspace')}
            </span>
          </div>
        </div>
        <div className="main-body">{renderPage()}</div>
        <PoweredByFooter compact />
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <CloudRefreshStatus state={cloudRefresh} />
    </div>
  );
}
