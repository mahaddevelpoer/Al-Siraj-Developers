import React, { useEffect, useMemo, useState } from 'react';
import ReportViewerModal from './ReportViewerModal';

export default function MediaDashboard({ townName, showToast }) {
  const [rows, setRows] = useState([]);
  const [receiptRows, setReceiptRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [viewerModal, setViewerModal] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

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

  useEffect(() => { load(); }, [refreshTick, townName]);

  useEffect(() => {
    const onDataChanged = (event) => {
      const detail = event?.detail || {};
      const events = Array.isArray(detail.events) ? detail.events : [];
      const sameTown = !detail.townName || !townName || String(detail.townName) === String(townName);
      if (!sameTown) return;
      if (events.some((name) => ['media:changed', 'report:created', 'receipt:created'].includes(name))) {
        setRefreshTick((tick) => tick + 1);
      }
    };
    window.addEventListener('al-siraj-business-data-changed', onDataChanged);
    window.addEventListener('al-siraj-data-refreshed', onDataChanged);
    return () => {
      window.removeEventListener('al-siraj-business-data-changed', onDataChanged);
      window.removeEventListener('al-siraj-data-refreshed', onDataChanged);
    };
  }, [townName]);

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
    const filePath = row.Html_Path || row.Pdf_Path || row.File_Path || row.Excel_Path;
    if (!filePath) {
      showToast?.('No file path saved for this media item', 'error');
      return;
    }
    setViewerModal({
      filePath,
      title: row.Title || row.Receipt_Number || 'Business Report',
    });
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
  const receiptTotal = useMemo(
    () => receiptRows.reduce((sum, row) => sum + (Number(row.Amount) || 0), 0),
    [receiptRows]
  );
  const selectedPayload = useMemo(() => {
    if (!selectedReceipt) return {};
    try {
      const parsed = JSON.parse(selectedReceipt.Payload_JSON || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, [selectedReceipt]);

  const receiptDetailRows = useMemo(() => {
    if (!selectedReceipt) return [];
    const p = selectedPayload || {};
    const entries = [
      ['Payment Account', p.paymentAccountName || p.Payment_Account_Name],
      ['Direction', p.direction || p.transactionType],
      ['Debit Account', p.debitAccount],
      ['Credit Account', p.creditAccount],
      ['Party', p.partyName || p.customerName || p.investorName || p.constructorName || p.Entity_Name],
      ['Property', [p.propertyType, p.propertyNumber].filter(Boolean).join(' ')],
      ['Installment', p.installmentNumber && p.totalInstallments ? `${p.installmentNumber} of ${p.totalInstallments}` : p.installmentNumber],
      ['Due Date', p.dueDate],
      ['Total Amount', p.totalAmount],
      ['Advance Amount', p.advanceAmount],
      ['Remaining Amount', p.remainingAmount],
      ['Balance After', p.balanceAfter],
      ['Category', p.category],
      ['Material', [p.materialName, p.materialQuantity, p.materialRate].filter(Boolean).join(' / ')],
      ['Description', p.description || p.note || p.notes],
    ];
    return entries
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .map(([label, value]) => [label, typeof value === 'number' ? `PKR ${Number(value).toLocaleString()}` : String(value)]);
  }, [selectedPayload, selectedReceipt]);

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

      <div className="media-control-strip">
        <div>
          <span>Saved Receipts</span>
          <strong>{receiptRows.length.toLocaleString()}</strong>
          <small>Every debit/credit evidence point</small>
        </div>
        <div>
          <span>Receipt Amount</span>
          <strong>PKR {receiptTotal.toLocaleString()}</strong>
          <small>Archived transaction value</small>
        </div>
        <div>
          <span>Reports / Files</span>
          <strong>{rows.length.toLocaleString()}</strong>
          <small>PDF, Excel and generated reports</small>
        </div>
        <div>
          <span>Visible Now</span>
          <strong>{filtered.length.toLocaleString()}</strong>
          <small>After current filter/search</small>
        </div>
      </div>

      <div className="media-grid">
        {loading && <div className="property-board-loading">Loading media archive...</div>}
        {!loading && filtered.map((row) => (
          <button className={`media-card ${row._kind === 'receipt' ? 'receipt' : 'file'}`} key={row.Media_ID || row.File_Path || row.Title} type="button" onClick={() => openFile(row)}>
            <span>{row.Type || 'report'}</span>
            <strong>{row.Title || row.Receipt_Number || 'Generated document'}</strong>
            <small>{row.Report_Date || row.Created_At || 'No date saved'}</small>
            <p>{row.Account_Name || row.Property_Number || row.Receipt_Number || townName}</p>
            {row._kind === 'receipt' && (
              <em>PKR {Number(row.Amount || 0).toLocaleString()}</em>
            )}
          </button>
        ))}
        {!loading && !filtered.length && <div className="property-board-empty">No saved PDFs or reports yet.</div>}
      </div>

      {selectedReceipt && (
        <div className="ui-modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedReceipt(null)}>
          <div className="ui-modal-shell media-receipt-modal" style={{ maxWidth: 680 }}>
            <div className="property-board-kicker">Receipt archive</div>
            <h3>{selectedReceipt.Receipt_Number}</h3>
            <div className="property-detail-list">
              <div><span>Type</span><b>{selectedReceipt.Receipt_Type || '-'}</b></div>
              <div><span>Town</span><b>{selectedReceipt.Town_Name || '-'}</b></div>
              <div><span>Entity</span><b>{selectedReceipt.Entity_Name || selectedReceipt.Entity_ID || '-'}</b></div>
              <div><span>Date</span><b>{selectedReceipt.Receipt_Date || '-'}</b></div>
              <div><span>Amount</span><b>PKR {Number(selectedReceipt.Amount || 0).toLocaleString()}</b></div>
            </div>
            {receiptDetailRows.length > 0 && (
              <>
                <div className="property-detail-subhead">Receipt details</div>
                <div className="media-receipt-detail-grid">
                  {receiptDetailRows.map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <b>{value}</b>
                    </div>
                  ))}
                </div>
              </>
            )}
            <details className="media-receipt-raw">
              <summary>Technical payload</summary>
              <pre className="media-receipt-json">
                {(() => {
                  try { return JSON.stringify(JSON.parse(selectedReceipt.Payload_JSON || '{}'), null, 2); }
                  catch { return selectedReceipt.Payload_JSON || 'No extra payload saved.'; }
                })()}
              </pre>
            </details>
            <div className="media-receipt-actions">
              <button className="btn btn-primary" type="button" onClick={exportSelectedReceipt}>Export / Open PDF</button>
              <button className="btn btn-secondary" type="button" onClick={() => setSelectedReceipt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      <ReportViewerModal
        isOpen={!!viewerModal}
        onClose={() => setViewerModal(null)}
        filePath={viewerModal?.filePath}
        title={viewerModal?.title}
        showToast={showToast}
      />
    </div>
  );
}
