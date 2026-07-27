import React, { useState, useEffect } from 'react';

export default function ReportViewerModal({ isOpen, onClose, reportData, htmlContent, filePath, title, showToast }) {
  const [content, setContent] = useState(htmlContent || '');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'summary'

  useEffect(() => {
    if (!isOpen) return;

    if (htmlContent) {
      setContent(htmlContent);
      return;
    }

    if (filePath && window.api?.readReportFile) {
      setLoading(true);
      window.api.readReportFile(filePath).then((res) => {
        if (res && res.content) {
          setContent(res.content);
        } else if (res && res.error) {
          showToast?.(`Could not load report preview: ${res.error}`, 'error');
        }
      }).catch((err) => {
        showToast?.(`Failed to read report: ${err.message}`, 'error');
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [isOpen, htmlContent, filePath]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (filePath && window.api?.openReportFile) {
      window.api.openReportFile(filePath);
      return;
    }
    const iframe = document.getElementById('report-preview-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } else {
      window.print();
    }
  };

  const handleShare = () => {
    let summaryText = `*AL SIRAJ DEVELOPERS - ${title || 'Business Report'}*\n`;
    if (reportData && reportData.summary) {
      const s = reportData.summary;
      if (s.totalReceived !== undefined) summaryText += `• Total Received: PKR ${Number(s.totalReceived).toLocaleString()}\n`;
      if (s.totalPaid !== undefined) summaryText += `• Total Paid: PKR ${Number(s.totalPaid).toLocaleString()}\n`;
      if (s.cashBalance !== undefined) summaryText += `• Cash Balance: PKR ${Number(s.cashBalance).toLocaleString()}\n`;
      if (s.receivable !== undefined) summaryText += `• Receivables: PKR ${Number(s.receivable).toLocaleString()}\n`;
      if (s.payable !== undefined) summaryText += `• Payables: PKR ${Number(s.payable).toLocaleString()}\n`;
    } else if (reportData && reportData.Town_Name) {
      summaryText += `• Town: ${reportData.Town_Name}\n`;
      if (reportData.Amount) summaryText += `• Amount: PKR ${Number(reportData.Amount).toLocaleString()}\n`;
      if (reportData.Receipt_Number) summaryText += `• Receipt #: ${reportData.Receipt_Number}\n`;
    }
    summaryText += `\nReport generated at ${new Date().toLocaleString()}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(summaryText).then(() => {
        showToast?.('Report summary copied to clipboard! Ready to paste & share on WhatsApp/Email.', 'success');
      }).catch(() => {
        showToast?.('Copied summary to clipboard.', 'info');
      });
    } else {
      showToast?.('Report ready to share.', 'info');
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="modal-content-glass"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '960px',
          maxWidth: '96vw',
          height: '92vh',
          background: 'var(--bg-card, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          borderRadius: '16px',
          border: '1px solid var(--border-color, #cbd5e1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Top Header Bar */}
        <div
          style={{
            padding: '18px 24px',
            background: 'var(--bg-card-secondary, #f8fafc)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>📑</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                {title || 'Report & Receipt In-App Viewer'}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                Full interactive preview, reading, printing, and instant sharing.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
              }}
            >
              🖨️ Print / Open PDF
            </button>
            <button
              type="button"
              onClick={handleShare}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
              }}
            >
              📤 Share Report
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#cbd5e1',
                color: '#1e293b',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                fontWeight: 900,
                fontSize: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '8px',
              }}
              title="Close Viewer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Live Content / Frame */}
        <div style={{ flex: 1, position: 'relative', background: '#f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '15px', fontWeight: 600 }}>
              Loading report preview...
            </div>
          ) : content ? (
            <iframe
              id="report-preview-iframe"
              srcDoc={content}
              title="Report Preview"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#ffffff',
              }}
            />
          ) : (
            <div style={{ padding: '32px', textTransform: 'none' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Report Summary Data</h4>
              <pre style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', overflowX: 'auto', fontSize: '13px' }}>
                {JSON.stringify(reportData || {}, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
