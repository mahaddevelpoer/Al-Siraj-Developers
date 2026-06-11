import { useState } from 'react';

export default function AppealCard({ appeal, onReview, reviewing, onRequestOtp }) {
  const [showContact, setShowContact] = useState(false);

  const requesterData = appeal.requested_by_user_id;

  return (
    <div style={{
      padding: 20,
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-color)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              {appeal.appeal_type === 'backdated_daily_entry' ? 'Backdated Entry Request'
                : appeal.appeal_type === 'future_daily_entry' ? 'Future Date Entry Request'
                : appeal.appeal_type.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
              {requesterData?.full_name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {requesterData?.email}
            </div>
          </div>
          <div style={{
            padding: '4px 12px',
            background: appeal.status === 'pending' ? '#fef3c7' : appeal.status === 'approved' ? '#d1fae5' : '#fee2e2',
            color: appeal.status === 'pending' ? '#92400e' : appeal.status === 'approved' ? '#065f46' : '#991b1b',
            borderRadius: '4px',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            {appeal.status}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
          Changes Requested
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
          {appeal.reason && (
            <div style={{ marginBottom: 8 }}><strong>Reason:</strong> {appeal.reason}</div>
          )}
          {appeal.appeal_type === 'salary_increase' && appeal.requested_data ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ padding: '8px 10px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 10, color: '#991b1b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Current</div>
                <div style={{ fontWeight: 800, color: '#7f1d1d', fontSize: 14 }}>
                  PKR {(parseFloat(appeal.requested_data.currentSalary) || 0).toLocaleString()}
                </div>
              </div>
              <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #86efac' }}>
                <div style={{ fontSize: 10, color: '#166534', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Proposed</div>
                <div style={{ fontWeight: 800, color: '#14532d', fontSize: 14 }}>
                  PKR {(parseFloat(appeal.requested_data.proposedSalary) || 0).toLocaleString()}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-muted)' }}>
                Agent: <strong>{appeal.requested_data.employeeName}</strong> — Town: <strong>{appeal.requested_data.townName}</strong>
              </div>
            </div>
          ) : appeal.appeal_type === 'delete_employee' && appeal.requested_data ? (
            <div style={{ padding: '12px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 10, color: '#991b1b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Request to Delete Employee</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
                {appeal.requested_data.employeeName}
              </div>
              <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 6, lineHeight: 1.5 }}>
                Role/Designation: <strong>{appeal.requested_data.designation || 'Employee'}</strong><br />
                Town: <strong>{appeal.requested_data.townName}</strong>
              </div>
            </div>
          ) : (appeal.appeal_type === 'backdated_daily_entry' || appeal.appeal_type === 'future_daily_entry') && appeal.requested_data ? (
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              background: appeal.appeal_type === 'backdated_daily_entry' ? '#eff6ff' : '#f0fdf4',
              border: appeal.appeal_type === 'backdated_daily_entry' ? '1px solid #bfdbfe' : '1px solid #86efac'
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8,
                color: appeal.appeal_type === 'backdated_daily_entry' ? '#1e40af' : '#166534' }}>
                {appeal.appeal_type === 'backdated_daily_entry' ? 'Backdated' : 'Future'} Daily Ledger Entry
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Date</div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{appeal.requested_data.date}</div>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                  background: appeal.requested_data.type === 'Income' ? '#f0fdf4' : '#fef2f2' }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Type</div>
                  <div style={{ fontWeight: 800, fontSize: 13,
                    color: appeal.requested_data.type === 'Income' ? '#166534' : '#991b1b' }}>
                    {appeal.requested_data.type === 'Income' ? '●' : '●'} {appeal.requested_data.type}
                  </div>
                </div>
              </div>
              <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Description</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{appeal.requested_data.description}</div>
              </div>
              <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Amount</div>
                <div style={{ fontWeight: 800, fontSize: 16,
                  color: appeal.requested_data.type === 'Income' ? '#166534' : '#991b1b' }}>
                  PKR {(parseFloat(appeal.requested_data.amount) || 0).toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                Town: <strong>{appeal.requested_data.townName}</strong>
              </div>
            </div>
          ) : (
            <div><strong>Details:</strong> {appeal.requested_data && Object.keys(appeal.requested_data).length > 0 ? JSON.stringify(appeal.requested_data, null, 2) : 'N/A'}</div>
          )}
        </div>
      </div>

      {appeal.status === 'pending' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => onReview(appeal.id, 'approved')}
            disabled={reviewing === appeal.id}
            className="btn btn-success btn-sm"
          >
            {reviewing === appeal.id ? '...' : 'Accept'}
          </button>
          <button
            onClick={() => onReview(appeal.id, 'rejected')}
            disabled={reviewing === appeal.id}
            className="btn btn-danger btn-sm"
          >
            {reviewing === appeal.id ? '...' : 'Reject'}
          </button>
          <button
            onClick={() => setShowContact(!showContact)}
            disabled={reviewing === appeal.id}
            className="btn btn-primary btn-sm"
          >
            Contact
          </button>
        </div>
      )}

      {showContact && (
        <div style={{ padding: 12, background: '#f0f9ff', borderRadius: 'var(--radius-sm)', marginBottom: 16, border: '1px solid #bae6fd' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0c4a6e', marginBottom: 8 }}>Contact Information</div>
          <div style={{ fontSize: 12, color: '#0f172a', lineHeight: 1.6 }}>
            <div><strong>Name:</strong> {requesterData?.full_name}</div>
            <div><strong>Phone:</strong> {requesterData?.phone_number || 'N/A'}</div>
            <div><strong>Email:</strong> {requesterData?.email}</div>
            {requesterData?.role === 'agent' && (
              <div><strong>Town:</strong> {requesterData?.agent_town}</div>
            )}
          </div>
        </div>
      )}

      {appeal.status === 'pending' && (
        <div style={{
          padding: 12,
          background: 'linear-gradient(135deg, rgba(220,38,38,0.12) 0%, rgba(59,130,246,0.10) 100%)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(148,163,184,0.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>OTP Verification</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Request/Resend OTP to agent for approval.
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Expires in
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#1d4ed8' }}>
                {appeal?.otp_expires_at
                  ? `${Math.max(0, Math.floor((new Date(appeal.otp_expires_at).getTime() - Date.now()) / 1000))}s`
                  : '—'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => onRequestOtp?.(appeal)}
              className="btn btn-primary btn-sm"
              style={{ width: '100%', justifyContent: 'center', display: 'flex' }}
            >
              {appeal?.otp_code ? 'Resend OTP' : 'Request OTP'}
            </button>
          </div>
        </div>
      )}

      {appeal?.otp_code && (
        <div style={{
          marginTop: 12,
          padding: 12,
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>
            OTP Code (share with agent):
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={appeal?.otp_code || ''}
              readOnly
              style={{
                flex: 1,
                padding: '10px 12px',
                background: 'white',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 18,
                fontFamily: 'monospace',
                textAlign: 'center',
                letterSpacing: 3,
                fontWeight: 800,
              }}
            />
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(appeal?.otp_code || '');
                } catch (e) { /* ignore */ }
              }}
              title="Copy OTP"
              style={{ whiteSpace: 'nowrap' }}
            >
              Copy
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
            Valid for ~10 minutes
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
        Created: {new Date(appeal.created_at).toLocaleDateString('en-PK')}
      </div>
    </div>
  );
}
