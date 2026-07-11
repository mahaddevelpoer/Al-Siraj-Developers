import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PaymentAccountSelect from './PaymentAccountSelect';

export default function PendingCollections({ roleView, townName, onChanged, onNavigate }) {
  const { userProfile, user } = useAuth();
  const agentName = userProfile?.full_name || '';
  const agentEmail = user?.email || userProfile?.email || '';
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payModal, setPayModal] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState(null);
  const [installmentMap, setInstallmentMap] = useState({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [paymentAccount, setPaymentAccount] = useState(null);

  useEffect(() => { loadData(); }, [refreshTick, roleView, townName]);

  useEffect(() => {
    const onDataChanged = (event) => {
      const detail = event?.detail || {};
      const events = Array.isArray(detail.events) ? detail.events : [];
      const sameTown = !detail.townName || !townName || String(detail.townName) === String(townName);
      if (!sameTown) return;
      if (events.some((name) => ['remaining:changed', 'installment:changed', 'sale:changed', 'ledger:changed', 'property:changed'].includes(name))) {
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

  const loadData = async () => {
    setLoading(true);
    try {
      const agent = roleView === 'agent' ? { agentName, agentEmail, townName } : { townName };
      const res = await window.api.getPendingCollections(agent);
      const rows = Array.isArray(res?.data) ? res.data : [];
      const filtered = townName ? rows.filter((row) => String(row.Town_Name || '') === String(townName)) : rows;
      setCollections(filtered);
      const entries = await Promise.all(filtered
        .filter((row) => (parseInt(row.Total_Installments, 10) || 0) > 0 || /installment/i.test(String(row.Collection_Category || '')))
        .slice(0, 80)
        .map(async (row) => {
          const id = `${row.Type}|${row.Plot_Shop_Number}|${row.Town_Name}`;
          const list = await window.api.getPropertyInstallments?.(id).catch(() => []);
          return [String(row.id || id), Array.isArray(list) ? list : []];
        }));
      setInstallmentMap(Object.fromEntries(entries));
    } catch (e) {
      setMsg('Failed to load: ' + e.message);
    }
    setLoading(false);
  };

  const openPayModal = (c) => {
    setPayModal(c);
    setPayAmount(String(c.Remaining_Amount || 0));
    setPayMethod('Cash');
    setPayNotes('');
  };

  const handlePay = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) {
      setMsg('Enter valid amount');
      return;
    }
    setSubmitting(true);
    try {
      const res = await window.api.recordPendingCollection({
        saleId: payModal.id,
        amount: parseFloat(payAmount),
        paymentMethod: payMethod,
        notes: payNotes,
        type: payModal.Type,
        plotShopNumber: payModal.Plot_Shop_Number,
        townName: payModal.Town_Name,
        customerName: payModal.Customer_Name,
        agentName: payModal.Agent_Name,
        totalAmount: payModal.Total_Amount_PKR,
        currentReceived: payModal.Received_Amount,
        ...paymentAccount,
      });
      if (res?.error) { setMsg(res.error); return; }
      setMsg('\u2705 PKR ' + parseFloat(payAmount).toLocaleString() + ' collected!');
      if (res?.newReceived !== undefined || res?.newRemaining !== undefined) {
        setCollections(current => current
          .map(item => String(item.id) === String(payModal.id)
            ? {
                ...item,
                Received_Amount: res.newReceived ?? item.Received_Amount,
                Remaining_Amount: res.newRemaining ?? item.Remaining_Amount,
              }
            : item)
          .filter(item => (parseFloat(item.Remaining_Amount) || 0) > 0));
      }
      setPayModal(null);
      await loadData();
      onChanged?.();
    } catch (e) {
      setMsg('Payment failed: ' + e.message);
    }
    setSubmitting(false);
  };

  const handleDeliver = async (saleId) => {
    try {
      const res = await window.api.deliverFileAfterPayment(saleId);
      if (res?.error) { setMsg(res.error); return; }
      setMsg('\u2705 File delivered successfully!');
      await loadData();
      onChanged?.();
    } catch (e) {
      setMsg('Delivery failed: ' + e.message);
    }
  };

  const showHistory = async (saleId) => {
    try {
      const res = await window.api.getCollectionHistory(saleId);
      setHistory(res?.data || []);
    } catch (e) {
      setMsg('Failed to load history');
    }
  };

  const remaining = collections.reduce((s, c) => s + (parseFloat(c.Remaining_Amount) || 0), 0);
  const total = collections.reduce((s, c) => s + (parseFloat(c.Total_Amount_PKR) || 0), 0);
  const received = collections.reduce((s, c) => s + (parseFloat(c.Received_Amount || c.Advance_Amount_PKR) || 0), 0);
  const categoryTotals = collections.reduce((acc, c) => {
    const key = c.Collection_Category || 'Advance-only Remaining';
    acc[key] = (acc[key] || 0) + (parseFloat(c.Remaining_Amount) || 0);
    return acc;
  }, {});

  return (
    <div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 16, fontSize: 13, fontWeight: 600,
          background: msg.includes('\u2705') ? '#dcfce7' : '#fee2e2',
          color: msg.includes('\u2705') ? '#166534' : '#991b1b',
        }}>
          {msg}
          <button onClick={() => setMsg('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>&times;</button>
        </div>
      )}

      <div className="collections-summary-grid">
        <div className="kpi-item">
          <div className="kpi-label">Pending Collection</div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>PKR {remaining.toLocaleString()}</div>
          <div className="kpi-sub">{collections.length} properties</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Total Received</div>
          <div className="kpi-value pos">PKR {received.toLocaleString()}</div>
          <div className="kpi-sub">Advance + payments</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Total Sale Value</div>
          <div className="kpi-value">PKR {total.toLocaleString()}</div>
          <div className="kpi-sub">All pending properties</div>
        </div>
      </div>

      <div className="collections-category-grid">
        {['Advance-only Remaining', 'Installment Due', 'Overdue', 'Installment Upcoming'].map(label => (
          <div key={label} className="kpi-item" style={{ padding: 12 }}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ fontSize: 18, color: label === 'Overdue' ? '#dc2626' : '#0f172a' }}>
              PKR {(categoryTotals[label] || 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="property-board-loading">Loading pending collections...</div>
      ) : collections.length === 0 ? (
        <div className="empty-state">
          <h3>All caught up!</h3>
          <p>No pending collections. All sold properties are fully paid.</p>
        </div>
      ) : (
        <div className="table-container collections-table-card">
          <div className="table-header">
            <h3>Pending Collections ({collections.length})</h3>
            <button className="btn btn-ghost btn-sm" onClick={loadData} style={{ fontSize: 11 }}>
              Refresh
            </button>
          </div>
          <div className="pending-collections-scroll">
            <table className="data-table pending-collections-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Received</th>
                  <th style={{ color: '#f59e0b' }}>Remaining</th>
                  <th>File</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {collections.map(c => {
                  const rem = parseFloat(c.Remaining_Amount) || 0;
                  const isFullyPaid = rem <= 0;
                  const isInstallmentSale = (parseInt(c.Total_Installments, 10) || 0) > 0 || /installment/i.test(String(c.Collection_Category || ''));
                  const installmentRows = installmentMap[String(c.id || `${c.Type}|${c.Plot_Shop_Number}|${c.Town_Name}`)] || [];
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>
                        {c.Type} #{c.Plot_Shop_Number}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.Town_Name}</div>
                        <div style={{ fontSize: 10, color: c.Collection_Category === 'Overdue' ? '#dc2626' : 'var(--text-muted)', fontWeight: 700 }}>{c.Collection_Category}</div>
                        {isInstallmentSale && installmentRows.length > 0 && (
                          <div style={{ marginTop: 6, fontSize: 10, color: '#334155', fontWeight: 700, lineHeight: 1.5 }}>
                            {installmentRows.filter((i) => !i.isPaid).slice(0, 3).map((i) => (
                              <div key={i.id}>#{i.installmentNumber} - {i.dueDate || '-'} - PKR {(parseFloat(i.dueAmount) || 0).toLocaleString()}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        {c.Customer_Name}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Agent: {c.Agent_Name || '-'}</div>
                      </td>
                      <td>PKR {(parseFloat(c.Total_Amount_PKR) || 0).toLocaleString()}</td>
                      <td className="text-green">
                        PKR {(parseFloat(c.Received_Amount || c.Advance_Amount_PKR) || 0).toLocaleString()}
                      </td>
                      <td>
                        <span style={{
                          color: isFullyPaid ? '#059669' : '#d97706',
                          fontWeight: 700,
                        }}>
                          PKR {rem.toLocaleString()}
                        </span>
                        {isFullyPaid && <span style={{ marginLeft: 4, fontSize: 10, color: '#059669' }}>{'\u2705'} Paid</span>}
                        {isInstallmentSale && (
                          <div style={{ marginTop: 6, fontSize: 10, color: '#2563eb', fontWeight: 800 }}>
                            Installment plan: {installmentRows.filter((i) => !i.isPaid).length}/{installmentRows.length} unpaid
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                          background: c.File_Status === 'Delivered' ? '#dcfce7' : '#fef3c7',
                          color: c.File_Status === 'Delivered' ? '#166534' : '#92400e',
                        }}>
                          {c.File_Status || 'Not Delivered'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions pending-collection-actions">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => openPayModal(c)}
                            disabled={isFullyPaid || isInstallmentSale}
                            style={{ fontSize: 10, padding: '4px 10px' }}
                          >
                            {isInstallmentSale ? 'Use Installments' : isFullyPaid ? 'Paid' : 'Collect'}
                          </button>
                          {isInstallmentSale && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => onNavigate?.('installments')}
                              style={{ fontSize: 10, padding: '4px 10px' }}
                            >
                              Open Tracker
                            </button>
                          )}
                          {isFullyPaid && c.File_Status !== 'Delivered' && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleDeliver(c.id)}
                              style={{ fontSize: 10, padding: '4px 10px' }}
                            >
                              Deliver File
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => showHistory(c.id)}
                            style={{ fontSize: 10, padding: '4px 8px' }}
                            title="Payment History"
                          >
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {payModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: 28,
            maxWidth: 420, width: '100%',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>
              Collect Payment
            </h3>
            <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              <div><strong>Property:</strong> {payModal.Type} #{payModal.Plot_Shop_Number} - {payModal.Town_Name}</div>
              <div><strong>Customer:</strong> {payModal.Customer_Name}</div>
              <div><strong>Total:</strong> PKR {(parseFloat(payModal.Total_Amount_PKR) || 0).toLocaleString()}</div>
              <div><strong>Received So Far:</strong> PKR {(parseFloat(payModal.Received_Amount || payModal.Advance_Amount_PKR) || 0).toLocaleString()}</div>
              <div style={{ color: '#d97706', fontWeight: 700, fontSize: 15, marginTop: 4 }}>
                <strong>Remaining:</strong> PKR {(parseFloat(payModal.Remaining_Amount) || 0).toLocaleString()}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Amount (PKR)</label>
              <input
                type="number"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 700, boxSizing: 'border-box',
                }}
                placeholder="Enter amount..."
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Payment Method</label>
              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)', fontSize: 13, boxSizing: 'border-box',
                }}
              >
                <option>Cash</option>
                <option>Cheque</option>
                <option>Bank Transfer</option>
              </select>
            </div>
            <PaymentAccountSelect
              townName={payModal?.Town_Name || townName}
              value={paymentAccount}
              onChange={setPaymentAccount}
              label="Receive Into"
              paymentMethod={payMethod}
            />
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)', fontSize: 12, boxSizing: 'border-box', resize: 'none',
                }}
                placeholder="Optional notes..."
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                className="btn btn-success"
                onClick={handlePay}
                disabled={submitting}
              >
                {submitting ? 'Processing...' : 'Confirm Payment'}
              </button>
              <button className="btn btn-ghost" onClick={() => setPayModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {history && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: 28,
            maxWidth: 500, width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>
              Payment History
            </h3>
            {history.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No payments recorded yet</div>
            ) : (
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td>{h.payment_date}</td>
                      <td className="text-green" style={{ fontWeight: 700 }}>PKR {(parseFloat(h.amount) || 0).toLocaleString()}</td>
                      <td>{h.payment_method}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setHistory(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

