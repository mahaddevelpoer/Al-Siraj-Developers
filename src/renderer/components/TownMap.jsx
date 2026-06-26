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
  if (type === 'label') return '#111827';
  if (status === 'sold') return '#ef4444';
  if (status === 'reserved') return '#f59e0b';
  return type === 'shop' ? '#dbeafe' : '#dcfce7';
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
  mode = 'overview',
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);

  const point = (event) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_W / zoom - pan.x / zoom,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_H / zoom - pan.y / zoom,
    };
  };

  const onMouseMove = (event) => {
    if (dragRef.current && mode === 'designer') {
      const p = point(event);
      const { id, start, original } = dragRef.current;
      onMoveShape(id, p.x - start.x, p.y - start.y, original);
    } else if (panRef.current) {
      setPan({
        x: panRef.current.origin.x + (event.clientX - panRef.current.start.x),
        y: panRef.current.origin.y + (event.clientY - panRef.current.start.y),
      });
    }
  };

  const stopDrag = () => {
    dragRef.current = null;
    panRef.current = null;
  };

  return (
    <div
      className="town-map-canvas-wrap"
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      <svg
        ref={svgRef}
        className="town-map-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        onMouseDown={(e) => {
          if (e.target === svgRef.current) {
            panRef.current = {
              start: { x: e.clientX, y: e.clientY },
              origin: { ...pan },
            };
            onSelect?.(null);
          }
        }}
      >
        <g transform={`translate(${pan.x / zoom} ${pan.y / zoom}) scale(${zoom})`}>
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#f8fafc" />
          {[...Array(24)].map((_, i) => (
            <line key={`v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2={VIEW_H} stroke="#e5e7eb" strokeWidth="1" />
          ))}
          {[...Array(16)].map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={i * 50} x2={VIEW_W} y2={i * 50} stroke="#e5e7eb" strokeWidth="1" />
          ))}
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
                <g key={shape.id} {...common}>
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
                  {selected && <line x1={toNumber(g.x1)} y1={toNumber(g.y1)} x2={toNumber(g.x2, 300)} y2={toNumber(g.y2, 300)} stroke="#2563eb" strokeWidth={toNumber(g.strokeWidth, 20) + 8} opacity="0.24" strokeLinecap="round" />}
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
                  fill={shape.style?.fill || '#111827'}
                >
                  {shape.label}
                </text>
              );
            }

            const g = shape.geometry || {};
            return (
              <g key={shape.id} {...common}>
                <title>{shape.label}</title>
                <rect
                  x={toNumber(g.x)}
                  y={toNumber(g.y)}
                  width={toNumber(g.width, 100)}
                  height={toNumber(g.height, 70)}
                  rx="8"
                  fill={fillFor(status, shape.type)}
                  stroke={selected ? '#2563eb' : strokeFor(shape, status)}
                  strokeWidth={selected ? 4 : toNumber(shape.style?.strokeWidth, 2)}
                />
                <text
                  x={toNumber(g.x) + toNumber(g.width, 100) / 2}
                  y={toNumber(g.y) + toNumber(g.height, 70) / 2 + 5}
                  textAnchor="middle"
                  fontSize="20"
                  fontWeight="800"
                  fill={status === 'sold' ? '#fff' : '#111827'}
                  pointerEvents="none"
                >
                  {shape.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export default function TownMap({ townName, showToast }) {
  const [mode, setMode] = useState('overview');
  const [shapes, setShapes] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
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
    <div className="town-map-shell">
      <div className="town-map-head">
        <div>
          <div className="ui-label">Native SVG town map</div>
          <h2>{townName} Map</h2>
          <p>Draw plots, shops, roads and labels. Linked sold properties automatically turn red.</p>
        </div>
        <div className="town-map-actions">
          <button className={`btn ${mode === 'overview' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('overview')}>Overview</button>
          <button className={`btn ${mode === 'designer' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('designer')}><EditIcon size={13}/> Designer</button>
        </div>
      </div>

      <div className="town-map-toolbar">
        <div className="town-map-search">
          <SearchIcon size={14}/>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plot, shop, road..." />
        </div>
        {['all', 'available', 'reserved', 'sold'].map((item) => (
          <button key={item} className={`town-map-chip${filter === item ? ' active' : ''}`} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
        <button className="btn btn-ghost" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}>-</button>
        <button className="btn btn-ghost" onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}>+</button>
        <button className="btn btn-ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
      </div>

      {mode === 'designer' && (
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

      <div className="town-map-layout">
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
              mode={mode}
            />
          )}
          <div className="town-map-legend">
            <span><i className="available" /> Available</span>
            <span><i className="reserved" /> Reserved</span>
            <span><i className="sold" /> Sold</span>
            <span><i className="road" /> Road</span>
          </div>
        </div>

        <aside className="town-map-side">
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
                    <label key={k}>{k}<input type="number" value={selected.geometry?.[k] ?? ''} onChange={(e) => updateGeometry({ [k]: Number(e.target.value) })} disabled={mode !== 'designer'} /></label>
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
        </aside>
      </div>
    </div>
  );
}
