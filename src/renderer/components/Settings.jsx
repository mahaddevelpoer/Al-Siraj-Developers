import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function Settings({ onClose }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    if (window.api?.onSyncProgress) {
      window.api.onSyncProgress((percent, msg) => {
        setSyncProgress(percent);
        setSyncMsg(msg);
        if (percent >= 100) {
          toast.success('Sync complete! Data updated without reload.');
          setIsSyncing(false);
        }
      });
    }
    return () => {
      if (window.api?.removeSyncProgress) {
        window.api.removeSyncProgress();
      }
    };
  }, []);

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      setSyncProgress(0);
      setSyncMsg('Starting sync...');
      toast.info('Cloud Sync Started');
      
      const result = await window.api.syncFromCloud();
      
      if (result?.error) throw new Error(result.error);
    } catch (e) {
      toast.error('Sync failed: ' + e.message);
      setIsSyncing(false);
    }
  };
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
        padding: 30, maxWidth: 500, width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Settings</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>System configuration</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ fontSize: 20, padding: '4px 12px' }}>✕</button>
        </div>

        <div style={{
          padding: 20, borderRadius: 16, marginBottom: 20,
          background: 'linear-gradient(135deg, #eef2ff, #ede9fe)',
          border: '1px solid #c7d2fe',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 28 }}>Save & Sync</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#4338ca' }}>Cloud-First Mode Active</div>
              <div style={{ fontSize: 12, color: '#6366f1' }}>Supabase DB → Local Excel</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#4f46e5', lineHeight: 1.6 }}>
            All new data is saved to <strong>both</strong> Excel files (locally) and Supabase cloud database.
          </div>
        </div>

        <div style={{
          padding: 16, borderRadius: 12, background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)', marginBottom: 24,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 4 }}>
            How it works
          </div>
          <div style={{ fontSize: 12, color: '#a16207', lineHeight: 1.5 }}>
            • All writes go to Supabase first, then local Excel<br/>
            • All reads come from local Excel (fast, offline-capable)<br/>
            • Excel files are backed up to Supabase Storage automatically<br/>
            • Startup sync: CEO uploads files, Agents download missing files<br/>
            • If Supabase is unavailable, cached local data is used
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1 }}>
            {isSyncing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{syncMsg} ({syncProgress}%)</div>
                <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${syncProgress}%`, background: '#4f46e5', transition: 'width 0.3s' }} />
                </div>
              </div>
            ) : (
              <button onClick={handleManualSync} className="btn" style={{ background: '#4f46e5', color: '#fff' }}>
                Sync Data from Cloud
              </button>
            )}
          </div>
          <button onClick={onClose} className="btn btn-ghost" disabled={isSyncing}>Close</button>
        </div>
      </div>
    </div>
  );
}
