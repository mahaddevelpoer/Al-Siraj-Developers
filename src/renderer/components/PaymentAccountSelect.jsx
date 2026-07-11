import React, { useEffect, useMemo, useState } from 'react';

const cashFallback = {
  account_id: 'cash-in-hand',
  account_name: 'Cash in Hand',
  account_type: 'cash',
  status: 'Active',
};

function normalizeAccount(row) {
  const id = row?.account_id || row?.Account_ID || row?.id || cashFallback.account_id;
  const name = row?.account_name || row?.Account_Name || row?.name || cashFallback.account_name;
  const type = row?.account_type || row?.Account_Type || row?.type || cashFallback.account_type;
  return {
    ...row,
    account_id: id,
    account_name: name,
    account_type: type,
    status: row?.status || row?.Status || 'Active',
  };
}

export function toPaymentAccountPayload(account) {
  const normalized = normalizeAccount(account || cashFallback);
  return {
    paymentAccountId: normalized.account_id,
    paymentAccountName: normalized.account_name,
    paymentAccountType: normalized.account_type,
  };
}

export default function PaymentAccountSelect({ townName, value, onChange, label = 'Receive / Pay From', compact = false, paymentMethod = 'All' }) {
  const [accounts, setAccounts] = useState([cashFallback]);
  const [loading, setLoading] = useState(false);

  const activeAccounts = useMemo(() => {
    const list = accounts.map(normalizeAccount).filter((row) => String(row.status || 'Active').toLowerCase() !== 'inactive');
    if (!paymentMethod || String(paymentMethod).toLowerCase() === 'all') {
      return list.length ? list : [cashFallback];
    }
    const isCash = String(paymentMethod || 'Cash').toLowerCase() === 'cash';
    const filteredList = list.filter(acc => {
      const type = String(acc.account_type || 'cash').toLowerCase();
      if (isCash) {
        return type === 'cash';
      } else {
        return type === 'bank';
      }
    });
    return filteredList.length ? filteredList : [cashFallback];
  }, [accounts, paymentMethod]);

  const selectedId = value?.paymentAccountId || value?.account_id || activeAccounts[0]?.account_id || cashFallback.account_id;

  const emitSelection = (account) => {
    onChange?.(toPaymentAccountPayload(account));
  };

  const load = async () => {
    if (!townName || !window.api?.getPaymentAccounts) {
      setAccounts([cashFallback]);
      return;
    }
    setLoading(true);
    try {
      const rows = await window.api.getPaymentAccounts(townName);
      setAccounts(Array.isArray(rows) && rows.length ? rows : [cashFallback]);
    } catch {
      setAccounts([cashFallback]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [townName]);

  useEffect(() => {
    if (!value?.paymentAccountId && activeAccounts[0]) emitSelection(activeAccounts[0]);
  }, [activeAccounts.length, value?.paymentAccountId]);

  useEffect(() => {
    const listener = (event) => {
      const detail = event?.detail || {};
      const events = Array.isArray(detail.events) ? detail.events : [];
      const sameTown = !detail.townName || !townName || String(detail.townName) === String(townName);
      if (sameTown && events.some((name) => ['cash-bank:changed', 'ledger:changed'].includes(name))) load();
    };
    window.addEventListener('al-siraj-business-data-changed', listener);
    return () => window.removeEventListener('al-siraj-business-data-changed', listener);
  }, [townName]);

  return (
    <div style={{ marginBottom: compact ? 8 : 12 }}>
      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <select
        value={selectedId}
        disabled={loading}
        onChange={(event) => emitSelection(activeAccounts.find((row) => String(row.account_id) === String(event.target.value)) || cashFallback)}
        style={{
          width: '100%',
          padding: compact ? '8px 10px' : '10px 12px',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-input, #fff)',
          color: 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 700,
          boxSizing: 'border-box',
        }}
      >
        {activeAccounts.map((account) => (
          <option key={account.account_id} value={account.account_id}>
            {account.account_name} ({String(account.account_type || 'cash').replace(/_/g, ' ')})
          </option>
        ))}
      </select>
    </div>
  );
}
