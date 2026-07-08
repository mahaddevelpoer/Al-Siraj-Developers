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
              Please read these terms carefully before using the software.
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

          <Section title="1. Software Purpose">
            AL SIRAJ DEVELOPERS software is developed to help manage real-estate town operations, including towns, plots, shops, sales, installments, remaining payments, accounts, employees, salaries, investors, contractors, agents, receipts, reports, approvals, local Excel records, Supabase/cloud sync, and CEO monitoring. The software is intended to reduce calculation mistakes, improve transparency, maintain records, and help the owner monitor business activity. However, the software is a management and record-keeping tool only. Final business responsibility remains with the Client/Owner/CEO.
          </Section>

          <Section title="2. One-Year Service Support">
            The Developer will provide service support for one year from the date of final handover/installation. This includes fixing software bugs and errors, resolving calculation-related software issues, helping with normal software errors, improving or correcting existing features where required, and providing technical guidance for backup, sync, and usage. This support does not include new major modules not agreed in the original scope, hardware repair, internet service issues, third-party cloud provider outages, data manually altered outside the software, fraudulent activity by employees/accountants/agents/users, or loss caused by misuse, negligence, or wrong business entries. Any new feature, major redesign, extra mobile app feature, extra reporting system, or new business requirement may require separate charges and a separate agreement.
          </Section>

          <Section title="3. Data Storage and Backup">
            The software is designed as a local-first system. Business data may be stored locally through Excel-based files and may also sync with Supabase/cloud services where configured. Local Excel files act as an important local record/cache/backup. Cloud sync depends on internet, Supabase, correct configuration, and third-party service availability. Cloud-side data loss, cloud outage, failed sync, service restriction, account suspension, or third-party provider issue is not the Developer's responsibility. The Developer does not provide an absolute guarantee of zero data loss. The Client must maintain regular backups including software data records, local Excel backups, external drive/USB backups, printed reports where required, and handwritten/manual hard records for important business transactions. The software should not be treated as the only record of the business.
          </Section>

          <Section title="4. No Absolute Data Loss Guarantee">
            The Developer will make reasonable efforts to design the software safely and fix errors/bugs during the service period. However, the Developer does not guarantee that data loss can never occur. Data loss or mismatch may happen due to cloud service failure, internet failure, power failure, system crash, hard disk/SSD failure, Windows corruption, virus or malware, manual deletion of files, wrong use of cleanup scripts, manual editing of Excel/database files, third-party software interference, Supabase or storage provider issue, multiple PCs syncing with conflicting data, or user negligence/misuse. The Developer will help resolve software errors where possible, but the Developer is not financially responsible for business loss, profit loss, property loss, cloud data loss, or loss caused by missing backups.
          </Section>

          <Section title="5. Employee, Accountant, Agent, or User Fraud">
            The software is built to help reduce fraud and manipulation through records, approvals, audit logs, reports, local storage, and CEO monitoring. However, the Developer is not responsible if any accountant, employee, agent, contractor, investor, operator, or other user enters wrong values intentionally, manipulates entries, hides information from the owner, uses another person's login, shares passwords, deletes or changes files outside the software, alters local Excel files manually, misuses offline mode, misuses approval/pending systems, or enters fake receipts or fake records. The Client/Owner/CEO is responsible for staff supervision, accountant monitoring, user permissions, password protection, device security, office discipline, manual verification, and regular audit of reports and accounts. The software can assist in detecting and reducing fraud, but it cannot replace business supervision and legal/accounting control.
          </Section>

          <Section title="6. Manual Alteration of Local Data">
            If any user manually opens, edits, deletes, renames, moves, corrupts, or alters local Excel files, app data files, reports, receipts, configuration files, or synced records outside the software, the Developer will not be responsible for any resulting error, mismatch, data loss, wrong balance, wrong receipt, wrong report, or sync issue. Manual alteration of local data may void support for the affected records unless the Developer is able to repair them separately.
          </Section>

          <Section title="7. Cloud Sync Disclaimer">
            Cloud sync is provided for convenience, backup, monitoring, and CEO mobile app connectivity. Cloud sync depends on third-party services such as Supabase, internet connection, device availability, correct credentials, and proper configuration. The Developer is not responsible for Supabase outage, cloud storage failure, internet failure, failed upload/download caused by network issues, third-party policy changes, account suspension, cloud-side deletion by the Client or their staff, incorrect cloud credentials, delayed sync, or conflicting records created from multiple devices. If cloud sync fails, the software may still save data locally where possible. The Client must regularly verify sync status and backups.
          </Section>

          <Section title="8. Offline Mode Disclaimer">
            The software may support offline work so that the accountant can continue entries when internet is unavailable. Offline data must be synced later when internet is available. Some approval-related actions may remain pending until internet is connected. Pending approvals or unsynced records must be reviewed regularly. The Client/CEO must ensure internet is connected when approvals, reports, or cloud sync are required. Offline mode should not be misused to hide or delay important data. The Developer is not responsible for loss caused by the Client's failure to connect internet, verify pending sync, review pending approvals, or maintain backups.
          </Section>

          <Section title="9. Approval and Pending System">
            Approval systems are designed to reduce manipulation in sensitive actions such as date changes, backdated/future entries, suspicious edits, investor entries, construction entries, and other important changes. Pending items should be reviewed by the CEO/authorized person. Rejected items should not affect totals. Approved items may affect records according to business rules. The CEO/Owner is responsible for reviewing approvals carefully. If the CEO approves a wrong or fraudulent request, the Developer is not responsible for the resulting business loss.
          </Section>

          <Section title="10. Receipts, Reports, and Financial Records">
            Receipts and reports are generated based on the data entered into the software. If wrong data is entered by the user, wrong reports or receipts may be generated. The Developer is not responsible for wrong receipts caused by wrong entries, wrong reports caused by user-entered false data, business decisions made without verification, handwritten record mismatch, or failure to print, save, or backup receipts/reports. The Client should verify important receipts, agreements, payments, balances, and reports manually.
          </Section>

          <Section title="11. Security Responsibilities">
            The Developer will make reasonable efforts to improve software security, including role permissions, audit logs, sync safety, and restricted access. The Client is responsible for keeping devices secure, using strong passwords, not sharing login credentials, restricting accountant/employee access, protecting Windows user accounts, preventing unauthorized file access, preventing malware/virus infection, keeping backups, and keeping internet and cloud accounts secure. The Developer is not responsible for losses caused by weak passwords, shared logins, stolen devices, unauthorized access, virus/malware, or poor office security.
          </Section>

          <Section title="12. Third-Party Services">
            The software may use third-party services, including but not limited to Supabase, Firebase Cloud Messaging, internet services, Windows, PDF tools, storage services, and other libraries/tools. The Developer is not responsible for third-party downtime, pricing changes, service limits, API changes, account bans/suspensions, security incidents caused by third-party platforms, or any policy changes by third-party providers.
          </Section>

          <Section title="13. Client's Duty to Verify">
            The Client/Owner/CEO must regularly verify cash in hand, bank balances, property sales, installments, remaining amounts, salary payments, investor records, contractor payments, agent commissions, receipts, reports, sync status, pending approvals, and backups. The software helps organize and display records, but the Client remains responsible for final verification and business decisions.
          </Section>

          <Section title="14. Limitation of Liability">
            To the maximum extent permitted by law, the Developer shall not be liable for business loss, profit loss, property loss, cloud data loss, employee fraud, accountant fraud, manual data alteration, loss due to missing backups, wrong business decisions, third-party service failure, internet failure, hardware/software failure outside the Developer's control, or indirect, special, accidental, or consequential damages. The Developer's responsibility is limited to fixing software bugs/errors within the agreed one-year service period, where the issue is caused by the software and not by misuse, third-party failure, employee fraud, manual alteration, or lack of backup.
          </Section>

          <Section title="15. Backup Recommendation">
            The Client is strongly advised to maintain regular backups, including daily or weekly local backup, external drive/USB backup, cloud backup where possible, printed/hard copy of important reports, and handwritten/manual register for critical financial/property transactions. The Developer recommends that the Client should not depend only on software records for high-value business matters.
          </Section>

          <Section title="16. Maintenance and Updates">
            During the one-year service period, the Developer may provide fixes, improvements, and updates as required. The Client should not install unofficial modified versions of the software. Any unauthorized modification, reverse engineering, file tampering, or manual code change may void support.
          </Section>

          <Section title="17. Scope of Responsibility">
            The Developer is responsible for software development according to agreed scope, bug fixing during the service period, technical support for software-related issues, and reasonable help in resolving errors. The Developer is not responsible for employee/accountant honesty, business supervision, legal disputes between parties, manual fraud, third-party failures, cloud provider issues, hardware/device failure, internet problems, or data loss caused by missing backups or misuse.
          </Section>

          <Section title="18. Acceptance">
            By installing, using, or continuing to use AL SIRAJ DEVELOPERS software, the Client confirms that they understand the software is a management and record-keeping tool, that no absolute data loss guarantee is provided, that cloud-side loss or third-party failure is not the Developer's responsibility, that employee/accountant fraud is the Client/Owner's responsibility, that they agree to maintain backups and hard/manual records, and that they agree the Developer's role is limited to software support and bug fixing as described in these terms.
          </Section>

          <div style={{
            marginTop: 20, padding: '14px 16px', background: '#f0fdf4',
            border: '1px solid #bbf7d0', borderRadius: 10, color: '#166534', fontSize: 13
          }}>
            <strong>By clicking "I Agree", you acknowledge</strong> that you have read and understood all the
            above terms and conditions and accept them in full.
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
              I have read and understood the Terms and Conditions and agree to them in full.
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
