import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function Settings({ onClose }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMsg, setSyncMsg] = useState('');
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [dailySettings, setDailySettings] = useState(null);
  const [dailySaving, setDailySaving] = useState(false);
  const [dailyGenerating, setDailyGenerating] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const result = await window.api?.getDailyReportSettings?.();
        if (!cancelled && result && !result.error) setDailySettings(result);
      } catch (_) {}
    };
    loadSettings();
    return () => {
      cancelled = true;
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

  const handleRunAudit = async () => {
    try {
      setAuditBusy(true);
      const result = await window.api?.runBusinessAudit?.();
      if (result?.error) throw new Error(result.error);
      setAuditResult(result);
      if ((result?.issueCount || 0) > 0) toast.warning(`System audit found ${result.issueCount} issue(s)`);
      else toast.success('System audit passed with no issues');
    } catch (e) {
      toast.error('System audit failed: ' + e.message);
    } finally {
      setAuditBusy(false);
    }
  };

  const handleSaveDailySettings = async () => {
    try {
      setDailySaving(true);
      const result = await window.api?.updateDailyReportSettings?.(dailySettings || {});
      if (result?.error) throw new Error(result.error);
      setDailySettings(result);
      toast.success('Daily CEO report settings saved');
    } catch (e) {
      toast.error('Daily report settings failed: ' + e.message);
    } finally {
      setDailySaving(false);
    }
  };

  const handleGenerateDailyReports = async () => {
    try {
      setDailyGenerating(true);
      const today = new Date().toISOString().slice(0, 10);
      const result = await window.api?.resendDailyReportToCeo?.({ date: today });
      if (result?.error) throw new Error(result.error);
      const refreshed = await window.api?.getDailyReportSettings?.();
      if (refreshed && !refreshed.error) setDailySettings(refreshed);
      toast.success('Daily reports generated and CEO notification queued');
    } catch (e) {
      toast.error('Daily report generation failed: ' + e.message);
    } finally {
      setDailyGenerating(false);
    }
  };

  const patchDailySettings = (patch) => {
    setDailySettings((prev) => ({ ...(prev || {}), ...patch }));
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
        padding: 30, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto',
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
              <div style={{ fontWeight: 800, fontSize: 15, color: '#4338ca' }}>Local-First Sync Active</div>
              <div style={{ fontSize: 12, color: '#6366f1' }}>Excel save first, Supabase sync after</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#4f46e5', lineHeight: 1.6 }}>
            All new data is saved to local Excel first, then safely queued/synced to Supabase cloud database.
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
            • All writes go to local Excel first, then Supabase sync<br/>
            • All reads come from local Excel (fast, offline-capable)<br/>
            • Excel files are backed up to Supabase Storage automatically<br/>
            • Startup sync reconciles latest cloud/local data without page reload<br/>
            • If Supabase is unavailable, cached local data is used
          </div>
        </div>

        <div style={{
          padding: 16, borderRadius: 12, background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.28)', marginBottom: 24,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#047857', marginBottom: 6 }}>
            System Health Audit
          </div>
          <div style={{ fontSize: 12, color: '#065f46', lineHeight: 1.55, marginBottom: 12 }}>
            Checks ledger safety, cash/bank wiring, pending sync, receipts, media, invalid amounts, duplicate ids, and stale summaries without deleting data.
          </div>
          {auditResult && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              marginBottom: 12, fontSize: 12,
            }}>
              <div><strong>Issues</strong><br />{auditResult.issueCount || 0}</div>
              <div><strong>Pending Sync</strong><br />{auditResult.pendingSyncCount || 0}</div>
              <div><strong>Status</strong><br />{auditResult.hasErrors ? 'Needs Fix' : 'Safe'}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleRunAudit} className="btn btn-primary" disabled={auditBusy}>
              {auditBusy ? 'Running Audit...' : 'Run System Audit'}
            </button>
            {auditResult?.outPath && (
              <button onClick={() => window.api?.openReportFile?.(auditResult.outPath)} className="btn btn-ghost">
                Open Audit Report
              </button>
            )}
          </div>
        </div>

        <div style={{
          padding: 16, borderRadius: 12, background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.28)', marginBottom: 24,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#1d4ed8', marginBottom: 6 }}>
            CEO Daily Reports
          </div>
          <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.55, marginBottom: 12 }}>
            Generates every town daily ledger receipt, saves it in Media, and sends one CEO app notification with deep-link data.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={dailySettings?.enabled !== false}
                onChange={(e) => patchDailySettings({ enabled: e.target.checked })}
              />
              Enable automatic reports
            </label>
            <input
              type="time"
              value={dailySettings?.reportTime || '20:00'}
              onChange={(e) => patchDailySettings({ reportTime: e.target.value || '20:00' })}
              style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: 10, background: '#fff' }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.5, marginBottom: 12 }}>
            <strong>Last status:</strong> {dailySettings?.lastStatus || 'Not generated yet'}<br />
            <strong>Last report date:</strong> {dailySettings?.lastReportDate || '-'}<br />
            <strong>Last synced:</strong> {dailySettings?.lastSyncedAt || '-'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleSaveDailySettings} className="btn btn-primary" disabled={dailySaving || !dailySettings}>
              {dailySaving ? 'Saving...' : 'Save Report Settings'}
            </button>
            <button onClick={handleGenerateDailyReports} className="btn btn-ghost" disabled={dailyGenerating}>
              {dailyGenerating ? 'Generating...' : 'Generate Now / Resend'}
            </button>
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
