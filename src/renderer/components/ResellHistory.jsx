import React, { useState, useEffect } from 'react';
import { HistoryIcon } from './Icons';

export default function ResellHistory({ townName }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    if (!window.api) { setLoading(false); return; }
    try { const d = await window.api.getResellHistory(); if (Array.isArray(d)) setHistory(d); } catch(e) {}
    setLoading(false);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const filtered = townName ? history.filter(h => h.Town_Name === townName) : history;

  return (
    <div>
      <div className="table-container">
        <div className="table-header"><h3 style={{display:'flex',alignItems:'center',gap:5}}><HistoryIcon size={13}/> Resell History{townName ? ` — ${townName}` : ''} ({filtered.length})</h3></div>
        {filtered.length === 0 ? <div className="empty-state"><div className="icon"><HistoryIcon size={36}/></div><h3>No Resell History</h3><p>Properties that are resold will appear here.</p></div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Property</th><th>Type</th><th>Town</th><th>Original Customer</th><th>Original Amount</th><th>Resell Amount</th><th>Refund</th><th>P/L</th><th>Resell Date</th></tr></thead>
              <tbody>{filtered.map((h, i) => (
                <tr key={i}>
                  <td style={{fontWeight:600}}>{h.Plot_Shop_Number}</td><td>{h.Type}</td><td>{h.Town_Name}</td>
                  <td>{h.Original_Customer}</td>
                  <td>PKR {(parseFloat(h.Original_Amount)||0).toLocaleString()}</td>
                  <td>PKR {(parseFloat(h.Resell_Amount)||0).toLocaleString()}</td>
                  <td className="text-red">PKR {(parseFloat(h.Refund_Amount)||0).toLocaleString()}</td>
                  <td className={(parseFloat(h.Profit_Loss)||0) >= 0 ? 'text-green' : 'text-red'}>PKR {(parseFloat(h.Profit_Loss)||0).toLocaleString()}</td>
                  <td>{h.Resell_Date}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
