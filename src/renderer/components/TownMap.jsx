import React, { useCallback, useEffect, useMemo, useState } from 'react';

const money = (value) => `PKR ${(Number(value) || 0).toLocaleString()}`;

function propertyKey(type, number) {
  return `${String(type || '').toLowerCase()}::${String(number || '').trim().toLowerCase()}`;
}

function normalizeProperty(row, type) {
  const number = row?.Property_Number || row?.Plot_Number || row?.Shop_Number || row?.number || '';
  return {
    ...row,
    Property_Type: row?.Property_Type || type,
    Property_Number: number,
    Property_Category: row?.Property_Category || row?.Category || row?.property_category || 'Residential',
    Status: row?.Status || row?.status || 'Available',
  };
}

function saleKey(row) {
  return propertyKey(row?.Type || row?.Property_Type, row?.Plot_Shop_Number || row?.Property_Number);
}

function dateState(rows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lead = new Date(today);
  lead.setDate(lead.getDate() + 7);
  let overdue = false;
  let dueSoon = false;
  rows.forEach((row) => {
    const status = String(row?.Status || '').toLowerCase();
    if (status === 'paid') return;
    const due = new Date(row?.Due_Date || row?.due_date || '');
    if (Number.isNaN(due.getTime())) return;
    due.setHours(0, 0, 0, 0);
    if (due < today) overdue = true;
    else if (due <= lead) dueSoon = true;
  });
  return { overdue, dueSoon };
}

function toPercent(received, total, installmentRows) {
  const paid = Number(received) || 0;
  const amount = Number(total) || 0;
  if (amount > 0) return Math.max(0, Math.min(100, (paid / amount) * 100));
  const rows = installmentRows || [];
  if (rows.length) {
    const paidCount = rows.filter((r) => String(r?.Status || '').toLowerCase() === 'paid').length;
    return Math.round((paidCount / rows.length) * 100);
  }
  return 0;
}

