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
import AccountantUnlockScreen from './components/AccountantUnlockScreen';
import LockerAuditBlock from './components/LockerAuditBlock';
import TermsScreen from './components/TermsScreen';
import AppealDashboard from './systems/AppealSystem/AppealDashboard';
import PendingCollections from './components/PendingCollections';
import { LanguageProvider } from './LanguageContext';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { BellIcon } from './components/Icons';
import { playForToast, playNotify, playWarning } from './services/soundService';

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

const BREADCRUMBS = {
  dashboard: ['Dashboard'],
  addTown: ['Dashboard', 'Towns', 'Add Town'],
  addProperty: ['Dashboard', 'Plots & Shops', 'Add Plot'],
  townPrices: ['Dashboard', 'Towns', 'Town Prices Setup'],
  pendingCollections: ['Dashboard', 'Collections', 'Pending Collections'],
  ceoExpenses: ['Dashboard', 'Expenses', 'CEO Expenses'],
  addEmployee: ['Dashboard', 'Employees', 'Manage Employees'],
  resellProperty: ['Dashboard', 'Properties', 'Resell Property'],
  soldProperties: ['Dashboard', 'Properties', 'Sold Properties'],
  sellFlow: ['Dashboard', 'Properties', 'Sell Property'],
  installments: ['Dashboard', 'Collections', 'Installment Tracker'],
  profitLoss: ['Dashboard', 'Reports', 'Profit & Loss'],
  resellHistory: ['Dashboard', 'Properties', 'Resell History'],
  commission: ['Dashboard', 'Collections', 'Commission Tracker'],
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
            <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.6, margin: '0 0 16px' }}>An error occurred on this screen. You can continue by reloading the app or resetting the saved screen.</p>
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

const SFX_CACHE_KEY = 'al_siraj_sfx_cache_v1';
const SFX_URLS_KEY = 'al_siraj_sfx_urls_v1';
const DEFAULT_SFX_URLS = {
  success: '',
  error: '',
  warning: '',
  validation: '',
  info: '',
};

function readJsonStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readSfxUrls() {
  const saved = readJsonStorage(SFX_URLS_KEY, {});
  const fromWindow = window.AL_SIRAJ_SFX_URLS && typeof window.AL_SIRAJ_SFX_URLS === 'object'
    ? window.AL_SIRAJ_SFX_URLS
    : {};
  return { ...DEFAULT_SFX_URLS, ...saved, ...fromWindow };
}

