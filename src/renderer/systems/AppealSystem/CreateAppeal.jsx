import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function CreateAppeal({ entityId, entityType, currentData, onClose, onSuccess }) {
  const { user } = useAuth();
  const [appealType, setAppealType] = useState('date_change');
  const [reason, setReason] = useState('');
  const [requestedData, setRequestedData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: insertError } = await supabase
        .from('appeals')
        .insert([{
          requested_by_user_id: user.id,
          requested_by_role: 'agent',
          appeal_type: appealType,
          entity_type: entityType,
          entity_id: entityId,
          original_data: currentData,
          requested_data: requestedData,
          reason,
          status: 'pending',
        }]);

      if (insertError) throw insertError;

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        padding: 30,
        maxWidth: 500,
        width: '100%',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>📝 Request Change</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Submit a request to CEO for approval
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Type of Change</label>
            <select
              value={appealType}
              onChange={(e) => setAppealType(e.target.value)}
            >
              <option value="date_change">📅 Date Change</option>
              <option value="amount_change">💰 Amount Change</option>
              <option value="other">📋 Other</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Why do you need this change?"
              style={{ minHeight: 80 }}
            />
          </div>

          {appealType === 'date_change' && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>New Date</label>
              <input
                type="date"
                onChange={(e) => setRequestedData({ ...requestedData, newDate: e.target.value })}
              />
            </div>
          )}

          {appealType === 'amount_change' && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>New Amount (PKR)</label>
              <input
                type="number"
                onChange={(e) => setRequestedData({ ...requestedData, newAmount: parseFloat(e.target.value) })}
              />
            </div>
          )}

          {error && (
            <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12 }}>
              ❌ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ flex: 1, padding: '10px', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? '⏳ Submitting...' : '✅ Submit Appeal'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost"
              style={{ flex: 1, padding: '10px' }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
