const fs = require('fs');
const path = require('path');
const { getGlobalsPath } = require('./core');

const FILE_NAME = 'Daily_Report_Settings.json';

const DEFAULT_SETTINGS = {
  enabled: true,
  reportTime: '20:00',
  selectedTownsMode: 'all',
  selectedTowns: [],
  deliveryMethods: {
    desktopBell: true,
    ceoAndroidPush: true,
    mediaLibrary: true,
    receiptArchive: false,
    localPdf: true,
    supabaseStorage: true,
  },
  retryIfOffline: true,
  manualResendAllowed: true,
  lastGeneratedAt: '',
  lastSyncedAt: '',
  lastNotificationAt: '',
  lastStatus: 'Not generated yet',
  lastReportDate: '',
  lastResult: null,
  updatedAt: '',
};

function settingsPath() {
  const dir = getGlobalsPath();
  if (!dir) throw new Error('Database path is not initialized');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

function safeTime(value) {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : DEFAULT_SETTINGS.reportTime;
}

function normalize(settings = {}) {
  const incomingMethods = settings.deliveryMethods || {};
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    enabled: settings.enabled !== false,
    reportTime: safeTime(settings.reportTime),
    selectedTownsMode: settings.selectedTownsMode === 'selected' ? 'selected' : 'all',
    selectedTowns: Array.isArray(settings.selectedTowns)
      ? settings.selectedTowns.map((town) => String(town || '').trim()).filter(Boolean)
      : [],
    deliveryMethods: {
      ...DEFAULT_SETTINGS.deliveryMethods,
      ...incomingMethods,
    },
    retryIfOffline: settings.retryIfOffline !== false,
    manualResendAllowed: settings.manualResendAllowed !== false,
  };
}

function getDailyReportSettings() {
  const filePath = settingsPath();
  if (!fs.existsSync(filePath)) return normalize();
  try {
    return normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (_) {
    return normalize({ lastStatus: 'Settings file was unreadable; defaults loaded' });
  }
}

function writeSettings(settings) {
  const next = normalize({ ...settings, updatedAt: new Date().toISOString() });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function updateDailyReportSettings(patch = {}) {
  const current = getDailyReportSettings();
  return writeSettings({
    ...current,
    ...patch,
    deliveryMethods: {
      ...(current.deliveryMethods || {}),
      ...((patch && patch.deliveryMethods) || {}),
    },
  });
}

function recordDailyReportStatus(patch = {}) {
  return updateDailyReportSettings(patch);
}

function parseReportTime(settings = {}) {
  const [hour, minute] = safeTime(settings.reportTime).split(':').map((n) => Number(n));
  return { hour, minute };
}

function shouldRunAt(now = new Date(), settings = getDailyReportSettings()) {
  if (settings.enabled === false) return false;
  const { hour, minute } = parseReportTime(settings);
  return now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
}

module.exports = {
  DEFAULT_SETTINGS,
  getDailyReportSettings,
  updateDailyReportSettings,
  recordDailyReportStatus,
  parseReportTime,
  shouldRunAt,
};
