import React, { useState, useRef, useEffect } from 'react';
import { CrossIcon } from '../../components/Icons';

const fmt = (n) => `PKR ${(parseFloat(n) || 0).toLocaleString()}`;
const clean = (value, fallback = '-') => {
  const text = String(value ?? '').trim();
  return text && text !== '-' && !text.includes('â') ? text : fallback;
};
const entryTime = (entry) => clean(entry.Time || entry.time, '-');
const entryAccount = (entry) => clean(entry.Account_Name || entry.accountName, 'General / Walk-in');
const paymentAccount = (entry) => clean(entry.Payment_Account_Name || entry.paymentAccountName, 'Cash in Hand');

export default function DailyReceipt({ entries, date, townName, mode, onClose }) {
  const printRef = useRef(null);
  const [townData, setTownData] = useState(null);
  const [config, setConfig] = useState(() => {
    try {
      const key = `receipt_config_${townName || 'default'}`;
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch { return {}; }
  });

  useEffect(() => {
    if (window.api) {
      window.api.getTownDetails(townName).then(d => {
        if (d && !d.error) setTownData(d);
      }).catch(() => {});
    }
  }, [townName]);

  const filtered = mode === 'full'
    ? entries
    : entries.filter(e => e.Type?.toLowerCase() === mode);

  const incomes = filtered.filter(e => e.Type === 'Income');
  const expenses = filtered.filter(e => e.Type === 'Expense');
  const totalIncome = incomes.reduce((s, e) => s + (parseFloat(e.Amount) || 0), 0);
  const totalExpense = expenses.reduce((s, e) => s + (parseFloat(e.Amount) || 0), 0);
  const netBalance = totalIncome - totalExpense;

  const townIncome = parseFloat(townData?.Total_Income_PKR) || 0;
  const townExpense = parseFloat(townData?.Total_Expenses_PKR) || 0;
  const townNet = townIncome - townExpense;
  const runningBalance = totalIncome + townNet - totalExpense;

  const titleMap = {
    income: 'Daily Income Statement',
    expense: 'Daily Expense Statement',
    full: 'Daily Cash Flow Statement',
  };

  const saveArchive = async () => {
    const townPart = String(townName || 'GLOBAL').replace(/[^a-zA-Z0-9]+/g, '').toUpperCase() || 'GLOBAL';
    const receiptNumber = `DAY-${townPart}-${String(mode || 'FULL').toUpperCase()}-${String(date || '').replace(/-/g, '')}`;
    try {
      await window.api?.saveDailyReceiptArchive?.({
        Receipt_Number: receiptNumber,
        Receipt_Type: `daily_${mode || 'full'}`,
        Town_Name: townName,
        Entity_ID: `${townName || 'Global'}-${date}-${mode}`,
        Entity_Name: titleMap[mode] || 'Daily Receipt',
        Amount: mode === 'expense' ? totalExpense : mode === 'income' ? totalIncome : netBalance,
        Receipt_Date: date,
        Payload_JSON: {
          receiptNumber,
          type: `daily_${mode || 'full'}`,
          title: titleMap[mode] || 'Daily Receipt',
          townName,
          date,
          totalIncome,
          totalExpense,
          netBalance,
          townIncome,
          townExpense,
          townNet,
          runningBalance,
          entries: filtered,
        },
      });
    } catch (_) {}
  };

  const handlePrint = async () => {
    await saveArchive();
    let styleTag = document.getElementById('daily-receipt-print-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'daily-receipt-print-style';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = `@page { size: A4; margin: 15mm; }`;
    setTimeout(() => window.print(), 50);
  };

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
        {/* Controls */}
        <div className="no-print" style={{
          padding: '16px 20px', borderBottom: '1px solid #eee',
          background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Print Receipt</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handlePrint}>Print</button>
            <button className="btn btn-ghost" onClick={onClose}><CrossIcon size={16} /></button>
          </div>
        </div>

        {/* Receipt Content */}
        <div ref={printRef} className="print-receipt-area" style={{ flex: 1, overflowY: 'auto', padding: 30, background: '#f1f5f9' }}>
          <div style={{
            background: 'white', padding: '30px 35px', maxWidth: 800, margin: '0 auto',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', color: 'black'
          }}>

            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              marginBottom: 20, borderBottom: '2px solid #000', paddingBottom: 16
            }}>
              <div style={{ flex: 1 }}>
                {config.logoDataUrl && (
                  <img src={config.logoDataUrl} style={{ height: 60, objectFit: 'contain', marginBottom: 6 }} />
                )}
                <div style={{ fontSize: 15, fontWeight: 900 }}>
                  {config.projectName || 'AL-SIRAJ DEVELOPERS'}
                </div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                  {config.projectAddress || 'Main Chowk Iqbal Avenue FBR Office Khan Pur'}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>{titleMap[mode]}</div>
                <div style={{ marginTop: 4 }}>Date: {date}</div>
                <div>Town: {townName}</div>
              </div>
            </div>

            {/* Entries Table */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999', fontSize: 13 }}>
                No entries found for this date.
              </div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #000' }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>#</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Time</th>
                      {mode === 'full' && (
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Type</th>
                      )}
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Party</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Cash / Bank</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Description</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e0e0e0' }}>
                        <td style={{ padding: '7px 6px', color: '#666' }}>{i + 1}</td>
                        <td style={{ padding: '7px 6px' }}>{entryTime(e)}</td>
                        {mode === 'full' && (
                          <td style={{ padding: '7px 6px' }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              color: e.Type === 'Income' ? '#107c41' : '#c5221f',
                            }}>
                              {e.Type === 'Income' ? 'IN' : 'EXP'}
                            </span>
                          </td>
                        )}
                        <td style={{ padding: '7px 6px' }}>{entryAccount(e)}</td>
                        <td style={{ padding: '7px 6px' }}>{paymentAccount(e)}</td>
                        <td style={{ padding: '7px 6px' }}>{clean(e.Description, 'Daily entry')}</td>
                        <td style={{
                          padding: '7px 6px', textAlign: 'right', fontWeight: 700,
                          color: mode === 'full'
                            ? (e.Type === 'Income' ? '#107c41' : '#c5221f')
                            : (mode === 'income' ? '#107c41' : '#c5221f'),
                        }}>
                          {fmt(e.Amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Summary */}
                <div style={{ marginTop: 20, borderTop: '2px solid #000', paddingTop: 16 }}>
                  {mode === 'full' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700 }}>Total Income:</span>
                        <span style={{ fontWeight: 800, color: '#107c41' }}>{fmt(totalIncome)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700 }}>Total Expense:</span>
                        <span style={{ fontWeight: 800, color: '#c5221f' }}>{fmt(totalExpense)}</span>
                      </div>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', fontSize: 14,
                        borderTop: '2px solid #000', paddingTop: 8, marginTop: 6,
                      }}>
                        <span style={{ fontWeight: 900 }}>Day Net Balance:</span>
                        <span style={{
                          fontWeight: 900,
                          color: netBalance >= 0 ? '#107c41' : '#c5221f',
                        }}>{fmt(netBalance)}</span>
                      </div>
                    </>
                  ) : mode === 'income' ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                      <span style={{ fontWeight: 900 }}>Total Income:</span>
                      <span style={{ fontWeight: 900, color: '#107c41' }}>{fmt(totalIncome)}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                      <span style={{ fontWeight: 900 }}>Total Expense:</span>
                      <span style={{ fontWeight: 900, color: '#c5221f' }}>{fmt(totalExpense)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Town Overall Financial Snapshot */}
            {townData && (
              <div style={{
                marginTop: 24, border: '1px solid #000', borderRadius: 6, padding: '12px 16px',
                background: '#f9fafb'
              }}>
                <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 8, textTransform: 'uppercase' }}>
                  Town Overall Financial Position - {townName}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 11 }}>
                  <div>
                    <div style={{ color: '#666', fontWeight: 600 }}>Total Income</div>
                    <div style={{ fontWeight: 800, color: '#107c41', fontSize: 13 }}>{fmt(townIncome)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#666', fontWeight: 600 }}>Total Expenses</div>
                    <div style={{ fontWeight: 800, color: '#c5221f', fontSize: 13 }}>{fmt(townExpense)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#666', fontWeight: 600 }}>Overall Balance</div>
                    <div style={{ fontWeight: 800, color: townNet >= 0 ? '#107c41' : '#c5221f', fontSize: 13 }}>
                      {fmt(townNet)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Remaining amount */}
            {mode === 'full' && townData && (
              <div style={{
                marginTop: 16, textAlign: 'center',
                border: '2px solid #000', borderRadius: 8,
                padding: '12px 20px', background: '#f0f9ff'
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                  Overall Remaining Balance
                </div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                  Today Income ({fmt(totalIncome)}) + Town Balance ({fmt(townNet)}) - Today Expenses ({fmt(totalExpense)})
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: runningBalance >= 0 ? '#107c41' : '#c5221f' }}>
                  {fmt(runningBalance)}
                </div>
              </div>
            )}

            {/* Signatures */}
            <div style={{ marginTop: 50, display: 'flex', justifyContent: 'space-around' }}>
              <div style={{ textAlign: 'center', width: 180 }}>
                <div style={{ borderTop: '1px solid black', height: 50 }} />
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Prepared By</div>
              </div>
              <div style={{ textAlign: 'center', width: 180 }}>
                <div style={{ borderTop: '1px solid black', height: 50 }} />
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Verified By</div>
              </div>
              <div style={{ textAlign: 'center', width: 180 }}>
                <div style={{ borderTop: '1px solid black', height: 50 }} />
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Authorized Signatory</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 20, borderTop: '1px dashed #ccc', paddingTop: 10, textAlign: 'center', fontSize: 9, color: '#999' }}>
              This is a computer-generated document - AL SIRAJ DEVELOPERS ERP
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