export default function TownMap({ townName, showToast, variant = 'full', onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState([]);
  const [sales, setSales] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [resellHistory, setResellHistory] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!townName) return;
    setLoading(true);
    try {
      const [plots, shops, allSales, allInstallments, allResell, archive] = await Promise.all([
        window.api.getAllPlots?.(townName),
        window.api.getAllShops?.(townName),
        window.api.getAllSales?.(),
        window.api.getInstallments?.(),
        window.api.getResellHistory?.(),
        window.api.getReceiptArchive?.({ townName }),
      ]);
      const rows = [
        ...(Array.isArray(plots) ? plots.map((p) => normalizeProperty(p, 'Plot')) : []),
        ...(Array.isArray(shops) ? shops.map((s) => normalizeProperty(s, 'Shop')) : []),
      ];
      setProperties(rows);
      setSales((Array.isArray(allSales) ? allSales : []).filter((s) => String(s.Town_Name || '') === String(townName)));
      setInstallments((Array.isArray(allInstallments) ? allInstallments : []).filter((i) => String(i.Town_Name || '') === String(townName)));
      setResellHistory((Array.isArray(allResell) ? allResell : []).filter((r) => String(r.Town_Name || '') === String(townName)));
      setReceipts(Array.isArray(archive) ? archive : []);
    } catch (error) {
      showToast?.(`Property board load failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, townName]);

  useEffect(() => { load(); }, [load]);

  const enriched = useMemo(() => {
    const saleMap = new Map();
    sales.forEach((sale) => saleMap.set(saleKey(sale), sale));
    return properties.map((property) => {
      const key = propertyKey(property.Property_Type, property.Property_Number);
      const sale = saleMap.get(key);
      const rows = installments.filter((row) => propertyKey(row.Type, row.Plot_Shop_Number) === key);
      const history = resellHistory.filter((row) => propertyKey(row.Type, row.Plot_Shop_Number) === key);
      const total = Number(sale?.Total_Amount_PKR || property.Total_Amount_PKR || property.Total_Price) || 0;
      const received = Number(sale?.Received_Amount || property.Received_Amount || sale?.Advance_Amount_PKR || property.Advance_Amount_PKR) || 0;
      const remaining = Number(sale?.Remaining_Amount || property.Remaining_Amount || Math.max(0, total - received)) || 0;
      const installmentSold = rows.length > 0 || Number(sale?.Total_Installments || property.Total_Installments) > 0;
      const statusRaw = String(sale?.Status || property.Status || '').toLowerCase();
      const sold = statusRaw.includes('sold') || !!sale;
      const progress = sold ? (remaining <= 0 ? 100 : toPercent(received, total, rows)) : 0;
      return {
        key,
        property,
        sale,
        rows,
        history,
        total,
        received,
        remaining,
        installmentSold,
        progress,
        sold,
        ...dateState(rows),
      };
    });
  }, [installments, properties, resellHistory, sales]);

  const selected = enriched.find((item) => item.key === selectedKey) || enriched[0] || null;
  const visibleItems = filter === 'all' ? enriched : enriched.filter((item) => {
    if (filter === 'available') return !item.sold;
    if (filter === 'sold') return item.sold;
    if (filter === 'due') return item.dueSoon || item.overdue;
    return true;
  });
  const tileSize = visibleItems.length > 300 ? 46 : visibleItems.length > 180 ? 54 : visibleItems.length > 90 ? 66 : visibleItems.length > 40 ? 76 : 88;

  const groups = {
    Commercial: visibleItems.filter((item) => String(item.property.Property_Category || '').toLowerCase().includes('commercial')),
    Residential: visibleItems.filter((item) => !String(item.property.Property_Category || '').toLowerCase().includes('commercial')),
  };

  const counts = {
    total: enriched.length,
    available: enriched.filter((i) => !i.sold).length,
    sold: enriched.filter((i) => i.sold).length,
    due: enriched.filter((i) => i.dueSoon || i.overdue).length,
  };

  if (loading) {
    return (
      <div className="property-board-shell">
        <div className="property-board-loading">Loading property board...</div>
      </div>
    );
  }

  return (
    <div className={`property-board-layout ${variant === 'hero' ? 'property-board-layout--hero' : ''}`}>
      <div className="property-board-main">
        <div className="property-board-toolbar">
          <div>
            <div className="property-board-kicker">Automatic property board</div>
            <h3>{townName || 'Town'} Overview</h3>
          </div>
          <div className="property-board-filters">
            {[
              ['all', `All ${counts.total}`],
              ['available', `Available ${counts.available}`],
              ['sold', `Sold ${counts.sold}`],
              ['due', `Due ${counts.due}`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="property-board-canvas" style={{ '--property-tile-size': `${tileSize}px` }}>
          {Object.entries(groups).map(([group, items]) => (
            <section key={group} className="property-board-section">
              <div className="property-board-section-title">
                <span>{group}</span>
                <b>{items.length}</b>
              </div>
              {items.length ? (
                <div className="property-board-grid">
                  {items.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`property-tile ${selected?.key === item.key ? 'selected' : ''} ${item.sold ? 'sold' : 'available'} ${item.overdue ? 'overdue' : ''}`}
                      onClick={() => setSelectedKey(item.key)}
                      style={{ '--paid': `${Math.round(item.progress)}%` }}
                    >
                      <span className="property-tile-fill" />
                      {(item.dueSoon || item.overdue) && <span className="property-tile-badge">{item.overdue ? '!' : '7d'}</span>}
                      <span className="property-tile-type">{item.property.Property_Type}</span>
                      <strong>{item.property.Property_Number}</strong>
                      <small>{item.sold ? `${Math.round(item.progress)}% paid` : 'Available'}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="property-board-empty">No {group.toLowerCase()} properties yet.</div>
              )}
            </section>
          ))}
        </div>
      </div>

      <aside className="property-detail-panel">
        {selected ? (
          <>
            <div className="property-detail-head">
              <div>
                <span>{selected.property.Property_Type}</span>
                <h3>{selected.property.Property_Number}</h3>
              </div>
              <b className={selected.sold ? 'sold' : 'available'}>{selected.sold ? 'Sold' : 'Available'}</b>
            </div>
            <div className="property-detail-list">
              <div><span>Category</span><b>{selected.property.Property_Category || 'Residential'}</b></div>
              <div><span>Size</span><b>{selected.property.Property_Size || selected.property.Plot_Size || selected.property.Shop_Size || '-'}</b></div>
              <div><span>Owner</span><b>{selected.property.Owner_Name || '-'}</b></div>
              <div><span>Buyer</span><b>{selected.sale?.Customer_Name || selected.property.Customer_Name || '-'}</b></div>
              <div><span>Phone</span><b>{selected.sale?.Phone_Number || selected.property.Phone_Number || '-'}</b></div>
              <div><span>Total</span><b>{money(selected.total)}</b></div>
              <div><span>Received</span><b>{money(selected.received)}</b></div>
              <div><span>Remaining</span><b>{money(selected.remaining)}</b></div>
              <div><span>Resell count</span><b>{selected.history.length}</b></div>
            </div>
            <div className="property-detail-progress">
              <span style={{ width: `${Math.round(selected.progress)}%` }} />
            </div>
            <div className="property-detail-subhead">Installments</div>
            <div className="property-detail-mini-list">
              {selected.rows.slice(0, 6).map((row) => (
                <div key={row.Tracker_ID || `${row.Month_Number}-${row.Due_Date}`}>
                  <span>{row.Month_Number || '-'} / {row.Total_Months || '-'}</span>
                  <b>{row.Due_Date || '-'} - {row.Status || 'Pending'}</b>
                </div>
              ))}
              {!selected.rows.length && <p>No installment plan for this property.</p>}
            </div>
            <div className="property-detail-subhead">Receipts</div>
            <div className="property-detail-mini-list">
              {receipts.filter((r) => String(r.Entity_ID || r.Receipt_Number || '').includes(selected.property.Property_Number)).slice(0, 4).map((row) => (
                <div key={row.Receipt_ID || row.Receipt_Number}>
                  <span>{row.Receipt_Type || 'Receipt'}</span>
                  <b>{row.Receipt_Number}</b>
                </div>
              ))}
              <p>Use Media tab for full receipt and report archive.</p>
            </div>
            <div className="property-detail-actions">
              <button type="button" onClick={() => onNavigate?.('media', selected)}>Open Media</button>
              <button type="button" onClick={() => onNavigate?.('installments', selected)}>Installments</button>
              <button type="button" onClick={() => onNavigate?.('accounts', selected)}>Accounts</button>
            </div>
          </>
        ) : (
          <div className="property-board-empty">Add plots or shops to build this board automatically.</div>
        )}
      </aside>
    </div>
  );
}
