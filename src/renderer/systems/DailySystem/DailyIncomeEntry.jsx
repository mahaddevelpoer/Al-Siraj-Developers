import { useState, useEffect } from 'react';

export default function DailyIncomeEntry({ townName, onSubmit, isAppealMode }) {
  const [incomeType, setIncomeType] = useState('general');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [installmentDetails, setInstallmentDetails] = useState(null);

  useEffect(() => {
    if (incomeType === 'installment') {
      loadInstallmentProperties();
    }
  }, [incomeType, townName]);

  const loadInstallmentProperties = async () => {
    try {
      console.log('Loading installment properties for:', townName);
      const result = await window.api.getInstallmentProperties(townName);
      console.log('Installment properties loaded:', result);
      setProperties(result);
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
    setInstallmentDetails(installments);
  };

  const handleInstallmentSelect = (installment) => {
    setSelectedInstallment(installment);
    setAmount(installment.dueAmount);
    setDescription(`${selectedProperty.propertyType} #${selectedProperty.propertyNumber} - Installment #${installment.installmentNumber} of ${installment.totalInstallments}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    onSubmit({
      type: 'Income',
      incomeType,
      description,
      amount: parseFloat(amount),
      propertyId: selectedProperty?.id,
      installmentId: selectedInstallment?.id,
      propertyDetails: selectedProperty,
      installmentDetails: selectedInstallment,
    });

    setDescription('');
    setAmount('');
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

      {incomeType === 'general' && (
        <>
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
                      {prop.propertyType} #{prop.propertyNumber}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      {prop.buyerName}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-green)' }}>
                      {prop.activeInstallments} Active
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {installmentDetails.map(inst => (
                  <div
                    key={inst.id}
                    onClick={() => {
                      if (!inst.isPaid) {
                        handleInstallmentSelect(inst);
                      }
                    }}
                    style={{
                      padding: 12,
                      border: selectedInstallment?.id === inst.id ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      background: selectedInstallment?.id === inst.id ? 'rgba(0,102,204,0.08)' : inst.isPaid ? 'rgba(0,0,0,0.02)' : 'var(--bg-card)',
                      cursor: inst.isPaid ? 'not-allowed' : 'pointer',
                      opacity: inst.isPaid ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                      #{inst.installmentNumber}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Due: {new Date(inst.dueDate).toLocaleDateString('en-PK')}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                      PKR {inst.dueAmount?.toLocaleString()}
                    </div>
                    {inst.isPaid ? (
                      <div style={{ fontSize: 9, background: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: '3px', textAlign: 'center', fontWeight: 700 }}>
                        PAID
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '3px', textAlign: 'center', fontWeight: 700 }}>
                        DUE
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedProperty && !selectedInstallment && (
            <div style={{ marginBottom: 20, padding: 16, background: '#fef2f2', borderRadius: 'var(--radius-md)', border: '1px solid #fecaca' }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
                Outstanding Balance
              </div>

              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
                <div><strong>Total Paid:</strong> PKR {selectedProperty.totalPaid?.toLocaleString()}</div>
                <div><strong>Total Price:</strong> PKR {selectedProperty.totalPrice?.toLocaleString()}</div>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: '#d11a2a' }}>
                  Remaining: PKR {(selectedProperty.totalPrice - selectedProperty.totalPaid)?.toLocaleString()}
                </div>

                {selectedProperty.advanceTaken > 0 && (
                  <div style={{ marginTop: 12, padding: 12, background: '#fff7ed', borderRadius: 'var(--radius-sm)', border: '1px solid #fed7aa' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                      Advance Given: PKR {selectedProperty.advanceTaken?.toLocaleString()}
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
                <div><strong>Property:</strong> {selectedProperty.propertyType} #{selectedProperty.propertyNumber}</div>
                <div><strong>Buyer:</strong> {selectedProperty.buyerName}</div>
                <div><strong>Installment:</strong> #{selectedInstallment.installmentNumber} of {selectedInstallment.totalInstallments}</div>
                <div><strong>Due Date:</strong> {new Date(selectedInstallment.dueDate).toLocaleDateString('en-PK')}</div>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, color: 'var(--accent-green)' }}>
                  Amount: PKR {selectedInstallment.dueAmount?.toLocaleString()}
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
