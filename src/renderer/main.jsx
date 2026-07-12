import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showFatalRendererError(error, title = 'App Recovery') {
  const root = document.getElementById('root');
  if (root) {
    const message = escapeHtml(error?.stack || error?.message || error || 'Unknown error');
    root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#f8fbff;color:#0f172a;font-family:Inter,Segoe UI,Arial,sans-serif;padding:24px">
      <div style="width:min(560px,100%);background:#fff;border:1px solid #dbeafe;box-shadow:0 24px 70px rgba(15,23,42,.12);padding:26px;border-radius:18px">
        <div style="width:48px;height:48px;border-radius:14px;background:#1455d9;color:white;display:grid;place-items:center;font-weight:900;margin-bottom:14px">AS</div>
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">${escapeHtml(title)}</h2>
        <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.6">The software has entered screen recovery mode. Reloading usually clears the issue; if it's still stuck, reset the saved workspace state.</p>
        <details style="margin-bottom:16px">
          <summary style="cursor:pointer;color:#2563eb;font-weight:700;font-size:13px">Technical error</summary>
          <pre style="background:#fef2f2;padding:14px;border-radius:10px;border:1px solid #fecaca;white-space:pre-wrap;font-size:12px;max-height:220px;overflow:auto">${message}</pre>
        </details>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button id="as-reload" style="border:0;background:#1455d9;color:white;padding:10px 14px;border-radius:10px;font-weight:800;cursor:pointer">Reload App</button>
          <button id="as-reset" style="border:1px solid #bfdbfe;background:white;color:#1d4ed8;padding:10px 14px;border-radius:10px;font-weight:800;cursor:pointer">Reset Saved Screen</button>
        </div>
      </div>
    </div>`;
    document.getElementById('as-reload')?.addEventListener('click', () => window.location.reload());
    document.getElementById('as-reset')?.addEventListener('click', () => {
      try {
        localStorage.removeItem('zameen_panel');
        localStorage.removeItem('zameen_page');
        localStorage.removeItem('zameen_selected_town');
      } catch {}
      window.location.reload();
    });
  }
}

window.addEventListener('error', (e) => {
  showFatalRendererError(e.error || e.message, 'Renderer Error');
});

window.addEventListener('unhandledrejection', (e) => {
  showFatalRendererError(e.reason || 'Unhandled promise rejection', 'Async Error');
});

setTimeout(() => {
  const root = document.getElementById('root');
  if (!root) return;
  const text = String(root.textContent || '').trim();
  if (!root.children.length || !text) {
    showFatalRendererError('Startup took too long and rendered no visible UI.', 'Startup Recovery');
  }
}, 12000);

function installInputFocusRecovery() {
  const isEditable = (node) => {
    if (!node || !(node instanceof HTMLElement)) return false;
    const tag = node.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable;
  };

  const focusEditable = (target) => {
    if (!isEditable(target)) return;
    if (target.disabled || target.readOnly) return;
    try {
      target.focus({ preventScroll: true });
      if (target.tagName?.toLowerCase() === 'input' && ['text', 'search', 'email', 'tel', 'number', 'password'].includes(target.type || 'text')) {
        const len = String(target.value || '').length;
        target.setSelectionRange?.(len, len);
      }
    } catch {
      try { target.focus(); } catch {}
    }
  };

  const cleanupGlobalFocusState = () => {
    try {
      document.body.style.pointerEvents = '';
      document.documentElement.style.pointerEvents = '';
      document.getElementById('root')?.removeAttribute('inert');
      document.getElementById('root')?.removeAttribute('aria-hidden');
      if (document.activeElement && !document.body.contains(document.activeElement)) {
        document.body.focus();
      }
    } catch {}
  };

  document.addEventListener('pointerdown', (event) => {
    cleanupGlobalFocusState();
    focusEditable(event.target);
  }, true);

  document.addEventListener('click', (event) => {
    cleanupGlobalFocusState();
    setTimeout(() => focusEditable(event.target), 0);
  }, true);

  document.addEventListener('focusin', (event) => {
    cleanupGlobalFocusState();
    focusEditable(event.target);
  }, true);

  document.addEventListener('keydown', () => {
    cleanupGlobalFocusState();
  }, true);

  const observer = new MutationObserver(() => {
    cleanupGlobalFocusState();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

installInputFocusRecovery();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
