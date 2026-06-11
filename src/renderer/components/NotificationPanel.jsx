import React, { useState, useEffect } from 'react';
import { BellIcon } from './Icons';

export default function NotificationPanel({ notifications, onRefresh, showToast }) {
  const [filter, setFilter] = useState('all');

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'due') return n.Type === 'Due';
    if (filter === 'overdue') return n.Type === 'Overdue';
    if (filter === 'warning') return n.Type === 'Warning';
    return true;
  });

  const handleMarkPaid = async (n) => {
    if (!window.api) return;
    try {
      const r = await window.api.markInstallmentPaid({ Tracker_ID: n.Notification_ID });
      if (r?.error) showToast(r.error, 'error');
      else { showToast('Marked as paid!'); onRefresh(); }
    } catch (e) { showToast('Failed', 'error'); }
  };

  const handleExtend = async (n) => {
    const newDate = prompt('Enter new due date (YYYY-MM-DD):', n.Due_Date);
    if (!newDate) return;
    try {
      const r = await window.api.extendInstallmentDate({ Tracker_ID: n.Notification_ID, New_Due_Date: newDate });
      if (r?.error) showToast(r.error, 'error');
      else { showToast(`Date extended to ${newDate}`); onRefresh(); }
    } catch (e) { showToast('Failed', 'error'); }
  };

  const handleDismiss = async (id) => {
    if (!window.api) return;
    try { await window.api.dismissNotification(id); onRefresh(); } catch (e) {}
  };

  const overdueCount = notifications.filter(n => n.Type === 'Overdue').length;
  const dueCount = notifications.filter(n => n.Type === 'Due').length;

  return (
    <div className="notification-panel">
      <div className="notif-header">
        <h3>Installment Notifications</h3>
        {notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}
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
          filtered.map((n, i) => (
            <div key={i} className={`notif-item ${n.Type === 'Overdue' ? 'overdue' : ''} ${n.Type === 'Due' ? 'due' : ''} ${n.Type === 'Warning' ? 'warning' : ''}`}>
              <div className="notif-title">{n.Customer_Name || n.Type}</div>
              <div className="notif-subtitle">{n.Message}</div>
              <div className="notif-desc">{n.Message}</div>
              {n.Due_Date && <div className="notif-date">Due Date: {n.Due_Date}</div>}
              {(n.Type === 'Due' || n.Type === 'Overdue') && (
                <div className="notif-actions">
                  <button className="btn btn-success btn-sm" onClick={() => handleMarkPaid(n)}>
                    Receive (PKR {(parseFloat(n.Monthly_Amount) || 0).toLocaleString()})
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
          ))
        )}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--border-color)' }}>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} style={{ width: '100%', justifyContent: 'center' }}>View All Notifications</button>
      </div>
    </div>
  );
}
