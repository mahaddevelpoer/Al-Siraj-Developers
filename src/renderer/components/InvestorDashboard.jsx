import React, { useEffect, useState } from 'react';
import { WalletIcon, PlusIcon, DollarIcon } from './Icons';
import OfficialReceipt from './OfficialReceipt';

const fmt = (n) => `PKR ${(parseFloat(n) || 0).toLocaleString()}`;

export default function InvestorDashboard({ townName, showToast, refreshKey = 0 }) {
  const [investors, setInvestors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState({ Investor_Name: '', Phone_Number: '', CNIC: '', Address: '', Notes: '' });
  const [tx, setTx] = useState({ Investor_ID: '', Type: 'Credit', Amount: '', Date: new Date().toISOString().split('T')[0], Notes: '' });
  const [loading, setLoading] = useState(false);
  const [selectedInvestorId, setSelectedInvestorId] = useState('');
  const [receiptData, setReceiptData] = useState(null);
  const [showAddInvestor, setShowAddInvestor] = useState(false);

  const load = async () => {
    const [inv, ledger] = await Promise.all([
      window.api?.getInvestors?.(townName),
      window.api?.getInvestorTransactions?.({ townName }),
    ]);
    setInvestors(Array.isArray(inv) ? inv : []);
    setTransactions(Array.isArray(ledger) ? ledger : []);
  };
  useEffect(() => { load(); }, [townName, refreshKey]);

  const u = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));
  const tu = (key) => (e) => setTx(f => ({ ...f, [key]: e.target.value }));

  const addInvestor = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await window.api.addInvestor({ ...form, Town_Name: townName, Approval_Status: 'approved' });
    setLoading(false);
    if (result?.error) return showToast?.(result.error, 'error');
    showToast?.('Investor added');
    setForm({ Investor_Name: '', Phone_Number: '', CNIC: '', Address: '', Notes: '' });
    setSelectedInvestorId(result.Investor_ID || '');
    setTx(f => ({ ...f, Investor_ID: result.Investor_ID || f.Investor_ID }));
    setShowAddInvestor(false);
    load();
  };

  const postTx = async (e) => {
    e.preventDefault();
    if (!tx.Investor_ID) return showToast?.('Select investor', 'error');
    setLoading(true);
    const result = await window.api.recordInvestorTransaction(tx);
    setLoading(false);
    if (result?.error) return showToast?.(result.error, 'error');
    showToast?.(`Investor ${tx.Type.toLowerCase()} saved`);
    setReceiptData({
      type: 'investor',
      townName,
      date: result.Date || tx.Date,
      receiptNumber: result.Receipt_Number,
      investorName: result.Investor_Name,
      transactionType: result.Type,
      amount: result.Amount,
      balanceAfter: result.Balance_After,
      note: result.Notes || tx.Notes,
    });
    setTx({ Investor_ID: '', Type: 'Credit', Amount: '', Date: new Date().toISOString().split('T')[0], Notes: '' });
    load();
  };

  const openTransactionReceipt = (row) => {
    setReceiptData({
      type: 'investor',
      townName,
      date: row.Date,
      receiptNumber: row.Receipt_Number,
      investorName: row.Investor_Name,
      transactionType: row.Type,
      amount: row.Amount,
      balanceAfter: row.Balance_After,
      note: row.Notes,
    });
  };

  const totalBalance = investors.reduce((s, i) => s + (parseFloat(i.Balance) || 0), 0);
  const selectedInvestor = investors.find(i => String(i.Investor_ID) === String(selectedInvestorId)) || investors[0] || null;
  const selectedHistory = selectedInvestor
    ? transactions.filter(t => String(t.Investor_ID) === String(selectedInvestor.Investor_ID))
    : transactions;

  return (
    <div>
      {receiptData && (
        <OfficialReceipt
          data={receiptData}
          townName={townName}
          onClose={() => setReceiptData(null)}
        />
      )}

      <div className="stat-cards mb-6">
        <div className="stat-card green"><div className="card-label">Investor Balance</div><div className="card-value">{fmt(totalBalance)}</div></div>
        <div className="stat-card"><div className="card-label">Investors</div><div className="card-value">{investors.length}</div></div>
        <div className="stat-card"><div className="card-label">Transactions</div><div className="card-value">{transactions.length}</div></div>
      </div>

      <div className="form-container mb-6">
        <div className="table-header" style={{ padding: 0, marginBottom: 16, borderBottom: 0 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><WalletIcon size={18} /> Investors</h3>
          <button type="button" className="btn btn-primary" onClick={() => setShowAddInvestor(v => !v)}>
            <PlusIcon size={13} /> Add Investor
          </button>
        </div>

        {investors.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
            {investors.map((investor) => {
              const active = String(selectedInvestor?.Investor_ID) === String(investor.Investor_ID);
              const count = transactions.filter(t => String(t.Investor_ID) === String(investor.Investor_ID)).length;
              return (
                <button
                  key={investor.Investor_ID}
                  type="button"
                  onClick={() => {
                    setSelectedInvestorId(investor.Investor_ID);
                    setTx(f => ({ ...f, Investor_ID: investor.Investor_ID }));
                  }}
                  style={{
                    aspectRatio: '1 / 1',
                    border: active ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                    background: active ? '#eff6ff' : 'var(--bg-card)',
                    borderRadius: 12,
                    padding: 14,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: active ? '0 12px 26px rgba(37, 99, 235, 0.16)' : '0 8px 18px rgba(15, 23, 42, 0.06)',
                  }}
                >
                  <div>
                    <div style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: active ? 'var(--accent-blue)' : 'var(--bg-secondary)', color: active ? '#fff' : 'var(--accent-blue)', marginBottom: 10 }}>
                      <WalletIcon size={18} />
                    </div>
                    <div style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.2 }}>{investor.Investor_Name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>{investor.Phone_Number || 'No phone'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--accent-green)', fontWeight: 900, fontSize: 16 }}>{fmt(investor.Balance)}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{count} transaction{count === 1 ? '' : 's'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 18, border: '1px dashed var(--border-color)', borderRadius: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}>
            No investors yet.
          </div>
        )}

        {showAddInvestor && (
          <form onSubmit={addInvestor} style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-color)' }}>
            <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PlusIcon size={16} /> New Investor</div>
            <div className="form-grid">
              <div className="form-group"><label>Name *</label><input value={form.Investor_Name} onChange={u('Investor_Name')} required /></div>
              <div className="form-group"><label>Phone</label><input value={form.Phone_Number} onChange={u('Phone_Number')} /></div>
              <div className="form-group"><label>CNIC</label><input value={form.CNIC} onChange={u('CNIC')} /></div>
              <div className="form-group"><label>Address</label><input value={form.Address} onChange={u('Address')} /></div>
              <div className="form-group full"><label>Notes</label><input value={form.Notes} onChange={u('Notes')} /></div>
            </div>
            <button className="btn btn-primary" disabled={loading} style={{ marginTop: 12 }}><PlusIcon size={13} /> Save Investor</button>
          </form>
        )}
      </div>

      {selectedInvestor && (
        <div className="form-container mb-6">
          <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><WalletIcon size={16} /> {selectedInvestor.Investor_Name}</div>
          <div className="stat-cards" style={{ marginBottom: 0 }}>
            <div className="stat-card green"><div className="card-label">Balance</div><div className="card-value">{fmt(selectedInvestor.Balance)}</div></div>
            <div className="stat-card"><div className="card-label">Phone</div><div className="card-value" style={{ fontSize: 18 }}>{selectedInvestor.Phone_Number || '-'}</div></div>
            <div className="stat-card"><div className="card-label">CNIC</div><div className="card-value" style={{ fontSize: 18 }}>{selectedInvestor.CNIC || '-'}</div></div>
          </div>
          {(selectedInvestor.Address || selectedInvestor.Notes) && (
            <div style={{ marginTop: 14, color: 'var(--text-secondary)', fontSize: 13 }}>
              {selectedInvestor.Address && <div><strong>Address:</strong> {selectedInvestor.Address}</div>}
              {selectedInvestor.Notes && <div><strong>Notes:</strong> {selectedInvestor.Notes}</div>}
            </div>
          )}
        </div>
      )}

      <div className="form-container mb-6">
        <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DollarIcon size={16} /> Credit / Debit</div>
        <form onSubmit={postTx}>
          <div className="form-grid">
            <div className="form-group"><label>Investor *</label><select value={tx.Investor_ID} onChange={tu('Investor_ID')} required><option value="">Select investor</option>{investors.map(i => <option key={i.Investor_ID} value={i.Investor_ID}>{i.Investor_Name} - {fmt(i.Balance)}</option>)}</select></div>
            <div className="form-group"><label>Type</label><select value={tx.Type} onChange={tu('Type')}><option>Credit</option><option>Debit</option></select></div>
            <div className="form-group"><label>Amount *</label><input type="number" value={tx.Amount} onChange={tu('Amount')} required /></div>
            <div className="form-group"><label>Date</label><input type="date" value={tx.Date} onChange={tu('Date')} /></div>
            <div className="form-group full"><label>Notes</label><input value={tx.Notes} onChange={tu('Notes')} /></div>
          </div>
          <button className="btn btn-primary" disabled={loading} style={{ marginTop: 12 }}>Save Transaction</button>
        </form>
      </div>

      <div className="table-container">
        <div className="table-header"><h3>{selectedInvestor ? `${selectedInvestor.Investor_Name} Ledger` : 'Investor Ledger'}</h3></div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Investor</th><th>Type</th><th>Amount</th><th>Balance</th><th>Receipt</th><th>Action</th></tr></thead>
          <tbody>{selectedHistory.map(t => (
            <tr key={t.Transaction_ID}>
              <td>{t.Date}</td>
              <td>{t.Investor_Name}</td>
              <td>{t.Type}</td>
              <td>{fmt(t.Amount)}</td>
              <td>{fmt(t.Balance_After)}</td>
              <td>{t.Receipt_Number}</td>
              <td><button type="button" className="btn btn-sm" onClick={() => openTransactionReceipt(t)}>View / Print</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
