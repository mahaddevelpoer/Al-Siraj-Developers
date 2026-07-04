function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const cleaned = String(value)
    .replace(/[^\d.-]/g, '')
    .replace(/(?!^)-/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateMoney(value, { min = 0, allowZero = true } = {}) {
  const amount = parseMoney(value);
  if (!Number.isFinite(amount)) return { ok: false, amount: 0, error: 'Invalid amount' };
  if (!allowZero && amount === 0) return { ok: false, amount, error: 'Amount must be greater than zero' };
  if (amount < min) return { ok: false, amount, error: `Amount must be at least ${min}` };
  return { ok: true, amount, error: '' };
}

function formatPKR(value) {
  const amount = Math.round(parseMoney(value));
  return `Rs. ${amount.toLocaleString('en-PK')}`;
}

function formatSignedPKR(value) {
  const amount = Math.round(parseMoney(value));
  if (amount < 0) return `(Rs. ${Math.abs(amount).toLocaleString('en-PK')})`;
  return `Rs. ${amount.toLocaleString('en-PK')}`;
}

module.exports = {
  parseMoney,
  validateMoney,
  formatPKR,
  formatSignedPKR,
};
