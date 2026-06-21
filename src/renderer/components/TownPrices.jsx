import React, { useState, useEffect } from 'react';
import { useLang } from '../LanguageContext';
import { WalletIcon, NeighborhoodIcon, ClockIcon, SaveIcon, CheckIcon, ChartIcon, RulerIcon, EditIcon, PlotIcon } from './Icons';

const ROAD_TYPES = [
  { key: 'Road_30', label: '30 Foot Road', Icon: RulerIcon },
  { key: 'Road_40', label: '40 Foot Road', Icon: RulerIcon },
  { key: 'Road_50', label: '50 Foot Road', Icon: RulerIcon },
  { key: 'Road_60', label: '60 Foot Road', Icon: RulerIcon },
  { key: 'Road_80', label: '80 Foot Road', Icon: RulerIcon },
  { key: 'Custom_Price', label: 'Custom Road', Icon: EditIcon, hasName: true, nameKey: 'Custom_Name' },
  { key: 'Plot_Price', label: 'Plot Per Marla Price', Icon: PlotIcon, isPlot: true },
  { key: 'Residential_Plot_Price', label: 'Residential Plot Per Marla', Icon: PlotIcon, isPlot: true },
  { key: 'Commercial_Plot_Price', label: 'Commercial Plot Per Marla', Icon: PlotIcon, isPlot: true },
  { key: 'Residential_Shop_Price', label: 'Residential Shop Per Marla', Icon: WalletIcon },
  { key: 'Commercial_Shop_Price', label: 'Commercial Shop Per Marla', Icon: WalletIcon },
];