function bufferToDataUrl(buffer, mime = 'audio/mpeg') {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function primeRemoteSfxCache({ silent = true } = {}) {
  if (!navigator.onLine || !window.fetch) return { success: false, skipped: true };
  const urls = readSfxUrls();
  const cache = readJsonStorage(SFX_CACHE_KEY, {});
  let changed = false;
  const results = [];

  for (const [type, url] of Object.entries(urls)) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || cache[type]?.url === cleanUrl || !/^https?:\/\//i.test(cleanUrl)) continue;
    try {
      const response = await fetch(cleanUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!/^audio\//i.test(blob.type || 'audio/mpeg')) throw new Error('Not an audio file');
      if (blob.size > 650_000) throw new Error('SFX file too large; keep under 650KB');
      const dataUrl = bufferToDataUrl(await blob.arrayBuffer(), blob.type || 'audio/mpeg');
      cache[type] = { url: cleanUrl, dataUrl, cachedAt: new Date().toISOString() };
      changed = true;
      results.push({ type, ok: true });
    } catch (e) {
      results.push({ type, ok: false, error: e.message });
      if (!silent) throw e;
    }
  }

  if (changed) localStorage.setItem(SFX_CACHE_KEY, JSON.stringify(cache));
  return { success: true, changed, results };
}

function playCachedSfx(type) {
  try {
    const cache = readJsonStorage(SFX_CACHE_KEY, {});
    const item = cache[type] || cache.info;
    if (!item?.dataUrl) return false;
    const audio = new Audio(item.dataUrl);
    audio.volume = type === 'error' ? 0.62 : 0.50;
    audio.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function playSynthSfx(type = 'info') {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.12, now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
    master.connect(context.destination);

    const patterns = {
      success: [
        [523.25, 0.00, 0.12, 'sine'],
        [659.25, 0.10, 0.13, 'sine'],
        [783.99, 0.22, 0.18, 'triangle'],
      ],
      error: [
        [246.94, 0.00, 0.16, 'sawtooth'],
        [185.00, 0.15, 0.22, 'sawtooth'],
      ],
      warning: [
        [392.00, 0.00, 0.11, 'triangle'],
        [392.00, 0.18, 0.11, 'triangle'],
      ],
      validation: [
        [330.00, 0.00, 0.08, 'square'],
        [277.18, 0.10, 0.12, 'square'],
      ],
      info: [
        [523.25, 0.00, 0.12, 'sine'],
        [659.25, 0.12, 0.14, 'triangle'],
      ],
    };

    const selected = patterns[type] || patterns.info;
    selected.forEach(([freq, delay, duration, wave]) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(type === 'error' ? 0.08 : 0.065, now + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + delay);
      osc.stop(now + delay + duration + 0.03);
    });
    setTimeout(() => context.close?.().catch?.(() => {}), 760);
  } catch {}
}

function playNotificationChime(type = 'info') {
  if (type === 'error') return playForToast('error');
  if (type === 'warning' || type === 'validation') return playWarning();
  if (type === 'success') return playForToast('success');
  playNotify();
  return;
  if (playCachedSfx(type)) return;
  playSynthSfx(type);
}

function GlobalBellCenter({ items, open, onToggle, onClear, embedded = false }) {
  const unread = items.filter((item) => !item.read).length;
  return (
    <div className={`global-bell-center${embedded ? ' embedded' : ''}`}>
      <button className="global-bell-button" type="button" onClick={onToggle} title="Notifications">
        <BellIcon size={18} />
        {unread > 0 && <span>{unread}</span>}
      </button>
      {open && (
        <div className="global-bell-popover">
          <div className="global-bell-head">
            <strong>Notification Center</strong>
            <button type="button" onClick={onClear}>Clear</button>
          </div>
          <div className="global-bell-list">
            {items.length ? items.map((item) => (
              <div key={item.id} className={`global-bell-item ${item.type || ''}`}>
                <b>{item.title}</b>
                <p>{item.message}</p>
                <small>{item.time}</small>
              </div>
            )) : (
              <div className="global-bell-empty">No business alerts yet.</div>
            )}
          </div>
        </div>
      )}
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

  // Phase 5: Input Focus Recovery for Electron "dead click" bug
  useEffect(() => {
    const handleInputClick = (e) => {
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        setTimeout(() => target.focus(), 10);
      }
    };
    document.addEventListener('mousedown', handleInputClick);
    return () => document.removeEventListener('mousedown', handleInputClick);
  }, []);

  const [auditDue, setAuditDue] = useState(null);
  const [selectedTown, setSelectedTown] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('zameen_theme') || 'light');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [cloudRefresh, setCloudRefresh] = useState({ visible: false, percent: 0, msg: '' });
  const [bellOpen, setBellOpen] = useState(false);
  const [bellItems, setBellItems] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('al_siraj_bell_items') || '[]');
      return Array.isArray(saved) ? saved.slice(0, 80) : [];
    } catch {
      return [];
    }
  });
  const [termsAccepted, setTermsAccepted] = useState(() => {
    return localStorage.getItem('al_siraj_terms_accepted') === '1';
  });
  const sessionHydratedRef = useRef(false);

  const assignedAccountantTown = userRole === 'accountant'
    ? String(userProfile?.town_name || userProfile?.town_id || '').trim()
    : '';

  const needsAccountantUnlock = React.useMemo(() => {
    if (userRole) return false;
    try {
      const saved = JSON.parse(localStorage.getItem('al_siraj_local_accountant_session') || 'null');
      if (saved?.profile?.role === 'accountant' && saved?.profile?.admin_password_set) {
        const sessionUnlocked = sessionStorage.getItem('al_siraj_accountant_unlocked_this_session') === '1';
        return !sessionUnlocked;
      }
    } catch {}
    return false;
  }, [userRole]);

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

  const pushBell = useCallback((title, message, type = 'info') => {
    setBellItems((items) => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      message,
      type,
      read: false,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }, ...items].slice(0, 80));
    playNotificationChime(type);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('al_siraj_bell_items', JSON.stringify(bellItems.slice(0, 80)));
    } catch {}
  }, [bellItems]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    const shouldBell = type === 'error' || type === 'warning' || /report|pdf|receipt|sync|approved|rejected/i.test(String(message || ''));
    if (!shouldBell) {
      playNotificationChime(type === 'success' ? 'success' : 'info');
    }
    if (type === 'error' || type === 'warning') {
      pushBell(type === 'error' ? 'Action needs attention' : 'Business alert', message, type);
    } else if (/report|pdf|receipt|sync|approved|rejected/i.test(String(message || ''))) {
      pushBell('Business update', message, type);
    }
  }, [pushBell]);

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
    let cancelled = false;
    const run = async (reason = 'startup') => {
      const before = localStorage.getItem(SFX_CACHE_KEY) || '';
      const result = await primeRemoteSfxCache();
      if (cancelled || !result?.changed) return;
      const after = localStorage.getItem(SFX_CACHE_KEY) || '';
      if (after && after !== before) {
        pushBell('Sound effects ready', `SFX downloaded for offline use (${reason}).`, 'success');
      }
    };
    if (navigator.onLine) setTimeout(() => run('startup'), 1200);
    const onOnline = () => run('online');
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [pushBell]);

  useEffect(() => {
    const onInvalid = () => playNotificationChime('validation');
    document.addEventListener('invalid', onInvalid, true);
    return () => document.removeEventListener('invalid', onInvalid, true);
  }, []);

  useEffect(() => {
    const scanLocalPendingAppeals = async () => {
      const now = Date.now();

      // ── 1. Read from localStorage (fast, same-session) ──────────────────────
      Object.keys(localStorage)
        .filter((key) => key.startsWith('al_siraj_pending_appeals_'))
        .forEach((key) => {
          let items = [];
          try { items = JSON.parse(localStorage.getItem(key) || '[]'); } catch { items = []; }
          if (!Array.isArray(items) || !items.length) return;
          let changed = false;
          const next = [];
          items.forEach((item) => {
            const created = Date.parse(item.createdAt || 0) || now;
            if (now - created > 24 * 60 * 60 * 1000) {
              changed = true;
              pushBell('Pending appeal expired', `${item.townName || 'Town'} ${item.type || 'appeal'} removed after 24 hours.`, 'warning');
              return;
            }
            const nextReminder = Date.parse(item.nextReminderAt || 0) || 0;
            if (nextReminder <= now) {
              item.nextReminderAt = new Date(now + 2 * 60 * 60 * 1000).toISOString();
              changed = true;
              pushBell('Pending CEO approval', `${item.townName || 'Town'} has a local pending appeal waiting for approval.`, 'warning');
            }
            next.push(item);
          });
          if (changed) localStorage.setItem(key, JSON.stringify(next.slice(0, 200)));
        });

      // ── 2. Read from Excel-backed persistent store (survives restart) ───────
      try {
        if (window.api?.getLocalPendingAppeals) {
          const res = await window.api.getLocalPendingAppeals();
          if (res?.data && Array.isArray(res.data)) {
            for (const appeal of res.data) {
              if (appeal.reminderDue) {
                pushBell(
                  'Connect Internet — Pending Approval',
                  `${appeal.townName || 'Town'} has a pending ${appeal.type || 'appeal'} awaiting CEO approval. Expires: ${appeal.expiresAt ? new Date(appeal.expiresAt).toLocaleTimeString() : '24h'}`,
                  'warning'
                );
              }
            }
          }
        }
      } catch (_) {}
    };
    scanLocalPendingAppeals();
    const timer = setInterval(scanLocalPendingAppeals, 60_000);
    return () => clearInterval(timer);
  }, [pushBell]);

  useEffect(() => {
    if (!loggedIn || !navigator.onLine) return;
    const uploadLocalAppeals = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: null }));
        // Let it proceed even if not authenticated via Supabase because we use the admin password logic
        if (!window.api?.getLocalPendingAppeals) return;
        
        const res = await window.api.getLocalPendingAppeals();
        if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
          for (const appeal of res.data) {
            // Add fallback parameters
            const localSession = JSON.parse(localStorage.getItem('al_siraj_local_accountant_session') || '{}');
            const fallbackUserId = localSession?.profile?.id || '00000000-0000-0000-0000-000000000000';
            const fallbackRole = localSession?.profile?.role || 'accountant';

            const payloadParams = {
              p_requested_by_user_id: authData?.user?.id || fallbackUserId,
              p_requested_by_role: authData?.user?.user_metadata?.role || fallbackRole,
              p_appeal_type: appeal.payload?.appeal_type || appeal.type || 'general',
              p_entity_type: appeal.payload?.entity_type || 'system',
              p_entity_id: String(appeal.payload?.entity_id || ''),
              p_town_name: appeal.payload?.town_name || appeal.townName || '',
              p_requested_data: appeal.payload?.requested_data || {},
              p_reason: appeal.payload?.reason || appeal.description || 'Offline appeal synced'
            };
            const { error } = await supabase.rpc('create_business_appeal', payloadParams);
            
            if (!error || error.message.toLowerCase().includes('duplicate') || error.message.toLowerCase().includes('already exists')) {
              if (window.api.dismissLocalPendingAppeal) {
                await window.api.dismissLocalPendingAppeal(appeal.id);
              }
              Object.keys(localStorage).filter(k => k.startsWith('al_siraj_pending_appeals_')).forEach(k => {
                try {
                  const items = JSON.parse(localStorage.getItem(k) || '[]');
                  const filtered = items.filter(i => i.id !== appeal.id);
                  localStorage.setItem(k, JSON.stringify(filtered));
                } catch (_) {}
              });
              pushBell('Offline Appeal Synced', `${appeal.townName || 'Town'} appeal has been uploaded to the online database.`, 'success');
              
              // Trigger local UI refresh
              window.dispatchEvent(new CustomEvent('al-siraj-business-data-changed', {
                detail: { townName: appeal.townName, events: ['appeal:synced'] },
              }));
            }
          }
        }
      } catch (e) {
        console.error('Failed to sync local appeals:', e);
      }
    };
    
    uploadLocalAppeals();
    const timer = setInterval(uploadLocalAppeals, 30_000);
    return () => clearInterval(timer);
  }, [loggedIn, pushBell]);



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
    if (userRole !== 'accountant' && panel === 'employee' && page !== 'sellFlow') {
      localStorage.setItem('zameen_page', 'sellFlow');
      setPage('sellFlow');
    }
  }, [panel, page, userRole]);

  useEffect(() => {
    if (!loggedIn) return;
    if (userRole !== 'accountant') return;
    if (!assignedAccountantTown) return;
    if (selectedTown?.Town_Name !== assignedAccountantTown) {
      setSelectedTown({ Town_Name: assignedAccountantTown });
    }
    if (panel !== 'ceo') setPanel('ceo');
    if (page !== 'townDashboard') setPage('townDashboard');
  }, [loggedIn, userRole, assignedAccountantTown, selectedTown?.Town_Name, panel, page]);
  useEffect(() => {
    async function checkLockerAudit() {
      if (userRole !== 'accountant' || !selectedTown?.Town_Name) {
        setAuditDue(null);
        return;
      }
      try {
        const settings = await window.api.getSystemSettings();
        if (settings?.locker_audit_enabled === false || settings?.locker_audit_enabled === 'false') {
          setAuditDue(null);
          return;
        }
        
        const schedule = await window.api.getLockerAuditSchedule({ townName: selectedTown.Town_Name });
        if (schedule && !schedule.error) {
          setAuditDue(schedule);
        } else {
          setAuditDue(null);
        }
      } catch (err) {
        console.error('Error checking locker audit:', err);
      }
    }
    checkLockerAudit();
  }, [selectedTown?.Town_Name, userRole, cloudRefresh]);

  useEffect(() => {
    if (window.api?.onSyncWarning) {
      window.api.onSyncWarning((msg) => {
        const text = typeof msg === 'object' ? (msg.message || msg.error || JSON.stringify(msg)) : String(msg || '');
        showToast(text, 'error');
      });
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
    if (!window.api?.onSyncToCloudProgress) return undefined;
    let hideTimer = null;
    window.api.onSyncToCloudProgress((percent, msg) => {
      if (hideTimer) clearTimeout(hideTimer);
      setCloudRefresh({
        visible: true,
        percent: percent || 0,
        msg: msg || 'Uploading local changes to database...',
      });
      if ((percent || 0) >= 100) {
        hideTimer = setTimeout(() => {
          setCloudRefresh((current) => ({ ...current, visible: false }));
        }, 1800);
      }
    });
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      window.api?.removeSyncToCloudProgress?.();
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
    if (!window.api?.onBusinessDataChanged) return undefined;
    window.api.onBusinessDataChanged((change = {}) => {
      setDataRefreshKey((k) => k + 1);
      try {
        localStorage.setItem('al_siraj_last_business_change', JSON.stringify(change));
        window.dispatchEvent(new CustomEvent('al-siraj-business-data-changed', { detail: change }));
      } catch {}
      const events = Array.isArray(change.events) ? change.events : [];
      if (events.includes('receipt:created') || events.includes('report:created')) {
        pushBell('Document ready', 'A receipt or report was updated. Related screens are refreshing now.', 'success');
      }
      if (events.includes('sync:success')) {
        playNotificationChime('success');
      }
      if (events.includes('sync:failed')) {
        pushBell('Sync failed', 'Cloud sync failed. Local Excel data is still saved.', 'error');
      }
      if (events.includes('sync:queued')) {
        pushBell('Saved locally', 'Cloud sync will retry automatically. Your local Excel data is safe.', 'warning');
      }
    });
    return () => window.api?.removeBusinessDataChanged?.();
  }, [pushBell]);

  useEffect(() => {
    if (!loggedIn || !window.api?.syncToCloud) return undefined;
    let busy = false;
    let mounted = true;

    const refreshPendingStatus = async () => {
      if (!window.api?.getPendingSyncStatus) return null;
      try {
        const status = await window.api.getPendingSyncStatus();
        if (status?.error) return null;
        return status;
      } catch {
        return null;
      }
    };

    const uploadPending = async (reason = 'auto') => {
      if (busy || !navigator.onLine) return;
      busy = true;
      try {
        const before = await refreshPendingStatus();
        if (before?.count > 0) {
          showToast(`${before.count} offline change(s) are syncing to the database...`, 'warning');
        }
        const res = await window.api.syncToCloud();
        if (!mounted) return;
        if (res?.error) {
          showToast(`Auto cloud sync failed: ${res.error}`, 'error');
          return;
        }
        const after = await refreshPendingStatus();
        if (before?.count > 0 || reason === 'online') {
          const left = Number(after?.count || 0);
          showToast(left > 0 ? `${left} change(s) are still pending.` : 'Offline changes have been saved to the database.', left > 0 ? 'warning' : 'success');
        }
      } finally {
        busy = false;
      }
    };

    const onOnline = () => uploadPending('online');
    const onOffline = () => showToast('Offline mode active. Changes will be saved to Excel and synced when internet is available.', 'warning');

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(() => uploadPending('interval'), 120000);
    if (navigator.onLine) setTimeout(() => uploadPending('startup'), 2500);

    return () => {
      mounted = false;
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loggedIn, showToast]);

  useEffect(() => {
    if (!loggedIn || userRole !== 'accountant' || !assignedAccountantTown || !window.api?.getDueInstallments) return;
    let cancelled = false;
    const run = async () => {
      try {
        const rows = await window.api.getDueInstallments();
        if (cancelled || !Array.isArray(rows)) return;
        const townRows = rows.filter((row) => String(row.Town_Name || row.townName || '') === String(assignedAccountantTown));
        if (!townRows.length) return;
        const todayKey = new Date().toISOString().slice(0, 10);
        const overdue = townRows.filter((row) => String(row.Status || '').toLowerCase() === 'overdue').length;
        const dueAmount = townRows.reduce((sum, row) => sum + (Number(row.Monthly_Amount || row.Amount || row.Installment_Amount) || 0), 0);
        const reminderKey = `installment_due_reminder_${assignedAccountantTown}_${todayKey}_${townRows.length}_${Math.round(dueAmount)}`;
        if (localStorage.getItem(reminderKey)) return;
        localStorage.setItem(reminderKey, '1');
        const title = overdue ? `${overdue} Overdue Installment(s)` : `${townRows.length} Installment Reminder(s)`;
        const body = `${assignedAccountantTown}: ${townRows.length} due/overdue installment(s), total PKR ${Math.round(dueAmount).toLocaleString()}`;
        try {
          const lead = new Date();
          lead.setDate(lead.getDate() + 7);
          const report = await window.api?.exportDueInstallmentsReport?.({
            townName: assignedAccountantTown,
            fromDate: todayKey,
            toDate: lead.toISOString().slice(0, 10),
            leadDays: 7,
          });
          if (report && !report.error) {
            pushBell('Due installment PDF ready', `${assignedAccountantTown}: follow-up report saved in Media.`, 'warning');
          }
        } catch (_) {}
        window.api?.showNotification?.(title, body);
        showToast(body, overdue ? 'error' : 'warning');
      } catch (_) {}
    };
    run();
    const timer = setInterval(run, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loggedIn, userRole, assignedAccountantTown, showToast, pushBell]);

  useEffect(() => {
    if (!loggedIn) return undefined;
    const runDailyReportReminder = async (force = false) => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const key = `daily_ceo_reports_${today}`;
      const state = localStorage.getItem(key);
      let reportHour = 20;
      try {
        const settings = await window.api?.getDailyReportSettings?.();
        if (settings?.enabled === false) return;
        const parsedHour = Number(String(settings?.reportTime || '20:00').split(':')[0]);
        if (!Number.isNaN(parsedHour)) reportHour = parsedHour;
      } catch (_) {}
      const reminderHour = Math.max(0, reportHour - 1);
      if (!force && (now.getHours() < reminderHour || state === 'reminded')) return;
      if (force && now.getHours() < reminderHour && state !== 'pending') return;
      localStorage.setItem(key, navigator.onLine ? 'reminded' : 'pending');
      pushBell('Please use internet for CEO daily reports', 'Daily town reports need internet so CEO app can receive the final receipt notification.', 'warning');
      window.api?.showNotification?.('CEO daily reports', 'Please use internet for CEO daily reports.');
    };
    runDailyReportReminder();
    const timer = setInterval(runDailyReportReminder, 60 * 1000);
    const online = () => runDailyReportReminder(true);
    window.addEventListener('online', online);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', online);
    };
  }, [loggedIn, pushBell]);

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

    if (userRole === 'accountant') {
      const accountantTown = userProfile?.town_name || userProfile?.town_id || '';
      const ch = supabase
        .channel('global-installments')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'installments' },
          (payload) => {
            const row = payload.new || {};
            const status = String(row.Status || row.status || '').toLowerCase();
            const town = row.Town_Name || row.town_name || '';
            const dueDate = row.Due_Date || row.due_date || '';
            const lead = new Date();
            lead.setDate(lead.getDate() + 7);
            const leadDate = lead.toISOString().split('T')[0];
            const inWindow = dueDate && dueDate <= leadDate;
            if ((!accountantTown || town === accountantTown) && status !== 'paid' && inWindow) {
              window.api.showNotification(
                status === 'overdue' ? 'Installment Overdue' : 'Installment Reminder',
                `${row.Plot_Shop_Number || row.plot_shop_number || 'Property'} - ${town || 'Town'} due on ${dueDate}`
              );
            }
          }
        )
        .subscribe();
      channels.push(ch);
    }

    if (userRole === 'accountant') {
      const fetchMissedAppeals = async () => {
        try {
          const { data: missed } = await supabase
            .from('appeals')
            .select('*')
            .eq('requested_by_user_id', user.id)
            .in('status', ['approved', 'rejected'])
            .gte('updated_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()); // last 3 days
            
          if (missed) {
            for (const a of missed) {
              const type = a.appeal_type || '';
              const status = a.status;
              if (type === 'backdated_daily_entry' || type === 'future_daily_entry') {
                if (status === 'approved') {
                  const seenApprovedKey = `daily_entry_approval_notified_${a.id}`;
                  if (localStorage.getItem(seenApprovedKey)) continue;
                  localStorage.setItem(seenApprovedKey, '1');
                  const rd = a.requested_data || {};
                  
                  if (rd.date && rd.townName && window.api?.addDailyEntry) {
                    const appealStableId = 'APP-' + String(a.id || '').replace(/-/g, '');
                    await window.api.addDailyEntry({
                      ...rd,
                      Entry_ID: appealStableId,
                      entryId: appealStableId,
                      reviewStatus: 'approved',
                      date: rd.date,
                      time: rd.time || '00:00',
                      type: rd.type || 'Expense',
                      description: rd.description || '',
                      amount: parseFloat(rd.amount) || 0,
                      townName: rd.townName,
                    }).catch(() => {});
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('Failed to fetch missed appeals:', e);
        }
      };
      fetchMissedAppeals();

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
            const type = a.appeal_type || '';
            const status = a.status;

            if (type === 'backdated_daily_entry' || type === 'future_daily_entry') {
              if (status === 'approved') {
                const seenApprovedKey = `daily_entry_approval_notified_${a.id}`;
                if (localStorage.getItem(seenApprovedKey)) return;
                localStorage.setItem(seenApprovedKey, '1');
                const rd = a.requested_data || {};
                const body = `${rd.type || 'Entry'} ${rd.date || ''} approved by CEO`;
                showToast(body, 'success');
                window.api?.showNotification?.('Daily Entry Approved', body);
                // Directly write the approved entry to local Excel + money ledger.
                // Use the same stable ID the ceo_review_appeal RPC generates so
                // duplicate detection in addDailyEntry prevents double-writing.
                if (rd.date && rd.townName && window.api?.addDailyEntry) {
                  const appealStableId = 'APP-' + String(a.id || '').replace(/-/g, '');
                  await window.api.addDailyEntry({
                    ...rd,
                    Entry_ID: appealStableId,
                    entryId: appealStableId,
                    reviewStatus: 'approved',
                    date: rd.date,
                    time: rd.time || '00:00',
                    type: rd.type || 'Expense',
                    description: rd.description || '',
                    amount: parseFloat(rd.amount) || 0,
                    townName: rd.townName,
                  }).catch(() => {});
                }
                window.api?.syncFromCloud?.().then(() => {
                  setDataRefreshKey((k) => k + 1);
                }).catch(() => {
                  setDataRefreshKey((k) => k + 1);
                });
                return;
              }


              if (status === 'rejected') {
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
                showToast(body, 'error');
                window.api?.showNotification?.('Daily Entry Rejected', body);
                setDataRefreshKey((k) => k + 1);
                return;
              }
            }

            if (type === 'custom_installment_plan' || type === 'date_change' || type === 'date_change_otp') {
              const seenKey = `appeal_updated_notified_${a.id}_${status}`;
              if (localStorage.getItem(seenKey)) return;
              localStorage.setItem(seenKey, '1');

              const rd = a.requested_data || {};
              const title = type === 'custom_installment_plan' ? 'Installment Plan' : 'Date Change Request';
              const body = `${title} has been ${status} by CEO`;
              showToast(body, status === 'approved' ? 'success' : 'error');
              window.api?.showNotification?.(`${title} ${status.toUpperCase()}`, body);
              
              window.api?.syncFromCloud?.().then(() => {
                setDataRefreshKey((k) => k + 1);
              }).catch(() => {
                setDataRefreshKey((k) => k + 1);
              });
              return;
            }

            if (type === 'salary_increase') {
              if (status === 'approved') {
                const seenKey = `salary_increase_approval_notified_${a.id}`;
                if (localStorage.getItem(seenKey)) return;
                localStorage.setItem(seenKey, '1');
                const rd = a.requested_data || {};
                const body = `Salary increase for ${rd.employeeName || 'Employee'} approved by CEO`;
                showToast(body, 'success');
                window.api?.showNotification?.('Salary Increase Approved', body);
                window.api?.syncFromCloud?.().then(() => {
                  setDataRefreshKey((k) => k + 1);
                }).catch(() => {
                  setDataRefreshKey((k) => k + 1);
                });
                return;
              }
              if (status === 'rejected') {
                const seenKey = `salary_increase_rejection_notified_${a.id}`;
                if (localStorage.getItem(seenKey)) return;
                localStorage.setItem(seenKey, '1');
                const rd = a.requested_data || {};
                const body = `Salary increase for ${rd.employeeName || 'Employee'} was rejected by CEO`;
                showToast(body, 'error');
                window.api?.showNotification?.('Salary Increase Rejected', body);
                setDataRefreshKey((k) => k + 1);
                return;
              }
            }

            if (type === 'delete_employee') {
              if (status === 'approved') {
                const seenKey = `delete_employee_approval_notified_${a.id}`;
                if (localStorage.getItem(seenKey)) return;
                localStorage.setItem(seenKey, '1');
                const rd = a.requested_data || {};
                const body = `Employee ${rd.employeeName || 'Employee'} deletion approved by CEO`;
                showToast(body, 'success');
                window.api?.showNotification?.('Employee Deleted', body);
                window.api?.syncFromCloud?.().then(() => {
                  setDataRefreshKey((k) => k + 1);
                }).catch(() => {
                  setDataRefreshKey((k) => k + 1);
                });
                return;
              }
              if (status === 'rejected') {
                const seenKey = `delete_employee_rejection_notified_${a.id}`;
                if (localStorage.getItem(seenKey)) return;
                localStorage.setItem(seenKey, '1');
                const rd = a.requested_data || {};
                const body = `Employee ${rd.employeeName || 'Employee'} deletion was rejected by CEO`;
                showToast(body, 'error');
                window.api?.showNotification?.('Employee Deletion Rejected', body);
                setDataRefreshKey((k) => k + 1);
                return;
              }
            }

            if (type === 'delete_daily_entry') {
              if (status === 'approved') {
                const seenKey = `delete_daily_entry_approval_notified_${a.id}`;
                if (localStorage.getItem(seenKey)) return;
                localStorage.setItem(seenKey, '1');
                const body = `Daily entry deletion approved by CEO`;
                showToast(body, 'success');
                window.api?.showNotification?.('Daily Entry Deleted', body);
                window.api?.syncFromCloud?.().then(() => {
                  setDataRefreshKey((k) => k + 1);
                }).catch(() => {
                  setDataRefreshKey((k) => k + 1);
                });
                return;
              }
              if (status === 'rejected') {
                const seenKey = `delete_daily_entry_rejection_notified_${a.id}`;
                if (localStorage.getItem(seenKey)) return;
                localStorage.setItem(seenKey, '1');
                const body = `Daily entry deletion was rejected by CEO`;
                showToast(body, 'error');
                window.api?.showNotification?.('Daily Entry Deletion Rejected', body);
                setDataRefreshKey((k) => k + 1);
                return;
              }
            }
          }
        )
        .subscribe();
      channels.push(ch);
    }

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [user?.id, user?.email, userRole, userProfile?.full_name, userProfile?.town_name, userProfile?.town_id]);

  const bellNode = loggedIn ? (
    <GlobalBellCenter
      items={bellItems}
      open={bellOpen}
      onToggle={() => {
        const next = !bellOpen;
        setBellOpen(next);
        if (next) setBellItems((items) => items.map((item) => ({ ...item, read: true })));
      }}
      onClear={() => {
        setBellItems([]);
        try { localStorage.removeItem('al_siraj_bell_items'); } catch {}
      }}
    />
  ) : null;
  const headerBellNode = loggedIn ? (
    <GlobalBellCenter
      items={bellItems}
      open={bellOpen}
      embedded
      onToggle={() => {
        const next = !bellOpen;
        setBellOpen(next);
        if (next) setBellItems((items) => items.map((item) => ({ ...item, read: true })));
      }}
      onClear={() => {
        setBellItems([]);
        try { localStorage.removeItem('al_siraj_bell_items'); } catch {}
      }}
    />
  ) : null;

  // Keep startup visually clean while auth is checked.
  if (!ready) {
    return <StartupSplash />;
  }



  // ─── Security Locker Audit Lock ────
  if (auditDue) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <LockerAuditBlock 
          townName={selectedTown?.Town_Name}
          scheduleData={auditDue}
          onAuditCompleted={() => {
            setAuditDue(null);
            setToast({ message: 'Locker audit submitted and verified successfully!', type: 'success' });
            if (window.api?.triggerSyncUp) window.api.triggerSyncUp();
          }}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <CloudRefreshStatus state={cloudRefresh} />
      </>
    );
  }

  // ─── Not logged in → Show Auth Screen or Accountant Unlock Screen ────
  if (!loggedIn) {
    if (needsAccountantUnlock) {
      return (
        <>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <AccountantUnlockScreen
            onUnlock={(profile) => {
              const town = profile?.town_name || profile?.town_id || '';
              if (town) {
                setPanel('ceo');
                setSelectedTown({ Town_Name: town });
                setPage('townDashboard');
              } else {
                setPanel('choose');
                setPage('dashboard');
              }
              setLoggedIn(true);
            }}
          />
          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
          {bellNode}
          <CloudRefreshStatus state={cloudRefresh} />
        </>
      );
    }

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
        {bellNode}
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
        {bellNode}
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
          notificationBell={headerBellNode}
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
              setPanel('ceo');
              setPage('townDashboard');
              return;
            }
            setPanel('employee');
            setPage('sellFlow');
          }}
          onLogout={logoutCurrentUser}
          notificationBell={headerBellNode}
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

  if (!termsAccepted) {
    return (
      <TermsScreen onAccept={() => {
        localStorage.setItem('al_siraj_terms_accepted', '1');
        setTermsAccepted(true);
      }} />
    );
  }

  return (
    <div className={`app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <Sidebar
        panel={panel}
        page={page}
        setPage={setPage}
        userRole={userRole}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
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
            <div className="breadcrumbs" style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 800 }}>
              {BREADCRUMBS[page]?.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span style={{ opacity: 0.5 }}>/</span>}
                  <span style={{ color: idx === BREADCRUMBS[page].length - 1 ? 'var(--text-primary)' : 'inherit' }}>
                    {crumb}
                  </span>
                </React.Fragment>
              )) || <span>Dashboard</span>}
            </div>
            <h2>{PAGE_TITLES[page] || 'Dashboard'}</h2>
          </div>
          <div className="main-header-actions">
            <span className="header-chip">Shared Live Data</span>
            <span className={`panel-badge ${panel}`}>
              {panel === 'ceo'
                ? (userRole === 'accountant' ? 'Accountant — CEO View' : 'CEO Workspace')
                : (userRole === 'accountant' ? 'Accountant — Employee View' : 'Employee Workspace')}
            </span>
            {headerBellNode}
          </div>
        </div>
        <div className="main-body fade-in-page" key={page}>{renderPage()}</div>
        <PoweredByFooter compact />
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {panel === 'choose' ? bellNode : null}
      <CloudRefreshStatus state={cloudRefresh} />
    </div>
  );
}
