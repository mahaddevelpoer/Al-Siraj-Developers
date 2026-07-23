import React, { useState, useEffect } from 'react';
import { BellIcon } from './Icons';

export default function NotificationPanel({ notifications, onRefresh, showToast }) {
  const [filter, setFilter] = useState('all');
  const [promptModal, setPromptModal] = useState(null);
  const [promptValue, setPromptValue] = useState('');
  const safeNotifications = Array.isArray(notifications) ? notifications : [];

  const filtered = safeNotifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'due') return n.Type === 'Due';
    if (filter === 'overdue') return n.Type === 'Overdue';
    if (filter === 'warning') return n.Type === 'Warning';
    return true;
  });

  const handleMarkPaid = () => {
    showToast?.('Open Installment Tracker and select a payment account before receiving installment payment.', 'info');
  };

  const handleExtend = (n) => {
    setPromptValue(n.Due_Date || '');
    setPromptModal({
      message: 'Enter new due date (YYYY-MM-DD):',
      onSubmit: async (newDate) => {
        if (!newDate) return;
        try {
          const r = await window.api.extendInstallmentDate({ Tracker_ID: n.Notification_ID, New_Due_Date: newDate });
          if (r?.error) showToast(r.error, 'error');
          else { showToast(`Date extended to ${newDate}`); onRefresh(); }
        } catch (e) { showToast('Failed', 'error'); }
      }
    });
  };

  const handleDismiss = async (id) => {
    if (!window.api) return;
    try { await window.api.dismissNotification(id); onRefresh(); } catch (e) {}
  };

  const overdueCount = safeNotifications.filter(n => n.Type === 'Overdue').length;
  const dueCount = safeNotifications.filter(n => n.Type === 'Due').length;

  return (
    <div className="notification-panel">
      <div className="notif-header">
        <div>
          <h3>Collection Alerts</h3>
          <small>Due installments and account follow-ups</small>
        </div>
        {safeNotifications.length > 0 && <span className="notif-badge">{safeNotifications.length}</span>}
      </div>
      <div className="notif-tabs">
        <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('all')}>All</button>
        <button className={`btn btn-sm ${filter === 'due' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('due')}>Due Soon ({dueCount})</button>
        <button className={`btn btn-sm ${filter === 'overdue' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('overdue')}>Overdue ({overdueCount})</button>
      </div>
      <div className="notif-list">
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 30 }}>
            <div className="icon"><BellIcon/></div>
            <p style={{ fontSize: 12 }}>No notifications</p>
          </div>
        ) : (
          filtered.map((n, i) => {
            let title = n.Customer_Name || n.Type;
            let message = n.Message || 'No details saved';
            if (n.Customer_Name && String(n.Customer_Name).trim().startsWith('{') && String(n.Customer_Name).trim().endsWith('}')) {
              try {
                const parsed = JSON.parse(n.Customer_Name);
                if (parsed.title) title = parsed.title;
                if (parsed.body) message = parsed.body;
              } catch (e) {}
            }
            return (
              <div key={i} className={`notif-item ${n.Type === 'Overdue' ? 'overdue' : ''} ${n.Type === 'Due' ? 'due' : ''} ${n.Type === 'Warning' ? 'warning' : ''}`}>
                <div className="notif-title">{title}</div>
                <div className="notif-subtitle">{message}</div>
              {n.Due_Date && <div className="notif-date">Due Date: {n.Due_Date}</div>}
              {(n.Type === 'Due' || n.Type === 'Overdue') && (
                <div className="notif-actions">
                  <button className="btn btn-success btn-sm" onClick={() => handleMarkPaid(n)}>
                    Receive via Installment Tracker
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleExtend(n)}>Extend</button>
                </div>
              )}
              {n.Type !== 'Due' && n.Type !== 'Overdue' && (
                <div className="notif-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDismiss(n.Notification_ID)}>Dismiss</button>
                </div>
              )}
            </div>
          );
        })
        )}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--border-color)' }}>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} style={{ width: '100%', justifyContent: 'center' }}>View All Notifications</button>
      </div>

      {promptModal && (
        <div className="modal-overlay" onClick={() => { setPromptModal(null); setPromptValue(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:440,padding:24}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700}}>Input Required</h3>
            <p style={{margin:'0 0 12px',color:'var(--text-secondary)',fontSize:14}}>{promptModal.message}</p>
            <input className="form-input" value={promptValue} onChange={e => setPromptValue(e.target.value)} placeholder="YYYY-MM-DD" autoFocus style={{width:'100%',padding:'8px 12px',border:'1px solid var(--border-color)',borderRadius:6,background:'var(--bg-input)',color:'var(--text-primary)'}} />
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
              <button className="btn btn-secondary" onClick={() => { setPromptModal(null); setPromptValue(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { promptModal.onSubmit(promptValue); setPromptModal(null); setPromptValue(''); }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
