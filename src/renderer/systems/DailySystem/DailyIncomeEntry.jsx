import { useState, useEffect } from 'react';
import PaymentAccountSelect from '../../components/PaymentAccountSelect';

export default function DailyIncomeEntry({ townName, onSubmit, isAppealMode, accountOptions = [] }) {
  const [incomeType, setIncomeType] = useState('general');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountKey, setAccountKey] = useState('');
  const [pendingCollections, setPendingCollections] = useState([]);

  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [installmentDetails, setInstallmentDetails] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [paymentAccount, setPaymentAccount] = useState(null);

  const toMoney = (value) => Number(value) || 0;

  useEffect(() => {
    if (incomeType === 'installment') {
      loadInstallmentProperties();
    }
  }, [incomeType, refreshTick, townName]);

  useEffect(() => {
    const onDataChanged = (event) => {
      const detail = event?.detail || {};
      const events = Array.isArray(detail.events) ? detail.events : [];
      const sameTown = !detail.townName || !townName || String(detail.townName) === String(townName);
      if (!sameTown) return;
      if (events.some((name) => ['remaining:changed', 'installment:changed', 'sale:changed', 'ledger:changed'].includes(name))) {
        setRefreshTick((tick) => tick + 1);
      }
    };
    window.addEventListener('al-siraj-business-data-changed', onDataChanged);
    window.addEventListener('al-siraj-data-refreshed', onDataChanged);
    return () => {
      window.removeEventListener('al-siraj-business-data-changed', onDataChanged);
      window.removeEventListener('al-siraj-data-refreshed', onDataChanged);
    };
  }, [townName]);

  useEffect(() => {
    let cancelled = false;
    const loadPendingCollections = async () => {
      try {
        const res = await window.api?.getPendingCollections?.(null);
        const rows = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setPendingCollections(rows.filter((row) => !townName || String(row.Town_Name || '') === String(townName)));
      } catch {
        if (!cancelled) setPendingCollections([]);
      }
    };
    loadPendingCollections();
    return () => { cancelled = true; };
  }, [refreshTick, townName]);

  const isInstallmentCollection = (row) => (parseInt(row?.Total_Installments, 10) || 0) > 0 ||
    /installment/i.test(String(row?.Collection_Category || row?.Installment_Status || ''));
  const advanceOnlyCollections = pendingCollections.filter((row) => !isInstallmentCollection(row));
  const generalAccountOptions = accountOptions.filter((account) => {
    if (account.type !== 'Customer') return true;
    return advanceOnlyCollections.some((row) => {
      const label = `${row.Customer_Name || 'Customer'} - ${row.Type || ''} ${row.Plot_Shop_Number || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const name = String(account.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      return label === name || label.includes(name);
    });
  });
  const selectedAccount = generalAccountOptions.find((item) => item.key === accountKey);
  const selectedReceivable = selectedAccount?.type === 'Customer'
    ? advanceOnlyCollections.find((row) => {
        const label = `${row.Customer_Name || 'Customer'} - ${row.Type || ''} ${row.Plot_Shop_Number || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
        const name = String(selectedAccount.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return label === name || label.includes(name) || name.includes(String(row.Plot_Shop_Number || '').toLowerCase());
      })
    : null;

  const loadInstallmentProperties = async () => {
    try {
      const result = await window.api.getInstallmentProperties(townName);
      setProperties(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error('Error loading properties:', err);
    }
  };

  const handlePropertySelect = async (propertyId) => {
    const prop = properties.find(p => p.id === propertyId);
    setSelectedProperty(prop);
    setSelectedInstallment(null);
    setAmount('');

    const installments = await window.api.getPropertyInstallments(propertyId);
    const rows = Array.isArray(installments) ? installments : [];
    if (rows.length) {
      setInstallmentDetails(rows);
      return;
    }

    const total = toMoney(prop?.totalInstallments || prop?.Total_Installments);
    const paid = toMoney(prop?.paidInstallments);
    const monthly = toMoney(prop?.monthlyAmount) ||
      Math.ceil(toMoney(prop?.remainingAmount) / Math.max(1, total - paid));
    const fallback = Array.from(
      { length: Math.max(0, total - paid) },
      (_, index) => ({
        id: `${prop.id}|fallback-${paid + index + 1}`,
        installmentNumber: paid + index + 1,
        totalInstallments: total,
        dueDate: '',
        dueAmount: monthly,
        isPaid: false,
        isSynthetic: true,
        status: 'due',
      }),
    );
    setInstallmentDetails(fallback);
  };

  const handleInstallmentSelect = (installment) => {
    setSelectedInstallment(installment);
    setAmount(String(toMoney(installment.dueAmount)));
    setDescription(`${selectedProperty.propertyType} #${selectedProperty.propertyNumber} - Installment #${installment.installmentNumber} of ${installment.totalInstallments}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const account = generalAccountOptions.find((item) => item.key === accountKey);
    const installmentAccountName = selectedProperty
      ? `${selectedProperty.buyerName || 'Customer'} - ${selectedProperty.propertyNumber || selectedProperty.id || ''}`.trim()
      : '';

    onSubmit({
      type: 'Income',
      incomeType,
      description,
      amount: parseFloat(amount),
      accountName: account?.name || (incomeType === 'installment' ? installmentAccountName : paymentAccount?.paymentAccountName || 'Cash in Hand'),
      accountType: account?.type || (incomeType === 'installment' ? 'Customer' : paymentAccount?.paymentAccountType || 'cash'),
      propertyId: selectedProperty?.id,
      installmentId: selectedInstallment?.id,
      propertyDetails: selectedProperty,
      installmentDetails: selectedInstallment,
      installmentPaymentPayload: selectedInstallment ? {
        Tracker_ID: selectedInstallment.id,
        Paid_Date: new Date().toISOString().split('T')[0],
        ...paymentAccount,
      } : null,
      collectionPayload: selectedReceivable ? {
        saleId: selectedReceivable.id,
        amount: parseFloat(amount),
        paymentMethod: 'Cash',
        notes: description || 'Customer receivable collected from Daily Income',
        type: selectedReceivable.Type,
        plotShopNumber: selectedReceivable.Plot_Shop_Number,
        townName: selectedReceivable.Town_Name,
        customerName: selectedReceivable.Customer_Name,
        agentName: selectedReceivable.Agent_Name,
        totalAmount: selectedReceivable.Total_Amount_PKR,
        currentReceived: selectedReceivable.Received_Amount,
        ...paymentAccount,
      } : null,
      ...paymentAccount,
    });

    setDescription('');
    setAmount('');
    setAccountKey('');
    setIncomeType('general');
    setSelectedProperty(null);
    setSelectedInstallment(null);
    setInstallmentDetails(null);
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 8, fontSize: 13 }}>
          Income Type
        </label>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => setIncomeType('general')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: incomeType === 'general' ? 'var(--accent-green)' : 'var(--border-color)',
              color: incomeType === 'general' ? 'white' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            General Income
          </button>
          <button
            type="button"
            onClick={() => setIncomeType('installment')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: incomeType === 'installment' ? 'var(--accent-blue)' : 'var(--border-color)',
              color: incomeType === 'installment' ? 'white' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            Installment Payment
          </button>
        </div>
      </div>

      <PaymentAccountSelect
        townName={townName}
        value={paymentAccount}
        onChange={setPaymentAccount}
        label="Receive Into"
      />

      {incomeType === 'general' && (
        <>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Received from</label>
            <select value={accountKey} onChange={(e) => setAccountKey(e.target.value)}>
              <option value="">General / Walk-in</option>
              {generalAccountOptions.map((account) => (
                <option key={account.key} value={account.key}>{account.label}</option>
              ))}
            </select>
          </div>

          {selectedReceivable && (
            <div style={{ marginBottom: 16, padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#166534', marginBottom: 8 }}>
                Customer remaining collection
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
                <div><b>Property</b><br />{selectedReceivable.Type} {selectedReceivable.Plot_Shop_Number}</div>
                <div><b>Received</b><br />PKR {toMoney(selectedReceivable.Received_Amount).toLocaleString()}</div>
                <div><b>Remaining</b><br />PKR {toMoney(selectedReceivable.Remaining_Amount).toLocaleString()}</div>
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Description</label>
            <input
              placeholder="e.g. Property Sale, Commission, Advance Payment"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Amount (PKR)</label>
            <input
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        </>
      )}

      {incomeType === 'installment' && (
        <>
          <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--text-primary)' }}>
              Step 1: Select Property
            </div>

            {properties.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                No properties with active installments found
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {properties.map(prop => (
                  <div
                    key={prop.id}
                    onClick={() => handlePropertySelect(prop.id)}
                    style={{
                      padding: 12,
                      border: selectedProperty?.id === prop.id ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      background: selectedProperty?.id === prop.id ? 'rgba(0,102,204,0.08)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedProperty?.id !== prop.id) {
                        e.currentTarget.style.borderColor = 'var(--border-active)';
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedProperty?.id !== prop.id) {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.background = 'var(--bg-card)';
                      }
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                      {prop.propertyType || prop.Type || 'Property'} #{prop.propertyNumber || prop.Plot_Shop_Number || '-'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      {prop.buyerName || prop.Customer_Name || '-'}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-green)' }}>
                      {toMoney(prop.activeInstallments)} Active
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedProperty && installmentDetails && (
            <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--text-primary)' }}>
                Step 2: Select Installment
              </div>

              {installmentDetails.filter((inst) => !inst.isPaid).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 14, background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  No remaining installments. This property looks fully paid.
                </div>
              ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {installmentDetails.filter((inst) => !inst.isPaid).map(inst => (
                  <div
                    key={inst.id}
                    onClick={() => {
                      if (!inst.isPaid && !inst.isSynthetic) {
                        handleInstallmentSelect(inst);
                      }
                    }}
                    style={{
                      padding: 12,
                      border: selectedInstallment?.id === inst.id ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      background: selectedInstallment?.id === inst.id ? 'rgba(0,102,204,0.08)' : inst.isPaid ? 'rgba(0,0,0,0.02)' : 'var(--bg-card)',
                      cursor: inst.isPaid || inst.isSynthetic ? 'not-allowed' : 'pointer',
                      opacity: inst.isPaid || inst.isSynthetic ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                      #{inst.installmentNumber}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Due: {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('en-PK') : 'Date not set'}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                      PKR {toMoney(inst.dueAmount).toLocaleString()}
                    </div>
                    {inst.isPaid ? (
                      <div style={{ fontSize: 9, background: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: '3px', textAlign: 'center', fontWeight: 700 }}>
                        PAID
                      </div>
                    ) : inst.isSynthetic ? (
                      <div style={{ fontSize: 9, background: '#e0f2fe', color: '#075985', padding: '2px 6px', borderRadius: '3px', textAlign: 'center', fontWeight: 700 }}>
                        SCHEDULE MISSING
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '3px', textAlign: 'center', fontWeight: 700 }}>
                        DUE
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {selectedProperty && !selectedInstallment && (
            <div style={{ marginBottom: 20, padding: 16, background: '#fef2f2', borderRadius: 'var(--radius-md)', border: '1px solid #fecaca' }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
                Outstanding Balance
              </div>

              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
                <div><strong>Total Paid:</strong> PKR {toMoney(selectedProperty.totalPaid).toLocaleString()}</div>
                <div><strong>Total Price:</strong> PKR {toMoney(selectedProperty.totalPrice).toLocaleString()}</div>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: '#d11a2a' }}>
                  Remaining: PKR {Math.max(0, toMoney(selectedProperty.totalPrice) - toMoney(selectedProperty.totalPaid)).toLocaleString()}
                </div>

                {toMoney(selectedProperty.advanceTaken) > 0 && (
                  <div style={{ marginTop: 12, padding: 12, background: '#fff7ed', borderRadius: 'var(--radius-sm)', border: '1px solid #fed7aa' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                      Advance Given: PKR {toMoney(selectedProperty.advanceTaken).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: '#b45309' }}>
                      Select an installment above to record payment
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedInstallment && (
            <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0c4a6e', marginBottom: 8 }}>
                INSTALLMENT DETAILS
              </div>
              <div style={{ fontSize: 12, color: '#0f172a', lineHeight: 1.6 }}>
                <div><strong>Property:</strong> {selectedProperty.propertyType || 'Property'} #{selectedProperty.propertyNumber || '-'}</div>
                <div><strong>Buyer:</strong> {selectedProperty.buyerName || '-'}</div>
                <div><strong>Installment:</strong> #{selectedInstallment.installmentNumber} of {selectedInstallment.totalInstallments}</div>
                <div>
                  <strong>Due Date:</strong>{' '}
                  {selectedInstallment.dueDate && !Number.isNaN(new Date(selectedInstallment.dueDate).getTime())
                    ? new Date(selectedInstallment.dueDate).toLocaleDateString('en-PK')
                    : 'Date not set'}
                </div>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, color: 'var(--accent-green)' }}>
                  Amount: PKR {toMoney(selectedInstallment.dueAmount).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <button
        type="submit"
        disabled={incomeType === 'installment' && !selectedInstallment}
        className="btn"
        style={{
          width: '100%',
          padding: '12px',
          opacity: incomeType === 'installment' && !selectedInstallment ? 0.5 : 1,
          cursor: incomeType === 'installment' && !selectedInstallment ? 'not-allowed' : 'pointer',
          background: isAppealMode ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--accent-green)',
          color: 'white',
          border: 'none',
          fontWeight: 700,
          borderRadius: 'var(--radius-md)',
          fontSize: 14,
        }}
      >
        {isAppealMode ? <><span style={{display:'inline-flex',alignItems:'center',gap:4}}>Submit Appeal to CEO</span></> : 'Add Income'}
      </button>
    </form>
  );
}
