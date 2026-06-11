import React, { useState, useEffect } from 'react';
import { PlotIcon, ShopIcon, SoldIcon, ClockIcon } from './Icons';
import { useAuth } from '../contexts/AuthContext';

export default function SoldProperties({ showToast, loadNotifications, townName, panel }) {
  const { userProfile } = useAuth();
  const agentName = userProfile?.full_name || '';
  const [data, setData] = useState({ plots: [], shops: [] });
  const [tab, setTab] = useState('plots');
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState(null);
  const [cancelCtx, setCancelCtx] = useState(null);
  const [cancelReceipt, setCancelReceipt] = useState('');

  // File delivery photo upload state
  const [deliveryPhoto, setDeliveryPhoto] = useState(null);
  const [deliveryTarget, setDeliveryTarget] = useState(null);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    if (!window.api) { setLoading(false); return; }
    try { const d = await window.api.getSoldProperties(); if (d && !d.error) setData(d); } catch(e) {}
    setLoading(false);
  };

  const filterByAgent = (arr) => {
    if (!agentName) return arr || [];
    const role = userProfile?.role || '';
    if (role !== 'agent') return arr || [];
    return (arr || []).filter(p =>
      p.Agent_Name && p.Agent_Name.toLowerCase() === agentName.toLowerCase()
    );
  };

  const handleCancelDeal = async (p) => {
    const type = tab === 'plots' ? 'Plot' : 'Shop';
    const number = p[tab === 'plots' ? 'Plot_Number' : 'Shop_Number'];
    const townName = p.Town_Name;
    setCancelCtx({ type, number, townName });
    setCancelReceipt('');
  };

  const confirmCancelDeal = async () => {
    if (!cancelCtx) return;
    if (!window.api?.cancelDeal) { showToast?.('Cancel API not available', 'error'); return; }
    const Receipt_Number = String(cancelReceipt || '').trim();
    if (!Receipt_Number) { showToast?.('Receipt number required', 'error'); return; }
    const { type, number, townName } = cancelCtx;
    const key = `${type}|${townName}|${number}`;
    setWorkingKey(key);
    try {
      const r = await window.api.cancelDeal({ type, number, townName, Receipt_Number });
      if (r?.error) showToast?.(r.error, 'error');
      else {
        showToast?.('Deal cancelled. Property is available again.');
        await loadData();
        loadNotifications?.();
        setCancelCtx(null);
      }
    } catch (e) {
      showToast?.('Cancel failed', 'error');
    }
    setWorkingKey(null);
  };

  const handleUpdateFileStatus = async (p, statusText) => {
    const cleanStatus = String(statusText || '').trim();
    if (!cleanStatus) {
      showToast?.('Status cannot be empty', 'error');
      return;
    }

    if (cleanStatus === 'Delivered') {
      const remaining = parseFloat(p.Remaining_Amount) || 0;
      if (remaining > 0) {
        showToast?.('Cannot deliver file. Remaining payment of PKR ' + remaining.toLocaleString() + ' must be collected first. Go to Collections page.', 'error');
        return;
      }
    }

    if (panel === 'employee' && cleanStatus === 'Delivered') {
      setDeliveryTarget({ p, status: cleanStatus });
      setDeliveryPhoto(null);
      return;
    }

    await doUpdateFileStatus(p, cleanStatus);
  };

  const doUpdateFileStatus = async (p, statusText, photoDataUrl) => {
    const type = tab === 'plots' ? 'Plot' : 'Shop';
    const number = p[tab === 'plots' ? 'Plot_Number' : 'Shop_Number'];
    const townName = p.Town_Name;
    const key = `${type}|${townName}|${number}`;
    setWorkingKey(key);
    try {
      const r = await window.api.updateFileStatus({
        type,
        number,
        townName,
        status: statusText,
        deliveryImage: photoDataUrl || '',
      });
      if (r?.error) {
        showToast?.(r.error, 'error');
      } else {
        showToast?.('File Status updated successfully!');
        if (photoDataUrl && window.api?.sendFileDeliveryEmail) {
          const pType = tab === 'plots' ? 'Plot' : 'Shop';
          const pNum = p[tab === 'plots' ? 'Plot_Number' : 'Shop_Number'];
          window.api.sendFileDeliveryEmail({
            propertyType: pType,
            propertyNumber: pNum,
            townName: p.Town_Name,
            customerName: p.Customer_Name,
            agentName: p.Agent_Name || agentName,
            deliveryImage: photoDataUrl,
          }).catch(() => {});
        }
        setDeliveryTarget(null);
        setDeliveryPhoto(null);
        await loadData();
      }
    } catch (e) {
      showToast?.('Failed to update status', 'error');
    }
    setWorkingKey(null);
  };

  const handleDeliveryPhotoConfirm = () => {
    if (!deliveryPhoto) {
      showToast?.('Please attach a photo before marking as Delivered', 'error');
      return;
    }
    doUpdateFileStatus(deliveryTarget.p, deliveryTarget.status, deliveryPhoto);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setDeliveryPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  if (loading) return <div className="loading"><div className="spinner" />;</div>;

  const filterByTown = (arr) => townName ? (arr || []).filter(p => p.Town_Name === townName) : (arr || []);
  const filteredPlots = filterByTown(filterByAgent(data.plots));
  const filteredShops = filterByTown(filterByAgent(data.shops));
  const items = tab === 'plots' ? filteredPlots : filteredShops;
  const numKey = tab === 'plots' ? 'Plot_Number' : 'Shop_Number';
  const sizeKey = tab === 'plots' ? 'Plot_Size' : 'Shop_Size';

  return (
    <div>
      {/* Cancel Deal Modal */}
      {cancelCtx && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16
        }}>
          <div className="form-container" style={{ maxWidth: 520, width: '100%' }}>
            <div className="form-title" style={{ fontSize: 15 }}>Deal Cancel</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {cancelCtx.type} {cancelCtx.number} ({cancelCtx.townName})
            </div>
            <div className="form-grid">
              <div className="form-group full">
                <label>Receipt Number *</label>
                <input type="password" placeholder="Enter receipt number to confirm" value={cancelReceipt} onChange={(e) => setCancelReceipt(e.target.value)} />
              </div>
            </div>
            <div className="flex-between mt-6">
              <button className="btn btn-ghost" onClick={() => setCancelCtx(null)} disabled={!!workingKey}>Close</button>
              <button className="btn btn-danger" onClick={confirmCancelDeal} disabled={!!workingKey}>
                {workingKey ? <><ClockIcon size={12}/> Cancelling...</> : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Upload Modal for File Delivery */}
      {deliveryTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16
        }}>
          <div className="form-container" style={{ maxWidth: 480, width: '100%' }}>
            <div className="form-title" style={{ fontSize: 15 }}>📸 File Delivery Photo</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {tab === 'plots' ? 'Plot' : 'Shop'} #{deliveryTarget.p[numKey]} ({deliveryTarget.p.Town_Name})
            </div>
            <div className="form-group full">
              <label>Attach Delivery Photo *</label>
              <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} />
              {deliveryPhoto && (
                <div style={{ marginTop: 10 }}>
                  <img src={deliveryPhoto} alt="Delivery" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid var(--border-color)' }} />
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setDeliveryPhoto(null)}>Remove</button>
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
              Photo is required to mark file as Delivered. It will be sent to CEO.
            </div>
            <div className="flex-between mt-6">
              <button className="btn btn-ghost" onClick={() => { setDeliveryTarget(null); setDeliveryPhoto(null); }}>Cancel</button>
              <button className="btn btn-success" onClick={handleDeliveryPhotoConfirm} disabled={!deliveryPhoto}>
                Confirm Delivery
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`btn ${tab === 'plots' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('plots')}
          style={{display:'flex',alignItems:'center',gap:5}}>
          <PlotIcon size={13}/> Sold Plots ({filteredPlots.length})
        </button>
        <button className={`btn ${tab === 'shops' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('shops')}
          style={{display:'flex',alignItems:'center',gap:5}}>
          <ShopIcon size={13}/> Sold Shops ({filteredShops.length})
        </button>
      </div>

      <div className="table-container">
        <div className="table-header"><h3 style={{display:'flex',alignItems:'center',gap:5}}><SoldIcon size={13}/> Sold {tab === 'plots' ? 'Plots' : 'Shops'}{townName ? ` — ${townName}` : ''}{panel === 'employee' ? ' (My Sales)' : ''} ({items.length})</h3></div>
        {items.length === 0 ? <div className="empty-state"><div className="icon"><SoldIcon size={36}/></div><h3>No Sold Properties</h3><p>Sold properties will appear here.</p></div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Town</th>
                  <th>Customer</th>
                  <th>CNIC</th>
                  <th>Phone</th>
                  <th>Total</th>
                  <th>Received</th>
                  <th>Remaining</th>
                  <th>Installment</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>File Status</th>
                  <th>File Image</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p,i) => {
                  const fileStatus = p.File_Status || 'Not Delivered';

                  return (
                    <tr key={i}>
                      <td style={{fontWeight:600}}>{p[numKey]}</td>
                      <td>{p.Town_Name}</td>
                      <td>{p.Customer_Name}</td>
                      <td>{p.CNIC||'-'}</td>
                      <td>{p.Phone_Number||'-'}</td>
                      <td>PKR {(parseFloat(p.Total_Amount_PKR)||0).toLocaleString()}</td>
                      <td className="text-green">PKR {(parseFloat(p.Received_Amount)||0).toLocaleString()}</td>
                      <td className={(parseFloat(p.Remaining_Amount)||0) > 0 && (parseInt(p.Total_Installments) || 0) === 0 ? 'text-yellow' : 'text-red'}>
                        PKR {(parseFloat(p.Remaining_Amount)||0).toLocaleString()}
                      </td>
                      <td>{p.Installment_Status}</td>
                      <td>{p.Agent_Name||'-'}</td>
                      <td><span className={`status-badge status-${(p.Status||'').toLowerCase()}`}>{p.Status}</span></td>

                      {/* File Status */}
                      <td>
                        <select
                          value={fileStatus}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val !== fileStatus) {
                              handleUpdateFileStatus(p, val);
                            }
                          }}
                          style={{
                            padding: '2px 6px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                            outline: 'none', cursor: 'pointer',
                            background: fileStatus === 'Not Delivered' ? '#FCE8E6' : fileStatus === 'Delivered' ? '#E6F4EA' : '#E8F0FE',
                            color: fileStatus === 'Not Delivered' ? '#C5221F' : fileStatus === 'Delivered' ? '#137333' : '#1A73E8',
                            border: fileStatus === 'Not Delivered' ? '1px solid #FAD2CF' : fileStatus === 'Delivered' ? '1px solid #C4EED0' : '1px solid #D2E3FC',
                          }}
                        >
                          <option value="Not Delivered">Not Delivered</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                      </td>

                      {/* File Image */}
                      <td>
                        {p.File_Delivery_Image ? (
                          <img
                            src={p.File_Delivery_Image}
                            alt="Delivery"
                            style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover', cursor: 'pointer', border: '1px solid var(--border-color)' }}
                            onClick={() => window.open(p.File_Delivery_Image, '_blank')}
                            title="Click to view full image"
                          />
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>

                      <td>
                        {panel !== 'employee' && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleCancelDeal(p)}
                            disabled={workingKey === `${tab === 'plots' ? 'Plot' : 'Shop'}|${p.Town_Name}|${p[numKey]}`}
                          >
                            {workingKey === `${tab === 'plots' ? 'Plot' : 'Shop'}|${p.Town_Name}|${p[numKey]}` ? <><ClockIcon size={12}/></> : 'Deal Cancel'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
