import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const HOURS_24 = 24 * 60 * 60 * 1000;
const HOURS_22 = 22 * 60 * 60 * 1000; // Warning at 22 hours

function storageKey(townName) {
  return `al_siraj_pending_appeals_${townName || 'global'}`;
}

function archiveKey(townName) {
  return `al_siraj_expired_appeals_${townName || 'global'}`;
}

function readItems(townName) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(townName)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeItems(townName, items) {
  localStorage.setItem(storageKey(townName), JSON.stringify(items.slice(0, 200)));
  window.dispatchEvent(new CustomEvent('al-siraj-business-data-changed', {
    detail: { townName, events: ['appeal:pending-local'] },
  }));
}

function archiveExpired(townName, expired) {
  try {
    const existing = JSON.parse(localStorage.getItem(archiveKey(townName)) || '[]');
    const merged = [...expired.map(e => ({...e, status: 'expired'})), ...existing].slice(0, 500);
    localStorage.setItem(archiveKey(townName), JSON.stringify(merged));
  } catch {}
}

export default function PendingAppeals({ townName, showToast }) {
  const [items, setItems] = useState(() => readItems(townName));
  const [cloudItems, setCloudItems] = useState([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState('');

  const loadCloudAppeals = async () => {
    setLoadingCloud(true);
    setCloudError('');
    try {
      let query = supabase
        .from('appeals')
        .select('id,appeal_type,entity_type,entity_id,town_name,status,requested_data,reason,created_at,requested_by_role,requested_by_user_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(80);
      if (townName) query = query.eq('town_name', townName);
      const { data, error } = await query;
      if (error) throw error;
      const fetched = Array.isArray(data) ? data : [];

      const requesterIds = [...new Set(fetched.map(a => a.requested_by_user_id).filter(Boolean))];
      let userMap = {};
      if (requesterIds.length) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, email, town_name')
          .in('id', requesterIds);
        if (users) {
          userMap = Object.fromEntries(users.map(u => [u.id, u]));
        }
      }

      setCloudItems(fetched.map(item => ({
        ...item,
        requested_by_user_id: userMap[item.requested_by_user_id] || item.requested_by_user_id,
      })));
    } catch (e) {
      setCloudError(e.message || 'Cloud pending approvals could not load');
    } finally {
      setLoadingCloud(false);
    }
  };

  const refresh = () => {
    const now = Date.now();
    const current = readItems(townName);
    const next = [];
    const expired = [];
    const warnings = [];
    for (const item of current) {
      const created = Date.parse(item.createdAt || 0) || now;
      const age = now - created;
      if (item.status !== 'pending') {
        next.push(item);
      } else if (age > HOURS_24) {
        expired.push(item);
      } else {
        next.push(item);
        if (age > HOURS_22) {
          warnings.push(item);
        }
      }
    }
    if (expired.length > 0) {
      archiveExpired(townName, expired);
      showToast?.(`${expired.length} pending appeal(s) expired and moved to archive. Connect to internet to sync.`, 'warning');
    }
    if (warnings.length > 0) {
      showToast?.(`⚠️ ${warnings.length} appeal(s) expiring soon! Connect to internet within 2 hours.`, 'error');
    }
    writeItems(townName, next);
    setItems(next);
  };

  useEffect(() => {
    refresh();
    loadCloudAppeals();
    const onChange = () => setItems(readItems(townName));
    window.addEventListener('al-siraj-business-data-changed', onChange);
    const timer = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener('al-siraj-business-data-changed', onChange);
      clearInterval(timer);
    };
  }, [townName]);

  useEffect(() => {
    const channel = supabase
      .channel(`town-pending-appeals-${townName || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appeals' }, () => {
        loadCloudAppeals();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [townName]);

  const cloudAmount = (row) => {
    const data = row?.requested_data || {};
    return Number(data.amount || data.Amount || data.totalAmount || data.advance || 0) || 0;
  };

  const stats = useMemo(() => ({
    localCount: items.length,
    cloudCount: cloudItems.length,
    localAmount: items.reduce((sum, item) => sum + (Number(item.payload?.amount) || 0), 0),
    cloudAmount: cloudItems.reduce((sum, item) => sum + cloudAmount(item), 0),
  }), [items, cloudItems]);

  const remove = (id) => {
    const next = readItems(townName).filter((item) => item.id !== id);
    writeItems(townName, next);
    setItems(next);
    showToast?.('Pending appeal removed locally', 'warning');
  };

  return (
    <div className="pending-appeals-workspace">
      <div className="pending-appeals-hero">
        <div>
          <div className="property-board-kicker">Offline approval queue</div>
          <h2>Pending Appeals</h2>
          <p>Local offline changes and cloud CEO approvals for this town. Pending items never change cash until approved.</p>
        </div>
        <div className="pending-appeals-stat-row">
          <div className="pending-appeals-stat">
            <span>Cloud pending</span>
            <strong>{stats.cloudCount}</strong>
            <small>PKR {stats.cloudAmount.toLocaleString()}</small>
          </div>
          <div className="pending-appeals-stat">
            <span>Offline local</span>
            <strong>{stats.localCount}</strong>
            <small>PKR {stats.localAmount.toLocaleString()}</small>
          </div>
        </div>
      </div>

      {cloudError && (
        <div className="pending-appeals-warning">
          Cloud approvals load nahi hui: {cloudError}
        </div>
      )}

      <div className="pending-appeals-section">
        <div className="pending-appeals-section-head">
          <div>
            <h3>Cloud pending approvals</h3>
            <p>CEO mobile/desktop approvals table se live data.</p>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={loadCloudAppeals} disabled={loadingCloud}>
            {loadingCloud ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="pending-appeals-grid">
          {loadingCloud && cloudItems.length === 0 && <div className="property-board-empty">Loading cloud pending approvals...</div>}
          {!loadingCloud && cloudItems.length === 0 && <div className="property-board-empty">No cloud pending approvals for this town.</div>}
          {cloudItems.map((item) => {
            const rd = item.requested_data || {};
            const accountant = item.requested_by_user_id?.full_name || item.requested_by_user_id?.email || item.requested_by_role || 'Accountant';
            return (
              <div className="pending-appeal-card cloud" key={item.id}>
                <div className="pending-appeal-card-top">
                  <span>{String(item.appeal_type || 'approval').replace(/_/g, ' ')}</span>
                  <b>Cloud</b>
                </div>
                <strong>{item.entity_type || rd.type || 'Request'} {item.entity_id || rd.propertyNumber || ''}</strong>
                <p>{item.reason || rd.description || rd.reason || 'Waiting for CEO review.'}</p>
                <div className="pending-appeal-meta">
                  <span>Town: <b>{item.town_name || townName || '-'}</b></span>
                  <span>By: <b>{accountant}</b></span>
                  <span>Date: <b>{rd.date || new Date(item.created_at).toLocaleDateString()}</b></span>
                  <span>Amount: <b>PKR {cloudAmount(item).toLocaleString()}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pending-appeals-section">
        <div className="pending-appeals-section-head">
          <div>
            <h3>Offline local queue</h3>
            <p>Internet ke baghair pending rakhi hui requests.</p>
          </div>
        </div>
        <div className="pending-appeals-grid">
        {items.length === 0 && <div className="property-board-empty">No local pending appeals.</div>}
        {items.map((item) => {
          const created = new Date(item.createdAt);
          const expires = new Date(created.getTime() + HOURS_24);
          return (
            <div className="pending-appeal-card local" key={item.id}>
              <div className="pending-appeal-card-top">
                <span>{item.type?.replace(/_/g, ' ') || 'Pending appeal'}</span>
                <b>Local</b>
              </div>
              <strong>{item.payload?.type || 'Entry'} - PKR {(Number(item.payload?.amount) || 0).toLocaleString()}</strong>
              <p>{item.payload?.description || 'No description'}</p>
              <div className="pending-appeal-meta">
                <span>Date: <b>{item.payload?.date || '-'}</b></span>
                <span>Account: <b>{item.payload?.accountName || item.payload?.paymentAccountName || 'Cash in Hand'}</b></span>
                <span>Created: <b>{created.toLocaleString()}</b></span>
                <span>Expires: <b>{expires.toLocaleString()}</b></span>
              </div>
              <div className="media-receipt-actions">
                <button type="button" onClick={() => remove(item.id)}>Remove</button>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
