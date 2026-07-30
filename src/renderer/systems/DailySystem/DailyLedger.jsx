import { useState, useEffect } from 'react';
import DailyIncomeEntry from './DailyIncomeEntry';
import DailyExpenseEntry from './DailyExpenseEntry';
import DailyReceipt from './DailyReceipt';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { createBusinessAppeal, setBusinessAppealOtp } from '../../lib/appeals';
import { IconCalendar, IconIncome, IconExpenseType, IconNote, IconMoney, IconWarning, IconMail, IconLock, IconClipboard, IconHourglass, IconUpload, IconCheck, IconRefresh } from '../../components/Icons';

const fmtPkr = (val) => `PKR ${(val || 0).toLocaleString()}`;

// modalStep: null | 'choose' | 'otp' | 'dashboard'
export default function DailyLedger({ townName, showToast, onEntryAdded, refreshKey = 0, onCustomDateStatusChange }) {
  const { userRole, user } = useAuth();

  const [activeTab, setActiveTab] = useState('income');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [receiptMode, setReceiptMode] = useState(null);
  const [accountOptions, setAccountOptions] = useState([]);

  // Appeal state
  const [modalStep, setModalStep] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [appealId, setAppealId] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const isCustomActive = selectedDate !== todayStr;
    if (typeof onCustomDateStatusChange === 'function') {
      onCustomDateStatusChange({ active: isCustomActive, date: selectedDate });
    }
  }, [selectedDate, todayStr]);
  const isNonToday = userRole === 'accountant' && selectedDate !== todayStr;
  const pendingAppealsKey = `al_siraj_pending_appeals_${townName || 'global'}`;

  const queueLocalPendingAppeal = async (payload) => {
    const now = new Date();
    const item = {
      id: `local-${now.getTime()}`,
      townName,
      type: 'daily_entry_date_change',
      description: `${payload?.type || 'Entry'} for ${payload?.date || 'unknown date'} — PKR ${(payload?.amount || 0).toLocaleString()}`,
      payload,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      nextReminderAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    };
    // Save to localStorage (fast, same-session)
    const old = JSON.parse(localStorage.getItem(pendingAppealsKey) || '[]');
    localStorage.setItem(pendingAppealsKey, JSON.stringify([item, ...old].slice(0, 100)));
    // ALSO persist to Excel so it survives device restart / app close
    try {
      if (window.api?.saveLocalPendingAppeal) {
        await window.api.saveLocalPendingAppeal(item);
      }
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('al-siraj-business-data-changed', {
      detail: { townName, events: ['appeal:pending-local'] },
    }));
    showToast?.('Offline: entry saved in Pending Appeals. It will not affect balance until CEO approval.', 'warning');
  };


  useEffect(() => { loadEntries(); }, [selectedDate, townName, refreshKey]);
  useEffect(() => { loadAccountOptions(); }, [townName, refreshKey]);

  useEffect(() => {
    const refresh = (event) => {
      const detail = event?.detail || {};
      const targetTown = detail.townName || detail.town_name || detail.Town_Name;
      const sameTown = !targetTown || !townName || String(targetTown).trim().toLowerCase() === String(townName).trim().toLowerCase();
      if (sameTown) {
        loadEntries();
        loadAccountOptions();
      }
    };
    window.addEventListener('al-siraj-business-data-changed', refresh);
    window.addEventListener('al-siraj-data-refreshed', refresh);
    return () => {
      window.removeEventListener('al-siraj-business-data-changed', refresh);
      window.removeEventListener('al-siraj-data-refreshed', refresh);
    };
  }, [selectedDate, townName]);

  const addOption = (map, type, name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    const key = `${type}:${clean}`.toLowerCase();
    if (!map.has(key)) map.set(key, { key, type, name: clean, label: `${clean} (${type})` });
  };

  const loadAccountOptions = async () => {
    if (!townName) return;
    try {
      const map = new Map();
      const historyFrom = '2000-01-01';
      const historyTo = new Date().toISOString().slice(0, 10);
      const [report, agents, investors, construction, employees] = await Promise.all([
        window.api?.getTownLedgerReport?.({ townName, fromDate: historyFrom, toDate: historyTo }).catch(() => null),
        window.api?.getTownAgents?.(townName).catch(() => []),
        window.api?.getInvestors?.(townName).catch(() => []),
        window.api?.getConstructionProjects?.(townName).catch(() => []),
        window.api?.getEmployeesV2?.(townName).catch(() => []),
      ]);
      (report?.customerLedgers || []).forEach((row) => addOption(map, 'Customer', `${row.customer || row.Customer_Name || 'Customer'} - ${row.property || row.Plot_Shop_Number || ''}`));
      (report?.employeeLedgers || []).forEach((row) => addOption(map, 'Employee', row.name));
      (report?.agentLedgers || []).forEach((row) => addOption(map, 'Sales Agent', row.name));
      (report?.investorLedgers || []).forEach((row) => addOption(map, 'Investor', row.name || row.Investor_Name));
      (report?.constructorLedgers || report?.constructionLedgers || []).forEach((row) => addOption(map, 'Constructor', row.name || row.Constructor_Name));
      (Array.isArray(agents) ? agents : []).forEach((row) => addOption(map, 'Sales Agent', row.Agent_Name));
      (Array.isArray(investors) ? investors : []).forEach((row) => addOption(map, 'Investor', row.Investor_Name));
      (Array.isArray(construction) ? construction : []).forEach((row) => addOption(map, 'Constructor', row.Constructor_Name));
      (Array.isArray(employees) ? employees : []).forEach((row) => addOption(map, 'Employee', row.Employee_Name));
      setAccountOptions(Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label)));
    } catch {
      setAccountOptions([]);
    }
  };

  // Realtime: CEO approved/rejected from Dashboard
  // Keep the channel alive for the life of the appealId — NOT gated on modalStep.
  // This ensures the entry is saved to local Excel even if the user closed the modal.
  useEffect(() => {
    if (!appealId) return;
    const ch = supabase.channel(`daily-appeal-${appealId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appeals', filter: `id=eq.${appealId}` },
        async (p) => {
          if (p.new.status === 'approved') {
            showToast?.('CEO approved. Saving entry...');
            setModalStep(null);
            await submitEntryToApi({ ...pendingPayload, reviewStatus: 'approved', approvalId: appealId });
          } else if (p.new.status === 'rejected') {
            window.api?.showNotification?.('Daily Entry Rejected', `${pendingPayload?.type || 'Entry'} ${pendingPayload?.date || ''} was rejected by CEO`);
            showToast?.('CEO rejected the appeal', 'error');
            setModalStep(null);
          }
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [appealId]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const data = await window.api.getDailyEntries({ date: selectedDate, townName });
      if (Array.isArray(data)) setEntries(data);
    } catch { showToast?.('Failed to load entries', 'error'); }
    setLoading(false);
  };

  const submitEntryToApi = async (payload) => {
    try {
      let nextPayload = payload;
      if (payload?.collectionPayload?.saleId) {
        const collected = await window.api.recordPendingCollection(payload.collectionPayload);
        if (collected?.error) {
          showToast?.(collected.error, 'error');
          return;
        }
        nextPayload = {
          ...payload,
          skipLedger: 'Yes',
          Skip_Ledger: 'Yes',
          reference: `COL-${payload.collectionPayload.saleId}-${Date.now()}`,
          description: payload.description || `Collection received from ${payload.collectionPayload.customerName || payload.accountName || 'customer'}`,
        };
      }
      if (payload?.installmentPaymentPayload?.Tracker_ID) {
        const paid = await window.api.markInstallmentPaid(payload.installmentPaymentPayload);
        if (paid?.error) {
          showToast?.(paid.error, 'error');
          return;
        }
        nextPayload = {
          ...payload,
          skipLedger: 'Yes',
          Skip_Ledger: 'Yes',
          reference: `INST-${payload.installmentPaymentPayload.Tracker_ID}-${Date.now()}`,
          description: payload.description || `Installment received from ${payload.accountName || 'customer'}`,
        };
      }
      const r = await window.api.addDailyEntry(nextPayload);
      if (r?.error) showToast?.(r.error, 'error');
      else {
        showToast?.('Entry saved');
        setSelectedDate(new Date().toISOString().split('T')[0]);
        await loadEntries();
        onEntryAdded?.();
      }
    } catch { showToast?.('Failed to add entry', 'error'); }
  };

  // Child form calls this - intercept if accountant + non-today
  const handleAddEntry = async (data) => {
    const timeStr = new Date().toTimeString().split(' ')[0].substring(0, 5);
    const payload = { ...data, townName, date: selectedDate, time: timeStr };

    if (userRole === 'accountant' && selectedDate !== todayStr) {
      if (!navigator.onLine) {
        queueLocalPendingAppeal(payload);
        return;
      }
      setPendingPayload(payload);
      setModalStep('choose');
      setOtpInput('');
      setOtpSent(false);
      setAppealId(null);
      return;
    }
    await submitEntryToApi(payload);
  };

  // Create appeal record (without OTP) and go to OTP step
  const handleChooseOtp = async () => {
    setBusy(true);
    try {
      const isFuture = selectedDate > todayStr;
      const { data, error } = await createBusinessAppeal({
        requested_by_user_id: user?.id,
        requested_by_role: 'accountant',
        appeal_type: isFuture ? 'future_daily_entry' : 'backdated_daily_entry',
        entity_type: 'daily_entry',
        entity_id: 'pending_' + Date.now(),
        town_name: townName,
        requested_data: { ...pendingPayload, townName },
        status: 'pending',
      });
      if (error) throw error;
      setAppealId(data.id);
      setModalStep('otp');
    } catch (e) { showToast?.('Could not create appeal: ' + e.message, 'error'); }
    setBusy(false);
  };

  // Create appeal record and go to Dashboard-wait step
  const handleChooseDashboard = async () => {
    setBusy(true);
    try {
      const isFuture = selectedDate > todayStr;
      const { data, error } = await createBusinessAppeal({
        requested_by_user_id: user?.id,
        requested_by_role: 'accountant',
        appeal_type: isFuture ? 'future_daily_entry' : 'backdated_daily_entry',
        entity_type: 'daily_entry',
        entity_id: 'pending_' + Date.now(),
        town_name: townName,
        requested_data: { ...pendingPayload, townName },
        status: 'pending',
      });
      if (error) throw error;
      setAppealId(data.id);
      setModalStep('dashboard');
    } catch (e) { showToast?.('Could not create appeal: ' + e.message, 'error'); }
    setBusy(false);
  };

  // Generate fresh OTP, save to Supabase, send email NOW
  const handleSendOtp = async () => {
    if (!appealId) return;
    setBusy(true);
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const { error } = await setBusinessAppealOtp(appealId, code, expiresAt.toISOString());
      if (error) throw error;

      // Send email to CEO
      if (window.api?.sendDailyEntryOtpEmail) {
        const res = await window.api.sendDailyEntryOtpEmail({
          otpCode: code,
          accountantName: user?.user_metadata?.full_name || user?.email || 'Accountant',
          townName,
          entryDate: pendingPayload?.date,
          entryType: pendingPayload?.type || 'Entry',
          amount: pendingPayload?.amount,
          description: pendingPayload?.description,
        });
        if (res?.error) throw new Error(res.error);
      }

      setOtpSent(true);
      showToast?.('OTP sent to CEO email successfully');
    } catch (e) { showToast?.('Failed to send OTP: ' + e.message, 'error'); }
    setBusy(false);
  };

  // Verify OTP entered by accountant
  const handleVerifyOtp = async () => {
    if (!otpInput.trim()) { showToast?.('Enter the OTP code first', 'error'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.from('appeals')
        .select('otp_code, otp_expires_at, status')
        .eq('id', appealId).single();
      if (error || !data) throw new Error('Appeal not found');
      if (!data.otp_code) throw new Error('OTP not generated yet - click "Send OTP to CEO" first');
      if (new Date(data.otp_expires_at) < new Date()) throw new Error('OTP expired - click "Resend OTP" to get a new one');
      if (String(data.otp_code).trim() !== otpInput.trim()) throw new Error('Incorrect OTP - please check and try again');

      showToast?.('OTP verified. Waiting for CEO approval from dashboard/app.');
      setOtpInput('');
      setModalStep('dashboard');
    } catch (e) { showToast?.(e.message, 'error'); }
    setBusy(false);
  };

  const handleDeleteEntry = async (entryId) => {
    const entry = entries.find(e => e.Entry_ID === entryId);
    if (!entry) return;

    if (userRole === 'accountant') {
      setConfirmModal({
        message: `Deleting this daily entry requires CEO approval. Submit a deletion appeal to the CEO's dashboard?`,
        onConfirm: async () => {
          setConfirmModal(null);
          const payload = {
            appeal_type: 'delete_daily_entry',
            entity_type: 'daily_entry',
            entity_id: entryId,
            town_name: townName,
            reason: 'Daily Entry Deletion Request',
            requested_data: {
              entryId,
              townName,
              amount: parseFloat(entry.Amount) || 0,
              type: entry.Type,
              date: entry.Date,
              description: entry.Description,
              accountName: entry.Account_Name
            }
          };

          if (!navigator.onLine) {
            queueLocalPendingAppeal(payload);
          } else {
            try {
              const { data, error } = await createBusinessAppeal(payload);
              if (error) {
                showToast?.('Could not create deletion appeal: ' + error.message, 'error');
                return;
              }
              showToast?.('Deletion appeal submitted to CEO dashboard successfully!');
            } catch (e) {
              showToast?.('Failed to submit deletion appeal: ' + e.message, 'error');
            }
          }
        },
        onCancel: () => setConfirmModal(null)
      });
      return;
    }

    setConfirmModal({
      message: 'Delete this entry?',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const r = await window.api.deleteDailyEntry({ entryId });
          if (r?.error) showToast?.(r.error, 'error');
          else { showToast?.('Deleted!'); await loadEntries(); }
        } catch { showToast?.('Failed to delete', 'error'); }
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  const closeModal = () => { setModalStep(null); setPendingPayload(null); };

  const totalIncome = entries.filter(e => String(e.Type || e.type || '').toLowerCase() === 'income').reduce((s, e) => s + (parseFloat(e.Amount) || 0), 0);
  const totalExpense = entries.filter(e => String(e.Type || e.type || '').toLowerCase() === 'expense').reduce((s, e) => s + (parseFloat(e.Amount) || 0), 0);
  const netAmount = totalIncome - totalExpense;
  const cleanCell = (value) => {
    const text = String(value ?? '').trim();
    return text && text !== '-' && text !== '-' ? text : '';
  };
  const entryTime = (e) => cleanCell(e.Time) || cleanCell(e.time) || (e.Created_At ? new Date(e.Created_At).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');
  const entryAccount = (e) => cleanCell(e.Account_Name) || cleanCell(e.accountName) || cleanCell(e.Payment_Account_Name) || cleanCell(e.paymentAccountName) || 'Cash in Hand';

  // Shared entry summary pill used in multiple modals
  const EntrySummary = ({ payload }) => (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>Entry Details</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>DATE</span>
          <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconCalendar size={12} /> {payload?.date}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>TYPE</span>
          <strong style={{ color: payload?.type === 'Income' ? '#137333' : '#C5221F' }}>
            {payload?.type === 'Income' ? <IconIncome size={12} /> : <IconExpenseType size={12} />} {payload?.type}
          </strong>
        </div>
        <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>DESCRIPTION</span>
          <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconNote size={12} /> {payload?.description}</strong>
        </div>
        <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>AMOUNT</span>
          <strong style={{ fontSize: 16, color: payload?.type === 'Income' ? '#137333' : '#C5221F' }}>
            <IconMoney size={14} /> PKR {(payload?.amount || 0).toLocaleString()}
          </strong>
        </div>
      </div>
    </div>
  );

  return (
    <div className="daily-ledger-shell" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Warning banner - accountant picked non-today date */}
      {isNonToday && (
        <div style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #f59e0b', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 10px rgba(245,158,11,0.18)' }}>
          <span style={{ fontSize: 26 }}><IconWarning size={26} /></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>
              CEO Approval Required - {selectedDate > todayStr ? 'Future' : 'Past'} Date Selected
            </div>
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 3, lineHeight: 1.5 }}>
              You selected <strong>{selectedDate}</strong>. Accountants can only add entries for <strong>today ({todayStr})</strong> without approval. A CEO approval popup will open when you submit.
            </div>
          </div>
        </div>
      )}

      {/* Date Header */}
      <div className="daily-ledger-head" style={{ background: 'var(--bg-card)', border: isNonToday ? '2px solid #f59e0b' : '1px solid var(--border-color)', borderRadius: 16, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Daily Cash Ledger</h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Log and audit cash transactions</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Select Date:</label>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: isNonToday ? '2px solid #f59e0b' : '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', fontSize: 13, fontWeight: 600 }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="daily-ledger-tabs" style={{ display: 'flex', gap: 12, borderBottom: '2px solid var(--border-color)', paddingBottom: 16 }}>
        {[['income', 'Daily Income', 'var(--accent-green)'], ['expense', 'Daily Expense', 'var(--accent-red)']].map(([key, label, color]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ padding: '10px 20px', background: 'transparent', border: 'none', borderBottom: activeTab === key ? `3px solid ${color}` : 'none', color: activeTab === key ? color : 'var(--text-secondary)', cursor: 'pointer', fontWeight: activeTab === key ? 700 : 600, fontSize: 14, transition: 'all 0.15s' }}>{label}</button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="daily-ledger-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>

        {/* Left: Forms */}
        <div className="daily-ledger-form-column" style={{ height: 'fit-content', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: activeTab === 'income' ? 'block' : 'none' }}>
            <DailyIncomeEntry townName={townName} onSubmit={handleAddEntry} isAppealMode={isNonToday} accountOptions={accountOptions} />
          </div>
          <div style={{ display: activeTab === 'expense' ? 'block' : 'none' }}>
            <DailyExpenseEntry townName={townName} onSubmit={handleAddEntry} isAppealMode={isNonToday} accountOptions={accountOptions} />
          </div>
          {isNonToday && (
            <div style={{ padding: '10px 14px', background: '#fff7ed', border: '1px dashed #f59e0b', borderRadius: 10, fontSize: 11, color: '#92400e', lineHeight: 1.6 }}>
               <strong><IconMail size={12} /> Appeal Mode:</strong> Submitting opens CEO approval popup.
            </div>
          )}
        </div>

        {/* Right: Summary + Table */}
        <div className="daily-ledger-log-column" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="daily-ledger-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[['Total Income', fmtPkr(totalIncome), '#E6F4EA', '#C4EED0', '#137333'], ['Total Expense', fmtPkr(totalExpense), '#FCE8E6', '#FAD2CF', '#C5221F'], ['Net Balance', fmtPkr(netAmount), netAmount >= 0 ? '#E8F0FE' : '#FEF7E0', netAmount >= 0 ? '#D2E3FC' : '#FDE293', netAmount >= 0 ? '#1A73E8' : '#B06000']].map(([label, val, bg, border, color]) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</span>
                <strong style={{ fontSize: 18, color }}>{val}</strong>
              </div>
            ))}
          </div>

          <div className="daily-ledger-table-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: 13 }}>Entries Log ({entries.length})</div>
            {loading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
            ) : entries.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No entries for {selectedDate}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      {['Time', 'Type', 'Account', 'Description', 'Amount', 'Action'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Amount' ? 'right' : h === 'Action' ? 'center' : 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', transition: 'all 0.1s' }}
                        onMouseEnter={el => { el.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={el => { el.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{entryTime(e)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: String(e.Type || e.type || '').toLowerCase() === 'income' ? '#E6F4EA' : '#FCE8E6', color: String(e.Type || e.type || '').toLowerCase() === 'income' ? '#137333' : '#C5221F', border: String(e.Type || e.type || '').toLowerCase() === 'income' ? '1px solid #C4EED0' : '1px solid #FAD2CF' }}>{e.Type || e.type}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {entryAccount(e)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>{e.Description}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: String(e.Type || e.type || '').toLowerCase() === 'income' ? '#137333' : '#C5221F' }}>{fmtPkr(e.Amount)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button onClick={() => handleDeleteEntry(e.Entry_ID)} style={{ padding: '4px 10px', border: 'none', background: 'transparent', color: '#C5221F', cursor: 'pointer', fontSize: 11, fontWeight: 600, borderRadius: 4 }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {entries.length > 0 && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
              <button className="btn btn-success" onClick={() => setReceiptMode('income')} style={{ fontSize: 12 }}>Income Receipt</button>
              <button className="btn btn-danger" onClick={() => setReceiptMode('expense')} style={{ fontSize: 12 }}>Expense Receipt</button>
              <button className="btn btn-primary" onClick={() => setReceiptMode('full')} style={{ fontSize: 12 }}>Full Day Receipt</button>
            </div>
          )}
        </div>
      </div>

      {receiptMode && <DailyReceipt entries={entries} date={selectedDate} townName={townName} mode={receiptMode} onClose={() => setReceiptMode(null)} />}

      {/* ==============================================
          MODAL 1: Choose Approval Method
          ============================================== */}
      {modalStep === 'choose' && (
        <div className="ui-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="ui-modal-shell" style={{ maxWidth: 500 }}>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 12px' }}><IconLock size={26} /></div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>CEO Approval Required</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                You're trying to add a <strong>{selectedDate > todayStr ? 'future' : 'past'} date</strong> entry for <strong>{townName}</strong>.
                As an Accountant, you need CEO approval. Choose how to request it:
              </p>
            </div>

            <EntrySummary payload={pendingPayload} />

            {/* Two method cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <button onClick={handleChooseOtp} disabled={busy}
                style={{ padding: '20px 14px', borderRadius: 14, border: '2px solid #6366f1', background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', cursor: 'pointer', textAlign: 'center', transition: 'transform 0.2s, box-shadow 0.2s', opacity: busy ? 0.7 : 1 }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}><IconMail size={28} /></div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#3730a3', marginBottom: 6 }}>Via OTP</div>
                <div style={{ fontSize: 11, color: '#4338ca', lineHeight: 1.5 }}>CEO receives a one-time code by email. You enter that code here to approve instantly.</div>
              </button>

              <button onClick={handleChooseDashboard} disabled={busy}
                style={{ padding: '20px 14px', borderRadius: 14, border: '2px solid #0891b2', background: 'linear-gradient(135deg, #ecfeff, #cffafe)', cursor: 'pointer', textAlign: 'center', transition: 'transform 0.2s, box-shadow 0.2s', opacity: busy ? 0.7 : 1 }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(8,145,178,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}><IconClipboard size={28} /></div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#164e63', marginBottom: 6 }}>Via Dashboard</div>
                <div style={{ fontSize: 11, color: '#0e7490', lineHeight: 1.5 }}>CEO sees your request in the Appeals section and approves or rejects with one click.</div>
              </button>
            </div>

            {busy && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><IconHourglass size={12} /> Processing...</div>}
            <button className="btn btn-ghost" onClick={closeModal} disabled={busy} style={{ width: '100%' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ==============================================
          MODAL 2a: OTP Flow
          ============================================== */}
      {modalStep === 'otp' && (
        <div className="ui-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="ui-modal-shell" style={{ maxWidth: 440 }}>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 12px' }}><IconMail size={26} /></div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>OTP Verification</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                This OTP is to approve a <strong>{selectedDate > todayStr ? 'future' : 'backdated'} daily entry</strong> for <strong>{townName}</strong> on <strong>{pendingPayload?.date}</strong>.
                The CEO must authorize this request.
              </p>
            </div>

            <EntrySummary payload={pendingPayload} />

            {!otpSent ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
                  Click below to send a <strong>6-digit OTP</strong> to the CEO's registered email address.
                  The code will be valid for <strong>10 minutes</strong>.
                </p>
                <button className="btn btn-primary" style={{ width: '100%', padding: '13px', fontSize: 14, marginBottom: 12 }} onClick={handleSendOtp} disabled={busy}>
                  {busy ? <><IconHourglass size={14} /> Sending OTP...</> : <><IconUpload size={14} /> Send OTP to CEO Email</>}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#166534', fontWeight: 600 }}>
                  <IconCheck size={14} /> OTP sent to CEO's email! Ask them for the 6-digit code.
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>Enter 6-Digit OTP Code</label>
                  <input
                    value={otpInput}
                    onChange={e => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    placeholder="_ _ _ _ _ _"
                    style={{ width: '100%', fontSize: 30, letterSpacing: 12, textAlign: 'center', fontWeight: 800, padding: '14px', borderRadius: 10, border: '2px solid #6366f1', outline: 'none', background: 'var(--bg-input)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
                <button className="btn btn-primary" style={{ width: '100%', padding: '13px', fontSize: 14, marginBottom: 10 }} onClick={handleVerifyOtp} disabled={busy || otpInput.length !== 6}>
                  {busy ? <><IconHourglass size={14} /> Verifying...</> : <><IconCheck size={14} /> Verify OTP & Save Entry</>}
                </button>
                <button className="btn btn-ghost" style={{ width: '100%', fontSize: 12, marginBottom: 12 }} onClick={handleSendOtp} disabled={busy}>
                  {busy ? 'Resending...' : <><IconRefresh size={12} /> Resend OTP</>}
                </button>
              </div>
            )}

            <button className="btn btn-ghost" onClick={closeModal} disabled={busy} style={{ width: '100%', opacity: 0.7 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ==============================================
          MODAL 2b: Dashboard Appeal - waiting for CEO
          ============================================== */}
      {modalStep === 'dashboard' && (
        <div className="ui-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="ui-modal-shell" style={{ maxWidth: 440 }}>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #ecfeff, #a5f3fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 12px' }}><IconClipboard size={26} /></div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>Appeal Submitted!</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                Your request to add a <strong>{selectedDate > todayStr ? 'future' : 'backdated'} daily entry</strong> for <strong>{townName}</strong> has been sent to the CEO's Appeals Dashboard.
                This window will close automatically when the CEO responds.
              </p>
            </div>

            <EntrySummary payload={pendingPayload} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 20 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Waiting for CEO response...</div>
                <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>CEO can approve or reject from the Appeals Dashboard section.</div>
              </div>
            </div>

            <button className="btn btn-ghost" onClick={closeModal} style={{ width: '100%' }}>
              Close (appeal stays active)
            </button>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)} style={{zIndex: 9999}}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:440,padding:24}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700}}>Confirm Action</h3>
            <p style={{margin:'0 0 20px',color:'var(--text-secondary)',fontSize:14,lineHeight:1.6}}>{confirmModal.message}</p>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={confirmModal.onCancel}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmModal.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

