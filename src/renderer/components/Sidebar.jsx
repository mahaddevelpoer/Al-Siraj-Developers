import React, { useState } from 'react';
import { useLang } from '../LanguageContext';
import { LANGUAGES } from '../i18n';
import Settings from './Settings';
import {
  DashboardIcon, TownIcon, ExpenseIcon, EmployeeIcon,
  SoldIcon, CalendarIcon, ChartIcon, SaveIcon, LogoutIcon, SellIcon, LangIcon,
  PropertyIcon, DollarIcon,
} from './Icons';

const PendingIcon = DollarIcon;

const CEO_GROUPS = (t, userRole) => {
  const groups = [
    {
      title: 'Project System',
      items: [
        { key: 'dashboard',      icon: DashboardIcon,   label: t.dashboard },
        { key: 'addTown',        icon: TownIcon,        label: t.addTown },
      ]
    }
  ];

  if (userRole === 'ceo') {
    groups.push({
      title: 'HR System',
      items: [
        { key: 'addEmployee',    icon: EmployeeIcon,    label: t.manageEmployees },
      ]
    });
  }

  groups.push({
      title: 'Finance System',
      items: [
      { key: 'pendingCollections', icon: PendingIcon, label: 'Collections' },
      { key: 'ceoExpenses',    icon: ExpenseIcon,     label: t.ceoExpenses },
      { key: 'profitLoss',     icon: ChartIcon,       label: t.profitLoss },
    ]
  });

  return groups;
};

const EMPLOYEE_GROUPS = (t) => [
  {
    title: 'Property Selling',
    items: [
      { key: 'sellFlow',       icon: SellIcon,        label: t.sellProperty },
    ]
  }
];

export default function Sidebar({ panel, page, setPage, onLogout, userRole, onSwitchWorkspace, collapsed, setCollapsed }) {
  const { t, lang, setLang } = useLang();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [alertModal, setAlertModal] = useState(null);
  const groups = panel === 'ceo' ? CEO_GROUPS(t, userRole) : EMPLOYEE_GROUPS(t);

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: '8px' }}>
        <img 
          src="./logo.png" 
          alt="AL SIRAJ DEVELOPERS" 
          className="sidebar-brand-mark" 
          onClick={() => setCollapsed(!collapsed)} 
          style={{ cursor: 'pointer', width: '36px', height: '36px' }} 
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        />
        {!collapsed && (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginLeft: '12px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>AL SIRAJ</h1>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {panel === 'ceo' ? 'CEO' : 'Sales'}
              </span>
            </div>
            <button 
              onClick={() => setCollapsed(true)} 
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
              title="Collapse Sidebar"
            >
              ⟨
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {groups.map((group, gIdx) => (
          <div key={gIdx} className="sidebar-section">
            {!collapsed && (
              <div className="sidebar-section-title" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8, marginTop: gIdx > 0 ? 16 : 0, fontWeight: 800 }}>
                {group.title}
              </div>
            )}
            {group.items.map(item => {
              const IconComp = item.icon;
              return (
                <div
                  key={item.key}
                  className={`sidebar-item${page === item.key ? ' active' : ''}`}
                  onClick={() => setPage(item.key)}
                  title={collapsed ? item.label : ''}
                >
                  <span className="icon"><IconComp /></span>
                  {!collapsed && <span style={{ marginLeft: '10px' }}>{item.label}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sidebar-section" style={{ marginTop: 'auto', paddingBottom: '16px' }}>
        {!collapsed && <div className="ui-sidebar-divider" style={{ height: '1px', background: 'var(--border-color)', margin: '10px 0' }} />}

        {/* Workspace Switch (CEO & Accountant) */}
        {(userRole === 'ceo' || userRole === 'accountant') && onSwitchWorkspace && (
          <div
            className="sidebar-item"
            onClick={() => onSwitchWorkspace()}
            style={{ color: 'var(--accent-blue)' }}
            title={collapsed ? `Switch Workspace` : ''}
          >
            <span className="icon"><PropertyIcon /></span>
            {!collapsed && <span style={{ marginLeft: '10px' }}>Switch Workspace</span>}
          </div>
        )}

        {/* Language Selector */}
        <div className="ui-sidebar-lang-wrap">
          <div
            className="sidebar-item"
            onClick={() => setShowLangMenu(v => !v)}
            style={{ justifyContent: collapsed ? 'center' : 'space-between' }}
            title={collapsed ? t.language : ''}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span className="icon"><LangIcon /></span>
              {!collapsed && <span style={{ marginLeft: '10px' }}>{t.language}</span>}
            </span>
            {!collapsed && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                {LANGUAGES.find(l => l.code === lang)?.label}
              </span>
            )}
          </div>
          {showLangMenu && !collapsed && (
            <div className="ui-sidebar-lang-menu">
              {LANGUAGES.map(l => (
                <div
                  key={l.code}
                  onClick={() => { setLang(l.code); setShowLangMenu(false); }}
                  className={`ui-sidebar-lang-item${lang === l.code ? ' active' : ''}`}
                  style={{
                    direction: l.dir,
                    fontFamily: l.font || 'inherit',
                  }}
                >
                  {l.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="sidebar-item"
          onClick={async () => {
            if (window.api) {
              const r = await window.api.triggerBackup();
              setAlertModal(r?.success ? `Backup saved to: ${r.location}` : 'Backup failed');
            }
          }}
          title={collapsed ? t.manualBackup : ''}
        >
          <span className="icon"><SaveIcon /></span>
          {!collapsed && <span style={{ marginLeft: '10px' }}>{t.manualBackup}</span>}
        </div>
        
        <div 
          className="sidebar-item" 
          onClick={() => setShowSettings(true)}
          title={collapsed ? 'Settings' : ''}
        >
          <span className="icon"><TownIcon /></span>
          {!collapsed && <span style={{ marginLeft: '10px' }}>Settings</span>}
        </div>

        <div 
          className="sidebar-item" 
          onClick={onLogout} 
          style={{ color: 'var(--accent-red)' }}
          title={collapsed ? t.logout : ''}
        >
          <span className="icon"><LogoutIcon /></span>
          {!collapsed && <span style={{ marginLeft: '10px' }}>{t.logout}</span>}
        </div>
      </div>

      {alertModal && (
        <div className="modal-overlay" onClick={() => setAlertModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:400,padding:24}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700}}>Notification</h3>
            <p style={{margin:'0 0 20px',color:'var(--text-secondary)',fontSize:14,lineHeight:1.6}}>{alertModal}</p>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button className="btn btn-primary" onClick={() => setAlertModal(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
