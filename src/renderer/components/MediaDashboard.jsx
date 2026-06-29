import React, { useEffect, useMemo, useState } from 'react';

export default function MediaDashboard({ townName, showToast }) {
  const [rows, setRows] = useState([]);
  const [receiptRows, setReceiptRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const load = async () => {
    if (!window.api?.getMediaLibrary) return;
    setLoading(true);
    try {
      const res = await window.api.getMediaLibrary({ townName });
      if (res?.error) throw new Error(res.error);
      const receipts = await window.api.getReceiptArchive?.({ townName });
      setRows(Array.isArray(res) ? res : []);
      setReceiptRows(Array.isArray(receipts) ? receipts : []);
    } catch (error) {
      showToast?.(`Media load failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [townName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mediaItems = rows.map((row) => ({ ...row, _kind: 'media' }));
    const receiptItems = receiptRows.map((row) => ({
      _kind: 'receipt',
      Media_ID: `receipt-${row.Receipt_ID || row.Receipt_Number}`,
      Town_Name: row.Town_Name,
      Type: row.Receipt_Type || 'receipt',
      Title: row.Receipt_Number || 'Receipt',
      Account_Name: row.Entity_Name,
      Property_Number: row.Entity_ID,
      Receipt_Number: row.Receipt_Number,
      Report_Date: row.Receipt_Date,
      Created_At: row.Created_At,
      Payload_JSON: row.Payload_JSON,
      Amount: row.Amount,
      _receipt: row,
    }));
    return [...mediaItems, ...receiptItems].filter((row) => {
      if (type !== 'all' && String(row.Type || '').toLowerCase() !== type) return false;
      if (!q) return true;
      return [row.Title, row.Type, row.Account_Name, row.Property_Number, row.Receipt_Number]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [query, receiptRows, rows, type]);

  const openFile = async (row) => {
    if (row._kind === 'receipt') {
      setSelectedReceipt(row._receipt || row);
      return;
    }
    const filePath = row.Pdf_Path || row.File_Path || row.Excel_Path || row.Html_Path;
    if (!filePath) {
      showToast?.('No file path saved for this media item', 'error');
      return;
    }
    const res = await window.api.openReportFile?.(filePath);
    if (res?.error) showToast?.(res.error, 'error');
  };

  const exportSelectedReceipt = async () => {
    if (!selectedReceipt) return;
    try {
      const res = await window.api.exportReceiptArchivePdf?.({ townName, receipt: selectedReceipt });
      if (res?.error) throw new Error(res.error);
      showToast?.('Receipt PDF saved in Media', 'success');
      await load();
      const filePath = res?.pdfPath || res?.htmlPath;
      if (filePath) await window.api.openReportFile?.(filePath);
      setSelectedReceipt(null);
    } catch (error) {
      showToast?.(`Receipt PDF failed: ${error.message}`, 'error');
    }
  };

  const types = ['all', ...Array.from(new Set([...rows, ...receiptRows].map((row) => String(row.Type || row.Receipt_Type || '').toLowerCase()).filter(Boolean)))];

  return (
    <div className="media-workspace">
      <div className="accounts-toolbar">
        <div>
          <div className="property-board-kicker">Media archive</div>
          <h3>Receipts, PDFs and reports</h3>
        </div>
        <div className="accounts-actions">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search media..." />
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((item) => <option key={item} value={item}>{item === 'all' ? 'All types' : item}</option>)}
          </select>
          <button className="btn btn-secondary" type="button" onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="media-grid">
        {loading && <div className="property-board-loading">Loading media archive...</div>}
        {!loading && filtered.map((row) => (
          <button className="media-card" key={row.Media_ID || row.File_Path || row.Title} type="button" onClick={() => openFile(row)}>
            <span>{row.Type || 'report'}</span>
            <strong>{row.Title || row.Receipt_Number || 'Generated document'}</strong>
            <small>{row.Report_Date || row.Created_At || ''}</small>
            <p>{row.Account_Name || row.Property_Number || row.Receipt_Number || townName}</p>
            {row._kind === 'receipt' && <em>Saved receipt details</em>}
          </button>
        ))}
        {!loading && !filtered.length && <div className="property-board-empty">No saved PDFs or reports yet.</div>}
      </div>

      {selectedReceipt && (
        <div className="ui-modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedReceipt(null)}>
          <div className="ui-modal-shell" style={{ maxWidth: 560 }}>
            <div className="property-board-kicker">Receipt archive</div>
            <h3 style={{ margin: '6px 0 14px', color: 'var(--text-primary)' }}>{selectedReceipt.Receipt_Number}</h3>
            <div className="property-detail-list">
              <div><span>Type</span><b>{selectedReceipt.Receipt_Type || '-'}</b></div>
              <div><span>Town</span><b>{selectedReceipt.Town_Name || '-'}</b></div>
              <div><span>Entity</span><b>{selectedReceipt.Entity_Name || selectedReceipt.Entity_ID || '-'}</b></div>
              <div><span>Date</span><b>{selectedReceipt.Receipt_Date || '-'}</b></div>
              <div><span>Amount</span><b>PKR {Number(selectedReceipt.Amount || 0).toLocaleString()}</b></div>
            </div>
            <pre className="media-receipt-json">
              {(() => {
                try { return JSON.stringify(JSON.parse(selectedReceipt.Payload_JSON || '{}'), null, 2); }
                catch { return selectedReceipt.Payload_JSON || 'No extra payload saved.'; }
              })()}
            </pre>
            <div className="media-receipt-actions">
              <button className="btn btn-primary" type="button" onClick={exportSelectedReceipt}>Export / Open PDF</button>
              <button className="btn btn-secondary" type="button" onClick={() => setSelectedReceipt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
