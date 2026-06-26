import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckIcon,
  CrossIcon,
  EditIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  TrashIcon,
} from './Icons';

const VIEW_W = 1200;
const VIEW_H = 800;
const GRID_EXTENT = 6000;

const defaultStyle = {
  plot: { stroke: '#0f172a', strokeWidth: 2 },
  shop: { stroke: '#4c1d95', strokeWidth: 2 },
  road: { stroke: '#64748b' },
  label: { fill: '#111827' },
};

function makeId() {
  return `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeStatus(value) {
  const clean = String(value || 'available').toLowerCase();
  if (clean.includes('sold')) return 'sold';
  if (clean.includes('reserve') || clean.includes('book')) return 'reserved';
  return 'available';
}

function propertyKey(type, number) {
  return `${String(type || '').toLowerCase()}::${String(number || '').trim().toLowerCase()}`;
}

function shapeDisplayStatus(shape, property) {
  if (property) return normalizeStatus(property.Status || property.status);
  return normalizeStatus(shape.status);
}

function fillFor(status, type) {
  if (type === 'road') return 'none';
  if (type === 'label') return '#e5e7eb';
  if (status === 'sold') return '#ef4444';
  if (status === 'reserved') return '#f59e0b';
  return type === 'shop' ? '#38bdf8' : '#22c55e';
}

function strokeFor(shape, status) {
  if (status === 'sold') return '#991b1b';
  if (status === 'reserved') return '#92400e';
  return shape.style?.stroke || defaultStyle[shape.type]?.stroke || '#111827';
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createShape(type, count) {
  const base = {
    id: makeId(),
    type,
    status: 'available',
    label: `${type === 'shop' ? 'Shop' : type === 'road' ? 'Road' : type === 'label' ? 'Label' : 'Plot'} ${count}`,
    propertyType: '',
    propertyNumber: '',
    style: defaultStyle[type] || {},
    sortOrder: count,
  };
  if (type === 'road') {
    return { ...base, geometry: { kind: 'line', x1: 180, y1: 360, x2: 760, y2: 360, strokeWidth: 24 } };
  }
  if (type === 'label') {
    return { ...base, geometry: { kind: 'text', x: 360, y: 180, fontSize: 30 } };
  }
  return {
    ...base,
    geometry: {
      kind: 'rect',
      x: type === 'shop' ? 520 : 460,
      y: type === 'shop' ? 320 : 280,
      width: type === 'shop' ? 90 : 135,
      height: type === 'shop' ? 58 : 85,
    },
  };
}

function SvgMapCanvas({
  shapes,
  propertiesByKey,
  selectedId,
  onSelect,
  onMoveShape,
  zoom,
  pan,
  setPan,
  setZoom,
  mode = 'overview',
  variant = 'full',
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);

  const point = (event) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const viewY = ((event.clientY - rect.top) / rect.height) * VIEW_H;
    return {
      x: (viewX - pan.x) / zoom,
      y: (viewY - pan.y) / zoom,
    };
  };

  const viewPoint = (event) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_H,
    };
  };

  const onMouseMove = (event) => {
    if (dragRef.current && mode === 'designer') {
      const p = point(event);
      const { id, start, original } = dragRef.current;
      onMoveShape(id, p.x - start.x, p.y - start.y, original);
    } else if (panRef.current) {
      const v = viewPoint(event);
      setPan({
        x: panRef.current.origin.x + (v.x - panRef.current.start.x),
        y: panRef.current.origin.y + (v.y - panRef.current.start.y),
      });
    }
  };

  const stopDrag = () => {
    dragRef.current = null;
    panRef.current = null;
  };

  return (
    <div
      className={`town-map-canvas-wrap ${variant === 'hero' ? 'town-map-canvas-wrap--hero' : ''}`}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      <div className="town-map-world-hud">
        <span>Zoom {Math.round(zoom * 100)}%</span>
        <span>X {Math.round(-pan.x / zoom)}</span>
        <span>Y {Math.round(-pan.y / zoom)}</span>
      </div>
      <svg
        ref={svgRef}
        className="town-map-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        onWheel={(event) => {
          if (!setZoom) return;
          event.preventDefault();
          const before = point(event);
          const factor = event.deltaY > 0 ? 0.88 : 1.14;
          const nextZoom = Math.max(0.15, Math.min(6, zoom * factor));
          const v = viewPoint(event);
          setZoom(nextZoom);
          setPan({
            x: v.x - before.x * nextZoom,
            y: v.y - before.y * nextZoom,
          });
        }}
        onMouseDown={(e) => {
          if (e.target === svgRef.current) {
            const v = viewPoint(e);
            panRef.current = {
              start: { x: v.x, y: v.y },
              origin: { ...pan },
            };
            onSelect?.(null);
          }
        }}
      >
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#050816" />
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          <rect x={-GRID_EXTENT} y={-GRID_EXTENT} width={GRID_EXTENT * 2} height={GRID_EXTENT * 2} fill="#050816" />
          {[...Array((GRID_EXTENT * 2) / 50 + 1)].map((_, i) => {
            const x = -GRID_EXTENT + i * 50;
            return <line key={`v-${i}`} x1={x} y1={-GRID_EXTENT} x2={x} y2={GRID_EXTENT} stroke={x === 0 ? '#475569' : '#172033'} strokeWidth={x === 0 ? 2 : 1} />;
          })}
          {[...Array((GRID_EXTENT * 2) / 50 + 1)].map((_, i) => {
            const y = -GRID_EXTENT + i * 50;
            return <line key={`h-${i}`} x1={-GRID_EXTENT} y1={y} x2={GRID_EXTENT} y2={y} stroke={y === 0 ? '#475569' : '#172033'} strokeWidth={y === 0 ? 2 : 1} />;
          })}
          {[...Array((GRID_EXTENT * 2) / 250 + 1)].map((_, i) => {
            const x = -GRID_EXTENT + i * 250;
            return <line key={`major-v-${i}`} x1={x} y1={-GRID_EXTENT} x2={x} y2={GRID_EXTENT} stroke="#243045" strokeWidth="1.5" />;
          })}
          {[...Array((GRID_EXTENT * 2) / 250 + 1)].map((_, i) => {
            const y = -GRID_EXTENT + i * 250;
            return <line key={`major-h-${i}`} x1={-GRID_EXTENT} y1={y} x2={GRID_EXTENT} y2={y} stroke="#243045" strokeWidth="1.5" />;
          })}
          <circle cx="0" cy="0" r="5" fill="#60a5fa" />
          {shapes.map((shape) => {
            const property = propertiesByKey.get(propertyKey(shape.propertyType, shape.propertyNumber));
            const status = shapeDisplayStatus(shape, property);
            const selected = selectedId === shape.id;
            const common = {
              onMouseDown: (event) => {
                event.stopPropagation();
                onSelect?.(shape.id);
                if (mode === 'designer') {
                  dragRef.current = {
                    id: shape.id,
                    start: point(event),
                    original: JSON.parse(JSON.stringify(shape.geometry || {})),
                  };
                }
              },
              style: { cursor: mode === 'designer' ? 'move' : 'pointer' },
            };

            if (shape.type === 'road') {
              const g = shape.geometry || {};
              return (
                <g key={shape.id} {...common} className="town-map-shape">
                  <title>{shape.label}</title>
                  <line
                    x1={toNumber(g.x1)}
                    y1={toNumber(g.y1)}
                    x2={toNumber(g.x2, 300)}
                    y2={toNumber(g.y2, 300)}
                    stroke={shape.style?.stroke || '#64748b'}
                    strokeWidth={toNumber(g.strokeWidth, 20)}
                    strokeLinecap="round"
                  />
                  {selected && <line x1={toNumber(g.x1)} y1={toNumber(g.y1)} x2={toNumber(g.x2, 300)} y2={toNumber(g.y2, 300)} stroke="#60a5fa" strokeWidth={toNumber(g.strokeWidth, 20) + 8} opacity="0.26" strokeLinecap="round" />}
                </g>
              );
            }

            if (shape.type === 'label') {
              const g = shape.geometry || {};
              return (
                <text
                  key={shape.id}
                  {...common}
                  x={toNumber(g.x)}
                  y={toNumber(g.y)}
                  fontSize={toNumber(g.fontSize, 24)}
                  fontWeight="800"
                  fill={shape.style?.fill || '#e5e7eb'}
                >
                  {shape.label}
                </text>
              );
            }

            const g = shape.geometry || {};
            return (
              <g key={shape.id} {...common} className="town-map-shape">
                <title>{shape.label}</title>
                <rect
                  x={toNumber(g.x)}
                  y={toNumber(g.y)}
                  width={toNumber(g.width, 100)}
                  height={toNumber(g.height, 70)}
                  rx="8"
                  fill={fillFor(status, shape.type)}
                  opacity="0.92"
                  stroke={selected ? '#60a5fa' : strokeFor(shape, status)}
                  strokeWidth={selected ? 4 : toNumber(shape.style?.strokeWidth, 2)}
                  filter="url(#townMapGlow)"
                />
                <text
                  x={toNumber(g.x) + toNumber(g.width, 100) / 2}
                  y={toNumber(g.y) + toNumber(g.height, 70) / 2 + 5}
                  textAnchor="middle"
                  fontSize="20"
                  fontWeight="800"
                  fill="#ffffff"
                  pointerEvents="none"
                >
                  {shape.label}
                </text>
              </g>
            );
          })}
          <defs>
            <filter id="townMapGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000000" floodOpacity="0.32" />
            </filter>
          </defs>
        </g>
      </svg>
    </div>
  );
}

export default function TownMap({ townName, showToast, variant = 'full', initialMode = 'overview', readOnly = false }) {
  const [mode, setMode] = useState(initialMode);
  const [shapes, setShapes] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(variant === 'hero' ? 0.82 : 1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    load();
  }, [townName]);

  const propertiesByKey = useMemo(() => {
    const map = new Map();
    properties.forEach((p) => map.set(propertyKey(p.Property_Type, p.Property_Number || p.Plot_Number || p.Shop_Number), p));
    return map;
  }, [properties]);

  const selected = shapes.find((shape) => shape.id === selectedId) || null;
  const visibleShapes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shapes.filter((shape) => {
      const property = propertiesByKey.get(propertyKey(shape.propertyType, shape.propertyNumber));
      const status = shapeDisplayStatus(shape, property);
      const hay = `${shape.label} ${shape.type} ${shape.propertyType} ${shape.propertyNumber}`.toLowerCase();
      return (filter === 'all' || status === filter || shape.type === 'road' || shape.type === 'label') &&
        (!q || hay.includes(q));
    });
  }, [shapes, propertiesByKey, query, filter]);

  async function load() {
    setLoading(true);
    try {
      const [saved, plots, shops] = await Promise.all([
        window.api.getTownMapShapes?.(townName),
        window.api.getAllPlots?.(townName),
        window.api.getAllShops?.(townName),
      ]);
      if (saved?.error) throw new Error(saved.error);
      setShapes(Array.isArray(saved) ? saved : []);
      setProperties([
        ...(Array.isArray(plots) ? plots.map((p) => ({ ...p, Property_Type: 'Plot', Property_Number: p.Property_Number || p.Plot_Number })) : []),
        ...(Array.isArray(shops) ? shops.map((s) => ({ ...s, Property_Type: 'Shop', Property_Number: s.Property_Number || s.Shop_Number })) : []),
      ]);
    } catch (e) {
      showToast?.(`Town map load failed: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  function updateSelected(patch) {
    if (!selected) return;
    setShapes((current) => current.map((shape) => shape.id === selected.id ? { ...shape, ...patch } : shape));
  }

  function updateGeometry(patch) {
    if (!selected) return;
    updateSelected({ geometry: { ...(selected.geometry || {}), ...patch } });
  }

  function moveShape(id, dx, dy, original) {
    setShapes((current) => current.map((shape) => {
      if (shape.id !== id) return shape;
      const g = original || shape.geometry || {};
      if (shape.type === 'road') {
        return { ...shape, geometry: { ...shape.geometry, x1: toNumber(g.x1) + dx, y1: toNumber(g.y1) + dy, x2: toNumber(g.x2) + dx, y2: toNumber(g.y2) + dy } };
      }
      return { ...shape, geometry: { ...shape.geometry, x: toNumber(g.x) + dx, y: toNumber(g.y) + dy } };
    }));
  }

  function addShape(type) {
    const shape = createShape(type, shapes.length + 1);
    setShapes((current) => [...current, shape]);
    setSelectedId(shape.id);
    setMode('designer');
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = {
      ...JSON.parse(JSON.stringify(selected)),
      id: makeId(),
      label: `${selected.label} Copy`,
      sortOrder: shapes.length + 1,
      geometry: selected.type === 'road'
        ? { ...selected.geometry, x1: toNumber(selected.geometry?.x1) + 24, y1: toNumber(selected.geometry?.y1) + 24, x2: toNumber(selected.geometry?.x2) + 24, y2: toNumber(selected.geometry?.y2) + 24 }
        : { ...selected.geometry, x: toNumber(selected.geometry?.x) + 24, y: toNumber(selected.geometry?.y) + 24 },
    };
    setShapes((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await window.api.saveTownMapShapes?.({ townName, shapes });
      if (res?.error) throw new Error(res.error);
      showToast?.('Town map saved');
    } catch (e) {
      showToast?.(`Map save failed: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const selectedProperty = selected ? propertiesByKey.get(propertyKey(selected.propertyType, selected.propertyNumber)) : null;

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className={`town-map-shell ${variant === 'hero' ? 'town-map-shell--hero' : ''}`}>
      {variant !== 'hero' && <div className="town-map-head">
        <div>
          <div className="ui-label">Native SVG town map</div>
          <h2>{townName} Map</h2>
          <p>Draw plots, shops, roads and labels. Linked sold properties automatically turn red.</p>
        </div>
        <div className="town-map-actions">
          <button className={`btn ${mode === 'overview' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('overview')}>Overview</button>
          {!readOnly && <button className={`btn ${mode === 'designer' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('designer')}><EditIcon size={13}/> Designer</button>}
        </div>
      </div>}

      <div className={`town-map-toolbar ${variant === 'hero' ? 'town-map-toolbar--overlay' : ''}`}>
        <div className="town-map-search">
          <SearchIcon size={14}/>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plot, shop, road..." />
        </div>
        {['all', 'available', 'reserved', 'sold'].map((item) => (
          <button key={item} className={`town-map-chip${filter === item ? ' active' : ''}`} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
        <button className="btn btn-ghost" onClick={() => setZoom((z) => Math.max(0.15, z - 0.15))}>-</button>
        <button className="btn btn-ghost" onClick={() => setZoom((z) => Math.min(6, z + 0.15))}>+</button>
        <button className="btn btn-ghost" onClick={() => { setZoom(variant === 'hero' ? 0.82 : 1); setPan({ x: 0, y: 0 }); }}>Reset</button>
      </div>

      {mode === 'designer' && !readOnly && (
        <div className="town-map-designer-bar">
          <button className="btn btn-secondary" onClick={() => addShape('plot')}><PlusIcon size={13}/> Plot</button>
          <button className="btn btn-secondary" onClick={() => addShape('shop')}><PlusIcon size={13}/> Shop</button>
          <button className="btn btn-secondary" onClick={() => addShape('road')}><PlusIcon size={13}/> Road</button>
          <button className="btn btn-secondary" onClick={() => addShape('label')}><PlusIcon size={13}/> Label</button>
          <button className="btn btn-ghost" disabled={!selected} onClick={duplicateSelected}>Duplicate</button>
          <button className="btn btn-danger" disabled={!selected} onClick={() => { setShapes((rows) => rows.filter((s) => s.id !== selected.id)); setSelectedId(null); }}><TrashIcon size={13}/> Delete</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}><SaveIcon size={13}/> {saving ? 'Saving...' : 'Save Map'}</button>
        </div>
      )}

      <div className={`town-map-layout ${variant === 'hero' ? 'town-map-layout--hero' : ''}`}>
        <div className="town-map-main-card">
          {shapes.length === 0 ? (
            <div className="town-map-empty">
              <h3>No town map yet</h3>
              <p>Open Designer and add plots, shops, roads and labels for this town.</p>
              <button className="btn btn-primary" onClick={() => setMode('designer')}>Open Designer</button>
            </div>
          ) : (
            <SvgMapCanvas
              shapes={visibleShapes}
              propertiesByKey={propertiesByKey}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMoveShape={moveShape}
              zoom={zoom}
              pan={pan}
              setPan={setPan}
              setZoom={setZoom}
              mode={mode}
              variant={variant}
            />
          )}
          <div className="town-map-legend">
            <span><i className="available" /> Available</span>
            <span><i className="reserved" /> Reserved</span>
            <span><i className="sold" /> Sold</span>
            <span><i className="road" /> Road</span>
          </div>
        </div>

        {variant !== 'hero' && <aside className="town-map-side">
          {selected ? (
            <>
              <div className="town-map-side-title">Selected Shape</div>
              <label>Label<input value={selected.label} onChange={(e) => updateSelected({ label: e.target.value })} disabled={mode !== 'designer'} /></label>
              <label>Type<select value={selected.type} onChange={(e) => updateSelected({ type: e.target.value, style: defaultStyle[e.target.value] || {} })} disabled={mode !== 'designer'}>
                <option value="plot">Plot</option>
                <option value="shop">Shop</option>
                <option value="road">Road</option>
                <option value="label">Label</option>
              </select></label>
              <label>Status<select value={selected.status} onChange={(e) => updateSelected({ status: e.target.value })} disabled={mode !== 'designer'}>
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="sold">Sold</option>
              </select></label>
              {selected.type !== 'road' && selected.type !== 'label' && (
                <label>Linked Property<select
                  value={selected.propertyType && selected.propertyNumber ? propertyKey(selected.propertyType, selected.propertyNumber) : ''}
                  onChange={(e) => {
                    const [type, number] = e.target.value.split('::');
                    updateSelected({ propertyType: type ? type[0].toUpperCase() + type.slice(1) : '', propertyNumber: number || '' });
                  }}
                  disabled={mode !== 'designer'}
                >
                  <option value="">Not linked</option>
                  {properties.map((p) => {
                    const type = p.Property_Type;
                    const number = p.Property_Number || p.Plot_Number || p.Shop_Number;
                    return <option key={propertyKey(type, number)} value={propertyKey(type, number)}>{type} #{number} - {p.Status || 'Available'}</option>;
                  })}
                </select></label>
              )}
              {selected.type === 'road' ? (
                <div className="town-map-field-grid">
                  {['x1', 'y1', 'x2', 'y2', 'strokeWidth'].map((k) => (
                    <label key={k}>{k}<input type="number" value={selected.geometry?.[k] ?? ''} onChange={(e) => updateGeometry({ [k]: Number(e.target.value) })} disabled={mode !== 'designer'} /></label>
                  ))}
                </div>
              ) : selected.type === 'label' ? (
                <div className="town-map-field-grid">
                  {['x', 'y', 'fontSize'].map((k) => (
                    <label key={k}>{k}<input type="number" value={selected.geometry?.[k] ?? ''} onChange={(e) => updateGeometry({ [k]: Number(e.target.value) })} disabled={mode !== 'designer'} /></label>
                  ))}
                </div>
              ) : (
                <div className="town-map-field-grid">
                  {['x', 'y', 'width', 'height'].map((k) => (
                    <label key={k}>
                      {k}
                      <div className="town-map-stepper">
                        <button type="button" onClick={() => updateGeometry({ [k]: toNumber(selected.geometry?.[k]) - 10 })} disabled={mode !== 'designer'}>-</button>
                        <input type="number" value={selected.geometry?.[k] ?? ''} onChange={(e) => updateGeometry({ [k]: Number(e.target.value) })} disabled={mode !== 'designer'} />
                        <button type="button" onClick={() => updateGeometry({ [k]: toNumber(selected.geometry?.[k]) + 10 })} disabled={mode !== 'designer'}>+</button>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selectedProperty && (
                <div className="town-map-property-card">
                  <div><CheckIcon size={13}/> Linked property</div>
                  <b>{selectedProperty.Property_Type} #{selectedProperty.Property_Number}</b>
                  <span>Status: {selectedProperty.Status || 'Available'}</span>
                  <span>Customer: {selectedProperty.Customer_Name || '-'}</span>
                </div>
              )}
            </>
          ) : (
            <div className="town-map-help">
              <CrossIcon size={18}/>
              <h3>No shape selected</h3>
              <p>Click any plot, shop, road or label to inspect it. In Designer mode you can move and edit shapes.</p>
            </div>
          )}
        </aside>}
      </div>
    </div>
  );
}
