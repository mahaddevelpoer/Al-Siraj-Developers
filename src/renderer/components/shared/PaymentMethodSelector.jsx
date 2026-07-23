import React, { useState, useEffect } from 'react';

export default function PaymentMethodSelector({ townName, value, onChange, label = "Payment Method", disabled = false }) {
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(value?.paymentMethod || value?.Payment_Method || 'cash'); // 'cash' or 'bank'
  const [selectedBankId, setSelectedBankId] = useState(value?.paymentAccountId || '');

  useEffect(() => {
    let active = true;
    const loadBanks = async () => {
      if (!townName || !window.api?.getPaymentAccounts) return;
      setLoading(true);
      try {
        const res = await window.api.getPaymentAccounts(townName);
        if (active && Array.isArray(res)) {
          const bankList = res.filter(a => String(a.Account_Type || a.account_type || '').toLowerCase() === 'bank');
          setBanks(bankList);
        }
      } catch (err) {
        console.error('Error loading bank accounts:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadBanks();
    return () => { active = false; };
  }, [townName]);

  useEffect(() => {
    const method = String(value?.paymentMethod || value?.Payment_Method || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash';
    setSelectedMethod(method);
    setSelectedBankId(value?.paymentAccountId || '');
  }, [value]);

  const handleSelectCash = () => {
    if (disabled) return;
    setSelectedMethod('cash');
    setSelectedBankId('');
    onChange?.({
      paymentMethod: 'cash',
      paymentAccountId: 'cash-in-hand',
      paymentAccountName: 'Cash in Hand',
      paymentAccountType: 'cash'
    });
  };

  const handleSelectBank = (bankId) => {
    if (disabled) return;
    setSelectedMethod('bank');
    setSelectedBankId(bankId);
    const bank = banks.find(b => String(b.Account_ID || b.account_id) === String(bankId));
    if (bank) {
      onChange?.({
        paymentMethod: 'bank',
        paymentAccountId: bank.Account_ID || bank.account_id,
        paymentAccountName: bank.Account_Name || bank.account_name,
        paymentAccountType: 'bank'
      });
    }
  };

  const money = (val) => `PKR ${(Number(val) || 0).toLocaleString('en-PK')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {/* Cash Option Button */}
        <button
          type="button"
          onClick={handleSelectCash}
          disabled={disabled}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: selectedMethod === 'cash' ? '2px solid var(--accent-green)' : '1.5px solid var(--border-color)',
            background: selectedMethod === 'cash' ? 'rgba(15, 159, 122, 0.08)' : 'var(--bg-card)',
            color: selectedMethod === 'cash' ? 'var(--accent-green)' : 'var(--text-primary)',
            fontWeight: 700,
            fontSize: 13,
            transition: 'all 0.15s',
            outline: 'none'
          }}
        >
          <span>💵</span> Cash In Hand
        </button>

        {/* Bank Button Option */}
        <button
          type="button"
          onClick={() => {
            if (banks.length > 0) {
              handleSelectBank(banks[0].Account_ID || banks[0].account_id);
            } else {
              setSelectedMethod('bank');
            }
          }}
          disabled={disabled}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: selectedMethod === 'bank' ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)',
            background: selectedMethod === 'bank' ? 'rgba(29, 78, 216, 0.08)' : 'var(--bg-card)',
            color: selectedMethod === 'bank' ? 'var(--accent-blue)' : 'var(--text-primary)',
            fontWeight: 700,
            fontSize: 13,
            transition: 'all 0.15s',
            outline: 'none'
          }}
        >
          <span>🏦</span> Select Bank
        </button>
      </div>

      {/* Dynamic Bank List Dropdown if Bank Selected */}
      {selectedMethod === 'bank' && (
        <div style={{ marginTop: 4 }}>
          {loading ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading accounts...</div>
          ) : banks.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--accent-red)', fontWeight: 600 }}>
              No bank accounts found. Please add a bank account in Cash & Banks tab first.
            </div>
          ) : (
            <select
              value={selectedBankId}
              onChange={(e) => handleSelectBank(e.target.value)}
              disabled={disabled}
              className="auth-select-input"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1.5px solid var(--accent-blue)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 700
              }}
            >
              <option value="" disabled>-- Choose a Bank Account --</option>
              {banks.map((b) => (
                <option key={b.Account_ID || b.account_id} value={b.Account_ID || b.account_id}>
                  {b.Account_Name || b.account_name} (Bal: {money(b.Current_Balance)})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
