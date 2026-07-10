const dataLayer = require('./db/dataLayer');
const { BrowserWindow, shell, app } = require('electron');
const { addTown, getTowns, getTownDetails, getTownPrices, setTownPrices, addCeoExpense, deleteCeoExpense, editCeoExpense, updateTown, deleteTown } = require('./db/towns');
const { addPlot, addShop, getPropertyFile, getAllPropertiesByTown, getAllProperties, sellProperty, updateFileStatus, resellProperty, getSoldProperties, cancelDeal } = require('./db/properties');
const { getDailyEntries, addDailyEntry, deleteDailyEntry } = require('./db/dailyEntries');
const { getInstallments, getDueInstallments, markInstallmentPaid, extendInstallmentDate, addEmployee, getEmployees, deleteEmployee, getNotifications, dismissNotification, getDashboardStats, getAllSales, getAllExpenses, getCeoExpenses, getCeoSalary, addCeoSalary, deleteCeoSalary, getResellHistory, getProfitLossReport, getTownPerformance, getInstallmentProperties, getPropertyInstallments, recordCollectionPaymentLocal, reconcileInstallmentSaleTotals } = require('./db/globals');
const EmployeeDB = require('./db/employees');
const { performBackup } = require('./db/backup');
const { performFullSyncUp } = require('./db/syncUp');
const { performFullSync } = require('./db/syncDown');
const { showDesktopNotification } = require('./notificationService');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const onlineDb = require('./db/online');
const storage = require('./db/storage');
const businessExtras = require('./db/businessExtras');
const townMapDb = require('./db/townMap');
const accountantAuth = require('./db/accountantAuth');
const pendingSync = require('./db/pendingSync');
const mediaLibrary = require('./db/mediaLibrary');
const cashBanks = require('./db/cashBanks');
const dailyReportSettings = require('./db/dailyReportSettings');
const { getGlobalsPath } = require('./db/core');
const { buildTownLedgerReport, exportTownLedgerReport, buildDueInstallmentsReport, exportDueInstallmentsReport } = require('./db/townReport');

let _windowGetter = null;
let _queuedUploadTimer = null;
let _queuedCloudSyncTimer = null;
let _queuedCloudDownloadTimer = null;
let _periodicCloudDownloadTimer = null;
let _periodicCloudSyncTimer = null;
let _cloudSyncInFlight = false;
let _cloudDownloadInFlight = false;
let _dailyReceiptTimer = null;
let _lastDailyReceiptDate = '';

function getActiveWindow() {
  return typeof _windowGetter === 'function' ? _windowGetter() : _windowGetter;
}

function sendSyncWarning(message) {
  const win = getActiveWindow();
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('sync-warning', message); } catch {}
  }
}

function sendCloudDataRefreshed(detail = {}) {
  const win = getActiveWindow();
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('cloud-data-refreshed', { at: new Date().toISOString(), ...detail }); } catch {}
  }
}

function businessEventsForTable(tableName, operation = 'upsert') {
  const table = String(tableName || 'mixed').toLowerCase();
  const map = {
    towns: ['town:changed', 'summary:rebuild-required'],
    properties: ['property:changed', 'property-board:changed'],
    all_sales: ['sale:changed', 'property:changed', 'remaining:changed', 'ledger:changed', 'summary:rebuild-required'],
    installments: ['installment:changed', 'remaining:changed', 'ledger:changed', 'summary:rebuild-required'],
    collection_payments: ['collection:changed', 'remaining:changed', 'account:changed', 'receipt:created', 'ledger:changed', 'summary:rebuild-required'],
    daily_entries: ['daily-entry:changed', 'ledger:changed', 'summary:rebuild-required'],
    expenses: ['expense:changed', 'ledger:changed', 'summary:rebuild-required'],
    ceo_expenses: ['expense:changed', 'ledger:changed', 'summary:rebuild-required'],
    ceo_salary: ['salary:changed', 'ledger:changed', 'summary:rebuild-required'],
    employees: ['employee:changed', 'account:changed'],
    employees_v2: ['employee:changed', 'account:changed'],
    salary_payments: ['salary:changed', 'account:changed', 'ledger:changed', 'summary:rebuild-required'],
    advance_salaries: ['salary:changed', 'account:changed', 'ledger:changed'],
    commissions: ['commission:changed', 'account:changed', 'ledger:changed', 'summary:rebuild-required'],
    commission_receipts: ['commission:changed', 'receipt:created', 'ledger:changed'],
    town_agents: ['agent:changed', 'account:changed'],
    investors: ['investor:changed', 'account:changed'],
    investor_transactions: ['investor:changed', 'account:changed', 'receipt:created', 'ledger:changed', 'summary:rebuild-required'],
    construction_projects: ['construction:changed', 'account:changed'],
    construction_payments: ['construction:changed', 'receipt:created', 'ledger:changed', 'summary:rebuild-required'],
    receipt_archive: ['receipt:created', 'media:changed'],
    media_library: ['media:changed', 'report:created'],
    appeals: ['approval:changed'],
    notifications: ['notification:changed'],
    pending_sync: ['pending-sync:changed'],
    cash_bank_accounts: ['cash-bank:changed', 'account:changed', 'ledger:changed', 'summary:rebuild-required'],
    money_ledger: ['ledger:changed', 'summary:rebuild-required'],
    town_financial_summary: ['summary:rebuilt'],
  };
  const events = new Set(map[table] || ['business-data:changed']);
  if (operation === 'delete') events.add('delete:changed');
  return Array.from(events);
}

function inferTownName(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const value = source.Town_Name || source.townName || source.town_name || source.town || source.assignedTown;
    if (isNonEmpty(value)) return String(value).trim();
  }
  return '';
}

function sendBusinessDataChanged(detail = {}) {
  const win = getActiveWindow();
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('business-data-changed', {
        at: new Date().toISOString(),
        ...detail,
      });
    } catch {}
  }
}

function sendMediaChanged(detail = {}) {
  sendBusinessDataChanged({
    tableName: 'media_library',
    operation: 'insert',
    status: 'local-saved',
    events: ['media:changed', 'report:created'],
    ...detail,
  });
}

function sendCloudUploadProgress(percent, msg, detail = {}) {
  const win = getActiveWindow();
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('sync-progress-to-cloud', {
        percent: Math.max(0, Math.min(100, Number(percent) || 0)),
        msg,
        background: true,
        ...detail,
      });
    } catch {}
  }
}

async function renderHtmlReportToPdf(htmlPath) {
  if (!htmlPath || !fs.existsSync(htmlPath)) throw new Error('Report HTML not found');
  const pdfPath = htmlPath.replace(/\.html?$/i, '.pdf');
  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await win.loadFile(htmlPath);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'custom',
        top: 0.35,
        bottom: 0.35,
        left: 0.35,
        right: 0.35,
      },
    });
    fs.writeFileSync(pdfPath, pdf);
    return pdfPath;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function reportSafePart(value) {
  return String(value || 'report')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function reportEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reportMoney(value) {
  return `PKR ${(Number(value) || 0).toLocaleString()}`;
}

function reportRowDate(row = {}) {
  const keys = ['date', 'Date', 'Sell_Date', 'Payment_Date', 'Paid_Date', 'Receipt_Date', 'Created_At', 'created_at'];
  for (const key of keys) {
    const value = row[key];
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    const text = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  }
  return '';
}

function reportRowsInRange(rows = [], fromDate = '', toDate = '') {
  const from = String(fromDate || '').slice(0, 10);
  const to = String(toDate || '').slice(0, 10);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const date = reportRowDate(row);
    if (!date) return !from && !to;
    return (!from || date >= from) && (!to || date <= to);
  });
}

function accountReportAmount(row = {}) {
  const candidates = [
    row.amount,
    row.Amount,
    row.received,
    row.credit,
    row.paid,
    row.debit,
    row.cashDisbursed,
    row.remaining,
    row.balance,
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number !== 0) return number;
  }
  return 0;
}

function buildPropertyReceiptArchive(data = {}, mode = 'property_sale') {
  const type = data.type || data.Type || '';
  const number = data.number || data.Plot_Shop_Number || '';
  const townName = data.townName || data.Town_Name || '';
  const totalAmount = parseFloat(data.Deal_Amount_PKR ?? data.Resell_Amount ?? data.Total_Amount_PKR) || 0;
  const advanceAmount = parseFloat(data.Advance_Amount_PKR ?? data.Received_Amount) || 0;
  const remainingAmount = Math.max(0, totalAmount - advanceAmount);
  const date = data.Sell_Date || data.Resell_Date || new Date().toISOString().split('T')[0];
  const receiptNumber = data.Receipt_Number || '';
  return {
    Receipt_ID: `${mode}-${String(receiptNumber || `${type}-${number}-${townName}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 48)}`,
    Receipt_Number: receiptNumber,
    Receipt_Type: mode,
    Town_Name: townName,
    Entity_ID: data.Sale_ID || `${type}|${number}|${townName}`,
    Entity_Name: data.Customer_Name || '',
    Amount: advanceAmount,
    Receipt_Date: date,
    Payload_JSON: JSON.stringify({
      type: mode,
      townName,
      propertyType: type,
      propertyNumber: number,
      customerName: data.Customer_Name || '',
      phoneNumber: data.Phone_Number || '',
      totalAmount,
      advanceAmount,
      remainingAmount,
      paymentMethod: data.Payment_Method || 'Cash',
      receiptNumber,
    }),
  };
}

function scheduleQueuedFileUpload(delayMs = 3000) {
  storage.queueAllLocalFiles();
}

function scheduleQueuedCloudSync(delayMs = 1500) {
  if (_queuedCloudSyncTimer) clearTimeout(_queuedCloudSyncTimer);
  _queuedCloudSyncTimer = setTimeout(async () => {
    _queuedCloudSyncTimer = null;
    if (_cloudSyncInFlight) {
      scheduleQueuedCloudSync(delayMs);
      return;
    }
    _cloudSyncInFlight = true;
    try {
      sendCloudUploadProgress(2, 'Checking pending local Excel changes...');
      await performFullSyncUp((percent, msg) => sendCloudUploadProgress(percent, msg));
      await pendingSync.markAllPendingSynced();
      sendBusinessDataChanged({
        tableName: 'pending_sync',
        operation: 'update',
        status: 'synced',
        events: ['sync:success', 'pending-sync:changed'],
      });
      sendCloudUploadProgress(100, 'Local Excel changes saved to database');
      sendCloudDataRefreshed({ source: 'queued-cloud-sync' });
      scheduleCloudDownload(900);
    } catch (e) {
      await pendingSync.markPendingAttemptFailed(e).catch(() => {});
      sendBusinessDataChanged({
        tableName: 'pending_sync',
        operation: 'update',
        status: 'sync-failed',
        events: ['sync:failed', 'pending-sync:changed'],
        error: e.message || 'Unknown',
      });
      sendSyncWarning('Cloud database sync error: ' + (e.message || 'Unknown'));
    } finally {
      _cloudSyncInFlight = false;
    }
  }, delayMs);
}

function scheduleCloudDownload(delayMs = 1200) {
  if (_queuedCloudDownloadTimer) clearTimeout(_queuedCloudDownloadTimer);
  _queuedCloudDownloadTimer = setTimeout(async () => {
    _queuedCloudDownloadTimer = null;
    if (_cloudDownloadInFlight) return;
    _cloudDownloadInFlight = true;
    try {
      const win = getActiveWindow();
      const sendProgress = (percent, msg) => {
        try {
          if (win && !win.isDestroyed()) {
            win.webContents.send('cloud-refresh-progress', { percent, msg, background: true });
          }
        } catch (_) {}
      };
      if (await pendingSync.hasPendingSyncRows()) {
        sendSyncWarning('Cloud download skipped: local changes are still waiting to sync.');
        return;
      }
      sendProgress(5, 'Checking cloud database...');
      await performFullSync((percent, msg) => {
        const mapped = percent <= 30
          ? Math.max(5, Math.round((percent / 30) * 50))
          : 50 + Math.round(((percent - 30) / 70) * 50);
        sendProgress(Math.min(100, mapped), msg);
      });
      if (win && !win.isDestroyed()) {
        try {
          win.webContents.send('cloud-refresh-progress', { percent: 100, msg: 'Excel cache updated from database', background: true });
          win.webContents.send('cloud-data-refreshed', { background: true, at: new Date().toISOString() });
        } catch {}
      }
    } catch (e) {
      sendSyncWarning('Background cloud download error: ' + (e.message || 'Unknown'));
    } finally {
      _cloudDownloadInFlight = false;
    }
  }, delayMs);
}

function startPeriodicCloudDownload(intervalMs = 120000) {
  if (_periodicCloudDownloadTimer) clearInterval(_periodicCloudDownloadTimer);
  _periodicCloudDownloadTimer = setInterval(() => {
    const role = String(storage.getSyncContext()?.role || '').toLowerCase();
    if (role !== 'ceo' && role !== 'accountant') return;
    scheduleCloudDownload(100);
  }, intervalMs);
}

function startPeriodicCloudSync(intervalMs = 120000) {
  if (_periodicCloudSyncTimer) clearInterval(_periodicCloudSyncTimer);
  _periodicCloudSyncTimer = setInterval(() => {
    const role = String(storage.getSyncContext()?.role || '').toLowerCase();
    if (role !== 'ceo' && role !== 'accountant') return;
    scheduleQueuedCloudSync(100);
  }, intervalMs);
}

async function generateDailyTownReceiptBundle(date = new Date().toISOString().slice(0, 10), eventSender = null, options = {}) {
  const settings = options.settings || dailyReportSettings.getDailyReportSettings();
  const towns = await getTowns();
  const selectedSet = new Set((settings.selectedTowns || []).map((town) => String(town || '').trim()).filter(Boolean));
  const townRows = (Array.isArray(towns) ? towns.filter((t) => t?.Town_Name) : [])
    .filter((town) => settings.selectedTownsMode !== 'selected' || selectedSet.has(String(town.Town_Name || '').trim()));
  const generated = [];
  const failed = [];
  const mediaSyncFailures = [];
  const startedAt = new Date().toISOString();
  const sendProgress = (percent, msg) => {
    const payload = { percent, msg };
    try {
      if (eventSender && !eventSender.isDestroyed()) eventSender.send('sync-progress-to-cloud', payload);
    } catch (_) {}
    const win = getActiveWindow();
    try {
      if (win && !win.isDestroyed()) win.webContents.send('sync-progress-to-cloud', payload);
    } catch (_) {}
  };
  if (!townRows.length) {
    const result = { success: true, date, generated, failed, message: 'No towns selected/found' };
    dailyReportSettings.recordDailyReportStatus({
      lastGeneratedAt: startedAt,
      lastReportDate: date,
      lastStatus: result.message,
      lastResult: result,
    });
    return result;
  }
  for (let i = 0; i < townRows.length; i += 1) {
    const townName = townRows[i].Town_Name;
    sendProgress(Math.round((i / townRows.length) * 80), `Creating daily receipt: ${townName}`);
    try {
      const exported = await exportTownLedgerReport({ townName, fromDate: date, toDate: date });
      let pdfPath = exported.pdfPath || '';
      if (!pdfPath && exported.htmlPath) {
        try { pdfPath = await renderHtmlReportToPdf(exported.htmlPath); } catch (_) {}
      }
      generated.push({
        townName,
        pdfPath: pdfPath || exported.htmlPath,
        excelPath: exported.excelPath,
        summary: exported.report?.summary || {},
      });
      const mediaRow = await mediaLibrary.recordMediaItem({
        townName,
        type: 'daily_ledger_receipt',
        title: `${townName} daily ledger receipt ${date}`,
        pdfPath: pdfPath || '',
        excelPath: exported.excelPath || '',
        htmlPath: exported.htmlPath || '',
        reportDate: date,
        fromDate: date,
        toDate: date,
      }).catch(() => {});
      if (mediaRow) {
        try {
          await onlineDb.insert('media_library', mediaRow);
        } catch (e) {
          mediaSyncFailures.push({ townName, error: e.message || 'Media cloud sync failed' });
          await pendingSync.addPendingSync({
            operation: 'upsert',
            tableName: 'media_library',
            clientWriteId: mediaRow.Media_ID || `${townName}-${date}`,
            payload: mediaRow,
            error: e.message || '',
          }).catch(() => {});
        }
      }
    } catch (e) {
      failed.push({ townName, error: e.message || 'Receipt generation failed' });
    }
  }
  const notificationId = `DAILY-${date.replace(/-/g, '')}`;
  const reportId = `daily-ledger-${date.replace(/-/g, '')}`;
  const totals = generated.reduce((sum, item) => {
    const summary = item.summary || {};
    return {
      income: sum.income + Number(summary.totalReceived || summary.income || 0),
      expenses: sum.expenses + Number(summary.totalPaid || summary.expenses || 0),
      pending: sum.pending + Number(summary.pendingReceivable || summary.pending || 0),
    };
  }, { income: 0, expenses: 0, pending: 0 });
  try {
    const groupMediaRow = await mediaLibrary.recordMediaItem({
      townName: 'All Towns',
      type: 'daily_ledger_receipt',
      title: `All towns daily ledger receipts ${date} (${generated.length}/${townRows.length})`,
      filePath: `daily-ledger-summary://${date}`,
      receiptNumber: reportId,
      reportDate: date,
      fromDate: date,
      toDate: date,
      accountName: `Income ${totals.income} | Expenses ${totals.expenses} | Pending ${totals.pending}`,
    });
    await onlineDb.insert('media_library', groupMediaRow).catch(async (e) => {
      mediaSyncFailures.push({ townName: 'All Towns', error: e.message || 'Group media cloud sync failed' });
      await pendingSync.addPendingSync({
        operation: 'upsert',
        tableName: 'media_library',
        clientWriteId: groupMediaRow.Media_ID || reportId,
        payload: groupMediaRow,
        error: e.message || '',
      }).catch(() => {});
    });
  } catch (_) {}
  const message = failed.length
    ? `${generated.length}/${townRows.length} town receipts ready. ${failed.map((f) => `${f.townName} not online/wake him`).join(', ')}`
    : `${generated.length}/${townRows.length} town receipts ready for ${date}`;
  const payload = {
    notificationId,
    eventType: 'daily_ledger_report_ready',
    townId: 'all',
    townName: 'All Towns',
    reportId,
    receiptId: reportId,
    reportDate: date,
    title: failed.length ? 'Daily ledger reports need attention' : 'Daily ledger reports ready',
    body: message,
    deepLinkTarget: 'daily_ledger_receipts',
    createdAt: new Date().toISOString(),
    priority: failed.length ? 'high' : 'normal',
    readStatus: 'unread',
    deliveryStatus: failed.length ? 'partial' : 'ready',
    totals,
    generated,
    failed,
    mediaSyncFailures,
  };
  const notification = {
    Notification_ID: notificationId,
    Type: 'Daily Ledger Receipt',
    Message: payload.body,
    Plot_Shop_Number: '',
    Town_Name: 'All Towns',
    Customer_Name: JSON.stringify(payload),
    Due_Date: date,
    Created_Date: payload.createdAt.slice(0, 10),
    Status: 'Active',
    Dismissed: 'No',
  };
  try {
    const { appendToExcel, ensureSheetColumns, readExcelFile, updateExcelRow } = require('./db/core');
    const notificationsPath = path.join(getGlobalsPath(), 'Notifications_Log.xlsx');
    await ensureSheetColumns(notificationsPath, 'Data', ['Notification_ID','Type','Message','Plot_Shop_Number','Town_Name','Customer_Name','Due_Date','Created_Date','Status','Dismissed']);
    const existingNotifications = await readExcelFile(notificationsPath, 'Data').catch(() => []);
    const existing = existingNotifications.find((row) => String(row.Notification_ID || '') === notificationId);
    if (existing?._rowNumber) {
      await updateExcelRow(notificationsPath, 'Data', existing._rowNumber, notification);
    } else {
      await appendToExcel(notificationsPath, 'Data', notification);
    }
    sendBusinessDataChanged({
      tableName: 'notifications',
      operation: 'insert',
      townName: 'All Towns',
      status: 'local-saved',
      events: ['notification:changed', 'media:changed', 'report:created'],
    });
  } catch (e) {
    sendSyncWarning('Daily receipt local notification failed: ' + (e.message || 'Unknown'));
  }
  let notificationSynced = false;
  try {
    await onlineDb.insert('notifications', notification);
    notificationSynced = true;
  } catch (e) {
    await pendingSync.addPendingSync({
      operation: 'upsert',
      tableName: 'notifications',
      clientWriteId: notificationId,
      payload: notification,
      error: e.message || '',
    }).catch(() => {});
    sendSyncWarning('Daily receipt cloud notification queued: ' + (e.message || 'offline'));
  }
  if (generated.length) storage.queueAllLocalFiles();
  dailyReportSettings.recordDailyReportStatus({
    lastGeneratedAt: startedAt,
    lastSyncedAt: notificationSynced ? new Date().toISOString() : settings.lastSyncedAt,
    lastNotificationAt: notificationSynced ? new Date().toISOString() : settings.lastNotificationAt,
    lastStatus: failed.length
      ? `Partial: ${message}`
      : mediaSyncFailures.length
        ? `Ready locally; ${mediaSyncFailures.length} media cloud sync item(s) queued`
        : 'Ready and sent to CEO app route',
    lastReportDate: date,
    lastResult: { date, generated, failed, mediaSyncFailures, totals, notificationId, reportId, notificationSynced },
  });
  sendProgress(100, 'Daily town receipts complete');
  return { success: true, date, generated, failed, notification, payload };
}

