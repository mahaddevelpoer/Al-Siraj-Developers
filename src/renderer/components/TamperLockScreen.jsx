import React, { useState } from 'react';

export default function TamperLockScreen({ userRole, tamperData, onResolve }) {
  const [resolving, setResolving] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');

  const isCEO = userRole === 'ceo';

  const handleResolve = async (action) => {
    // action: 'accept_local' or 'force_sync'
    let pwdToUse = adminPassword;
    
    // CEO bypasses the password requirement
    if (isCEO) {
      pwdToUse = 'ceo123'; // Backend allows this as a fallback for CEO bypass
    } else if (!pwdToUse) {
      setError('Please enter the administration password to proceed.');
      return;
    }
    
    setResolving(true);
    setError('');
    try {
      await onResolve(action, pwdToUse);
    } catch (err) {
      setError(err.message || 'Failed to resolve conflict.');
      setResolving(false);
    }
  };

  return (
    <div className="tamper-lock-overlay">
      <div className="tamper-lock-modal">
        <div className="tamper-header">
          <div className="tamper-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-file-text">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div>
            <h1 className="tamper-title">File Modification Detected</h1>
            <p className="tamper-subtitle">
              {isCEO ? 'Welcome back! We noticed some external updates.' : 'A system file was modified externally.'}
            </p>
          </div>
        </div>
        
        <div className="tamper-details">
          <p>The following file was modified outside of Zameen Khata:</p>
          <div className="tamper-file-path">
            <code>{tamperData?.relPath || 'Unknown File'}</code>
          </div>
          <p className="tamper-timestamp">
            Time of change: {new Date(tamperData?.timestamp || Date.now()).toLocaleString()}
          </p>
        </div>

        <div className="tamper-warning-box">
          <strong>Sync Paused:</strong> To prevent data conflicts, synchronization is paused until you choose how to proceed.
        </div>

        <div className="tamper-resolution">
          {!isCEO && (
            <div className="tamper-password-section">
              <p>Please enter your administration password to authorize these changes:</p>
              <input
                type="password"
                className="input tamper-input"
                placeholder="Administration Password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                disabled={resolving}
              />
            </div>
          )}
          
          {error && <div className="tamper-error">{error}</div>}
          
          <div className="tamper-actions">
            <button 
              className="btn tamper-btn-secondary" 
              onClick={() => handleResolve('force_sync')}
              disabled={resolving}
            >
              Discard Changes & Sync Cloud
            </button>
            <button 
              className="btn tamper-btn-primary" 
              onClick={() => handleResolve('accept_local')}
              disabled={resolving}
            >
              {isCEO ? 'Accept My Changes' : 'Accept Local Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
