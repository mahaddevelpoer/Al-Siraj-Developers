import React, { useState } from 'react';
import { IconShield, IconEyeOff, IconEye } from './Icons';

export default function AdminPasswordConfirm({ isOpen, onClose, onConfirm, title, message }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter your administration password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const saved = JSON.parse(localStorage.getItem('al_siraj_local_accountant_session') || 'null');
      const email = saved?.profile?.email || saved?.user?.email || '';
      const result = await window.api.unlockLocalAccountant({ email, adminPassword: password });
      if (!result?.success) throw new Error(result?.error || 'Invalid administration password');
      setPassword('');
      await onConfirm();
    } catch (err) {
      setError(err.message || 'Invalid administration password');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <div className="admin-password-modal-overlay" onClick={handleClose}>
      <div className="admin-password-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-password-modal-header">
          <IconShield size={24} />
          <h3>{title || 'Confirm Action'}</h3>
        </div>
        {message && <p className="admin-password-modal-message">{message}</p>}
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          <div className="form-group">
            <label>Enter Administration Password to confirm</label>
            <div className="auth-input-wrap">
              <IconShield className="auth-input-icon" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your administration password"
                autoFocus
                required
              />
              <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>
          <div className="admin-password-modal-actions">
            <button type="button" className="auth-wiz-btn auth-wiz-btn--back" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="auth-wiz-btn auth-wiz-btn--submit" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
