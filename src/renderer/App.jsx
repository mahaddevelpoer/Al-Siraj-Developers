import React, { useState, useEffect, useCallback } from 'react';
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
import { AgentManagement } from './systems/AgentManagementSystem';
import { AgentPropertiesView } from './systems/PropertyViewSystem';
import PendingCollections from './components/PendingCollections';
import AgentRegister from './pages/AuthPages/AgentRegister';
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
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace' }}>
          <h2 style={{ color: '#ef4444' }}>Render Error</h2>
          <pre style={{ background: '#fef2f2', padding: 20, borderRadius: 8, border: '1px solid #fca5a5', whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {this.state.error.stack || this.state.error.message || String(this.state.error)}
          </pre>
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

function LoadingScreen() {
  const steps = ['Loading local Excel data', 'Checking cloud session', 'Preparing workspace'];
  return (
    <div className="app-loading-screen">
      <div className="app-loading-grid" />
      <div className="app-loading-shell">
        <div className="app-loading-mark">
          <span>AS</span>
        </div>
        <div className="app-loading-copy">
          <div className="app-loading-eyebrow">AL SIRAJ DEVELOPERS</div>
          <h1>Real Estate ERP</h1>
          <p>Initializing secure workspace and local records</p>
        </div>
        <div className="app-loading-progress">
          <div className="app-loading-progress-fill" />
        </div>
        <div className="app-loading-steps">
          {steps.map((step, index) => (
            <div className="app-loading-step" key={step} style={{ animationDelay: `${index * 0.22}s` }}>
              <span />
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
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

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

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
    if (user && userRole) { // Wait for both user and userRole to be resolved
      let finalPanel = 'employee';
      let finalPage = 'sellFlow';
      
      if (userRole === 'agent') {
        finalPanel = 'employee';
        finalPage = localStorage.getItem('zameen_page') || 'sellFlow';
      } else if (userRole === 'ceo') {
        finalPanel = 'ceo';
        finalPage = localStorage.getItem('zameen_page') || 'dashboard';
      } else if (userRole === 'accountant') {
        finalPanel = localStorage.getItem('zameen_panel') || 'choose';
        finalPage = localStorage.getItem('zameen_page') || 'dashboard';
      }

      setPanel(finalPanel);
      setPage(finalPage);
      setLoggedIn(true);
      setReady(true);
    } else if (!user) {
      setReady(true);
    }
  }, [authLoading, user, userRole]);

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
    if (window.api?.onSyncWarning) {
      window.api.onSyncWarning((msg) => showToast(msg, 'error'));
    }
  }, [showToast]);

  useEffect(() => {
    if (!user?.id || !userRole || !window.api?.configureFileSyncContext) return;
    window.api.configureFileSyncContext({
      role: userRole,
      userId: user.id,
      agentTown: userProfile?.agent_town || '',
      agentTowns: userProfile?.agent_towns
        ? String(userProfile.agent_towns).split(',').map(t => t.trim()).filter(Boolean)
        : [],
    }).catch(() => {});
  }, [user?.id, userRole, userProfile?.agent_town, userProfile?.agent_towns]);

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

    if (userRole === 'agent' || userRole === 'ceo') {
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

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [user?.id, userRole]);

  // Show a dark loading screen while auth is being checked (prevents white flash after splash)
  if (!ready) {
    return <LoadingScreen />;
  }

  // ─── Not logged in → Show Auth Screen ──────────────────────────────────
  if (!loggedIn) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <AuthScreen
          onLogin={(role) => {
            if (role === 'accountant') {
              setPanel('choose');
              setPage('dashboard');
            } else {
              setPanel(role === 'ceo' ? 'ceo' : 'employee');
              setPage(role === 'ceo' ? 'dashboard' : 'sellFlow');
            }
            setLoggedIn(true);
          }}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
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
              <span className="workspace-card-desc">Sales, properties, collections and installments</span>
            </button>
          </div>
          <div className="workspace-select-footer">
            <button className="btn btn-ghost btn-sm" onClick={() => { localStorage.removeItem('zameen_panel'); localStorage.removeItem('zameen_page'); setLoggedIn(false); setPanel(null); signOut(); }}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (userRole === 'agent' && panel === 'employee' && page === 'agentProperties') {
    return (
      <div className="app-layout">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <Sidebar
          panel={panel}
          page={page}
          setPage={setPage}
          userRole={userRole}
          onSwitchWorkspace={panel === 'ceo' ? undefined : undefined}
          onLogout={() => {
            localStorage.removeItem('zameen_panel');
            localStorage.removeItem('zameen_page');
            setLoggedIn(false);
            setPanel(null);
            setPage('dashboard');
            signOut();
          }}
        />
        <div className="main-content">
          <div className="main-header">
            <div>
              <div className="header-eyebrow">AL SIRAJ DEVELOPERS</div>
              <h2>My Properties</h2>
            </div>
            <div className="main-header-actions">
              <span className="header-chip">Agent View</span>
              <span className="panel-badge employee">Employee Workspace</span>
            </div>
          </div>
          <div className="main-body">
            <AgentPropertiesView />
          </div>
          <PoweredByFooter compact />
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

  // ─── CEO full-screen hub (no sidebar) ───────────────────────────────────
  if (panel === 'ceo' && (page === 'dashboard' || page === 'appeals' || page === 'agents')) {
    return (
      <ErrorBoundary>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <CEOProjectsHub
          activePage={page}
          onTownSelect={(town) => { setSelectedTown(town); setPage('townDashboard'); }}
          onLogout={() => { localStorage.removeItem('zameen_panel'); localStorage.removeItem('zameen_page'); setLoggedIn(false); setPage('dashboard'); signOut(); }}
          showToast={showToast}
          onNavigate={setPage}
          userRole={userRole}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </ErrorBoundary>
    );
  }

  // ─── TownDashboard (full-screen) ────────────────────────────────────────
  if (panel === 'ceo' && page === 'townDashboard') {
    return (
      <ErrorBoundary>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <TownDashboard
          selectedTown={selectedTown}
          onBack={() => setPage('dashboard')}
          showToast={showToast}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </ErrorBoundary>
    );
  }

  // ─── Sidebar Layout Pages ───────────────────────────────────────────────
  const renderPage = () => {
    const props = { showToast, panel, onNavigate: setPage };
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
      case 'agentProperties': return <AgentPropertiesView />;
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
          setPanel(newPanel);
          setPage(newPanel === 'ceo' ? 'dashboard' : 'sellFlow');
        }}
        onLogout={() => {
          localStorage.removeItem('zameen_panel');
          localStorage.removeItem('zameen_page');
          setLoggedIn(false);
          setPanel(null);
          setPage('dashboard');
          signOut();
        }}
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
    </div>
  );
}
