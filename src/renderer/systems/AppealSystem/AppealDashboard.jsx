import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { setBusinessAppealOtp } from '../../lib/appeals';
import AppealCard from './AppealCard';

const OTP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export default function AppealDashboard() {
  const { userRole } = useAuth();
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [reviewing, setReviewing] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const autoOtpRun = useRef({});

  useEffect(() => {
    if (userRole === 'ceo') {
      loadAppeals();
    }
  }, [userRole, activeFilter]);

  // Realtime: auto-refresh + desktop notify on new appeals
  useEffect(() => {
    if (userRole !== 'ceo') return;
    let refreshTimer;
    const refreshAppeals = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        setLoading(true);
        loadAppeals(activeFilter);
      }, 120);
    };
    const channel = supabase
      .channel('appeals-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appeals' },
        (payload) => {
          refreshAppeals();
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
        refreshAppeals
      )
      .subscribe();
    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [userRole, activeFilter]);

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

    const { error } = await setBusinessAppealOtp(appeal.id, otpCode, expiresAt.toISOString());

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

  const loadAppeals = async (filter = activeFilter) => {
    try {
      let data = [];
      if (window.api?.getAppeals) {
        const result = await window.api.getAppeals({ status: filter === 'all' ? undefined : filter, limit: 200 });
        if (result?.error) throw new Error(result.error);
        if (result?.success) data = result.data || [];
      } else {
        const res = await supabase
          .from('appeals')
          .select('*')
          .order('created_at', { ascending: false });
        if (res.error) throw res.error;
        const requesterIds = [...new Set((res.data || []).map(a => a.requested_by_user_id).filter(Boolean))];
        let userMap = {};
        if (requesterIds.length) {
          const { data: users } = await supabase
            .from('users')
            .select('id, full_name, email, phone_number, role, town_name, agent_town')
            .in('id', requesterIds);
          if (users) {
            userMap = Object.fromEntries(users.map(u => [u.id, u]));
          }
        }
        data = (res.data || []).map((appeal) => ({
          ...appeal,
          requested_by_user_id: userMap[appeal.requested_by_user_id] || appeal.requested_by_user_id,
        }));
      }

      const rows = data
        .filter((appeal) => normalizeStatus(appeal.status) === filter)
        .map((appeal) => ({
          ...appeal,
          status: normalizeStatus(appeal.status),
        }));
      const unique = Array.from(new Map(rows.map((appeal) => [appeal.id, appeal])).values());
      setAppeals(unique);
      setLoadError(null);

      if (filter === 'pending' && unique.length) {
        checkAutoOtp(unique);
      }
    } catch (error) {
      console.error('Error loading appeals:', error);
      setLoadError(error.message || 'Failed to load appeals');
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
      if (newStatus === 'approved' && requiresTown(appeal) && !appealTownName(appeal)) {
        throw new Error('Town name missing. Reject this appeal and ask user to submit it with a valid town.');
      }
      const { data: reviewResult, error } = await supabase.rpc('ceo_review_appeal', {
        appeal_id: appealId,
        new_status: newStatus,
      });

      if (error) throw error;
      if (reviewResult?.success === false) {
        throw new Error(reviewResult?.message || 'Review failed');
      }

      setAppeals((current) => current.filter((item) => item.id !== appealId));

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

      if (newStatus === 'rejected' &&
        (appeal?.appeal_type === 'backdated_daily_entry' || appeal?.appeal_type === 'future_daily_entry')) {
        const rd = appeal.requested_data || {};
        const accountantEmail = appeal.requested_by_user_id?.email || '';
        window.api?.sendDailyEntryRejectionEmail?.({
          accountantEmail,
          accountantName: appeal.requested_by_user_id?.full_name || accountantEmail || 'Accountant',
          townName: rd.townName,
          entryDate: rd.date,
          entryType: rd.type || 'Entry',
          amount: rd.amount,
          description: rd.description,
          reason: 'Rejected from CEO Appeals Dashboard',
        }).catch(() => {});
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
    <div className="appeal-dashboard">
      <div className="appeal-dashboard-header">
        <div>
          <div className="ui-label">CEO approvals</div>
          <h2>Appeals Dashboard</h2>
        </div>

        <div className="appeal-filter-tabs">
          {['pending', 'approved', 'rejected'].map(status => (
            <button
              key={status}
              onClick={() => { setActiveFilter(status); setLoading(true); }}
              className={`appeal-filter-tab${activeFilter === status ? ' active' : ''}`}
            >
              <span className={`svg-emoji svg-emoji-${status}`} aria-hidden="true" />
              {status}
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
          {toastMsg.text}
        </div>
      )}

      {loading ? (
        <div className="ui-skeleton-stack">
          <div className="ui-skeleton-card" />
          <div className="ui-skeleton-card" />
        </div>
      ) : loadError ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Failed to load appeals
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 16 }}>
            {loadError}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setLoading(true); setLoadError(null); loadAppeals(); }}>
            Retry
          </button>
        </div>
      ) : appeals.length === 0 ? (
        <div className="empty-state ui-empty-offset">
          <span className={`svg-emoji svg-emoji-${activeFilter}`} aria-hidden="true" />
          <h3>No {activeFilter} appeals</h3>
          <p>Reviewed requests move here automatically after CEO action.</p>
        </div>
      ) : (
        <div className="appeal-card-grid">
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

function normalizeStatus(status) {
  const clean = String(status || 'pending').trim().toLowerCase();
  if (clean === 'approved' || clean === 'rejected') return clean;
  return 'pending';
}

function appealTownName(appeal) {
  const rd = appeal?.requested_data || {};
  const profile = appeal?.requested_by_user_id || {};
  return String(
    rd.townName ||
    rd.Town_Name ||
    rd.town_name ||
    rd.town ||
    rd.Town ||
    appeal?.town_name ||
    profile.agent_town ||
    profile.agent_towns ||
    ''
  ).trim();
}

function requiresTown(appeal) {
  const type = appeal?.appeal_type;
  return [
    'agent_registration',
    'backdated_daily_entry',
    'future_daily_entry',
    'date_change',
    'date_change_otp',
    'custom_installment_plan',
    'property_access_request',
    'salary_increase',
    'delete_employee',
  ].includes(type);
}

