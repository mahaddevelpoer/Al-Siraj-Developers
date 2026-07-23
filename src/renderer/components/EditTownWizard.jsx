import React, { useState } from 'react';
import LeafletMap from '../systems/MapSystem/LeafletMap';
import { CrossIcon, CheckIcon, ClockIcon } from './Icons';

export default function EditTownWizard({ town, onSuccess, onClose, showToast }) {
  const [form, setForm] = useState({
    Commission_Rate: String(town.Commission_Rate || ''),
    Status: town.Status || 'Active',
    Location_Text: town.Location_Text || '',
    Location_Lat: town.Location_Lat || '',
    Location_Lng: town.Location_Lng || '',
    Total_Plots: String(town.Total_Plots || ''),
    Total_Shops: String(town.Total_Shops || ''),
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const u = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleLocationSelect = (location) => {
    setForm(prev => ({
      ...prev,
      Location_Lat: location.lat.toFixed(6),
      Location_Lng: location.lng.toFixed(6),
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {};
      if (form.Commission_Rate) payload.Commission_Rate = parseFloat(form.Commission_Rate);
      if (form.Status) payload.Status = form.Status;
      payload.Location_Text = form.Location_Text || '';
      if (form.Location_Lat) payload.Location_Lat = form.Location_Lat;
      if (form.Location_Lng) payload.Location_Lng = form.Location_Lng;
      if (form.Total_Plots) payload.Total_Plots = parseInt(form.Total_Plots);
      if (form.Total_Shops) payload.Total_Shops = parseInt(form.Total_Shops);

      const result = await window.api.updateTown(town.Town_Name, payload);
      if (result?.error) {
        showToast(result.error, 'error');
      } else {
        showToast(`${town.Town_Name} updated successfully!`);
        onSuccess();
      }
    } catch (e) {
      console.error('Update town error:', e);
      showToast('Failed to update town: ' + (e.message || e), 'error');
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    setConfirmModal({
      message: `Are you sure you want to delete "${town.Town_Name}"? This will permanently remove the town and cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setSubmitting(true);
        try {
          const result = await window.api.deleteTown(town.Town_Name);
          if (result?.error) {
            showToast(result.error, 'error');
          } else {
            localStorage.removeItem(`al_siraj_pending_appeals_${town.Town_Name}`);
            showToast(`${town.Town_Name} deleted successfully!`);
            onSuccess();
          }
        } catch (e) {
          showToast('Failed to delete town', 'error');
        }
        setSubmitting(false);
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  return (
    <div className="ui-modal-overlay">
      <div className="ui-modal-shell">
        <button className="ui-modal-close-btn" onClick={onClose}><CrossIcon size={12}/></button>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, display:'flex', alignItems:'center', gap:6 }}>
          Edit Town
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          {town.Town_Name}
        </p>

        <div className="step-content">
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Commission Rate %</label>
            <input
              type="number"
              step="0.1"
              placeholder="5"
              value={form.Commission_Rate}
              onChange={u('Commission_Rate')}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
              Status
            </label>
            <div className="ui-status-select-wrap">
              {['Active', 'Inactive'].map((s) => (
                <div
                  key={s}
                  onClick={() => setForm({ ...form, Status: s })}
                  className={`ui-status-select-option ${form.Status === s ? 'active' : ''}`}
                >
                  <span style={{ display:'inline-flex', alignItems:'center', color: s === 'Active' ? '#10b981' : '#94a3b8' }}>
                    {s === 'Active' ? <CheckIcon size={12}/> : <CrossIcon size={10}/>}
                  </span>{' '}{s}
                </div>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Location Description</label>
            <input
              placeholder="e.g. Bahria Town Phase 6, Lahore"
              value={form.Location_Text}
              onChange={u('Location_Text')}
            />
          </div>

          <LeafletMap
            initialLat={form.Location_Lat ? parseFloat(form.Location_Lat) : 31.5204}
            initialLng={form.Location_Lng ? parseFloat(form.Location_Lng) : 74.3587}
            onLocationSelect={handleLocationSelect}
            searchEnabled={true}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
            <div className="form-group">
              <label>Total Plots</label>
              <input type="number" placeholder="e.g. 200" value={form.Total_Plots} onChange={u('Total_Plots')} />
            </div>
            <div className="form-group">
              <label>Total Shops</label>
              <input type="number" placeholder="e.g. 80" value={form.Total_Shops} onChange={u('Total_Shops')} />
            </div>
          </div>
        </div>

        <div className="ui-modal-btn-row">
          <button className="btn btn-danger" onClick={handleDelete} disabled={submitting}
            style={{ display:'flex', alignItems:'center', gap:5 }}>
            {submitting ? <><ClockIcon size={13}/> Deleting...</> : 'Delete Town'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-success" onClick={handleSubmit} disabled={submitting}
              style={{ display:'flex', alignItems:'center', gap:6 }}>
              {submitting
                ? <><ClockIcon size={13}/> Saving...</>
                : <><CheckIcon size={13}/> Save Changes</>}
            </button>
          </div>
        </div>
      </div>

      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)} style={{zIndex: 9999}}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:440,padding:24}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700}}>Confirm Action</h3>
            <p style={{margin:'0 0 20px',color:'var(--text-secondary)',fontSize:14,lineHeight:1.6}}>{confirmModal.message}</p>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={confirmModal.onCancel}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmModal.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
