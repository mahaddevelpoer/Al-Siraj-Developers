import React, { useState, useEffect } from 'react';

export default function SystemDiagnosticsModal({ isOpen, onClose }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(null);
  const [logs, setLogs] = useState([]);
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    if (window.api && window.api.onDiagnosticsProgress) {
      window.api.onDiagnosticsProgress((data) => {
        setProgress(data.percent || 0);
        setCurrentStep(data);
        setLogs((prev) => [...prev, data]);
      });
    }

    return () => {
      if (window.api && window.api.removeDiagnosticsProgress) {
        window.api.removeDiagnosticsProgress();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunDiagnostics = async () => {
    setRunning(true);
    setProgress(0);
    setLogs([]);
    setReport(null);
    setCurrentStep({ title: 'Starting System Audit...', detail: 'Initializing live diagnostic checks...' });

    try {
      if (window.api && window.api.runSystemDiagnostics) {
        const res = await window.api.runSystemDiagnostics();
        setReport(res);
      } else {
        setReport({ success: false, error: 'API bridge unavailable' });
      }
    } catch (err) {
      setReport({ success: false, error: err.message || String(err) });
    } finally {
      setRunning(false);
    }
  };

  const handleExportJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AL_SIRAJ_System_Diagnostics_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 99999, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="modal-content" style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', background: '#0f172a', color: '#f8fafc', borderRadius: '12px', border: '1px solid #334155', padding: '24px' }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '10px' }}>
              🩺 Real-Time System Health & Diagnostics
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Live audit of local Excel databases, Supabase cloud sync, financial math integrity, and CEO push alerts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ background: '#334155', color: '#f8fafc', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕ Close
          </button>
        </div>

        {/* Action Header Banner */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Overall Health Status</span>
            <div style={{ fontSize: '24px', fontWeight: 900, color: report ? (report.failed > 0 ? '#ef4444' : '#22c55e') : '#38bdf8', marginTop: '2px' }}>
              {report ? report.overallHealth : (running ? 'AUDIT IN PROGRESS...' : 'READY FOR DIAGNOSTICS')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleRunDiagnostics}
              disabled={running}
              className="btn btn-primary"
              style={{ background: running ? '#475569' : '#0284c7', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 800, cursor: running ? 'not-allowed' : 'pointer' }}
            >
              {running ? '🔄 Running Diagnostics...' : '▶ Run Live Diagnostics'}
            </button>
            {report && (
              <button
                onClick={handleExportJSON}
                className="btn btn-secondary"
                style={{ background: '#334155', color: '#f8fafc', border: '1px solid #475569', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
              >
                📥 Export JSON Report
              </button>
            )}
          </div>
        </div>

        {/* Live Progress Bar */}
        {(running || progress > 0) && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', fontWeight: 700 }}>
              <span style={{ color: '#38bdf8' }}>{currentStep?.title || 'System Audit Progress'}</span>
              <span style={{ color: '#38bdf8' }}>{progress}%</span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#334155', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7, #38bdf8)', transition: 'width 0.3s ease' }}></div>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#cbd5e1' }}>{currentStep?.detail}</p>
          </div>
        )}

        {/* Results Items Table */}
        {report && report.items && (
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc', marginBottom: '10px' }}>Diagnostic Verification Results</h3>
            <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '10px 12px' }}>Category</th>
                    <th style={{ padding: '10px 12px' }}>Module / Item</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Details & Audit Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? '#0f172a' : '#1e293b' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#cbd5e1' }}>{item.category}</td>
                      <td style={{ padding: '8px 12px', color: '#f8fafc' }}>{item.name}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: item.status === 'PASS' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                          color: item.status === 'PASS' ? '#4ade80' : '#fde047',
                          border: item.status === 'PASS' ? '1px solid #22c55e' : '1px solid #eab308'
                        }}>
                          {item.status === 'PASS' ? '✔ PASS' : '⚠️ WARN'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '12px' }}>{item.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Real-time Terminal Log Output */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#94a3b8', marginBottom: '8px' }}>Live Execution Console Stream</h3>
          <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '12px', maxHeight: '180px', overflowY: 'auto', color: '#38bdf8' }}>
            {logs.length === 0 ? (
              <span style={{ color: '#64748b' }}>Console idle. Click "▶ Run Live Diagnostics" to begin live audit.</span>
            ) : (
              logs.map((l, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>[{l.timestamp.slice(11, 19)}]</span>{' '}
                  <span style={{ color: '#4ade80', fontWeight: 700 }}>[{l.title}]</span>{' '}
                  <span style={{ color: '#f8fafc' }}>{l.detail}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