function startDailyReceiptScheduler() {
  if (_dailyReceiptTimer) clearInterval(_dailyReceiptTimer);
  _dailyReceiptTimer = setInterval(() => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    if (_lastDailyReceiptDate === date) return;
    const settings = dailyReportSettings.getDailyReportSettings();
    if (!dailyReportSettings.shouldRunAt(now, settings)) return;
    _lastDailyReceiptDate = date;
    generateDailyTownReceiptBundle(date, null, { settings }).catch((e) => {
      _lastDailyReceiptDate = '';
      dailyReportSettings.recordDailyReportStatus({
        lastGeneratedAt: new Date().toISOString(),
        lastReportDate: date,
        lastStatus: 'Failed: ' + (e.message || 'Unknown'),
        lastResult: { date, error: e.message || 'Unknown' },
      });
      sendSyncWarning('Daily receipt generation failed: ' + (e.message || 'Unknown'));
    });
  }, 5 * 60 * 1000);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

async function syncOnline(localFn, supabaseFn, options = {}) {
  let syncWarning = '';
  const clientWriteId = options.clientWriteId || `${options.tableName || 'write'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tableName = options.tableName || 'mixed';
  const operation = options.operation || 'upsert';

  const localResult = await localFn();
  const baseChange = {
    tableName,
    operation,
    clientWriteId,
    townName: inferTownName(options.payload, localResult),
    events: Array.from(new Set([
      ...businessEventsForTable(tableName, operation),
      ...(Array.isArray(options.events) ? options.events : []),
    ])),
  };

  sendBusinessDataChanged({ ...baseChange, status: 'local-saved' });

  if (typeof supabaseFn === 'function') {
    try {
      await pendingSync.addPendingSync({
        operation,
        tableName,
        clientWriteId,
        payload: options.payload || localResult || {},
        error: '',
      });
    } catch (e) {
      sendSyncWarning('Pending sync queue failed: ' + (e.message || 'Unknown'));
      sendBusinessDataChanged({ ...baseChange, status: 'sync-queue-failed', error: e.message || 'Unknown' });
    }

    try {
      await withTimeout(supabaseFn(localResult), 4000, 'Cloud quick sync');
      await pendingSync.markPendingSynced(clientWriteId);
      sendBusinessDataChanged({ ...baseChange, status: 'cloud-saved', events: [...baseChange.events, 'sync:success'] });
      sendCloudDataRefreshed({
        source: 'quick-write',
        tableName,
        operation,
        clientWriteId,
      });
      scheduleCloudDownload(900);
    } catch (e) {
      syncWarning = 'Cloud quick sync failed: ' + (e.message || 'Unknown');
      sendSyncWarning(syncWarning);
      sendBusinessDataChanged({ ...baseChange, status: 'sync-queued', events: [...baseChange.events, 'sync:queued'], error: e.message || 'Unknown' });
    }
  }

  scheduleQueuedFileUpload();
  scheduleQueuedCloudSync();

  if (syncWarning) {
    if (localResult && typeof localResult === 'object' && !Array.isArray(localResult)) {
      return { ...localResult, syncWarning };
    }
    return { success: true, data: localResult, syncWarning };
  }
  return localResult;
}

function isNonEmpty(value) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function assertObjectPayload(data, name = 'payload') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertEnum(value, allowed, name = 'value') {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
}

function assertPermanentDeleteAllowed() {
  const role = String(storage.getSyncContext()?.role || '').toLowerCase();
  if (role === 'agent') {
    throw new Error('Permanent delete requires CEO or Accountant approval');
  }
}

function getAccountantTown() {
  const ctx = storage.getSyncContext() || {};
  if (String(ctx.role || '').toLowerCase() !== 'accountant') return '';
  return String(ctx.accountantTown || ctx.town_name || ctx.town_id || '').trim();
}

function isAccountantScoped() {
  return String(storage.getSyncContext()?.role || '').toLowerCase() === 'accountant';
}

function requireAccountantTown() {
  const town = getAccountantTown();
  if (!town) throw new Error('No town assigned to this accountant. CEO must assign a town first.');
  return town;
}

function scopedTown(requestedTown, required = false) {
  if (!isAccountantScoped()) {
    if (required && !isNonEmpty(requestedTown)) throw new Error('Town name is required');
    return requestedTown;
  }
  const assignedTown = requireAccountantTown();
  if (isNonEmpty(requestedTown) && String(requestedTown) !== assignedTown) {
    throw new Error(`Access denied. This accountant is assigned only to "${assignedTown}".`);
  }
  return assignedTown;
}

function assertTownAccess(townName) {
  scopedTown(townName, true);
}

function filterRowsByScope(rows, townKey = 'Town_Name') {
  if (!isAccountantScoped()) return rows;
  const town = requireAccountantTown();
  return (rows || []).filter((row) => String(row?.[townKey] || row?.town_name || row?.townName || '') === town);
}

function filterSoldByScope(result) {
  if (!isAccountantScoped()) return result;
  return {
    plots: filterRowsByScope(result?.plots || []),
    shops: filterRowsByScope(result?.shops || []),
  };
}

function stableReceiptId(receiptNumber, prefix = 'REC') {
  const raw = String(receiptNumber || `${prefix}-${Date.now()}`);
  return `${prefix}-${raw}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

function buildReceiptArchiveRow({
  receiptNumber,
  receiptType,
  townName,
  entityId,
  entityName,
  amount,
  receiptDate,
  payload,
}) {
  return {
    Receipt_ID: stableReceiptId(receiptNumber, 'REC'),
    Receipt_Number: receiptNumber || '',
    Receipt_Type: receiptType || '',
    Town_Name: townName || '',
    Entity_ID: entityId || '',
    Entity_Name: entityName || '',
    Amount: parseFloat(amount) || 0,
    Receipt_Date: receiptDate || new Date().toISOString().split('T')[0],
    Payload_JSON: typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
    Created_At: new Date().toISOString(),
  };
}

function buildInvestorReceiptPayload(tx) {
  return buildReceiptArchiveRow({
    receiptNumber: tx.Receipt_Number,
    receiptType: 'investor',
    townName: tx.Town_Name,
    entityId: tx.Investor_ID,
    entityName: tx.Investor_Name,
    amount: tx.Amount,
    receiptDate: tx.Date,
    payload: {
      type: 'investor',
      townName: tx.Town_Name,
      date: tx.Date,
      receiptNumber: tx.Receipt_Number,
      investorName: tx.Investor_Name,
      transactionType: tx.Type,
      amount: tx.Amount,
      balanceAfter: tx.Balance_After,
      note: tx.Notes,
    },
  });
}

function buildConstructionDealReceiptPayload(project) {
  const receiptNumber = project.Deal_Receipt_Number || `CON-DEAL-${project.Project_ID}`;
  return buildReceiptArchiveRow({
    receiptNumber,
    receiptType: 'construction_deal',
    townName: project.Town_Name,
    entityId: project.Project_ID,
    entityName: project.Constructor_Name,
    amount: project.Deal_Amount,
    receiptDate: project.Start_Date,
    payload: {
      type: 'construction_deal',
      townName: project.Town_Name,
      date: project.Start_Date,
      receiptNumber,
      category: project.Category,
      constructorName: project.Constructor_Name,
      phoneNumber: project.Phone_Number,
      companyName: project.Company_Name,
      materialName: project.Material_Name,
      materialQuantity: project.Material_Quantity,
      materialRate: project.Material_Rate,
      dealAmount: project.Deal_Amount,
      paidAmount: project.Paid_Amount,
      remainingAmount: project.Remaining_Amount,
      note: project.Notes,
    },
  });
}

function buildConstructionPaymentReceiptPayload(payment) {
  return buildReceiptArchiveRow({
    receiptNumber: payment.Receipt_Number,
    receiptType: 'construction_payment',
    townName: payment.Town_Name,
    entityId: payment.Project_ID,
    entityName: payment.Constructor_Name,
    amount: payment.Amount,
    receiptDate: payment.Payment_Date,
    payload: {
      type: 'construction_payment',
      townName: payment.Town_Name,
      date: payment.Payment_Date,
      receiptNumber: payment.Receipt_Number,
      category: payment.Category,
      constructorName: payment.Constructor_Name,
      materialName: payment.Material_Name,
      materialQuantity: payment.Material_Quantity,
      materialRate: payment.Material_Rate,
      amount: payment.Amount,
      remainingAmount: payment.Remaining_After,
      note: payment.Notes,
    },
  });
}

async function purgeLocalTownBusinessData(townName) {
  const town = String(townName || '').trim();
  if (!town) return;
  const { readExcelFile, deleteExcelRow, getGlobalsPath } = require('./db/core');
  const files = [
    'All_Sales.xlsx',
    'All_Expenses.xlsx',
    'Installments_Tracker.xlsx',
    'Collection_Payments.xlsx',
    'Resell_History.xlsx',
    'CEO_Expenses.xlsx',
    'CEO_Salary.xlsx',
    'Salary_Records.xlsx',
    'Daily_Entries.xlsx',
    'Notifications_Log.xlsx',
    'Commissions.xlsx',
    'Commission_Receipts.xlsx',
    'Town_Agents.xlsx',
    'Investors.xlsx',
    'Investor_Transactions.xlsx',
    'Construction_Projects.xlsx',
    'Construction_Payments.xlsx',
    'Receipt_Archive.xlsx',
    'Money_Ledger.xlsx',
    'Town_Financial_Summary.xlsx',
    'Town_Map_Shapes.xlsx',
  ];
  for (const file of files) {
    const fp = path.join(getGlobalsPath(), file);
    if (!fs.existsSync(fp)) continue;
    let rows = [];
    try { rows = await readExcelFile(fp, 'Data'); } catch (_) { continue; }
    const targets = rows
      .filter((row) => String(row.Town_Name || row.town_name || '') === town && row._rowNumber)
      .map((row) => row._rowNumber)
      .sort((a, b) => b - a);
    for (const rowNumber of targets) await deleteExcelRow(fp, 'Data', rowNumber);
  }
}

async function purgeCloudTownBusinessData(townName) {
  const town = String(townName || '').trim();
  if (!town) return;
  const tables = [
    'all_sales',
    'expenses',
    'installments',
    'collection_payments',
    'resell_history',
    'ceo_expenses',
    'ceo_salary',
    'salary_records',
    'salary_payments',
    'advance_salaries',
    'employees',
    'employees_v2',
    'daily_entries',
    'daily_reports',
    'notifications',
    'commissions',
    'commission_receipts',
    'town_agents',
    'investors',
    'investor_transactions',
    'construction_projects',
    'construction_payments',
    'receipt_archive',
    'money_ledger',
    'town_financial_summary',
    'town_map_shapes',
    'properties',
  ];
  for (const table of tables) {
    try { await onlineDb.deleteWhere(table, { Town_Name: town }); } catch (_) {}
  }
  // Deactivate all accountants assigned to this town
  try { await onlineDb.updateWhere('users', { role: 'accountant', town_name: town }, { is_active: false }); } catch (_) {}
  try { await onlineDb.updateWhere('users', { role: 'accountant', town_id: town }, { is_active: false }); } catch (_) {}
}

async function handleFactoryReset(dbPath) {
  const { getGlobalsPath, getTownsPath } = require('./db/core');
  
  // 1. Delete all Excel files in globals and towns folder
  const globalsDir = getGlobalsPath();
  const townsDir = getTownsPath();
  
  if (fs.existsSync(globalsDir)) {
    const files = fs.readdirSync(globalsDir);
    for (const f of files) {
      if (f.endsWith('.xlsx')) fs.unlinkSync(path.join(globalsDir, f));
    }
  }
  if (fs.existsSync(townsDir)) {
    const files = fs.readdirSync(townsDir);
    for (const f of files) {
      if (f.endsWith('.xlsx')) fs.unlinkSync(path.join(townsDir, f));
    }
  }

  // 2. Wipe cloud business tables
  const tables = [
    'all_sales', 'expenses', 'installments', 'collection_payments', 'resell_history',
    'ceo_expenses', 'ceo_salary', 'salary_records', 'salary_payments', 'advance_salaries',
    'employees', 'employees_v2', 'daily_entries', 'daily_reports', 'notifications',
    'commissions', 'commission_receipts', 'town_agents', 'investors', 'investor_transactions',
    'construction_projects', 'construction_payments', 'receipt_archive', 'money_ledger',
    'town_financial_summary', 'town_map_shapes', 'properties', 'towns'
  ];
  for (const table of tables) {
    try {
      const supabase = require('./db/supabase');
      await supabase.from(table).delete().neq('id', 'dummy-never-matches-anything');
    } catch (_) {}
  }

  // 3. Deactivate all non-CEO users
  try {
    const supabase = require('./db/supabase');
    await supabase.from('users').update({ is_active: false }).neq('role', 'ceo');
  } catch (_) {}
  
  // Also deactivate local offline accountants
  try {
    const accountantAuth = require('./db/accountantAuth');
    if (dbPath && fs.existsSync(dbPath)) {
      accountantAuth.deactivateAll(dbPath);
    }
  } catch(e) {}
  
  return { success: true };
}

function loadDevConfig() {
  const configPaths = [
    path.join(__dirname, '../../developer_config.json'),
    path.join(process.resourcesPath || '', 'developer_config.json'),
  ];
  for (const p of configPaths) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { /* skip */ }
  }
  return {};
}

