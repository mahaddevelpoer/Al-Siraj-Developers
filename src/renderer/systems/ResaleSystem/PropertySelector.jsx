import React, { useState, useEffect } from 'react';
import { SearchIcon, SoldIcon, ClockIcon } from '../../components/Icons';

const fmt = (n) => (parseFloat(n) || 0).toLocaleString();

export default function PropertySelector({ townName, onSelect, onCancel }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadProperties();
  }, [townName]);

  const loadProperties = async () => {
    setLoading(true);
    try {
      const data = await window.api.getSoldProperties();
      if (Array.isArray(data)) {
        const filtered = townName
          ? data.filter(p => p.Town_Name === townName)
          : data;
        setProperties(filtered);
      }
    } catch (e) {
      console.error('Failed to load sold properties:', e);
    }
    setLoading(false);
  };

  const filtered = properties.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(p.Property_Type || '').toLowerCase().includes(q) ||
      String(p.Number || '').toLowerCase().includes(q) ||
      String(p.Customer_Name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{
      background: 'var(--bg-card, #fff)',
      border: '1px solid var(--border-color, #e0e0e0)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-color, #e0e0e0)',
        background: '#f8fafc',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SoldIcon size={16} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Select Sold Property</span>
        </div>
        <button className="btn btn-ghost" onClick={onCancel} style={{ fontSize: 12 }}>
          Cancel
        </button>
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color, #e0e0e0)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-input, #f1f5f9)',
          borderRadius: 8, padding: '8px 12px',
        }}>
          <SearchIcon size={14} />
          <input
            placeholder="Search by type, number or customer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              flex: 1, fontSize: 13,
            }}
          />
        </div>
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <ClockIcon size={20} />
            <div style={{ marginTop: 8, fontSize: 13 }}>Loading properties...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <SoldIcon size={20} />
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {search ? 'No matching properties found.' : 'No sold properties in this town.'}
            </div>
          </div>
        ) : (
          filtered.map((p, i) => (
            <div
              key={i}
              onClick={() => onSelect(p)}
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--border-color, #e0e0e0)',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: p.Property_Type === 'Plot' ? '#dbeafe' : '#f3e8ff',
                  color: p.Property_Type === 'Plot' ? '#2563eb' : '#7c3aed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 11,
                }}>
                  {p.Property_Type === 'Plot' ? 'P' : 'S'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {p.Property_Type || 'Plot'} #{p.Number || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {p.Customer_Name || 'Unknown'} &middot; PKR {fmt(p.Total_Amount_PKR)}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>
                <div>{p.Sell_Date || ''}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
