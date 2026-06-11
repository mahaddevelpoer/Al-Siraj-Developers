import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import AppealCard from './AppealCard';

const OTP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export default function AppealDashboard() {
  const { userRole, user } = useAuth();
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [reviewing, setReviewing] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const autoOtpRun = useRef({});

  useEffect(() => {
    if (userRole === 'ceo') {
      loadAppeals();
    }
  }, [userRole, activeFilter]);

  // ⚡ Realtime: auto-refresh + desktop notify on new appeals
  useEffect(() => {
    if (userRole !== 'ceo') return;
    const channel = supabase
      .channel('appeals-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appeals' },
        (payload) => {
          setLoading(true);
          loadAppeals();
          const a = payload.new;
          if (window.api?.showNotification) {
            window.api.showNotification(
              'New Appeal: ' + (a.appeal_type || 'Registration'),
              'Agent needs approval for ' + (a.entity_type || '') + ' ' + (a.entity_id || '')
            );
          }
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'appeals' },
        () => { setLoading(true); loadAppeals(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userRole]);

  const generateOtp = () => Math.random().toString().substring(2, 8);

  const requestOtpForAppeal = async (appeal) => {
    if (!appeal?.id) return;
    if (appeal.status !== 'pending') return;
    if (appeal.otp_code) return;

    const created = new Date(appeal.created_at);
    const elapsed = Date.now() - created.getTime();
    if (elapsed < OTP_TIMEOUT_MS) return;

    if (autoOtpRun.current[appeal.id]) return;
    autoOtpRun.current[appeal.id] = true;

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const { error } = await supabase
      .from('appeals')
      .update({ otp_code: otpCode, otp_expires_at: expiresAt.toISOString() })
      .eq('id', appeal.id);

    if (error) throw error;

    if (window.api?.sendOtpEmail) {
      const name = appeal.requested_by_user_id?.full_name || 'Agent';
      const email = appeal.requested_by_user_id?.email || '';
      await window.api.sendOtpEmail({
        otpCode,
        agentName: name,
        agentEmail: email,
        agentTown: appeal.requested_by_user_id?.agent_town || '',
      });
    }
  };

  const checkAutoOtp = async (appealsList) => {
    for (const appeal of appealsList) {
      try {
        await requestOtpForAppeal(appeal);
      } catch (e) {
        // ignore per-item failures to keep dashboard stable
      }
    }
  };

  const loadAppeals = async () => {
    try {
      const { data, error } = await supabase
        .from('appeals')
        .select('*, requested_by_user_id(*)')
        .eq('status', activeFilter)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAppeals(data || []);

      if (activeFilter === 'pending' && data?.length) {
        checkAutoOtp(data);
      }
    } catch (error) {
      console.error('Error loading appeals:', error);
    } finally {
      setLoading(false);
    }
  };

  // Periodic check for auto-OTP
  useEffect(() => {
    if (activeFilter !== 'pending' || !appeals.length) return;
    const interval = setInterval(() => checkAutoOtp(appeals), 30000);
    return () => clearInterval(interval);
  }, [activeFilter, appeals]);

  const handleAppealReview = async (appealId, newStatus) => {
    setReviewing(appealId);
    setToastMsg(null);
    try {
      const appeal = appeals.find(a => a.id === appealId);
      const updates = {
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: user?.id,
      };

      const { error } = await supabase
        .from('appeals')
        .update(updates)
        .eq('id', appealId);

      if (error) throw error;

      // If accepting an agent_registration appeal, activate the user (but do NOT add to Employees lists)
      if (newStatus === 'approved' && appeal?.appeal_type === 'agent_registration') {
        const userData = appeal.requested_by_user_id;
        const { error: userErr } = await supabase
          .from('users')
          .update({ is_active: true })
          .eq('id', userData?.id);
        if (userErr) console.error('Error activating user:', userErr);
      }

      // If accepting a salary_increase appeal, update the employee's base salary in Excel
      if (newStatus === 'approved' && appeal?.appeal_type === 'salary_increase') {
        const rd = appeal.requested_data || {};
        if (rd.employeeId && rd.proposedSalary && rd.townName) {
          if (window.api?.updateEmployeeV2) {
            window.api.updateEmployeeV2({
              employeeId: rd.employeeId,
              data: { baseSalary: parseFloat(rd.proposedSalary) },
            }).catch(() => {});
          }
        }
      }

      // If accepting a delete_employee appeal, delete the employee in Excel & Supabase
      if (newStatus === 'approved' && appeal?.appeal_type === 'delete_employee') {
        const rd = appeal.requested_data || {};
        if (rd.employeeId && rd.townName) {
          if (window.api?.deleteEmployeeV2) {
            window.api.deleteEmployeeV2({
              employeeId: rd.employeeId,
              townName: rd.townName,
            }).catch(() => {});
          }
        }
      }

      // If accepting a backdated or future daily entry appeal, create the entry now
      if (newStatus === 'approved' &&
        (appeal?.appeal_type === 'backdated_daily_entry' || appeal?.appeal_type === 'future_daily_entry')) {
        const rd = appeal.requested_data || {};
        if (rd.date && rd.townName && window.api?.addDailyEntry) {
          try {
            await window.api.addDailyEntry({
              date: rd.date,
              time: rd.time || '00:00',
              type: rd.type || 'Expense',
              description: rd.description || '',
              amount: parseFloat(rd.amount) || 0,
              townName: rd.townName,
            });
          } catch (e) {
            console.error('Failed to create approved daily entry:', e);
          }
        }
      }

      setToastMsg({ type: 'success', text: `Appeal ${newStatus} successfully!` });
      setTimeout(() => setToastMsg(null), 3000);
      setReviewing(null);
      loadAppeals();
    } catch (error) {
      console.error('Error updating appeal:', error);
      setToastMsg({ type: 'error', text: `Failed to ${newStatus} appeal: ${error.message}` });
      setTimeout(() => setToastMsg(null), 5000);
      setReviewing(null);
    }
  };

  if (userRole !== 'ceo') {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Only CEO can access appeals</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Appeals Dashboard</h2>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {['pending', 'approved', 'rejected'].map(status => (
            <button
              key={status}
              onClick={() => { setActiveFilter(status); setLoading(true); }}
              style={{
                padding: '8px 16px',
                background: activeFilter === status ? 'var(--accent-blue)' : 'var(--border-color)',
                color: activeFilter === status ? 'white' : 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12,
                textTransform: 'capitalize',
              }}
            >
              {status === 'pending' ? '...' : status === 'approved' ? '✓' : '✗'} {status}
            </button>
          ))}
        </div>
      </div>

      {toastMsg && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          padding: '12px 20px', borderRadius: 8,
          background: toastMsg.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: toastMsg.type === 'success' ? '#065f46' : '#991b1b',
          fontWeight: 600, fontSize: 13,
          border: toastMsg.type === 'success' ? '1px solid #6ee7b7' : '1px solid #fecaca',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toastMsg.type === 'success' ? '✓ ' : '✗ '} {toastMsg.text}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⏳ Loading appeals...</div>
      ) : appeals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No {activeFilter} appeals</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
          {appeals.map(appeal => (
            <AppealCard
              key={appeal.id}
              appeal={appeal}
              onReview={handleAppealReview}
              reviewing={reviewing}
              onRequestOtp={requestOtpForAppeal}
            />
          ))}
        </div>
      )}
    </div>
  );
}
