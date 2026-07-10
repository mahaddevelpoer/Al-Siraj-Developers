import React, { useState } from 'react';
import { CrossIcon } from './Icons';

export default function PrintReceipt({ saleData, townName, onClose }) {
  const [printSize, setPrintSize] = useState('a4');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [projectName, setProjectName] = useState('');

  React.useEffect(() => {
    const saved = localStorage.getItem(`receipt_config_${townName}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.logoDataUrl) setLogoDataUrl(parsed.logoDataUrl);
        if (parsed.projectName) setProjectName(parsed.projectName);
      } catch (e) { console.error('Failed to parse localStorage receipt config', e); }
    }
  }, [townName]);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        setLogoDataUrl(dataUrl);
        const current = { logoDataUrl: dataUrl, projectName };
        localStorage.setItem(`receipt_config_${townName}`, JSON.stringify(current));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProjectNameChange = (e) => {
    const name = e.target.value;
    setProjectName(name);
    const current = { logoDataUrl, projectName: name };
    localStorage.setItem(`receipt_config_${townName}`, JSON.stringify(current));
  };

  const handlePrint = () => {
    let styleTag = document.getElementById('receipt-print-page-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'receipt-print-page-style';
      document.head.appendChild(styleTag);
    }
    const sizes = {
      a4: `@page { size: A4; margin: 15mm; }`,
      legal: `@page { size: Legal; margin: 15mm; }`,
      thermal: `@page { size: 80mm 297mm; margin: 5mm 10mm; }`,
    };
    styleTag.textContent = sizes[printSize] || sizes.a4;
    setTimeout(() => { window.print(); }, 50);
  };

  const sizeClass = `receipt-size-${printSize}`;
  const fmtPkr = (n) => `PKR ${(parseFloat(n) || 0).toLocaleString()}`;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483647,
      padding: '20px', overflowY: 'auto'
    }} className="no-print-overlay">
      <div style={{
        background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '16px', maxWidth: '780px', width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
        maxHeight: '90vh', overflow: 'hidden'
      }} className="no-print-modal-container">

        {/* Setup and Header Controls (Hidden during print) */}
        <div style={{
          padding: '20px', borderBottom: '1px solid var(--border-color, #e0e0e0)',
          background: 'var(--bg-secondary, #f8fafc)', display: 'flex', flexDirection: 'column', gap: '12px'
        }} className="no-print">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>Receipt Header Setup</h3>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)'
            }}><CrossIcon size={14} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Upload Logo</label>
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ fontSize: '12px' }} />
              {logoDataUrl && (
                <button onClick={() => {
                  setLogoDataUrl('');
                  localStorage.setItem(`receipt_config_${townName}`, JSON.stringify({ logoDataUrl: '', projectName }));
                }} style={{
                  fontSize: '10px', color: 'var(--accent-red, #ef4444)', border: 'none', background: 'none', cursor: 'pointer', marginTop: '4px', padding: 0
                }}>Remove Logo</button>
              )}
            </div>
            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Project Name</label>
              <input
                type="text"
                placeholder="e.g. Al-Siraj Properties Zahir Peer"
                value={projectName}
                onChange={handleProjectNameChange}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid var(--border-color, #e0e0e0)',
                  borderRadius: '8px', fontSize: '12px', outline: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: 4, marginRight: 8 }}>
              <button
                className={`btn ${printSize === 'a4' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPrintSize('a4')}
                style={{ fontSize: 10, padding: '4px 8px' }}
              >A4</button>
              <button
                className={`btn ${printSize === 'legal' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPrintSize('legal')}
                style={{ fontSize: 10, padding: '4px 8px' }}
              >Legal</button>
              <button
                className={`btn ${printSize === 'thermal' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPrintSize('thermal')}
                style={{ fontSize: 10, padding: '4px 8px' }}
              >Thermal</button>
            </div>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              🖨️ Print
            </button>
          </div>
        </div>

        {/* Receipt Render Section */}
        <div style={{
          padding: printSize === 'thermal' ? '15px' : '30px', overflowY: 'auto', flex: 1, background: '#fff'
        }} className="receipt-scroll-container official-receipt-print-wrapper">

          {/* Printable Layout Container */}
          <div className={`print-receipt-area ${sizeClass}`} style={{
            background: '#fff', color: '#000',
            fontFamily: printSize === 'thermal' ? '"Courier New", monospace' : '"Plus Jakarta Sans", sans-serif',
            border: printSize === 'thermal' ? 'none' : '1px solid #000',
            padding: printSize === 'thermal' ? '10px' : '24px',
            position: 'relative',
            fontSize: printSize === 'thermal' ? 10 : undefined,
          }}>

            {/* Header Column */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              minHeight: printSize === 'thermal' ? 'auto' : '80px',
              marginBottom: printSize === 'thermal' ? 6 : '20px',
              flexDirection: printSize === 'thermal' ? 'column' : 'row',
              textAlign: printSize === 'thermal' ? 'center' : undefined,
            }}>
              <div>
                {logoDataUrl ? (
                  <img src={logoDataUrl} alt="Logo" style={{
                    maxHeight: printSize === 'thermal' ? '30px' : '70px',
                    maxWidth: printSize === 'thermal' ? '60px' : '180px',
                    objectFit: 'contain'
                  }} />
                ) : (
                  <div style={{
                    fontSize: printSize === 'thermal' ? 12 : 24,
                    fontWeight: 900,
                    letterSpacing: '-0.5px'
                  }}>
                    🏢 ZAMEEN KHATA
                  </div>
                )}
              </div>
              <div style={{ textAlign: printSize === 'thermal' ? 'center' : 'right', flex: 1, paddingLeft: printSize === 'thermal' ? 0 : '20px', marginTop: printSize === 'thermal' ? 4 : 0 }}>
                <h2 style={{
                  fontSize: printSize === 'thermal' ? 11 : 20,
                  fontWeight: 800,
                  margin: 0,
                  textTransform: 'uppercase',
                  color: '#000',
                  lineHeight: 1.2,
                }}>
                  {projectName || 'Al-Siraj Properties'}
                </h2>
                <div style={{ fontSize: printSize === 'thermal' ? 8 : 11, color: '#555', marginTop: '2px' }}>
                  Real Estate Developer & Consultant
                </div>
              </div>
            </div>

            {printSize !== 'thermal' && <div style={{ borderBottom: '3px double #000', marginBottom: '16px' }} />}

            {/* Document Title bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: printSize === 'thermal' ? 6 : '20px',
              flexDirection: printSize === 'thermal' ? 'column' : 'row',
              borderTop: printSize === 'thermal' ? '1px dashed #000' : 'none',
              borderBottom: printSize === 'thermal' ? '1px dashed #000' : 'none',
              padding: printSize === 'thermal' ? '3px 0' : 0,
            }}>
              <span style={{
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: printSize === 'thermal' ? 9 : 14,
              }}>
                PROPERTY SALE RECEIPT
              </span>
              <span style={{ fontSize: printSize === 'thermal' ? 9 : 12 }}>
                <strong>Date:</strong> {saleData?.Sell_Date || new Date().toISOString().split('T')[0]}
              </span>
            </div>

            {/* Meta Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: printSize === 'thermal' ? '1fr' : '1fr 1fr',
              gap: '8px',
              fontSize: printSize === 'thermal' ? 9 : 12,
              marginBottom: printSize === 'thermal' ? 6 : '20px',
              background: printSize === 'thermal' ? '#fff' : '#f9f9f9',
              padding: printSize === 'thermal' ? '4px 0' : '12px',
              border: printSize === 'thermal' ? 'none' : '1px solid #eee',
            }}>
              <div>
                <strong>Receipt #:</strong> {saleData?.Receipt_Number || 'Manual'}
              </div>
              <div>
                <strong>Town / Scheme:</strong> {townName || saleData?.Town_Name || 'General'}
              </div>
            </div>

            {/* Section: Property Details */}
            <div style={{ marginBottom: printSize === 'thermal' ? 4 : '16px' }}>
              <div style={{
                fontSize: printSize === 'thermal' ? 8 : 11,
                fontWeight: 900,
                textTransform: 'uppercase',
                borderBottom: printSize === 'thermal' ? '1px dashed #ccc' : '1px solid #ccc',
                paddingBottom: '3px',
                marginBottom: printSize === 'thermal' ? 3 : '8px',
              }}>
                Property Details
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: printSize === 'thermal' ? '4px 8px' : '12px 20px',
                fontSize: printSize === 'thermal' ? 9 : 12,
              }}>
                <div>
                  <span style={{ color: '#555' }}>Property Type:</span>
                  <div style={{ fontWeight: 700, fontSize: printSize === 'thermal' ? 9 : undefined }}>{saleData?.type || 'Plot'}</div>
                </div>
                <div>
                  <span style={{ color: '#555' }}>Property Number:</span>
                  <div style={{ fontWeight: 700, fontSize: printSize === 'thermal' ? 9 : undefined }}>{saleData?.number || '—'}</div>
                </div>
                <div>
                  <span style={{ color: '#555' }}>Total Size:</span>
                  <div style={{ fontWeight: 700, fontSize: printSize === 'thermal' ? 9 : undefined }}>{saleData?.Plot_Size || saleData?.Shop_Size || '—'}</div>
                </div>
              </div>
            </div>

            {/* Section: Customer Details */}
            <div style={{ marginBottom: printSize === 'thermal' ? 4 : '16px' }}>
              <div style={{
                fontSize: printSize === 'thermal' ? 8 : 11,
                fontWeight: 900,
                textTransform: 'uppercase',
                borderBottom: printSize === 'thermal' ? '1px dashed #ccc' : '1px solid #ccc',
                paddingBottom: '3px',
                marginBottom: printSize === 'thermal' ? 3 : '8px',
              }}>
                Customer Details
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: printSize === 'thermal' ? '4px 8px' : '12px 20px',
                fontSize: printSize === 'thermal' ? 9 : 12,
              }}>
                <div>
                  <span style={{ color: '#555' }}>Customer Name:</span>
                  <div style={{ fontWeight: 700, fontSize: printSize === 'thermal' ? 9 : undefined }}>{saleData?.Customer_Name || '—'}</div>
                </div>
                <div>
                  <span style={{ color: '#555' }}>CNIC Number:</span>
                  <div style={{ fontWeight: 700, fontSize: printSize === 'thermal' ? 9 : undefined }}>{saleData?.CNIC || '—'}</div>
                </div>
                <div>
                  <span style={{ color: '#555' }}>Contact Phone:</span>
                  <div style={{ fontWeight: 700, fontSize: printSize === 'thermal' ? 9 : undefined }}>{saleData?.Phone_Number || '—'}</div>
                </div>
              </div>
            </div>

            {/* Section: Payment & Deal Schedule */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: printSize === 'thermal' ? 8 : 11,
                fontWeight: 900,
                textTransform: 'uppercase',
                borderBottom: printSize === 'thermal' ? '1px dashed #ccc' : '1px solid #ccc',
                paddingBottom: '3px',
                marginBottom: printSize === 'thermal' ? 3 : '8px',
              }}>
                Payment Details
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: printSize === 'thermal' ? '1fr 1fr' : 'repeat(3, 1fr)',
                gap: printSize === 'thermal' ? '4px 8px' : '12px 20px',
                fontSize: printSize === 'thermal' ? 9 : 12,
              }}>
                <div>
                  <span style={{ color: '#555' }}>Final Deal Price:</span>
                  <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 9 : undefined }}>{fmtPkr(saleData?.Total_Amount_PKR)}</div>
                </div>
                {(parseFloat(saleData?.Expected_Amount_PKR) || 0) > 0 && (
                  <div>
                    <span style={{ color: '#555' }}>Expected Price:</span>
                    <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 9 : undefined }}>{fmtPkr(saleData?.Expected_Amount_PKR)}</div>
                  </div>
                )}
                {(parseFloat(saleData?.Discount_Amount_PKR) || 0) > 0 && (
                  <div>
                    <span style={{ color: '#555' }}>Negotiated Discount:</span>
                    <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 9 : undefined, color: '#b45309' }}>{fmtPkr(saleData?.Discount_Amount_PKR)}</div>
                  </div>
                )}
                <div>
                  <span style={{ color: '#555' }}>Advance Paid:</span>
                  <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 9 : undefined, color: '#16a34a' }}>{fmtPkr(saleData?.Advance_Amount_PKR)}</div>
                </div>
                <div style={{ gridColumn: printSize === 'thermal' ? '1 / -1' : undefined }}>
                  <span style={{ color: '#555' }}>Remaining Balance:</span>
                  <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 9 : undefined, color: '#dc2626' }}>{fmtPkr(parseFloat(saleData?.Total_Amount_PKR) - parseFloat(saleData?.Advance_Amount_PKR))}</div>
                </div>

                {(saleData?.Total_Installments > 0) && (
                  <>
                    <div>
                      <span style={{ color: '#555' }}>Installments:</span>
                      <div style={{ fontWeight: 700, fontSize: printSize === 'thermal' ? 9 : undefined }}>{saleData?.Total_Installments} Installments</div>
                    </div>
                    <div>
                      <span style={{ color: '#555' }}>Total Period:</span>
                      <div style={{ fontWeight: 700, fontSize: printSize === 'thermal' ? 9 : undefined }}>{saleData?.Total_Period_Months} Months</div>
                    </div>
                    <div>
                      <span style={{ color: '#555' }}>Per Installment:</span>
                      <div style={{ fontWeight: 800, fontSize: printSize === 'thermal' ? 9 : undefined, color: '#2563eb' }}>{fmtPkr(saleData?.monthlyInstallment)}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Signatures */}
            {printSize === 'thermal' ? (
              <div style={{ borderTop: '1px dashed #000', paddingTop: 6, marginTop: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 8 }}>Thank You!</div>
                <div style={{ fontSize: 7, color: '#555' }}>AL SIRAJ DEVELOPERS ERP</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px', padding: '0 20px' }}>
                  <div style={{ textAlign: 'center', width: '200px' }}>
                    <div style={{ borderTop: '1px solid #000', paddingTop: '6px', fontSize: '11px', fontWeight: '700' }}>
                      Customer Signature
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', width: '200px' }}>
                    <div style={{ borderTop: '1px solid #000', paddingTop: '6px', fontSize: '11px', fontWeight: '700' }}>
                      Authorized Signature
                    </div>
                  </div>
                </div>
                <div style={{
                  marginTop: '40px', borderTop: '1px dashed #ccc', paddingTop: '10px',
                  textAlign: 'center', fontSize: '9px', color: '#777', textTransform: 'uppercase', letterSpacing: '1px'
                }}>
                  Powered by AL SIRAJ DEVELOPERS ERP
                </div>
              </>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
