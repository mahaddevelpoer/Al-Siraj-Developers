import React, { useState, useEffect } from 'react';
import { useLang } from '../LanguageContext';
import { PlotIcon, ShopIcon, RulerIcon, WarnIcon, EditIcon, WalletIcon, ClockIcon, PlusIcon, SoldIcon } from './Icons';

const ROAD_OPTIONS = [
  { key: 'Road_30', label: '30 Foot Road' },
  { key: 'Road_40', label: '40 Foot Road' },
  { key: 'Road_50', label: '50 Foot Road' },
  { key: 'Road_60', label: '60 Foot Road' },
  { key: 'Road_80', label: '80 Foot Road' },
  { key: 'Custom_Price', label: 'Custom Road', isCustom: true },
];

const MARLA_PRESETS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// Marla custom sub-units helper  (1 Marla = 20 Sarsai = 272.25 sqft)
// We just let CEO type decimal values when custom is selected

export default function AddProperty({ showToast, townName, type: typeProp }) {
  const { t } = useLang();
  const [type, setType] = useState(typeProp || 'Plot');
  const [towns, setTowns] = useState([]);
  const [selectedTown, setSelectedTown] = useState(townName || '');
  const [form, setForm] = useState({ number: '', ownerName: '', lengthFt: '', widthFt: '' });
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);

  // Shop-specific
  const [selectedRoad, setSelectedRoad] = useState('');
  const [marlaMode, setMarlaMode] = useState('preset'); // 'preset' | 'custom'
  const [marlaPreset, setMarlaPreset] = useState('');
  const [marlaCustom, setMarlaCustom] = useState('');
  const [townPrices, setTownPrices] = useState(null);
  const [customRoadName, setCustomRoadName] = useState('');
  const [propertyCategory, setPropertyCategory] = useState('Residential');

  // Plot-specific
  const [plotMarlaMode, setPlotMarlaMode] = useState('preset');
  const [plotMarlaPreset, setPlotMarlaPreset] = useState('');
  const [plotMarlaCustom, setPlotMarlaCustom] = useState('');

  useEffect(() => { if (!townName) loadTowns(); }, [townName]);
  useEffect(() => { if (townName) setSelectedTown(townName); if (typeProp) setType(typeProp); }, [townName, typeProp]);
  useEffect(() => {
    if (selectedTown) { loadProperties(); loadTownPrices(); }
    // Reset shop fields on town change
    setSelectedRoad(''); setMarlaMode('preset'); setMarlaPreset(''); setMarlaCustom('');
    setPlotMarlaMode('preset'); setPlotMarlaPreset(''); setPlotMarlaCustom('');
  }, [selectedTown, type]);

  const loadTowns = async () => {
    if (!window.api) return;
    const d = await window.api.getTowns();
    if (Array.isArray(d)) setTowns(d);
  };

  const loadProperties = async () => {
    if (!window.api || !selectedTown) return;
    const d = type === 'Plot'
      ? await window.api.getAllPlots(selectedTown)
      : await window.api.getAllShops(selectedTown);
    if (Array.isArray(d)) setProperties(d);
  };

  const loadTownPrices = async () => {
    if (!window.api || !selectedTown) return;
    const d = await window.api.getTownPrices(selectedTown);
    if (d && !d.error) {
      setTownPrices(d);
      setCustomRoadName(d.Custom_Name || 'Custom Road');
    } else {
      setTownPrices(null);
    }
  };

  // Computed values
  const marlaValue = marlaMode === 'preset' ? parseFloat(marlaPreset) : parseFloat(marlaCustom);
  const plotMarlaValue = plotMarlaMode === 'preset' ? parseFloat(plotMarlaPreset) : parseFloat(plotMarlaCustom);

  const dimensionArea = (() => {
    const length = parseFloat(form.lengthFt) || 0;
    const width = parseFloat(form.widthFt) || 0;
    return length > 0 && width > 0 ? length * width : 0;
  })();
  const dimensionMarla = dimensionArea > 0 ? +(dimensionArea / 272.25).toFixed(3) : 0;

  const priceKey = type === 'Plot'
    ? (propertyCategory === 'Commercial' ? 'Commercial_Plot_Price' : 'Residential_Plot_Price')
    : (propertyCategory === 'Commercial' ? 'Commercial_Shop_Price' : 'Residential_Shop_Price');

  const perMarlaPrice = (() => {
    if (!townPrices || !selectedRoad) return 0;
    return parseFloat(townPrices[priceKey]) || parseFloat(townPrices[selectedRoad]) || 0;
  })();

  const effectiveShopMarla = dimensionMarla || marlaValue;
  const effectivePlotMarla = dimensionMarla || plotMarlaValue;
  const totalShopPrice = (effectiveShopMarla > 0 && perMarlaPrice > 0) ? effectiveShopMarla * perMarlaPrice : 0;
  const totalPlotPrice = (() => {
    if (!townPrices) return 0;
    const pm = parseFloat(townPrices[priceKey]) || parseFloat(townPrices.Plot_Price) || 0;
    return (effectivePlotMarla > 0 && pm > 0) ? effectivePlotMarla * pm : 0;
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTown) { showToast('Town select karein', 'error'); return; }
    if (!form.number.trim()) { showToast(`${type} number required hai`, 'error'); return; }
    if (!dimensionArea) { showToast('Length aur width required hain', 'error'); return; }

    if (type === 'Shop') {
      if (!selectedRoad) { showToast('Road type select karein', 'error'); return; }
      const mv = marlaMode === 'preset' ? parseFloat(marlaPreset) : parseFloat(marlaCustom);
      if ((!mv || mv <= 0) && !dimensionMarla) { showToast('Size (marla) enter karein', 'error'); return; }
    }

    setLoading(true);
    try {
      let data, result;
      if (type === 'Plot') {
        const pm = plotMarlaMode === 'preset' ? plotMarlaPreset : plotMarlaCustom;
        data = {
          Plot_Number: form.number,
          Town_Name: selectedTown,
          Plot_Size: effectivePlotMarla ? `${effectivePlotMarla} Marla` : (pm ? `${pm} Marla` : ''),
          Plot_Marla: effectivePlotMarla || parseFloat(pm) || 0,
          Length_Ft: parseFloat(form.lengthFt) || '',
          Width_Ft: parseFloat(form.widthFt) || '',
          Area_Sqft: dimensionArea || '',
          Per_Marla_Price: parseFloat(townPrices?.[priceKey]) || parseFloat(townPrices?.Plot_Price) || 0,
          Total_Price: totalPlotPrice || 0,
          Owner_Name: form.ownerName,
          Property_Category: propertyCategory,
        };
        result = await window.api.addPlot(data);
      } else {
        const mv = effectiveShopMarla || (marlaMode === 'preset' ? marlaPreset : marlaCustom);
        const roadLabel = selectedRoad === 'Custom_Price'
          ? (customRoadName || 'Custom Road')
          : ROAD_OPTIONS.find(r => r.key === selectedRoad)?.label || selectedRoad;
        data = {
          Shop_Number: form.number,
          Town_Name: selectedTown,
          Shop_Size: `${mv} Marla`,
          Shop_Marla: parseFloat(mv) || 0,
          Length_Ft: parseFloat(form.lengthFt) || '',
          Width_Ft: parseFloat(form.widthFt) || '',
          Area_Sqft: dimensionArea || '',
          Road_Type: roadLabel,
          Road_Key: selectedRoad,
          Per_Marla_Price: perMarlaPrice,
          Total_Price: totalShopPrice,
          Owner_Name: form.ownerName,
          Property_Category: propertyCategory,
        };
        result = await window.api.addShop(data);
      }

      if (result?.error) showToast(result.error, 'error');
      else {
        showToast(`${type} "${form.number}" ${selectedTown} mein add ho gaya!`);
        setForm({ number: '', ownerName: '', lengthFt: '', widthFt: '' });
        setSelectedRoad(''); setMarlaMode('preset'); setMarlaPreset(''); setMarlaCustom('');
        setPlotMarlaMode('preset'); setPlotMarlaPreset(''); setPlotMarlaCustom('');
        loadProperties();
      }
    } catch { showToast('Property add karne mein error aya', 'error'); }
    setLoading(false);
  };

  return (
    <div>
      <div className="form-container mb-6">
        <div className="form-title" style={{display:'flex',alignItems:'center',gap:6}}>
          {type === 'Plot' ? <PlotIcon size={14}/> : <ShopIcon size={14}/>} Add {type}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {/* Town — hidden when townName prop provided */}
            {!townName && (
              <div className="form-group">
                <label>{t.selectTown} *</label>
                <select value={selectedTown} onChange={e => setSelectedTown(e.target.value)} required>
                  <option value="">-- {t.selectTown} --</option>
                  {towns.map((t, i) => <option key={i} value={t.Town_Name}>{t.Town_Name}</option>)}
                </select>
              </div>
            )}
            {/* Type — hidden when typeProp provided */}
            {!typeProp && (
              <div className="form-group">
                <label>{t.propertyType}</label>
                <select value={type} onChange={e => setType(e.target.value)}>
                  <option value="Plot">Plot</option>
                  <option value="Shop">Shop</option>
                </select>
              </div>
            )}
            {/* Number */}
            <div className="form-group">
              <label>{type} {t.propertyNo} *</label>
              <input
                placeholder={type === 'Plot' ? 'e.g. 101' : 'e.g. 12'}
                value={form.number}
                onChange={e => setForm({ ...form, number: e.target.value })}
                required
              />
            </div>
            {/* Owner */}
            <div className="form-group">
              <label>{t.ownerNameOpt}</label>
              <input
                placeholder=""
                value={form.ownerName}
                onChange={e => setForm({ ...form, ownerName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Length (ft) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.lengthFt}
                onChange={e => setForm({ ...form, lengthFt: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Width (ft) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.widthFt}
                onChange={e => setForm({ ...form, widthFt: e.target.value })}
                required
              />
            </div>
          </div>

          {dimensionArea > 0 && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', fontSize: 13, fontWeight: 700 }}>
              Measurement: {form.lengthFt}ft x {form.widthFt}ft = {dimensionArea.toLocaleString()} sqft ({dimensionMarla} marla)
            </div>
          )}

          {/* ── Property Category: Residential / Commercial ── */}
          <div style={{ marginTop: 20, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 10, display:'flex', alignItems:'center', gap:6 }}>
              Property Category
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {['Residential', 'Commercial'].map(cat => (
                <label
                  key={cat}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 20px', borderRadius: 10, cursor: 'pointer',
                    border: propertyCategory === cat ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)',
                    background: propertyCategory === cat ? 'rgba(0,102,204,0.08)' : 'transparent',
                    fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="radio"
                    name="propertyCategory"
                    value={cat}
                    checked={propertyCategory === cat}
                    onChange={() => setPropertyCategory(cat)}
                    style={{ accentColor: 'var(--accent-blue)', width: 15, height: 15 }}
                  />
                  {cat === 'Residential' ? '🏠' : '🏢'} {cat}
                </label>
              ))}
            </div>
          </div>

          {/* ── SHOP SPECIFIC: Road Type + Marla ── */}
          {type === 'Shop' && selectedTown && (
            <div style={{ marginTop: 24 }}>
              <div style={{
                fontWeight: 700, fontSize: 13, color: 'var(--accent-blue)',
                marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{display:'inline-flex',alignItems:'center'}}><RulerIcon size={12}/></span> {t.shopRoadTypeSelect}
                {!townPrices && (
                  <span style={{ fontSize: 11, color: 'var(--accent-orange)', fontWeight: 600, display:'flex', alignItems:'center', gap:3 }}>
                      <WarnIcon size={11}/> {t.noPricesSetWarning}
                    </span>
                )}
              </div>

              {/* 6 Road Checkboxes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 20 }}>
                {ROAD_OPTIONS.map(road => {
                  const pm = townPrices ? (parseFloat(townPrices[road.key]) || 0) : 0;
                  const label = road.isCustom ? (customRoadName || 'Custom Road') : road.label;
                  const isSelected = selectedRoad === road.key;
                  return (
                    <label
                      key={road.key}
                      htmlFor={`road_${road.key}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 16px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        border: isSelected
                          ? '2px solid var(--accent-blue)'
                          : '1.5px solid var(--border-color)',
                        background: isSelected
                          ? 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))'
                          : 'var(--bg-card)',
                        transition: 'all 0.15s ease',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="radio"
                        id={`road_${road.key}`}
                        name="roadType"
                        value={road.key}
                        checked={isSelected}
                        onChange={() => setSelectedRoad(road.key)}
                        style={{ accentColor: 'var(--accent-blue)', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
                        <div style={{ fontSize: 11, color: pm > 0 ? 'var(--accent-blue)' : 'var(--text-muted)', marginTop: 2 }}>
                          {pm > 0 ? `PKR ${pm.toLocaleString()} / marla` : 'Price set nahi'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Marla Selector for Shop */}
              {selectedRoad && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, display:'flex', alignItems:'center', gap:5 }}>
                    <RulerIcon size={12}/> {t.shopSizeMarla}
                  </div>

                  {/* Custom toggle at top */}
                  <div style={{ marginBottom: 10 }}>
                    <label
                      htmlFor="marla_custom_toggle"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                        border: marlaMode === 'custom' ? '2px solid #8b5cf6' : '1.5px solid var(--border-color)',
                        background: marlaMode === 'custom' ? 'rgba(139,92,246,0.1)' : 'transparent',
                        fontWeight: 700, fontSize: 13, marginBottom: 10,
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="radio"
                        id="marla_custom_toggle"
                        name="marlaMode"
                        checked={marlaMode === 'custom'}
                        onChange={() => setMarlaMode('custom')}
                        style={{ accentColor: '#8b5cf6', width: 15, height: 15 }}
                      />
                      <EditIcon size={12}/> {t.customSize}
                    </label>
                  </div>

                  {marlaMode === 'custom' && (
                    <div style={{ marginBottom: 14, maxWidth: 300 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {t.size}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="e.g. 1.5 ya 2.25"
                        value={marlaCustom}
                        onChange={e => setMarlaCustom(e.target.value)}
                        style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}
                        autoFocus
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        1 Marla = 20 Sarsai | 1 Sarsai = ~13.6 sqft
                      </div>
                    </div>
                  )}

                  {/* Preset 1–10 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {MARLA_PRESETS.map(m => (
                      <label
                        key={m}
                        htmlFor={`marla_${m}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                          border: (marlaMode === 'preset' && marlaPreset === m)
                            ? '2px solid var(--accent-green)'
                            : '1.5px solid var(--border-color)',
                          background: (marlaMode === 'preset' && marlaPreset === m)
                            ? 'rgba(16,185,129,0.1)' : 'transparent',
                          fontWeight: 700, fontSize: 14,
                          transition: 'all 0.12s',
                        }}
                      >
                        <input
                          type="radio"
                          id={`marla_${m}`}
                          name="marlaMode"
                          checked={marlaMode === 'preset' && marlaPreset === m}
                          onChange={() => { setMarlaMode('preset'); setMarlaPreset(m); }}
                          style={{ display: 'none' }}
                        />
                        {m}M
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Price Summary Box ── */}
              {selectedRoad && (marlaMode === 'custom' ? parseFloat(marlaCustom) > 0 : parseFloat(marlaPreset) > 0) && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(16,185,129,0.06))',
                  border: '2px solid rgba(59,130,246,0.3)',
                  borderRadius: 14, padding: '18px 22px', marginBottom: 8,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, display:'flex', alignItems:'center', gap:5 }}>
                    <WalletIcon size={12}/> {t.priceBreakdown}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t.roadType}</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {selectedRoad === 'Custom_Price' ? (customRoadName || 'Custom') : ROAD_OPTIONS.find(r => r.key === selectedRoad)?.label}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t.size}</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {marlaValue > 0 ? `${marlaValue} Marla` : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t.perMarlaPrice}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-blue)' }}>
                        {perMarlaPrice > 0 ? `PKR ${perMarlaPrice.toLocaleString()}` : '—'}
                      </div>
                    </div>
                  </div>
                  {totalShopPrice > 0 && (
                    <div style={{
                      marginTop: 14, paddingTop: 14,
                      borderTop: '1px solid rgba(59,130,246,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>Total Price ({marlaValue}M × PKR {perMarlaPrice.toLocaleString()})</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-green)' }}>
                        PKR {totalShopPrice.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {perMarlaPrice === 0 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-orange)', fontWeight: 600, display:'flex', alignItems:'center', gap:4 }}>
                      <WarnIcon size={11}/> {t.noPricesSetWarning}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PLOT SPECIFIC: Per Marla Price Display + Marla Size ── */}
          {type === 'Plot' && selectedTown && (
            <div style={{ marginTop: 24 }}>
              {/* Plot per marla price info */}
              {townPrices?.Plot_Price && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.09), rgba(16,185,129,0.03))',
                  border: '1.5px solid rgba(16,185,129,0.25)',
                  borderRadius: 12, padding: '14px 18px', marginBottom: 20,
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <span style={{ display:'flex', alignItems:'center', color:'var(--accent-green)' }}><PlotIcon size={24}/></span>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {selectedTown} — {t.plotMarlaPrice}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--accent-green)' }}>
                      PKR {Number(townPrices.Plot_Price).toLocaleString()} / marla
                    </div>
                  </div>
                </div>
              )}
              {!townPrices?.Plot_Price && (
                <div style={{ background: 'rgba(245,158,11,0.07)', border: '1.5px solid rgba(245,158,11,0.25)',
                  borderRadius: 12, padding: '12px 16px', marginBottom: 20,
                  fontSize: 13, color: 'var(--accent-orange)', fontWeight: 600,
                  display:'flex', alignItems:'center', gap:5 }}>
                  <WarnIcon size={13}/> {t.noPricesSetWarning}
                </div>
              )}

              {/* Plot Marla Size Selector */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display:'flex', alignItems:'center', gap:5 }}>
                <RulerIcon size={12}/> {t.plotSizeMarla}
              </div>

              {/* Custom toggle */}
              <div style={{ marginBottom: 10 }}>
                <label
                  htmlFor="plot_marla_custom"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    border: plotMarlaMode === 'custom' ? '2px solid #8b5cf6' : '1.5px solid var(--border-color)',
                    background: plotMarlaMode === 'custom' ? 'rgba(139,92,246,0.1)' : 'transparent',
                    fontWeight: 700, fontSize: 13, marginBottom: 10,
                  }}
                >
                  <input
                    type="radio"
                    id="plot_marla_custom"
                    name="plotMarlaMode"
                    checked={plotMarlaMode === 'custom'}
                    onChange={() => setPlotMarlaMode('custom')}
                    style={{ accentColor: '#8b5cf6', width: 15, height: 15 }}
                  />
                  <EditIcon size={12}/> {t.customSize}
                </label>
              </div>

              {plotMarlaMode === 'custom' && (
                <div style={{ marginBottom: 14, maxWidth: 300 }}>
                  <input
                    type="number" step="0.01" min="0.01"
                    placeholder="e.g. 1.5 ya 2.25"
                    value={plotMarlaCustom}
                    onChange={e => setPlotMarlaCustom(e.target.value)}
                    style={{ fontSize: 15, fontWeight: 700 }}
                    autoFocus
                  />
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {MARLA_PRESETS.map(m => (
                  <label
                    key={m}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      border: (plotMarlaMode === 'preset' && plotMarlaPreset === m)
                        ? '2px solid var(--accent-green)' : '1.5px solid var(--border-color)',
                      background: (plotMarlaMode === 'preset' && plotMarlaPreset === m)
                        ? 'rgba(16,185,129,0.1)' : 'transparent',
                      fontWeight: 700, fontSize: 14, transition: 'all 0.12s',
                    }}
                  >
                    <input
                      type="radio"
                      name="plotMarlaMode"
                      checked={plotMarlaMode === 'preset' && plotMarlaPreset === m}
                      onChange={() => { setPlotMarlaMode('preset'); setPlotMarlaPreset(m); }}
                      style={{ display: 'none' }}
                    />
                    {m}M
                  </label>
                ))}
              </div>

              {/* Plot Price Summary */}
              {(plotMarlaMode === 'custom' ? parseFloat(plotMarlaCustom) > 0 : parseFloat(plotMarlaPreset) > 0) && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.03))',
                  border: '2px solid rgba(16,185,129,0.3)',
                  borderRadius: 14, padding: '18px 22px', marginBottom: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      Plot Size: {plotMarlaValue} Marla
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      × PKR {townPrices?.Plot_Price ? Number(townPrices.Plot_Price).toLocaleString() : '?'} per marla
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-green)' }}>
                    {totalPlotPrice > 0 ? `PKR ${totalPlotPrice.toLocaleString()}` : '—'}
                  </div>
                </div>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg mt-6" disabled={loading}>
            {loading ? <><ClockIcon size={13}/> {t.adding}</> : <><PlusIcon size={13}/> {t.addPlotShopBtn}</>}
          </button>
        </form>
      </div>

      {/* Properties List Table */}
      <div className="table-container">
        <div className="table-header">
          <h3 style={{display:'flex',alignItems:'center',gap:5}}><SoldIcon size={13}/> {type}s in {selectedTown || '...'} ({properties.length})</h3>
        </div>
        {properties.length === 0 ? (
          <div className="empty-state">
            <div className="icon">{type === 'Plot' ? <PlotIcon size={36}/> : <ShopIcon size={36}/>}</div>
            <h3>{t.noPropertyFound}</h3>
            <p>{t.addPropertiesFirst}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.propertyNo}</th>
                <th>{t.size}</th>
                {type === 'Shop' && <th>{t.roadType}</th>}
                <th>{t.perMarlaPrice}</th>
                <th>Total Price</th>
                <th>Owner</th>
                <th>Customer</th>
                <th>{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{p.Plot_Number || p.Shop_Number}</td>
                  <td>{p.Plot_Size || p.Shop_Size || '-'}</td>
                  {type === 'Shop' && <td>{p.Road_Type || '-'}</td>}
                  <td style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
                    {p.Per_Marla_Price > 0 ? `PKR ${Number(p.Per_Marla_Price).toLocaleString()}` : '-'}
                  </td>
                  <td style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                    {p.Total_Price > 0 ? `PKR ${Number(p.Total_Price).toLocaleString()}` : '-'}
                  </td>
                  <td>{p.Owner_Name || '-'}</td>
                  <td>{p.Customer_Name || '-'}</td>
                  <td>
                    <span className={`status-badge status-${(p.Status || 'available').toLowerCase()}`}>
                      {p.Status || 'Available'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
