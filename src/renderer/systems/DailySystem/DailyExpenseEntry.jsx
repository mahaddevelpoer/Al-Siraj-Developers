import { useState } from 'react';

const EXPENSE_CATEGORIES = {
  construction: {
    label: 'Construction',
    emoji: '',
    subcategories: [
      { value: 'none', label: 'Select Category...' },
      { value: 'sewerage', label: 'Sewerage Facilities' },
      { value: 'water', label: 'Water Facilities' },
      { value: 'road', label: 'Road Facilities' },
      { value: 'town', label: 'Town Constructive Facilities' },
    ],
  },
  food: {
    label: 'Food & Meals',
    emoji: '',
    subcategories: [
      { value: 'none', label: 'No subcategory' },
    ],
  },
  guest: {
    label: 'Guest & Entertainment',
    emoji: '',
    subcategories: [
      { value: 'none', label: 'No subcategory' },
    ],
  },
};

export default function DailyExpenseEntry({ onSubmit, isAppealMode, accountOptions = [] }) {
  const [category, setCategory] = useState(null);
  const [subcategory, setSubcategory] = useState(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [accountKey, setAccountKey] = useState('');

  const handleCategorySelect = (cat) => {
    setCategory(cat);
    setSubcategory(null);
    setDescription('');
    setShowCustom(false);
  };

  const handleSubcategorySelect = (subcat) => {
    setSubcategory(subcat);
    setShowCustom(subcat === 'none' || category === 'construction');
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const categoryLabel = EXPENSE_CATEGORIES[category]?.label || category;
    const subcategoryLabel = subcategory !== 'none'
      ? EXPENSE_CATEGORIES[category]?.subcategories?.find(s => s.value === subcategory)?.label || subcategory
      : '';
    const account = accountOptions.find((item) => item.key === accountKey);

    onSubmit({
      type: 'Expense',
      category,
      categoryLabel,
      subcategory,
      subcategoryLabel,
      description: description || categoryLabel,
      amount: parseFloat(amount),
      accountName: account?.name || '',
      accountType: account?.type || '',
    });

    setCategory(null);
    setSubcategory(null);
    setDescription('');
    setAmount('');
    setAccountKey('');
    setShowCustom(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>

      {!category ? (
        <>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 12, fontSize: 13 }}>
              Expense Category *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {Object.entries(EXPENSE_CATEGORIES).map(([key, cat]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleCategorySelect(key)}
                  style={{
                    padding: '16px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                    transition: 'all 0.15s',
                    textAlign: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-active)';
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.background = 'var(--bg-secondary)';
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setCategory('custom');
              setShowCustom(true);
            }}
            style={{
              padding: '12px 16px',
              border: '1px dashed var(--border-color)',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--accent-blue)',
              width: '100%',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-blue)';
              e.currentTarget.style.background = 'rgba(0,102,204,0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            + Add Custom Category
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setCategory(null)}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 12,
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            Back to Categories
          </button>

          {category !== 'custom' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 12, fontSize: 13 }}>
                Select {EXPENSE_CATEGORIES[category]?.label} Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {EXPENSE_CATEGORIES[category]?.subcategories?.map(subcat => (
                  <button
                    key={subcat.value}
                    type="button"
                    onClick={() => handleSubcategorySelect(subcat.value)}
                    style={{
                      padding: '12px 16px',
                      border: subcategory === subcat.value ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      background: subcategory === subcat.value ? 'rgba(0,102,204,0.08)' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      fontWeight: subcategory === subcat.value ? 700 : 600,
                      fontSize: 13,
                      transition: 'all 0.15s',
                      textAlign: 'center',
                    }}
                    onMouseEnter={(e) => {
                      if (subcategory !== subcat.value) {
                        e.currentTarget.style.borderColor = 'var(--border-active)';
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (subcategory !== subcat.value) {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.background = 'var(--bg-secondary)';
                      }
                    }}
                  >
                    {subcat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(showCustom || subcategory === 'none' || category === 'custom') && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Description</label>
              <input
                placeholder={`e.g. ${EXPENSE_CATEGORIES[category]?.label || 'Custom expense'}`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Paid to</label>
            <select value={accountKey} onChange={(e) => setAccountKey(e.target.value)}>
              <option value="">General / no account</option>
              {accountOptions.map((account) => (
                <option key={account.key} value={account.key}>{account.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Amount (PKR) *</label>
            <input
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div style={{
            padding: 12,
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
            fontSize: 12,
            border: '1px solid var(--border-color)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>
              Summary
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              <div><strong>Category:</strong> {EXPENSE_CATEGORIES[category]?.label || 'Custom'}</div>
              {subcategory && subcategory !== 'none' && (
                <div><strong>Type:</strong> {EXPENSE_CATEGORIES[category]?.subcategories?.find(s => s.value === subcategory)?.label}</div>
              )}
              {description && (
                <div><strong>Details:</strong> {description}</div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!amount}
            className="btn"
            style={{
              width: '100%', padding: '12px', opacity: !amount ? 0.5 : 1,
              background: isAppealMode ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--accent-red)',
              color: 'white', border: 'none', fontWeight: 700,
              borderRadius: 'var(--radius-md)', fontSize: 14,
              cursor: !amount ? 'not-allowed' : 'pointer',
            }}
          >
            {isAppealMode ? 'Submit Appeal to CEO' : 'Add Expense'}
          </button>
        </>
      )}
    </form>
  );
}
