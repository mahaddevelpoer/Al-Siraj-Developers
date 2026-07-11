import React, { useState, useEffect } from 'react';
import { ResellIcon, ClockIcon, SearchIcon, SoldIcon, EditIcon, CheckIcon } from './Icons';
import OfficialReceipt from './OfficialReceipt';
import PaymentAccountSelect from './PaymentAccountSelect';

export default function ResellProperty({ showToast, loadNotifications, townName }) {
  const [towns, setTowns] = useState([]);
  const [selectedTown, setSelectedTown] = useState(townName || '');
  const [type, setType] = useState('Plot');
  const [number, setNumber] = useState('');
  const [property, setProperty] = useState(null);
  const [form, setForm] = useState({ Receipt_Number: '', Resell_Amount: '', Refund_Amount: '' });
  const [installmentPlan, setInstallmentPlan] = useState({ enabled: false, advanceAmount: '', totalInstallments: '', gapDays: '30' });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Receipt state
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedData, setCompletedData] = useState(null);

  // Buyer fields
  const [buyer1, setBuyer1] = useState({ name: '', fatherName: '', cnic: '', phone: '' });
  const [buyer2, setBuyer2] = useState({ name: '', fatherName: '', cnic: '', phone: '' });
  const [resaleNote, setResaleNote] = useState('');

  const handleCNICChange = (setter) => (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 13) val = val.slice(0, 13);
    let formatted = val;
    if (val.length > 5) {
      formatted = val.slice(0, 5) + '-' + val.slice(5);
    }
    if (val.length > 12) {
      formatted = val.slice(0, 5) + '-' + val.slice(5, 12) + '-' + val.slice(12, 13);
    }
    setter(prev => ({ ...prev, cnic: formatted }));
  };

  const handlePhoneChange = (setter) => (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 11) val = val.slice(0, 11);
    setter(prev => ({ ...prev, phone: val }));
  };

  // Payment Method
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeBankName, setChequeBankName] = useState('');
  const [chequeImageDataUrl, setChequeImageDataUrl] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [transferBankName, setTransferBankName] = useState('');
  const [transferImageDataUrl, setTransferImageDataUrl] = useState('');
  const [paymentAccount, setPaymentAccount] = useState(null);

  const handleImageUpload = (e, setter) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(ev.target.result);
    reader.readAsDataURL(file);
  };

  useEffect(() => { if (window.api && !townName) window.api.getTowns().then(d => { if (Array.isArray(d)) setTowns(d); }); }, [townName]);

  useEffect(() => {
    if (property) {
      setBuyer1(prev => ({
        name: prev.name || property.Customer_Name || '',
        fatherName: prev.fatherName || '',
        cnic: prev.cnic || property.CNIC || '',
        phone: prev.phone || property.Phone_Number || '',
      }));
    }
  }, [property]);

  const fetchProperty = async () => {
    if (!selectedTown || !number) { showToast('Select town and enter number', 'error'); return; }
    setFetching(true);
    try {
      const r = type === 'Plot' ? await window.api.getPlot(number, selectedTown) : await window.api.getShop(number, selectedTown);
      if (r && !r.error) {
        setProperty(r);
        setBuyer1({ name: r.Customer_Name || '', fatherName: '', cnic: r.CNIC || '', phone: r.Phone_Number || '' });
        setBuyer2({ name: '', fatherName: '', cnic: '', phone: '' });
        setResaleNote('');
      } else { showToast('Property not found', 'error'); setProperty(null); }
    } catch (e) { showToast('Error fetching', 'error'); }
    setFetching(false);
  };

  const handleResell = async () => {
    if (property && (parseFloat(property.Remaining_Amount) || 0) > 0) {
      showToast('This property cannot be resold because it has unpaid receivables/installments remaining.', 'error');
      return;
    }
    if (!form.Receipt_Number) { showToast('Receipt Number is MANDATORY', 'error'); return; }
    if (!form.Resell_Amount) { showToast('Resell Amount required', 'error'); return; }
    if (!buyer1.name) { showToast('Buyer 1 Name is required', 'error'); return; }
    if (!buyer1.cnic) { showToast('Buyer 1 CNIC is required', 'error'); return; }
    const resellAmount = parseFloat(form.Resell_Amount) || 0;
    const totalInstallments = parseInt(installmentPlan.totalInstallments, 10) || 0;
    const advanceAmount = installmentPlan.enabled ? (parseFloat(installmentPlan.advanceAmount) || 0) : resellAmount;
    const remainingAmount = Math.max(0, resellAmount - advanceAmount);
    const gapDays = parseInt(installmentPlan.gapDays, 10) || 30;
    const monthlyInstallment = installmentPlan.enabled && totalInstallments > 0 ? Math.ceil(remainingAmount / totalInstallments) : 0;
    if (installmentPlan.enabled && totalInstallments <= 0) { showToast('Total installments required', 'error'); return; }
    if (installmentPlan.enabled && advanceAmount >= resellAmount) { showToast('Advance must be less than resell amount for installments', 'error'); return; }
    setLoading(true);
    try {
      const r = await window.api.resellProperty({
        type,
        number,
        townName: selectedTown,
        ...form,
        Customer_Name: buyer1.name,
        CNIC: buyer1.cnic,
        Phone_Number: buyer1.phone,
        useInstallment: installmentPlan.enabled,
        Advance_Amount_PKR: advanceAmount,
        Total_Installments: totalInstallments,
        Total_Period_Months: totalInstallments,
        Gap_Days: gapDays,
        Gap_Label: `${gapDays} days`,
        Monthly_Installment: monthlyInstallment,
        Payment_Method: paymentMethod,
        Cheque_Number: chequeNumber,
        Cheque_Bank: chequeBankName,
        Transaction_ID: transactionId,
        Transfer_Bank: transferBankName,
        ...paymentAccount,
      });
      if (r?.error) showToast(r.error, 'error');
      else {
        showToast(`${type} ${number} resold successfully!`);
        setCompletedData({
          resellMode: true,
          type, number, townName: selectedTown,
          receiptNumber: form.Receipt_Number,
          date: new Date().toISOString().split('T')[0],
          totalAmount: form.Resell_Amount,
          paidAmount: advanceAmount,
          remainingAmount,
          useInstallment: installmentPlan.enabled,
          totalInstallments,
          monthlyInstallment,
          gapDays,
          plotSize: property?.Plot_Size || property?.Shop_Size || '',
          roadType: property?.Road_Type || '',
          sector: form.Refund_Amount ? 'Refund: PKR ' + form.Refund_Amount : '',
          propertyCategory: property?.Property_Category || 'Residential',
          buyer1Name: buyer1.name,
          buyer1Father: buyer1.fatherName,
          buyer1CNIC: buyer1.cnic,
          buyer1Phone: buyer1.phone,
          buyer2Name: buyer2.name,
          buyer2Father: buyer2.fatherName,
          buyer2CNIC: buyer2.cnic,
          buyer2Phone: buyer2.phone,
          resaleNote,
          paymentMethod,
          chequeNumber,
          chequeBankName,
          chequeImageDataUrl,
          transactionId,
          transferBankName,
          transferImageDataUrl,
          paymentAccountName: paymentAccount?.paymentAccountName,
          paymentAccountType: paymentAccount?.paymentAccountType,
        });
        setShowReceipt(true);
        setProperty(null);
        setNumber('');
        setForm({ Receipt_Number: '', Resell_Amount: '', Refund_Amount: '' });
        setInstallmentPlan({ enabled: false, advanceAmount: '', totalInstallments: '', gapDays: '30' });
        loadNotifications();
      }
    } catch (e) { showToast('Resell failed', 'error'); }
    setLoading(false);
  };

  const handleReceiptClose = () => {
    setShowReceipt(false);
    setCompletedData(null);
    setPaymentMethod('Cash');
    setChequeNumber('');
    setChequeBankName('');
    setChequeImageDataUrl('');
    setTransactionId('');
    setTransferBankName('');
    setTransferImageDataUrl('');
    setBuyer1({ name: '', fatherName: '', cnic: '', phone: '' });
    setBuyer2({ name: '', fatherName: '', cnic: '', phone: '' });
    setResaleNote('');
    setInstallmentPlan({ enabled: false, advanceAmount: '', totalInstallments: '', gapDays: '30' });
  };

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString();

  return (
    <div>
      {showReceipt && completedData && (
        <OfficialReceipt
          data={completedData}
          townName={selectedTown}
          onClose={handleReceiptClose}
        />
      )}

      <div className="form-container mb-6">
        <div className="form-title" style={{display:'flex',alignItems:'center',gap:6}}><ResellIcon size={14}/> Resell Property</div>
        <div className="form-grid">
          {!townName && <div className="form-group"><label>Town *</label><select value={selectedTown} onChange={e => setSelectedTown(e.target.value)}><option value="">Select Town</option>{towns.map((t,i) => <option key={i} value={t.Town_Name}>{t.Town_Name}</option>)}</select></div>}
          <div className="form-group"><label>Type</label><select value={type} onChange={e => setType(e.target.value)}><option>Plot</option><option>Shop</option></select></div>
          <div className="form-group"><label>{type} Number *</label><input placeholder={`Enter ${type} number`} value={number} onChange={e => setNumber(e.target.value)} /></div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn btn-primary" onClick={fetchProperty} disabled={fetching}
            style={{display:'flex',alignItems:'center',gap:5}}>
            {fetching ? <><ClockIcon size={12}/></> : <><SearchIcon size={12}/> Fetch Details</>}
          </button></div>
        </div>
      </div>

      {property && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="review-panel">
            <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 700, display:'flex',alignItems:'center',gap:5 }}><SoldIcon size={13}/> Current Property Details</h3>
            <div className="review-row"><span className="review-label">Customer</span><span className="review-value">{property.Customer_Name}</span></div>
            <div className="review-row"><span className="review-label">Sell Date</span><span className="review-value">{property.Sell_Date}</span></div>
            <div className="review-row"><span className="review-label">Total Amount</span><span className="review-value">PKR {fmt(property.Total_Amount_PKR)}</span></div>
            <div className="review-row"><span className="review-label">Received</span><span className="review-value text-green">PKR {fmt(property.Received_Amount)}</span></div>
            <div className="review-row"><span className="review-label">Remaining</span><span className="review-value text-red">PKR {fmt(property.Remaining_Amount)}</span></div>
            <div className="review-row"><span className="review-label">Size</span><span className="review-value">{property.Plot_Size || property.Shop_Size || '—'}</span></div>
            <div className="review-row"><span className="review-label">Road</span><span className="review-value">{property.Road_Type || '—'}</span></div>
            <div className="review-row"><span className="review-label">Commission</span><span className="review-value">PKR {fmt(property.Commission_Amount)}</span></div>
          </div>
          <div className="form-container">
            <div className="form-title" style={{ fontSize: 15, display:'flex',alignItems:'center',gap:5 }}><EditIcon size={12}/> Resell Details</div>
            <div className="form-grid">
              <div className="form-group full"><label>Receipt Number (MANDATORY) *</label><input placeholder="Receipt #" value={form.Receipt_Number} onChange={e => setForm({...form, Receipt_Number: e.target.value})} required /></div>
              <div className="form-group"><label>Resell Amount (PKR) *</label><input type="number" placeholder="Resell price" value={form.Resell_Amount} onChange={e => setForm({...form, Resell_Amount: e.target.value})} required /></div>
              <div className="form-group"><label>Refund Amount (PKR)</label><input type="number" placeholder="Refund to customer" value={form.Refund_Amount} onChange={e => setForm({...form, Refund_Amount: e.target.value})} /></div>
            </div>

            {/* ── Payment Method ── */}
            <div style={{ marginTop: 16, border: '1px solid var(--border-color)', borderRadius: 10, padding: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={installmentPlan.enabled}
                  onChange={e => setInstallmentPlan(prev => ({ ...prev, enabled: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent-blue)' }}
                />
                Resell on installments
              </label>
              {installmentPlan.enabled && (
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="form-group">
                    <label>Advance Amount (PKR) *</label>
                    <input type="number" placeholder="Advance received" value={installmentPlan.advanceAmount} onChange={e => setInstallmentPlan(prev => ({ ...prev, advanceAmount: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Total Installments *</label>
                    <input type="number" min="1" placeholder="e.g. 12" value={installmentPlan.totalInstallments} onChange={e => setInstallmentPlan(prev => ({ ...prev, totalInstallments: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Gap Days</label>
                    <input type="number" min="1" value={installmentPlan.gapDays} onChange={e => setInstallmentPlan(prev => ({ ...prev, gapDays: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Per Installment</label>
                    <input
                      readOnly
                      value={`PKR ${fmt(Math.ceil(Math.max(0, (parseFloat(form.Resell_Amount) || 0) - (parseFloat(installmentPlan.advanceAmount) || 0)) / (parseInt(installmentPlan.totalInstallments, 10) || 1)))}`}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 10, display:'flex', alignItems:'center', gap:6 }}>
                💳 Payment Method
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { value: 'Cash', icon: '💵', label: 'Cash' },
                  { value: 'Cheque', icon: '🏦', label: 'Cheque' },
                  { value: 'Bank Transfer', icon: '📱', label: 'Bank Transfer' },
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

            <PaymentAccountSelect
              townName={selectedTown || townName}
              value={paymentAccount}
              onChange={setPaymentAccount}
              label="Receive Resell Advance Into / Pay Refund From"
              paymentMethod={paymentMethod}
            />

            {paymentMethod === 'Cheque' && (
              <div style={{
                background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-color)',
                borderRadius: 10, padding: 16, marginTop: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: 'var(--text-secondary)' }}>🏦 Cheque Details</div>
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
              <div style={{
                background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-color)',
                borderRadius: 10, padding: 16, marginTop: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: 'var(--text-secondary)' }}>📱 Bank Transfer Details</div>
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
        </div>
      )}

      {property && (
        <div className="form-container mt-6">
          <div className="form-title" style={{ fontSize: 15, display:'flex',alignItems:'center',gap:5 }}><EditIcon size={12}/> Buyer Details (Renewal Agreement)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 16 }}>
              <h4 style={{ fontWeight: 800, fontSize: 13, marginBottom: 12, color: 'var(--accent-blue)' }}>BUYER 1 *</h4>
              <div className="form-grid">
                <div className="form-group full"><label>Name & Father's Name</label><input placeholder="Buyer 1 name & father name" value={buyer1.name} onChange={e => setBuyer1({...buyer1, name: e.target.value})} /></div>
                <div className="form-group full"><label>Father's Name (if separate)</label><input placeholder="Father's name" value={buyer1.fatherName} onChange={e => setBuyer1({...buyer1, fatherName: e.target.value})} /></div>
                <div className="form-group"><label>CNIC Number *</label><input placeholder="31301-0699281-9" value={buyer1.cnic} onChange={handleCNICChange(setBuyer1)} maxLength={15} /></div>
                <div className="form-group"><label>Contact No</label><input placeholder="Phone (11 digits)" value={buyer1.phone} onChange={handlePhoneChange(setBuyer1)} maxLength={11} /></div>
              </div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 16 }}>
              <h4 style={{ fontWeight: 800, fontSize: 13, marginBottom: 12, color: '#10b981' }}>BUYER 2 (Optional)</h4>
              <div className="form-grid">
                <div className="form-group full"><label>Name & Father's Name</label><input placeholder="Buyer 2 name & father name" value={buyer2.name} onChange={e => setBuyer2({...buyer2, name: e.target.value})} /></div>
                <div className="form-group full"><label>Father's Name (if separate)</label><input placeholder="Father's name" value={buyer2.fatherName} onChange={e => setBuyer2({...buyer2, fatherName: e.target.value})} /></div>
                <div className="form-group"><label>CNIC Number</label><input placeholder="31301-0699281-9" value={buyer2.cnic} onChange={handleCNICChange(setBuyer2)} maxLength={15} /></div>
                <div className="form-group"><label>Contact No</label><input placeholder="Phone (11 digits)" value={buyer2.phone} onChange={handlePhoneChange(setBuyer2)} maxLength={11} /></div>
              </div>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Resale Installment Details / Note (Optional)</label>
            <textarea rows={3} placeholder="Enter any resale installment details, notes or conditions..."
              value={resaleNote} onChange={e => setResaleNote(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
          <button className="btn btn-success btn-lg mt-6" onClick={handleResell} disabled={loading}
            style={{display:'flex',alignItems:'center',gap:5}}>
            {loading ? <><ClockIcon size={13}/> Processing...</> : <><CheckIcon size={13}/> Confirm Resell & Print Receipt</>}
          </button>
        </div>
      )}
    </div>
  );
}
