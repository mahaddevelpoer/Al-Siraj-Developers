import React, { useEffect, useMemo, useState } from 'react';

const money = (value) => `PKR ${(Number(value) || 0).toLocaleString()}`;

export default function CashBanksDashboard({ townName, showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ Account_Name: '', Opening_Balance: '', IncludeInTownBalance: false });
  const [refreshTick, setRefreshTick] = useState(0);
  const [confirmModal, setConfirmModal] = useState(null);

  // Statement Report State
  const [reportAccount, setReportAccount] = useState(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [statement, setStatement] = useState(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  const load = async () => {
    if (!townName || !window.api?.getPaymentAccounts) return;
    setLoading(true);
    try {
      const res = await window.api.getPaymentAccounts(townName);
      if (res?.error) throw new Error(res.error);
      setAccounts(Array.isArray(res) ? res : []);
    } catch (error) {
      showToast?.(`Cash & Banks load failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [refreshTick, townName]);

  useEffect(() => {
    const onDataChanged = (event) => {
      const detail = event?.detail || {};
      const sameTown = !detail.townName || !townName || String(detail.townName) === String(townName);
      if (sameTown) {
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

  const summary = useMemo(() => {
    const active = accounts.filter((row) => String(row.Status || 'active').toLowerCase() === 'active');
    const cash = active.find((row) => row.Account_ID === 'cash-in-hand') || {};
    const banks = active.filter((row) => row.Account_Type === 'bank');
    return {
      cashBalance: Number(cash.Current_Balance) || 0,
      cashReceived: Number(cash.Total_Credit) || 0,
      cashPaid: Number(cash.Total_Debit) || 0,
      bankBalance: banks.reduce((sum, row) => sum + (Number(row.Current_Balance) || 0), 0),
      overallBalance: active.reduce((sum, row) => sum + (Number(row.Current_Balance) || 0), 0),
      banks,
    };
  }, [accounts]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.Account_Name.trim()) {
      showToast?.('Bank/account name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await window.api.addBankAccount?.({
        Town_Name: townName,
        Account_Name: form.Account_Name.trim(),
        Opening_Balance: Number(form.Opening_Balance) || 0,
        IncludeInTownBalance: form.IncludeInTownBalance,
      });
      if (res?.error) throw new Error(res.error);
      setForm({ Account_Name: '', Opening_Balance: '', IncludeInTownBalance: false });
      showToast?.('Bank account saved locally. Cloud sync will retry if needed.', 'success');
      await load();
    } catch (error) {
      showToast?.(`Bank account save failed: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const archiveBank = async (account) => {
    setConfirmModal({
      message: `Archive ${account.Account_Name}? Existing ledger rows will stay safe.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setSaving(true);
        try {
          const res = await window.api.updateBankAccount?.({
            accountId: account.Account_ID,
            updates: { Status: 'archived' },
          });
          if (res?.error) throw new Error(res.error);
          showToast?.('Bank account archived', 'success');
          await load();
        } catch (error) {
          showToast?.(`Archive failed: ${error.message}`, 'error');
        } finally {
          setSaving(false);
        }
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  const fetchStatement = async (accountId) => {
    setLoadingStatement(true);
    setStatement(null);
    try {
      const res = await window.api.getBankAccountStatement?.({
        townName,
        accountId: accountId || reportAccount?.Account_ID,
        fromDate,
        toDate
      });
      if (res?.error) throw new Error(res.error);
      setStatement(res);
    } catch (error) {
      showToast?.(`Failed to load statement: ${error.message}`, 'error');
    } finally {
      setLoadingStatement(false);
    }
  };

  const openReport = (account) => {
    setReportAccount(account);
    fetchStatement(account.Account_ID);
  };

  // Re-fetch when dates change if a report is open
  useEffect(() => {
    if (reportAccount) {
      fetchStatement();
    }
  }, [fromDate, toDate]);

  return (
    <div className="accounts-workspace">
      <div className="accounts-toolbar">
        <div>
          <div className="property-board-kicker">Cash and bank accounts</div>
          <h3>Cash & Banks</h3>
        </div>
        <button className="btn btn-secondary" type="button" onClick={load} disabled={loading}>Refresh</button>
      </div>

      <div className="cash-bank-summary" style={{ marginBottom: 18 }}>
        <div className="ui-town-financial-item"><div className="ui-town-financial-lbl">Cash in Hand</div><div className="ui-town-financial-val" style={{ color: '#16a34a' }}>{money(summary.cashBalance)}</div></div>
        <div className="ui-town-financial-item"><div className="ui-town-financial-lbl">Cash Received</div><div className="ui-town-financial-val" style={{ color: '#0f766e' }}>{money(summary.cashReceived)}</div></div>
        <div className="ui-town-financial-item"><div className="ui-town-financial-lbl">Cash Paid</div><div className="ui-town-financial-val" style={{ color: '#dc2626' }}>{money(summary.cashPaid)}</div></div>
        <div className="ui-town-financial-item"><div className="ui-town-financial-lbl">Overall Balance</div><div className="ui-town-financial-val" style={{ color: summary.overallBalance >= 0 ? '#2563eb' : '#dc2626' }}>{money(summary.overallBalance)}</div></div>
      </div>

      <div className="accounts-layout">
        <div className="accounts-grid">
          {loading && <div className="property-board-loading">Loading cash and bank accounts...</div>}
          {!loading && accounts.map((account) => (
            <div key={account.Account_ID} className={`account-card cash-bank-card ${account.Account_ID === 'cash-in-hand' ? 'active' : ''}`}>
              <span>{account.Account_Type === 'bank' ? 'Bank Account' : 'Default Cash'}</span>
              <strong title={account.Account_Name}>{account.Account_Name}</strong>
              <div className="cash-bank-flow">
                <small>Credit {money(account.Total_Credit)}</small>
                <small>Debit {money(account.Total_Debit)}</small>
              </div>
              <b className={(Number(account.Current_Balance) || 0) >= 0 ? 'positive' : 'negative'}>{money(account.Current_Balance)}</b>
              <small>{account.Status || 'active'} / {account.Sync_Status || 'local'}</small>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => openReport(account)}>View Report</button>
                {account.Account_Type === 'bank' && String(account.Status || 'active').toLowerCase() === 'active' && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => archiveBank(account)} disabled={saving}>Archive</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <aside className="account-detail-panel">
          <span>Add Bank / Wallet</span>
          <h3>New payment account</h3>
          <form onSubmit={submit} className="form-grid" style={{ display: 'grid', gap: 12 }}>
            <div className="form-group">
              <label>Bank / Account name</label>
              <input value={form.Account_Name} onChange={(e) => setForm((f) => ({ ...f, Account_Name: e.target.value }))} placeholder="UBL, HBL, Meezan, JazzCash..." />
            </div>
            <div className="form-group">
              <label>Opening balance</label>
              <input type="number" min="0" value={form.Opening_Balance} onChange={(e) => setForm((f) => ({ ...f, Opening_Balance: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input type="checkbox" id="includeBalance" checked={form.IncludeInTownBalance} onChange={(e) => setForm(f => ({ ...f, IncludeInTownBalance: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer', margin: 0 }} />
              <label htmlFor="includeBalance" style={{ cursor: 'pointer', marginBottom: 0, fontSize: 13, userSelect: 'none' }}>Include in Town Balance?</label>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add Bank Account'}</button>
          </form>
          <div className="property-detail-subhead">Balance rule</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            Cash and bank balances are calculated from approved money ledger rows. Old records without a payment account are counted under Cash in Hand.
          </p>
          <div className="property-detail-list">
            <div><span>Total Bank Balance</span><b>{money(summary.bankBalance)}</b></div>
            <div><span>Active Banks</span><b>{summary.banks.length}</b></div>
          </div>
        </aside>
      </div>

      {/* Statement Report Modal */}
      {reportAccount && (
        <div className="ui-modal-overlay" onClick={(e) => e.target === e.currentTarget && setReportAccount(null)}>
          <div className="ui-modal-shell" style={{ maxWidth: 800, width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h3 style={{ margin: 0 }}>Statement - {reportAccount.Account_Name}</h3>
                <small style={{ color: 'var(--text-muted)' }}>{townName} • {reportAccount.Account_Type}</small>
              </div>
              <button className="btn btn-ghost" onClick={() => setReportAccount(null)}>Close</button>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20, background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>From:</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>To:</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Opening Balance</div>
                <strong style={{ fontSize: 16 }}>{money(statement?.openingBalance || 0)}</strong>
              </div>
              <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Period Credit (In)</div>
                <strong style={{ fontSize: 16, color: '#16a34a' }}>
                  {money(statement?.transactions?.filter(t => t.direction === 'Income').reduce((s, t) => s + t.amount, 0))}
                </strong>
              </div>
              <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Period Debit (Out)</div>
                <strong style={{ fontSize: 16, color: '#dc2626' }}>
                  {money(statement?.transactions?.filter(t => t.direction === 'Expense').reduce((s, t) => s + t.amount, 0))}
                </strong>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              {loadingStatement ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading statement...</div>
              ) : statement?.transactions?.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No transactions found in this period.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Description / Party</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Ref / Type</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#16a34a' }}>Credit (In)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#dc2626' }}>Debit (Out)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement?.transactions?.map((tx, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px 14px' }}>{tx.date}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{tx.partyName || '-'}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{tx.description}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 11 }}>{tx.receiptNumber || '-'}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{tx.type}</div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#16a34a', fontWeight: tx.direction === 'Income' ? 600 : 400 }}>
                          {tx.direction === 'Income' ? money(tx.amount) : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#dc2626', fontWeight: tx.direction === 'Expense' ? 600 : 400 }}>
                          {tx.direction === 'Expense' ? money(tx.amount) : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                          {money(tx.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div style={{ marginTop: 16, textAlign: 'right', fontSize: 14, fontWeight: 700 }}>
              Closing Balance: <span style={{ color: statement?.closingBalance >= 0 ? '#2563eb' : '#dc2626' }}>{money(statement?.closingBalance)}</span>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:440,padding:24}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700}}>Confirm Action</h3>
            <p style={{margin:'0 0 20px',color:'var(--text-secondary)',fontSize:14,lineHeight:1.6}}>{confirmModal.message}</p>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={confirmModal.onCancel}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmModal.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
