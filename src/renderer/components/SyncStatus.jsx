import React, { useState, useEffect, useCallback, useRef } from 'react';

function SyncStatus() {
  const [status, setStatus] = useState({ count: 0, byTable: {} });
  const [expanded, setExpanded] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const timerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      if (!window.api?.getPendingSyncStatus) return;
      const result = await window.api.getPendingSyncStatus();
      if (result?.success) {
        setStatus({ count: result.count || 0, byTable: result.byTable || {} });
      }
      setLastChecked(new Date());
    } catch (e) {
      console.warn('[SyncStatus] Error fetching status:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, 30000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchStatus]);

  useEffect(() => {
    if (!window.api?.onBusinessDataChanged) return;
    const handler = (data) => {
      if (data?.events?.includes('pending-sync:changed')) {
        fetchStatus();
      }
    };
    window.api.onBusinessDataChanged(handler);
    return () => {
      if (window.api?.removeBusinessDataChanged) {
        window.api.removeBusinessDataChanged();
      }
    };
  }, [fetchStatus]);

  const handleViewQueue = async () => {
    try {
      if (window.api?.openPendingSyncFile) {
        await window.api.openPendingSyncFile();
      }
    } catch (e) {
      console.warn('[SyncStatus] Error opening pending sync file:', e);
    }
  };

  const badgeClass = status.count === 0 ? 'sync-badge-ok' : status.count > 10 ? 'sync-badge-danger' : 'sync-badge-warn';
  const tableEntries = Object.entries(status.byTable);
  const timeStr = lastChecked ? lastChecked.toLocaleTimeString() : '—';

  return (
    <div className={`sync-status-panel ${expanded ? 'expanded' : ''}`}>
      <button
        className="sync-status-toggle"
        onClick={() => setExpanded(!expanded)}
        title={`Pending: ${status.count} items`}
      >
        <span className="sync-status-icon">☁️</span>
        <span className={`sync-status-badge ${badgeClass}`}>{status.count}</span>
      </button>

      {expanded && (
        <div className="sync-status-dropdown">
          <div className="sync-status-header">
            <span>Sync Status</span>
            <span className="sync-status-time">Last: {timeStr}</span>
          </div>

          {status.count === 0 ? (
            <div className="sync-status-ok">
              <span className="sync-ok-icon">✅</span>
              <span>All data synced</span>
            </div>
          ) : (
            <>
              <div className="sync-status-summary">
                <span className="sync-pending-count">{status.count}</span>
                <span>pending item{status.count !== 1 ? 's' : ''}</span>
              </div>
              {tableEntries.length > 0 && (
                <div className="sync-status-table-list">
                  {tableEntries.map(([table, count]) => (
                    <div key={table} className="sync-table-row">
                      <span className="sync-table-name">{table}</span>
                      <span className="sync-table-count">{count}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="sync-view-queue-btn" onClick={handleViewQueue}>
                📂 View Queue
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SyncStatus;
