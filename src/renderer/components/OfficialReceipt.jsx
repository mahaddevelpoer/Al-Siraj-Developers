import React, { useState, useRef } from 'react';
import { CrossIcon } from './Icons';

const fmtPkr = (n) => `PKR ${(parseFloat(n) || 0).toLocaleString()}`;

export default function OfficialReceipt({ data, onClose, townName }) {
  const [lang, setLang] = useState('en');
  const [printSize, setPrintSize] = useState('a4');
  const printAreaRef = useRef(null);
  const [config, setConfig] = useState(() => {
    try {
      const key = `receipt_config_${townName || data?.townName || 'default'}`;
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch { return {}; }
  });

  const saveConfig = (updates) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    const key = `receipt_config_${townName || data?.townName || 'default'}`;
    localStorage.setItem(key, JSON.stringify(newConfig));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => saveConfig({ logoDataUrl: ev.target.result });
    reader.readAsDataURL(file);
  };

  const isSalary = data?.type === 'salary';
  const isInvestor = data?.type === 'investor';
  const isConstruction = data?.type === 'construction_deal' || data?.type === 'construction_payment';
  const isResell = data?.resellMode === true;
  const propertyKind = String(data?.type || '').toLowerCase() === 'shop' ? 'Shop' : 'Plot';
  const propertyNumberLabel = lang === 'en'
    ? `${propertyKind} No:`
    : (propertyKind === 'Shop' ? 'دکان نمبر:' : 'پلاٹ نمبر:');
  const resaleInstallmentCount = Math.max(0, parseInt(data?.totalInstallments || data?.Total_Installments, 10) || 0);
  const resaleInstallmentLines = Array.from({ length: resaleInstallmentCount }, (_, idx) => idx + 1);

  const handlePrint = () => {
    let styleTag = document.getElementById('receipt-print-page-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'receipt-print-page-style';
      document.head.appendChild(styleTag);
    }
    const sizes = {
      a4: `@page { size: A4; margin: 10mm; }`,
      legal: `@page { size: Legal; margin: 10mm; }`,
      thermal: `@page { size: 80mm 297mm; margin: 5mm 10mm; }`,
    };
    styleTag.textContent = sizes[printSize] || sizes.a4;
    setTimeout(() => { window.print(); }, 50);
  };

  const sizeClass = `receipt-size-${printSize}`;

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString();

  return (
    <div className="no-print-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      padding: '20px', overflowY: 'auto'
    }}>
      <div className="no-print-modal-container" style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: '900px',
        maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>

        {/* Header / Controls (Hidden in Print) */}
        <div className="no-print" style={{ padding: '20px', borderBottom: '1px solid #eee', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLang('en')}
              >English</button>
              <button
                className={`btn ${lang === 'ur' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLang('ur')}
              >اردو</button>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginRight: 8 }}>
                <button
                  className={`btn ${printSize === 'a4' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPrintSize('a4')}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  title="A4 Paper (210x297mm)"
                >A4</button>
                <button
                  className={`btn ${printSize === 'legal' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPrintSize('legal')}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  title="Legal Paper (216x356mm)"
                >Legal</button>
                <button
                  className={`btn ${printSize === 'thermal' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPrintSize('thermal')}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  title="Thermal Receipt (80mm wide)"
                >Thermal</button>
              </div>
              <button className="btn btn-primary" onClick={handlePrint}>Print</button>
              <button className="btn btn-ghost" onClick={onClose}><CrossIcon size={16} /></button>
            </div>
          </div>

          <div style={{ background: 'white', padding: 15, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: '#64748b' }}>Receipt Header Setup</div>
            <div style={{ display: 'flex', gap: 20 }}>
               <div style={{ width: 120 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>LOGO</label>
                  <div style={{ position: 'relative', width: 80, height: 80, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden', border: '1px dashed #cbd5e1' }}>
                    {config.logoDataUrl ? (
                      <img src={config.logoDataUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>+</div>
                    )}
                    <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} title="Upload Logo" />
                  </div>
               </div>
               <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                  <div className="form-group">
                    <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8' }}>PROJECT NAME</label>
                    <input
                      placeholder="e.g. Al-Siraj Developers"
                      value={config.projectName || ''}
                      onChange={(e) => saveConfig({ projectName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8' }}>ADDRESS / CONTACT</label>
                    <input
                      placeholder="Main Chowk Iqbal Avenue..."
                      value={config.projectAddress || ''}
                      onChange={(e) => saveConfig({ projectAddress: e.target.value })}
                    />
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* Receipt Content */}
        <div ref={printAreaRef} className="official-receipt-print-wrapper" style={{ flex: 1, overflowY: 'auto', padding: printSize === 'thermal' ? '20px' : '10px', background: '#f1f5f9' }}>
          <div className={`official-receipt-print ${sizeClass}`} style={{
            background: 'white',
            width: '100%',
            minHeight: printSize === 'thermal' ? 'auto' : '1000px',
            padding: printSize === 'thermal' ? '15px' : '10px 20px 20px 20px',
            boxShadow: printSize === 'thermal' ? 'none' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            color: 'black',
            fontFamily: lang === 'ur' ? '"Noto Nastaliq Urdu", serif' : (printSize === 'thermal' ? '"Courier New", monospace' : 'inherit'),
            direction: lang === 'ur' ? 'rtl' : 'ltr',
            fontSize: printSize === 'thermal' ? 11 : undefined,
          }}>

            {isResell ? (
              /* ═══════════════════════════════════════════════════════
                 RESELL — RENEWAL AGREEMENT RECEIPT
                 ═══════════════════════════════════════════════════════ */
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                {/* ═══ HEADER — starts at page top ═══ */}
                <div style={{ textAlign: 'center' }}>
                  {config.logoDataUrl && (
                    <img src={config.logoDataUrl} style={{ height: 48, width: 48, objectFit: 'contain', marginBottom: 2 }} />
                  )}
                  <div style={{ fontSize: 17, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {config.projectName || (lang === 'en' ? 'AL-SIRAJ PROPERTIES' : 'السراج پراپرٹیز')}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4 }}>
                    {lang === 'en'
                      ? `Main Office: ${config.projectAddress || 'Mureed Chowk, Iqbal Avenue, FBR Road, Khanpur'}`
                      : `مین آفس: ${config.projectAddress || 'مریدچوک اقبال ایونیو FBR روڈ خان پور'}`
                    }
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 13, textTransform: 'uppercase', borderTop: '2px solid black', borderBottom: '2px solid black', padding: '3px 0' }}>
                    {lang === 'en' ? 'FORM: RENEWAL AGREEMENT' : 'فارم: تجدیدِ معاہدہ'} | {lang === 'en' ? 'No:' : 'نمبر:'} {data?.receiptNumber || '1010'}
                  </div>
                </div>

                {/* ═══ SCHEME & DATE ═══ */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, marginRight: 16 }}>
                    <b>{lang === 'en' ? 'Scheme / Commercial Centre Name:' : 'نام ہائی سکیم / کمرشل سنٹر:'}</b>
                    <span style={{ borderBottom: '1px solid black', display: 'inline-block', minWidth: 180, marginLeft: 4, padding: '0 4px' }}>{data?.townName || townName || ''}</span>
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <b>{lang === 'en' ? 'Date:' : 'تاریخ:'}</b>
                    <span style={{ borderBottom: '1px solid black', display: 'inline-block', minWidth: 90, marginLeft: 4, padding: '0 4px' }}>{data?.date || ''}</span>
                  </span>
                </div>

                {/* ═══ PROPERTY DETAILS ═══ */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
                  <tbody>
                    <tr>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0', fontWeight: 600, width: '16%' }}>{propertyNumberLabel}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '24%' }}>{data?.number || ''}</td>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0 2px 12px', fontWeight: 600, width: '12%' }}>{lang === 'en' ? 'Sector:' : 'Sector:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '20%' }}>{data?.sector || ''}</td>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0 2px 12px', fontWeight: 600, width: '13%' }}>{lang === 'en' ? 'Road:' : 'Road:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '15%' }}>{data?.roadType || ''}</td>
                    </tr>
                  </tbody>
                </table>
                <table style={{ display: 'none', width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
                  <tbody>
                    <tr>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0', fontWeight: 600, width: '12%' }}>{lang === 'en' ? 'Plot No:' : 'پلاٹ نمبر:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '13%' }}>{data?.type === 'Plot' ? data?.number : ''}</td>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0 2px 12px', fontWeight: 600, width: '12%' }}>{lang === 'en' ? 'Shop No:' : 'دکان نمبر:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '13%' }}>{data?.type === 'Shop' ? data?.number : ''}</td>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0 2px 12px', fontWeight: 600, width: '10%' }}>{lang === 'en' ? 'Sector:' : 'سیکٹر:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '13%' }}>{data?.sector || ''}</td>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0 2px 12px', fontWeight: 600, width: '12%' }}>{lang === 'en' ? 'Payment:' : 'پیئمنٹ:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '15%' }}>{data?.payment || ''}</td>
                    </tr>
                  </tbody>
                </table>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
                  <tbody>
                    <tr>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0', fontWeight: 600, width: '18%' }}>{lang === 'en' ? 'Property Type:' : 'سکنی/کمرشل:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '15%', fontWeight: 600 }}>{data?.propertyCategory || 'Residential'}</td>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0 2px 12px', fontWeight: 600, width: '15%' }}>{lang === 'en' ? 'Total Area:' : 'کل رقبہ:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '13%' }}>{data?.plotSize || ''}</td>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0 2px 12px', fontWeight: 600, width: '17%' }}>{lang === 'en' ? 'Paid Amount:' : 'ادا شدہ:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', width: '22%', fontWeight: 700, color: '#16a34a' }}>{fmtPkr(data?.paidAmount || data?.totalAmount)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2}></td>
                      <td style={{ whiteSpace: 'nowrap', padding: '2px 0 2px 12px', fontWeight: 600 }}>{lang === 'en' ? 'Remaining:' : 'بقایا:'}</td>
                      <td style={{ borderBottom: '1px solid black', padding: '2px 4px', fontWeight: 700, color: '#dc2626' }}>{fmtPkr(data?.remainingAmount || 0)}</td>
                      <td colSpan={4}></td>
                    </tr>
                  </tbody>
                </table>

                {/* ═══ PAYMENT DETAILS ═══ */}
                <div style={{ border: '1px solid #000', borderRadius: 6, padding: '8px 12px', marginBottom: 6, fontSize: 11 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{lang === 'en' ? 'PAYMENT DETAILS' : 'ادائیگی کی تفصیل'}</div>
                  <div><strong>{lang === 'en' ? 'Payment Method:' : 'ادائیگی کا طریقہ:'}</strong> {
                    lang === 'en'
                      ? (data?.paymentMethod || 'Cash')
                      : data?.paymentMethod === 'Cash' ? 'نقد'
                        : data?.paymentMethod === 'Cheque' ? 'چیک'
                          : data?.paymentMethod === 'Bank Transfer' ? 'بینک ٹرانسفر'
                            : (data?.paymentMethod || 'نقد')
                  }</div>
                  {(data?.paymentAccountName || data?.Payment_Account_Name) && (
                    <div><strong>{lang === 'en' ? 'Account:' : 'اکاؤنٹ:'}</strong> {data?.paymentAccountName || data?.Payment_Account_Name}</div>
                  )}
                  {data?.paymentMethod === 'Cheque' && (
                    <>
                      <div><strong>{lang === 'en' ? 'Cheque No:' : 'چیک نمبر:'}</strong> {data?.chequeNumber || ''}</div>
                      <div><strong>{lang === 'en' ? 'Bank:' : 'بینک:'}</strong> {data?.chequeBankName || ''}</div>
                      {data?.chequeImageDataUrl && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 3 }}>{lang === 'en' ? 'Cheque Image:' : 'چیک کی تصویر:'}</div>
                          <img src={data.chequeImageDataUrl} style={{ maxWidth: 180, maxHeight: 100, border: '1px solid #ccc', borderRadius: 4 }} alt="Cheque" />
                        </div>
                      )}
                    </>
                  )}
                  {data?.paymentMethod === 'Bank Transfer' && (
                    <>
                      <div><strong>{lang === 'en' ? 'Transaction ID:' : 'ٹرانزیکشن ID:'}</strong> {data?.transactionId || ''}</div>
                      <div><strong>{lang === 'en' ? 'Bank:' : 'بینک:'}</strong> {data?.transferBankName || ''}</div>
                    </>
                  )}
                </div>

                {/* ═══ BUYER 1 ═══ */}
                <div style={{ border: '1px solid black', marginBottom: 6 }}>
                  <div style={{ fontWeight: 900, fontSize: 11, textTransform: 'uppercase', background: '#e2e8f0', padding: '2px 8px', borderBottom: '1px solid black' }}>
                    {lang === 'en' ? 'BUYER 1' : 'خریدار اوّل'}
                  </div>
                  <div style={{ padding: 6 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <b style={{ whiteSpace: 'nowrap' }}>{lang === 'en' ? "Name & Father's Name:" : 'نام و پیتہ:'}</b>
                      <span style={{ borderBottom: '1px solid black', flex: 1, padding: '0 6px' }}>{data?.buyer1Name || data?.Customer_Name || ''}{data?.buyer1Father ? ` / ${data.buyer1Father}` : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <b style={{ whiteSpace: 'nowrap' }}>{lang === 'en' ? 'CNIC No:' : 'شناختی کارڈ:'}</b>
                      <span style={{ borderBottom: '1px solid black', minWidth: 140, padding: '0 6px' }}>{data?.buyer1CNIC || data?.CNIC || ''}</span>
                      <b style={{ whiteSpace: 'nowrap', marginLeft: 16 }}>{lang === 'en' ? 'Contact No:' : 'رابطہ نمبر:'}</b>
                      <span style={{ borderBottom: '1px solid black', flex: 1, padding: '0 6px' }}>{data?.buyer1Phone || data?.Phone_Number || ''}</span>
                    </div>
                  </div>
                </div>

                {/* ═══ BUYER 2 ═══ */}
                <div style={{ border: '1px solid black', marginBottom: 6 }}>
                  <div style={{ fontWeight: 900, fontSize: 11, textTransform: 'uppercase', background: '#e2e8f0', padding: '2px 8px', borderBottom: '1px solid black' }}>
                    {lang === 'en' ? 'BUYER 2' : 'خریدار دوم'}
                  </div>
                  <div style={{ padding: 6 }}>
                    {data?.buyer2Name ? (
                      <>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <b style={{ whiteSpace: 'nowrap' }}>{lang === 'en' ? "Name & Father's Name:" : 'نام و پیتہ:'}</b>
                          <span style={{ borderBottom: '1px solid black', flex: 1, padding: '0 6px' }}>{data?.buyer2Name}{data?.buyer2Father ? ` / ${data.buyer2Father}` : ''}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <b style={{ whiteSpace: 'nowrap' }}>{lang === 'en' ? 'CNIC No:' : 'شناختی کارڈ:'}</b>
                          <span style={{ borderBottom: '1px solid black', minWidth: 140, padding: '0 6px' }}>{data?.buyer2CNIC || ''}</span>
                          <b style={{ whiteSpace: 'nowrap', marginLeft: 16 }}>{lang === 'en' ? 'Contact No:' : 'رابطہ نمبر:'}</b>
                          <span style={{ borderBottom: '1px solid black', flex: 1, padding: '0 6px' }}>{data?.buyer2Phone || ''}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: '#999', textAlign: 'center', padding: '4px 0', fontSize: 11 }}>
                        {lang === 'en' ? '(Not applicable)' : '(لاگو نہیں)'}
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══ ACKNOWLEDGMENT ═══ */}
                <div style={{ borderTop: '1px solid black', borderBottom: '1px solid black', padding: '5px 0', margin: '6px 0', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                  {lang === 'en'
                    ? 'Both parties confirm they have read the above agreement in full and have signed it as proof.'
                    : 'ہر دو فریقین نے معاہدہ مذکورہ بالا کو حرف بحرف پڑھ لیا ہے اور اپنے دستخط بطور ثبوت کر دیے ہیں۔'
                  }
                </div>

                {/* ═══ SIGNATURES ═══ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, justifyContent: 'center', margin: '18px 0 12px' }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ borderTop: '1px solid black', width: '88%', margin: '42px auto 5px' }} />
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Signature - Buyer 1' : 'دستخط خریدار اوّل'}</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ borderTop: '1px solid black', width: '88%', margin: '42px auto 5px' }} />
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Signature - Buyer 2' : 'دستخط خریدار دوم'}</div>
                  </div>
                </div>

                {/* ═══ RESALE INSTALLMENT DETAILS ═══ */}
                <div style={{ border: '1px solid black', marginBottom: 6 }}>
                  <div style={{ fontWeight: 900, fontSize: 11, textTransform: 'uppercase', background: '#e2e8f0', padding: '2px 8px', borderBottom: '1px solid black' }}>
                    {lang === 'en' ? 'RESALE INSTALLMENT DETAILS' : 'دوبارہ فروخت کی تفصیل اقساط'}
                  </div>
                  <div style={{ padding: 8, minHeight: 50, fontSize: 11, whiteSpace: 'pre-wrap' }}>
                    {data?.resaleNote || (lang === 'en' ? 'No additional notes.' : 'کوئی اضافی نوٹ نہیں۔')}
                  </div>
                </div>

                {/* ═══ TERMS & CONDITIONS ═══ */}
                {resaleInstallmentLines.length > 0 && (
                  <div style={{ border: '1px solid black', marginBottom: 6, padding: '5px 8px', fontSize: 10 }}>
                    <div style={{ fontWeight: 900, marginBottom: 4 }}>{lang === 'en' ? 'Installment Schedule' : 'Installment Schedule'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '5px 14px' }}>
                      {resaleInstallmentLines.map((n) => (
                        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{n}.</span>
                          <span style={{ borderBottom: '1px solid black', flex: 1, minHeight: 12 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ border: '2px solid black', marginBottom: 6, fontSize: 10 }}>
                  <div style={{ fontWeight: 900, textTransform: 'uppercase', background: 'black', color: 'white', padding: '2px 8px', textAlign: 'center' }}>
                    {lang === 'en' ? 'TERMS & CONDITIONS' : 'شرائط'}
                  </div>
                  <ol style={{ margin: 0, padding: '4px 8px 4px 20px', fontWeight: 600, lineHeight: 1.5 }}>
                    <li>{lang === 'en' ? 'The buyer is bound to pay the remaining amount within the agreed period.' : 'خریدار اندر معیاد بقیہ رقم کی ادائیگی کا پابند ہوگا۔'}</li>
                    <li>{lang === 'en' ? 'Failure to pay will result in cancellation of the agreement and the deposit will be forfeited.' : 'عدم ادائیگی پر معاہدہ منسوخ تصور ہوگا اور بعانہ ضبط تصور ہوگا۔'}</li>
                    <li>{lang === 'en' ? 'A cancelled agreement plot cannot be challenged in any court of law.' : 'معاہدہ منسوخ پلاٹ کسی بھی عدالت میں چیلنج نہیں کیا جاسکے گا۔'}</li>
                    <li>{lang === 'en' ? 'No external construction will be permitted within the four-walled town.' : 'چاردیواری ٹاؤن کی ملکیت ہوگی، کوئی توڑنے کا مجاز نہ ہوگا۔'}</li>
                    <li>{lang === 'en' ? 'The buyer may keep a lock on the gate of their house up to one foot from the town road.' : 'خریدار اپنے مکان کے گیٹ کی اونچائی ٹاؤن کی روڈ سے ایک فٹ تک رکھ سکتا ہے۔'}</li>
                    <li>{lang === 'en' ? 'The buyer cannot use the plot as a passage/road.' : 'خریدار پلاٹ کو بطور راستہ استعمال نہیں کرسکتا۔'}</li>
                    <li>{lang === 'en' ? 'No farming or keeping of animals of any kind is permitted inside the town.' : 'ٹاؤن کے اندر کسی بھی قسم کے جانوروں کی فارمنگ کی اجازت نہیں ہے۔'}</li>
                  </ol>
                </div>

                {/* ═══ DIRECTOR'S SIGNATURE ═══ */}
                <div style={{ borderTop: '2px solid black', borderBottom: '2px solid black', padding: '6px 4px', fontSize: 11, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'none' }}>
                    {lang === 'en' ? "Director's Signature:" : 'دستخط ڈائریکٹر:'}
                    <span style={{ borderBottom: '1px solid black', display: 'inline-block', minWidth: 140, marginLeft: 4, padding: '0 6px' }}></span>
                  </span>
                  <span>
                    {lang === 'en' ? 'Buyer 1 / Buyer 2 Signatures:' : 'Buyer 1 / Buyer 2 Signatures:'}
                    <span style={{ borderBottom: '1px solid black', display: 'inline-block', minWidth: 220, marginLeft: 4, padding: '0 6px' }}></span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    {lang === 'en' ? 'Contact:' : 'رابطہ:'} Administration
                  </span>
                </div>
              </div>
            ) : isInvestor ? (
              <div style={{
                fontSize: printSize === 'thermal' ? 10 : 14,
                lineHeight: printSize === 'thermal' ? 1.6 : 2,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: printSize === 'thermal' ? 6 : 12,
                  flexDirection: printSize === 'thermal' ? 'column' : 'row',
                  textAlign: printSize === 'thermal' ? 'center' : undefined,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexDirection: printSize === 'thermal' ? 'column' : 'row' }}>
                    {config.logoDataUrl && (
                      <img src={config.logoDataUrl} style={{ height: printSize === 'thermal' ? 40 : 60, width: printSize === 'thermal' ? 40 : 60, objectFit: 'contain' }} />
                    )}
                    <div>
                      <h1 style={{ margin: 0, fontSize: printSize === 'thermal' ? 12 : 24, fontWeight: 900, color: '#000', textTransform: 'uppercase', lineHeight: 1.2 }}>
                        {config.projectName || 'AL-SIRAJ DEVELOPERS'}
                      </h1>
                      <div style={{ fontSize: printSize === 'thermal' ? 8 : 11, color: '#000', fontWeight: 600, marginTop: printSize === 'thermal' ? 2 : 0 }}>
                        {config.projectAddress || 'Main Chowk Iqbal Avenue FBR Office Khan Pur'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: lang === 'ur' ? 'left' : 'right', marginTop: printSize === 'thermal' ? 4 : 0 }}>
                    <div style={{ fontSize: printSize === 'thermal' ? 9 : 12, fontWeight: 700 }}>{lang === 'en' ? 'Date:' : 'تاریخ:'} {data?.date}</div>
                    <div style={{ fontSize: printSize === 'thermal' ? 9 : 12, fontWeight: 700 }}>{lang === 'en' ? 'Receipt #:' : 'رسید نمبر:'} {data?.receiptNumber}</div>
                  </div>
                </div>

                <div style={{ textAlign: 'center', margin: printSize === 'thermal' ? '6px 0' : '15px 0' }}>
                  <div style={{
                    display: 'inline-block',
                    border: printSize === 'thermal' ? '1px dashed black' : '2px solid black',
                    padding: printSize === 'thermal' ? '3px 12px' : '5px 28px',
                    fontWeight: 900,
                    fontSize: printSize === 'thermal' ? 11 : 16,
                    textTransform: 'uppercase',
                    backgroundColor: printSize === 'thermal' ? 'transparent' : '#000',
                    color: printSize === 'thermal' ? '#000' : '#fff',
                  }}>
                    {data?.transactionType === 'Debit' ? 'INVESTOR DEBIT RECEIPT' : 'INVESTOR CREDIT RECEIPT'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: printSize === 'thermal' ? '1fr' : '1fr 1fr', gap: printSize === 'thermal' ? 4 : 12, marginBottom: 12 }}>
                  <div><strong>{lang === 'en' ? 'Town:' : 'ٹاؤن:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.townName || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Investor:' : 'انویسٹر:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.investorName || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Transaction:' : 'ٹرانزیکشن:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.transactionType || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Balance After:' : 'بعد کا بیلنس:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{fmtPkr(data?.balanceAfter)}</span></div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', border: printSize === 'thermal' ? '1px dashed #000' : '2px solid #000', fontSize: printSize === 'thermal' ? 10 : 13, marginBottom: 14 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #000', color: '#000', fontWeight: 900 }}>
                      <th style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'left', borderRight: '1px solid #000' }}>{lang === 'en' ? 'Description' : 'تفصیل'}</th>
                      <th style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'right' }}>{lang === 'en' ? 'Amount' : 'رقم'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', borderRight: '1px solid #000' }}>
                        {data?.transactionType === 'Debit' ? 'Investor debit / withdrawal' : 'Investor credit / investment'}
                      </td>
                      <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', textAlign: 'right', fontWeight: 900 }}>{fmtPkr(data?.amount)}</td>
                    </tr>
                    <tr style={{ background: '#e5e7eb', fontWeight: 900 }}>
                      <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', borderRight: '1px solid #000' }}>{lang === 'en' ? 'Current Investor Balance' : 'موجودہ انویسٹر بیلنس'}</td>
                      <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', textAlign: 'right' }}>{fmtPkr(data?.balanceAfter)}</td>
                    </tr>
                  </tbody>
                </table>

                {printSize !== 'thermal' && (
                  <div style={{ marginTop: 10, marginBottom: 20 }}>
                    <strong>{lang === 'en' ? 'Note:' : 'نوٹ:'}</strong>
                    <div style={{ border: '1px solid black', padding: 12, minHeight: 55, marginTop: 8 }}>{data?.note || '-'}</div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 22, marginBottom: 10 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '1px solid black', width: 150, marginTop: 30 }} />
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Investor Signature' : 'دستخط انویسٹر'}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '1px solid black', width: 150, marginTop: 30 }} />
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Accountant Signature' : 'دستخط اکاؤنٹنٹ'}</div>
                  </div>
                </div>
              </div>
            ) : isConstruction ? (
              <div style={{
                fontSize: printSize === 'thermal' ? 10 : 14,
                lineHeight: printSize === 'thermal' ? 1.6 : 2,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: printSize === 'thermal' ? 6 : 12,
                  flexDirection: printSize === 'thermal' ? 'column' : 'row',
                  textAlign: printSize === 'thermal' ? 'center' : undefined,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexDirection: printSize === 'thermal' ? 'column' : 'row' }}>
                    {config.logoDataUrl && (
                      <img src={config.logoDataUrl} style={{ height: printSize === 'thermal' ? 40 : 60, width: printSize === 'thermal' ? 40 : 60, objectFit: 'contain' }} />
                    )}
                    <div>
                      <h1 style={{ margin: 0, fontSize: printSize === 'thermal' ? 12 : 24, fontWeight: 900, color: '#000', textTransform: 'uppercase', lineHeight: 1.2 }}>
                        {config.projectName || 'AL-SIRAJ DEVELOPERS'}
                      </h1>
                      <div style={{ fontSize: printSize === 'thermal' ? 8 : 11, color: '#000', fontWeight: 600, marginTop: printSize === 'thermal' ? 2 : 0 }}>
                        {config.projectAddress || 'Main Chowk Iqbal Avenue FBR Office Khan Pur'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: lang === 'ur' ? 'left' : 'right', marginTop: printSize === 'thermal' ? 4 : 0 }}>
                    <div style={{ fontSize: printSize === 'thermal' ? 9 : 12, fontWeight: 700 }}>{lang === 'en' ? 'Date:' : 'تاریخ:'} {data?.date}</div>
                    <div style={{ fontSize: printSize === 'thermal' ? 9 : 12, fontWeight: 700 }}>{lang === 'en' ? 'Receipt #:' : 'رسید نمبر:'} {data?.receiptNumber}</div>
                  </div>
                </div>

                <div style={{ textAlign: 'center', margin: printSize === 'thermal' ? '6px 0' : '15px 0' }}>
                  <div style={{
                    display: 'inline-block',
                    border: printSize === 'thermal' ? '1px dashed black' : '2px solid black',
                    padding: printSize === 'thermal' ? '3px 12px' : '5px 28px',
                    fontWeight: 900,
                    fontSize: printSize === 'thermal' ? 11 : 16,
                    textTransform: 'uppercase',
                    backgroundColor: printSize === 'thermal' ? 'transparent' : '#000',
                    color: printSize === 'thermal' ? '#000' : '#fff',
                  }}>
                    {data?.type === 'construction_deal' ? 'CONSTRUCTION DEAL RECEIPT' : 'CONSTRUCTION PAYMENT RECEIPT'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: printSize === 'thermal' ? '1fr' : '1fr 1fr', gap: printSize === 'thermal' ? 4 : 12, marginBottom: 12 }}>
                  <div><strong>{lang === 'en' ? 'Town:' : 'ٹاؤن:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.townName || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Category:' : 'کیٹیگری:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.category || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Constructor:' : 'کنسٹرکٹر:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.constructorName || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Company:' : 'کمپنی:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.companyName || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Phone:' : 'فون:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.phoneNumber || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Material:' : 'مٹیریل:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.materialName || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Quantity:' : 'مقدار:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.materialQuantity || '-'}</span></div>
                  <div><strong>{lang === 'en' ? 'Rate:' : 'ریٹ:'}</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px' }}>{data?.materialRate || '-'}</span></div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', border: printSize === 'thermal' ? '1px dashed #000' : '2px solid #000', fontSize: printSize === 'thermal' ? 10 : 13, marginBottom: 14 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #000', color: '#000', fontWeight: 900 }}>
                      <th style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'left', borderRight: '1px solid #000' }}>{lang === 'en' ? 'Description' : 'تفصیل'}</th>
                      <th style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'right' }}>{lang === 'en' ? 'Amount' : 'رقم'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', borderRight: '1px solid #000' }}>
                        {data?.type === 'construction_deal' ? 'Final construction deal amount' : 'Construction payment paid today'}
                      </td>
                      <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', textAlign: 'right', fontWeight: 900 }}>{fmtPkr(data?.dealAmount || data?.amount)}</td>
                    </tr>
                    {data?.type === 'construction_deal' && (
                      <tr>
                        <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', borderRight: '1px solid #000' }}>{lang === 'en' ? 'Paid so far' : 'اب تک ادا شدہ'}</td>
                        <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', textAlign: 'right' }}>{fmtPkr(data?.paidAmount)}</td>
                      </tr>
                    )}
                    <tr style={{ background: '#e5e7eb', fontWeight: 900 }}>
                      <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', borderRight: '1px solid #000' }}>{lang === 'en' ? 'Remaining' : 'بقایا'}</td>
                      <td style={{ padding: printSize === 'thermal' ? '5px 6px' : '10px 12px', textAlign: 'right' }}>{fmtPkr(data?.remainingAmount)}</td>
                    </tr>
                  </tbody>
                </table>

                {printSize !== 'thermal' && (
                  <div style={{ marginTop: 10, marginBottom: 20 }}>
                    <strong>{lang === 'en' ? 'Terms / Note:' : 'شرائط / نوٹ:'}</strong>
                    <div style={{ border: '1px solid black', padding: 12, minHeight: 65, marginTop: 8 }}>
                      {data?.note || (data?.type === 'construction_deal' ? 'Constructor agrees to complete the selected construction work according to the finalized deal amount.' : '-')}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 22, marginBottom: 10 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '1px solid black', width: 150, marginTop: 30 }} />
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Constructor Signature' : 'دستخط کنسٹرکٹر'}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '1px solid black', width: 150, marginTop: 30 }} />
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Accountant Signature' : 'دستخط اکاؤنٹنٹ'}</div>
                  </div>
                </div>
              </div>
            ) : isSalary ? (
              /* ═══════════════════════════════════════════════════════
                 SALARY VOUCHER
                 ═══════════════════════════════════════════════════════ */
              <div style={{
                fontSize: printSize === 'thermal' ? 10 : 14,
                lineHeight: printSize === 'thermal' ? 1.6 : 2.2,
              }}>
                {/* Logo & Header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: printSize === 'thermal' ? 6 : 10,
                  flexDirection: printSize === 'thermal' ? 'column' : 'row',
                  textAlign: printSize === 'thermal' ? 'center' : undefined,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexDirection: printSize === 'thermal' ? 'column' : 'row' }}>
                    {config.logoDataUrl && (
                      <img src={config.logoDataUrl} style={{ height: printSize === 'thermal' ? 40 : 60, width: printSize === 'thermal' ? 40 : 60, objectFit: 'contain' }} />
                    )}
                    <div>
                      <h1 style={{ margin: 0, fontSize: printSize === 'thermal' ? 12 : 24, fontWeight: 900, color: '#000', textTransform: 'uppercase', lineHeight: 1.2 }}>
                        {config.projectName || 'AL-SIRAJ DEVELOPERS'}
                      </h1>
                      <div style={{ fontSize: printSize === 'thermal' ? 8 : 11, color: '#000', fontWeight: 600, marginTop: printSize === 'thermal' ? 2 : 0 }}>
                        {config.projectAddress || 'Main Chowk Iqbal Avenue FBR Office Khan Pur'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: lang === 'ur' ? 'left' : 'right', marginTop: printSize === 'thermal' ? 4 : 0 }}>
                    <div style={{ fontSize: printSize === 'thermal' ? 9 : 12, fontWeight: 700 }}>{lang === 'en' ? 'Date:' : 'تاریخ:'} {data?.date || data?.Sell_Date}</div>
                    <div style={{ fontSize: printSize === 'thermal' ? 9 : 12, fontWeight: 700 }}>{lang === 'en' ? 'Receipt #:' : 'رسید نمبر:'} {data?.receiptNumber || '017'}</div>
                  </div>
                </div>

                {printSize !== 'thermal' && (
                  <>
                    <div style={{ textAlign: 'center', margin: '15px 0' }}>
                      <div style={{ display: 'inline-block', border: '2px solid black', padding: '4px 25px', fontWeight: 900, fontSize: 16, textTransform: 'uppercase', backgroundColor: '#000', color: '#fff' }}>
                        {lang === 'en' ? 'SALARY VOUCHER' : 'تنخواہ کا واؤچر'}
                      </div>
                    </div>
                    <div style={{ borderBottom: '1px solid black', marginBottom: 20 }} />
                  </>
                )}

                {printSize === 'thermal' && (
                  <div style={{ textAlign: 'center', margin: '6px 0', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0' }}>
                    <div style={{ fontWeight: 900, fontSize: 11, textTransform: 'uppercase' }}>SALARY VOUCHER</div>
                  </div>
                )}

                <div style={{ display: 'flex', marginBottom: printSize === 'thermal' ? 4 : 10 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Employee:' : 'ملازم:'}</span>
                    <span style={{ borderBottom: '1px solid black', display: 'inline-block', padding: '0 8px' }}>{data?.employeeName}</span>
                  </div>
                </div>

                {printSize !== 'thermal' && (
                  <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Designation:' : 'عہدہ:'}</span>
                      <span style={{ borderBottom: '1px solid black', display: 'inline-block', padding: '0 10px' }}>{data?.designation || 'Staff'}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Month:' : 'مہینہ:'}</span>
                      <span style={{ borderBottom: '1px solid black', display: 'inline-block', padding: '0 10px' }}>{data?.month}</span>
                    </div>
                  </div>
                )}

                {printSize === 'thermal' && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Month:' : 'مہینہ:'}</span>
                    <span style={{ borderBottom: '1px solid black', padding: '0 8px' }}>{data?.month}</span>
                  </div>
                )}

                <div style={{ marginTop: printSize === 'thermal' ? 8 : 15, marginBottom: printSize === 'thermal' ? 8 : 15 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', border: printSize === 'thermal' ? '1px dashed #000' : '2px solid #000', fontSize: printSize === 'thermal' ? 10 : 13 }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #000', color: '#000', fontWeight: 900 }}>
                        <th style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'left', borderRight: printSize === 'thermal' ? '1px dashed #000' : '1px solid #000' }}>
                          {lang === 'en' ? 'Description' : 'تفصیل'}
                        </th>
                        <th style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'right' }}>
                          {lang === 'en' ? 'Amount (PKR)' : 'رقم (روپے)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #000' }}>
                        <td style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', borderRight: printSize === 'thermal' ? '1px dashed #000' : '1px solid #000' }}>
                          {lang === 'en' ? 'Base Salary' : 'بنیادی تنخواہ'}
                        </td>
                        <td style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                          {fmtPkr(data?.baseSalary || data?.amount || 0)}
                        </td>
                      </tr>
                      {data?.advanceDeduction > 0 && (
                        <tr style={{ borderBottom: '1px solid #000', color: '#dc2626' }}>
                          <td style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', borderRight: printSize === 'thermal' ? '1px dashed #000' : '1px solid #000' }}>
                            {lang === 'en' ? 'Advance Salary Deduction' : 'پیشگی تنخواہ کٹوتی'}
                          </td>
                          <td style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                            -{fmtPkr(data?.advanceDeduction)}
                          </td>
                        </tr>
                      )}
                      {data?.advanceDeduction > 0 && (
                        <tr style={{ borderBottom: '1px solid #000', fontWeight: 700 }}>
                          <td style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', borderRight: printSize === 'thermal' ? '1px dashed #000' : '1px solid #000' }}>
                            {lang === 'en' ? 'Net Salary' : 'نیٹ تنخواہ'}
                          </td>
                          <td style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {fmtPkr((data?.baseSalary || data?.amount || 0) - data?.advanceDeduction)}
                          </td>
                        </tr>
                      )}
                      {data?.newAdvanceGiven > 0 && (
                        <tr style={{ borderBottom: '1px solid #000', color: '#2563eb' }}>
                          <td style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', borderRight: printSize === 'thermal' ? '1px dashed #000' : '1px solid #000' }}>
                            {lang === 'en' ? 'New Advance Salary Given' : 'نئی پیشگی تنخواہ دی گئی'}
                          </td>
                          <td style={{ padding: printSize === 'thermal' ? '4px 6px' : '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                            +{fmtPkr(data?.newAdvanceGiven)}
                          </td>
                        </tr>
                      )}
                      <tr style={{ background: '#e5e7eb', fontWeight: 900, fontSize: printSize === 'thermal' ? 11 : 15 }}>
                        <td style={{ padding: printSize === 'thermal' ? '6px' : '10px 12px', borderRight: printSize === 'thermal' ? '1px dashed #000' : '1px solid #000' }}>
                          {lang === 'en' ? 'TOTAL DISBURSED' : 'کل ادائیگی'}
                        </td>
                        <td style={{ padding: printSize === 'thermal' ? '6px' : '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {fmtPkr(data?.totalDisbursed || ((data?.baseSalary || data?.amount || 0) - (data?.advanceDeduction || 0) + (data?.newAdvanceGiven || 0)))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Signatures */}
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 20, marginBottom: 10 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '1px solid black', width: 140, marginTop: 28 }} />
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Employee Signature' : 'دستخط ملازم'}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '1px solid black', width: 140, marginTop: 28 }} />
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Accounts / Director Signature' : 'دستخط اکاؤنٹس / ڈائریکٹر'}</div>
                  </div>
                </div>

                {printSize !== 'thermal' && (
                  <div style={{ marginTop: 10 }}>
                     <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Note:' : 'نوٹ:'}</span>
                     <div style={{ border: '1px solid black', padding: 15, minHeight: 80, marginTop: 10 }}>{data?.note || '—'}</div>
                  </div>
                )}
              </div>
            ) : (
              /* ═══════════════════════════════════════════════════════
                 STANDARD PROPERTY SALE RECEIPT
                 ═══════════════════════════════════════════════════════ */
              <>
                {/* Logo & Header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: printSize === 'thermal' ? 6 : 10,
                  flexDirection: printSize === 'thermal' ? 'column' : 'row',
                  textAlign: printSize === 'thermal' ? 'center' : undefined,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexDirection: printSize === 'thermal' ? 'column' : 'row' }}>
                    {config.logoDataUrl && (
                      <img src={config.logoDataUrl} style={{ height: printSize === 'thermal' ? 40 : 60, width: printSize === 'thermal' ? 40 : 60, objectFit: 'contain' }} />
                    )}
                    <div>
                      <h1 style={{ margin: 0, fontSize: printSize === 'thermal' ? 12 : 24, fontWeight: 900, color: '#000', textTransform: 'uppercase', lineHeight: 1.2 }}>
                        {config.projectName || 'AL-SIRAJ DEVELOPERS'}
                      </h1>
                      <div style={{ fontSize: printSize === 'thermal' ? 8 : 11, color: '#000', fontWeight: 600, marginTop: printSize === 'thermal' ? 2 : 0 }}>
                        {config.projectAddress || 'Main Chowk Iqbal Avenue FBR Office Khan Pur'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: lang === 'ur' ? 'left' : 'right', marginTop: printSize === 'thermal' ? 4 : 0 }}>
                    <div style={{ fontSize: printSize === 'thermal' ? 9 : 12, fontWeight: 700 }}>{lang === 'en' ? 'Date:' : 'تاریخ:'} {data?.date || data?.Sell_Date}</div>
                    <div style={{ fontSize: printSize === 'thermal' ? 9 : 12, fontWeight: 700 }}>{lang === 'en' ? 'Receipt #:' : 'رسید نمبر:'} {data?.receiptNumber || '017'}</div>
                  </div>
                </div>

                {printSize !== 'thermal' && (
                  <>
                    <div style={{ textAlign: 'center', margin: '15px 0' }}>
                      <div style={{ display: 'inline-block', border: '2px solid black', padding: '4px 25px', fontWeight: 900, fontSize: 16, textTransform: 'uppercase', backgroundColor: '#000', color: '#fff' }}>
                        {isResell
                          ? (lang === 'en' ? 'RENEWAL FORM OF AGREEMENT' : 'فارم تجدید معاہدہ')
                          : (lang === 'en' ? 'PROPERTY SALE AGREEMENT' : 'معاہدہ فروخت')}
                      </div>
                    </div>
                    <div style={{ borderBottom: '1px solid black', marginBottom: 20 }} />
                  </>
                )}

                {printSize === 'thermal' && (
                  <div style={{ textAlign: 'center', margin: '6px 0', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0' }}>
                    <div style={{ fontWeight: 900, fontSize: 11, textTransform: 'uppercase' }}>SALE RECEIPT</div>
                  </div>
                )}

                {/* Property Info */}
                <div style={{ fontSize: printSize === 'thermal' ? 9 : 13, lineHeight: printSize === 'thermal' ? 1.5 : 2 }}>
                  <div style={{ marginBottom: printSize === 'thermal' ? 4 : 10 }}>
                    <span style={{ fontWeight: 700 }}>{printSize === 'thermal' ? 'Scheme:' : (lang === 'en' ? 'Name of Residential Scheme/Commercial Center:' : 'نام ہاؤسنگ سکیم/کمرشل سنٹر:')}</span>
                    <span style={{ borderBottom: '1px solid black', display: 'inline-block', flex: 1, padding: '0 10px' }}>{data?.townName}</span>
                  </div>

                  {printSize === 'thermal' ? (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>{data?.type === 'Plot' ? 'Plot #:' : 'Shop #:'}</span>
                      <span style={{ borderBottom: '1px solid black', display: 'inline-block', padding: '0 8px' }}>{data?.number || '—'}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
                      <div>
                        <span style={{ fontWeight: 700 }}>{propertyNumberLabel}</span>
                        <span style={{ borderBottom: '1px solid black', display: 'inline-block', width: '90px', textAlign: 'center' }}>{data?.number || '-'}</span>
                      </div>
                      <div>
                        <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Category:' : 'Category:'}</span>
                        <span style={{ borderBottom: '1px solid black', display: 'inline-block', width: '120px', textAlign: 'center' }}>{data?.propertyCategory || data?.Property_Category || '-'}</span>
                      </div>
                    </div>
                  )}

                  {(data?.measurement || data?.Length_Ft || data?.Width_Ft || data?.Area_Sqft) && (
                    <div style={{ marginBottom: printSize === 'thermal' ? 4 : 10 }}>
                      <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Measurement:' : 'پیمائش:'}</span>
                      <span style={{ borderBottom: '1px solid black', display: 'inline-block', padding: '0 8px' }}>
                        {data?.measurement || `${data?.Length_Ft || ''}ft x ${data?.Width_Ft || ''}ft`}
                        {data?.Area_Sqft ? ` (${data.Area_Sqft} sqft)` : ''}
                      </span>
                    </div>
                  )}

                  {/* Amount boxes */}
                  {(() => {
                    const expectedAmount = parseFloat(data?.expectedAmount || data?.Expected_Amount_PKR) || 0;
                    const finalAmount = parseFloat(data?.totalAmount || data?.Total_Amount_PKR) || 0;
                    const discountAmount = parseFloat(data?.discountAmount || data?.Discount_Amount_PKR) || Math.max(0, expectedAmount - finalAmount);
                    if (expectedAmount <= 0 && discountAmount <= 0) return null;
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: printSize === 'thermal' ? '1fr' : 'repeat(3, 1fr)', gap: printSize === 'thermal' ? 4 : 10, marginBottom: printSize === 'thermal' ? 6 : 10, fontSize: printSize === 'thermal' ? 8 : 11 }}>
                        <div><strong>{lang === 'en' ? 'Expected Price:' : 'Expected:'}</strong> {fmtPkr(expectedAmount || finalAmount)}</div>
                        <div><strong>{lang === 'en' ? 'Final Deal:' : 'Deal:'}</strong> {fmtPkr(finalAmount)}</div>
                        <div><strong>{lang === 'en' ? 'Discount:' : 'Discount:'}</strong> {fmtPkr(discountAmount)}</div>
                      </div>
                    );
                  })()}
                  <div style={{ display: 'grid', gridTemplateColumns: printSize === 'thermal' ? '1fr 1fr' : 'repeat(3, 1fr)', gap: printSize === 'thermal' ? 6 : 15, marginBottom: printSize === 'thermal' ? 6 : 15 }}>
                    <div style={{ border: printSize === 'thermal' ? '1px dashed black' : '1px solid black', padding: '6px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 8 : 11 }}>{lang === 'en' ? 'TOTAL' : 'کل زرپع'}</div>
                      <div style={{ fontWeight: 900, fontSize: printSize === 'thermal' ? 10 : 16 }}>{fmtPkr(data?.totalAmount || data?.Total_Amount_PKR)}</div>
                    </div>
                    <div style={{ border: printSize === 'thermal' ? '1px dashed black' : '1px solid black', padding: '6px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 8 : 11 }}>{lang === 'en' ? 'PAID' : 'اداشدہ'}</div>
                      <div style={{ fontWeight: 900, fontSize: printSize === 'thermal' ? 10 : 16 }}>{fmtPkr(data?.paidAmount || data?.Advance_Amount_PKR)}</div>
                    </div>
                    <div style={{ border: printSize === 'thermal' ? '1px dashed black' : '1px solid black', padding: '6px', textAlign: 'center', gridColumn: printSize === 'thermal' ? '1 / -1' : undefined }}>
                      <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 8 : 11 }}>{lang === 'en' ? 'REMAINING' : 'بقایا'}</div>
                      <div style={{ fontWeight: 900, fontSize: printSize === 'thermal' ? 10 : 16 }}>{fmtPkr(data?.remainingAmount || (parseFloat(data?.Total_Amount_PKR) - parseFloat(data?.Advance_Amount_PKR)))}</div>
                    </div>
                  </div>

                  {/* Customer info */}
                  {printSize === 'thermal' ? (
                    <div style={{ borderTop: '1px dashed black', borderBottom: '1px dashed black', padding: '4px 0', margin: '6px 0' }}>
                      <div><span style={{ fontWeight: 700 }}>Customer:</span> {data?.Customer_Name}</div>
                      <div><span style={{ fontWeight: 700 }}>CNIC:</span> {data?.CNIC}</div>
                      <div><span style={{ fontWeight: 700 }}>Phone:</span> {data?.Phone_Number}</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ marginBottom: 10 }}>
                        <span style={{ fontWeight: 700 }}>{lang === 'en' ? "Name with Father's Name of Buyer 1:" : 'نام وپتہ خریدار اول:'}</span>
                        <span style={{ borderBottom: '1px solid black', display: 'inline-block', flex: 1, width: '70%', padding: '0 10px' }}>{data?.Customer_Name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                        <div>
                          <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'CNIC No:' : 'شناختی کارڈ نمبر:'}</span>
                          <span style={{ borderBottom: '1px solid black', padding: '0 10px' }}>{data?.CNIC}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Phone:' : 'رابطہ نمبر:'}</span>
                          <span style={{ borderBottom: '1px solid black', padding: '0 10px' }}>{data?.Phone_Number}</span>
                        </div>
                      </div>
                    </>
                  )}

                  {data?.buyer2Name && (
                    printSize === 'thermal' ? (
                      <div style={{ borderBottom: '1px dashed black', padding: '4px 0', margin: '4px 0' }}>
                        <div><span style={{ fontWeight: 700 }}>Buyer 2:</span> {data?.buyer2Name}</div>
                        {data?.buyer2CNIC && <div><span style={{ fontWeight: 700 }}>CNIC:</span> {data?.buyer2CNIC}</div>}
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontWeight: 700 }}>{lang === 'en' ? "Name with Father's Name of Buyer 2:" : 'نام وپتہ خریدار دوئم:'}</span>
                          <span style={{ borderBottom: '1px solid black', display: 'inline-block', flex: 1, width: '70%', padding: '0 10px' }}>{data?.buyer2Name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                          <div>
                            <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'CNIC No:' : 'شناختی کارڈ نمبر:'}</span>
                            <span style={{ borderBottom: '1px solid black', padding: '0 10px' }}>{data?.buyer2CNIC}</span>
                          </div>
                          {data?.buyer2Phone && (
                            <div>
                              <span style={{ fontWeight: 700 }}>{lang === 'en' ? 'Phone:' : 'رابطہ نمبر:'}</span>
                              <span style={{ borderBottom: '1px solid black', padding: '0 10px' }}>{data?.buyer2Phone}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )
                  )}

                  {/* ═══ PAYMENT DETAILS ═══ */}
                  {data?.paymentMethod && (
                    <div style={{ border: '1px solid #000', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11 }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>{lang === 'en' ? 'PAYMENT DETAILS' : 'ادائیگی کی تفصیل'}</div>
                      <div><strong>{lang === 'en' ? 'Payment Method:' : 'ادائیگی کا طریقہ:'}</strong> {
                        lang === 'en'
                          ? (data?.paymentMethod || 'Cash')
                          : data?.paymentMethod === 'Cash' ? 'نقد'
                            : data?.paymentMethod === 'Cheque' ? 'چیک'
                              : data?.paymentMethod === 'Bank Transfer' ? 'بینک ٹرانسفر'
                                : (data?.paymentMethod || 'نقد')
                      }</div>
                      {(data?.paymentAccountName || data?.Payment_Account_Name) && (
                        <div><strong>{lang === 'en' ? 'Account:' : 'اکاؤنٹ:'}</strong> {data?.paymentAccountName || data?.Payment_Account_Name}</div>
                      )}
                      {data?.paymentMethod === 'Cheque' && (
                        <>
                          <div><strong>{lang === 'en' ? 'Cheque No:' : 'چیک نمبر:'}</strong> {data?.chequeNumber || ''}</div>
                          <div><strong>{lang === 'en' ? 'Bank:' : 'بینک:'}</strong> {data?.chequeBankName || ''}</div>
                          {data?.chequeImageDataUrl && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 3 }}>{lang === 'en' ? 'Cheque Image:' : 'چیک کی تصویر:'}</div>
                              <img src={data.chequeImageDataUrl} style={{ maxWidth: 180, maxHeight: 100, border: '1px solid #ccc', borderRadius: 4 }} alt="Cheque" />
                            </div>
                          )}
                        </>
                      )}
                      {data?.paymentMethod === 'Bank Transfer' && (
                        <>
                          <div><strong>{lang === 'en' ? 'Transaction ID:' : 'ٹرانزیکشن ID:'}</strong> {data?.transactionId || ''}</div>
                          <div><strong>{lang === 'en' ? 'Bank:' : 'بینک:'}</strong> {data?.transferBankName || ''}</div>
    
                        </>
                      )}
                    </div>
                  )}

                  {/* Acknowledgment + Signatures */}
                  {printSize !== 'thermal' && (
                    <>
                      <div style={{ margin: '15px 0', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                        {data?.buyer2Name
                          ? (lang === 'en'
                              ? 'Both parties have signed the above agreement as proof:'
                              : 'ہر دو فریقین نے معاہدہ مذکورہ بالا کو حرف باحرف سمجھ لیا ہے اور اپنے دستخط بطور ثبوت کر دیے ہیں')
                          : (lang === 'en'
                              ? 'The above agreement has been signed by the buyer as proof:'
                              : 'خریدار نے معاہدہ مذکورہ بالا کو پڑھ لیا ہے اور بطور ثبوت دستخط کر دیے ہیں')
                        }
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: data?.buyer2Name ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 24, alignItems: 'end', marginBottom: 20 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ borderTop: '1px solid black', width: 180, marginTop: 40 }} />
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{lang === 'en' ? 'Signature Buyer 1' : 'دستخط خریدار اول'}</div>
                        </div>
                        {data?.buyer2Name && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ borderTop: '1px solid black', width: 180, marginTop: 40 }} />
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{lang === 'en' ? 'Signature Buyer 2' : 'دستخط خریدار دوئم'}</div>
                          </div>
                        )}
                      <div style={{ textAlign: 'center' }}>
                          <div style={{ borderTop: '2px solid black', width: 180, marginTop: 40 }} />
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{lang === 'en' ? "Director's Signature" : '????? ????????'}</div>
                        </div>
                      </div>

                      {/* Terms & Conditions */}
                      <div style={{ border: '1px solid black', padding: 15 }}>
                         <div style={{ fontWeight: 900, textDecoration: 'underline', marginBottom: 5 }}>{lang === 'en' ? 'TERMS & CONDITIONS:' : 'شرائط!'}</div>
                         <ol style={{ paddingLeft: lang === 'ur' ? 0 : 20, paddingRight: lang === 'ur' ? 20 : 0, margin: 0, fontSize: 11, fontWeight: 600 }}>
                            <li>{lang === 'en' ? 'Buyer is bound to pay remaining amount on time.' : 'خریدار اندر معیاد بقیہ رقم کی ادائیگی کا پابند ہوگا۔'}</li>
                            <li>{lang === 'en' ? 'Non-payment will cancel agreement & forfeit advance.' : 'عدم ادائیگی پر معاہدہ منسوخ ہوگا۔'}</li>
                            <li>{lang === 'en' ? 'Cancelled plot cannot be challenged in any court.' : 'معاہدہ منسوخی پلاٹ کسی بھی عدالت میں نہیں جائے گا۔'}</li>
                            <li>{lang === 'en' ? 'Four boundary walls of town are property\'s limit.' : 'چار دیواری ٹاؤن کی ملکیت ہوگی۔'}</li>
                            <li>{lang === 'en' ? 'Buyer can keep gate in own lane side of town.' : 'خریدار اپنے مکان کے گیٹ کی اونجائی ٹاؤن کی روڈ سے۔'}</li>
                            <li>{lang === 'en' ? 'Buyer cannot use plot for farming purposes.' : 'خریدار پلاٹ کو بطور راستہ استعمال نہیں کرسکتا۔'}</li>
                            <li>{lang === 'en' ? 'No permission to keep any type of animals in town.' : 'ٹاؤن کے اندر کسی भी قسم کے جانوروں کی فارمنگ نہیں ہوگی۔'}</li>
                         </ol>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Footer */}
            {printSize === 'thermal' && (
              <div style={{ marginTop: 10, borderTop: '1px dashed black', paddingTop: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 8, fontWeight: 700 }}>Thank You!</div>
                <div style={{ fontSize: 7, marginTop: 2 }}>Powered by AL SIRAJ DEVELOPERS ERP</div>
              </div>
            )}
            {printSize !== 'thermal' && !isResell && (
              <div style={{ marginTop: 40, textAlign: 'center', fontSize: 10, color: '#000', fontWeight: 700, borderTop: '1px dashed black', paddingTop: 10 }}>
                This is a computer generated document powered by AL SIRAJ DEVELOPERS ERP
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