export default function TownPrices({ showToast, townName }) {
  const { t } = useLang();
  const [towns, setTowns] = useState([]);
  const [selectedTown, setSelectedTown] = useState(townName || '');
  const [prices, setPrices] = useState({
    Road_30: '', Road_40: '', Road_50: '', Road_60: '', Road_80: '',
    Custom_Name: '', Custom_Price: '', Plot_Price: '',
    Residential_Plot_Price: '', Commercial_Plot_Price: '',
    Residential_Shop_Price: '', Commercial_Shop_Price: '',
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (window.api && !townName) window.api.getTowns().then(d => { if (Array.isArray(d)) setTowns(d); });
  }, [townName]);

  useEffect(() => {
    if (!selectedTown) return;
    setPrices({ Road_30: '', Road_40: '', Road_50: '', Road_60: '', Road_80: '', Custom_Name: '', Custom_Price: '', Plot_Price: '', Residential_Plot_Price: '', Commercial_Plot_Price: '', Residential_Shop_Price: '', Commercial_Shop_Price: '' });
    setSaved(false);
    if (window.api) {
      window.api.getTownPrices(selectedTown).then(d => {
        if (d && !d.error) {
          setPrices({
            Road_30: d.Road_30 || '',
            Road_40: d.Road_40 || '',
            Road_50: d.Road_50 || '',
            Road_60: d.Road_60 || '',
            Road_80: d.Road_80 || '',
            Custom_Name: d.Custom_Name || '',
            Custom_Price: d.Custom_Price || '',
            Plot_Price: d.Plot_Price || '',
            Residential_Plot_Price: d.Residential_Plot_Price || d.Plot_Price || '',
            Commercial_Plot_Price: d.Commercial_Plot_Price || '',
            Residential_Shop_Price: d.Residential_Shop_Price || '',
            Commercial_Shop_Price: d.Commercial_Shop_Price || '',
          });
        }
      });
    }
  }, [selectedTown]);

  // Auto-load prices on mount if townName provided
  useEffect(() => {
    if (townName && !selectedTown) {
      setSelectedTown(townName);
    }
  }, [townName]);

  const handleSave = async () => {
    if (!selectedTown) { showToast(t.selectTown, 'error'); return; }
    setLoading(true);
    try {
      const result = await window.api.setTownPrices(selectedTown, prices);
      if (result?.error) showToast(result.error, 'error');
      else { showToast(`${selectedTown} - ${t.saved}`); setSaved(true); }
    } catch { showToast('Error', 'error'); }
    setLoading(false);
  };

  const u = (k) => (e) => { setPrices(p => ({ ...p, [k]: e.target.value })); setSaved(false); };

  return (
    <div>
      {/* Town Selector */}
      <div className="form-container mb-6" style={{ borderTop: '4px solid var(--accent-blue)' }}>
        <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display:'inline-flex', alignItems:'center' }}><WalletIcon size={20}/></span>
          {t.townPricesTitle}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, marginTop: -8 }}>
          {t.townPricesDesc}
        </p>

        {/* Town Dropdown — hidden when townName prop is provided */}
        {!townName && (
          <div className="form-group" style={{ marginBottom: 28, maxWidth: 340 }}>
            <label style={{ fontWeight: 700, fontSize: 13, display:'flex', alignItems:'center', gap:5 }}><NeighborhoodIcon size={13}/> {t.selectTown} *</label>
            <select value={selectedTown} onChange={e => setSelectedTown(e.target.value)} required>
              <option value="">-- {t.selectTown} --</option>
              {towns.map((t, i) => <option key={i} value={t.Town_Name}>{t.Town_Name}</option>)}
            </select>
          </div>
        )}

        {selectedTown && (
          <>
            {/* Price Boxes Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}>
              {ROAD_TYPES.map(rt => (
                <div key={rt.key} style={{
                  background: rt.isPlot
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))'
                    : 'linear-gradient(135deg, rgba(59,130,246,0.07), rgba(59,130,246,0.02))',
                  border: rt.isPlot
                    ? '1.5px solid rgba(16,185,129,0.25)'
                    : '1.5px solid rgba(59,130,246,0.2)',
                  borderRadius: 12,
                  padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ display:'inline-flex', alignItems:'center' }}><rt.Icon size={16}/></span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: rt.isPlot ? 'var(--accent-green)' : 'var(--accent-blue)' }}>
                      {rt.label}
                    </span>
                    {rt.isPlot && (
                      <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', padding: '2px 7px', borderRadius: 20, fontWeight: 700 }}>
                        PLOT
                      </span>
                    )}
                    {rt.hasName && (
                      <span style={{ fontSize: 10, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', padding: '2px 7px', borderRadius: 20, fontWeight: 700 }}>
                        CUSTOM
                      </span>
                    )}
                  </div>

                  {/* Custom road name input */}
                  {rt.hasName && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                        {t.customRoadName}
                      </label>
                      <input
                        placeholder="e.g. Main Boulevard"
                        value={prices.Custom_Name}
                        onChange={u('Custom_Name')}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      {t.perMarlaPrice} *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, pointerEvents: 'none',
                      }}>PKR</span>
                      <input
                        type="number"
                        placeholder="e.g. 50000"
                        value={prices[rt.key]}
                        onChange={u(rt.key)}
                        min="0"
                        style={{ paddingLeft: 44, fontSize: 15, fontWeight: 700 }}
                      />
                    </div>
                    {prices[rt.key] && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                        = {Number(prices[rt.key]).toLocaleString()} per marla
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleSave}
                disabled={loading}
                style={{ minWidth: 180 }}
              >
                {loading ? <><ClockIcon size={13}/> {t.saving}</> : <><SaveIcon size={13}/> {t.savePrices}</>}
              </button>
              {saved && (
                <span style={{ color: 'var(--accent-green)', fontWeight: 700, fontSize: 14, display:'flex', alignItems:'center', gap:4 }}>
                  <CheckIcon size={14}/> {t.saved}
                </span>
              )}
            </div>
          </>
        )}

        {!selectedTown && (
          <div className="empty-state" style={{ marginTop: 0, padding: '32px 20px' }}>
            <div className="icon"><WalletIcon size={36}/></div>
            <h3>{t.selectTown}</h3>
            <p>{t.townPricesDesc}</p>
          </div>
        )}
      </div>

      {/* Preview Table */}
      {selectedTown && (
        <div className="table-container">
          <div className="table-header">
            <h3 style={{display:'flex',alignItems:'center',gap:5}}><ChartIcon size={13}/> {selectedTown} — {t.currentPriceSetup}</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.category}</th>
                <th>{t.roadType}</th>
                <th>{t.perMarlaPrice}</th>
              </tr>
            </thead>
            <tbody>
              {ROAD_TYPES.map(rt => (
                <tr key={rt.key}>
                  <td>
                  <span style={{ display:'inline-flex', alignItems:'center' }}><rt.Icon size={14}/></span>{' '}
                    {rt.isPlot ? 'Plot' : 'Shop'}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {rt.hasName ? (prices.Custom_Name || 'Custom Road') : rt.label}
                  </td>
                  <td style={{ fontWeight: 700, color: prices[rt.key] ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
                    {prices[rt.key] ? `PKR ${Number(prices[rt.key]).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
