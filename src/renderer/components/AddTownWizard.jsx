import React, { useState } from 'react';
import LeafletMap from '../systems/MapSystem/LeafletMap';
import { PlusIcon, SkipIcon, CheckIcon, CrossIcon, ClockIcon } from './Icons';

export default function AddTownWizard({ onSuccess, onClose, showToast }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    Town_Name: '',
    Commission_Rate: '5',
    Status: 'Active',
    Location_Text: '',
    Location_Lat: '',
    Location_Lng: '',
    Total_Plots: '',
    Total_Shops: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const u = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleLocationSelect = (location) => {
    setForm(prev => ({
      ...prev,
      Location_Lat: location.lat.toFixed(6),
      Location_Lng: location.lng.toFixed(6),
    }));
  };

  const canNext = () => {
    if (step === 1) return form.Town_Name.trim().length > 0;
    return true;
  };

  const canSubmit = () => {
    return form.Town_Name.trim().length > 0;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setSubmitting(true);
    try {
      const result = await window.api.addTown({
        Town_Name: form.Town_Name.trim(),
        Commission_Rate: form.Commission_Rate,
        Status: form.Status,
        Location_Text: form.Location_Text,
        Location_Lat: form.Location_Lat,
        Location_Lng: form.Location_Lng,
        Total_Plots: form.Total_Plots,
        Total_Shops: form.Total_Shops,
      });
      if (result?.error) {
        showToast(result.error, 'error');
      } else {
        showToast(`${form.Town_Name} added successfully!`);
        onSuccess();
      }
    } catch (e) {
      showToast('Failed to add town', 'error');
    }
    setSubmitting(false);
  };

  const steps = [
    { num: 1, label: 'Basic Info' },
    { num: 2, label: 'Location' },
    { num: 3, label: 'Properties' },
    { num: 4, label: 'Review' },
  ];

  return (
    <div className="ui-modal-overlay">
      <div className="ui-modal-shell">
        <button className="ui-modal-close-btn" onClick={onClose}><CrossIcon size={12}/></button>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, display:'flex', alignItems:'center', gap:6 }}><PlusIcon size={18}/> Add New Town</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          Set up a new real estate project
        </p>

        {/* Step Indicator */}
        <div className="ui-modal-step-indicator">
          {steps.map((s, i) => (
            <React.Fragment key={s.num}>
              <div className={`ui-modal-step-dot ${step > s.num ? 'done' : step === s.num ? 'active' : ''}`}>
                <div className={`ui-modal-step-circle ${step > s.num ? 'done' : step === s.num ? 'active' : ''}`}>
                  {step > s.num ? <CheckIcon size={12}/> : s.num}
                </div>
                <span style={{ display: i === 0 || i === steps.length - 1 ? 'inline' : 'none' }}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && <div className={`ui-modal-step-line ${step > s.num ? 'done' : ''}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1 — Basic Info */}
        {step === 1 && (
          <div className="step-content">
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Town Name *</label>
              <input
                autoFocus
                placeholder="e.g. Bahria Enclave"
                value={form.Town_Name}
                onChange={u('Town_Name')}
                style={{ fontSize: 15, padding: '12px 14px' }}
              />
            </div>
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
                      {s === 'Active'
                        ? <CheckIcon size={12}/>
                        : <CrossIcon size={10}/>}
                    </span>{' '}{s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Location */}
        {step === 2 && (
          <div className="step-content">
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Optionally add a location for this town. You can skip this step.
            </p>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Location Description</label>
              <input
                placeholder="e.g. Bahria Town Phase 6, Lahore"
                value={form.Location_Text}
                onChange={u('Location_Text')}
              />
            </div>
            <LeafletMap
              onLocationSelect={handleLocationSelect}
              searchEnabled={true}
            />
          </div>
        )}

        {/* Step 3 — Properties */}
        {step === 3 && (
          <div className="step-content">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
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
        )}

        {/* Step 4 — Review */}
        {step === 4 && (
          <div className="step-content">
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Review all details before confirming.
            </p>
            <div className="ui-review-box">
              <div className="review-row"><span className="review-label">Town Name</span><span className="review-value">{form.Town_Name}</span></div>
              <div className="review-row"><span className="review-label">Commission Rate</span><span className="review-value">{form.Commission_Rate}%</span></div>
              <div className="review-row"><span className="review-label">Status</span><span className="review-value">{form.Status}</span></div>
              {form.Location_Text && (
                <div className="review-row"><span className="review-label">Location</span><span className="review-value">{form.Location_Text}</span></div>
              )}
              <div className="review-row"><span className="review-label">Total Plots</span><span className="review-value">{form.Total_Plots || 0}</span></div>
              <div className="review-row"><span className="review-label">Total Shops</span><span className="review-value">{form.Total_Shops || 0}</span></div>
            </div>
            {form.Location_Lat && form.Location_Lng && (
              <div style={{ marginTop: 16 }}>
                <LeafletMap
                  initialLat={parseFloat(form.Location_Lat)}
                  initialLng={parseFloat(form.Location_Lng)}
                  searchEnabled={false}
                  readOnly={true}
                />
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="ui-modal-btn-row">
          <div>
            {step > 1 && (
              <button className="btn" onClick={() => setStep(step - 1)}>
                ← Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step === 2 && (
              <button className="btn btn-ghost" onClick={() => setStep(3)}
                style={{ display:'flex', alignItems:'center', gap:5 }}>
                <SkipIcon size={13}/> Skip
              </button>
            )}
            {step < 4 && (
              <button
                className="btn btn-primary"
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
              >
                Next →
              </button>
            )}
            {step === 4 && (
              <button className="btn btn-success" onClick={handleSubmit} disabled={submitting}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                {submitting
                  ? <><ClockIcon size={13}/> Adding...</>
                  : <><CheckIcon size={13}/> Confirm &amp; Add</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
