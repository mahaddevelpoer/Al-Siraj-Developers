import React, { useEffect, useMemo, useState } from 'react';
import { ChartIcon, WalletIcon, CalendarIcon, BookIcon, SoldIcon, PlotIcon, ShopIcon } from './Icons';

const today = () => new Date().toISOString().slice(0, 10);
const firstDay = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const money = (value) => Number(value || 0);
const pkr = (value) => `PKR ${Math.round(money(value)).toLocaleString()}`;

function compactDate(value) {
  return String(value || '').slice(0, 10) || '-';
}

function Stat({ Icon, label, value, tone = '#2563eb' }) {
  return (
    <div className="acct-stat">
      <div className="acct-stat-icon" style={{ color: tone }}><Icon size={18} /></div>
      <span>{label}</span>
      <strong style={{ color: tone }}>{value}</strong>
    </div>
  );
}

function ReportTable({ empty, columns, rows }) {
  return (
    <div className="acct-table-wrap">
      <table className="acct-table">
        <thead>
          <tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((col) => <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={columns.length} className="acct-empty-cell">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountingReports({ townName = '', showToast }) {
  const [fromDate, setFromDate] = useState(firstDay());
  const [toDate, setToDate] = useState(today());
  const [report, setReport] = useState(null);
  const [plots, setPlots] = useState([]);
  const [shops, setShops] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [active, setActive] = useState('accounts');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [viewerModal, setViewerModal] = useState(null);

  useEffect(() => {
    load();
  }, [townName, fromDate, toDate]);

  const load = async () => {
    if (!townName || !window.api) return;
    setLoading(true);
    try {
      const [r, p, s, inst] = await Promise.all([
        window.api.getTownLedgerReport?.({ townName, fromDate, toDate }),
        window.api.getAllPlots?.(townName).catch(() => []),
        window.api.getAllShops?.(townName).catch(() => []),
        window.api.getInstallments?.().catch(() => []),
      ]);
      if (r?.error) throw new Error(r.error);
      setReport(r || null);
      setPlots(Array.isArray(p) ? p : []);
      setShops(Array.isArray(s) ? s : []);
      setInstallments((Array.isArray(inst) ? inst : []).filter((row) => String(row.Town_Name || row.townName || '') === String(townName)));
    } catch (e) {
      showToast?.(e.message || 'Accounting reports could not be loaded', 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (kind) => {
    if (!window.api?.exportTownLedgerReport) return;
    setExporting(true);
    try {
      const res = await window.api.exportTownLedgerReport({ townName, fromDate, toDate });
      if (res?.error) throw new Error(res.error);
      const file = kind === 'excel' ? res.excelPath : res.htmlPath || res.pdfPath;
      showToast?.(`${kind === 'excel' ? 'Excel' : 'PDF'} accounting report ready`);
      setViewerModal({
        filePath: file,
        reportData: res.report,
        title: `${townName || 'All Towns'} Accounting Ledger Report`,
      });
    } catch (e) {
      showToast?.(e.message || 'Report export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary || {};
  const accountList = useMemo(() => {
    const base = [
      { title: 'Cash / Bank', group: 'Asset', debit: summary.cashBalance > 0 ? summary.cashBalance : 0, credit: summary.cashBalance < 0 ? Math.abs(summary.cashBalance) : 0 },
      { title: 'Customer Receivable', group: 'Asset', debit: summary.receivable, credit: 0 },
      { title: 'Payables', group: 'Liability', debit: 0, credit: summary.payable },
      { title: 'Lease / Property Sales', group: 'Income', debit: 0, credit: summary.totalReceived },
      { title: 'Operating Expenses', group: 'Expense', debit: summary.totalPaid, credit: 0 },
      { title: 'Investor Ledger', group: 'Capital', debit: summary.investorDebit, credit: summary.investorCredit },
      { title: 'Construction Work', group: 'Expense', debit: summary.constructionPaid, credit: 0 },
    ];
    return base.filter((row) => money(row.debit) || money(row.credit) || ['Cash / Bank', 'Customer Receivable'].includes(row.title));
  }, [summary]);

  const trialRows = useMemo(() => {
    const rows = (report?.accountLedgers || []).map((row, index) => ({
      id: `ledger-${index}`,
      account: row.account || `${row.debit || 'Unknown'} -> ${row.credit || 'Unknown'}`,
      debit: row.debit || '-',
      credit: row.credit || '-',
      amount: row.amount,
      rows: row.rows,
    }));
    if (!rows.length) {
      return accountList.map((row) => ({
        id: row.title,
        account: row.title,
        debit: row.debit ? row.title : '-',
        credit: row.credit ? row.title : '-',
        amount: row.debit || row.credit,
        rows: 1,
      }));
    }
    return rows;
  }, [report, accountList]);

  const recoveryRows = (report?.customerLedgers || [])
    .filter((row) => money(row.remaining) > 0)
    .map((row, index) => ({ ...row, id: `recovery-${index}` }));

  const schemeRows = [
    { label: 'Plots', total: plots.length, sold: plots.filter((p) => String(p.Status || '').toLowerCase() === 'sold').length },
    { label: 'Shops', total: shops.length, sold: shops.filter((s) => String(s.Status || '').toLowerCase() === 'sold').length },
  ].map((row) => ({ ...row, available: Math.max(0, row.total - row.sold) }));

  const installmentRows = installments.map((row, index) => ({
    id: `inst-${index}`,
    property: row.Property_Number || row.Plot_Shop_Number || row.Property_ID || '-',
    customer: row.Customer_Name || row.Buyer_Name || '-',
    date: compactDate(row.Due_Date || row.Installment_Date || row.Date),
    amount: row.Amount || row.Installment_Amount || row.Monthly_Installment || 0,
    status: row.Status || row.Payment_Status || '-',
  }));

  const tabs = [
    { key: 'accounts', label: 'Chart / Account List' },
    { key: 'transactions', label: 'Debit / Credit Rows' },
    { key: 'individuals', label: 'Individual Ledgers' },
    { key: 'groups', label: 'Group Ledgers' },
    { key: 'overall', label: 'Overall' },
    { key: 'receipts', label: 'Receipts' },
    { key: 'trial', label: 'Trial Balance' },
    { key: 'recovery', label: 'Recovery List' },
    { key: 'scheme', label: 'Scheme Summary' },
    { key: 'installments', label: 'Installment Details' },
  ];

  return (
    <div className="acct-shell">
      <div className="acct-hero">
        <div>
          <div className="acct-kicker">Accounts Reports</div>
          <h2>{townName}</h2>
          <p>The old accounting screens are consolidated here: ledgers, recovery, trial balance, scheme summary, and exports.</p>
        </div>
        <div className="acct-datebar">
          <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
          <span>to</span>
          <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
          <button className="btn btn-ghost" disabled={exporting || loading} onClick={() => exportReport('pdf')}>PDF</button>
          <button className="btn btn-primary" disabled={exporting || loading} onClick={() => exportReport('excel')}>Excel</button>
        </div>
      </div>

      <div className="acct-stats">
        <Stat Icon={WalletIcon} label="Total Received" value={pkr(summary.totalReceived)} tone="#10b981" />
        <Stat Icon={SoldIcon} label="Total Paid" value={pkr(summary.totalPaid)} tone="#ef4444" />
        <Stat Icon={ChartIcon} label="Cash Balance" value={pkr(summary.cashBalance)} tone={money(summary.cashBalance) >= 0 ? '#2563eb' : '#ef4444'} />
        <Stat Icon={CalendarIcon} label="Receivable" value={pkr(summary.receivable)} tone="#f59e0b" />
      </div>

      <div className="acct-tabs">
        {tabs.map((tab) => (
          <button key={tab.key} className={active === tab.key ? 'active' : ''} onClick={() => setActive(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="acct-panel">
        {loading ? (
          <div className="acct-loading">Loading accounting data...</div>
        ) : active === 'accounts' ? (
          <ReportTable
            empty="No accounts yet."
            columns={[
              { key: 'title', label: 'Account Title' },
              { key: 'group', label: 'Group' },
              { key: 'debit', label: 'Debit', render: (r) => pkr(r.debit) },
              { key: 'credit', label: 'Credit', render: (r) => pkr(r.credit) },
            ]}
            rows={accountList}
          />
        ) : active === 'transactions' ? (
          <ReportTable
            empty="No debit/credit rows for selected dates."
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'direction', label: 'Side' },
              { key: 'amount', label: 'Amount', render: (r) => pkr(r.amount) },
              { key: 'debitAccount', label: 'Debit' },
              { key: 'creditAccount', label: 'Credit' },
              { key: 'partyName', label: 'Party' },
              { key: 'description', label: 'Description' },
              { key: 'receiptNumber', label: 'Receipt' },
            ]}
            rows={(report?.ledger || []).map((row, index) => ({ ...row, id: `tx-${index}` }))}
          />
        ) : active === 'individuals' ? (
          <ReportTable
            empty="No individual ledger rows for selected dates."
            columns={[
              { key: 'type', label: 'Type' },
              { key: 'name', label: 'Name' },
              { key: 'credit', label: 'Credit', render: (r) => pkr(r.credit) },
              { key: 'debit', label: 'Debit', render: (r) => pkr(r.debit) },
              { key: 'balance', label: 'Balance', render: (r) => pkr(r.balance) },
              { key: 'detail', label: 'Detail' },
            ]}
            rows={[
              ...(report?.customerLedgers || []).map((r, i) => ({ id: `cust-${i}`, type: 'Customer', name: r.customer || r.property, credit: r.received, debit: 0, balance: r.remaining, detail: r.property })),
              ...(report?.employeeLedgers || []).map((r, i) => ({ id: `emp-${i}`, type: 'Employee', name: r.name, credit: 0, debit: r.cashDisbursed, balance: r.remaining, detail: `${r.payments} payment(s)` })),
              ...(report?.agentLedgers || []).map((r, i) => ({ id: `agent-${i}`, type: 'Agent', name: r.name, credit: r.earned, debit: r.paid, balance: r.remaining, detail: `${r.receiptsInRange} receipt(s)` })),
              ...(report?.investorLedgers || []).map((r, i) => ({ id: `inv-${i}`, type: 'Investor', name: r.name, credit: r.credit, debit: r.debit, balance: r.balance, detail: `${r.transactions} transaction(s)` })),
              ...(report?.constructionLedgers || []).map((r, i) => ({ id: `const-${i}`, type: 'Construction', name: r.constructor, credit: r.dealAmount, debit: r.paid, balance: r.remaining, detail: r.category })),
            ]}
          />
        ) : active === 'groups' ? (
          <ReportTable
            empty="No group ledger rows for selected dates."
            columns={[
              { key: 'group', label: 'Group' },
              { key: 'credit', label: 'Credit / Earned', render: (r) => pkr(r.credit) },
              { key: 'debit', label: 'Debit / Paid', render: (r) => pkr(r.debit) },
              { key: 'balance', label: 'Balance', render: (r) => pkr(r.balance) },
              { key: 'rows', label: 'Rows' },
            ]}
            rows={[
              { id: 'customers', group: 'Customers', credit: summary.totalReceived, debit: 0, balance: summary.receivable, rows: report?.customerLedgers?.length || 0 },
              ...(report?.employeeGroupLedgers || []).map((r, i) => ({ id: `eg-${i}`, group: r.group, credit: 0, debit: r.cashDisbursed, balance: r.remaining, rows: r.people })),
              ...(report?.agentGroupLedgers || []).map((r, i) => ({ id: `ag-${i}`, group: r.group, credit: r.earned, debit: r.paidInRange || r.paid, balance: r.remaining, rows: r.agents })),
              { id: 'investors', group: 'Investors', credit: summary.investorCredit, debit: summary.investorDebit, balance: summary.investorCredit - summary.investorDebit, rows: report?.investorLedgers?.length || 0 },
              { id: 'construction', group: 'Construction', credit: 0, debit: summary.constructionPaid, balance: 0, rows: report?.constructionLedgers?.length || 0 },
            ]}
          />
        ) : active === 'overall' ? (
          <ReportTable
            empty="No overall data for selected dates."
            columns={[
              { key: 'metric', label: 'Metric' },
              { key: 'value', label: 'Value' },
            ]}
            rows={[
              { metric: 'Total Received', value: pkr(summary.totalReceived) },
              { metric: 'Total Paid / Expenses', value: pkr(summary.totalPaid) },
              { metric: 'Cash Balance', value: pkr(summary.cashBalance) },
              { metric: 'Receivable', value: pkr(summary.receivable) },
              { metric: 'Payable', value: pkr(summary.payable) },
              { metric: 'Investor Credit', value: pkr(summary.investorCredit) },
              { metric: 'Investor Debit', value: pkr(summary.investorDebit) },
              { metric: 'Construction Paid', value: pkr(summary.constructionPaid) },
            ]}
          />
        ) : active === 'receipts' ? (
          <ReportTable
            empty="No receipts saved in selected dates."
            columns={[
              { key: 'receiptDate', label: 'Date' },
              { key: 'receiptNumber', label: 'Receipt #' },
              { key: 'receiptType', label: 'Type' },
              { key: 'entityName', label: 'Party' },
              { key: 'amount', label: 'Amount', render: (r) => pkr(r.amount) },
              { key: 'entityId', label: 'Source ID' },
            ]}
            rows={(report?.receiptArchive || []).map((row, index) => ({ ...row, id: row.receiptNumber || `receipt-${index}` }))}
          />
        ) : active === 'trial' ? (
          <ReportTable
            empty="No ledger rows for selected dates."
            columns={[
              { key: 'account', label: 'Account' },
              { key: 'debit', label: 'Debit Account' },
              { key: 'credit', label: 'Credit Account' },
              { key: 'amount', label: 'Amount', render: (r) => pkr(r.amount) },
              { key: 'rows', label: 'Rows' },
            ]}
            rows={trialRows}
          />
        ) : active === 'recovery' ? (
          <ReportTable
            empty="No pending recovery in selected range."
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'property', label: 'Property' },
              { key: 'customer', label: 'Customer' },
              { key: 'dealAmount', label: 'Deal', render: (r) => pkr(r.dealAmount) },
              { key: 'received', label: 'Received', render: (r) => pkr(r.received) },
              { key: 'remaining', label: 'Remaining', render: (r) => pkr(r.remaining) },
            ]}
            rows={recoveryRows}
          />
        ) : active === 'scheme' ? (
          <ReportTable
            empty="No plot/shop data yet."
            columns={[
              { key: 'label', label: 'Category' },
              { key: 'total', label: 'Total' },
              { key: 'sold', label: 'Sold' },
              { key: 'available', label: 'Available' },
            ]}
            rows={schemeRows}
          />
        ) : (
          <ReportTable
            empty="No installment details yet."
            columns={[
              { key: 'property', label: 'Property' },
              { key: 'customer', label: 'Customer' },
              { key: 'date', label: 'Due Date' },
              { key: 'amount', label: 'Amount', render: (r) => pkr(r.amount) },
              { key: 'status', label: 'Status' },
            ]}
            rows={installmentRows}
          />
        )}
      </div>

      <div className="acct-note">
        <BookIcon size={15} />
        <span>Cash Receipt Vouchers and Cash Payment Vouchers are handled in Daily Entries; reports here are generated from those approved cash rows.</span>
      </div>
      <ReportViewerModal
        isOpen={!!viewerModal}
        onClose={() => setViewerModal(null)}
        filePath={viewerModal?.filePath}
        reportData={viewerModal?.reportData}
        title={viewerModal?.title}
        showToast={showToast}
      />
    </div>
  );
}
