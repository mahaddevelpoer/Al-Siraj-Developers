import React, { useState, useEffect } from 'react';
import { useLang } from '../LanguageContext';
import { WalletIcon, NeighborhoodIcon, ClockIcon, SaveIcon, CheckIcon, ChartIcon, RulerIcon, EditIcon, PlotIcon } from './Icons';

const ROAD_TYPES = [
  { key: 'Road_30', label: '30 Foot Road', Icon: RulerIcon },
  { key: 'Road_40', label: '40 Foot Road', Icon: RulerIcon },
  { key: 'Road_50', label: '50 Foot Road', Icon: RulerIcon },
  { key: 'Road_60', label: '60 Foot Road', Icon: RulerIcon },
  { key: 'Road_80', label: '80 Foot Road', Icon: RulerIcon },
  { key: 'Custom', label: 'Custom Road', Icon: EditIcon, hasName: true },
];

export default function TownPrices({ showToast, townName }) {
  const { t } = useLang();
  const [towns, setTowns] = useState([]);
  const [selectedTown, setSelectedTown] = useState(townName || '');
  const [prices, setPrices] = useState({
    Road_30_Residential: '', Road_30_Commercial: '',
    Road_40_Residential: '', Road_40_Commercial: '',
    Road_50_Residential: '', Road_50_Commercial: '',
    Road_60_Residential: '', Road_60_Commercial: '',
    Road_80_Residential: '', Road_80_Commercial: '',
    Custom_Name: '',
    Custom_Residential: '', Custom_Commercial: '',
    Residential_Plot_Price: '', Commercial_Plot_Price: '',
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (window.api && !townName) {
      window.api.getTowns().then(d => { if (Array.isArray(d)) setTowns(d); });
    }
  }, [townName]);

  useEffect(() => {
    if (!selectedTown) return;
    setPrices({
      Road_30_Residential: '', Road_30_Commercial: '',
      Road_40_Residential: '', Road_40_Commercial: '',
      Road_50_Residential: '', Road_50_Commercial: '',
      Road_60_Residential: '', Road_60_Commercial: '',
      Road_80_Residential: '', Road_80_Commercial: '',
      Custom_Name: '',
      Custom_Residential: '', Custom_Commercial: '',
      Residential_Plot_Price: '', Commercial_Plot_Price: '',
    });
    setSaved(false);
    if (window.api) {
      window.api.getTownPrices(selectedTown).then(d => {
        if (d && !d.error) {
          setPrices({
            Road_30_Residential: d.Road_30_Residential || d.Road_30 || '',
            Road_30_Commercial: d.Road_30_Commercial || d.Road_30 || '',
            Road_40_Residential: d.Road_40_Residential || d.Road_40 || '',
            Road_40_Commercial: d.Road_40_Commercial || d.Road_40 || '',
            Road_50_Residential: d.Road_50_Residential || d.Road_50 || '',
            Road_50_Commercial: d.Road_50_Commercial || d.Road_50 || '',
            Road_60_Residential: d.Road_60_Residential || d.Road_60 || '',
            Road_60_Commercial: d.Road_60_Commercial || d.Road_60 || '',
            Road_80_Residential: d.Road_80_Residential || d.Road_80 || '',
            Road_80_Commercial: d.Road_80_Commercial || d.Road_80 || '',
            Custom_Name: d.Custom_Name || '',
            Custom_Residential: d.Custom_Residential || d.Custom_Price || '',
            Custom_Commercial: d.Custom_Commercial || d.Custom_Price || '',
            Residential_Plot_Price: d.Residential_Plot_Price || d.Plot_Price || '',
            Commercial_Plot_Price: d.Commercial_Plot_Price || d.Plot_Price || '',
          });
        }
      });
    }
  }, [selectedTown]);

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
      else { showToast(`${selectedTown} - Prices saved successfully!`); setSaved(true); }
    } catch { showToast('Error', 'error'); }
    setLoading(false);
  };

  const u = (k) => (e) => {
    setPrices(p => ({ ...p, [k]: e.target.value }));
    setSaved(false);
  };

  return (
    <div>
      <div className="form-container mb-6" style={{ borderTop: '4px solid var(--accent-blue)' }}>
        <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display:'inline-flex', alignItems:'center' }}><WalletIcon size={20}/></span>
          Town Pricing Configuration
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, marginTop: -8 }}>
          Configure residential and commercial per-marla prices for plots and road type shop locations.
        </p>

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
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
              marginBottom: 24,
              width: '100%',
              boxSizing: 'border-box',
            }}>
              {/* Plot Card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))',
                border: '1.5px solid rgba(16,185,129,0.25)',
                borderRadius: 12,
                padding: '16px 18px',
                minWidth: 0,
                boxSizing: 'border-box',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', color: 'var(--accent-green)' }}><PlotIcon size={16}/></span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-green)' }}>
                    Standard Plots
                  </span>
                  <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', padding: '2px 7px', borderRadius: 20, fontWeight: 700 }}>
                    PLOT
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, width: '100%' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Residential Plot Price *
                    </label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, zIndex: 1 }}>PKR</span>
                      <input
                        type="number"
                        placeholder="Residential"
                        value={prices.Residential_Plot_Price}
                        onChange={u('Residential_Plot_Price')}
                        min="0"
                        style={{ paddingLeft: 34, fontSize: 13, fontWeight: 700, width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Commercial Plot Price *
                    </label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, zIndex: 1 }}>PKR</span>
                      <input
                        type="number"
                        placeholder="Commercial"
                        value={prices.Commercial_Plot_Price}
                        onChange={u('Commercial_Plot_Price')}
                        min="0"
                        style={{ paddingLeft: 34, fontSize: 13, fontWeight: 700, width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Road Cards */}
              {ROAD_TYPES.map(rt => (
                <div key={rt.key} style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.07), rgba(59,130,246,0.02))',
                  border: '1.5px solid rgba(59,130,246,0.2)',
                  borderRadius: 12,
                  padding: '16px 18px',
                  minWidth: 0,
                  boxSizing: 'border-box',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', color: 'var(--accent-blue)' }}><rt.Icon size={16}/></span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-blue)' }}>
                      {rt.label}
                    </span>
                    <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', padding: '2px 7px', borderRadius: 20, fontWeight: 700 }}>
                      SHOP ROAD
                    </span>
                  </div>

                  {rt.hasName && (
                    <div style={{ marginBottom: 12, width: '100%' }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                        {t.customRoadName}
                      </label>
                      <input
                        placeholder="e.g. Main Boulevard"
                        value={prices.Custom_Name}
                        onChange={u('Custom_Name')}
                        style={{ fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, width: '100%' }}>
                    <div style={{ minWidth: 0 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Residential Price *
                      </label>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, zIndex: 1 }}>PKR</span>
                        <input
                          type="number"
                          placeholder="Residential"
                          value={prices[`${rt.key}_Residential`]}
                          onChange={u(`${rt.key}_Residential`)}
                          min="0"
                          style={{ paddingLeft: 34, fontSize: 13, fontWeight: 700, width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Commercial Price *
                      </label>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, zIndex: 1 }}>PKR</span>
                        <input
                          type="number"
                          placeholder="Commercial"
                          value={prices[`${rt.key}_Commercial`]}
                          onChange={u(`${rt.key}_Commercial`)}
                          min="0"
                          style={{ paddingLeft: 34, fontSize: 13, fontWeight: 700, width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

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
            <p>Configure pricing models for your properties and town regions.</p>
          </div>
        )}
      </div>
    </div>
  );
}
