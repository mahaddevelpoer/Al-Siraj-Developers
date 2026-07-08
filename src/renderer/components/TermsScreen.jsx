import React, { useState } from 'react';

function ShieldSvg() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function TriangleSvg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

export default function TermsScreen({ onAccept }) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);

  const handleScroll = (e) => {
    const bottom = e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 60;
    if (bottom) setScrolledToBottom(true);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg-primary, #f8fafc)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 99999, fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, maxWidth: 680, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.12)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          padding: '28px 28px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', gap: 16,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)'
        }}>
          <div style={{
            width: 54, height: 54, borderRadius: 14, background: '#ef4444',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <ShieldSvg />
          </div>
          <div>
            <h1 style={{ margin: '0 0 5px', fontSize: 22, fontWeight: 800, color: '#fff' }}>
              Software Terms &amp; Legal Agreement
            </h1>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
              Mahad &amp; Mahdi Developers — Please read before using the software
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          onScroll={handleScroll}
          style={{
            padding: '24px 28px', overflowY: 'auto', flex: 1,
            color: '#334155', fontSize: 14, lineHeight: 1.65
          }}
        >
          {/* Warning banner */}
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '14px 16px', marginBottom: 22,
            display: 'flex', gap: 10, color: '#991b1b', alignItems: 'flex-start'
          }}>
            <span style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }}><TriangleSvg /></span>
            <div>
              <strong style={{ display: 'block', marginBottom: 3, fontSize: 13 }}>
                READ CAREFULLY BEFORE CONTINUING
              </strong>
              <span style={{ fontSize: 13 }}>
                The Developer holds zero legal or financial liability for any loss related to this software.
              </span>
            </div>
          </div>

          <Section title="1. Data Loss &amp; Cloud Sync Liability">
            This software uses an <strong>Offline-First dual-write architecture</strong> where local Excel files
            act as the sole source of truth. The Developer is <strong>NOT LIABLE</strong> for any data loss,
            sync conflicts, database overwrites, or corruption resulting from network issues, sudden power
            losses, internet outages, or concurrent edits across multiple devices.
          </Section>

          <Section title="2. Protection Against Employee Fraud &amp; Tampering">
            The Developer is <strong>NOT RESPONSIBLE</strong> for any fraudulent activity, cash skimming, or
            financial manipulation performed by your employees or accountants. Since the software stores data
            locally in Excel files, tampering with these files directly (outside the application) can bypass
            in-app protections. <strong>It is your sole responsibility</strong> as the CEO/Owner to actively
            monitor reports and verify physical cash balances daily.
          </Section>

          <Section title="3. Offline Appeal System Limitations">
            The pending appeal and 24-hour expiry system relies on the local Windows system clock. The
            Developer is <strong>NOT RESPONSIBLE</strong> for any appeal manipulation through system clock
            changes or direct localStorage/JSON file editing by employees.
          </Section>

          <Section title="4. &quot;As Is&quot; Software Agreement">
            The software is delivered <strong>"as is"</strong> without any warranties of uninterrupted
            functionality. Any bugs will be addressed in future updates, but the Developer holds{' '}
            <strong>NO LEGAL OR FINANCIAL RESPONSIBILITY</strong> for consequences arising from software
            errors, crashes, or unexpected behaviors.
          </Section>

          <Section title="5. Confidentiality &amp; Data Ownership">
            All business data entered into this software belongs exclusively to Al Siraj Developers (the
            client). The Developer will not share, sell, or access client data without explicit written
            permission.
          </Section>

          <div style={{
            marginTop: 20, padding: '14px 16px', background: '#f0fdf4',
            border: '1px solid #bbf7d0', borderRadius: 10, color: '#166534', fontSize: 13
          }}>
            <strong>By clicking "I Agree", you acknowledge</strong> that you have read and understood all the
            above terms and that Mahad &amp; Mahdi Developers hold zero legal or financial liability for any
            data loss, employee fraud, or financial discrepancies arising from the use of this software.
          </div>
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '20px 28px', borderTop: '1px solid #e2e8f0', background: '#f8fafc'
        }}>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            cursor: scrolledToBottom ? 'pointer' : 'not-allowed', marginBottom: 16
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              disabled={!scrolledToBottom}
              style={{
                width: 18, height: 18, marginTop: 2, accentColor: '#1d4ed8',
                cursor: scrolledToBottom ? 'pointer' : 'not-allowed', flexShrink: 0
              }}
            />
            <span style={{
              fontSize: 14, fontWeight: 600,
              color: scrolledToBottom ? '#0f172a' : '#94a3b8'
            }}>
              I have read and understood the terms. I agree that Mahad &amp; Mahdi Developers hold
              zero legal liability for any data or financial loss.
              {!scrolledToBottom && (
                <span style={{
                  display: 'block', fontWeight: 400, color: '#ef4444',
                  fontSize: 12, marginTop: 4
                }}>
                  ↑ Scroll to the bottom of the terms to enable this checkbox
                </span>
              )}
            </span>
          </label>

          <button
            disabled={!checked}
            onClick={() => onAccept()}
            style={{
              width: '100%', padding: '15px', borderRadius: 12, border: 'none',
              background: checked
                ? 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)'
                : '#cbd5e1',
              color: checked ? '#fff' : '#64748b',
              fontSize: 15, fontWeight: 700,
              cursor: checked ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s', letterSpacing: '0.5px'
            }}
          >
            {checked ? '✓ I AGREE AND ACCEPT — CONTINUE TO APP' : 'I AGREE AND ACCEPT'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{
        color: '#0f172a', fontWeight: 700, marginBottom: 8,
        fontSize: 14, borderLeft: '3px solid #1d4ed8', paddingLeft: 10
      }} dangerouslySetInnerHTML={{ __html: title }} />
      <p style={{ margin: 0, paddingLeft: 13, color: '#475569' }}>{children}</p>
    </div>
  );
}
