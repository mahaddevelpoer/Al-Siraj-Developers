const fs = require('fs');
const path = require('path');

const FILE_NAME = 'Accountant_Offline_Logins.json';

function template() {
  return {
    instructions: [
      'CEO login still requires internet/Supabase.',
      'Accountant login can work offline from this file.',
      'Add accountant objects inside the accountants array.',
      'Required fields: email, password, full_name, town_name, is_active.',
      'Optional field: admin_password. If set, accountant must enter it as a local administration lock password.',
    ],
    accountants: [],
  };
}

function getFilePath(dbPath) {
  return path.join(dbPath, FILE_NAME);
}

function ensureFile(dbPath) {
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
  const filePath = getFilePath(dbPath);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(template(), null, 2), 'utf8');
  }
  return filePath;
}

function readStore(dbPath) {
  const filePath = ensureFile(dbPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return template();
    if (!Array.isArray(parsed.accountants)) parsed.accountants = [];
    return parsed;
  } catch (_) {
    const backup = `${filePath}.broken-${Date.now()}`;
    try { fs.copyFileSync(filePath, backup); } catch (_) {}
    const fresh = template();
    fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

function writeStore(dbPath, store) {
  const filePath = ensureFile(dbPath);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
  return filePath;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function upsertAccountant(dbPath, account) {
  const email = normalizeEmail(account.email);
  if (!email) throw new Error('Accountant email is required');
  if (!account.password) throw new Error('Accountant password is required');
  const store = readStore(dbPath);
  const existingIndex = store.accountants.findIndex((row) => normalizeEmail(row.email) === email);
  if (existingIndex < 0 && !account.town_name) throw new Error('Accountant town_name is required');
  const now = new Date().toISOString();
  const next = {
    id: account.id || `local-accountant-${email.replace(/[^a-z0-9]/g, '-')}`,
    email,
    password: String(account.password),
    full_name: account.full_name || account.fullName || email.split('@')[0],
    role: 'accountant',
    town_name: account.town_name || account.townName,
    town_id: account.town_id || account.town_name || account.townName,
    admin_password: account.admin_password || account.adminPassword || '',
    is_active: account.is_active !== false,
    updated_at: now,
  };
  if (existingIndex >= 0) {
    const merged = { ...store.accountants[existingIndex] };
    for (const key of Object.keys(next)) {
      if (next[key] !== '' && next[key] !== undefined) {
        merged[key] = next[key];
      }
    }
    merged.created_at = store.accountants[existingIndex].created_at || now;
    store.accountants[existingIndex] = merged;
  } else {
    store.accountants.push({ ...next, created_at: now });
  }
  writeStore(dbPath, store);
  return { ...next, password: undefined };
}

function login(dbPath, email, password, adminPassword = '') {
  const cleanEmail = normalizeEmail(email);
  const store = readStore(dbPath);
  const account = store.accountants.find((row) => normalizeEmail(row.email) === cleanEmail);
  if (!account || String(account.password || '') !== String(password || '')) {
    throw new Error('Invalid offline accountant username or password');
  }
  if (account.is_active === false) throw new Error('This accountant is inactive');
  if (!account.town_name && !account.town_id) throw new Error('This accountant has no assigned town');
  const storedAdminPassword = String(account.admin_password || '');
  const cleanAdminPassword = String(adminPassword || '');
  if (storedAdminPassword && cleanAdminPassword && storedAdminPassword !== cleanAdminPassword) {
    throw new Error('Invalid administration password for this accountant system');
  }
  if (!storedAdminPassword && cleanAdminPassword) {
    account.admin_password = cleanAdminPassword;
    account.updated_at = new Date().toISOString();
    writeStore(dbPath, store);
  }
  return {
    id: account.id || `local-accountant-${cleanEmail}`,
    email: cleanEmail,
    full_name: account.full_name || cleanEmail.split('@')[0],
    role: 'accountant',
    town_name: account.town_name || account.town_id,
    town_id: account.town_id || account.town_name,
    is_active: true,
    local_offline: true,
    admin_password_set: Boolean(account.admin_password),
  };
}

function unlock(dbPath, email, adminPassword = '') {
  const cleanEmail = normalizeEmail(email);
  const store = readStore(dbPath);
  const account = store.accountants.find((row) => normalizeEmail(row.email) === cleanEmail);
  if (!account) throw new Error('No saved offline accountant found on this system');
  if (account.is_active === false) throw new Error('This accountant is inactive');
  if (!account.town_name && !account.town_id) throw new Error('This accountant has no assigned town');
  const storedAdminPassword = String(account.admin_password || '');
  if (!storedAdminPassword) {
    throw new Error('Administration password is not set yet. Login once with username and password first.');
  }
  if (storedAdminPassword !== String(adminPassword || '')) {
    throw new Error('Invalid administration password for this accountant system');
  }
  return {
    id: account.id || `local-accountant-${cleanEmail}`,
    email: cleanEmail,
    full_name: account.full_name || cleanEmail.split('@')[0],
    role: 'accountant',
    town_name: account.town_name || account.town_id,
    town_id: account.town_id || account.town_name,
    is_active: true,
    local_offline: true,
    admin_password_set: true,
  };
}

function list(dbPath) {
  return readStore(dbPath).accountants.map((row) => ({ ...row, password: undefined }));
}

function deactivateByTown(dbPath, townName) {
  const cleanTown = String(townName || '').trim();
  if (!cleanTown) return [];
  const store = readStore(dbPath);
  const deactivated = [];
  store.accountants = store.accountants.map((row) => {
    if (String(row.town_name || row.town_id || '').toLowerCase() === cleanTown.toLowerCase()) {
      if (row.is_active !== false) {
        row.is_active = false;
        row.updated_at = new Date().toISOString();
        row.deactivated_reason = 'Town deleted by CEO';
        deactivated.push({ ...row, password: undefined });
      }
    }
    return row;
  });
  writeStore(dbPath, store);
  return deactivated;
}

module.exports = {
  FILE_NAME,
  ensureFile,
  getFilePath,
  upsertAccountant,
  login,
  unlock,
  list,
  deactivateByTown,
};
