import React, { useEffect, useMemo, useState } from 'react';

const money = (value) => `PKR ${(Number(value) || 0).toLocaleString()}`;

export default function CashBanksDashboard({ townName, showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ Account_Name: '', Opening_Balance: '' });
  const [refreshTick, setRefreshTick] = useState(0);

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
      const events = Array.isArray(detail.events) ? detail.events : [];
      const sameTown = !detail.townName || !townName || String(detail.townName) === String(townName);
      if (!sameTown) return;
      if (events.some((name) => ['cash-bank:changed', 'ledger:changed', 'summary:rebuild-required'].includes(name))) {
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
      });
      if (res?.error) throw new Error(res.error);
      setForm({ Account_Name: '', Opening_Balance: '' });
      showToast?.('Bank account saved locally. Cloud sync will retry if needed.', 'success');
      await load();
    } catch (error) {
      showToast?.(`Bank account save failed: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const archiveBank = async (account) => {
    if (!window.confirm(`Archive ${account.Account_Name}? Existing ledger rows will stay safe.`)) return;
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
  };

  return (
    <div className="accounts-workspace">
      <div className="accounts-toolbar">
        <div>
          <div className="property-board-kicker">Cash and bank accounts</div>
          <h3>Cash & Banks</h3>
        </div>
        <button className="btn btn-secondary" type="button" onClick={load} disabled={loading}>Refresh</button>
      </div>

      <div className="ui-kpi-grid-4" style={{ marginBottom: 18 }}>
        <div className="ui-town-financial-item"><div className="ui-town-financial-lbl">Cash in Hand</div><div className="ui-town-financial-val" style={{ color: '#16a34a' }}>{money(summary.cashBalance)}</div></div>
        <div className="ui-town-financial-item"><div className="ui-town-financial-lbl">Cash Received</div><div className="ui-town-financial-val" style={{ color: '#0f766e' }}>{money(summary.cashReceived)}</div></div>
        <div className="ui-town-financial-item"><div className="ui-town-financial-lbl">Cash Paid</div><div className="ui-town-financial-val" style={{ color: '#dc2626' }}>{money(summary.cashPaid)}</div></div>
        <div className="ui-town-financial-item"><div className="ui-town-financial-lbl">Overall Balance</div><div className="ui-town-financial-val" style={{ color: summary.overallBalance >= 0 ? '#2563eb' : '#dc2626' }}>{money(summary.overallBalance)}</div></div>
      </div>

      <div className="accounts-layout">
        <div className="accounts-grid">
          {loading && <div className="property-board-loading">Loading cash and bank accounts...</div>}
          {!loading && accounts.map((account) => (
            <div key={account.Account_ID} className={`account-card ${account.Account_ID === 'cash-in-hand' ? 'active' : ''}`}>
              <span>{account.Account_Type === 'bank' ? 'Bank Account' : 'Default Cash'}</span>
              <strong>{account.Account_Name}</strong>
              <div>
                <small>Credit {money(account.Total_Credit)}</small>
                <small>Debit {money(account.Total_Debit)}</small>
              </div>
              <b className={(Number(account.Current_Balance) || 0) >= 0 ? 'positive' : 'negative'}>{money(account.Current_Balance)}</b>
              <small>{account.Status || 'active'} / {account.Sync_Status || 'local'}</small>
              {account.Account_Type === 'bank' && String(account.Status || 'active').toLowerCase() === 'active' && (
                <button className="btn btn-ghost" type="button" onClick={() => archiveBank(account)} disabled={saving}>Archive</button>
              )}
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
    </div>
  );
}
