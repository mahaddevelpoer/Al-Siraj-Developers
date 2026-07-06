import React, { useState, useEffect } from 'react';
import { BookIcon, PlusIcon, TrashIcon, ClockIcon } from './Icons';
import DailyReceipt from '../systems/DailySystem/DailyReceipt';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { createBusinessAppeal } from '../lib/appeals';
import AdminPasswordConfirm from './AdminPasswordConfirm';

export default function DailyEntries({ showToast, townName }) {
  const { userRole, user } = useAuth();
  
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [appealId, setAppealId] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [pendingEntryPayload, setPendingEntryPayload] = useState(null);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [receiptMode, setReceiptMode] = useState(null);

  const [showAdminConfirm, setShowAdminConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Form State
  const [form, setForm] = useState({
    Date: new Date().toISOString().split('T')[0],
    Time: new Date().toTimeString().split(' ')[0].substring(0, 5),
    Type: 'Income',
    Description: '',
    Amount: '',
  });

  useEffect(() => {
    loadEntries();
  }, [form.Date, townName]);

  const loadEntries = async () => {
    setLoading(true);
    if (window.api) {
      try {
        const data = await window.api.getDailyEntries({ date: form.Date, townName });
        if (Array.isArray(data)) {
          setEntries(data);
        }
      } catch (e) {
        showToast?.('Failed to load daily entries', 'error');
      }
    }
    setLoading(false);
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!form.Description.trim() || !form.Amount) {
      showToast?.('Please fill Description and Amount', 'error');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (userRole === 'accountant' && form.Date !== todayStr) {
      setLoading(true);
      try {
        const payload = {
          date: form.Date,
          time: form.Time,
          type: form.Type,
          description: form.Description,
          amount: parseFloat(form.Amount) || 0,
          townName,
        };

        const generatedOtp = Math.random().toString().substring(2, 8);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        const isFuture = form.Date > todayStr;
        const { data: appealData, error: appealError } = await createBusinessAppeal({
            requested_by_user_id: user?.id,
            requested_by_role: 'accountant',
            appeal_type: isFuture ? 'future_daily_entry' : 'backdated_daily_entry',
            entity_type: 'daily_entry',
            entity_id: 'pending_' + Date.now(),
            town_name: townName,
            requested_data: payload,
            status: 'pending',
            otp_code: generatedOtp,
            otp_expires_at: expiresAt.toISOString(),
          });

        if (appealError) throw appealError;

        setAppealId(appealData.id);
        setPendingEntryPayload(payload);
        setShowOtpModal(true);

        if (window.api?.sendDailyEntryOtpEmail) {
          window.api.sendDailyEntryOtpEmail({
            otpCode: generatedOtp,
            accountantName: user?.user_metadata?.full_name || 'Accountant',
            townName,
            entryDate: form.Date,
            entryType: form.Type,
            amount: form.Amount,
            description: form.Description
          }).catch(console.warn);
        }
      } catch (e) {
        showToast?.('Failed to create appeal', 'error');
      }
      setLoading(false);
      return;
    }

    await submitEntryToApi({
      date: form.Date,
      time: form.Time,
      type: form.Type,
      description: form.Description,
      amount: parseFloat(form.Amount) || 0,
      townName,
    });
  };

  const submitEntryToApi = async (payload) => {
    setLoading(true);
    try {
      const r = await window.api.addDailyEntry(payload);
      if (r?.error) {
        showToast?.(r.error, 'error');
      } else {
        showToast?.('Entry added successfully!');
        setForm(prev => ({
          ...prev,
          Description: '',
          Amount: '',
          Time: new Date().toTimeString().split(' ')[0].substring(0, 5)
        }));
        await loadEntries();
      }
    } catch (e) {
      showToast?.('Failed to add daily entry', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!showOtpModal || !appealId) return;
    const channel = supabase
      .channel(`appeal-${appealId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appeals', filter: `id=eq.${appealId}` }, (payload) => {
        const newStatus = payload.new.status;
        if (newStatus === 'approved') {
           showToast?.('Appeal approved by CEO remotely!');
           setShowOtpModal(false);
           submitEntryToApi(pendingEntryPayload);
        } else if (newStatus === 'rejected') {
           showToast?.('Appeal was rejected by CEO', 'error');
           window.api?.showNotification?.('Daily Entry Rejected', `${pendingEntryPayload?.type || 'Entry'} ${pendingEntryPayload?.date || ''} was rejected by CEO`);
           setShowOtpModal(false);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [showOtpModal, appealId]);

  const verifyOtp = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appeals')
        .select('*')
        .eq('id', appealId)
        .eq('otp_code', otpCode)
        .gt('otp_expires_at', new Date().toISOString())
        .single();
        
      if (error || !data) throw new Error('Invalid or expired OTP');
      
      showToast?.('OTP verified. Waiting for CEO approval from dashboard/app.');
      setOtpCode('');
    } catch (err) {
      showToast?.(err.message, 'error');
    }
    setLoading(false);
  };

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    if (userRole === 'accountant') {
      setPendingDeleteId(entryId);
      setShowAdminConfirm(true);
      return;
    }
    await doDeleteEntry(entryId);
  };

  const doDeleteEntry = async (entryId) => {
    setLoading(true);
    try {
      const r = await window.api.deleteDailyEntry({ entryId });
      if (r?.error) {
        showToast?.(r.error, 'error');
      } else {
        showToast?.('Entry deleted!');
        await loadEntries();
      }
    } catch (e) {
      showToast?.('Failed to delete entry', 'error');
    }
    setLoading(false);
  };

  // Calculations for Today's Summary
  const totalIncome = entries
    .filter(e => e.Type === 'Income')
    .reduce((sum, e) => sum + (parseFloat(e.Amount) || 0), 0);

  const totalExpense = entries
    .filter(e => e.Type === 'Expense')
    .reduce((sum, e) => sum + (parseFloat(e.Amount) || 0), 0);

  const netAmount = totalIncome - totalExpense;

  const fmtPkr = (val) => `PKR ${(val || 0).toLocaleString()}`;
  const cleanCell = (value) => {
    const text = String(value ?? '').trim();
    return text && text !== '-' && text !== '—' ? text : '';
  };
  const entryTime = (entry) => cleanCell(entry.Time) || cleanCell(entry.time) || '-';
  const entryAccount = (entry) =>
    cleanCell(entry.Account_Name) ||
    cleanCell(entry.accountName) ||
    cleanCell(entry.Payment_Account_Name) ||
    cleanCell(entry.paymentAccountName) ||
    'Cash in Hand';

  const todayForBanner = new Date().toISOString().split('T')[0];
  const isNonTodayAccountant = userRole === 'accountant' && form.Date !== todayForBanner;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Non-today date warning banner for Accountants */}
      {isNonTodayAccountant && (
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          border: '1px solid #f59e0b',
          borderRadius: '14px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 2px 8px rgba(245,158,11,0.15)',
        }}>
          <span style={{ fontSize: '22px' }}>!</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#92400e' }}>
              CEO Approval Required for {form.Date > todayForBanner ? 'Future' : 'Past'} Date Entry
            </div>
            <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
              You have selected <strong>{form.Date}</strong>. Accountants can only add entries for <strong>today ({todayForBanner})</strong> without approval.
              Submitting will send an appeal to the CEO — they can approve it via OTP or from their Appeals Dashboard.
            </div>
          </div>
        </div>
      )}

      {/* Date Header Controller */}
      <div style={{
        background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #e0e0e0)',
        borderRadius: '16px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#E8F0FE', padding: '8px', borderRadius: '10px', color: '#6366f1' }}>
            <BookIcon size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>Daily cash ledger</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Log and audit cash transactions</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Select Date:</label>
          <input 
            type="date" 
            value={form.Date} 
            onChange={(e) => setForm({ ...form, Date: e.target.value })}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
              background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
              fontSize: '13px', fontWeight: '600'
            }}
          />
        </div>
      </div>

      {/* Main Grid: Form Left, Table & Summary Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }} className="form-grid-daily">
        
        {/* Left Side: Add Entry Form */}
        <div className="form-container" style={{ margin: 0, height: 'fit-content' }}>
          <div className="form-title" style={{ fontSize: '14px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PlusIcon size={14} /> Add Daily Entry
          </div>
          
          <form onSubmit={handleAddEntry} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {/* Type selector (Income / Expense toggles) */}
            <div className="form-group">
              <label>Entry Type *</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, Type: 'Income' })}
                  className={`btn ${form.Type === 'Income' ? 'btn-success' : 'btn-ghost'}`}
                  style={{ flex: 1, padding: '8px 12px', fontSize: '12px', borderRadius: '8px' }}
                >
                  Income
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, Type: 'Expense' })}
                  className={`btn ${form.Type === 'Expense' ? 'btn-danger' : 'btn-ghost'}`}
                  style={{ flex: 1, padding: '8px 12px', fontSize: '12px', borderRadius: '8px' }}
                >
                  Expense
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Time</label>
              <input 
                type="time" 
                value={form.Time} 
                onChange={(e) => setForm({ ...form, Time: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Description *</label>
              <input 
                type="text" 
                placeholder="e.g. Office tea, Plot booking token cash" 
                value={form.Description} 
                onChange={(e) => setForm({ ...form, Description: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Amount (PKR) *</label>
              <input 
                type="number" 
                placeholder="PKR amount" 
                value={form.Amount} 
                onChange={(e) => setForm({ ...form, Amount: e.target.value })}
                required
              />
            </div>

            <button 
              type="submit" 
              className={`btn btn-lg ${isNonTodayAccountant ? 'btn-warning' : 'btn-primary'}`}
              style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: isNonTodayAccountant ? 'linear-gradient(135deg, #f59e0b, #d97706)' : undefined,
                color: isNonTodayAccountant ? 'white' : undefined,
                border: 'none'
              }}
              disabled={loading}
            >
              {loading ? 'Processing...' : isNonTodayAccountant ? 'Submit Appeal to CEO' : '+ Add Entry'}
            </button>

          </form>
        </div>

        {/* Right Side: Ledger Audits & Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Summary Row */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px'
          }}>
            {/* Total Income */}
            <div style={{
              background: '#E6F4EA', border: '1px solid #C4EED0', borderRadius: '14px',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#137333', textTransform: 'uppercase' }}>Total Income</span>
              <strong style={{ fontSize: '18px', color: '#137333' }}>{fmtPkr(totalIncome)}</strong>
            </div>

            {/* Total Expense */}
            <div style={{
              background: '#FCE8E6', border: '1px solid #FAD2CF', borderRadius: '14px',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#C5221F', textTransform: 'uppercase' }}>Total Expense</span>
              <strong style={{ fontSize: '18px', color: '#C5221F' }}>{fmtPkr(totalExpense)}</strong>
            </div>

            {/* Net P&L */}
            <div style={{
              background: netAmount >= 0 ? '#E8F0FE' : '#FEF7E0', 
              border: netAmount >= 0 ? '1px solid #D2E3FC' : '1px solid #FDE293', 
              borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: netAmount >= 0 ? '#1A73E8' : '#B06000', textTransform: 'uppercase' }}>Net Cash balance</span>
              <strong style={{ fontSize: '18px', color: netAmount >= 0 ? '#1A73E8' : '#B06000' }}>{fmtPkr(netAmount)}</strong>
            </div>
          </div>

          {/* Entries Table container */}
          <div className="table-container" style={{ margin: 0 }}>
            <div className="table-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ClockIcon size={14} /> Entries Log ({entries.length})
              </h3>
            </div>
            
            {entries.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="icon"><BookIcon size={32} /></div>
                <h3>No entries recorded</h3>
                <p>Add cash entries on the left to start ledger book for {form.Date}.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Time</th>
                      <th style={{ width: '100px' }}>Type</th>
                      <th style={{ width: '160px' }}>Account</th>
                      <th>Description</th>
                      <th style={{ width: '150px' }}>Amount</th>
                      <th style={{ width: '80px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '600' }}>{entryTime(e)}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
                            background: e.Type === 'Income' ? '#E6F4EA' : '#FCE8E6',
                            color: e.Type === 'Income' ? '#137333' : '#C5221F',
                            border: e.Type === 'Income' ? '1px solid #C4EED0' : '1px solid #FAD2CF'
                          }}>
                            {e.Type}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{entryAccount(e)}</td>
                        <td>{e.Description}</td>
                        <td className={e.Type === 'Income' ? 'text-green' : 'text-red'} style={{ fontWeight: '700' }}>
                          {fmtPkr(e.Amount)}
                        </td>
                        <td>
                          <button
                            onClick={() => handleDeleteEntry(e.Entry_ID)}
                            className="btn btn-ghost"
                            style={{ padding: '4px', minWidth: 'auto', color: 'var(--accent-red)' }}
                            title="Delete entry"
                          >
                            <TrashIcon size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Receipt Buttons */}
      {entries.length > 0 && (
        <div style={{
          display: 'flex', gap: 12, justifyContent: 'flex-end',
          borderTop: '1px solid var(--border-color, #e0e0e0)',
          paddingTop: 16,
        }}>
          <button
            className="btn btn-success"
            onClick={() => setReceiptMode('income')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            Income Receipt
          </button>
          <button
            className="btn btn-danger"
            onClick={() => setReceiptMode('expense')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            Expense Receipt
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setReceiptMode('full')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            Full Day Receipt
          </button>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptMode && (
        <DailyReceipt
          entries={entries}
          date={form.Date}
          townName={townName}
          mode={receiptMode}
          onClose={() => setReceiptMode(null)}
        />
      )}

      {/* Admin Password Confirmation */}
      <AdminPasswordConfirm
        isOpen={showAdminConfirm}
        onClose={() => { setShowAdminConfirm(false); setPendingDeleteId(null); }}
        onConfirm={async () => {
          await doDeleteEntry(pendingDeleteId);
          setShowAdminConfirm(false);
          setPendingDeleteId(null);
        }}
        title="Confirm Deletion"
        message="Enter your administration password to confirm this deletion."
      />

      {/* OTP Approval Modal */}
      {showOtpModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: 6 }}>⏳ CEO Approval Required</h3>
            <div style={{
              background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e'
            }}>
              <strong>Entry Date:</strong> {pendingEntryPayload?.date} &nbsp;|&nbsp;
              <strong>Type:</strong> {pendingEntryPayload?.type} &nbsp;|&nbsp;
              <strong>Amount:</strong> PKR {(pendingEntryPayload?.amount || 0).toLocaleString()}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              You are adding an entry for a non-today date. An OTP has been sent to the CEO's email.
              Ask the CEO for the 6-digit code, or wait for them to approve it from the Appeals Dashboard.
            </p>
            <div className="form-group">
              <label>Enter 6-digit OTP</label>
              <input 
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                maxLength={6}
                placeholder="123456"
                style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: 'bold' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setShowOtpModal(false)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn btn-primary" onClick={verifyOtp} disabled={loading} style={{ flex: 1 }}>
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
