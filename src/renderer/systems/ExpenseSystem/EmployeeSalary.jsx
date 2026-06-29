import { useState, useEffect } from 'react';
import OfficialReceipt from '../../components/OfficialReceipt';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { IconChartUp, IconHourglass, IconUpload, IconCheck, IconTrash, IconEmail, IconClipboard, IconPhone, IconIdCard, IconMoney, IconBanknote, IconProhibited, IconZap, IconCalendar, IconTimer, IconWorker, IconPlus, IconUser, IconPin, IconMailbox, IconFile, IconWarning, IconClose } from '../../components/Icons';

// ─── Salary Increase Modal ──────────────────────────────────────────────────
function SalaryIncreaseModal({ employee, townName, onClose, showToast }) {
  const { user, userRole } = useAuth();
  const [proposedSalary, setProposedSalary] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!proposedSalary || parseFloat(proposedSalary) <= 0) {
      showToast('Please enter a valid proposed salary', 'error');
      return;
    }
    if (!reason.trim()) {
      showToast('Please provide a reason for salary increase', 'error');
      return;
    }
    setLoading(true);
    try {
      const { error: appealError } = await supabase.from('appeals').insert([{
        requested_by_user_id: user?.id,
        requested_by_role: userRole || 'accountant',
        appeal_type: 'salary_increase',
        entity_type: 'employee',
        entity_id: String(employee.id),
        town_name: townName,
        status: 'pending',
        reason,
        requested_data: {
          employeeName: employee.name,
          employeeId: employee.id,
          townName,
          currentSalary: employee.baseSalary,
          proposedSalary: parseFloat(proposedSalary),
        },
      }]);

      if (appealError) throw appealError;

      showToast(`Salary increase appeal submitted for ${employee.name}!`);
      onClose();
    } catch (err) {
      showToast(err.message || 'Error submitting appeal', 'error');
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 28, width: 420,
        border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><IconChartUp size={16} /> Salary Increase Appeal</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{employee.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ padding: 12, background: '#fef3c7', borderRadius: 8, marginBottom: 16, border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
          <strong>Current Salary:</strong> PKR {(employee.baseSalary || 0).toLocaleString()}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Proposed New Salary (PKR) *
            </label>
            <input
              type="number"
              value={proposedSalary}
              onChange={e => setProposedSalary(e.target.value)}
              placeholder="Enter proposed salary"
              required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Reason *
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why should this employee get a salary increase?"
              required
              rows={3}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
              {loading ? <><IconHourglass size={14} /> Submitting...</> : <><IconUpload size={14} /> Submit to CEO</>}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Employee Modal (Appeal OTP or Dashboard) ───────────────────────
function DeleteEmployeeModal({ employee, townName, onClose, showToast, onSuccess }) {
  const { user, userRole } = useAuth();
  const [option, setOption] = useState(null); // 'otp' or 'dashboard'
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [appealId, setAppealId] = useState(null);

  const handleSendOtp = async () => {
    setLoading(true);
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(code);

      // 1. Submit appeal directly via frontend client to satisfy RLS
      const { data: appealData, error: appealError } = await supabase.from('appeals').insert([{
        requested_by_user_id: user?.id,
        requested_by_role: userRole || 'accountant',
        appeal_type: 'delete_employee',
        entity_type: 'employee',
        entity_id: String(employee.id),
        town_name: townName,
        status: 'pending',
        reason: `Delete employee: ${employee.name} (${employee.designation || 'Employee'})`,
        requested_data: {
          employeeId: employee.id,
          employeeName: employee.name,
          designation: employee.designation,
          townName,
        },
        otp_code: code,
      }]).select().single();

      if (appealError) throw appealError;

      setAppealId(appealData.id);

      // 2. Send email to CEO
      const emailRes = await window.api.sendDeleteEmployeeOtpEmail({
        otpCode: code,
        employeeName: employee.name,
        designation: employee.designation,
        townName,
        requestedBy: user?.full_name || user?.email || 'Accountant',
      });

      if (emailRes && !emailRes.error) {
        setOtpSent(true);
        showToast('OTP sent to CEO email successfully!');
      } else {
        showToast(emailRes?.error || 'Failed to send email OTP', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (!otpInput.trim()) {
      showToast('Please enter the OTP code', 'error');
      return;
    }
    setLoading(true);
    try {
      // 1. Read appeal from supabase to verify
      const { data, error } = await supabase
        .from('appeals')
        .select('otp_code, status')
        .eq('id', appealId)
        .single();
      
      if (error) throw error;
      if (!data || !data.otp_code) {
        showToast('OTP verification record not found in system', 'error');
        setLoading(false);
        return;
      }
      if (data.status !== 'pending') {
        showToast('This appeal has already been processed', 'error');
        setLoading(false);
        return;
      }

      if (String(data.otp_code).trim() !== otpInput.trim() && generatedOtp !== otpInput.trim()) {
        showToast('Invalid OTP entered. Please try again or request CEO for code.', 'error');
        setLoading(false);
        return;
      }

      // 2. Mark appeal as approved in supabase
      await supabase
        .from('appeals')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', appealId);

      // 3. Perform Excel deletion
      const deleteRes = await window.api.deleteEmployeeV2({
        employeeId: employee.id,
        townName,
      });

      if (deleteRes && !deleteRes.error) {
        showToast(`Employee ${employee.name} deleted successfully! ✅`);
        onSuccess();
        onClose();
      } else {
        showToast(deleteRes?.error || 'Failed to complete deletion in database', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
    setLoading(false);
  };

  const handleSubmitDashboard = async () => {
    setLoading(true);
    try {
      // Direct insert via frontend client to satisfy RLS
      const { error: appealError } = await supabase.from('appeals').insert([{
        requested_by_user_id: user?.id,
        requested_by_role: userRole || 'accountant',
        appeal_type: 'delete_employee',
        entity_type: 'employee',
        entity_id: String(employee.id),
        town_name: townName,
        status: 'pending',
        reason: `Delete employee: ${employee.name} (${employee.designation || 'Employee'})`,
        requested_data: {
          employeeId: employee.id,
          employeeName: employee.name,
          designation: employee.designation,
          townName,
        },
        otp_code: null,
      }]);

      if (appealError) throw appealError;

      showToast('Deletion appeal submitted to CEO Dashboard successfully! 📤');
      onSuccess();
      onClose();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24, width: 440,
        border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}><IconTrash size={16} color="#dc2626" /> Delete Employee Appeal</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>Are you sure?</div>
          <div style={{ fontSize: 12, color: '#7f1d1d' }}>
            You are requesting to delete <strong>{employee.name}</strong> ({employee.designation || 'Employee'}).
            This action requires CEO approval.
          </div>
        </div>

        {!option ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Select approval method:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <button
                onClick={() => setOption('otp')}
                className="btn btn-primary"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '12px 16px', height: 'auto', textTransform: 'none' }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><IconEmail size={14} /> Option A: Email OTP to CEO</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: 400, textAlign: 'left' }}>
                  Sends verification code to CEO's email. Enter the code here to delete immediately.
                </div>
              </button>
              <button
                onClick={() => setOption('dashboard')}
                className="btn btn-ghost"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '12px 16px', height: 'auto', border: '1px solid var(--border-color)', textTransform: 'none' }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconClipboard size={14} /> Option B: Submit to CEO Dashboard</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontWeight: 400, textAlign: 'left' }}>
                  CEO will see a pending appeal in their panel and can approve it there.
                </div>
              </button>
            </div>
          </div>
        ) : option === 'otp' ? (
          <div>
            {!otpSent ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 16 }}>
                  Click below to send a secure 6-digit OTP code to the CEO's email.
                </p>
                <button onClick={handleSendOtp} className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                  {loading ? <><IconHourglass size={14} /> Sending...</> : <><IconUpload size={14} /> Send OTP Email</>}
                </button>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Enter OTP Code *
                </label>
                <input
                  type="text"
                  placeholder="------"
                  value={otpInput}
                  onChange={e => setOtpInput(e.target.value)}
                  maxLength={8}
                  style={{
                    width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 8,
                    fontSize: 20, fontWeight: 800, textAlign: 'center', letterSpacing: 4, fontFamily: 'monospace',
                    marginBottom: 16, boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleVerifyOtp} className="btn btn-danger" style={{ flex: 1 }} disabled={loading}>
                    {loading ? <><IconHourglass size={14} /> Verifying...</> : <><IconCheck size={14} /> Verify & Delete</>}
                  </button>
                  <button onClick={() => setOtpSent(false)} className="btn btn-ghost" style={{ flex: 1 }} disabled={loading}>
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 18 }}>
              This request will be sent directly to the CEO's Appeals Dashboard. Once approved, the employee record will be deleted.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSubmitDashboard} className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? <><IconHourglass size={14} /> Submitting...</> : <><IconUpload size={14} /> Submit Appeal</>}
              </button>
              <button onClick={() => setOption(null)} className="btn btn-ghost" style={{ flex: 1 }} disabled={loading}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Agent Card ─────────────────────────────────────────────────────────────
function EmployeeCard({ emp, isSelected, onSelect, onSalaryIncrease, onGiveSalary, onDelete }) {
  const statusColor = emp.status === 'Active' ? '#10b981' : '#ef4444';

  return (
    <div
      onClick={() => onSelect(emp)}
      style={{
        padding: 20,
        background: isSelected ? 'linear-gradient(135deg, #1e3a5f 0%, #1a2f4a 100%)' : 'var(--bg-card)',
        borderRadius: 16,
        border: isSelected ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: isSelected ? '0 10px 25px rgba(37,99,235,0.2)' : '0 4px 12px rgba(0,0,0,0.05)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        boxSizing: 'border-box',
      }}
      className="employee-card"
    >
      <div>
        {isSelected && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            width: 20, height: 20, background: 'var(--accent-blue)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: 'white', fontWeight: 800,
          }}>✓</div>
        )}

        {/* Avatar & Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: isSelected ? 'rgba(255,255,255,0.15)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: 'white', fontWeight: 700, flexShrink: 0,
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
          }}>
            {(emp.name || 'A').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: isSelected ? 'white' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {emp.name}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, marginTop: 2, display: 'inline-block',
              padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
              background: isSelected ? 'rgba(255,255,255,0.1)' : 'var(--bg-secondary)',
              color: isSelected ? 'white' : 'var(--text-muted)'
            }}>
              {emp.designation || 'Employee'}
            </div>
          </div>
        </div>

        {/* Salary */}
        <div style={{
          padding: '12px 14px',
          background: isSelected ? 'rgba(255,255,255,0.06)' : 'var(--bg-secondary)',
          borderRadius: 10, marginBottom: 14,
          border: isSelected ? '1px solid rgba(255,255,255,0.1)' : '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: isSelected ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
            Base Salary
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: isSelected ? '#4ade80' : '#059669', fontFamily: 'monospace' }}>
            PKR {(emp.baseSalary || 0).toLocaleString()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, fontSize: 11, fontWeight: 800, color: isSelected ? 'rgba(255,255,255,0.78)' : 'var(--text-muted)' }}>
            <span>Received</span>
            <b style={{ color: isSelected ? '#bfdbfe' : '#2563eb' }}>PKR {(emp.salaryReceived || 0).toLocaleString()}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4, fontSize: 11, fontWeight: 800, color: isSelected ? 'rgba(255,255,255,0.78)' : 'var(--text-muted)' }}>
            <span>Remaining</span>
            <b style={{ color: (emp.salaryRemaining || 0) > 0 ? '#b45309' : '#0f766e' }}>PKR {(emp.salaryRemaining || 0).toLocaleString()}</b>
          </div>
        </div>

        {/* Contacts */}
        {(emp.phone || emp.cnic) && (
          <div style={{ marginBottom: 16, fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', lineHeight: 1.8 }}>
            {emp.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconPhone size={14} /> {emp.phone}</div>}
            {emp.cnic && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconIdCard size={14} /> {emp.cnic}</div>}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 'auto' }}>
        <button
          onClick={(ev) => { ev.stopPropagation(); onSalaryIncrease(emp); }}
          className="btn btn-ghost btn-sm"
          style={{
            flex: 1, fontSize: 11, padding: '6px 8px', height: 'auto',
            border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-color)',
            color: isSelected ? 'white' : 'var(--text-primary)'
          }}
          title="Request salary increase"
        >
          <IconChartUp size={12} /> Increase
        </button>
        <button
          onClick={(ev) => { ev.stopPropagation(); onGiveSalary(emp); }}
          className="btn btn-success btn-sm"
          style={{ flex: 1, fontSize: 11, padding: '6px 8px', height: 'auto' }}
          title="Record salary payment"
        >
          <IconMoney size={12} /> Pay
        </button>
        <button
          onClick={(ev) => { ev.stopPropagation(); onDelete(emp); }}
          className="btn btn-danger btn-sm"
          style={{
            padding: '6px 10px', height: 'auto', minWidth: 'auto',
            background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca'
          }}
          title="Delete employee (CEO approval required)"
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Salary Payment Panel ────────────────────────────────────────────────────
function SalaryPaymentPanel({ employee, townName, showToast, onClose, onSaved }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  });
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [baseSalary, setBaseSalary] = useState(String(employee.baseSalary || ''));
  const [paymentAmount, setPaymentAmount] = useState('');
  const [monthPaid, setMonthPaid] = useState(0);
  const [advanceDeduction, setAdvanceDeduction] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Advance state
  const [advanceType, setAdvanceType] = useState('none');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [customMonthlyDeduction, setCustomMonthlyDeduction] = useState('');
  const [totalInstallments, setTotalInstallments] = useState(0);

  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    loadActiveAdvance();
    loadSalaryMonth();
  }, [employee.name, month, townName]);

  const loadActiveAdvance = async () => {
    const advances = await window.api.getAdvanceSalaries({ townName, employeeName: employee.name });
    if (advances && advances.length > 0) {
      setAdvanceDeduction(advances[0].monthlyDeduction || 0);
    } else {
      setAdvanceDeduction(0);
    }
  };

  const loadSalaryMonth = async () => {
    const rows = await window.api.getSalaryRecords?.({ townName });
    const paid = (Array.isArray(rows) ? rows : [])
      .filter(r =>
        String(r.Name || '').trim().toLowerCase() === String(employee.name || '').trim().toLowerCase() &&
        String(r.Month || '').trim().toLowerCase() === String(month || '').trim().toLowerCase()
      )
      .reduce((sum, r) => {
        const salaryPart = parseFloat(r.Salary_Paid_Amount);
        if (Number.isFinite(salaryPart)) return sum + salaryPart;
        return sum + Math.max(0, (parseFloat(r.Amount) || 0) - (parseFloat(r.New_Advance_Given) || 0));
      }, 0);
    setMonthPaid(paid);
    setPaymentAmount(prev => prev || String(Math.max(0, (parseFloat(baseSalary) || 0) - paid)));
  };

  const numericBaseSalary = parseFloat(baseSalary) || 0;
  const remainingSalary = Math.max(0, numericBaseSalary - monthPaid);
  const numericPaymentAmount = parseFloat(paymentAmount) || 0;
  const advanceFromOverpay = Math.max(0, numericPaymentAmount - remainingSalary);
  const salaryAppliedAmount = Math.min(numericPaymentAmount, remainingSalary || numericPaymentAmount);
  const netAmount = Math.max(0, numericPaymentAmount - advanceDeduction);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!month || numericBaseSalary <= 0 || numericPaymentAmount <= 0) {
      showToast('Please fill month, base salary and pay amount', 'error');
      return;
    }
    if (numericPaymentAmount > remainingSalary) {
      const ok = window.confirm(
        `${employee.name} ki ${month} salary me sirf PKR ${remainingSalary.toLocaleString()} remaining hai. Extra PKR ${advanceFromOverpay.toLocaleString()} advance salary ke tor par save karna hai?`
      );
      if (!ok) return;
    }
    setLoading(true);
    try {
      // Deduct active advance installment
      if (advanceDeduction > 0) {
        const advances = await window.api.getAdvanceSalaries({ townName, employeeName: employee.name });
        if (advances && advances.length > 0) {
          await window.api.updateAdvanceSalary(advances[0].id);
        }
      }

      // Record new advance
      const advAmt = parseFloat(advanceAmount) || 0;
      const actualCashDisbursed = netAmount + advAmt;
      if (advAmt > 0 && advanceType !== 'none') {
        const monthlyDed = advanceType === 'single'
          ? advAmt
          : (parseFloat(customMonthlyDeduction) || Math.ceil(advAmt / 12));
        await window.api.addAdvanceSalary({
          townName,
          employeeName: employee.name,
          advanceType,
          totalAmount: advAmt,
          totalInstallments: advanceType === 'installment' ? (Math.ceil(advAmt / monthlyDed) || 1) : 1,
          monthlyDeduction: monthlyDed,
        });
      }

      const res = await window.api.recordSalaryPayment({
        employeeName: employee.name,
        designation: employee.designation,
        amount: actualCashDisbursed,
        salaryGrossAmount: numericPaymentAmount,
        salaryAppliedAmount,
        cashDisbursedAmount: actualCashDisbursed,
        salaryAmount: numericBaseSalary,
        Payment_Date: paymentDate,
        month,
        townName,
        type: 'Employee',
        note,
        advanceDeduction,
        newAdvanceGiven: advAmt + advanceFromOverpay,
        isAdvanceSalary: advanceFromOverpay > 0,
      });

      if (res && !res.error) {
        showToast(`Salary paid to ${employee.name} for ${month}`);
        setReceiptData({
          type: 'salary',
          receiptNumber: res.Receipt_Number,
          date: res.Payment_Date || res.Date || paymentDate,
          employeeName: employee.name,
          designation: employee.designation,
          employeePhone: employee.phone,
          employeeCNIC: employee.cnic,
          month,
          amount: actualCashDisbursed,
          baseSalary: numericBaseSalary,
          salaryGrossAmount: numericPaymentAmount,
          salaryAppliedAmount,
          advanceDeduction,
          newAdvanceGiven: advAmt + advanceFromOverpay,
          netAmount,
        totalDisbursed: actualCashDisbursed,
          paidBefore: monthPaid,
          paidAfter: Math.min(numericBaseSalary, monthPaid + salaryAppliedAmount),
          remainingAfter: Math.max(0, numericBaseSalary - monthPaid - salaryAppliedAmount),
          townName,
          note,
          advanceType: advAmt > 0 ? advanceType : null,
          totalAdvance: advAmt > 0 ? advAmt : null,
          monthlyAdvanceDeduction: advAmt > 0 ? (advanceType === 'single' ? advAmt : parseFloat(customMonthlyDeduction) || 0) : null,
        });
        setShowReceipt(true);
      } else {
        showToast(res?.error || 'Failed to record salary', 'error');
      }
    } catch {
      showToast('Error processing salary', 'error');
    }
    setLoading(false);
  };

  if (showReceipt && receiptData) {
    return <OfficialReceipt data={receiptData} townName={townName} onClose={() => { setShowReceipt(false); onSaved?.(); onClose(); }} />;
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 0, width: 520,
        maxHeight: '90vh', overflow: 'auto',
        border: '1px solid var(--border-color)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border-color)',
          background: 'linear-gradient(135deg, #1e3a5f 0%, #1a2f4a 100%)',
          borderRadius: '16px 16px 0 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}><IconMoney size={16} color="white" /> Record Salary Payment</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{employee.name} — {employee.designation}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {/* Month + Base Salary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Month *</label>
              <input
                value={month}
                onChange={e => setMonth(e.target.value)}
                placeholder="e.g. June 2026"
                required
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Payment Date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Base Salary (PKR)</label>
              <input
                type="number"
                value={baseSalary}
                onChange={e => setBaseSalary(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 10,
            marginBottom: 16,
          }}>
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Paid This Month</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f766e' }}>PKR {monthPaid.toLocaleString()}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remaining</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: remainingSalary > 0 ? '#b45309' : '#0f766e' }}>PKR {remainingSalary.toLocaleString()}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Status</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: remainingSalary > 0 ? '#1d4ed8' : '#0f766e' }}>{remainingSalary > 0 ? 'Partial' : 'Paid'}</div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pay Now (PKR) *</label>
            <input
              type="number"
              min="1"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              placeholder="Amount actually paid now"
              required
              style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: 10, boxSizing: 'border-box', fontWeight: 800 }}
            />
            {advanceFromOverpay > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#b45309', fontWeight: 700 }}>
                Extra PKR {advanceFromOverpay.toLocaleString()} advance salary banay ga.
              </div>
            )}
          </div>

          {/* Active advance badge */}
          {advanceDeduction > 0 && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#991b1b' }}>
              <IconWarning size={14} /> Active advance deduction: <strong>PKR {advanceDeduction.toLocaleString()}/month</strong>
            </div>
          )}

          {/* Advance System */}
          <div style={{ padding: 16, background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', border: '1px solid #86efac', borderRadius: 10, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#15803d', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><IconBanknote size={14} color="#15803d" /> Add New Advance?</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                { value: 'none', label: 'No Advance', icon: <IconProhibited size={12} />, color: '#6b7280' },
                { value: 'single', label: 'Single Lump Sum', icon: <IconZap size={12} />, color: '#0ea5e9' },
                { value: 'installment', label: 'Custom Installments', icon: <IconCalendar size={12} />, color: '#8b5cf6' },
              ].map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: advanceType === opt.value ? 'white' : 'transparent',
                    border: advanceType === opt.value ? `2px solid ${opt.color}` : '2px solid transparent',
                    color: advanceType === opt.value ? opt.color : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  <input type="radio" name="adv" value={opt.value} checked={advanceType === opt.value}
                    onChange={() => { setAdvanceType(opt.value); setAdvanceAmount(''); setCustomMonthlyDeduction(''); setTotalInstallments(0); }}
                    style={{ display: 'none' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {advanceType !== 'none' && (
              <div style={{ display: 'grid', gridTemplateColumns: advanceType === 'installment' ? '1fr 1fr' : '1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#15803d' }}>
                    {advanceType === 'single' ? 'Advance Amount (Full deduction next month)' : 'Total Advance Amount'} (PKR) *
                  </label>
                  <input
                    type="number"
                    value={advanceAmount}
                    onChange={e => {
                      const amt = parseFloat(e.target.value) || 0;
                      setAdvanceAmount(e.target.value);
                      if (advanceType === 'installment' && customMonthlyDeduction > 0) {
                        setTotalInstallments(Math.ceil(amt / parseFloat(customMonthlyDeduction)));
                      }
                    }}
                    placeholder="0"
                    required
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #86efac', borderRadius: 8, boxSizing: 'border-box' }}
                  />
                </div>
                {advanceType === 'installment' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#15803d' }}>
                      Monthly Deduction (PKR) *
                    </label>
                    <input
                      type="number"
                      value={customMonthlyDeduction}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomMonthlyDeduction(e.target.value);
                        if (val > 0 && parseFloat(advanceAmount) > 0) {
                          setTotalInstallments(Math.ceil(parseFloat(advanceAmount) / val));
                        }
                      }}
                      placeholder="e.g. 5000"
                      required
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #86efac', borderRadius: 8, boxSizing: 'border-box' }}
                    />
                  </div>
                )}
                {advanceType === 'installment' && totalInstallments > 0 && (
                  <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: 'white', borderRadius: 8, border: '1px solid #86efac', fontSize: 12 }}>
                    <IconTimer size={14} /> Estimated repayment: <strong>{totalInstallments} month{totalInstallments !== 1 ? 's' : ''}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Note */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Note (Optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Bonus, commission, remarks..."
              rows={2}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Base Salary', value: `PKR ${numericBaseSalary.toLocaleString()}`, color: '#0f172a' },
              { label: 'Deductions', value: `PKR ${advanceDeduction.toLocaleString()}`, color: '#dc2626' },
              { label: 'Net Amount', value: `PKR ${netAmount.toLocaleString()}`, color: '#15803d' },
            ].map(s => (
              <div key={s.label} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              </div>
            ))}
          </div>

          <button type="submit" className="btn btn-success" style={{ width: '100%', padding: 14, fontSize: 14, fontWeight: 700 }} disabled={loading}>
            {loading ? <><IconHourglass size={14} /> Processing...</> : <><IconCheck size={14} /> Confirm & Print Receipt</>}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Add Agent Modal ─────────────────────────────────────────────────────────
function AddEmployeeModal({ townName, showToast, onClose, onAdded }) {
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [salary, setSalary] = useState('');
  const [phone, setPhone] = useState('');
  const [cnic, setCnic] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !salary) {
      showToast('Name and base salary are required', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await window.api.addEmployeeV2({
        name: name.trim(),
        designation: designation.trim() || 'Employee',
        phone: phone.trim(),
        cnic: cnic.trim(),
        baseSalary: parseFloat(salary) || 0,
        townName,
      });
      if (res && !res.error) {
        showToast(`"${name}" added successfully!`);
        onAdded();
        onClose();
      } else {
        showToast(res?.error || 'Failed to add employee', 'error');
      }
    } catch {
      showToast('Error adding employee', 'error');
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, width: 440,
        border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 24px', background: 'linear-gradient(135deg, #1e3a5f, #1a2f4a)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}><IconPlus size={16} color="white" /> Add New Employee</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Employee Full Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Ahmad Khan"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, boxSizing: 'border-box', fontSize: 14 }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Designation</label>
              <input value={designation} onChange={e => setDesignation(e.target.value)} placeholder="e.g. Agent, Accountant, Manager, Guard..."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Base Salary (PKR) *</label>
              <input type="number" value={salary} onChange={e => setSalary(e.target.value)} required placeholder="e.g. 25000"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Phone</label>
              <input type="tel" value={phone} onChange={e => {
                let val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length > 11) val = val.slice(0, 11);
                setPhone(val);
              }} placeholder="Phone (11 digits)" maxLength={11}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CNIC</label>
              <input value={cnic} onChange={e => {
                let val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length > 13) val = val.slice(0, 13);
                let formatted = val;
                if (val.length > 5) {
                  formatted = val.slice(0, 5) + '-' + val.slice(5);
                }
                if (val.length > 12) {
                  formatted = val.slice(0, 5) + '-' + val.slice(5, 12) + '-' + val.slice(12, 13);
                }
                setCnic(formatted);
              }} placeholder="31301-0699281-9" maxLength={15}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }} disabled={loading}>
              {loading ? <><IconHourglass size={14} /> Saving...</> : <><IconCheck size={14} /> Save Employee</>}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Salary History List ─────────────────────────────────────────────────────
