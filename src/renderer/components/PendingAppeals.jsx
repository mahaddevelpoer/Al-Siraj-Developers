import { useEffect, useMemo, useState } from 'react';

const HOURS_24 = 24 * 60 * 60 * 1000;

function storageKey(townName) {
  return `al_siraj_pending_appeals_${townName || 'global'}`;
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

export default function PendingAppeals({ townName, showToast }) {
  const [items, setItems] = useState(() => readItems(townName));

  const refresh = () => {
    const now = Date.now();
    const next = readItems(townName).filter((item) => {
      const created = Date.parse(item.createdAt || 0) || now;
      return now - created <= HOURS_24 && item.status === 'pending';
    });
    writeItems(townName, next);
    setItems(next);
  };

  useEffect(() => {
    refresh();
    const onChange = () => setItems(readItems(townName));
    window.addEventListener('al-siraj-business-data-changed', onChange);
    const timer = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener('al-siraj-business-data-changed', onChange);
      clearInterval(timer);
    };
  }, [townName]);

  const stats = useMemo(() => ({
    count: items.length,
    amount: items.reduce((sum, item) => sum + (Number(item.payload?.amount) || 0), 0),
  }), [items]);

  const remove = (id) => {
    const next = readItems(townName).filter((item) => item.id !== id);
    writeItems(townName, next);
    setItems(next);
    showToast?.('Pending appeal removed locally', 'warning');
  };

  return (
    <div className="media-workspace">
      <div className="property-board-header">
        <div>
          <div className="property-board-kicker">Offline approval queue</div>
          <h2>Pending Appeals</h2>
          <p>Offline back/future-date entries stay here and do not affect balance until CEO approval.</p>
        </div>
        <div className="ui-town-financial-card compact">
          <span>{stats.count} pending</span>
          <strong>PKR {stats.amount.toLocaleString()}</strong>
        </div>
      </div>

      <div className="media-grid">
        {items.length === 0 && <div className="property-board-empty">No local pending appeals.</div>}
        {items.map((item) => {
          const created = new Date(item.createdAt);
          const expires = new Date(created.getTime() + HOURS_24);
          return (
            <div className="media-card" key={item.id}>
              <span>{item.type?.replace(/_/g, ' ') || 'Pending appeal'}</span>
              <strong>{item.payload?.type || 'Entry'} - PKR {(Number(item.payload?.amount) || 0).toLocaleString()}</strong>
              <p>{item.payload?.description || 'No description'}</p>
              <em>Date: {item.payload?.date || '-'} | Account: {item.payload?.accountName || item.payload?.paymentAccountName || 'Cash in Hand'}</em>
              <small>Created {created.toLocaleString()} | Expires {expires.toLocaleString()}</small>
              <div className="media-receipt-actions">
                <button type="button" onClick={() => remove(item.id)}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