function registerIpcHandlers(ipcMain, dbPath, win) {
  _windowGetter = win; // can be a function getter or direct reference
  dataLayer.init(dbPath, win);
  // Towns
  ipcMain.handle('get-towns', async () => {
    try {
      const towns = await dataLayer.read(
        () => getTowns(),
        () => onlineDb.getAll('towns')
      );
      return filterRowsByScope(towns);
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('add-town', async (_, data) => {
    try {
      assertObjectPayload(data, 'town payload');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      if (isAccountantScoped()) throw new Error('Only CEO can create towns');
      return await syncOnline(
        async () => {
          await purgeLocalTownBusinessData(data.Town_Name);
          return await addTown(data);
        },
        async () => {
          await purgeCloudTownBusinessData(data.Town_Name);
          return await onlineDb.insert('towns', { Town_Name: data.Town_Name, Location: data.Location || '', Status: data.Status || 'Active', Total_Plots: parseInt(data.Total_Plots) || 0, Total_Shops: parseInt(data.Total_Shops) || 0 });
        },
        { tableName: 'towns', payload: data, clientWriteId: `town-${String(data.Town_Name).trim().toLowerCase()}` }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('update-town', async (_, townName, data) => {
    try {
      if (!isNonEmpty(townName)) throw new Error('Town name is required');
      assertTownAccess(townName);
      assertObjectPayload(data, 'update payload');
      return await syncOnline(
        () => updateTown(townName, data),
        () => onlineDb.updateWhere('towns', { Town_Name: townName }, data),
        { tableName: 'towns', operation: 'update', payload: { ...data, Town_Name: townName }, clientWriteId: `town-update-${String(townName).trim().toLowerCase()}-${Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('delete-town', async (_, townName) => {
    try {
      assertPermanentDeleteAllowed();
      if (!isNonEmpty(townName)) throw new Error('Town name is required');
      if (isAccountantScoped()) throw new Error('Only CEO can delete towns');
      // Deactivate local accountants before sync
      accountantAuth.deactivateByTown(dbPath, townName);
      return await syncOnline(
        async () => {
          const result = await deleteTown(townName);
          await purgeLocalTownBusinessData(townName);
          return result;
        },
        async () => {
          await purgeCloudTownBusinessData(townName);
          try {
            const supabase = require('./db/supabase');
            await supabase.from('users').update({ is_active: false }).eq('town_id', townName).eq('role', 'accountant');
          } catch(e) {}
          return await onlineDb.deleteWhere('towns', { Town_Name: townName });
        },
        { tableName: 'towns', operation: 'delete', payload: { Town_Name: townName }, clientWriteId: `town-delete-${String(townName).trim().toLowerCase()}` }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-town-details', async (_, townName) => { try { const town = scopedTown(townName, true); return await dataLayer.read(() => getTownDetails(town), () => onlineDb.findOne('towns', { Town_Name: town })); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-town-prices', async (_, townName) => {
    try {
      const town = scopedTown(townName, true);
      const localPrices = await getTownPrices(town);
      // SECURITY: Compare with Supabase to detect local-only price manipulation
      let cloudWarning = null;
      try {
        const supabase = require('./db/supabase');
        const { data: cloudRow } = await supabase
          .from('towns')
          .select('Plot_Rate_Per_Marla,Shop_Rate_Per_SqFt,Plot_Rate_Per_Marla_Expected,Shop_Rate_Per_SqFt_Expected')
          .eq('Town_Name', town)
          .single()
          .timeout(3000);
        if (cloudRow) {
          const localPlotRate = parseFloat(localPrices?.Plot_Rate_Per_Marla || localPrices?.plotRate || 0);
          const cloudPlotRate = parseFloat(cloudRow.Plot_Rate_Per_Marla || cloudRow.Plot_Rate_Per_Marla_Expected || 0);
          if (localPlotRate > 0 && cloudPlotRate > 0 && Math.abs(localPlotRate - cloudPlotRate) > 0.01) {
            cloudWarning = {
              localPlotRate,
              cloudPlotRate,
              mismatch: true,
            };
          }
        }
      } catch {} // Supabase comparison is non-blocking
      return { ...localPrices, cloudWarning };
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('set-town-prices', async (_, townName, prices) => {
    try {
      if (!isNonEmpty(townName)) throw new Error('Town name is required');
      assertTownAccess(townName);
      assertObjectPayload(prices, 'prices payload');
      return await syncOnline(
        () => setTownPrices(townName, prices),
        () => onlineDb.updateWhere('towns', { Town_Name: townName }, prices),
        { tableName: 'towns', operation: 'update', payload: { ...prices, Town_Name: townName }, clientWriteId: `town-prices-${String(townName).trim().toLowerCase()}-${Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  // Properties
  ipcMain.handle('add-plot', async (_, data) => {
    try {
      assertObjectPayload(data, 'plot payload');
      if (!isNonEmpty(data.Plot_Number)) throw new Error('Plot_Number is required');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      assertTownAccess(data.Town_Name);
      return await syncOnline(
        () => addPlot(data),
        () => onlineDb.insert('properties', { Property_Type: 'Plot', Property_Number: data.Plot_Number, Town_Name: data.Town_Name, Status: 'Available', Price: parseFloat(data.Price) || 0 }),
        { tableName: 'properties', operation: 'insert', payload: { ...data, Property_Type: 'Plot', Property_Number: data.Plot_Number }, clientWriteId: `property-plot-${data.Town_Name}-${data.Plot_Number}` }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('add-shop', async (_, data) => {
    try {
      assertObjectPayload(data, 'shop payload');
      if (!isNonEmpty(data.Shop_Number)) throw new Error('Shop_Number is required');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      assertTownAccess(data.Town_Name);
      return await syncOnline(
        () => addShop(data),
        () => onlineDb.insert('properties', { Property_Type: 'Shop', Property_Number: data.Shop_Number, Town_Name: data.Town_Name, Status: 'Available', Price: parseFloat(data.Price) || 0 }),
        { tableName: 'properties', operation: 'insert', payload: { ...data, Property_Type: 'Shop', Property_Number: data.Shop_Number }, clientWriteId: `property-shop-${data.Town_Name}-${data.Shop_Number}` }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-plot', async (_, num, town) => { try { if (!isNonEmpty(num)) throw new Error('Plot number is required'); const scoped = scopedTown(town, true); return await dataLayer.read(() => getPropertyFile('Plot', num, scoped), () => onlineDb.getProperty('Plot', num, scoped)); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-shop', async (_, num, town) => { try { if (!isNonEmpty(num)) throw new Error('Shop number is required'); const scoped = scopedTown(town, true); return await dataLayer.read(() => getPropertyFile('Shop', num, scoped), () => onlineDb.getProperty('Shop', num, scoped)); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-all-plots', async (_, town) => {
    try {
      const scoped = scopedTown(town, isAccountantScoped());
      return await dataLayer.read(
        () => getAllPropertiesByTown(scoped, 'Plot'),
        () => onlineDb.getPropertiesByTown(scoped, 'Plot')
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-all-shops', async (_, town) => {
    try {
      const scoped = scopedTown(town, isAccountantScoped());
      return await dataLayer.read(
        () => getAllPropertiesByTown(scoped, 'Shop'),
        () => onlineDb.getPropertiesByTown(scoped, 'Shop')
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-all-properties', async () => {
    try {
      const result = await dataLayer.read(
        () => getAllProperties(),
        () => onlineDb.getAllProperties()
      );
      if (!isAccountantScoped()) return result;
      return { plots: filterRowsByScope(result?.plots || []), shops: filterRowsByScope(result?.shops || []) };
    } catch(e) { return { error: e.message }; }
  });

  // Town SVG map shapes
  ipcMain.handle('get-town-map-shapes', async (_, townName) => {
    try {
      const town = scopedTown(townName, isAccountantScoped());
      return await dataLayer.read(
        () => townMapDb.getTownMapShapes(town),
        async () => {
          const rows = await onlineDb.findMany('town_map_shapes', { Town_Name: town });
          return (rows || []).map(townMapDb.fromRow);
        }
      );
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('save-town-map-shapes', async (_, { townName, shapes }) => {
    try {
      const town = scopedTown(townName, true);
      assertTownAccess(town);
      if (!Array.isArray(shapes)) throw new Error('Shapes array is required');
      return await syncOnline(
        () => townMapDb.saveTownMapShapes(town, shapes),
        async () => {
          const rows = shapes.map((shape, index) => townMapDb.toRow(shape, town, index));
          const existing = await onlineDb.findMany('town_map_shapes', { Town_Name: town }).catch(() => []);
          const incoming = new Set(rows.map((row) => String(row.Shape_ID)));
          for (const row of rows) await onlineDb.insert('town_map_shapes', row);
          for (const row of existing || []) {
            const id = row.Shape_ID || row.shape_id;
            if (id && !incoming.has(String(id))) await onlineDb.deleteWhere('town_map_shapes', { Shape_ID: id });
          }
          return { success: true, count: rows.length };
        },
        { tableName: 'town_map_shapes', payload: { townName: town, count: shapes.length } }
      );
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('delete-town-map-shape', async (_, shapeId) => {
    try {
      if (!isNonEmpty(shapeId)) throw new Error('Shape id is required');
      return await syncOnline(
        () => townMapDb.deleteTownMapShape(shapeId),
        () => onlineDb.deleteWhere('town_map_shapes', { Shape_ID: shapeId }),
        { tableName: 'town_map_shapes', operation: 'delete', payload: { Shape_ID: shapeId } }
      );
    } catch(e) { return { error: e.message }; }
  });

  // Sales
  ipcMain.handle('sell-property', async (_, data) => {
    try {
      assertObjectPayload(data, 'sell payload');
      assertEnum(data.type, ['Plot', 'Shop'], 'property type');
      if (!isNonEmpty(data.number)) throw new Error('Property number is required');
      if (!isNonEmpty(data.townName)) throw new Error('Town name is required');
      assertTownAccess(data.townName);
      if (!isNonEmpty(data.Customer_Name)) throw new Error('Customer_Name is required');
      if (!isNonEmpty(data.Receipt_Number)) throw new Error('Receipt_Number is required');
      // SECURITY FIX: Server-side date validation — prevent price manipulation via backdated sales
      const today = new Date().toISOString().slice(0, 10);
      const saleDate = String(data.Sell_Date || '').slice(0, 10);
      if (saleDate && saleDate !== today) {
        throw new Error(`Sell date must be today (${today}). To use a different date, request a date change appeal from CEO first.`);
      }
      if (!saleDate) {
        data.Sell_Date = today;
      }
      return await syncOnline(
        () => sellProperty(data),
        async () => {
          const result = await onlineDb.sellProperty(data);
          if (data.Receipt_Number) await onlineDb.insert('receipt_archive', buildPropertyReceiptArchive(data, 'property_sale'));
          return result;
        },
        { tableName: 'all_sales', operation: 'insert', payload: data }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('cancel-deal', async (_, data) => {
    try {
      assertPermanentDeleteAllowed();
      assertObjectPayload(data, 'cancel payload');
      assertEnum(data.type, ['Plot', 'Shop'], 'property type');
      if (!isNonEmpty(data.number)) throw new Error('Property number is required');
      if (!isNonEmpty(data.townName)) throw new Error('Town name is required');
      assertTownAccess(data.townName);
      if (!isNonEmpty(data.Receipt_Number)) throw new Error('Receipt_Number is required');
      return await syncOnline(
        () => cancelDeal(data),
        () => onlineDb.cancelDeal(data),
        { tableName: 'all_sales', operation: 'delete', payload: data, clientWriteId: `cancel-deal-${data.townName}-${data.type}-${data.number}-${Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('updateFileStatus', async (_, params) => {
    try {
      assertObjectPayload(params, 'updateFileStatus payload');
      assertTownAccess(params.townName || params.Town_Name);
      return await syncOnline(
        () => updateFileStatus(params),
        () => onlineDb.updateFileStatus(params),
        { tableName: 'properties', operation: 'update', payload: params, clientWriteId: `file-status-${params.townName || params.Town_Name}-${params.type || params.Type}-${params.number || params.Property_Number}-${Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-sold-properties', async () => {
    try {
      const result = await dataLayer.read(
        () => getSoldProperties(),
        () => onlineDb.getSoldProperties()
      );
      return filterSoldByScope(result);
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-all-sales', async () => {
    try {
      const rows = await dataLayer.read(
        () => getAllSales(),
        () => onlineDb.getAllSales()
      );
      return filterRowsByScope(rows);
    } catch(e) { return { error: e.message }; }
  });

  // Installments
  ipcMain.handle('get-installments', async () => { try { const rows = await dataLayer.read(() => getInstallments(), () => onlineDb.getAllInstallments()); return filterRowsByScope(rows); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-due-installments', async () => { try { const rows = await dataLayer.read(() => getDueInstallments(), async () => { const all = await onlineDb.getAllInstallments(); const today = new Date().toISOString().split('T')[0]; const lead = new Date(); lead.setDate(lead.getDate() + 7); const leadDate = lead.toISOString().split('T')[0]; return (all || []).filter(i => { const s = (i.Status || '').toLowerCase(); if (s === 'paid') return false; const d = i.Due_Date || ''; return d && (d < today || d <= leadDate || s === 'overdue'); }).map(i => ({ ...i, Status: (i.Due_Date || '') < today ? 'Overdue' : 'Due' })); }); return filterRowsByScope(rows); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('mark-installment-paid', async (_, data) => {
    try {
      assertObjectPayload(data, 'installment payload');
      if (!isNonEmpty(data.Tracker_ID)) throw new Error('Tracker_ID is required');
      return await syncOnline(
        () => markInstallmentPaid(data),
        async (localResult) => {
          await onlineDb.markInstallmentPaid({
            ...data,
            Paid_Date: localResult?.receipt?.date || data.Paid_Date,
            Receipt_Number: localResult?.receiptNumber || data.Receipt_Number,
          });
          if (localResult?.receiptArchive) {
            await onlineDb.insert('receipt_archive', localResult.receiptArchive);
          }
          return localResult;
        },
        { tableName: 'installments', operation: 'update', payload: data, events: ['receipt:created', 'media:changed', 'account:changed'] }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('extend-installment-date', async (_, data) => {
    try {
      assertObjectPayload(data, 'installment payload');
      if (!isNonEmpty(data.Tracker_ID)) throw new Error('Tracker_ID is required');
      if (!isNonEmpty(data.New_Due_Date)) throw new Error('New_Due_Date is required');
      return await syncOnline(
        () => extendInstallmentDate(data),
        () => onlineDb.extendInstallmentDueDate(data),
        { tableName: 'installments', operation: 'update', payload: data, clientWriteId: `installment-extend-${data.Tracker_ID}-${Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  // Resell
  ipcMain.handle('resell-property', async (_, data) => {
    try {
      assertObjectPayload(data, 'resell payload');
      assertEnum(data.type, ['Plot', 'Shop'], 'property type');
      if (!isNonEmpty(data.number)) throw new Error('Property number is required');
      if (!isNonEmpty(data.townName)) throw new Error('Town name is required');
      assertTownAccess(data.townName);
      if (!isNonEmpty(data.Receipt_Number)) throw new Error('Receipt_Number is required');
      // SECURITY FIX: Server-side date validation — prevent price manipulation via backdated resells
      const today = new Date().toISOString().slice(0, 10);
      const resellDate = String(data.Sell_Date || data.Resell_Date || '').slice(0, 10);
      if (resellDate && resellDate !== today) {
        throw new Error(`Resell date must be today (${today}). To use a different date, request a date change appeal from CEO first.`);
      }
      if (!resellDate) {
        data.Sell_Date = today;
      }
      return await syncOnline(
        () => resellProperty(data),
        async () => {
          const result = await onlineDb.resellProperty(data);
          if (data.Receipt_Number) await onlineDb.insert('receipt_archive', buildPropertyReceiptArchive(data, 'property_resell'));
          return result;
        },
        { tableName: 'resell_history', operation: 'insert', payload: data }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-resell-history', async () => { try { const rows = await dataLayer.read(() => getResellHistory(), () => onlineDb.getAll('resell_history')); return filterRowsByScope(rows); } catch(e) { return { error: e.message }; } });

  // Expenses
  ipcMain.handle('add-expense', async (_, data) => {
    try {
      assertObjectPayload(data, 'expense payload');
      if (isAccountantScoped()) data.Town_Name = scopedTown(data.Town_Name, true);
      const { generateId } = require('./db/core');
      const expData = { Expense_ID: generateId(), Town_Name: data.Town_Name||'', Expense_Name: data.Expense_Name||'', Amount_PKR: parseFloat(data.Amount_PKR)||0, Description: data.Description||'', Category: data.Category||'General', Date: data.Date || new Date().toISOString().split('T')[0], Added_By: data.Added_By||'Employee' };
      const { appendToExcel, getGlobalsPath } = require('./db/core');
      const { recordMoneyEvent } = require('./db/moneyLedger');
      const p = require('path');
      await appendToExcel(p.join(getGlobalsPath(), 'All_Expenses.xlsx'), 'Data', expData);
      await recordMoneyEvent({
        sourceType: 'expense',
        sourceId: expData.Expense_ID,
        direction: 'expense',
        amount: expData.Amount_PKR,
        townName: expData.Town_Name,
        date: expData.Date,
        partyName: expData.Added_By,
        description: expData.Expense_Name,
        createdBy: expData.Added_By,
      });
      return await syncOnline(
        () => expData,
        () => onlineDb.insert('expenses', expData),
        { tableName: 'expenses', operation: 'insert', payload: expData, clientWriteId: expData.Expense_ID }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-expenses', async (_, town) => { try { const scoped = scopedTown(town, isAccountantScoped()); return await dataLayer.read(() => { const all = getAllExpenses(); return scoped ? all.filter(e => e.Town_Name === scoped) : all; }, async () => { const all = await onlineDb.getAll('expenses'); return scoped ? (all || []).filter(e => e.Town_Name === scoped) : (all || []); }); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-all-expenses', async () => { try { const rows = await dataLayer.read(() => getAllExpenses(), () => onlineDb.getAll('expenses')); return filterRowsByScope(rows); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-ceo-expenses', async () => { try { const rows = await dataLayer.read(() => getCeoExpenses(), () => onlineDb.getAll('ceo_expenses')); return filterRowsByScope(rows); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('add-ceo-expense', async (_, data) => {
    try {
      assertObjectPayload(data, 'ceo expense payload');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      assertTownAccess(data.Town_Name);
      if (!isNonEmpty(data.Expense_Name)) throw new Error('Expense_Name is required');
      return await syncOnline(
        () => addCeoExpense(data),
        () => onlineDb.insert('ceo_expenses', { Expense_ID: onlineDb.generateId(), Town_Name: data.Town_Name, Expense_Name: data.Expense_Name, Amount_PKR: parseFloat(data.Amount_PKR)||0, Description: data.Description||'', Category: data.Category||'General', Date: data.Date||new Date().toISOString().split('T')[0] }),
        { tableName: 'ceo_expenses', operation: 'insert', payload: data }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('delete-ceo-expense', async (_, id) => {
    try {
      assertPermanentDeleteAllowed();
      if (!isNonEmpty(id)) throw new Error('Expense id is required');
      return await syncOnline(
        () => deleteCeoExpense(id),
        () => onlineDb.deleteWhere('ceo_expenses', { Expense_ID: id }),
        { tableName: 'ceo_expenses', operation: 'delete', payload: { Expense_ID: id }, clientWriteId: `ceo-expense-delete-${id}` }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('edit-ceo-expense', async (_, data) => {
    try {
      assertObjectPayload(data, 'ceo expense payload');
      if (!isNonEmpty(data.Expense_ID)) throw new Error('Expense_ID is required');
      if (data.Town_Name) assertTownAccess(data.Town_Name);
      return await syncOnline(
        () => editCeoExpense(data),
        () => onlineDb.updateWhere('ceo_expenses', { Expense_ID: data.Expense_ID }, data),
        { tableName: 'ceo_expenses', operation: 'update', payload: data, clientWriteId: `ceo-expense-update-${data.Expense_ID}-${Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  // CEO Salary
  ipcMain.handle('get-ceo-salary', async () => { try { const rows = await dataLayer.read(() => getCeoSalary(), () => onlineDb.getAll('ceo_salary')); return filterRowsByScope(rows); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('add-ceo-salary', async (_, data) => {
    try {
      assertObjectPayload(data, 'ceo salary payload');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      assertTownAccess(data.Town_Name);
      if (!isNonEmpty(data.Month_Year)) throw new Error('Month_Year is required');
      return await syncOnline(
        () => addCeoSalary(data),
        () => onlineDb.insert('ceo_salary', { Salary_ID: onlineDb.generateId(), Town_Name: data.Town_Name, Month_Year: data.Month_Year, Amount_PKR: parseFloat(data.Amount_PKR)||0, Date: data.Date||new Date().toISOString().split('T')[0] }),
        { tableName: 'ceo_salary', operation: 'insert', payload: data }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('delete-ceo-salary', async (_, id) => {
    try {
      assertPermanentDeleteAllowed();
      if (!isNonEmpty(id)) throw new Error('Salary id is required');
      return await syncOnline(
        () => deleteCeoSalary(id),
        () => onlineDb.deleteWhere('ceo_salary', { Salary_ID: id }),
        { tableName: 'ceo_salary', operation: 'delete', payload: { Salary_ID: id }, clientWriteId: `ceo-salary-delete-${id}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  // Employees
  ipcMain.handle('add-employee', async (_, data) => {
    try {
      assertObjectPayload(data, 'employee payload');
      if (!isNonEmpty(data.Employee_Name)) throw new Error('Employee_Name is required');
      if (isAccountantScoped()) data.Town_Name = scopedTown(data.Town_Name, true);
      return await syncOnline(
        () => addEmployee(data),
        () => onlineDb.insert('employees', { Employee_ID: onlineDb.generateId(), Employee_Name: data.Employee_Name, CNIC: data.CNIC||'', Phone: data.Phone || data.Phone_Number || '', Role: data.Role||'', Town_Name: data.Town_Name||'', Salary: parseFloat(data.Salary)||0 }),
        { tableName: 'employees', operation: 'insert', payload: data }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-employees', async () => { try { const rows = await dataLayer.read(() => getEmployees(), () => onlineDb.getAll('employees')); return filterRowsByScope(rows); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('delete-employee', async (_, id) => {
    try {
      assertPermanentDeleteAllowed();
      if (!isNonEmpty(id)) throw new Error('Employee id is required');
      return await syncOnline(
        () => deleteEmployee(id),
        () => onlineDb.deleteWhere('employees', { Employee_ID: id }),
        { tableName: 'employees', operation: 'delete', payload: { Employee_ID: id }, clientWriteId: `employee-delete-${id}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  // Dashboard
  ipcMain.handle('get-dashboard-stats', async () => { try { return await dataLayer.read(() => getDashboardStats(), () => onlineDb.getDashboardStats()); } catch(e) { return { error: e.message }; } });

  ipcMain.handle('local-accountant-login', async (_, { email, password, adminPassword } = {}) => {
    try {
      const profile = accountantAuth.login(dbPath, email, password, adminPassword);
      storage.setSyncContext({
        role: 'accountant',
        userId: profile.id,
        accountantTown: profile.town_name,
      });
      scheduleQueuedCloudSync(1000);
      scheduleCloudDownload(1200);
      startPeriodicCloudSync(120000);
      startPeriodicCloudDownload(120000);
      return { success: true, user: { id: profile.id, email: profile.email }, profile };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('unlock-local-accountant', async (_, { email, adminPassword } = {}) => {
    try {
      const profile = accountantAuth.unlock(dbPath, email, adminPassword);
      storage.setSyncContext({
        role: 'accountant',
        userId: profile.id,
        accountantTown: profile.town_name,
      });
      scheduleQueuedCloudSync(1000);
      scheduleCloudDownload(1200);
      startPeriodicCloudSync(120000);
      startPeriodicCloudDownload(120000);
      return { success: true, user: { id: profile.id, email: profile.email }, profile };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('cache-local-accountant', async (_, params = {}) => {
    try {
      const profile = accountantAuth.upsertAccountant(dbPath, {
        id: params.id,
        email: params.email,
        password: params.password,
        full_name: params.full_name || params.fullName,
        town_name: params.town_name || params.townName || params.town_id || undefined,
        town_id: params.town_id || params.town_name || params.townName || undefined,
        admin_password: params.adminPassword || params.admin_password,
        is_active: params.is_active !== false,
      });
      return { success: true, profile };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-local-accountants-file', async () => {
    try {
      const filePath = accountantAuth.ensureFile(dbPath);
      return { success: true, filePath, accounts: accountantAuth.list(dbPath) };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('open-local-accountants-file', async () => {
    try {
      const filePath = accountantAuth.ensureFile(dbPath);
      await shell.openPath(filePath);
      return { success: true, filePath };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Notifications
  ipcMain.handle('get-notifications', async () => { try { const rows = await dataLayer.read(() => getNotifications(), () => onlineDb.getAll('notifications')); return filterRowsByScope(rows); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('dismiss-notification', async (_, id) => {
    try {
      if (!isNonEmpty(id)) throw new Error('Notification id is required');
      return await syncOnline(
        () => dismissNotification(id),
        () => onlineDb.updateWhere('notifications', { Notification_ID: id }, { Dismissed: 'Yes', Status: 'Dismissed' }),
        { tableName: 'notifications', operation: 'update', payload: { Notification_ID: id, Dismissed: 'Yes', Status: 'Dismissed' }, clientWriteId: `notification-dismiss-${id}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  // Backup & Sync
  ipcMain.handle('trigger-backup', async () => { try { return await performBackup(dbPath); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('configure-file-sync-context', async (_, context) => {
    try {
      storage.setSyncContext(context || {});
      storage.stopPeriodicFileSync();
      let fileSync = { skipped: true, reason: 'Storage is backup-only; business data sync uses Supabase DB.' };
      const role = String(storage.getSyncContext()?.role || '').toLowerCase();
      let databaseSync = { scheduled: false };
      if (role === 'ceo' || role === 'accountant') {
        scheduleQueuedCloudSync(1200);
        scheduleCloudDownload(900);
        startPeriodicCloudSync(120000);
        startPeriodicCloudDownload(120000);
        startDailyReceiptScheduler();
        databaseSync = { scheduled: true, background: true };
      }
      return { success: true, context: storage.getSyncContext(), fileSync, databaseSync };
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('sync-from-cloud', async (event) => { 
    try { 
      const sendProgress = (percent, msg) => {
        try {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('sync-progress', { percent, msg });
          }
        } catch (_) {}
      };
      const sendMappedProgress = (percent, msg) => {
        const mapped = percent <= 30
          ? Math.max(5, Math.round((percent / 30) * 50))
          : 50 + Math.round(((percent - 30) / 70) * 50);
        sendProgress(Math.min(100, mapped), msg);
      };
      sendProgress(5, 'Fetching latest data from database...');
      if (await pendingSync.hasPendingSyncRows()) {
        sendProgress(100, 'Skipped: local changes are still syncing to cloud.');
        return { success: false, skipped: true, error: 'Local changes are still pending sync. Sync to Cloud first, then download.' };
      }
      const result = { skippedStorage: true };
      const role = String(storage.getSyncContext()?.role || '').toLowerCase();
      let databaseSync = null;
      if (role === 'ceo' || role === 'accountant') {
        sendProgress(50, 'Cloud data fetched. Writing Excel cache...');
        databaseSync = await performFullSync(sendMappedProgress);
      }
      sendProgress(100, 'Sync Complete!');
      try { event.sender.send('cloud-data-refreshed', { background: false, at: new Date().toISOString() }); } catch (_) {}
      return { success: true, ...result, databaseSync };
    } catch(e) { return { error: e.message }; } 
  });

  ipcMain.handle('sync-to-cloud', async (event) => {
    try {
      const sendProgress = (percent, msg) => {
        try {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('sync-progress-to-cloud', { percent, msg });
          }
        } catch (_) {}
      };
      const result = await performFullSyncUp(sendProgress);
      await pendingSync.markAllPendingSynced();
      sendBusinessDataChanged({
        tableName: 'pending_sync',
        operation: 'update',
        status: 'synced',
        events: ['sync:success', 'pending-sync:changed'],
      });
      return { success: true, ...result };
    } catch(e) {
      await pendingSync.markPendingAttemptFailed(e).catch(() => {});
      sendBusinessDataChanged({
        tableName: 'pending_sync',
        operation: 'update',
        status: 'sync-failed',
        events: ['sync:failed', 'pending-sync:changed'],
        error: e.message || 'Unknown',
      });
      return { error: e.message };
    }
  });

  ipcMain.handle('get-pending-sync-status', async () => {
    try {
      const rows = await pendingSync.getPendingSyncRows();
      const byTable = {};
      for (const row of rows) {
        const table = String(row.Table_Name || 'unknown');
        byTable[table] = (byTable[table] || 0) + 1;
      }
      return { success: true, count: rows.length, byTable };
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('run-business-audit', async () => {
    try {
      const rootPath = dbPath;
      const outputDir = path.join(app.getPath('userData'), 'Reports');
      const scriptRoot = app.getAppPath();
      const scriptPath = fs.existsSync(path.join(scriptRoot, 'scripts', 'audit-business-data.mjs'))
        ? path.join(scriptRoot, 'scripts', 'audit-business-data.mjs')
        : path.join(process.cwd(), 'scripts', 'audit-business-data.mjs');
      const auditModule = await import(pathToFileURL(scriptPath).href);
      const result = await auditModule.runBusinessAudit({ rootPath, outputDir });
      return result;
    } catch(e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('run-handover-audit', async () => {
    try {
      const rootPath = app.getAppPath();
      const outputDir = path.join(app.getPath('userData'), 'Reports');
      const scriptPath = fs.existsSync(path.join(rootPath, 'scripts', 'audit-handover-stability.mjs'))
        ? path.join(rootPath, 'scripts', 'audit-handover-stability.mjs')
        : path.join(process.cwd(), 'scripts', 'audit-handover-stability.mjs');
      const auditModule = await import(pathToFileURL(scriptPath).href);
      const result = await auditModule.runHandoverStabilityAudit({ rootPath, outputDir });
      return result;
    } catch(e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-payment-accounts', async (_, townName) => {
    try {
      const town = scopedTown(townName, isAccountantScoped());
      return await cashBanks.getPaymentAccounts(town);
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('add-bank-account', async (_, data = {}) => {
    try {
      assertObjectPayload(data, 'bank account payload');
      if (isAccountantScoped()) data.Town_Name = scopedTown(data.Town_Name || data.townName, true);
      assertTownAccess(data.Town_Name || data.townName);
      return await syncOnline(
        () => cashBanks.addBankAccount(data),
        (account) => onlineDb.insert('cash_bank_accounts', account),
        { tableName: 'cash_bank_accounts', operation: 'insert', payload: data, clientWriteId: `cash-bank-${data.Town_Name || data.townName}-${data.Account_Name || data.accountName || Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('update-bank-account', async (_, { accountId, updates } = {}) => {
    try {
      if (!isNonEmpty(accountId)) throw new Error('Account ID is required');
      assertObjectPayload(updates, 'bank account updates');
      return await syncOnline(
        () => cashBanks.updateBankAccount(accountId, updates),
        (account) => onlineDb.updateWhere('cash_bank_accounts', { Account_ID: accountId }, account),
        { tableName: 'cash_bank_accounts', operation: 'update', payload: { Account_ID: accountId, ...(updates || {}) }, clientWriteId: `cash-bank-update-${accountId}-${Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('generate-daily-town-receipts', async (event, date) => {
    try {
      return await generateDailyTownReceiptBundle(date || new Date().toISOString().slice(0, 10), event.sender);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-daily-report-settings', async () => {
    try {
      return dailyReportSettings.getDailyReportSettings();
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('update-daily-report-settings', async (_, patch) => {
    try {
      return dailyReportSettings.updateDailyReportSettings(patch || {});
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('resend-daily-report-to-ceo', async (event, params = {}) => {
    try {
      const date = params.date || new Date().toISOString().slice(0, 10);
      return await generateDailyTownReceiptBundle(date, event.sender, { force: true });
    } catch (e) {
      return { error: e.message };
    }
  });

  // Auto Receipt Number
  ipcMain.handle('generate-receipt-number', async (_, townName) => {
    try {
      const prefix = (townName || '').substring(0, 3).toUpperCase();
      const sales = await dataLayer.read(() => getAllSales(), () => onlineDb.getAllSales());
      let maxNum = 0;
      for (const s of (sales || [])) {
        const rn = String(s.Receipt_Number || '');
        if (rn.startsWith(prefix)) {
          const num = parseInt(rn.substring(3), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
      return prefix + String(maxNum + 1).padStart(4, '0');
    } catch(e) { return { error: e.message }; }
  });

  // Reports
  ipcMain.handle('get-profit-loss-report', async () => { try { return await dataLayer.read(() => getProfitLossReport(), async () => { const stats = await onlineDb.getDashboardStats(); return [{ Town_Name: 'All', Total_Income: stats.totalIncome, Total_Expenses: stats.totalExpenses, Commission: stats.totalCommission, Net_Profit_Loss: stats.netProfitLoss }]; }); } catch(e) { return { error: e.message }; } });


  ipcMain.handle('factory-reset', async () => {
    try {
      assertPermanentDeleteAllowed();
      return await handleFactoryReset(dbPath);
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('get-town-performance', async (_, townName) => {
    try {
      const town = scopedTown(townName, true);
      return await dataLayer.read(() => getTownPerformance(town), () => onlineDb.getTownPerformance(town));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-town-ledger-report', async (_, params = {}) => {
    try {
      const town = scopedTown(params.townName, true);
      return await buildTownLedgerReport({ ...params, townName: town });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('export-town-ledger-report', async (_, params = {}) => {
    try {
      const town = scopedTown(params.townName, true);
      const result = await exportTownLedgerReport({ ...params, townName: town });
      const pdfPath = await renderHtmlReportToPdf(result.htmlPath);
      await mediaLibrary.recordMediaItem({
        townName: town,
        type: 'ledger_report',
        title: `${town} ledger report ${params.fromDate || ''} to ${params.toDate || ''}`.trim(),
        pdfPath,
        excelPath: result.excelPath,
        htmlPath: result.htmlPath,
        fromDate: params.fromDate || '',
        toDate: params.toDate || '',
      });
      sendMediaChanged({ townName: town, title: `${town} ledger report`, path: pdfPath });
      return { ...result, pdfPath };
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('export-account-ledger-report', async (_, params = {}) => {
    try {
      const town = scopedTown(params.townName, true);
      const account = params.account || {};
      const accountName = String(account.name || params.accountName || '').trim();
      if (!accountName) throw new Error('Account name is required');
      const fromDate = params.fromDate || '';
      const toDate = params.toDate || '';
      const sourceRows = Array.isArray(account.rows) ? account.rows : [];
      const rowsInRange = reportRowsInRange(sourceRows, fromDate, toDate);
      const hasDateFilter = Boolean(fromDate || toDate);
      const hasDatedSourceRows = sourceRows.some((row) => reportRowDate(row));
      let rows = hasDateFilter && hasDatedSourceRows ? rowsInRange : sourceRows;
      if (hasDateFilter && !hasDatedSourceRows) {
        const rangedReport = await buildTownLedgerReport({ townName: town, fromDate, toDate });
        const type = String(account.type || '').toLowerCase();
        const nameKey = accountName.toLowerCase();
        const label = (row) => String(row || '').trim().toLowerCase();
        if (type.includes('customer')) {
          const row = (rangedReport.customerLedgers || []).find((item) =>
            label(`${item.customer || item.Customer_Name || 'Customer'} - ${item.property || item.Plot_Shop_Number || ''}`) === nameKey
          );
          rows = row ? [row] : [];
        } else if (type.includes('employee')) {
          const row = (rangedReport.employeeLedgers || []).find((item) => label(item.name) === nameKey);
          rows = row ? [row] : [];
        } else if (type.includes('agent')) {
          const row = (rangedReport.agentLedgers || []).find((item) => label(item.name) === nameKey);
          rows = row ? [row] : [];
        } else if (type.includes('investor')) {
          const row = (rangedReport.investorLedgers || []).find((item) => label(item.name || item.Investor_Name) === nameKey);
          rows = row ? [row] : [];
        } else if (type.includes('constructor')) {
          const row = (rangedReport.constructorLedgers || rangedReport.constructionLedgers || []).find((item) => label(item.name || item.Constructor_Name) === nameKey);
          rows = row ? [row] : [];
        }
      }
      const totalBy = (keys) => rows.reduce((sum, row) => {
        for (const key of keys) {
          const value = Number(row?.[key]);
          if (Number.isFinite(value) && value !== 0) return sum + value;
        }
        return sum;
      }, 0);
      const accountType = String(account.type || '').toLowerCase();
      const displayReceived = accountType.includes('customer') || accountType.includes('investor')
        ? totalBy(['received', 'credit', 'Amount', 'amount'])
        : (hasDateFilter ? 0 : Number(account.received) || 0);
      const displayPaid = accountType.includes('employee') || accountType.includes('agent') || accountType.includes('constructor')
        ? totalBy(['cashDisbursed', 'paid', 'debit', 'Amount', 'amount'])
        : accountType.includes('investor')
          ? totalBy(['debit', 'paid'])
          : (hasDateFilter ? 0 : Number(account.paid) || 0);
      const displayBalance = rows.length
        ? totalBy(['balance', 'remaining']) || (displayReceived - displayPaid)
        : 0;
      const reportsDir = path.join(getGlobalsPath(), 'Reports', reportSafePart(town), 'Accounts');
      fs.mkdirSync(reportsDir, { recursive: true });
      const base = `${reportSafePart(accountName)}_${fromDate || 'from'}_${toDate || 'to'}_${Date.now()}`;
      const htmlPath = path.join(reportsDir, `${base}.html`);
      const rowsHtml = rows.length ? rows.map((row) => {
        const label = row.date || row.Date || row.property || row.name || account.type || '';
        const amount = accountReportAmount(row);
        const note = row.description || row.receiptNumber || row.receipt_number || row.property || '';
        return `<tr><td>${reportEscape(label)}</td><td>${reportEscape(note)}</td><td>${reportMoney(amount)}</td></tr>`;
      }).join('') : '<tr><td colspan="3">No ledger rows in this range</td></tr>';
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${reportEscape(accountName)} Account Report</title><style>
body{font-family:Arial,sans-serif;color:#111827;margin:28px;background:#f8fafc}h1{margin:0 0 4px;font-size:24px}.meta{color:#64748b;margin-bottom:18px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px}.card span{display:block;font-size:11px;color:#64748b;text-transform:uppercase}.card strong{font-size:18px}table{width:100%;border-collapse:collapse;background:#fff;margin-top:16px}th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:12px}th{background:#eff6ff}@media print{body{background:#fff;margin:12mm}.cards{grid-template-columns:1fr 1fr 1fr}}</style></head><body>
<h1>AL SIRAJ DEVELOPERS - Account Ledger Report</h1>
<div class="meta">${reportEscape(town)} | ${reportEscape(account.type || 'Account')} | ${reportEscape(accountName)} | ${reportEscape(fromDate)} to ${reportEscape(toDate)} | Generated ${new Date().toLocaleString()}</div>
<div class="cards"><div class="card"><span>Total Received</span><strong>${reportMoney(displayReceived)}</strong></div><div class="card"><span>Total Paid</span><strong>${reportMoney(displayPaid)}</strong></div><div class="card"><span>Balance</span><strong>${reportMoney(displayBalance)}</strong></div></div>
<table><thead><tr><th>Date / Source</th><th>Detail</th><th>Amount</th></tr></thead><tbody>${rowsHtml}</tbody></table>
</body></html>`;
      fs.writeFileSync(htmlPath, html, 'utf8');
      const pdfPath = await renderHtmlReportToPdf(htmlPath);
      await mediaLibrary.recordMediaItem({
        townName: town,
        type: 'account_report',
        title: `${accountName} account report`,
        accountName,
        pdfPath,
        htmlPath,
        fromDate,
        toDate,
      });
      sendMediaChanged({ townName: town, title: `${accountName} account report`, path: pdfPath });
      return { success: true, htmlPath, pdfPath };
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-due-installments-report', async (_, params = {}) => {
    try {
      const town = params.townName ? scopedTown(params.townName, true) : scopedTown('', false);
      return await buildDueInstallmentsReport({ ...params, townName: town || params.townName || '' });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('export-due-installments-report', async (_, params = {}) => {
    try {
      const town = params.townName ? scopedTown(params.townName, true) : scopedTown('', false);
      const result = await exportDueInstallmentsReport({ ...params, townName: town || params.townName || '' });
      const pdfPath = await renderHtmlReportToPdf(result.htmlPath);
      await mediaLibrary.recordMediaItem({
        townName: town || params.townName || '',
        type: 'due_installments',
        title: `Due installment report ${params.fromDate || ''} to ${params.toDate || ''}`.trim(),
        pdfPath,
        excelPath: result.excelPath,
        htmlPath: result.htmlPath,
        fromDate: params.fromDate || '',
        toDate: params.toDate || '',
      });
      sendMediaChanged({ townName: town || params.townName || '', title: 'Due installment report', path: pdfPath });
      return { ...result, pdfPath };
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-media-library', async (_, params = {}) => {
    try {
      const town = params.townName ? scopedTown(params.townName, true) : scopedTown('', false);
      return await mediaLibrary.getMediaLibrary({ ...params, townName: town || params.townName || '' });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('export-receipt-archive-pdf', async (_, params = {}) => {
    try {
      const receipt = params.receipt || {};
      const receiptNumber = String(receipt.Receipt_Number || params.receiptNumber || '').trim();
      if (!receiptNumber) throw new Error('Receipt number is required');
      const town = params.townName ? scopedTown(params.townName, true) : String(receipt.Town_Name || params.townName || '');
      const reportsDir = path.join(getGlobalsPath(), 'Reports', reportSafePart(town || 'Global'), 'Receipts');
      fs.mkdirSync(reportsDir, { recursive: true });
      const htmlPath = path.join(reportsDir, `${reportSafePart(receiptNumber)}_${Date.now()}.html`);
      let payload = {};
      try { payload = JSON.parse(receipt.Payload_JSON || '{}'); } catch (_) {}
      const labelMap = {
        paymentAccountName: 'Payment Account',
        direction: 'Direction',
        debitAccount: 'Debit Account',
        creditAccount: 'Credit Account',
        partyName: 'Party',
        customerName: 'Customer',
        investorName: 'Investor',
        constructorName: 'Constructor',
        propertyType: 'Property Type',
        propertyNumber: 'Property Number',
        installmentNumber: 'Installment No',
        totalInstallments: 'Total Installments',
        dueDate: 'Due Date',
        totalAmount: 'Total Amount',
        advanceAmount: 'Advance',
        remainingAmount: 'Remaining',
        balanceAfter: 'Balance After',
        category: 'Category',
        materialName: 'Material',
        materialQuantity: 'Quantity',
        materialRate: 'Rate',
        description: 'Description',
        note: 'Note',
        notes: 'Notes',
        sourceId: 'Source ID',
      };
      const orderedKeys = [
        'paymentAccountName', 'direction', 'debitAccount', 'creditAccount',
        'partyName', 'customerName', 'investorName', 'constructorName',
        'propertyType', 'propertyNumber', 'installmentNumber', 'totalInstallments', 'dueDate',
        'totalAmount', 'advanceAmount', 'remainingAmount', 'balanceAfter',
        'category', 'materialName', 'materialQuantity', 'materialRate',
        'description', 'note', 'notes', 'sourceId',
      ];
      const seenPayloadKeys = new Set();
      const renderValue = (key, value) => {
        if (value === undefined || value === null || String(value).trim() === '') return '';
        const moneyLike = /amount|balance|rate/i.test(key) && !Number.isNaN(Number(value));
        if (moneyLike) return reportMoney(value);
        return reportEscape(typeof value === 'object' ? JSON.stringify(value) : value);
      };
      const payloadRowFor = (key) => {
        if (!Object.prototype.hasOwnProperty.call(payload || {}, key)) return '';
        const rendered = renderValue(key, payload[key]);
        if (!rendered) return '';
        seenPayloadKeys.add(key);
        return `<tr><td>${reportEscape(labelMap[key] || key)}</td><td>${rendered}</td></tr>`;
      };
      const payloadRows = [
        ...orderedKeys.map(payloadRowFor),
        ...Object.entries(payload || {})
          .filter(([key]) => !seenPayloadKeys.has(key))
          .map(([key, value]) => {
            const rendered = renderValue(key, value);
            return rendered ? `<tr><td>${reportEscape(labelMap[key] || key)}</td><td>${rendered}</td></tr>` : '';
          }),
      ].join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${reportEscape(receiptNumber)}</title><style>
body{font-family:Arial,sans-serif;color:#111827;margin:28px;background:#f8fafc}h1{margin:0 0 4px;font-size:24px}.meta{color:#64748b;margin-bottom:18px}.box{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:14px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb;padding:8px 0}.row span{color:#64748b}.row b{color:#111827}table{width:100%;border-collapse:collapse;background:#fff;margin-top:12px}td,th{border:1px solid #e5e7eb;padding:8px;font-size:12px;text-align:left}th{background:#eff6ff}.sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:46px}.sig{border-top:1px solid #111827;padding-top:8px;text-align:center;font-weight:bold}@media print{body{background:#fff;margin:12mm}}</style></head><body>
<h1>AL SIRAJ DEVELOPERS - Receipt</h1>
<div class="meta">${reportEscape(town || receipt.Town_Name || '')} | Generated ${new Date().toLocaleString()}</div>
<div class="box">
<div class="row"><span>Receipt No</span><b>${reportEscape(receiptNumber)}</b></div>
<div class="row"><span>Type</span><b>${reportEscape(receipt.Receipt_Type || '')}</b></div>
<div class="row"><span>Entity</span><b>${reportEscape(receipt.Entity_Name || receipt.Entity_ID || '')}</b></div>
<div class="row"><span>Date</span><b>${reportEscape(receipt.Receipt_Date || '')}</b></div>
<div class="row"><span>Amount</span><b>${reportMoney(receipt.Amount)}</b></div>
</div>
<h2>Details</h2>
<table><tbody>${payloadRows || '<tr><td colspan="2">No additional details saved</td></tr>'}</tbody></table>
<div class="sign"><div class="sig">Accountant Signature</div><div class="sig">Receiver Signature</div></div>
</body></html>`;
      fs.writeFileSync(htmlPath, html, 'utf8');
      const pdfPath = await renderHtmlReportToPdf(htmlPath);
      await mediaLibrary.recordMediaItem({
        townName: town || receipt.Town_Name || '',
        type: receipt.Receipt_Type || 'receipt',
        title: `${receiptNumber} receipt`,
        accountName: receipt.Entity_Name || '',
        propertyNumber: receipt.Entity_ID || '',
        receiptNumber,
        pdfPath,
        htmlPath,
        reportDate: receipt.Receipt_Date || new Date().toISOString().slice(0, 10),
      });
      sendMediaChanged({ townName: town || receipt.Town_Name || '', title: `${receiptNumber} receipt`, path: pdfPath, events: ['media:changed', 'report:created', 'receipt:created'] });
      return { success: true, pdfPath, htmlPath };
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('open-report-file', async (_, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) throw new Error('Report file not found');
      const err = await shell.openPath(filePath);
      return err ? { error: err } : { success: true };
    } catch(e) { return { error: e.message }; }
  });

  // Installment Properties (for daily income entry)
  ipcMain.handle('getInstallmentProperties', async (_, townName) => { try { const town = scopedTown(townName, true); return await dataLayer.read(() => getInstallmentProperties(town), () => onlineDb.getInstallmentProperties(town)); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('getPropertyInstallments', async (_, propertyId) => { try { if (!isNonEmpty(propertyId)) throw new Error('Property ID is required'); return await dataLayer.read(() => getPropertyInstallments(propertyId), () => onlineDb.getPropertyInstallments(propertyId)); } catch(e) { return { error: e.message }; } });

  // Daily Entries
  ipcMain.handle('getDailyEntries', async (_, params) => {
    try {
      assertObjectPayload(params, 'getDailyEntries payload');
      const t = scopedTown(params.townName, isAccountantScoped());
      return await dataLayer.read(() => getDailyEntries({ ...params, townName: t }), async () => { const all = await onlineDb.getAll('daily_entries'); return t ? (all || []).filter(e => e.Town_Name === t) : (all || []); });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('addDailyEntry', async (_, params) => {
    try {
      assertObjectPayload(params, 'addDailyEntry payload');
      if (isAccountantScoped()) params.townName = scopedTown(params.townName || params.Town_Name, true);
      if (isAccountantScoped()) {
        const entryDate = String(params.date || params.Date || '').slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const reviewStatus = String(params.reviewStatus || params.Review_Status || '').toLowerCase();
        const approvedSource = String(params.approvalId || params.Approval_ID || params.appealId || '').trim();
        if (entryDate && entryDate !== today && reviewStatus !== 'approved' && !approvedSource) {
          throw new Error('Date change requires CEO approval. The entry was not saved to balances.');
        }
      }
      return await syncOnline(
        () => addDailyEntry(params),
        (localRow) => onlineDb.addDailyEntry(localRow),
        { tableName: 'daily_entries', operation: 'upsert', payload: params }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('deleteDailyEntry', async (_, params) => {
    try {
      assertPermanentDeleteAllowed();
      assertObjectPayload(params, 'deleteDailyEntry payload');
      return await syncOnline(
        () => deleteDailyEntry(params),
        () => onlineDb.deleteWhere('daily_entries', { Entry_ID: params.Entry_ID }),
        { tableName: 'daily_entries', operation: 'delete', payload: params, clientWriteId: `daily-entry-delete-${params.Entry_ID}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('recordSalaryPayment', async (_, data) => {
    try {
      assertObjectPayload(data, 'salary payload');
      if (isAccountantScoped()) data.townName = scopedTown(data.townName, true);
      const { recordSalaryPayment } = require('./db/globals');

      return await syncOnline(() => recordSalaryPayment(data), async (localResult) => {
        const receiptNumber = localResult?.Receipt_Number || `SAL-${Date.now()}`;
        const cashDisbursed = parseFloat(localResult?.Cash_Disbursed_Amount ?? data.cashDisbursedAmount ?? data.amount) || 0;
        const salaryApplied = parseFloat(localResult?.Salary_Paid_Amount ?? data.salaryAppliedAmount) || Math.max(0, (parseFloat(data.amount) || 0) - (parseFloat(data.newAdvanceGiven) || 0));
        const advanceGiven = parseFloat(localResult?.New_Advance_Given ?? data.newAdvanceGiven) || 0;
        await onlineDb.insert('salary_payments', {
          Payment_ID: onlineDb.generateId(),
          Receipt_Number: receiptNumber,
          Employee_Name: data.employeeName,
          Town_Name: data.townName,
          Amount: cashDisbursed,
          Salary_Amount: parseFloat(data.salaryAmount || data.baseSalary) || 0,
          Salary_Gross_Amount: parseFloat(data.salaryGrossAmount ?? data.amount) || 0,
          Cash_Disbursed_Amount: cashDisbursed,
          Salary_Paid_Amount: salaryApplied,
          Month: data.month,
          Payment_Date: localResult?.Date || new Date().toISOString().split('T')[0],
          Notes: data.note || '',
          Recorded_By: 'Accountant',
          Advance_Deduction: parseFloat(data.advanceDeduction) || 0,
          New_Advance_Given: advanceGiven,
          Is_Advance_Salary: advanceGiven > 0 || data.isAdvanceSalary ? 'Yes' : 'No',
        });
        if (salaryApplied > 0) {
          await onlineDb.recordMoneyEvent({
            sourceType: 'salary_payment',
            sourceId: `${receiptNumber}:salary`,
            direction: 'expense',
            amount: salaryApplied,
            townName: data.townName,
            date: localResult?.Date,
            partyName: data.employeeName,
            description: `${data.type || 'Employee'} salary applied ${data.month || ''}`,
            receiptNumber,
            debitAccount: 'Salary Expense',
            creditAccount: 'Cash / Bank',
            createdBy: 'Accountant',
          });
        }
        if (advanceGiven > 0) {
          await onlineDb.recordMoneyEvent({
            sourceType: 'salary_advance',
            sourceId: `${receiptNumber}:advance`,
            direction: 'expense',
            amount: advanceGiven,
            townName: data.townName,
            date: localResult?.Date,
            partyName: data.employeeName,
            description: `${data.type || 'Employee'} advance salary ${data.month || ''}`,
            receiptNumber,
            debitAccount: 'Employee Advance Receivable',
            creditAccount: 'Cash / Bank',
            createdBy: 'Accountant',
          });
        }
      }, { tableName: 'salary_payments', operation: 'insert', payload: data });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('getSalaryRecords', async (_, params) => {
    try {
      const { getSalaryRecords } = require('./db/globals');
      const tn = scopedTown(params?.townName, isAccountantScoped());
      return await dataLayer.read(() => getSalaryRecords(tn), async () => { const all = await onlineDb.getAll('salary_payments'); return tn ? (all || []).filter(r => r.Town_Name === tn) : (all || []); });
    } catch(e) { return { error: e.message }; }
  });

  // Employee DB (per-town)
  const employeeDB = new EmployeeDB(dbPath);
  employeeDB.initializeEmployeesSheet().catch(() => {});
  employeeDB.initializeAdvanceSalarySheet().catch(() => {});

  ipcMain.handle('getEmployeesV2', async (_, townName) => {
    try {
      const tn = scopedTown(townName, isAccountantScoped());
      return await dataLayer.read(() => employeeDB.getEmployees(tn), () => tn ? onlineDb.findMany('employees_v2', { Town_Name: tn }) : onlineDb.getAll('employees_v2'));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('addEmployeeV2', async (_, data) => {
    try {
      const name = data.name || data.Name || data.Employee_Name || '';
      const cnic = data.cnic || data.CNIC || '';
      const phone = data.phone || data.Phone || data.Phone_Number || '';
      const townName = scopedTown(data.townName || data.Town_Name || '', isAccountantScoped());
      const designation = data.designation || data.Role || data.Designation || '';
      const baseSalary = data.baseSalary || data.Salary || data.Base_Salary || 0;

      const normalizedData = {
        name,
        cnic,
        phone,
        townName,
        designation,
        baseSalary: parseFloat(baseSalary) || 0
      };

      const localRes = await employeeDB.addEmployee(normalizedData);
      return await syncOnline(() => localRes, () => onlineDb.insert('employees_v2', {
        Employee_ID: onlineDb.generateId(),
        Employee_Name: name,
        CNIC: cnic,
        Phone: phone,
        Town_Name: townName,
        Role: designation,
        Salary: parseFloat(baseSalary) || 0
      }), { tableName: 'employees_v2', operation: 'insert', payload: { ...normalizedData, Town_Name: townName } });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('updateEmployeeV2', async (_, { employeeId, data }) => {
    try {
      await employeeDB.updateEmployee(employeeId, data);
      const onlineUpdates = {};
      if (data.name !== undefined) onlineUpdates.Employee_Name = data.name;
      if (data.designation !== undefined) onlineUpdates.Role = data.designation;
      if (data.phone !== undefined) onlineUpdates.Phone = data.phone;
      if (data.cnic !== undefined) onlineUpdates.CNIC = data.cnic;
      if (data.baseSalary !== undefined) onlineUpdates.Salary = parseFloat(data.baseSalary) || 0;
      if (data.status !== undefined) onlineUpdates.Status = data.status;
      return await syncOnline(
        () => ({ success: true }),
        () => onlineDb.updateWhere('employees_v2', { Employee_ID: String(employeeId) }, onlineUpdates),
        { tableName: 'employees_v2', operation: 'update', payload: { Employee_ID: employeeId, ...data }, clientWriteId: `employee-v2-update-${employeeId}-${Date.now()}` }
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('addAdvanceSalary', async (_, data) => {
    try {
      if (isAccountantScoped()) data.townName = scopedTown(data.townName, true);
      return await syncOnline(() => employeeDB.addAdvanceSalary(data), () => onlineDb.insert('advance_salaries', {
        Advance_ID: onlineDb.generateId(),
        Employee_Name: data.employeeName,
        Town_Name: data.townName,
        Amount: parseFloat(data.totalAmount) || 0,
        Date: new Date().toISOString().split('T')[0],
        Status: 'Active',
        Notes: data.advanceType === 'installment' ? `Installments: ${data.totalInstallments}, Monthly: ${data.monthlyDeduction}` : 'Lump Sum',
      }), { tableName: 'advance_salaries', operation: 'insert', payload: data });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('getAdvanceSalaries', async (_, { townName, employeeName }) => {
    try {
      const tn = scopedTown(townName, isAccountantScoped());
      return await dataLayer.read(() => employeeDB.getAdvanceSalaries(tn, employeeName), async () => { const match = {}; if (tn) match.Town_Name = tn; if (employeeName) match.Employee_Name = employeeName; return await onlineDb.findMany('advance_salaries', match); });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('updateAdvanceSalary', async (_, advanceId) => {
    try {
      await employeeDB.updateAdvanceSalary(advanceId);
      return await syncOnline(
        () => ({ success: true }),
        () => onlineDb.updateWhere('advance_salaries', { Advance_ID: advanceId }, { Status: 'Paid' }),
        { tableName: 'advance_salaries', operation: 'update', payload: { Advance_ID: advanceId, Status: 'Paid' }, clientWriteId: `advance-salary-paid-${advanceId}` }
      );
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('deleteEmployeeV2', async (_, { employeeId, townName }) => {
    try {
      assertPermanentDeleteAllowed();
      assertTownAccess(townName);
      await employeeDB.updateEmployee(employeeId, { status: 'Deleted' });
      return await syncOnline(
        () => ({ success: true }),
        () => onlineDb.updateWhere('employees_v2', { Employee_ID: String(employeeId) }, { Status: 'Deleted' }),
        { tableName: 'employees_v2', operation: 'delete', payload: { Employee_ID: employeeId, Town_Name: townName, Status: 'Deleted' }, clientWriteId: `employee-v2-delete-${employeeId}` }
      );
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('sendDeleteEmployeeOtpEmail', async (_, { otpCode, employeeName, designation, townName, requestedBy }) => {
    try {
      const { apiKey, ceoEmail } = getEmailConfig();
      if (!apiKey) return { error: 'Resend API key not configured' };
      if (!ceoEmail) return { error: 'CEO email not configured' };

      console.log(`[Resend] Sending Delete Employee OTP to ${ceoEmail} for employee ${employeeName}`);

      const html = [
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
        '<h2 style="color:#dc2626;margin-bottom:16px">⚠️ Delete Employee Request — OTP</h2>',
        '<p style="color:#475569;font-size:14px;line-height:1.6">A request has been initiated to delete an employee:</p>',
        '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">',
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Employee Name</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${employeeName}</td></tr>`,
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Designation</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${designation || 'Employee'}</td></tr>`,
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Town</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${townName}</td></tr>`,
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Requested By</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${requestedBy || 'Accountant'}</td></tr>`,
        '</table>',
        '<div style="background:#fee2e2;border-radius:12px;padding:20px;text-align:center;margin:20px 0;border:1px solid #fecaca">',
        '<p style="color:#991b1b;font-size:12px;margin-bottom:8px">Share this OTP with the requester to approve employee deletion:</p>',
        `<div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#dc2626;font-family:monospace">${otpCode}</div>`,
        '<p style="color:#b91c1c;font-size:11px;margin-top:8px">Expires in 10 minutes</p>',
        '</div><p style="color:#94a3b8;font-size:11px">AL SIRAJ DEVELOPERS — Employee Management</p></div>',
      ].join('');

      return await sendResendEmail(apiKey, ceoEmail, `⚠️ Delete Employee OTP — ${employeeName} (${townName})`, html);
    } catch (e) { return { error: e.message }; }
  });


  // Nominatim location search (bypasses CSP via main process)
  ipcMain.handle('searchLocation', async (_, query) => {
    return new Promise((resolve) => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      https.get(url, { headers: { 'User-Agent': 'ALSIRAJDEV/1.0' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve([]); }
        });
      }).on('error', () => resolve([]));
    });
  });

  // ─── Generic Resend Email Helper ─────────────────────────────────────────
  function sendResendEmail(apiKey, to, subject, html) {
    return new Promise((resolve) => {
      const payload = JSON.stringify({
        from: 'AL SIRAJ DEVELOPERS <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });

      const req = https.request({
        hostname: 'api.resend.com',
        port: 443,
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        rejectUnauthorized: false,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200 || res.statusCode === 201) {
              resolve({ success: true, id: parsed.id });
            } else {
              resolve({ error: parsed.message || parsed.error || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ error: 'Invalid response from Resend API' });
          }
        });
      });

      req.on('error', (err) => resolve({ error: err.message }));
      req.write(payload);
      req.end();
    });
  }

  function getEmailConfig() {
    const config = loadDevConfig();
    return { apiKey: config.resend_api_key, ceoEmail: config.ceo_email };
  }

  // ─── Resend — Send OTP to CEO (Agent Registration) ───────────────────────
  ipcMain.handle('sendOtpEmail', async (_, { otpCode, agentName, agentEmail, agentTown }) => {
    const { apiKey, ceoEmail } = getEmailConfig();
    if (!apiKey) return { error: 'Resend API key not configured' };
    if (!ceoEmail) return { error: 'CEO email not configured' };

    console.log(`[Resend] Sending OTP to ${ceoEmail} for agent ${agentName} (${agentEmail})`);

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
      '<h2 style="color:#1e293b;margin-bottom:16px">Agent Registration Approval</h2>',
      '<p style="color:#475569;font-size:14px;line-height:1.6">A new agent has registered:</p>',
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">',
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Name</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Email</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentEmail}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Town</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentTown}</td></tr>`,
      '</table>',
      '<div style="background:#f1f5f9;border-radius:12px;padding:20px;text-align:center;margin:20px 0">',
      '<p style="color:#64748b;font-size:12px;margin-bottom:8px">Share this OTP with the agent:</p>',
      `<div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#2563eb;font-family:monospace">${otpCode}</div>`,
      '<p style="color:#94a3b8;font-size:11px;margin-top:8px">Expires in 10 minutes</p>',
        '</div><p style="color:#94a3b8;font-size:11px">AL SIRAJ DEVELOPERS — Agent Registration</p></div>',
    ].join('');

    return sendResendEmail(apiKey, ceoEmail, `Agent Registration OTP — ${agentName}`, html);
  });

  // ─── Resend — Installment Plan OTP Email to CEO ─────────────────────
  ipcMain.handle('sendInstallmentOtpEmail', async (_, { otpCode, agentName, agentTown, propertyType, propertyNumber, customerName, totalInstallments, monthlyInstallment }) => {
    const { apiKey, ceoEmail } = getEmailConfig();
    if (!apiKey) return { error: 'Resend API key not configured' };
    if (!ceoEmail) return { error: 'CEO email not configured' };

    console.log(`[Resend] Sending Installment OTP to ${ceoEmail} for agent ${agentName}`);

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
      '<h2 style="color:#1e293b;margin-bottom:16px">📋 Installment Plan Approval — OTP</h2>',
      '<p style="color:#475569;font-size:14px;line-height:1.6">An agent is requesting approval for a custom installment plan:</p>',
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">',
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Agent</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Town</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentTown}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Property</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${propertyType} #${propertyNumber}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Customer</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${customerName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Installments</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${totalInstallments} payments</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Monthly Amount</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">PKR ${(parseFloat(monthlyInstallment) || 0).toLocaleString()}</td></tr>`,
      '</table>',
      '<div style="background:#f1f5f9;border-radius:12px;padding:20px;text-align:center;margin:20px 0">',
      '<p style="color:#64748b;font-size:12px;margin-bottom:8px">Share this OTP with the agent to approve:</p>',
      `<div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#2563eb;font-family:monospace">${otpCode}</div>`,
      '<p style="color:#94a3b8;font-size:11px;margin-top:8px">Expires in 10 minutes</p>',
        '</div><p style="color:#94a3b8;font-size:11px">AL SIRAJ DEVELOPERS — Installment Plan Approval</p></div>',
    ].join('');

    return sendResendEmail(apiKey, ceoEmail, `📋 Installment OTP — ${agentName} (${propertyType} #${propertyNumber})`, html);
  });

  // ─── Resend — Date Change OTP Email to CEO ───────────────────────────
  ipcMain.handle('sendDateChangeOtpEmail', async (_, { otpCode, agentName, agentTown, currentDate, newDate, propertyType, propertyNumber }) => {
    const { apiKey, ceoEmail } = getEmailConfig();
    if (!apiKey) return { error: 'Resend API key not configured' };
    if (!ceoEmail) return { error: 'CEO email not configured' };

    console.log(`[Resend] Sending Date Change OTP to ${ceoEmail} for agent ${agentName}`);

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
      '<h2 style="color:#1e293b;margin-bottom:16px">📅 Date Change Request — OTP</h2>',
      '<p style="color:#475569;font-size:14px;line-height:1.6">An agent is requesting a sale date change:</p>',
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">',
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Agent</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Town</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentTown}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Property</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${propertyType} #${propertyNumber}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Current Date</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${currentDate}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Requested Date</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#2563eb">${newDate}</td></tr>`,
      '</table>',
      '<div style="background:#f1f5f9;border-radius:12px;padding:20px;text-align:center;margin:20px 0">',
      '<p style="color:#64748b;font-size:12px;margin-bottom:8px">Share this OTP with the agent to approve:</p>',
      `<div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#2563eb;font-family:monospace">${otpCode}</div>`,
      '<p style="color:#94a3b8;font-size:11px;margin-top:8px">Expires in 10 minutes</p>',
        '</div><p style="color:#94a3b8;font-size:11px">AL SIRAJ DEVELOPERS — Date Change Request</p></div>',
    ].join('');

    return sendResendEmail(apiKey, ceoEmail, `📅 Date Change OTP — ${agentName} (${propertyType} #${propertyNumber})`, html);
  });

  // ─── Resend — Backdated Daily Entry OTP Email to CEO ────────────────
  ipcMain.handle('sendDailyEntryOtpEmail', async (_, { otpCode, accountantName, townName, entryDate, entryType, amount, description }) => {
    const { apiKey, ceoEmail } = getEmailConfig();
    if (!apiKey) return { error: 'Resend API key not configured' };
    if (!ceoEmail) return { error: 'CEO email not configured' };

    console.log(`[Resend] Sending Backdated Entry OTP to ${ceoEmail} for ${accountantName}`);

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
      '<h2 style="color:#1e293b;margin-bottom:16px">⏳ Backdated Entry Request — OTP</h2>',
      '<p style="color:#475569;font-size:14px;line-height:1.6">An accountant is requesting to add an entry for a past date:</p>',
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">',
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Accountant</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${accountantName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Town</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${townName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Date Requested</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#e11d48">${entryDate}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Type</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${entryType}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Amount</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">PKR ${parseFloat(amount).toLocaleString()}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Desc</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${description}</td></tr>`,
      '</table>',
      '<div style="background:#f1f5f9;border-radius:12px;padding:20px;text-align:center;margin:20px 0">',
      '<p style="color:#64748b;font-size:12px;margin-bottom:8px">Share this OTP with the accountant to approve:</p>',
      `<div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#2563eb;font-family:monospace">${otpCode}</div>`,
      '<p style="color:#94a3b8;font-size:11px;margin-top:8px">Expires in 10 minutes</p>',
        '</div><p style="color:#94a3b8;font-size:11px">AL SIRAJ DEVELOPERS — Backdated Entry Request</p></div>',
    ].join('');

    return sendResendEmail(apiKey, ceoEmail, `⏳ Backdated Entry OTP — ${accountantName} (${entryDate})`, html);
  });

  // ─── Resend — Sale Notification Email ─────────────────────────────────────
  ipcMain.handle('sendDailyEntryRejectionEmail', async (_, { accountantEmail, accountantName, townName, entryDate, entryType, amount, description, reason }) => {
    const { apiKey } = getEmailConfig();
    if (!apiKey) return { error: 'Resend API key not configured' };
    if (!accountantEmail) return { error: 'Accountant email not found' };

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">',
      '<h2 style="color:#b91c1c;margin-bottom:16px">Daily Entry Rejected</h2>',
      '<p style="color:#475569;font-size:14px;line-height:1.6">Your daily entry request was reviewed by CEO and rejected.</p>',
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">',
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Accountant</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${accountantName || 'Accountant'}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Town</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${townName || '-'}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Date</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${entryDate || '-'}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Type</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${entryType || 'Entry'}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Amount</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">PKR ${(parseFloat(amount) || 0).toLocaleString()}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Description</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${description || '-'}</td></tr>`,
      '</table>',
      `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;color:#991b1b;font-size:13px"><strong>Reason:</strong> ${reason || 'Rejected from CEO review.'}</div>`,
      '<p style="color:#94a3b8;font-size:11px;margin-top:20px">AL SIRAJ DEVELOPERS - Daily Entries</p>',
      '</div>',
    ].join('');

    return sendResendEmail(apiKey, accountantEmail, `Daily Entry Rejected - ${entryDate || 'Review'}`, html);
  });

  ipcMain.handle('sendSaleEmail', async (_, { propertyType, propertyNumber, townName, customerName, totalAmount, agentName }) => {
    const { apiKey, ceoEmail } = getEmailConfig();
    if (!apiKey) return { error: 'Resend API key not configured' };
    if (!ceoEmail) return { error: 'CEO email not configured' };

    console.log(`[Resend] Sending sale notification to ${ceoEmail}`);

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
      '<h2 style="color:#1e293b;margin-bottom:8px">✅ Property Sold!</h2>',
      '<p style="color:#475569;font-size:14px;line-height:1.6">A property has been sold:</p>',
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">',
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Property</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${propertyType} #${propertyNumber}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Town</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${townName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Customer</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${customerName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Amount</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">PKR ${(parseFloat(totalAmount) || 0).toLocaleString()}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Agent</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentName || 'N/A'}</td></tr>`,
      '</table>',
      '<p style="color:#94a3b8;font-size:11px">AL SIRAJ DEVELOPERS — Property Sale Notification</p></div>',
    ].join('');

    return sendResendEmail(apiKey, ceoEmail, `✅ ${propertyType} #${propertyNumber} Sold — ${townName}`, html);
  });

  // ─── Resend — File Delivery Notification Email (with image) ─────────────
  function base64FromDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
    return match ? { ext: match[1], base64: match[2] } : null;
  }

  ipcMain.handle('sendFileDeliveryEmail', async (_, { propertyType, propertyNumber, townName, customerName, agentName, deliveryImage }) => {
    const { apiKey, ceoEmail } = getEmailConfig();
    if (!apiKey) return { error: 'Resend API key not configured' };
    if (!ceoEmail) return { error: 'CEO email not configured' };

    console.log(`[Resend] Sending file delivery notification to ${ceoEmail}`);

    const imgTag = deliveryImage ? '<p style="margin:16px 0 0;font-weight:600;color:#1e293b;font-size:13px">📎 Delivery Photo:</p><img src="cid:delivery-image" style="max-width:100%;border-radius:12px;margin-top:8px;border:1px solid #e2e8f0" />' : '';

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
      '<h2 style="color:#1e293b;margin-bottom:8px">📁 File Delivered!</h2>',
      '<p style="color:#475569;font-size:14px;line-height:1.6">An agent has marked a file as delivered:</p>',
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">',
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Property</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${propertyType} #${propertyNumber}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Town</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${townName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Customer</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${customerName}</td></tr>`,
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Agent</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${agentName || 'N/A'}</td></tr>`,
      '</table>',
      imgTag,
      '<p style="color:#94a3b8;font-size:11px;margin-top:16px">AL SIRAJ DEVELOPERS — File Delivery Notification</p></div>',
    ].join('');

    const attachments = [];
    const parsed = base64FromDataUrl(deliveryImage);
    if (parsed) {
      attachments.push({
        filename: `delivery-${propertyNumber}.${parsed.ext}`,
        content: parsed.base64,
        cid: 'delivery-image',
      });
    }

    const payload = JSON.stringify({
      from: 'AL SIRAJ DEVELOPERS <onboarding@resend.dev>',
      to: [ceoEmail],
      subject: `📁 ${propertyType} #${propertyNumber} File Delivered — ${townName}`,
      html,
      attachments,
    });

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.resend.com',
        port: 443,
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        rejectUnauthorized: false,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200 || res.statusCode === 201) {
              resolve({ success: true, id: parsed.id });
            } else {
              resolve({ error: parsed.message || parsed.error || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ error: 'Invalid response from Resend API' });
          }
        });
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.write(payload);
      req.end();
    });
  });

  // ─── Resend — Test Email ─────────────────────────────────────────────────
  ipcMain.handle('testResendEmail', async () => {
    const { apiKey, ceoEmail } = getEmailConfig();
    if (!apiKey) return { error: 'API key not configured' };
    if (!ceoEmail) return { error: 'CEO email not configured' };

    console.log('[Resend Test] Sending test email...');
    return sendResendEmail(apiKey, ceoEmail, 'Test Email from AL SIRAJ DEVELOPERS', '<p>If you receive this, Resend is configured correctly!</p>');
  });

  // ─── CEO — Create Accountant Account ─────────────────────────────────────
  ipcMain.handle('create-accountant', async (_, { fullName, email, password, townName }) => {
    try {
      if (isAccountantScoped()) throw new Error('Only CEO can create accountant accounts');
      if (!fullName || !email || !password) throw new Error('Name, email and password are required');
      const towns = await getTowns();
      const assignedTown = townName || towns?.[0]?.Town_Name || '';
      if (!assignedTown) throw new Error('Please create/select a town before creating accountant');
      const supabase = require('./db/supabase');
      const cleanEmail = String(email || '').trim().toLowerCase();
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: fullName, role: 'accountant', town_id: assignedTown, town_name: assignedTown } },
      });
      if (authError) {
        const msg = String(authError.message || '').toLowerCase();
        if (msg.includes('already') || msg.includes('registered')) {
          const { data: existingProfile, error: lookupError } = await supabase
            .from('users')
            .select('id')
            .eq('email', cleanEmail)
            .maybeSingle();
          if (lookupError) throw lookupError;
          if (!existingProfile?.id) {
            throw new Error('This email is already registered in auth but has no user profile. Use a new email or fix this user in Supabase.');
          }
          const { error: updateError } = await supabase
            .from('users')
            .update({
              full_name: fullName,
              role: 'accountant',
              town_id: assignedTown,
              town_name: assignedTown,
              is_active: true,
            })
            .eq('id', existingProfile.id);
          if (updateError) throw updateError;
          accountantAuth.upsertAccountant(dbPath, {
            id: existingProfile.id,
            full_name: fullName,
            email: cleanEmail,
            password,
            town_name: assignedTown,
          });
          return { success: true, userId: existingProfile.id, townName: assignedTown, existing: true, offlineLogin: true };
        }
        throw authError;
      }
      if (!authData?.user?.id) throw new Error('Accountant auth user was not created');
      const profilePayload = {
        id: authData.user.id,
        email: cleanEmail,
        full_name: fullName,
        role: 'accountant',
        town_id: assignedTown,
        town_name: assignedTown,
        is_active: true,
      };
      const { error: profileError } = await supabase
        .from('users')
        .upsert([profilePayload], { onConflict: 'id' });
      if (profileError) throw profileError;
      accountantAuth.upsertAccountant(dbPath, {
        id: authData.user.id,
        full_name: fullName,
        email: cleanEmail,
        password,
        town_name: assignedTown,
      });
      return { success: true, userId: authData.user.id, townName: assignedTown, offlineLogin: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-town-agents', async (_, townName) => {
    try { const town = scopedTown(townName, isAccountantScoped()); return await dataLayer.read(() => businessExtras.getTownAgents(town), () => onlineDb.findMany?.('town_agents', town ? { Town_Name: town } : {}) || []); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('add-town-agent', async (_, data) => {
    try {
      assertObjectPayload(data, 'town agent payload');
      if (isAccountantScoped()) data.Town_Name = scopedTown(data.Town_Name, true);
      return await syncOnline(
        () => businessExtras.addTownAgent(data),
        (localAgent) => onlineDb.insert('town_agents', localAgent),
        { tableName: 'town_agents', operation: 'insert', payload: data, clientWriteId: `town-agent-${data.Town_Name || ''}-${data.Agent_Name || data.name || Date.now()}` }
      );
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-daily-reports', async (_, townName) => {
    try {
      const { getDailyReportsLocal } = require('./db/dailyReports');
      const town = scopedTown(townName, isAccountantScoped());
      return await dataLayer.read(() => getDailyReportsLocal(town), () => onlineDb.findMany?.('daily_reports', town ? { Town_Name: town } : {}) || []);
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('export-daily-report', async (_, reportId) => {
    try {
      const { getDailyReportsLocal } = require('./db/dailyReports');
      const reports = await getDailyReportsLocal();
      const report = reports.find(r => r.Report_ID === reportId || String(r.id) === String(reportId));
      if (!report) throw new Error('Report not found locally');
      
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tmpPath = path.join(os.tmpdir(), `EOD_Report_${report.Town_Name}_${report.Date}.html`);
      
      const data = report.Report_Data || {};
      const html = `
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
            h1 { color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; }
            .card { background: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; }
            .card h3 { margin-top: 0; color: #4b5563; font-size: 14px; text-transform: uppercase; }
            .card p { font-size: 24px; font-weight: bold; margin: 10px 0 0 0; color: #111827; }
            .footer { margin-top: 50px; font-size: 12px; color: #9ca3af; text-align: center; }
          </style>
        </head>
        <body>
          <h1>End of Day Snapshot - ${report.Town_Name}</h1>
          <p><strong>Date:</strong> ${report.Date}</p>
          <p><strong>Generated At:</strong> ${new Date(report.Generated_At).toLocaleString()}</p>
          
          <div class="grid">
            <div class="card"><h3>Total Received</h3><p>PKR ${Number(data.totalReceived || 0).toLocaleString()}</p></div>
            <div class="card"><h3>Total Expenses</h3><p>PKR ${Number(data.totalExpenses || 0).toLocaleString()}</p></div>
            <div class="card"><h3>Cash Entries</h3><p>PKR ${Number(data.dailyEntries || 0).toLocaleString()}</p></div>
            <div class="card"><h3>Net Balance</h3><p>PKR ${Number(data.net || 0).toLocaleString()}</p></div>
            <div class="card"><h3>Properties Sold</h3><p>${data.propertiesSold || 0}</p></div>
          </div>
          
          <div class="footer">
            <p>ZameenKhata System | Auto-generated Report | ID: ${report.Report_ID}</p>
          </div>
        </body>
        </html>
      `;
      fs.writeFileSync(tmpPath, html);
      return { htmlPath: tmpPath, pdfPath: tmpPath };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-investors', async (_, townName) => {
    try { const town = scopedTown(townName, isAccountantScoped()); return await dataLayer.read(() => businessExtras.getInvestors(town), () => onlineDb.findMany?.('investors', town ? { Town_Name: town } : {}) || []); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('add-investor', async (_, data) => {
    try {
      assertObjectPayload(data, 'investor payload');
      if (isAccountantScoped()) data.Town_Name = scopedTown(data.Town_Name, true);
      return await syncOnline(
        () => businessExtras.addInvestor(data),
        (localInvestor) => onlineDb.insert('investors', localInvestor),
        { tableName: 'investors', operation: 'insert', payload: data, clientWriteId: `investor-${data.Town_Name || ''}-${data.Investor_Name || data.name || Date.now()}` }
      );
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('record-investor-transaction', async (_, data) => {
    try {
      assertObjectPayload(data, 'investor transaction payload');
      if (isAccountantScoped()) data.Town_Name = scopedTown(data.Town_Name, true);
      const result = await syncOnline(
        async () => {
          const tx = await businessExtras.investorTransaction(data);
          await addDailyEntry({
            date: tx.Date,
            type: tx.Type === 'Credit' ? 'Income' : 'Expense',
            description: `Investor ${tx.Type}: ${tx.Investor_Name}`,
            amount: tx.Amount,
            townName: tx.Town_Name,
            incomeType: 'Investor',
            category: tx.Type === 'Credit' ? 'Investor Credit' : 'Investor Debit',
            reference: tx.Transaction_ID,
            createdBy: tx.Created_By || 'System',
            reviewStatus: 'approved',
          });
          return tx;
        },
        async (tx) => {
          await onlineDb.insert('investor_transactions', tx);
          await onlineDb.updateWhere('investors', { Investor_ID: tx.Investor_ID }, { Balance: tx.Balance_After });
          await onlineDb.insert('receipt_archive', buildInvestorReceiptPayload(tx));
          await onlineDb.addDailyEntry({
            Entry_ID: `INV-${String(tx.Transaction_ID || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`,
            Town_Name: tx.Town_Name,
            Date: tx.Date,
            Type: tx.Type === 'Credit' ? 'Income' : 'Expense',
            Category: tx.Type === 'Credit' ? 'Investor Credit' : 'Investor Debit',
            Amount: tx.Amount,
            Description: `Investor ${tx.Type}: ${tx.Investor_Name}`,
            Reference: tx.Transaction_ID,
            Created_By: tx.Created_By || 'System',
            Review_Status: 'approved',
            Payment_Account_ID: tx.Payment_Account_ID,
            Payment_Account_Name: tx.Payment_Account_Name,
            Payment_Account_Type: tx.Payment_Account_Type,
          });
          await onlineDb.recordMoneyEvent({
            sourceType: 'investor_transaction',
            sourceId: tx.Transaction_ID,
            direction: tx.Type === 'Debit' ? 'expense' : 'income',
            amount: tx.Amount,
            townName: tx.Town_Name,
            date: tx.Date,
            partyName: tx.Investor_Name,
            description: `Investor ${tx.Type}`,
            receiptNumber: tx.Receipt_Number,
            createdBy: tx.Created_By || 'System',
            status: 'approved',
            paymentAccountId: tx.Payment_Account_ID,
            paymentAccountName: tx.Payment_Account_Name,
            paymentAccountType: tx.Payment_Account_Type,
          });
        },
        { tableName: 'investor_transactions', operation: 'insert', payload: data, clientWriteId: `investor-tx-${data.Transaction_ID || data.Investor_ID || data.investorId || Date.now()}` }
      );
      return result;
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-investor-transactions', async (_, params = {}) => {
    try { const town = scopedTown(params.townName, isAccountantScoped()); return await dataLayer.read(() => businessExtras.getInvestorTransactions(town, params.investorId), () => onlineDb.findMany?.('investor_transactions', town ? { Town_Name: town } : {}) || []); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-receipt-archive', async (_, params = {}) => {
    try {
      const town = scopedTown(params.townName, isAccountantScoped());
      return await dataLayer.read(
        () => businessExtras.getReceiptArchive(town, params.receiptType),
        async () => {
          const match = {};
          if (town) match.Town_Name = town;
          if (params.receiptType) match.Receipt_Type = params.receiptType;
          return await onlineDb.findMany('receipt_archive', match);
        }
      );
    }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('save-daily-receipt-archive', async (_, data = {}) => {
    try {
      assertObjectPayload(data, 'daily receipt archive payload');
      const town = scopedTown(data.Town_Name || data.townName, isAccountantScoped());
      const receiptDate = data.Receipt_Date || data.date || new Date().toISOString().slice(0, 10);
      const receiptType = data.Receipt_Type || data.receiptType || 'daily_receipt';
      const mode = data.mode || 'full';
      const receiptNumber = data.Receipt_Number || data.receiptNumber ||
        `DAY-${String(town || 'GLOBAL').replace(/[^a-zA-Z0-9]+/g, '').toUpperCase() || 'GLOBAL'}-${mode.toUpperCase()}-${String(receiptDate).replace(/-/g, '')}`;
      const payload = {
        ...data,
        Receipt_Number: receiptNumber,
        Receipt_Type: receiptType,
        Town_Name: town || data.townName || '',
        Receipt_Date: receiptDate,
      };
      const result = await syncOnline(
        () => businessExtras.saveReceiptArchive(payload),
        (localRow) => onlineDb.insert('receipt_archive', localRow),
        { tableName: 'receipt_archive', operation: 'upsert', payload, clientWriteId: `receipt-archive-${receiptNumber}`, events: ['receipt:created', 'media:changed', 'report:created'] }
      );
      return result;
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-construction-projects', async (_, townName) => {
    try { const town = scopedTown(townName, isAccountantScoped()); return await dataLayer.read(() => businessExtras.getConstructionProjects(town), () => onlineDb.findMany?.('construction_projects', town ? { Town_Name: town } : {}) || []); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('add-construction-project', async (_, data) => {
    try {
      assertObjectPayload(data, 'construction project payload');
      if (isAccountantScoped()) data.Town_Name = scopedTown(data.Town_Name, true);
      return await syncOnline(
        () => businessExtras.addConstructionProject(data),
        async (project) => {
          await onlineDb.insert('construction_projects', project);
          await onlineDb.insert('receipt_archive', buildConstructionDealReceiptPayload(project));
        },
        { tableName: 'construction_projects', operation: 'insert', payload: data, clientWriteId: `construction-project-${data.Town_Name || ''}-${data.Category || ''}-${data.Constructor_Name || Date.now()}` }
      );
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('record-construction-payment', async (_, data) => {
    try {
      assertObjectPayload(data, 'construction payment payload');
      if (isAccountantScoped()) data.Town_Name = scopedTown(data.Town_Name, true);
      const result = await syncOnline(
        async () => {
          const payment = await businessExtras.recordConstructionPayment(data);
          await addDailyEntry({
            date: payment.Payment_Date,
            type: 'Expense',
            description: `Construction ${payment.Category}: ${payment.Constructor_Name}`,
            amount: payment.Amount,
            townName: payment.Town_Name,
            category: 'Construction',
            subcategory: payment.Category,
            reference: payment.Payment_ID,
            createdBy: payment.Created_By || 'System',
            reviewStatus: 'approved',
            paymentAccountId: payment.Payment_Account_ID,
            paymentAccountName: payment.Payment_Account_Name,
            paymentAccountType: payment.Payment_Account_Type,
          });
          return payment;
        },
        async (payment) => {
          await onlineDb.insert('construction_payments', payment);
          try {
            const cloudProject = await onlineDb.findOne('construction_projects', { Project_ID: payment.Project_ID });
            const deal = parseFloat(cloudProject?.Deal_Amount || cloudProject?.deal_amount) || 0;
            const remaining = parseFloat(payment.Remaining_After) || 0;
            const paid = deal > 0 ? Math.max(0, deal - remaining) : undefined;
            await onlineDb.updateWhere('construction_projects', { Project_ID: payment.Project_ID }, {
              ...(paid !== undefined ? { Paid_Amount: paid } : {}),
              Remaining_Amount: payment.Remaining_After,
              Status: remaining <= 0 ? 'Completed' : 'Active',
            });
          } catch (_) {}
          await onlineDb.insert('receipt_archive', buildConstructionPaymentReceiptPayload(payment));
          await onlineDb.addDailyEntry({
            Entry_ID: `CON-${String(payment.Payment_ID || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`,
            Town_Name: payment.Town_Name,
            Date: payment.Payment_Date,
            Type: 'Expense',
            Category: 'Construction',
            Amount: payment.Amount,
            Description: `Construction ${payment.Category}: ${payment.Constructor_Name}`,
            Reference: payment.Payment_ID,
            Created_By: payment.Created_By || 'System',
            Review_Status: 'approved',
            Payment_Account_ID: payment.Payment_Account_ID,
            Payment_Account_Name: payment.Payment_Account_Name,
            Payment_Account_Type: payment.Payment_Account_Type,
          });
          await onlineDb.recordMoneyEvent({
            sourceType: 'construction_payment',
            sourceId: payment.Payment_ID,
            direction: 'expense',
            amount: payment.Amount,
            townName: payment.Town_Name,
            date: payment.Payment_Date,
            partyName: payment.Constructor_Name,
            description: `Construction ${payment.Category}`,
            receiptNumber: payment.Receipt_Number,
            createdBy: payment.Created_By || 'System',
            status: 'approved',
            paymentAccountId: payment.Payment_Account_ID,
            paymentAccountName: payment.Payment_Account_Name,
            paymentAccountType: payment.Payment_Account_Type,
          });
        },
        { tableName: 'construction_payments', operation: 'insert', payload: data, clientWriteId: `construction-payment-${data.Payment_ID || data.Project_ID || Date.now()}` }
      );
      return result;
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-construction-payments', async (_, townName) => {
    try { const town = scopedTown(townName, isAccountantScoped()); return await dataLayer.read(() => businessExtras.getConstructionPayments(town), () => onlineDb.findMany?.('construction_payments', town ? { Town_Name: town } : {}) || []); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('cleanup-legacy-agent-data', async () => {
    try {
      const result = await businessExtras.cleanupLegacyAgentData();
      scheduleQueuedFileUpload();
      scheduleQueuedCloudSync();
      return result;
    } catch (e) { return { error: e.message }; }
  });

  // ─── Setup Agent Property Access Table ────────────────────────────────────
  const AGENT_SETUP_SQL = [
    // Phase 1: Agent property access
    'CREATE TABLE IF NOT EXISTS public.agent_property_access (',
    '  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
    '  agent_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,',
    '  property_id UUID NOT NULL,',
    '  town_name VARCHAR(255),',
    '  granted_by UUID REFERENCES public.users(id),',
    '  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),',
    '  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),',
    '  UNIQUE(agent_id, property_id)',
    ');',
    'ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_towns VARCHAR(1000);',
    'ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agent_license_number VARCHAR(100);',
    'ALTER TABLE public.agent_property_access ENABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "CEO full access agent_property_access" ON public.agent_property_access;',
    'DROP POLICY IF EXISTS "Agents read own property access" ON public.agent_property_access;',
    'DROP POLICY IF EXISTS "agent_reads_own_access" ON public.agent_property_access;',
    'CREATE POLICY "CEO full access agent_property_access"',
    '  ON public.agent_property_access FOR ALL',
    '  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = \'ceo\')',
    '  WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) = \'ceo\');',
    'CREATE POLICY "Agents read own property access"',
    '  ON public.agent_property_access FOR SELECT',
    '  USING (auth.uid() = agent_id);',
    'CREATE INDEX IF NOT EXISTS idx_agent_property_access_agent ON public.agent_property_access(agent_id);',
    'CREATE INDEX IF NOT EXISTS idx_agent_property_access_property ON public.agent_property_access(property_id);',
    // File manifest table (cloud storage tracking)
    'CREATE TABLE IF NOT EXISTS public.file_manifest (',
    '  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
    '  file_path TEXT NOT NULL,',
    '  md5_hash VARCHAR(32) NOT NULL,',
    '  file_size BIGINT,',
    '  last_modified TIMESTAMP WITH TIME ZONE,',
    '  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),',
    '  uploaded_by_role VARCHAR(30),',
    '  uploaded_by_user_id UUID,',
    '  device_type VARCHAR(50),',
    '  authority_rank INTEGER DEFAULT 100,',
    '  UNIQUE(file_path)',
    ');',
    'ALTER TABLE public.file_manifest ADD COLUMN IF NOT EXISTS uploaded_by_role VARCHAR(30);',
    'ALTER TABLE public.file_manifest ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID;',
    'ALTER TABLE public.file_manifest ADD COLUMN IF NOT EXISTS device_type VARCHAR(50);',
    'ALTER TABLE public.file_manifest ADD COLUMN IF NOT EXISTS authority_rank INTEGER DEFAULT 100;',
    'ALTER TABLE public.file_manifest ENABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "anon_read_file_manifest" ON public.file_manifest;',
    'CREATE POLICY "anon_read_file_manifest" ON public.file_manifest FOR SELECT USING (true);',
    'DROP POLICY IF EXISTS "ceo_write_file_manifest" ON public.file_manifest;',
    'CREATE POLICY "ceo_write_file_manifest" ON public.file_manifest FOR INSERT WITH CHECK (true);',
    'DROP POLICY IF EXISTS "ceo_update_file_manifest" ON public.file_manifest;',
    'CREATE POLICY "ceo_update_file_manifest" ON public.file_manifest FOR UPDATE USING (true) WITH CHECK (true);',
    'INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)',
    'VALUES (\'zameenkhata-files\', \'zameenkhata-files\', true, 52428800, ARRAY[\'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\'])',
    'ON CONFLICT (id) DO UPDATE SET public = true;',
    'DROP POLICY IF EXISTS "read_zameenkhata_files" ON storage.objects;',
    'CREATE POLICY "read_zameenkhata_files" ON storage.objects FOR SELECT USING (bucket_id = \'zameenkhata-files\');',
    'DROP POLICY IF EXISTS "insert_zameenkhata_files" ON storage.objects;',
    'CREATE POLICY "insert_zameenkhata_files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = \'zameenkhata-files\' AND name LIKE \'zameen-khata/%\');',
    'DROP POLICY IF EXISTS "update_zameenkhata_files" ON storage.objects;',
    'CREATE POLICY "update_zameenkhata_files" ON storage.objects FOR UPDATE USING (bucket_id = \'zameenkhata-files\' AND name LIKE \'zameen-khata/%\') WITH CHECK (bucket_id = \'zameenkhata-files\' AND name LIKE \'zameen-khata/%\');',
    'DROP POLICY IF EXISTS "delete_zameenkhata_files" ON storage.objects;',
    'CREATE POLICY "delete_zameenkhata_files" ON storage.objects FOR DELETE USING (bucket_id = \'zameenkhata-files\' AND name LIKE \'zameen-khata/%\');',
    // Phase 2: Financial accuracy
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS received_amount NUMERIC DEFAULT 0;',
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0;',
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS advance_amount NUMERIC DEFAULT 0;',
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT \'advance_only\';',
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.users(id);',
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS property_category VARCHAR(20) DEFAULT \'Residential\';',
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS file_delivery_image TEXT;',
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS cheque_image TEXT;',
    'ALTER TABLE public.all_sales ADD COLUMN IF NOT EXISTS transfer_image TEXT;',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT \'available\';',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.users(id);',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS sale_id UUID;',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS installment_active BOOLEAN DEFAULT FALSE;',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS property_category VARCHAR(20) DEFAULT \'Residential\';',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS file_delivery_image TEXT;',
    'CREATE TABLE IF NOT EXISTS public.commissions (',
    '  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
    '  agent_id UUID REFERENCES public.users(id) NOT NULL,',
    '  sale_id UUID,',
    '  town_name VARCHAR(255),',
    '  property_number VARCHAR(100),',
    '  total_price NUMERIC,',
    '  commission_percent NUMERIC,',
    '  commission_amount NUMERIC,',
    '  status VARCHAR(20) DEFAULT \'pending\',',
    '  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),',
    '  paid_at TIMESTAMP WITH TIME ZONE',
    ');',
    'ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "role_based_commissions" ON public.commissions;',
    'CREATE POLICY "role_based_commissions" ON public.commissions FOR SELECT USING (',
    '  (SELECT role FROM public.users WHERE id = auth.uid()) = \'ceo\'',
    '  OR agent_id = auth.uid()',
    ');',
    'CREATE TABLE IF NOT EXISTS public.notification_preferences (',
    '  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
    '  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,',
    '  role VARCHAR(20),',
    '  installment_due_days INTEGER DEFAULT 3,',
    '  receive_appeal_alerts BOOLEAN DEFAULT TRUE,',
    '  receive_installment_alerts BOOLEAN DEFAULT TRUE,',
    '  UNIQUE(user_id)',
    ');',
    'ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;',
    // Town map designer / overview
    'CREATE TABLE IF NOT EXISTS public.town_map_shapes (',
    '  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
    '  shape_id TEXT NOT NULL UNIQUE,',
    '  town_name TEXT NOT NULL,',
    '  property_type TEXT,',
    '  property_number TEXT,',
    '  shape_type TEXT NOT NULL DEFAULT \'plot\',',
    '  label TEXT,',
    '  status TEXT DEFAULT \'available\',',
    '  geometry_json JSONB DEFAULT \'{}\'::jsonb,',
    '  style_json JSONB DEFAULT \'{}\'::jsonb,',
    '  sort_order INTEGER DEFAULT 0,',
    '  client_write_id TEXT,',
    '  sync_status TEXT DEFAULT \'synced\',',
    '  created_at TIMESTAMPTZ DEFAULT NOW(),',
    '  updated_at TIMESTAMPTZ DEFAULT NOW(),',
    '  deleted_at TIMESTAMPTZ',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_town_map_shapes_town ON public.town_map_shapes(town_name);',
    'CREATE INDEX IF NOT EXISTS idx_town_map_shapes_property ON public.town_map_shapes(town_name, property_type, property_number);',
    'ALTER TABLE public.town_map_shapes ENABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "town_map_shapes_role_read" ON public.town_map_shapes;',
    'DROP POLICY IF EXISTS "town_map_shapes_role_write" ON public.town_map_shapes;',
    'CREATE POLICY "town_map_shapes_role_read" ON public.town_map_shapes FOR SELECT USING (true);',
    'CREATE POLICY "town_map_shapes_role_write" ON public.town_map_shapes FOR ALL USING (true) WITH CHECK (true);',
    // Realtime publication: ensure tables broadcast changes (safe idempotent add)
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = \'supabase_realtime\' AND tablename = \'appeals\' AND schemaname = \'public\') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.appeals; END IF; END $$;',
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = \'supabase_realtime\' AND tablename = \'commissions\' AND schemaname = \'public\') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.commissions; END IF; END $$;',
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = \'supabase_realtime\' AND tablename = \'installments\' AND schemaname = \'public\') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.installments; END IF; END $$;',
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = \'supabase_realtime\' AND tablename = \'town_map_shapes\' AND schemaname = \'public\') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.town_map_shapes; END IF; END $$;',
    // Role-based RLS policies
    'DROP POLICY IF EXISTS "role_based_properties" ON public.properties;',
    'CREATE POLICY "role_based_properties" ON public.properties FOR SELECT USING (',
    '  (SELECT role FROM public.users WHERE id = auth.uid()) = \'ceo\'',
    '  OR (SELECT role FROM public.users WHERE id = auth.uid()) = \'accountant\'',
    '  OR town_name IN (',
    '    SELECT unnest(string_to_array(agent_towns, \',\'))',
    '    FROM public.users WHERE id = auth.uid()',
    '  )',
    ');',
    'DROP POLICY IF EXISTS "role_based_sales" ON public.all_sales;',
    'CREATE POLICY "role_based_sales" ON public.all_sales FOR SELECT USING (',
    '  (SELECT role FROM public.users WHERE id = auth.uid()) IN (\'ceo\', \'accountant\')',
    '  OR agent_id = auth.uid()',
    ');',
    'DROP POLICY IF EXISTS "agent_reads_own_access" ON public.agent_property_access;',
    'CREATE POLICY "agent_reads_own_access" ON public.agent_property_access FOR SELECT USING (',
    '  agent_id = auth.uid()',
    '  OR (SELECT role FROM public.users WHERE id = auth.uid()) = \'ceo\'',
    ');',
  ].join('\n');

  ipcMain.handle('setup-agent-db', async () => {
    try {
      const config = loadDevConfig();
      const mgmtToken = config.supabase_management_token || config.supabase_service_key;
      if (!mgmtToken) {
        return {
          error: 'Setup requires Supabase Management API token',
          instructions: '1. Go to https://supabase.com/dashboard/project/wdislbdftnwmaexqtfmn/settings/api\n2. Under "Manage API Tokens", create a new token\n3. Add it to developer_config.json as "supabase_management_token"',
          sql: AGENT_SETUP_SQL,
        };
      }
      const res = await fetch(
        'https://api.supabase.com/v1/projects/wdislbdftnwmaexqtfmn/database/query',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + mgmtToken,
          },
          body: JSON.stringify({ query: AGENT_SETUP_SQL }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error('Supabase Management API: ' + (text || res.statusText));
      }
      return { success: true, message: 'Agent property access table created successfully' };
    } catch (e) {
      return { error: e.message, sql: AGENT_SETUP_SQL };
    }
  });

  ipcMain.handle('get-setup-sql', async () => {
    return { sql: AGENT_SETUP_SQL };
  });

  // ─── Agent Property Access CRUD ───────────────────────────────
  ipcMain.handle('get-agent-property-access', async (_, agentId) => {
    try {
      if (!isNonEmpty(agentId)) throw new Error('Agent ID is required');
      const { data, error } = await supabase
        .from('agent_property_access')
        .select('property_id')
        .eq('agent_id', agentId);
      if (error) throw error;
      return (data || []).map(r => r.property_id);
    } catch (e) {
      if (e.message?.includes('relation') || e.message?.includes('does not exist')) {
        return { error: 'TABLE_MISSING' };
      }
      return { error: e.message };
    }
  });

  ipcMain.handle('set-agent-property-access', async (_, { agentId, propertyIds }) => {
    try {
      if (!isNonEmpty(agentId)) throw new Error('Agent ID is required');
      if (!Array.isArray(propertyIds)) throw new Error('propertyIds must be an array');
      const supabase = require('./db/supabase');
      // Delete existing
      const { error: delErr } = await supabase
        .from('agent_property_access')
        .delete()
        .eq('agent_id', agentId);
      if (delErr) throw delErr;
      // Insert new
      if (propertyIds.length > 0) {
        const records = propertyIds.map(pid => ({
          agent_id: agentId,
          property_id: pid,
          created_at: new Date().toISOString(),
        }));
        const { error: insErr } = await supabase
          .from('agent_property_access')
          .insert(records);
        if (insErr) throw insErr;
      }
      return { success: true };
    } catch (e) {
      if (e.message?.includes('relation') || e.message?.includes('does not exist')) {
        return { error: 'TABLE_MISSING' };
      }
      return { error: e.message };
    }
  });

  // ─── Commissions ──────────────────────────────────────────────
  ipcMain.handle('get-commissions', async (_, filter) => {
    try {
      const { readExcelFile, getGlobalsPath } = require('./db/core');
      const commissionPath = path.join(getGlobalsPath(), 'Commissions.xlsx');
      let rows = [];
      try { rows = await readExcelFile(commissionPath, 'Data'); } catch (_) {}
      if (!rows.length) {
        const sales = await getAllSales();
        rows = (sales || [])
          .filter((s) => (parseFloat(s.Remaining_Amount) || 0) <= 0 && (parseFloat(s.Commission_Amount) || 0) > 0)
          .map((s) => ({
            Commission_ID: s.Sale_ID || `${s.Type}|${s.Plot_Shop_Number}|${s.Town_Name}`,
            Sale_ID: s.Sale_ID || '',
            Town_Name: s.Town_Name || '',
            Plot_Shop_Number: s.Plot_Shop_Number || '',
            Agent_Name: s.Agent_Name || '',
            Agent_Email: '',
            Commission_Amount: parseFloat(s.Commission_Amount) || 0,
            Status: 'pending',
            Paid_Date: '',
            Created_At: s.Sell_Date || '',
          }));
      }
      // SECURITY FIX: Supabase fallback — merge cloud commissions if local is empty or incomplete
      try {
        const supabase = require('./db/supabase');
        const { data: cloudRows } = await supabase
          .from('commissions')
          .select('*')
          .timeout(3000);
        if (Array.isArray(cloudRows) && cloudRows.length > 0) {
          // Merge: use cloud rows as source of truth for paid/partial status
          const localMap = new Map(rows.map(r => [String(r.Commission_ID || r.id), r]));
          for (const cr of cloudRows) {
            const key = String(cr.Commission_ID || cr.id || cr.sale_id);
            if (localMap.has(key)) {
              // Merge cloud status onto local row (cloud may have more accurate paid/partial status)
              const local = localMap.get(key);
              if (String(cr.status || 'pending').toLowerCase() !== 'pending' && String(local.Status || local.status || 'pending').toLowerCase() === 'pending') {
                local.Status = cr.status;
                local.Paid_Amount = parseFloat(cr.Paid_Amount || cr.paid_amount) || 0;
                local.Paid_Date = cr.Paid_Date || cr.paid_date || '';
              }
            } else {
              // Cloud has a commission row that doesn't exist locally — add it
              rows.push({
                Commission_ID: cr.Commission_ID || cr.id || cr.sale_id,
                Sale_ID: cr.Sale_ID || cr.sale_id || '',
                Town_Name: cr.Town_Name || cr.town_name || '',
                Plot_Shop_Number: cr.Plot_Shop_Number || cr.plot_shop_number || '',
                Agent_Name: cr.Agent_Name || cr.agent_name || '',
                Agent_Email: cr.Agent_Email || cr.agent_email || '',
                Commission_Amount: parseFloat(cr.Commission_Amount || cr.commission_amount) || 0,
                Status: cr.status || 'pending',
                Paid_Date: cr.Paid_Date || cr.paid_date || '',
                Created_At: cr.Created_At || cr.created_at || '',
              });
            }
          }
        }
      } catch {} // Supabase fallback is non-blocking
      const data = rows
        .map((c) => ({
          ...c,
          id: c.Commission_ID || c.id,
          commission_amount: c.Commission_Amount || c.commission_amount,
          agent_name: c.Agent_Name || c.agent_name,
          agent_email: c.Agent_Email || c.agent_email || '',
          status: String(c.Status || c.status || 'pending').toLowerCase(),
        }))
        .filter((c) => !isAccountantScoped() || String(c.Town_Name || c.town_name || '') === requireAccountantTown())
        .filter((c) => {
          if (!filter?.status) return true;
          const wanted = String(filter.status).toLowerCase();
          if (wanted === 'pending') return c.status === 'pending' || c.status === 'partial';
          return c.status === wanted;
        });
      return { data };
    }
    catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('mark-commission-paid', async (_, payload) => {
    try {
      const commissionId = typeof payload === 'object' ? payload.commissionId : payload;
      const requestedAmount = typeof payload === 'object' ? parseFloat(payload.amount) || 0 : 0;
      if (!isNonEmpty(commissionId)) throw new Error('Commission ID is required');
      const { readExcelFile, updateExcelRow, getGlobalsPath, ensureSheetColumns } = require('./db/core');
      const commissionPath = path.join(getGlobalsPath(), 'Commissions.xlsx');
      await ensureSheetColumns(commissionPath, 'Data', ['Paid_Amount','Remaining_Amount','Last_Paid_Date','Payment_Account_ID','Payment_Account_Name','Payment_Account_Type']);
      const rows = await readExcelFile(commissionPath, 'Data');
      const row = (rows || []).find((c) => String(c.Commission_ID || c.id) === String(commissionId));
      if (row) assertTownAccess(row.Town_Name || row.town_name);
      if (!row?._rowNumber) throw new Error('Commission record not found locally');
      const paidDate = new Date().toISOString().split('T')[0];
      const totalCommission = parseFloat(row.Commission_Amount || row.commission_amount) || 0;
      const paidBefore = parseFloat(row.Paid_Amount || row.paid_amount) || 0;
      const remainingBefore = Math.max(0, totalCommission - paidBefore);
      const payAmount = requestedAmount > 0 ? requestedAmount : remainingBefore;
      if (payAmount <= 0) throw new Error('Commission is already fully paid');
      if (payAmount > remainingBefore) throw new Error(`Payment exceeds remaining commission. Remaining: PKR ${remainingBefore.toLocaleString()}`);
      const paidAfter = paidBefore + payAmount;
      const remainingAfter = Math.max(0, totalCommission - paidAfter);
      const commissionKey = String(row.Commission_ID || commissionId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 36) || 'COMMISSION';
      const paymentKey = `${commissionKey}-${String(paidAfter).replace(/[^0-9]/g, '')}-${paidDate.replace(/-/g, '')}`;
      const receiptId = `COMREC-${paymentKey}`;
      const receiptNumber = `COM-${paidDate.replace(/-/g, '')}-${paymentKey.slice(-10)}`;
      const localPayload = {
        Receipt_ID: receiptId,
        Receipt_Number: receiptNumber,
        Commission_ID: row.Commission_ID || commissionId,
        Sale_ID: row.Sale_ID || '',
        Town_Name: row.Town_Name || '',
        Agent_Name: row.Agent_Name || row.agent_name || '',
        Plot_Shop_Number: row.Plot_Shop_Number || '',
        Amount: payAmount,
        Commission_Amount: totalCommission,
        Paid_Before: paidBefore,
        Paid_After: paidAfter,
        Remaining_After: remainingAfter,
        Paid_Date: paidDate,
        Paid_By: 'Accountant',
        Payment_Account_ID: payload?.paymentAccountId || payload?.Payment_Account_ID || 'cash-in-hand',
        Payment_Account_Name: payload?.paymentAccountName || payload?.Payment_Account_Name || 'Cash in Hand',
        Payment_Account_Type: payload?.paymentAccountType || payload?.Payment_Account_Type || 'cash',
      };
      return await syncOnline(
        async () => {
          await updateExcelRow(commissionPath, 'Data', row._rowNumber, {
            Status: remainingAfter <= 0 ? 'paid' : 'partial',
            Paid_Date: paidDate,
            Last_Paid_Date: paidDate,
            Paid_Amount: paidAfter,
            Remaining_Amount: remainingAfter,
            Payment_Account_ID: localPayload.Payment_Account_ID,
            Payment_Account_Name: localPayload.Payment_Account_Name,
            Payment_Account_Type: localPayload.Payment_Account_Type,
          });
          const receipt = await businessExtras.recordCommissionReceipt(localPayload);
          await addDailyEntry({
            date: paidDate,
            type: 'Expense',
            description: `Commission paid: ${localPayload.Agent_Name || 'Sales Agent'}`,
            amount: localPayload.Amount,
            townName: localPayload.Town_Name,
            category: 'Commission',
            reference: localPayload.Commission_ID,
            createdBy: 'Accountant',
            reviewStatus: 'approved',
            paymentAccountId: localPayload.Payment_Account_ID,
            paymentAccountName: localPayload.Payment_Account_Name,
            paymentAccountType: localPayload.Payment_Account_Type,
          });
          return { success: true, receipt, commission: localPayload };
        },
        async (localResult) => {
          if (remainingAfter <= 0) await onlineDb.markCommissionPaid(commissionId);
          else await onlineDb.updateWhere('commissions', { id: commissionId }, {
            status: 'partial',
            paid_amount: paidAfter,
            remaining_amount: remainingAfter,
            paid_at: paidDate,
          });
          const receipt = localResult?.receipt || {};
          await onlineDb.insert('commission_receipts', {
            ...receipt,
            ...localPayload,
          });
          await onlineDb.addDailyEntry({
            Entry_ID: `COM-${String(localPayload.Commission_ID || commissionId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`,
            Town_Name: localPayload.Town_Name,
            Date: paidDate,
            Type: 'Expense',
            Category: 'Commission',
            Amount: localPayload.Amount,
            Description: `Commission paid: ${localPayload.Agent_Name || 'Sales Agent'}`,
            Reference: localPayload.Commission_ID,
            Created_By: 'Accountant',
            Review_Status: 'approved',
            Payment_Account_ID: localPayload.Payment_Account_ID,
            Payment_Account_Name: localPayload.Payment_Account_Name,
            Payment_Account_Type: localPayload.Payment_Account_Type,
          });
          await onlineDb.recordMoneyEvent({
            sourceType: 'commission_payment',
            sourceId: receipt.Receipt_ID || localPayload.Commission_ID || commissionId,
            direction: 'expense',
            amount: localPayload.Amount,
            townName: localPayload.Town_Name,
            date: paidDate,
            partyName: localPayload.Agent_Name,
            description: 'Agent commission paid',
            receiptNumber: receipt.Receipt_Number || '',
            createdBy: 'Accountant',
            status: 'approved',
            paymentAccountId: localPayload.Payment_Account_ID,
            paymentAccountName: localPayload.Payment_Account_Name,
            paymentAccountType: localPayload.Payment_Account_Type,
          });
        },
        { tableName: 'commissions', operation: 'update', payload: localPayload }
      );
    } catch (e) { return { error: e.message }; }
  });

  // ─── Pending Collections ──────────────────────────────────────
  ipcMain.handle('get-pending-collections', async (_, agentName) => {
    try {
      const filter = typeof agentName === 'object' && agentName !== null ? agentName : { agentName };
      const scopeTown = filter.townName || filter.Town_Name || '';
      await reconcileInstallmentSaleTotals(scopeTown).catch(() => {});
      const wanted = [filter.agentName, filter.agentEmail]
        .map(v => String(v || '').trim().toLowerCase())
        .filter(Boolean);
      const rows = filterRowsByScope(await dataLayer.read(() => getAllSales(), () => onlineDb.getAllSales()));
      const installments = filterRowsByScope(await dataLayer.read(() => getInstallments(), () => onlineDb.getAllInstallments()));
      const today = new Date().toISOString().split('T')[0];
      const data = (rows || [])
        .map((r) => ({
          ...r,
          id: r.Sale_ID || `${r.Type}|${r.Plot_Shop_Number}|${r.Town_Name}`,
          Received_Amount: parseFloat(r.Received_Amount || r.Advance_Amount_PKR) || 0,
          Remaining_Amount: parseFloat(r.Remaining_Amount) || Math.max(0, (parseFloat(r.Total_Amount_PKR) || 0) - (parseFloat(r.Received_Amount || r.Advance_Amount_PKR) || 0)),
        }))
        .filter((r) => ['plot', 'shop'].includes(String(r.Type || '').trim().toLowerCase()))
        .map((r) => {
          const sameInst = (installments || []).filter(i => {
            if (r.Sale_ID && i.Sale_ID) return String(i.Sale_ID) === String(r.Sale_ID);
            return String(i.Type) === String(r.Type) &&
              String(i.Plot_Shop_Number) === String(r.Plot_Shop_Number) &&
              String(i.Town_Name) === String(r.Town_Name);
          });
          const unpaid = sameInst.filter(i => String(i.Status || '').toLowerCase() !== 'paid');
          const totalAmount = parseFloat(r.Total_Amount_PKR) || 0;
          const advanceAmount = parseFloat(r.Advance_Amount_PKR) || 0;
          const paidInstallments = sameInst
            .filter(i => String(i.Status || '').toLowerCase() === 'paid')
            .reduce((sum, i) => sum + (parseFloat(i.Received_Amount || i.Monthly_Amount) || 0), 0);
          const isInstallmentSale = sameInst.length > 0 || (parseInt(r.Total_Installments, 10) || 0) > 0;
          const receivedAmount = isInstallmentSale
            ? Math.min(totalAmount || advanceAmount + paidInstallments, advanceAmount + paidInstallments)
            : (parseFloat(r.Received_Amount || r.Advance_Amount_PKR) || 0);
          const liveRemaining = totalAmount > 0
            ? Math.max(0, totalAmount - receivedAmount)
            : (parseFloat(r.Remaining_Amount) || 0);
          const overdue = unpaid.some(i => String(i.Due_Date || '') && String(i.Due_Date) < today);
          const due = unpaid.some(i => String(i.Status || '').toLowerCase() === 'due');
          const remaining = liveRemaining;
          let category = 'Fully Paid';
          if (remaining > 0 && sameInst.length === 0) category = 'Advance-only Remaining';
          else if (remaining > 0 && overdue) category = 'Overdue';
          else if (remaining > 0 && due) category = 'Installment Due';
          else if (remaining > 0) category = 'Installment Upcoming';
          return { ...r, Received_Amount: receivedAmount, Remaining_Amount: remaining, Collection_Category: category, Unpaid_Installments: unpaid.length };
        })
        .filter((r) => (parseFloat(r.Remaining_Amount) || 0) > 0)
        .filter((r) => {
          if (!wanted.length) return true;
          const candidates = [r.Agent_Name, r.Agent_Email, r.Agent_ID, r.agent_name, r.agent_email]
            .map(v => String(v || '').trim().toLowerCase())
            .filter(Boolean);
          return candidates.some(v => wanted.includes(v));
        });
      return { data };
    }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('record-pending-collection', async (_, { saleId, amount, paymentMethod, notes, type, plotShopNumber, townName, customerName, agentName, totalAmount, currentReceived, paymentAccountId, paymentAccountName, paymentAccountType }) => {
    try {
      let allowedTown = townName;
      if (!allowedTown) {
        const saleRows = filterRowsByScope(await getAllSales());
        const sale = (saleRows || []).find((r) =>
          String(r.Sale_ID || '') === String(saleId || '') ||
          `${r.Type}|${r.Plot_Shop_Number}|${r.Town_Name}` === String(saleId || '')
        );
        allowedTown = sale?.Town_Name || '';
      }
      allowedTown = scopedTown(allowedTown, true);
      const result = await syncOnline(
        () => recordCollectionPaymentLocal({ saleId, type, plotShopNumber, townName: allowedTown, amount, paymentMethod, notes, paymentAccountId, paymentAccountName, paymentAccountType }),
        (localResult) => onlineDb.recordCollectionPayment(
          saleId || localResult?.payment?.Sale_ID,
          amount,
          paymentMethod,
          notes,
          localResult?.payment || null
        ),
        { tableName: 'collection_payments', operation: 'upsert', payload: { saleId, amount, paymentMethod, notes, townName: allowedTown, paymentAccountId, paymentAccountName, paymentAccountType } }
      );
      return { success: true, ...result };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-collection-history', async (_, saleId) => {
    try {
      const { readExcelFile } = require('./db/core');
      const historyPath = path.join(require('./db/core').getGlobalsPath(), 'Collection_Payments.xlsx');
      const rows = await dataLayer.read(
        () => readExcelFile(historyPath, 'Data'),
        () => onlineDb.findMany('collection_payments', { Sale_ID: saleId })
      );
      const data = (rows || [])
        .filter(r => String(r.Sale_ID || r.sale_code || r.Sale_Code || r.sale_id || '') === String(saleId || '') || !saleId)
        .filter(r => !isAccountantScoped() || String(r.Town_Name || r.town_name || '') === requireAccountantTown())
        .map(r => ({
          id: r.Payment_ID || r.payment_id || r.id,
          payment_date: r.Payment_Date || r.payment_date,
          amount: r.Amount || r.amount,
          payment_method: r.Payment_Method || r.payment_method,
          notes: r.Notes || r.notes,
        }));
      return { data };
    }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('deliver-file-after-payment', async (_, saleId) => {
    try {
      const rows = filterRowsByScope(await getAllSales());
      const sale = (rows || []).find((r) =>
        String(r.Sale_ID || '') === String(saleId) ||
        `${r.Type}|${r.Plot_Shop_Number}|${r.Town_Name}` === String(saleId)
      );
      if (!sale) throw new Error('Sale not found in local database');
      const remaining = parseFloat(sale.Remaining_Amount) || 0;
      if (remaining > 0) throw new Error('Cannot deliver file until payment is complete');
      const result = await syncOnline(
        () => updateFileStatus({
          type: sale.Type,
          number: sale.Plot_Shop_Number,
          townName: sale.Town_Name,
          status: 'Delivered',
        }),
        () => Promise.resolve({ success: true }),
        {
          tableName: 'properties',
          operation: 'update',
          payload: {
            type: sale.Type,
            number: sale.Plot_Shop_Number,
            Town_Name: sale.Town_Name,
            status: 'Delivered',
          },
          clientWriteId: `deliver-file-${sale.Sale_ID || `${sale.Type}-${sale.Plot_Shop_Number}-${sale.Town_Name}`}`,
        }
      );
      return { success: true, ...result };
    }
    catch (e) { return { error: e.message }; }
  });

  // ─── Desktop Notifications ─────────────────────────────────────
  ipcMain.handle('show-notification', (_, { title, body, silent }) => {
    if (String(storage.getSyncContext()?.role || '').toLowerCase() !== 'ceo') return { skipped: true };
    return showDesktopNotification({ title, body, silent });
  });

  ipcMain.on('show-notification-fire', (_, { title, body }) => {
    if (String(storage.getSyncContext()?.role || '').toLowerCase() !== 'ceo') return;
    showDesktopNotification({ title, body, silent: false });
  });

  // ─── File Sync (Storage) ──────────────────────────────────────
  ipcMain.handle('sync-files-upload', async (event) => {
    try {
      await storage.ensureBucket();
      const sendProgress = (filePath) => {
        try {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('sync-file-progress', { filePath });
          }
        } catch (_) {}
      };
      const result = await storage.uploadChangedFiles(sendProgress);
      return result;
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('sync-files-download', async (event) => {
    try {
      const sendProgress = (filePath) => {
        try {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('sync-file-progress', { filePath });
          }
        } catch (_) {}
      };
      const result = await storage.downloadMissingFiles(sendProgress);
      return result;
    } catch (e) {
      return { error: e.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // APPEALS ROUTE — reliable IPC bridge for CEO appeal viewing
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('get-appeals', async (_, filter = {}) => {
    try {
      const supabase = require('./db/supabase');
      const queryFilter = filter.status ? { status: filter.status } : {};
      let query = supabase
        .from('appeals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filter.limit || 100);
      if (filter.status) query = query.eq('status', filter.status);
      const { data, error } = await query;
      if (error) throw error;
      const appealsList = Array.isArray(data) ? data : [];
      const requesterIds = [...new Set(appealsList.map(a => a.requested_by_user_id).filter(Boolean))];
      let userMap = {};
      if (requesterIds.length) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, email, phone_number, role, town_name, agent_town')
          .in('id', requesterIds);
        if (users) {
          userMap = Object.fromEntries(users.map(u => [u.id, u]));
        }
      }
      const rows = appealsList.map((appeal) => ({
        ...appeal,
        requested_by_user_id: userMap[appeal.requested_by_user_id] || appeal.requested_by_user_id,
      }));
      return { success: true, data: rows, total: rows.length };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-appeal-by-id', async (_, appealId) => {
    try {
      if (!appealId) throw new Error('Appeal ID is required');
      const supabase = require('./db/supabase');
      const { data, error } = await supabase
        .from('appeals')
        .select('*')
        .eq('id', appealId)
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-pending-appeals-count', async () => {
    try {
      const supabase = require('./db/supabase');
      const { count, error } = await supabase
        .from('appeals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return { success: true, count: count || 0 };
    } catch (e) {
      return { error: e.message };
    }
  });
}

module.exports = { registerIpcHandlers };
