import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

window.addEventListener('error', (e) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding:40px;font-family:monospace">
      <h2 style="color:#ef4444">Unhandled Error</h2>
      <pre style="background:#fef2f2;padding:20px;border-radius:8px;border:1px solid #fca5a5;white-space:pre-wrap;font-size:13px;margin-top:12px">
        ${e.error?.stack || e.error?.message || e.message || 'Unknown error'}
      </pre>
    </div>`;
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
