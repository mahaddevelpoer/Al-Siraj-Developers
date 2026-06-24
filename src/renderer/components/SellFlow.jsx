import React, { useState, useEffect } from 'react';
import { useLang } from '../LanguageContext';
import { PlotIcon, ShopIcon, CalendarIcon, DollarIcon, CheckIcon, ClockIcon } from './Icons';
import OfficialReceipt from './OfficialReceipt';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';


export default function SellFlow({ showToast, loadNotifications, panel, lockedTownName = '' }) {
  const { t } = useLang();
  const { user, userProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [towns, setTowns] = useState([]);
  const [townAgents, setTownAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [useInstallment, setUseInstallment] = useState(false);
  const [propertyDetails, setPropertyDetails] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeBankName, setChequeBankName] = useState('');
  const [chequeImageDataUrl, setChequeImageDataUrl] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [transferBankName, setTransferBankName] = useState('');
  const [transferImageDataUrl, setTransferImageDataUrl] = useState('');

  const handleImageUpload = (e, setter) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(ev.target.result);
    reader.readAsDataURL(file);
  };


  const [saleReceiptData, setSaleReceiptData] = useState(null);
  const [installmentAppeal, setInstallmentAppeal] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [receiptMode, setReceiptMode] = useState('auto');
  const [autoReceiptNumber, setAutoReceiptNumber] = useState('');

  // Date change appeal state
  const [showDateChangeModal, setShowDateChangeModal] = useState(false);
  const [dateChangeTab, setDateChangeTab] = useState('otp');
  const [requestedDate, setRequestedDate] = useState('');
  const [dateChangeReason, setDateChangeReason] = useState('');
  const [dateAppealLoading, setDateAppealLoading] = useState(false);
  const [dateAppealError, setDateAppealError] = useState('');
  const [dateAppealData, setDateAppealData] = useState(null);
  const [dateOtpInput, setDateOtpInput] = useState('');
  const [dateOtpId, setDateOtpId] = useState(null);
  const [dateOtpError, setDateOtpError] = useState('');


  const [form, setForm] = useState({
    Sell_Date: new Date().toISOString().split('T')[0],
    townName: lockedTownName || '', type: 'Plot', number: '', Owner_Name: '',
    Customer_Name: '', CNIC: '', Receipt_Number: '', Phone_Number: '',
    Expected_Amount_PKR: '', Total_Amount_PKR: '', Advance_Amount_PKR: '',
    Total_Installments: '12', Total_Time_Period: '1', Period_Unit: 'Years',
    Agent_Name: '', Commission_Rate: '', Expense_Total: '0',
  });

  useEffect(() => {
    if (window.api) {
      window.api.getTowns().then(d => { if (Array.isArray(d)) setTowns(d); });
    }
  }, []);

  useEffect(() => {
    if (!lockedTownName) return;
    setForm(f => f.townName === lockedTownName ? f : ({ ...f, townName: lockedTownName }));
  }, [lockedTownName]);

  useEffect(() => {
    async function loadTownAgents() {
      if (!form.townName || !window.api?.getTownAgents) {
        setTownAgents([]);
        return;
      }
      const rows = await window.api.getTownAgents(form.townName);
      setTownAgents(Array.isArray(rows) ? rows : []);
    }
    loadTownAgents();
  }, [form.townName]);

  const u = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleTextOnly = (key) => (e) => {
    const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
    setForm(f => ({ ...f, [key]: val }));
  };

  const handleCNICChange = (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 13) val = val.slice(0, 13);
    let formatted = val;
    if (val.length > 5) {
      formatted = val.slice(0, 5) + '-' + val.slice(5);
    }
    if (val.length > 12) {
      formatted = val.slice(0, 5) + '-' + val.slice(5, 12) + '-' + val.slice(12, 13);
    }
    setForm(f => ({ ...f, CNIC: formatted }));
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 11) val = val.slice(0, 11);
    setForm(f => ({ ...f, Phone_Number: val }));
  };

  useEffect(() => {
    if (form.townName) {
      const t = towns.find(t => t.Town_Name === form.townName);
      if (t) setForm(f => ({ ...f, Commission_Rate: String(t.Commission_Rate || 0) }));
    }
  }, [form.townName, towns]);

  const approvedDateKey = (type = form.type, number = form.number, town = form.townName) =>
    `approved_sale_date_${user?.id || 'user'}_${type || ''}_${town || ''}_${number || ''}`;

  const persistApprovedSaleDate = (nextDate, appeal) => {
    if (!nextDate || !form.number || !form.type) return;
    try {
      localStorage.setItem(approvedDateKey(), JSON.stringify({
        date: nextDate,
        appealId: appeal?.id || '',
        savedAt: new Date().toISOString(),
      }));
    } catch (_) {}
  };

  const applyApprovedAppeal = (appeal) => {
    const rd = appeal?.requested_data || {};
    if (appeal?.appeal_type === 'date_change' || appeal?.appeal_type === 'date_change_otp') {
      const nextDate = rd.newDate || rd.date || rd.Sell_Date;
      if (nextDate) {
        setForm(f => ({ ...f, Sell_Date: nextDate }));
        setRequestedDate(nextDate);
        persistApprovedSaleDate(nextDate, appeal);
      }
      setShowDateChangeModal(false);
      setDateAppealData(null);
      setDateOtpId(null);
      setDateOtpInput('');
      setDateOtpError('');
      setDateAppealError('');
      setDateAppealLoading(false);
      showToast('Date change approved and applied.');
      return;
    }

    if (appeal?.appeal_type === 'custom_installment_plan') {
      setInstallmentAppeal(null);
      setOtpInput('');
      setOtpError('');
      showToast('Custom installment plan approved.');
    }
  };

  const applyRejectedAppeal = (appeal) => {
    if (appeal?.appeal_type === 'date_change' || appeal?.appeal_type === 'date_change_otp') {
      setShowDateChangeModal(false);
      setDateAppealData(null);
      setDateOtpId(null);
      setDateOtpInput('');
      setDateOtpError('');
      setDateAppealError('');
      setDateAppealLoading(false);
      showToast('Date change request was rejected by CEO.', 'error');
      return;
    }

    if (appeal?.appeal_type === 'custom_installment_plan') {
      setInstallmentAppeal(null);
      setOtpInput('');
      setOtpError('');
      showToast('Custom installment plan was rejected by CEO.', 'error');
    }
  };

  useEffect(() => {
    if (!user?.id || !form.number) return;

    const channel = supabase
      .channel(`sell-flow-appeals-${user.id}-${form.type}-${form.number}`)
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appeals',
          filter: `requested_by_user_id=eq.${user.id}`,
        },
        (payload) => {
          const appeal = payload.new;
          if (!appeal) return;
          if (appeal.entity_id !== form.number || appeal.entity_type !== form.type) return;
          if (!['date_change', 'date_change_otp', 'custom_installment_plan'].includes(appeal.appeal_type)) return;

          const status = String(appeal.status || '').trim().toLowerCase();
          if (status === 'approved') applyApprovedAppeal(appeal);
          if (status === 'rejected') applyRejectedAppeal(appeal);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, form.type, form.number]);

  useEffect(() => {
    if (!user?.id || !form.type || !form.number || !form.townName) return;
    let cancelled = false;

    const applyPersisted = () => {
      try {
        const raw = localStorage.getItem(approvedDateKey());
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved?.date) {
          setForm(f => ({ ...f, Sell_Date: saved.date }));
          setRequestedDate(saved.date);
        }
      } catch (_) {}
    };

    const loadApprovedDate = async () => {
      applyPersisted();
      const { data, error } = await supabase
        .from('appeals')
        .select('id, appeal_type, requested_data, reviewed_at, created_at, status')
        .eq('requested_by_user_id', user.id)
        .eq('entity_type', form.type)
        .eq('entity_id', form.number)
        .in('appeal_type', ['date_change', 'date_change_otp'])
        .eq('status', 'approved')
        .order('reviewed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled || error || !data?.length) return;
      const appeal = data[0];
      const rd = appeal.requested_data || {};
      const approvedDate = rd.newDate || rd.date || rd.Sell_Date;
      if (!approvedDate) return;
      setForm(f => ({ ...f, Sell_Date: approvedDate }));
      setRequestedDate(approvedDate);
      persistApprovedSaleDate(approvedDate, appeal);
    };

    loadApprovedDate().catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, form.type, form.number, form.townName]);

  useEffect(() => {
    if (!dateOtpId || !user?.id) return;
    let cancelled = false;
    const checkApproval = async () => {
      const { data, error } = await supabase
        .from('appeals')
        .select('id, appeal_type, requested_data, status')
        .eq('id', dateOtpId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const status = String(data.status || '').trim().toLowerCase();
      if (status === 'approved') applyApprovedAppeal(data);
      if (status === 'rejected') applyRejectedAppeal(data);
    };
    checkApproval().catch(() => {});
    const timer = setInterval(() => { checkApproval().catch(() => {}); }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [dateOtpId, user?.id]);

  useEffect(() => {
    if (form.townName && window.api?.generateReceiptNumber) {
      window.api.generateReceiptNumber(form.townName).then(num => {
        if (num && !num.error) {
          setAutoReceiptNumber(num);
          if (receiptMode === 'auto') {
            setForm(f => ({ ...f, Receipt_Number: num }));
          }
        }
      });
    }
  }, [form.townName]);

  useEffect(() => {
    async function fetchProp() {
      if (!form.townName || !form.number || !form.type) {
        setPropertyDetails(null);
        setForm(f => ({ ...f, Expected_Amount_PKR: '', Total_Amount_PKR: '' }));
        return;
      }
      if (window.api) {
        const res = form.type === 'Plot' 
          ? await window.api.getPlot(form.number, form.townName)
          : await window.api.getShop(form.number, form.townName);
        
        if (res && !res.error && res.Status !== 'Sold' && res.Status !== 'Resold') {
           setPropertyDetails(res);
           if (res.Total_Price) {
             setForm(f => ({
               ...f,
               Expected_Amount_PKR: String(res.Total_Price),
               Total_Amount_PKR: f.Total_Amount_PKR || String(res.Total_Price),
             }));
           }
        } else {
           setPropertyDetails(null);
           setForm(f => ({ ...f, Expected_Amount_PKR: '', Total_Amount_PKR: '' }));
        }
      }
    }
    const timer = setTimeout(fetchProp, 500);
    return () => clearTimeout(timer);
  }, [form.townName, form.number, form.type]);

  const totalAmount = parseFloat(form.Total_Amount_PKR) || 0;
  const expectedAmount = parseFloat(form.Expected_Amount_PKR) || totalAmount;
  const dealDifference = expectedAmount - totalAmount;
  const advanceAmount = parseFloat(form.Advance_Amount_PKR) || 0;
  const remaining = Math.max(0, totalAmount - advanceAmount);
  const advanceOverLimit = totalAmount > 0 && advanceAmount > totalAmount;
  const selectedPropertySize = propertyDetails
    ? (propertyDetails.Plot_Marla || propertyDetails.Shop_Marla || propertyDetails.Marla || propertyDetails.Plot_Size || propertyDetails.Shop_Size || '')
    : '';
  const selectedPropertyMeasurement = propertyDetails?.Length_Ft && propertyDetails?.Width_Ft
    ? `${propertyDetails.Length_Ft}ft x ${propertyDetails.Width_Ft}ft`
    : '';

  // Custom installment & gap calculations (Feature 3 - NO INTEREST)
  const totalInstallments = useInstallment ? (parseInt(form.Total_Installments) || 0) : 0;
  const totalTimePeriod = useInstallment ? (parseInt(form.Total_Time_Period) || 0) : 0;
  const periodUnit = form.Period_Unit || 'Months';

  let totalPeriodMonths = periodUnit === 'Years' ? totalTimePeriod * 12 : totalTimePeriod;
  let gapDays = 0;
  if (useInstallment && totalInstallments > 0 && totalPeriodMonths > 0) {
    gapDays = Math.round((totalPeriodMonths * 30) / totalInstallments);
  }

  const gapText = gapDays >= 28 && gapDays <= 31 
    ? 'Monthly' 
    : gapDays >= 85 && gapDays <= 95 
    ? 'Quarterly' 
    : `Every ${gapDays} days`;

  const monthlyInstallment = useInstallment && totalInstallments > 0 ? Math.ceil(remaining / totalInstallments) : 0;
  
  const commRate = parseFloat(form.Commission_Rate) || 0;
  const commAmount = totalAmount * (commRate / 100);
  const expense = parseFloat(form.Expense_Total) || 0;
  const companyIncome = totalAmount - commAmount;
  const profitLoss = companyIncome - expense;

  const steps = [
    {
      title: 'Basic Info',
      fields: (
        <div className="form-grid">
          <div className="form-group">
            <label>{t.date} *</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={form.Sell_Date} disabled style={{ flex: 1, opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'var(--bg-secondary)' }} />
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { setRequestedDate(form.Sell_Date); setShowDateChangeModal(true); }} style={{ whiteSpace: 'nowrap', padding: '8px 12px', fontSize: 12 }}>
                Request Change
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>{t.town} *</label>
            {lockedTownName ? (
              <input value={lockedTownName} readOnly required style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed', fontWeight: 800 }} />
            ) : (
              <select value={form.townName} onChange={u('townName')} required><option value="">{t.selectTown}</option>{towns.map((t,i) => <option key={i} value={t.Town_Name}>{t.Town_Name}</option>)}</select>
            )}
          </div>
          <div className="form-group"><label>{t.propertyType}</label><select value={form.type} onChange={u('type')}><option value="Plot">Plot</option><option value="Shop">Shop</option></select></div>
          <div className="form-group">
            <label>{form.type} {t.propertyNo} *</label>
            <input placeholder={form.type === 'Plot' ? 'e.g. 101' : 'e.g. 12'} value={form.number} onChange={u('number')} required />
          </div>
          <div className="form-group"><label>{t.ownerNameOpt.replace(' (Optional)', ' *')}</label><input placeholder="" value={form.Owner_Name} onChange={handleTextOnly('Owner_Name')} required /></div>
        </div>
      ),
    },
    {
      title: 'Customer Details',
      fields: (
        <div className="form-grid">
          <div className="form-group"><label>Customer Name *</label><input placeholder="Full name" value={form.Customer_Name} onChange={handleTextOnly('Customer_Name')} required /></div>
          <div className="form-group"><label>CNIC *</label><input placeholder="31301-0699281-9" value={form.CNIC} onChange={handleCNICChange} maxLength={15} required /></div>
          <div className="form-group full">
            <label>Receipt Number *</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              {['auto', 'manual'].map(mode => (
                <label key={mode} style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: receiptMode === mode ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)',
                  background: receiptMode === mode ? 'rgba(0,102,204,0.08)' : 'transparent',
                }}>
                  <input type="radio" name="receiptMode" value={mode} checked={receiptMode === mode}
                    onChange={() => {
                      setReceiptMode(mode);
                      if (mode === 'auto') {
                        setForm(f => ({ ...f, Receipt_Number: autoReceiptNumber }));
                      }
                    }}
                    style={{ accentColor: 'var(--accent-blue)' }}
                  />
                  {mode === 'auto' ? 'Auto' : 'Manual'}
                </label>
              ))}
            </div>
            {receiptMode === 'auto' ? (
              <input value={autoReceiptNumber} readOnly
                style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed', fontWeight: 700, letterSpacing: 1 }}
              />
            ) : (
              <input placeholder="Receipt #" value={form.Receipt_Number} onChange={u('Receipt_Number')} required />
            )}
          </div>
          <div className="form-group"><label>Phone Number *</label><input placeholder="Phone (11 digits)" value={form.Phone_Number} onChange={handlePhoneChange} maxLength={11} required /></div>
        </div>
      ),
    },
    {
      title: 'Financial Details',
      fields: (
        <div className="form-grid">
          <div className="form-group">
            <label>Expected Amount (PKR)</label>
            <input type="number" value={form.Expected_Amount_PKR} readOnly style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed', fontWeight: 800 }} />
            <div className="field-helper-text">Auto calculated from property price/size.</div>
          </div>
          <div className="form-group">
            <label>Final Deal Amount (PKR) *</label>
            <input type="number" placeholder="Final negotiated price" value={form.Total_Amount_PKR} onChange={u('Total_Amount_PKR')} required />
            {dealDifference !== 0 && (
              <div className="field-helper-text" style={{ color: dealDifference > 0 ? '#b45309' : '#0f766e', fontWeight: 800 }}>
                {dealDifference > 0 ? 'Discount' : 'Above expected'}: PKR {Math.abs(dealDifference).toLocaleString()}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Advance Amount (PKR)</label>
            <input
              type="number"
              min="0"
              max={totalAmount || undefined}
              placeholder="Advance payment"
              value={form.Advance_Amount_PKR}
              onChange={u('Advance_Amount_PKR')}
              style={advanceOverLimit ? { borderColor: '#dc2626' } : undefined}
            />
            {advanceOverLimit && <div className="field-error-text">Advance cannot be greater than total amount.</div>}
          </div>
          <div className="form-group">
            <label>Sales Agent (internal only)</label>
            <select value={form.Agent_Name} onChange={u('Agent_Name')}>
              <option value="">No agent</option>
              {townAgents.map((a) => <option key={a.Agent_ID || a.Agent_Name} value={a.Agent_Name}>{a.Agent_Name}</option>)}
            </select>
            <div className="field-helper-text">Internal commission only. Agent name will not print on the agreement.</div>
          </div>
          <div className="form-group"><label>Commission Rate (%)</label><input type="number" step="0.1" value={form.Commission_Rate} onChange={u('Commission_Rate')} disabled={panel !== 'ceo'} /></div>
          {panel !== 'employee' && <div className="form-group full"><label>Expenses (PKR)</label><input type="number" placeholder="0" value={form.Expense_Total} onChange={u('Expense_Total')} /></div>}

          <div className="form-group full">
            <div className="sale-money-strip">
              <div>
                <span>Total Price</span>
                <strong>PKR {totalAmount.toLocaleString()}</strong>
              </div>
              <div>
                <span>Received Now</span>
                <strong className="text-green">PKR {advanceAmount.toLocaleString()}</strong>
              </div>
              <div>
                <span>Pending Collection</span>
                <strong className={remaining > 0 ? 'text-red' : 'text-green'}>PKR {remaining.toLocaleString()}</strong>
              </div>
            </div>
          </div>
          
          {/* INSTALLMENT TOGGLE */}
          <div className="form-group full">
            <div className="toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="installmentToggle" className="toggle-checkbox" checked={useInstallment} onChange={e => setUseInstallment(e.target.checked)} />
              <label htmlFor="installmentToggle" style={{ cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Enable Custom Installment Plan</label>
            </div>
          </div>

          {useInstallment && (
            <>
              {/* Feature 3 Custom Installments Fields */}
              <div className="form-group">
                <label>Total Installments *</label>
                <input type="number" min="1" value={form.Total_Installments} onChange={u('Total_Installments')} required />
              </div>
              <div className="form-group" style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label>Total Time Period *</label>
                  <input type="number" min="1" value={form.Total_Time_Period} onChange={u('Total_Time_Period')} required />
                </div>
                <div style={{ width: '100px' }}>
                  <label>Unit *</label>
                  <select value={form.Period_Unit} onChange={u('Period_Unit')} style={{ height: '38px', marginTop: '0px' }}>
                    <option value="Months">Months</option>
                    <option value="Years">Years</option>
                  </select>
                </div>
              </div>

              {/* Installment Gap & Details Preview Box */}
              {totalInstallments > 0 && totalTimePeriod > 0 && (
                <div className="form-group full" style={{
                  background: 'rgba(59, 130, 246, 0.05)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#1E3A8A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    Installment Schedule Preview
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Total Installments:</span>
                      <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px' }}>{totalInstallments} installments</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Period:</span>
                      <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px' }}>{totalTimePeriod} {periodUnit} ({totalPeriodMonths} months)</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Gap:</span>
                      <strong style={{ display: 'block', color: '#2563eb', fontSize: '14px' }}>{gapText} ({gapDays} days)</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Per Installment:</span>
                      <strong style={{ display: 'block', color: '#16a34a', fontSize: '15px', fontWeight: '800' }}>PKR {monthlyInstallment.toLocaleString()}</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '6px' }}>
                    * Due dates will be calculated automatically starting {form.Sell_Date}.
                  </div>
                </div>
              )}
            </>
          )}

          {!useInstallment && (
            <div className="form-group full" style={{ background: 'rgba(33,115,70,0.08)', padding: 12, borderRadius: 8, border: '1px solid rgba(33,115,70,0.2)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, display:'flex', alignItems:'center', gap:5 }}><DollarIcon size={14}/> Lump Sum Mode — </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Remaining Balance: PKR {remaining.toLocaleString()} (due immediately)</span>
            </div>
          )}

          {/* ── Payment Method ── */}
          <div className="form-group full" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 10, display:'flex', alignItems:'center', gap:6 }}>
              Payment Method
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { value: 'Cash', label: 'Cash' },
                { value: 'Cheque', label: 'Cheque' },
                { value: 'Bank Transfer', label: 'Bank Transfer' },
              ].map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 20px', borderRadius: 10, cursor: 'pointer',
                    border: paymentMethod === opt.value ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)',
                    background: paymentMethod === opt.value ? 'rgba(0,102,204,0.08)' : 'transparent',
                    fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={opt.value}
                    checked={paymentMethod === opt.value}
                    onChange={() => setPaymentMethod(opt.value)}
                    style={{ accentColor: 'var(--accent-blue)', width: 15, height: 15 }}
                  />
                  {opt.icon} {opt.label}
                </label>
              ))}
            </div>
          </div>

          {paymentMethod === 'Cheque' && (
            <div className="form-group full" style={{
              background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-color)',
              borderRadius: 10, padding: 16, marginTop: 8,
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: 'var(--text-secondary)' }}>Cheque Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Cheque Number</label>
                  <input placeholder="e.g. 123456" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Bank Name</label>
                  <input placeholder="e.g. HBL" value={chequeBankName} onChange={e => setChequeBankName(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6 }}>Upload Cheque Image</label>
                <input type="file" accept="image/*" onChange={e => handleImageUpload(e, setChequeImageDataUrl)} />
                {chequeImageDataUrl && (
                  <div style={{ marginTop: 8 }}>
                    <img src={chequeImageDataUrl} style={{ maxWidth: 200, maxHeight: 120, border: '1px solid #ccc', borderRadius: 4 }} alt="Cheque" />
                  </div>
                )}
              </div>
            </div>
          )}

          {paymentMethod === 'Bank Transfer' && (
            <div className="form-group full" style={{
              background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-color)',
              borderRadius: 10, padding: 16, marginTop: 8,
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: 'var(--text-secondary)' }}>Bank Transfer Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Transaction ID (TID)</label>
                  <input placeholder="e.g. TID123456" value={transactionId} onChange={e => setTransactionId(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Bank Name</label>
                  <input placeholder="e.g. Meezan Bank" value={transferBankName} onChange={e => setTransferBankName(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6 }}>Upload Bank Receipt Image</label>
                <input type="file" accept="image/*" onChange={e => handleImageUpload(e, setTransferImageDataUrl)} />
                {transferImageDataUrl && (
                  <div style={{ marginTop: 8 }}>
                    <img src={transferImageDataUrl} style={{ maxWidth: 200, maxHeight: 120, border: '1px solid #ccc', borderRadius: 4 }} alt="Bank Receipt" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Review & Confirm',
      fields: (
        <div className="review-panel">
          <div className="review-row"><span className="review-label">Date</span><span className="review-value">{form.Sell_Date}</span></div>
          <div className="review-row"><span className="review-label">Town</span><span className="review-value">{form.townName}</span></div>
          <div className="review-row"><span className="review-label">{form.type} Number</span><span className="review-value">{form.number}</span></div>
          <div className="review-row"><span className="review-label">Customer</span><span className="review-value">{form.Customer_Name}</span></div>
          <div className="review-row"><span className="review-label">CNIC</span><span className="review-value">{form.CNIC}</span></div>
          <div className="review-row"><span className="review-label">Phone</span><span className="review-value">{form.Phone_Number}</span></div>
          <div className="review-row"><span className="review-label">Receipt #</span><span className="review-value">{form.Receipt_Number || '—'}</span></div>
          <div className="review-row"><span className="review-label">Total Amount</span><span className="review-value">PKR {totalAmount.toLocaleString()}</span></div>
          <div className="review-row"><span className="review-label">Advance</span><span className="review-value">PKR {advanceAmount.toLocaleString()}</span></div>
          <div className="review-row"><span className="review-label">Remaining Balance</span><span className="review-value">PKR {remaining.toLocaleString()}</span></div>
          <div className="review-row"><span className="review-label">Payment Mode</span><span className="review-value">{useInstallment ? `Custom Installments (${totalInstallments} payments over ${totalTimePeriod} ${periodUnit})` : 'Lump Sum'}</span></div>
          <div className="review-row"><span className="review-label">Payment Method</span><span className="review-value">{paymentMethod}{paymentMethod === 'Cheque' ? ` (${chequeNumber || ''})` : ''}{paymentMethod === 'Bank Transfer' ? ` (${transactionId || ''})` : ''}</span></div>
          {useInstallment && (
            <>
              <div className="review-row"><span className="review-label">Installment Gap</span><span className="review-value">{gapText} ({gapDays} days)</span></div>
              <div className="review-row"><span className="review-label">Installment Amount</span><span className="review-value text-green" style={{fontSize:16,fontWeight:900}}>PKR {monthlyInstallment.toLocaleString()}</span></div>
            </>
          )}
          <div className="review-row"><span className="review-label">Sales Agent</span><span className="review-value">{form.Agent_Name || 'N/A'} <small>(internal only)</small></span></div>
          <div className="review-row"><span className="review-label">Commission ({commRate}%)</span><span className="review-value text-red">- PKR {commAmount.toLocaleString()}</span></div>
          <div className="review-row"><span className="review-label">Expenses</span><span className="review-value text-red">- PKR {expense.toLocaleString()}</span></div>
          <div className="review-row"><span className="review-label">Company Income</span><span className="review-value text-green">PKR {companyIncome.toLocaleString()}</span></div>
          <div className="review-row review-total"><span className="review-label">Net Profit / Loss</span><span className={`review-value ${profitLoss >= 0 ? 'text-green' : 'text-red'}`} style={{fontSize:16,fontWeight:900}}>PKR {profitLoss.toLocaleString()}</span></div>
        </div>
      ),
    },
  ];

  const handleSell = async () => {
    if (!form.townName || !form.number || !form.Customer_Name || !form.CNIC || !form.Receipt_Number || !form.Phone_Number || !form.Owner_Name) {
      showToast('Please fill all required fields', 'error'); return;
    }
    if (advanceOverLimit) {
      showToast('Advance amount cannot be greater than total amount', 'error'); return;
    }
    setLoading(true);
    try {
      const effectiveReceipt = receiptMode === 'auto' && autoReceiptNumber ? autoReceiptNumber : form.Receipt_Number;
      const data = {
        type: form.type, number: form.number, townName: form.townName, ...form,
        Receipt_Number: effectiveReceipt,
        Expected_Amount_PKR: expectedAmount,
        Deal_Amount_PKR: totalAmount,
        Discount_Amount_PKR: dealDifference > 0 ? dealDifference : 0,
        useInstallment, 
        monthlyInstallment, 
        companyIncome, 
        profitLoss,
        Total_Installments: useInstallment ? totalInstallments : 0,
        Total_Period_Months: useInstallment ? totalPeriodMonths : 0,
        Gap_Days: useInstallment ? gapDays : 0,
        Gap_Label: useInstallment ? gapText : '',
        Payment_Method: paymentMethod,
        Cheque_Number: chequeNumber || '',
        Cheque_Bank: chequeBankName || '',
        Cheque_Image: chequeImageDataUrl || '',
        Transaction_ID: transactionId || '',
        Transfer_Bank: transferBankName || '',
        Transfer_Image: transferImageDataUrl || '',
      };
      
      const r = await window.api.sellProperty(data);
      if (r?.error) {
        showToast(r.error, 'error');
      } else {
        showToast(`${form.type} ${form.number} sold successfully!`);
        try { localStorage.removeItem(approvedDateKey()); } catch (_) {}
        if (window.api?.sendSaleEmail) {
          window.api.sendSaleEmail({
            propertyType: form.type,
            propertyNumber: form.number,
            townName: form.townName,
            customerName: form.Customer_Name,
            totalAmount: form.Total_Amount_PKR,
            agentName: form.Agent_Name,
          }).catch(() => {});
        }

        // Create appeal for custom installment plan from accountant workspace.
        if (useInstallment && panel === 'employee' && user?.id && userProfile?.role === 'accountant') {
          const otpCode = Math.random().toString().substring(2, 8);

          const appealPayload = {
            requested_by_user_id: user.id,
            requested_by_role: 'accountant',
            appeal_type: 'custom_installment_plan',
            entity_type: form.type,
            entity_id: form.number,
            town_name: form.townName,
            requested_data: {
              town: form.townName,
              customer_name: form.Customer_Name,
              total_amount: form.Total_Amount_PKR,
              total_installments: totalInstallments,
              gap_days: gapDays,
              gap_label: gapText,
              monthly_installment: monthlyInstallment,
              accountant_name: userProfile?.full_name || user?.email || 'Accountant',
              sell_date: form.Sell_Date,
            },
            reason: `Custom Installment Plan for ${form.type} ${form.number} in ${form.townName}`,
            status: 'pending',
            otp_code: otpCode,
          };

          const { data: existingPending } = await supabase
            .from('appeals')
            .select('id')
            .eq('requested_by_user_id', user.id)
            .eq('entity_id', form.number)
            .eq('appeal_type', 'custom_installment_plan')
            .eq('status', 'pending')
            .maybeSingle();

          let appealData;
          if (existingPending) {
            await supabase.from('appeals').update({ otp_code: otpCode }).eq('id', existingPending.id);
            appealData = { id: existingPending.id, ...appealPayload, otp_code: otpCode };
          } else {
            const { data: inserted } = await supabase.from('appeals').insert([appealPayload]).select().single();
            appealData = inserted;
          }

          if (appealData) {
            setInstallmentAppeal(appealData);
            if (window.api?.sendInstallmentOtpEmail) {
              window.api.sendInstallmentOtpEmail({
                otpCode,
                agentName: userProfile?.full_name || 'Accountant',
                agentTown: form.townName,
                propertyType: form.type,
                propertyNumber: form.number,
                customerName: form.Customer_Name,
                totalInstallments,
                monthlyInstallment,
              }).catch(() => {});
            }
          }
        }

        setSaleReceiptData({
          ...r,
          type: form.type,
          number: form.number,
          townName: form.townName,
          propertyCategory: propertyDetails?.Property_Category || 'Residential',
          paymentMethod,
          chequeNumber,
          chequeBankName,
          chequeImageDataUrl,
          transactionId,
          transferBankName,
          transferImageDataUrl,
          Receipt_Number: effectiveReceipt,
          receiptNumber: effectiveReceipt,
          Agent_Name: '',
          agentName: '',
          measurement: selectedPropertyMeasurement,
          Length_Ft: propertyDetails?.Length_Ft || '',
          Width_Ft: propertyDetails?.Width_Ft || '',
          Area_Sqft: propertyDetails?.Area_Sqft || '',
        });
        loadNotifications?.();
      }
    } catch (e) { 
      showToast('Sale failed', 'error'); 
    }
    setLoading(false);
  };

  const handleReceiptClose = () => {
    setSaleReceiptData(null);
    setStep(0);
    setOtpInput('');
    setOtpError('');
    setUseInstallment(false);
    setPaymentMethod('Cash');
    setChequeNumber('');
    setChequeBankName('');
    setChequeImageDataUrl('');
    setTransactionId('');
    setTransferBankName('');
    setTransferImageDataUrl('');
    setReceiptMode('auto');
    setAutoReceiptNumber('');
    setForm({ 
      Sell_Date: new Date().toISOString().split('T')[0], 
      townName: lockedTownName || '', type: 'Plot', number: '', Owner_Name: '', 
      Customer_Name: '', CNIC: '', Receipt_Number: '', Phone_Number: '', 
    Expected_Amount_PKR: '', Total_Amount_PKR: '', Advance_Amount_PKR: '',
      Total_Installments: '12', Total_Time_Period: '1', Period_Unit: 'Years', 
      Agent_Name: '', Commission_Rate: '', Expense_Total: '0' 
    });
  };

  // ─── Date Change: Request OTP (Quick Verify) ─────────────────────────
  const handleRequestDateOtp = async () => {
    if (!requestedDate) { setDateAppealError('Please select a new date'); return; }
    setDateAppealLoading(true);
    setDateAppealError('');
    try {
      const otpCode = Math.random().toString().substring(2, 8);

      // Delete any existing pending appeal for same user+property+type to avoid duplicate
      await supabase
        .from('appeals')
        .delete()
        .eq('requested_by_user_id', user?.id)
        .eq('entity_id', form.number)
        .eq('appeal_type', 'date_change_otp')
        .eq('status', 'pending');

      const { data, error } = await supabase.from('appeals').insert([{
        requested_by_user_id: user?.id,
        requested_by_role: 'agent',
        appeal_type: 'date_change_otp',
        entity_type: form.type,
        entity_id: form.number,
        town_name: form.townName,
        requested_data: { newDate: requestedDate, town: form.townName, townName: form.townName },
        reason: `Date change: ${form.Sell_Date} → ${requestedDate}`,
        status: 'pending',
        otp_code: otpCode,
      }]).select().single();
      if (error) throw error;

      setDateAppealData(data);
      setDateOtpId(data.id);

      if (window.api?.sendDateChangeOtpEmail) {
        window.api.sendDateChangeOtpEmail({
          otpCode,
          agentName: form.Agent_Name || 'Agent',
          agentTown: form.townName,
          currentDate: form.Sell_Date,
          newDate: requestedDate,
          propertyType: form.type,
          propertyNumber: form.number,
        }).catch(() => {});
      }
    } catch (e) {
      setDateAppealError(e.message);
    }
    setDateAppealLoading(false);
  };

  // ─── Date Change: Verify OTP ─────────────────────────────────────────
  const handleVerifyDateOtp = async () => {
    if (!dateOtpInput.trim()) { setDateOtpError('Please enter OTP'); return; }
    setDateAppealLoading(true);
    setDateOtpError('');
    try {
      const { data, error } = await supabase
        .from('appeals')
        .select('otp_code, status')
        .eq('id', dateOtpId)
        .single();
      if (error) throw error;
      if (!data || !data.otp_code) { setDateOtpError('OTP not found'); setDateAppealLoading(false); return; }
      if (data.status !== 'pending') { setDateOtpError('This request has already been processed'); setDateAppealLoading(false); return; }

      const dbOtp = String(data.otp_code).trim();
      const localOtp = String(dateAppealData?.otp_code || '').trim();
      const userOtp = dateOtpInput.trim();

      if (dbOtp !== userOtp && localOtp !== userOtp) {
        setDateOtpError('Invalid OTP');
        setDateAppealLoading(false);
        return;
      }

      await supabase.from('appeals').update({ status: 'approved', otp_code: null }).eq('id', dateOtpId);

      setForm(f => ({ ...f, Sell_Date: requestedDate }));
      persistApprovedSaleDate(requestedDate, { id: dateOtpId });
      setShowDateChangeModal(false);
      setDateAppealData(null);
      setDateOtpId(null);
      setDateOtpInput('');
      setDateOtpError('');
      setDateAppealError('');
      setDateAppealLoading(false);
      showToast('Date changed successfully!');
    } catch (e) {
      setDateOtpError(e.message || 'Verification failed');
      setDateAppealLoading(false);
    }
  };

  // ─── Date Change: Submit Appeal to CEO Panel ─────────────────────────
  const handleSubmitDateAppeal = async () => {
    if (!requestedDate) { setDateAppealError('Please select a new date'); return; }
    if (!dateChangeReason.trim()) { setDateAppealError('Please provide a reason'); return; }
    setDateAppealLoading(true);
    setDateAppealError('');
    try {
      const { data: existingPending } = await supabase
        .from('appeals')
        .select('id')
        .eq('requested_by_user_id', user?.id)
        .eq('entity_id', form.number)
        .eq('appeal_type', 'date_change')
        .eq('status', 'pending')
        .maybeSingle();

      if (existingPending) {
        setDateAppealError('You already have a pending date change request for this property. Please wait for CEO review.');
        setDateAppealLoading(false);
        return;
      }

      const { data: insertedAppeal, error } = await supabase.from('appeals').insert([{
        requested_by_user_id: user?.id,
        requested_by_role: 'agent',
        appeal_type: 'date_change',
        entity_type: form.type,
        entity_id: form.number,
        town_name: form.townName,
        requested_data: { newDate: requestedDate, town: form.townName, townName: form.townName },
        reason: dateChangeReason,
        status: 'pending',
      }]).select().single();
      if (error) throw error;

      setDateOtpId(insertedAppeal?.id || null);
      showToast('Date change appeal submitted to CEO for review');
      setShowDateChangeModal(false);
      setDateAppealLoading(false);
      setDateChangeReason('');
    } catch (e) {
      setDateAppealError(e.message);
      setDateAppealLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!installmentAppeal || !otpInput.trim()) {
      setOtpError('Please enter the OTP');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('appeals')
        .select('otp_code, status')
        .eq('id', installmentAppeal.id)
        .single();
      if (error) throw error;
      if (!data || !data.otp_code) {
        setOtpError('OTP not found');
        return;
      }
      if (data.status !== 'pending') {
        setOtpError('This request has already been processed');
        return;
      }

      const dbOtp = String(data.otp_code).trim();
      const localOtp = String(installmentAppeal?.otp_code || '').trim();
      const userOtp = otpInput.trim();

      if (dbOtp !== userOtp && localOtp !== userOtp) {
        setOtpError('Invalid OTP');
        return;
      }
      // OTP verified → mark appeal as approved
      await supabase.from('appeals').update({ status: 'approved', otp_code: null }).eq('id', installmentAppeal.id);
      showToast('Custom Installment Plan approved by CEO!');
      setInstallmentAppeal(null);
      setOtpInput('');
      setOtpError('');
    } catch (e) {
      setOtpError(e.message || 'Verification failed');
    }
  };

  return (
    <div>
      {saleReceiptData && (
        <OfficialReceipt
          data={saleReceiptData}
          townName={saleReceiptData.townName}
          onClose={handleReceiptClose}
        />
      )}

      {/* ─── Installment Plan OTP Verification ─── */}
      {installmentAppeal && (
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
          border: '2px solid #f59e0b', borderRadius: 14, padding: 24,
          marginBottom: 24, boxShadow: '0 4px 16px rgba(245,158,11,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>⏳</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#92400e' }}>
                Custom Installment Plan — Pending Approval
              </div>
              <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>
                OTP has been sent to CEO's email. Enter it below to approve the installment plan.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#92400e', display: 'block', marginBottom: 4 }}>
                Enter OTP
              </label>
              <input
                type="text"
                placeholder="6-digit OTP"
                maxLength={6}
                value={otpInput}
                onChange={e => { setOtpInput(e.target.value); setOtpError(''); }}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: otpError ? '2px solid #ef4444' : '2px solid #f59e0b',
                  background: '#fff', fontSize: 18, fontFamily: 'monospace',
                  textAlign: 'center', letterSpacing: 4, fontWeight: 700,
                  outline: 'none',
                }}
              />
              {otpError && (
                <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
                  ❌ {otpError}
                </div>
              )}
            </div>
            <button
              onClick={handleVerifyOtp}
              className="btn btn-warning"
              style={{ height: 42, whiteSpace: 'nowrap', fontWeight: 700 }}
            >
              ✅ Verify OTP
            </button>
          </div>
        </div>
      )}

      {/* ─── Date Change Request Modal ─── */}
      {showDateChangeModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
            padding: 30, maxWidth: 500, width: '100%', maxHeight: '80vh',
            overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Request Date Change</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Current Date: <strong>{form.Sell_Date}</strong>
              </p>
            </div>

            {/* Tab Switcher */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[
                { key: 'otp', label: 'Quick OTP' },
                { key: 'appeal', label: 'Appeal to CEO' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setDateChangeTab(tab.key); setDateAppealError(''); setDateAppealData(null); setDateOtpInput(''); setDateOtpError(''); setDateOtpId(null); }}
                  style={{
                    flex: 1, padding: '10px 16px', border: 'none', borderRadius: 'var(--radius-md)',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    background: dateChangeTab === tab.key ? 'var(--accent-blue)' : 'var(--border-color)',
                    color: dateChangeTab === tab.key ? 'white' : 'var(--text-primary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* New Date Input */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Requested New Date *</label>
              <input
                type="date"
                value={requestedDate}
                onChange={e => setRequestedDate(e.target.value)}
              />
            </div>

            {dateChangeTab === 'otp' && (
              <>
                {!dateAppealData ? (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                      An OTP will be sent to the CEO's email. Enter the OTP below once received from the CEO.
                    </p>
                    <button
                      onClick={handleRequestDateOtp}
                      disabled={dateAppealLoading}
                      className="btn btn-primary"
                      style={{ width: '100%', padding: 12, fontSize: 13 }}
                    >
                      {dateAppealLoading ? 'Sending OTP...' : 'Send OTP to CEO Email'}
                    </button>
                  </>
                ) : (
                  <div style={{
                    background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                    border: '2px solid #f59e0b', borderRadius: 14, padding: 20,
                    marginTop: 8, boxShadow: '0 4px 16px rgba(245,158,11,0.2)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 12 }}>
                      ⏳ OTP Sent to CEO — Enter OTP to Verify
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          placeholder="6-digit OTP"
                          maxLength={6}
                          value={dateOtpInput}
                          onChange={e => { setDateOtpInput(e.target.value); setDateOtpError(''); }}
                          style={{
                            width: '100%', padding: '10px 12px', borderRadius: 8,
                            border: dateOtpError ? '2px solid #ef4444' : '2px solid #f59e0b',
                            background: '#fff', fontSize: 18, fontFamily: 'monospace',
                            textAlign: 'center', letterSpacing: 4, fontWeight: 700,
                            outline: 'none',
                          }}
                        />
                        {dateOtpError && (
                          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
                            ❌ {dateOtpError}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleVerifyDateOtp}
                        disabled={dateAppealLoading}
                        className="btn btn-warning"
                        style={{ height: 42, whiteSpace: 'nowrap', fontWeight: 700 }}
                      >
                        {dateAppealLoading ? '...' : 'Verify'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {dateChangeTab === 'appeal' && (
              <>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Reason for Change *</label>
                  <textarea
                    value={dateChangeReason}
                    onChange={e => setDateChangeReason(e.target.value)}
                    required
                    placeholder="Explain why the date needs to be changed..."
                    style={{ minHeight: 80 }}
                  />
                </div>
                <button
                  onClick={handleSubmitDateAppeal}
                  disabled={dateAppealLoading}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: 12, fontSize: 13 }}
                >
                  {dateAppealLoading ? 'Submitting...' : 'Submit Appeal to CEO Panel'}
                </button>
              </>
            )}

            {dateAppealError && (
              <div style={{
                padding: 10, background: '#fee2e2', color: '#991b1b',
                borderRadius: 'var(--radius-sm)', marginTop: 12, fontSize: 12,
              }}>
                ❌ {dateAppealError}
              </div>
            )}

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                onClick={() => { setShowDateChangeModal(false); setDateAppealData(null); setDateOtpId(null); setDateOtpInput(''); setDateOtpError(''); setDateAppealError(''); }}
                className="btn btn-ghost"
                style={{ padding: '8px 24px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="steps-indicator">
        {steps.map((_, i) => <div key={i} className={`step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />)}
      </div>
      
      <div className="form-container">
        <div className="form-title" style={{ fontSize: 15 }}>Step {step + 1} of {steps.length}: {steps[step].title}</div>
        
        {/* Dynamic Property Info Card at the top of Basic Info / Financials if property is found */}
        {propertyDetails && step <= 2 && (
          <div className="sale-property-card">
            <div style={{ fontSize: 32, display:'flex', alignItems:'center', color: form.type === 'Plot' ? '#3b82f6' : '#8b5cf6' }}>
              {form.type === 'Plot' ? <PlotIcon size={32}/> : <ShopIcon size={32}/>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-blue)', marginBottom: 4 }}>
                {t.propFound} {form.type} {form.number} ({form.townName})
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t.size}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{propertyDetails.Plot_Size || propertyDetails.Shop_Size || '—'}</div>
                </div>
                {selectedPropertyMeasurement && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Measurement</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedPropertyMeasurement}</div>
                  </div>
                )}
                {propertyDetails.Area_Sqft && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Area</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{Number(propertyDetails.Area_Sqft || 0).toLocaleString()} sqft</div>
                  </div>
                )}
                {propertyDetails.Road_Type && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t.roadType}</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{propertyDetails.Road_Type}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Total Price</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-green)' }}>
                    PKR {Number(propertyDetails.Total_Price || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ background: 'var(--accent-green)', color: 'white', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              Available
            </div>
          </div>
        )}

        <div className="step-content">{steps[step].fields}</div>
        
        <div className="flex-between mt-6">
          <button className="btn btn-ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button>
          {step < steps.length - 1
            ? <button className="btn btn-primary" onClick={() => {
                if (step === 0 && (!form.townName || !form.number || !form.Owner_Name)) {
                  showToast('Please fill all required fields in Basic Info', 'error'); return;
                }
                if (step === 1 && (!form.Customer_Name || !form.CNIC || !form.Receipt_Number || !form.Phone_Number)) {
                  showToast('Please fill all required fields in Customer Details', 'error'); return;
                }
                if (step === 2 && !form.Total_Amount_PKR) {
                  showToast('Please fill all required fields in Financial Details', 'error'); return;
                }
                if (step === 2 && advanceOverLimit) {
                  showToast('Advance amount cannot be greater than total amount', 'error'); return;
                }
                setStep(step + 1);
              }}>Next →</button>
            : <button className="btn btn-success btn-lg" onClick={handleSell} disabled={loading}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                {loading
                  ? <><ClockIcon size={13}/> Processing...</>
                  : <><CheckIcon size={13}/> Confirm Sale</>}
              </button>
          }
        </div>
      </div>
    </div>
  );
}
