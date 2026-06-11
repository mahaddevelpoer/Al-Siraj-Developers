import React, { useState } from 'react';
import { useLang } from '../LanguageContext';
import { LANGUAGES } from '../i18n';
import Settings from './Settings';
import {
  DashboardIcon, TownIcon, ExpenseIcon, EmployeeIcon,
  SoldIcon, CalendarIcon, ChartIcon, SaveIcon, LogoutIcon, SellIcon, LangIcon,
  PropertyIcon,
} from './Icons';

const PendingIcon = () => <span style={{ fontSize: 16, lineHeight: 1 }}>{'\u{1F4B0}'}</span>;

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
      { key: 'pendingCollections', icon: PendingIcon, label: '\u{1F4B0} Collections' },
      { key: 'ceoExpenses',    icon: ExpenseIcon,     label: t.ceoExpenses },
      { key: 'profitLoss',     icon: ChartIcon,       label: t.profitLoss },
    ]
  });

  return groups;
};

const EMPLOYEE_GROUPS = (t) => [
  {
    title: 'Sales System',
    items: [
      { key: 'dashboard',      icon: DashboardIcon,   label: t.dashboard },
      { key: 'sellFlow',       icon: SellIcon,        label: t.sellProperty },
      { key: 'agentProperties', icon: PropertyIcon,    label: '\u{1F4CA} My Properties' },
    ]
  },
  {
    title: 'Finance System',
    items: [
      { key: 'pendingCollections', icon: PendingIcon, label: '\u{1F4B0} Collections' },
      { key: 'installments',   icon: CalendarIcon,    label: t.installmentTracker },
      { key: 'soldProperties', icon: SoldIcon,        label: t.soldProperties },
    ]
  }
];

export default function Sidebar({ panel, page, setPage, onLogout, userRole, onSwitchWorkspace }) {
  const { t, lang, setLang } = useLang();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const groups = panel === 'ceo' ? CEO_GROUPS(t, userRole) : EMPLOYEE_GROUPS(t);

  return (
    <div className="sidebar">
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <div className="sidebar-logo">
        <img src="./logo.png" alt="AL SIRAJ DEVELOPERS" className="sidebar-brand-mark" />
        <div>
          <h1>AL SIRAJ DEVELOPERS</h1>
          <span>{panel === 'ceo' ? 'CEO Control Center' : 'Employee Sales Window'}</span>
        </div>
      </div>

      <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {groups.map((group, gIdx) => (
          <div key={gIdx} className="sidebar-section">
            <div className="sidebar-section-title" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8, marginTop: gIdx > 0 ? 16 : 0, fontWeight: 800 }}>
              {group.title}
            </div>
            {group.items.map(item => {
              const IconComp = item.icon;
              return (
                <div
                  key={item.key}
                  className={`sidebar-item${page === item.key ? ' active' : ''}`}
                  onClick={() => setPage(item.key)}
                >
                  <span className="icon"><IconComp /></span>
                  {item.label}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sidebar-section" style={{ marginTop: 'auto' }}>
        <div className="ui-sidebar-divider" />

        {/* Workspace Switch (CEO & Accountant) */}
        {(userRole === 'ceo' || userRole === 'accountant') && onSwitchWorkspace && (
          <div
            className="sidebar-item"
            onClick={() => onSwitchWorkspace()}
            style={{ color: 'var(--accent-blue)' }}
          >
            Switch to {panel === 'ceo' ? 'Employee' : 'CEO'} Workspace
          </div>
        )}

        {/* Language Selector */}
        <div className="ui-sidebar-lang-wrap">
          <div
            className="sidebar-item"
            onClick={() => setShowLangMenu(v => !v)}
            style={{ justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="icon"><LangIcon /></span>
              {t.language}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
              {LANGUAGES.find(l => l.code === lang)?.label}
            </span>
          </div>
          {showLangMenu && (
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
              alert(r?.success ? `Backup saved to: ${r.location}` : 'Backup failed');
            }
          }}
        >
          <span className="icon"><SaveIcon /></span>
          {t.manualBackup}
        </div>
        <div className="sidebar-item" onClick={() => setShowSettings(true)}>
          Settings
        </div>
        <div className="sidebar-item" onClick={onLogout} style={{ color: 'var(--accent-red)' }}>
          <span className="icon"><LogoutIcon /></span>
          {t.logout}
        </div>
      </div>
    </div>
  );
}
