import React, { useEffect, useMemo, useState } from 'react';

const today = () => new Date().toISOString().slice(0, 10);
const lifetimeStart = '2000-01-01';
const firstDay = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const money = (value) => `PKR ${(Number(value) || 0).toLocaleString()}`;

function makeAccount(type, name, extra = {}) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  return {
    id: `${type}:${clean}`.toLowerCase(),
    type,
    name: clean,
    received: Number(extra.received) || 0,
    paid: Number(extra.paid) || 0,
    balance: Number(extra.balance ?? ((Number(extra.received) || 0) - (Number(extra.paid) || 0))) || 0,
    rows: extra.rows || [],
  };
}

export default function AccountsDashboard({ townName, showToast }) {
  const [fromDate, setFromDate] = useState(firstDay());
  const [toDate, setToDate] = useState(today());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [masterAccounts, setMasterAccounts] = useState({ agents: [], investors: [], constructors: [] });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const onDataChanged = (event) => {
      const detail = event?.detail || {};
      const events = Array.isArray(detail.events) ? detail.events : [];
      const sameTown = !detail.townName || !townName || String(detail.townName) === String(townName);
      if (!sameTown) return;
      if (
        events.some((name) => [
          'ledger:changed',
          'account:changed',
          'remaining:changed',
          'salary:changed',
          'commission:changed',
          'investor:changed',
          'construction:changed',
          'summary:rebuild-required',
        ].includes(name))
      ) {
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

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!townName || !window.api?.getTownLedgerReport) return;
      setLoading(true);
      try {
        const res = await window.api.getTownLedgerReport({
          townName,
          fromDate: lifetimeStart,
          toDate: today(),
        });
        if (res?.error) throw new Error(res.error);
        const [agents, investors, constructors] = await Promise.all([
          window.api.getTownAgents?.(townName).catch(() => []),
          window.api.getInvestors?.(townName).catch(() => []),
          window.api.getConstructionProjects?.(townName).catch(() => []),
        ]);
        if (mounted) setReport(res);
        if (mounted) setMasterAccounts({
          agents: Array.isArray(agents) ? agents : [],
          investors: Array.isArray(investors) ? investors : [],
          constructors: Array.isArray(constructors) ? constructors : [],
        });
      } catch (error) {
        showToast?.(`Accounts load failed: ${error.message}`, 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [refreshTick, showToast, townName]);

  const accounts = useMemo(() => {
    const items = [];
    (report?.employeeLedgers || []).forEach((row) => {
      const account = makeAccount('Employee', row.name, {
        paid: row.cashDisbursed ?? row.paid,
        balance: -(Number(row.remaining) || 0),
        rows: [row],
      });
      if (account) items.push(account);
    });
    (report?.agentLedgers || []).forEach((row) => {
      const account = makeAccount('Sales Agent', row.name, {
        paid: row.paid,
        balance: -(Number(row.remaining) || 0),
        rows: [row],
      });
      if (account) items.push(account);
    });
    (masterAccounts.agents || []).forEach((row) => {
      const exists = items.some((item) => item.type === 'Sales Agent' && item.name === row.Agent_Name);
      if (!exists) {
        const account = makeAccount('Sales Agent', row.Agent_Name, { rows: [{ name: row.Agent_Name, date: row.Created_At, amount: 0, description: row.Phone_Number || 'Manual town agent' }] });
        if (account) items.push(account);
      }
    });
    (report?.investorLedgers || []).forEach((row) => {
      const account = makeAccount('Investor', row.name || row.Investor_Name, {
        received: row.credit || row.received,
        paid: row.debit || row.paid,
        balance: row.balance,
        rows: [row],
      });
      if (account) items.push(account);
    });
    (masterAccounts.investors || []).forEach((row) => {
      const exists = items.some((item) => item.type === 'Investor' && item.name === row.Investor_Name);
      if (!exists) {
        const account = makeAccount('Investor', row.Investor_Name, {
          balance: Number(row.Balance) || 0,
          rows: [{ name: row.Investor_Name, date: row.Created_At, amount: row.Balance || 0, description: row.Phone_Number || 'Investor account' }],
        });
        if (account) items.push(account);
      }
    });
    (report?.constructorLedgers || report?.constructionLedgers || []).forEach((row) => {
      const account = makeAccount('Constructor', row.name || row.Constructor_Name, {
        paid: row.paid,
        balance: -(Number(row.remaining) || 0),
        rows: [row],
      });
      if (account) items.push(account);
    });
    (masterAccounts.constructors || []).forEach((row) => {
      const name = row.Constructor_Name || row.Company_Name;
      const exists = items.some((item) => item.type === 'Constructor' && item.name === name);
      if (!exists) {
        const paid = Number(row.Paid_Amount) || 0;
        const remaining = Number(row.Remaining_Amount) || Math.max(0, (Number(row.Deal_Amount) || 0) - paid);
        const account = makeAccount('Constructor', name, {
          paid,
          balance: -remaining,
          rows: [{ name, date: row.Start_Date, amount: row.Deal_Amount || 0, description: row.Category || 'Construction deal' }],
        });
        if (account) items.push(account);
      }
    });
    (report?.customerLedgers || []).forEach((row) => {
      const label = `${row.customer || row.Customer_Name || 'Customer'} - ${row.property || row.Plot_Shop_Number || ''}`;
      const account = makeAccount('Customer', label, {
        received: row.received,
        balance: row.remaining,
        rows: [row],
      });
      if (account) items.push(account);
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [masterAccounts, report]);

  const filtered = accounts.filter((account) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return account.name.toLowerCase().includes(q) || account.type.toLowerCase().includes(q);
  });
  const selected = accounts.find((account) => account.id === selectedId) || filtered[0] || null;

  const exportReport = async () => {
    if (!window.api?.exportTownLedgerReport) return;
    try {
      const res = await window.api.exportTownLedgerReport({ townName, fromDate, toDate });
      if (res?.error) throw new Error(res.error);
      await window.api.openReportFile?.(res.pdfPath || res.htmlPath || res.excelPath);
      showToast?.('Account ledger report saved to Media');
    } catch (error) {
      showToast?.(`Report export failed: ${error.message}`, 'error');
    }
  };

  const exportSelectedReport = async () => {
    if (!selected || !window.api?.exportAccountLedgerReport) return exportReport();
    try {
      const res = await window.api.exportAccountLedgerReport({ townName, fromDate, toDate, account: selected });
      if (res?.error) throw new Error(res.error);
      await window.api.openReportFile?.(res.pdfPath || res.htmlPath);
      showToast?.(`${selected.name} account report saved to Media`);
    } catch (error) {
      showToast?.(`Account report export failed: ${error.message}`, 'error');
    }
  };

  return (
    <div className="accounts-workspace">
      <div className="accounts-toolbar">
        <div>
          <div className="property-board-kicker">Accounts and ledgers</div>
          <h3>Town account cards</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
            Cards show lifetime balances. Date range is only for report/PDF export.
          </p>
        </div>
        <div className="accounts-actions">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search account..." />
          <input title="Report from date" type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
          <input title="Report to date" type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
          <button className="btn btn-primary" type="button" onClick={exportReport}>Report PDF</button>
        </div>
      </div>

      <div className="accounts-layout">
        <div className="accounts-grid">
          {loading && <div className="property-board-loading">Loading account ledgers...</div>}
          {!loading && filtered.map((account) => (
            <button
              key={account.id}
              className={`account-card ${selected?.id === account.id ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedId(account.id)}
            >
              <span>{account.type}</span>
              <strong>{account.name}</strong>
              <div>
                <small>Received {money(account.received)}</small>
                <small>Paid {money(account.paid)}</small>
              </div>
              <b className={account.balance >= 0 ? 'positive' : 'negative'}>{money(account.balance)}</b>
            </button>
          ))}
          {!loading && !filtered.length && <div className="property-board-empty">No lifetime accounts found.</div>}
        </div>

        <aside className="account-detail-panel">
          {selected ? (
            <>
              <span>{selected.type}</span>
              <h3>{selected.name}</h3>
              <button className="btn btn-primary" type="button" onClick={exportSelectedReport} style={{ width: '100%', marginBottom: 14 }}>
                Save / Open Report PDF
              </button>
              <div className="property-detail-list">
                <div><span>Total received</span><b>{money(selected.received)}</b></div>
                <div><span>Total paid</span><b>{money(selected.paid)}</b></div>
                <div><span>Balance</span><b>{money(selected.balance)}</b></div>
              </div>
              <div className="property-detail-subhead">Ledger rows</div>
              <div className="property-detail-mini-list">
                {selected.rows.map((row, idx) => (
                  <div key={idx}>
                    <span>{row.date || row.Date || row.property || row.name || selected.type}</span>
                    <b>{money(row.amount || row.received || row.paid || row.remaining || selected.balance)}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="property-board-empty">Select an account card.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
