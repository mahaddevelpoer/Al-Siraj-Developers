import React, { useState, useEffect } from 'react';
import { ChartIcon, WalletIcon, TrendUpIcon, PlotIcon, ShopIcon, BriefcaseIcon, HandshakeIcon, CalendarIcon, NeighborhoodIcon, ClockIcon, WarnIcon, CheckIcon } from './Icons';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK');
const fmtShort = (n) => {
  n = Number(n || 0);
  if (n >= 10000000) return (n / 10000000).toFixed(1) + ' Cr';
  if (n >= 100000)   return (n / 100000).toFixed(1) + ' L';
  if (n >= 1000)     return (n / 1000).toFixed(1) + 'K';
  return String(n);
};

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ segments, size = 160, thickness = 32, centerLabel, centerSub }) {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  let offset = 0;
  const slices = segments.map((seg, i) => {
    const pct = total > 0 ? (seg.value / total) : 0;
    const dash = pct * circ;
    const gap = circ - dash;
    const slice = { ...seg, dash, gap, offset: offset * circ / total, color: seg.color || COLORS[i % COLORS.length] };
    offset += seg.value;
    return slice;
  });
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
        {slices.map((sl, i) => (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={sl.color} strokeWidth={thickness - 2}
            strokeDasharray={`${sl.dash} ${sl.gap}`}
            strokeDashoffset={-sl.offset}
            strokeLinecap="butt"
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${size/2}px ${size/2}px`, transition: 'stroke-dasharray 0.5s ease' }}
          />
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{centerLabel}</div>
        {centerSub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: 'center', maxWidth: 70 }}>{centerSub}</div>}
      </div>
    </div>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, colorFn, height = 160 }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, padding: '8px 0' }}>
      {data.map((d, i) => {
        const pct = (d[valueKey] || 0) / max;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>{fmtShort(d[valueKey])}</div>
            <div style={{
              width: '100%', height: `${Math.max(pct * (height - 36), 4)}px`,
              background: colorFn ? colorFn(d, i) : COLORS[i % COLORS.length],
              borderRadius: '4px 4px 0 0',
              transition: 'height 0.5s ease',
              minHeight: 4,
            }} title={`${d[labelKey]}: PKR ${fmt(d[valueKey])}`} />
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2, maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(d[labelKey] || '').replace(' Foot Road', 'ft')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Line Sparkline ────────────────────────────────────────────────────────────
function LineChart({ data, valueKey, labelKey, color = '#3b82f6', height = 120 }) {
  if (!data || data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Not enough data</div>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const w = 500, h = height - 24;
  const xs = data.map((_, i) => (i / (data.length - 1)) * w);
  const ys = data.map(d => h - ((d[valueKey] || 0) / max) * (h - 8) - 4);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const fill = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ') + ` L${w},${h} L0,${h} Z`;
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 24}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#lineGrad)" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={ys[i]} r="4" fill={color} stroke="var(--bg-card)" strokeWidth="2" />
            <text x={x} y={h + 16} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{String(data[i][labelKey] || '').substring(5)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ Icon, label, value, sub, color, bg }) {
  return (
    <div style={{
      background: bg || 'var(--bg-card)',
      border: `1.5px solid ${color}33`,
      borderRadius: 14, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display:'inline-flex', alignItems:'center', color }}>{Icon && <Icon size={18}/>}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TownPerformance({ showToast }) {
  const [towns, setTowns] = useState([]);
  const [selectedTown, setSelectedTown] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.api) window.api.getTowns().then(d => { if (Array.isArray(d)) setTowns(d); });
  }, []);

  useEffect(() => {
    if (!selectedTown) { setData(null); return; }
    setLoading(true);
    window.api.getTownPerformance(selectedTown).then(d => {
      if (d?.error) showToast(d.error, 'error');
      else setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedTown]);

  const isProfit = data && data.netProfit >= 0;

  // Build donut segments for financials
  const finSegments = data ? [
    { label: 'Commission', value: data.commission, color: '#f59e0b' },
    { label: 'Op. Expenses', value: data.opExpenses, color: '#ef4444' },
    { label: 'CEO Expenses', value: data.ceoExpenses, color: '#8b5cf6' },
    { label: 'CEO Salary', value: data.salary, color: '#ec4899' },
  ].filter(s => s.value > 0) : [];

  // Monthly bar data
  const monthlyBars = data?.monthlyTrend?.length > 0
    ? data.monthlyTrend.map(m => ({ label: m.month, income: m.income }))
    : [];

  return (
    <div>
      {/* Town Selector */}
      <div className="form-container mb-6" style={{ borderTop: '4px solid var(--accent-blue)' }}>
        <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display:'inline-flex', alignItems:'center' }}><ChartIcon size={20}/></span>
          Town Performance Analytics
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, marginTop: -8 }}>
          Select a town to see actual income, expenses, profit & estimated potential income.
        </p>
        <div className="form-group" style={{ maxWidth: 340 }}>
          <label style={{ fontWeight: 700, fontSize: 13, display:'flex', alignItems:'center', gap:5 }}><NeighborhoodIcon size={13}/> Select Town *</label>
          <select value={selectedTown} onChange={e => setSelectedTown(e.target.value)}>
            <option value="">-- Select Town --</option>
            {towns.map((t, i) => <option key={i} value={t.Town_Name}>{t.Town_Name}</option>)}
          </select>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 15 }}>
          <span style={{display:'flex', alignItems:'center', gap:6, color:'var(--text-muted)'}}><ClockIcon size={14}/> Loading performance data...</span>
        </div>
      )}

      {!selectedTown && !loading && (
        <div className="empty-state">
          <div className="icon"><ChartIcon size={36}/></div>
          <h3>Select a Town</h3>
          <p>Choose a town above to view its full financial performance analytics.</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── KPI Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            <StatCard Icon={WalletIcon} label="Actual Income" value={`PKR ${fmtShort(data.actualIncome)}`}
              sub={`PKR ${fmt(data.actualIncome)}`} color="var(--accent-blue)" />
            <StatCard Icon={ChartIcon} label="Total Expenses" value={`PKR ${fmtShort(data.totalExpenses)}`}
              sub={`Comm + Op + CEO`} color="var(--accent-red)" />
            <StatCard Icon={isProfit ? TrendUpIcon : ChartIcon} label="Net Profit / Loss"
              value={`${isProfit ? '+' : ''}PKR ${fmtShort(data.netProfit)}`}
              sub={isProfit ? 'In Profit' : 'In Loss'}
              color={isProfit ? 'var(--accent-green)' : 'var(--accent-red)'} />
            <StatCard Icon={TrendUpIcon} label="Est. Total Potential" value={`PKR ${fmtShort(data.estimateTotal)}`}
              sub={`Plots: ${fmtShort(data.estimatePlots)} | Shops: ${fmtShort(data.estimateShops)}`}
              color="#8b5cf6" />
            <StatCard Icon={PlotIcon} label="Plots" value={`${data.soldPlots} / ${data.totalPlots}`}
              sub={`Sold / Total`} color="var(--accent-blue)" />
            <StatCard Icon={ShopIcon} label="Shops" value={`${data.soldShops} / ${data.totalShops}`}
              sub={`Sold / Total`} color="#10b981" />
          </div>

          {/* ── Financial Breakdown + Expense Donut ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Breakdown Table */}
            <div className="table-container" style={{ margin: 0 }}>
              <div className="table-header"><h3 style={{display:'flex',alignItems:'center',gap:5}}><BriefcaseIcon size={13}/> Financial Breakdown</h3></div>
              <table className="data-table">
                <thead><tr><th>Category</th><th>Amount (PKR)</th><th>%</th></tr></thead>
                <tbody>
                  {[
                    { label: 'Actual Income',   val: data.actualIncome,   color: '#3b82f6' },
                    { label: 'Commission',       val: data.commission,     color: '#f59e0b' },
                    { label: 'Op. Expenses',     val: data.opExpenses,     color: '#ef4444' },
                    { label: 'CEO Expenses',     val: data.ceoExpenses,    color: '#8b5cf6' },
                    { label: 'CEO Salary',       val: data.salary,         color: '#ec4899' },
                    { label: isProfit ? 'Net Profit' : 'Net Loss', val: data.netProfit, color: isProfit ? '#10b981' : '#ef4444' },
                  ].map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.label}</td>
                      <td style={{ fontWeight: 700, color: r.color }}>
                        {r.val < 0 ? '-' : ''}PKR {fmt(Math.abs(r.val))}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {data.actualIncome > 0 ? `${((Math.abs(r.val) / data.actualIncome) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Expense Donut */}
            <div className="form-container" style={{ margin: 0, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, display:'flex', alignItems:'center', gap:5 }}><ChartIcon size={13}/> Expense Distribution</div>
              {finSegments.length > 0 ? (
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <DonutChart segments={finSegments} size={150} thickness={30}
                    centerLabel={fmtShort(data.totalExpenses)} centerSub="Total Exp" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {finSegments.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 'auto', color: s.color }}>
                          PKR {fmtShort(s.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>No expenses recorded.</div>
              )}
            </div>
          </div>

          {/* ── Monthly Income Trend ── */}
          {monthlyBars.length > 0 && (
            <div className="form-container mb-6" style={{ margin: 0, padding: 20, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, display:'flex', alignItems:'center', gap:5 }}><CalendarIcon size={13}/> Monthly Income Trend</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 16 }}>
                Last {monthlyBars.length} months of sales income for {selectedTown}
              </div>
              <LineChart data={monthlyBars} valueKey="income" labelKey="label" color="#3b82f6" height={130} />
            </div>
          )}

          {/* ── Estimate Income Section ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Plot Estimate */}
            <div className="form-container" style={{ margin: 0, padding: 20, borderTop: '3px solid var(--accent-blue)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, display:'flex', alignItems:'center', gap:5 }}><PlotIcon size={13}/> Plot Estimate Income</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 16 }}>
                Formula: Plots × Marla × Per Marla Price (PKR {fmt(data.plotPricePerMarla)}/marla)
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-blue)', marginBottom: 16 }}>
                PKR {fmt(data.estimatePlots)}
              </div>
              {data.plotBreakdown.length > 0 ? (
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Plot #</th><th>Marla</th><th>Price/M</th><th>Estimate</th><th>Status</th></tr></thead>
                    <tbody>
                      {data.plotBreakdown.map((p, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{p.number}</td>
                          <td>{p.marla}</td>
                          <td>PKR {fmtShort(p.pricePerMarla)}</td>
                          <td style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>PKR {fmtShort(p.estimate)}</td>
                          <td>
                            <span style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 700,
                              background: p.status === 'Sold' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.12)',
                              color: p.status === 'Sold' ? 'var(--accent-green)' : 'var(--accent-blue)',
                            }}>{p.status || 'Available'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No plots added yet.</div>
              )}
            </div>

            {/* Shop Estimate */}
            <div className="form-container" style={{ margin: 0, padding: 20, borderTop: '3px solid #10b981' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, display:'flex', alignItems:'center', gap:5 }}><ShopIcon size={13}/> Shop Estimate Income</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 16 }}>
                Formula: Shops × Marla × Road Category Price (from Town Prices)
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', marginBottom: 16 }}>
                PKR {fmt(data.estimateShops)}
              </div>

              {/* Shop by road category bar */}
              {data.shopByRoad.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>By Road Category</div>
                  <BarChart
                    data={data.shopByRoad}
                    valueKey="estimate"
                    labelKey="label"
                    colorFn={(_, i) => COLORS[i % COLORS.length]}
                    height={140}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                    {data.shopByRoad.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
                        <span style={{ color: 'var(--text-muted)' }}>({r.count} shops, {r.totalMarla} M)</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 700, color: COLORS[i % COLORS.length] }}>
                          PKR {fmtShort(r.estimate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {data.shopByRoad.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No shops added yet.</div>
              )}
            </div>
          </div>

          {/* ── Estimate vs Actual Comparison ── */}
          <div className="form-container" style={{ padding: 20, marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, display:'flex', alignItems:'center', gap:5 }}><TrendUpIcon size={13}/> Estimate vs Actual Comparison</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Estimated Potential', val: data.estimateTotal, color: '#8b5cf6' },
                { label: 'Actual Income', val: data.actualIncome, color: '#3b82f6' },
                { label: 'Net Profit', val: data.netProfit, color: isProfit ? '#10b981' : '#ef4444' },
              ].map((b, i) => (
                <div key={i} style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>{b.label}</div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{
                      height: '100%', borderRadius: 8,
                      width: `${Math.min((b.val / (data.estimateTotal || 1)) * 100, 100)}%`,
                      background: b.color, transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: b.color }}>PKR {fmtShort(b.val)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(b.val)}</div>
                </div>
              ))}
            </div>
            {data.estimateTotal > 0 && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(139,92,246,0.08)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong>Achieved:</strong> {((data.actualIncome / data.estimateTotal) * 100).toFixed(1)}% of estimated potential income has been realized.
                {data.estimateTotal > data.actualIncome && ` Remaining potential: PKR ${fmt(data.estimateTotal - data.actualIncome)}.`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
