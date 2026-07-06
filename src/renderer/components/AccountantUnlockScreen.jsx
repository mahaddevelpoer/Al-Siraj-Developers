import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { IconShield, IconEyeOff, IconEye } from './Icons';

const DEFAULT_LOGO = './favicon.ico';

function useLogo() {
  const [logoSrc, setLogoSrc] = useState(DEFAULT_LOGO);
  useEffect(() => {
    if (window.api?.getLogoDataUrl) {
      window.api.getLogoDataUrl().then((res) => {
        if (res?.dataUrl) setLogoSrc(res.dataUrl);
      }).catch(() => {});
    }
  }, []);
  return logoSrc;
}

export default function AccountantUnlockScreen({ onUnlock }) {
  const logoSrc = useLogo();
  const { signIn } = useAuth();

  const savedSession = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('al_siraj_local_accountant_session') || 'null');
    } catch { return null; }
  }, []);

  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const name = savedSession?.profile?.full_name || savedSession?.profile?.email || 'Accountant';
  const town = savedSession?.profile?.town_name || savedSession?.profile?.town_id || '';

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setError('Please enter your administration password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const email = savedSession?.profile?.email || savedSession?.user?.email || '';
      const result = await signIn(email, '', 'accountant', {
        adminPassword,
        offlineUnlock: true,
        remember: true,
      });
      if (!result.success) throw new Error(result.error || 'Invalid administration password');
      if (window.api?.configureFileSyncContext) {
        await window.api.configureFileSyncContext({
          role: 'accountant',
          userId: result.profile?.id,
          accountantTown: result.profile?.town_name || result.profile?.town_id || '',
        }).catch(() => {});
      }
      onUnlock(result.profile);
    } catch (err) {
      setError(err.message || 'Invalid administration password');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('al_siraj_local_accountant_session');
    } catch {}
    window.location.reload();
  };

  return (
    <div className="auth-screen">
      <div className="auth-screen-bg" />
      <div className="unlock-container">
        <div className="unlock-card">
          <div className="unlock-logo-wrap">
            <img src={logoSrc} alt="Logo" className="auth-logo-img" />
          </div>
          <div className="unlock-shield">
            <IconShield size={32} />
          </div>
          <h2 className="unlock-title">Administration Access</h2>
          <p className="unlock-subtitle">Enter your administration password to continue</p>

          {name && (
            <div className="unlock-accountant-info">
              <div className="unlock-info-name">{name}</div>
              {town && <div className="unlock-info-town">{town}</div>}
            </div>
          )}

          <form onSubmit={handleUnlock} className="unlock-form">
            {error && <div className="auth-error">{error}</div>}
            <div className="form-group">
              <label>Administration Password</label>
              <div className="auth-input-wrap">
                <IconShield className="auth-input-icon" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  required
                />
                <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : 'Unlock Dashboard'}
            </button>
          </form>

          <button type="button" className="unlock-logout-btn" onClick={handleLogout}>
            Not {name || 'this user'}? Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