function SalaryHistoryList({ townName, showToast, onViewReceipt }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecords();
  }, [townName]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await window.api.getSalaryRecords({ townName });
      if (Array.isArray(res)) {
        const sorted = [...res].sort((a, b) => new Date(b.Date || b.date) - new Date(a.Date || a.date));
        setRecords(sorted);
      }
    } catch {
      showToast('Failed to load salary payment history', 'error');
    }
    setLoading(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IconHourglass size={16} /> Loading salary history...</div>;
  }

  if (records.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
        <IconMailbox size={20} /> No salary payments recorded yet for this town.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700 }}>
            <th style={{ padding: 12 }}>Receipt #</th>
            <th style={{ padding: 12 }}>Date</th>
            <th style={{ padding: 12 }}>Name</th>
            <th style={{ padding: 12 }}>Designation</th>
            <th style={{ padding: 12 }}>Month</th>
            <th style={{ padding: 12, textAlign: 'right' }}>Salary Applied</th>
            <th style={{ padding: 12, textAlign: 'right' }}>Cash Paid</th>
            <th style={{ padding: 12 }}>Note</th>
            <th style={{ padding: 12, textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => (
            <tr key={rec.Receipt_Number || rec.receiptNumber} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} className="table-row-hover">
              <td style={{ padding: 12, fontFamily: 'monospace', fontWeight: 600 }}>{rec.Receipt_Number || rec.receiptNumber}</td>
              <td style={{ padding: 12 }}>{rec.Date || rec.date}</td>
              <td style={{ padding: 12, fontWeight: 700 }}>{rec.Name || rec.employeeName}</td>
              <td style={{ padding: 12 }}>{rec.Designation || rec.designation || 'Employee'}</td>
              <td style={{ padding: 12 }}>{rec.Month || rec.month}</td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>
                PKR {(parseFloat(rec.Salary_Paid_Amount) || Math.max(0, (parseFloat(rec.Amount) || parseFloat(rec.amount) || 0) - (parseFloat(rec.New_Advance_Given) || 0))).toLocaleString()}
              </td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                PKR {(parseFloat(rec.Cash_Disbursed_Amount) || parseFloat(rec.Amount) || parseFloat(rec.amount) || 0).toLocaleString()}
              </td>
              <td style={{ padding: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.Note || rec.note || '-'}</td>
              <td style={{ padding: 12, textAlign: 'center' }}>
                <button
                  onClick={() => onViewReceipt(rec)}
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: '1px solid var(--border-color)', fontSize: 11 }}
                >
                  <IconFile size={12} /> View Receipt
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Advance Salaries List ───────────────────────────────────────────────────
function AdvanceSalariesList({ townName, showToast }) {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdvances();
  }, [townName]);

  const loadAdvances = async () => {
    setLoading(true);
    try {
      const res = await window.api.getAdvanceSalaries({ townName });
      if (Array.isArray(res)) {
        setAdvances(res);
      }
    } catch {
      showToast('Failed to load advance salaries', 'error');
    }
    setLoading(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IconHourglass size={16} /> Loading advance salaries...</div>;
  }

  if (advances.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
        <IconMailbox size={20} /> No advance salaries recorded for this town.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700 }}>
            <th style={{ padding: 12 }}>ID</th>
            <th style={{ padding: 12 }}>Date</th>
            <th style={{ padding: 12 }}>Employee Name</th>
            <th style={{ padding: 12 }}>Advance Type</th>
            <th style={{ padding: 12, textAlign: 'right' }}>Total Amount</th>
            <th style={{ padding: 12, textAlign: 'right' }}>Monthly Deduction</th>
            <th style={{ padding: 12, textAlign: 'center' }}>Repayment Progress</th>
            <th style={{ padding: 12, textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {advances.map((adv) => {
            const progressPercent = Math.min(100, Math.round(((adv.currentInstallment || 0) / (adv.totalInstallments || 1)) * 100));
            const statusColor = adv.status === 'Active' ? '#3b82f6' : adv.status === 'Completed' ? '#10b981' : 'var(--text-muted)';
            const typeLabel = adv.advanceType === 'installment' ? 'Installment Plan' : 'Lump Sum';

            return (
              <tr key={adv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: 12, fontFamily: 'monospace' }}>#{adv.id}</td>
                <td style={{ padding: 12 }}>{adv.startDate}</td>
                <td style={{ padding: 12, fontWeight: 700 }}>{adv.employeeName}</td>
                <td style={{ padding: 12 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: adv.advanceType === 'installment' ? '#f5f3ff' : '#f0f9ff',
                    color: adv.advanceType === 'installment' ? '#7c3aed' : '#0284c7',
                    border: adv.advanceType === 'installment' ? '1px solid #ddd6fe' : '1px solid #bae6fd',
                  }}>
                    {typeLabel}
                  </span>
                </td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: '#b91c1c', fontFamily: 'monospace' }}>
                  PKR {(parseFloat(adv.totalAmount) || 0).toLocaleString()}
                </td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: '#9a3412', fontFamily: 'monospace' }}>
                  PKR {(parseFloat(adv.monthlyDeduction) || 0).toLocaleString()}
                </td>
                <td style={{ padding: 12, width: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, background: 'var(--bg-secondary)', height: 8, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                      <div style={{ background: 'linear-gradient(90deg, #3b82f6, #10b981)', width: `${progressPercent}%`, height: '100%', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, minWidth: 50, textAlign: 'right' }}>
                      {adv.currentInstallment} of {adv.totalInstallments} ({progressPercent}%)
                    </span>
                  </div>
                </td>
                <td style={{ padding: 12, textAlign: 'center' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                    background: adv.status === 'Active' ? '#eff6ff' : adv.status === 'Completed' ? '#dcfce7' : '#f3f4f6',
                    color: statusColor,
                  }}>
                    {adv.status || 'Active'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function EmployeeSalary({ townName, showToast, refreshKey = 0 }) {
  const [employees, setEmployees] = useState([]);
  const [salaryRecords, setSalaryRecords] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showSalaryIncreaseModal, setShowSalaryIncreaseModal] = useState(false);
  const [salaryIncreaseTarget, setSalaryIncreaseTarget] = useState(null);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [loadingEmps, setLoadingEmps] = useState(true);

  // Sub-tabs state
  const [activeTab, setActiveTab] = useState('employees'); // 'employees', 'ledgers', 'history', 'advances'

  // Deletion Appeal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Receipt viewing state
  const [showReceiptView, setShowReceiptView] = useState(false);
  const [receiptViewData, setReceiptViewData] = useState(null);

  useEffect(() => {
    loadEmployees();
    loadSalaryRecords();
  }, [townName, refreshKey]);

  const loadEmployees = async () => {
    setLoadingEmps(true);
    try {
      const emps = await window.api.getEmployeesV2(townName);
      if (Array.isArray(emps)) {
        setEmployees(emps.filter(e => {
          const status = String(e.status || e.Status || '').toLowerCase();
          const designation = String(e.designation || e.Designation || e.Role || e.role || '').toLowerCase();
          return status !== 'deleted' && designation !== 'agent' && !designation.includes('sales agent');
        }));
      }
    } catch {
      // silently fail
    }
    setLoadingEmps(false);
  };

  const loadSalaryRecords = async () => {
    try {
      const rows = await window.api.getSalaryRecords?.({ townName });
      setSalaryRecords(Array.isArray(rows) ? rows : []);
    } catch {
      setSalaryRecords([]);
    }
  };

  const salaryLedgers = employees.map((emp) => {
    const now = new Date();
    const currentMonthName = now.toLocaleString('en-US', { month: 'long' });
    const currentMonthKey = `${currentMonthName} ${now.getFullYear()}`;
    const empRows = salaryRecords.filter((row) =>
      String(row.Name || row.employeeName || '').trim().toLowerCase() === String(emp.name || '').trim().toLowerCase()
    );
    const paid = empRows.reduce((sum, row) => {
      const salaryPart = parseFloat(row.Salary_Paid_Amount);
      return sum + (Number.isFinite(salaryPart) ? salaryPart : Math.max(0, (parseFloat(row.Amount) || 0) - (parseFloat(row.New_Advance_Given) || 0)));
    }, 0);
    const disbursed = empRows.reduce((sum, row) => sum + (parseFloat(row.Cash_Disbursed_Amount) || parseFloat(row.Amount) || 0), 0);
    const advances = empRows.reduce((sum, row) => sum + (parseFloat(row.New_Advance_Given) || 0), 0);
    const latest = [...empRows].sort((a, b) => new Date(b.Date || b.date || 0) - new Date(a.Date || a.date || 0))[0];
    const monthlySalary = parseFloat(emp.baseSalary || latest?.Salary_Amount) || 0;
    const currentMonthRows = empRows.filter((row) => String(row.Month || row.month || '') === currentMonthKey);
    const currentMonthPaid = currentMonthRows.reduce((sum, row) => {
      const salaryPart = parseFloat(row.Salary_Paid_Amount);
      return sum + (Number.isFinite(salaryPart) ? salaryPart : Math.max(0, (parseFloat(row.Amount) || 0) - (parseFloat(row.New_Advance_Given) || 0)));
    }, 0);
    const monthLatest = [...currentMonthRows].sort((a, b) => new Date(b.Date || b.date || 0) - new Date(a.Date || a.date || 0))[0];
    const currentRemaining = monthLatest
      ? Math.max(0, parseFloat(monthLatest.Salary_Remaining_After ?? (monthlySalary - currentMonthPaid)) || 0)
      : Math.max(0, monthlySalary);
    return {
      employee: emp,
      rows: empRows,
      paid,
      currentMonthPaid,
      disbursed,
      advances,
      monthlySalary,
      currentRemaining,
      lastPaid: latest?.Date || latest?.date || '',
      lastMonth: latest?.Month || latest?.month || '',
    };
  });
  const salaryTotals = salaryLedgers.reduce((acc, row) => ({
    salaryBase: acc.salaryBase + row.monthlySalary,
    paid: acc.paid + row.paid,
    disbursed: acc.disbursed + row.disbursed,
    advances: acc.advances + row.advances,
    remaining: acc.remaining + row.currentRemaining,
  }), { salaryBase: 0, paid: 0, disbursed: 0, advances: 0, remaining: 0 });

  const handleSalaryIncreaseClick = (emp) => {
    setSalaryIncreaseTarget(emp);
    setShowSalaryIncreaseModal(true);
  };

  const handlePayClick = (emp) => {
    setSelectedEmployee(emp);
    setShowPayModal(true);
  };

  const handleDeleteClick = (emp) => {
    setDeleteTarget(emp);
    setShowDeleteModal(true);
  };

  const handleViewHistoricalReceipt = (rec) => {
    const amt = parseFloat(rec.Amount || rec.amount) || 0;
    const advDed = parseFloat(rec.Advance_Deduction || rec.advanceDeduction) || 0;
    const newAdv = parseFloat(rec.New_Advance_Given || rec.newAdvanceGiven) || 0;
    setReceiptViewData({
      type: 'salary',
      receiptNumber: rec.Receipt_Number || rec.receiptNumber,
      date: rec.Date || rec.date,
      employeeName: rec.Name || rec.employeeName,
      designation: rec.Designation || rec.designation,
      month: rec.Month || rec.month,
      amount: amt,
      baseSalary: amt,
      advanceDeduction: advDed,
      newAdvanceGiven: newAdv,
      netAmount: amt - advDed,
      totalDisbursed: amt - advDed + newAdv,
      townName: rec.Town_Name || rec.townName || townName,
      note: rec.Note || rec.note || '',
    });
    setShowReceiptView(true);
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Modals */}
      {showAddEmployee && (
        <AddEmployeeModal
          townName={townName}
          showToast={showToast}
          onClose={() => setShowAddEmployee(false)}
          onAdded={loadEmployees}
        />
      )}
      {showPayModal && selectedEmployee && (
        <SalaryPaymentPanel
          employee={selectedEmployee}
          townName={townName}
          showToast={showToast}
          onClose={() => { setShowPayModal(false); setSelectedEmployee(null); }}
          onSaved={() => { loadSalaryRecords(); loadEmployees(); }}
        />
      )}
      {showSalaryIncreaseModal && salaryIncreaseTarget && (
        <SalaryIncreaseModal
          employee={salaryIncreaseTarget}
          townName={townName}
          showToast={showToast}
          onClose={() => { setShowSalaryIncreaseModal(false); setSalaryIncreaseTarget(null); }}
        />
      )}
      {showDeleteModal && deleteTarget && (
        <DeleteEmployeeModal
          employee={deleteTarget}
          townName={townName}
          showToast={showToast}
          onClose={() => { setShowDeleteModal(false); setDeleteTarget(null); }}
          onSuccess={loadEmployees}
        />
      )}
      {showReceiptView && receiptViewData && (
        <OfficialReceipt
          data={receiptViewData}
          townName={townName}
          onClose={() => { setShowReceiptView(false); setReceiptViewData(null); }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><IconWorker size={20} /> Employees & Salaries</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {employees.length} active employee{employees.length !== 1 ? 's' : ''} registered
          </div>
        </div>
        <button
          onClick={() => setShowAddEmployee(true)}
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}
        >
          <IconPlus size={14} /> Add Employee
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: 20, gap: 16 }}>
        {[
          { id: 'employees', label: 'Active Employees', icon: <IconWorker size={14} />, count: employees.length },
          { id: 'ledgers', label: 'Employee Ledgers', icon: <IconFile size={14} />, count: salaryLedgers.filter(l => l.rows.length > 0).length },
          { id: 'history', label: 'Salary History', icon: <IconClipboard size={14} /> },
          { id: 'advances', label: 'Advance Salaries', icon: <IconBanknote size={14} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid var(--accent-blue)' : '3px solid transparent',
              color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                background: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                color: activeTab === tab.id ? 'white' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 800,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Render selected tab */}
      {activeTab === 'employees' && (
        <>
          {/* Info bar */}
          <div style={{
            padding: '10px 16px', background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
            borderRadius: 10, border: '1px solid #bfdbfe', marginBottom: 20, fontSize: 12, color: '#1e40af',
          }}>
            <IconPin size={12} /> Click <strong>Pay</strong> to record a salary. Click <strong>Increase</strong> to request a raise. Click <strong><IconTrash size={12} /></strong> to delete an employee (requires CEO approval).
          </div>

          {/* Grid */}
          {loadingEmps ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}><IconHourglass size={32} /></div>
              <div>Loading employees...</div>
            </div>
          ) : employees.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 60, background: 'var(--bg-card)',
              borderRadius: 16, border: '2px dashed var(--border-color)',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}><IconUser size={48} /></div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No Employees Yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Add your first employee to start tracking salaries
              </div>
              <button onClick={() => setShowAddEmployee(true)} className="btn btn-primary"><IconPlus size={14} /> Add First Employee</button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 20,
            }}>
              {employees.map(emp => {
                const ledger = salaryLedgers.find((row) => row.employee.id === emp.id || row.employee.name === emp.name);
                return (
                <EmployeeCard
                  key={emp.id}
                  emp={{
                    ...emp,
                    salaryReceived: ledger?.currentMonthPaid || 0,
                    salaryRemaining: ledger?.currentRemaining ?? Math.max(0, (parseFloat(emp.baseSalary) || 0) - (ledger?.paid || 0)),
                  }}
                  isSelected={selectedEmployee?.id === emp.id}
                  onSelect={(e) => setSelectedEmployee(e)}
                  onSalaryIncrease={handleSalaryIncreaseClick}
                  onGiveSalary={handlePayClick}
                  onDelete={handleDeleteClick}
                />
              );})}
            </div>
          )}
        </>
      )}

      {activeTab === 'ledgers' && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 18,
          }}>
            {[
              { label: 'Monthly Salary Base', value: salaryTotals.salaryBase, color: '#1d4ed8' },
              { label: 'Salary Paid', value: salaryTotals.paid, color: '#0f766e' },
              { label: 'Cash Disbursed', value: salaryTotals.disbursed, color: '#059669' },
              { label: 'Advance Salary', value: salaryTotals.advances, color: '#b45309' },
              { label: 'Current Remaining', value: salaryTotals.remaining, color: salaryTotals.remaining > 0 ? '#dc2626' : '#0f766e' },
            ].map((item) => (
              <div key={item.label} style={{ padding: 16, background: '#fff', border: '1px solid var(--border-color)', borderRadius: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: item.color, marginTop: 6 }}>PKR {item.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {salaryLedgers.map((ledger) => (
              <div key={ledger.employee.id || ledger.employee.name} style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)', background: 'linear-gradient(135deg, #eff6ff, #f8fafc)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)' }}>{ledger.employee.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ledger.employee.designation || 'Employee'} • {ledger.rows.length} payment row{ledger.rows.length !== 1 ? 's' : ''}</div>
                    </div>
                    <button className="btn btn-success btn-sm" type="button" onClick={() => handlePayClick(ledger.employee)}>
                      <IconMoney size={12} /> Pay
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                    <div style={{ padding: 10, borderRadius: 10, background: '#fff', border: '1px solid #dbeafe' }}>
                      <div style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 900 }}>PAID</div>
                      <b style={{ color: '#0f766e' }}>PKR {ledger.paid.toLocaleString()}</b>
                    </div>
                    <div style={{ padding: 10, borderRadius: 10, background: '#fff', border: '1px solid #fee2e2' }}>
                      <div style={{ fontSize: 10, color: '#b91c1c', fontWeight: 900 }}>REMAINING</div>
                      <b style={{ color: ledger.currentRemaining > 0 ? '#dc2626' : '#0f766e' }}>PKR {ledger.currentRemaining.toLocaleString()}</b>
                    </div>
                    <div style={{ padding: 10, borderRadius: 10, background: '#fff', border: '1px solid #fef3c7' }}>
                      <div style={{ fontSize: 10, color: '#b45309', fontWeight: 900 }}>ADVANCE</div>
                      <b style={{ color: '#b45309' }}>PKR {ledger.advances.toLocaleString()}</b>
                    </div>
                    <div style={{ padding: 10, borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 900 }}>LAST PAID</div>
                      <b>{ledger.lastPaid || '-'}</b>
                    </div>
                  </div>
                </div>
                <div style={{ padding: 12, maxHeight: 220, overflowY: 'auto' }}>
                  {ledger.rows.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No ledger rows yet.</div>
                  ) : (
                    [...ledger.rows]
                      .sort((a, b) => new Date(b.Date || b.date || 0) - new Date(a.Date || a.date || 0))
                      .slice(0, 8)
                      .map((row) => (
                        <div key={row.Receipt_Number || `${row.Date}-${row.Amount}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 800 }}>{row.Month || '-'} • {row.Date || '-'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.Receipt_Number || ''}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#0f766e' }}>PKR {(parseFloat(row.Salary_Paid_Amount || row.Amount) || 0).toLocaleString()}</div>
                            {(parseFloat(row.New_Advance_Given) || 0) > 0 && <div style={{ fontSize: 10, color: '#b45309' }}>Advance PKR {(parseFloat(row.New_Advance_Given) || 0).toLocaleString()}</div>}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <SalaryHistoryList
          townName={townName}
          showToast={showToast}
          onViewReceipt={handleViewHistoricalReceipt}
        />
      )}

      {activeTab === 'advances' && (
        <AdvanceSalariesList
          townName={townName}
          showToast={showToast}
        />
      )}
    </div>
  );
}
