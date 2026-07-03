const { app, BrowserWindow, ipcMain, Menu, dialog, shell, session, Notification, Tray } = require('electron');

// Capture hard crashes/async failures so we can diagnose instant window close.
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});

app.on('before-quit', (event) => {
  try {
    console.error('[app] before-quit', { exitCode: process.exitCode });
  } catch (_) {}
});

app.on('will-quit', (event) => {
  try {
    console.error('[app] will-quit', { exitCode: process.exitCode });
  } catch (_) {}
});

app.on('quit', () => {
  try {
    console.error('[app] quit', { exitCode: process.exitCode });
  } catch (_) {}
});
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('./ipc');
const { initializeDatabase, configureMirrors, setAfterWriteHook } = require('./db/core');
const { startBackupScheduler } = require('./db/backup');
const { upsertDueInstallmentNotifications } = require('./db/globals');
const { addDailyEntry } = require('./db/dailyEntries');
const supabase = require('./db/supabase');
const storageSync = require('./db/storage');
const { showDesktopNotification } = require('./notificationService');
const buildMeta = require('./buildMeta');
const { setupAutoUpdater } = require('./autoUpdate');

// Allow OpenStreetMap tiles and Nominatim search through CSP
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; " +
          "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org https://unpkg.com; " +
          "connect-src 'self' https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org https://*.openstreetmap.org https://wdislbdftnwmaexqtfmn.supabase.co https://*.supabase.co wss://*.supabase.co ws://localhost:*; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; " +
          "style-src 'self' 'unsafe-inline' https://unpkg.com;"
        ]
      }
    });
  });
});

let activeWindow;
let launcherWindow;
let tray = null;
let forceQuit = false;
let backgroundBackupInFlight = false;
let lastDailyStorageBackupDate = '';

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

function showExistingWindow() {
  const target = activeWindow && !activeWindow.isDestroyed()
    ? activeWindow
    : launcherWindow && !launcherWindow.isDestroyed()
      ? launcherWindow
      : null;
  if (target) {
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
    return true;
  }
  return false;
}

app.on('second-instance', () => {
  if (!showExistingWindow()) openInitialWindow();
});

function isTestBuildExpired() {
  if (!buildMeta || buildMeta.channel !== 'test' || !buildMeta.expiresAt) return false;
  const expiryTime = new Date(buildMeta.expiresAt).getTime();
  return Number.isFinite(expiryTime) && Date.now() > expiryTime;
}

async function showExpiredAndQuit() {
  await dialog.showMessageBox({
    type: 'error',
    title: buildMeta.expiredTitle || 'Test Build Expired',
    message: buildMeta.expiredMessage || 'It is a test build and now it is expired. Please contact administeration to update this into final build.',
    buttons: ['OK'],
    defaultId: 0,
  }).catch(() => {});
  forceQuit = true;
  app.quit();
}

function isCurrentCeoContext() {
  try {
    return String(storageSync.getSyncContext()?.role || '').toLowerCase() === 'ceo';
  } catch (_) {
    return false;
  }
}

function isCurrentAccountantContext() {
  try {
    return String(storageSync.getSyncContext()?.role || '').toLowerCase() === 'accountant';
  } catch (_) {
    return false;
  }
}

function getCurrentAccountantTown() {
  try {
    const ctx = storageSync.getSyncContext() || {};
    if (String(ctx.role || '').toLowerCase() !== 'accountant') return '';
    return String(ctx.accountantTown || ctx.town_name || ctx.town_id || '').trim();
  } catch (_) {
    return '';
  }
}

function getAppIconPath() {
  return path.join(__dirname, '../../public/favicon.ico');
}

async function runBackgroundStorageBackup(reason = 'background') {
  if (backgroundBackupInFlight) return;
  backgroundBackupInFlight = true;
  try {
    storageSync.queueAllLocalFiles();
    await storageSync.ensureBucket();
    const result = await storageSync.flushUploadQueue();
    if (tray && result && (result.uploaded || result.skipped || result.total)) {
      tray.displayBalloon({
        title: 'Backup Complete',
        content: `Excel backup done (${result.uploaded || 0} uploaded, ${result.skipped || 0} skipped).`,
        iconType: 'custom',
        icon: getAppIconPath(),
        largeIcon: true,
      });
    }
  } catch (e) {
    console.error('[backup] background storage backup failed', reason, e);
    if (tray) {
      tray.displayBalloon({
        title: 'Backup Failed',
        content: e.message || 'Cloud storage backup failed.',
        iconType: 'custom',
        icon: getAppIconPath(),
        largeIcon: true,
      });
    }
  } finally {
    backgroundBackupInFlight = false;
  }
}

function startDailyStorageBackupScheduler() {
  setInterval(() => {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    if (lastDailyStorageBackupDate === date) return;
    if (now.getHours() >= 18) {
      lastDailyStorageBackupDate = date;
      runBackgroundStorageBackup('daily-evening');
    }
  }, 15 * 60 * 1000);
}

// Read startup panel from command line args: --panel ceo OR --panel employee
const args = process.argv.slice(2);
let startupPanel = null;
const panelArgIdx = args.indexOf('--panel');
if (panelArgIdx !== -1 && args[panelArgIdx + 1]) {
  startupPanel = args[panelArgIdx + 1]; // 'ceo' or 'employee'
}
// Also support --panel=admin format
const panelEqArg = args.find(a => a.startsWith('--panel='));
if (panelEqArg) startupPanel = panelEqArg.split('=')[1];

function getDataPath() {
  const dbPath = path.join(app.getPath('userData'), 'ZameenKhata_Database');
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
  return dbPath;
}

function findNonSystemDrive() {
  const system = (process.env.SystemDrive || 'C:').toUpperCase();
  const candidates = ['D:', 'E:', 'F:', 'G:'];
  for (const drive of candidates) {
    try {
      if (drive.toUpperCase() === system) continue;
      if (fs.existsSync(drive + '\\')) return drive;
    } catch (e) { /* skip */ }
  }
  return null;
}

function createBaseWindow(options = {}) {
  const iconPath = getAppIconPath();
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1200, minHeight: 800,
    title: options.title || 'AL SIRAJ DEVELOPERS - Real Estate ERP',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: options.additionalArguments || [],
    },
    show: false,
    backgroundColor: options.backgroundColor || '#0b1220',
  });
  win.setMenuBarVisibility(false);
  win.setMenu(null);
  win.maximize();
  win.show();

  // Persist meta on the BrowserWindow instance so renderer can reliably query it
  win._zameenKhataMeta = options.meta || { mode: 'panel', panel: null, title: options.title || 'AL SIRAJ DEVELOPERS' };

  // Capture any early renderer console/errors.
  win.webContents.on('console-message', (_event, level, message) => {
    console.log('[renderer-console]', { level, message });
  });

  const isDev = !app.isPackaged;
  try {
    if (isDev) {
      console.log('[startup] loading dev URL');
      win.loadURL('http://localhost:5173');
    } else {
      const p = path.join(__dirname, '../../dist/index.html');
      console.log('[startup] loading file', p);
      win.loadFile(p);
    }
  } catch (e) {
    console.error('[startup] load URL/file threw', e);
  }

  // Ensure window becomes visible and log failures (helps diagnose blank/close issues)
  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show();
  });

  win.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault();
      win.hide();
      if (tray) tray.displayBalloon({
        title: 'Running in Background',
        content: 'AL SIRAJ is backing up Excel files and receiving real-time notifications.',
        iconType: 'custom',
        icon: getAppIconPath(),
        largeIcon: true,
      });
      runBackgroundStorageBackup('window-close');
    }
  });

  win.on('closed', () => {
    try {
      console.log('[browserwindow] closed', options?.title || '');
    } catch (_) {}
  });

  win.webContents.on('did-start-navigation', (_event, url) => {
    console.log('[browserwindow] did-start-navigation', url);
  });

  win.webContents.on('dom-ready', () => {
    console.log('[browserwindow] dom-ready');
  });

  win.webContents.on('did-finish-load', () => {
    console.log('[browserwindow] did-finish-load');
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDesc) => {
    console.error('[browserwindow] did-fail-load:', { errorCode, errorDesc });
  });


  win.webContents.on('crashed', () => {
    console.error('[browserwindow] webContents crashed', options?.title || '');
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[browserwindow] render-process-gone:', details);
  });

  win.webContents.on('unresponsive', () => {
    console.error('[browserwindow] webContents unresponsive');
  });

  return win;
}

function createPanelWindow(panel) {
  const title = panel === 'ceo' ? 'AL SIRAJ DEVELOPERS - CEO Window' : 'AL SIRAJ DEVELOPERS - Employee Window';
  console.log('[startup] createPanelWindow', { panel, title });
  const win = createBaseWindow({
    title,
    additionalArguments: [`--panel=${panel}`, '--mode=panel'],
    meta: { mode: 'panel', panel, title: panel === 'ceo' ? 'CEO Window' : 'Employee Window' },
  });
  win.on('closed', () => {
    console.error('[startup] panel window closed', { panel, title, activeIsThis: activeWindow === win });
    if (activeWindow === win) activeWindow = null;
  });
  activeWindow = win;
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    console.log('[startup] closing launcherWindow due to panel open');
    launcherWindow.close();
  }
  return win;
}


function createLauncherWindow() {
  const win = createBaseWindow({
    title: 'AL SIRAJ DEVELOPERS - Window Selector',
    additionalArguments: ['--mode=launcher'],
    meta: { mode: 'launcher', panel: null, title: 'Window Selector' },
  });
  win.on('closed', () => {
    if (launcherWindow === win) launcherWindow = null;
  });
  launcherWindow = win;
  return win;
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, '../../public/favicon.ico');
  try {
    tray = new Tray(iconPath);
  } catch(e) {
    console.error('Tray creation failed:', e);
    return;
  }
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Zameen Khata', click: () => { if (!showExistingWindow()) openInitialWindow(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { forceQuit = true; app.quit(); } }
  ]);
  tray.setToolTip('AL SIRAJ DEVELOPERS ERP');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (!showExistingWindow()) openInitialWindow();
  });
}

let initialWindowOpened = false;
function openInitialWindow() {
  if (initialWindowOpened) return;
  initialWindowOpened = true;

  if (process.argv.includes('--hidden')) {
    // Hidden start from boot, do nothing, the tray is active.
    // However, the renderer needs to run for Supabase subscriptions!
    // So we MUST create the window, but keep it hidden.
    if (startupPanel === 'ceo' || startupPanel === 'employee') {
      const win = createPanelWindow(startupPanel);
      win.hide();
    } else {
      const win = createLauncherWindow();
      win.hide();
    }
    return;
  }

  if (startupPanel === 'ceo' || startupPanel === 'employee') {
    createPanelWindow(startupPanel);
  } else {
    createLauncherWindow();
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  if (isTestBuildExpired()) {
    await showExpiredAndQuit();
    return;
  }
  createTray();

  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe'),
    args: ['--hidden']
  });

  // ─── Premium Splash Screen ──────────────────────────────────────────────
  let splashWindow = null;
  const splashStartTime = Date.now();

  const reportSplash = (percent, message) => {
    try {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send('startup-progress', {
          percent,
          message: message || ''
        });
      }
    } catch (_) {}
  };

  const finishSplash = async () => {
    try {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send('startup-complete');
      }
    } catch (_) {}

    try { if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy(); } catch (_) {}
  };

  try {
    splashWindow = null;
  } catch (_) {
    splashWindow = null;
  }

  reportSplash(5, 'Initializing...');

  const dbPath = getDataPath();
  await initializeDatabase(dbPath);
  reportSplash(10, 'Loading Database...');

  // Business data is DB-first when online; Excel is the automatic local cache/offline fallback.

  // Live mirror (Desktop) + immutable archive (non-system drive)
  try {
    const desktopRoot = path.join(app.getPath('desktop'), 'ZameenKhata_Exports');
    const drive = findNonSystemDrive();
    const immutableRoot = drive ? path.join(drive + '\\', 'ZameenKhata_Exports') : '';
    configureMirrors({ desktopRoot, immutableRoot });
  } catch (e) { /* ignore */ }

  try {
    const storage = require('./db/storage');
    setAfterWriteHook(({ relPath }) => {
      if (!relPath) return;
      // Storage is backup/export only. Queue changed files, but do not upload every write.
      // Manual backup / daily background backup / sync-to-cloud can flush this queue.
      storage.queueFile(relPath);
    });
  } catch (e) {
    console.warn('[startup] Could not attach storage write hook:', e.message);
  }

  reportSplash(50, 'Preparing Resources...');
  registerIpcHandlers(ipcMain, dbPath, () => activeWindow);
  // Expose startup panel to renderer
  ipcMain.handle('get-startup-panel', () => startupPanel);
  ipcMain.handle('get-window-meta', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const meta = win?._zameenKhataMeta;
    if (meta) return meta;
    // Fallback: best-effort parse
    const args = (event.sender.getLastWebPreferences?.().additionalArguments) || [];
    const panelArg = args.find(arg => arg.startsWith('--panel='));
    const modeArg = args.find(arg => arg.startsWith('--mode='));
    const panel = panelArg ? panelArg.split('=')[1] : startupPanel;
    const mode = modeArg ? modeArg.split('=')[1] : (panel ? 'panel' : 'launcher');
    const title = panel === 'ceo' ? 'CEO Window' : panel === 'employee' ? 'Employee Window' : 'Window Selector';
    return { panel, mode, title };
  });
  ipcMain.handle('open-panel-window', (_, panel) => {
    // Avoid opening multiple workspace windows: focus existing, or replace.
    if (activeWindow && !activeWindow.isDestroyed()) {
      const currentPanel = activeWindow._zameenKhataMeta?.panel;
      if (currentPanel === panel) {
        activeWindow.focus();
        return { success: true, reused: true };
      }
      activeWindow.close();
    }
    createPanelWindow(panel);
    return { success: true };
  });
  ipcMain.handle('return-to-launcher', () => {
    createLauncherWindow();
    if (activeWindow && !activeWindow.isDestroyed()) activeWindow.close();
    return { success: true };
  });
  reportSplash(70, 'Configuring Services...');
  startBackupScheduler(dbPath);
  startDailyStorageBackupScheduler();

  // ─── Startup File Sync (Storage ↔ Local) ──────────────────────
  try {
    const storage = require('./db/storage');

    (async () => {
      try {
        reportSplash(75, 'Preparing backup storage...');
        await storage.ensureBucket();
      } catch (e) {
        console.warn('[startup] File sync error (non-fatal):', e.message);
      }
    })();
  } catch (e) {
    console.warn('[startup] Could not start file sync:', e.message);
  }

  // ─── OS-level Installment Reminder Scheduler (runs even when UI is closed) ─────
  // Persists due reminders into Notifications_Log.xlsx and only toasts newly created reminders.
  setInterval(async () => {
    try {
      const created = await upsertDueInstallmentNotifications({ leadDays: 7 });
      if (!Array.isArray(created) || created.length === 0) return;
      const accountantTown = getCurrentAccountantTown();
      const scoped = accountantTown
        ? created.filter((row) => String(row.Town_Name || '') === accountantTown)
        : created;
      if (!scoped.length) return;

      const first = scoped[0];
      const overdue = scoped.filter((row) => row.Type === 'Overdue').length;
      const title = overdue ? `${overdue} Overdue Installment(s)` : `${scoped.length} Due Installment(s)`;
      const body = scoped.length === 1
        ? (first.Message || `Installment reminder (${first.Town_Name || ''})`.trim())
        : `${first.Town_Name || accountantTown || 'Town'} has ${scoped.length} due/overdue installment reminders.`;

      if (isCurrentAccountantContext()) new Notification({ title, body, icon: getAppIconPath() }).show();
    } catch (_) {
      // silent: reminder scheduler should never crash the app
    }
  }, 60000);

  // ─── Main-process Realtime Subscriptions (reliable even when UI is hidden) ──
  const realtimeChannels = [];

  // Agent registration appeals → notify CEO
  const appealsChannel = supabase
    .channel('main-appeals')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'appeals' },
      (payload) => {
        const a = payload.new;
        const win = typeof activeWindow !== 'undefined' ? activeWindow : null;
        if (isCurrentCeoContext() && a.status !== 'approved' && a.status !== 'rejected') {
          showDesktopNotification({
            title: 'New ' + (a.appeal_type || 'Appeal'),
            body: (a.requested_by_role || 'Agent') + ' needs CEO approval — ' + (a.reason || a.entity_type || ''),
          });
          // Also forward to renderer if window is visible
          try {
            if (win && !win.isDestroyed() && win.webContents) {
              win.webContents.send('sync-warning', 'New ' + (a.appeal_type || 'appeal') + ' pending approval');
              win.webContents.send('realtime-new-appeal', a);
            }
          } catch (_) {}
        }
      }
    )
    .subscribe();
  realtimeChannels.push(appealsChannel);

  // Commission created → notify CEO
  const applyApprovedDailyEntryAppeal = async (appeal) => {
    if (!appeal || appeal.status !== 'approved') return;
    if (!['backdated_daily_entry', 'future_daily_entry'].includes(appeal.appeal_type)) return;
    const rd = appeal.requested_data || {};
    if (!rd.date || !rd.townName) return;

    const entry = await addDailyEntry({
      entryId: `APP-${String(appeal.id).replace(/-/g, '')}`,
      reference: appeal.id,
      date: rd.date,
      time: rd.time || '00:00',
      type: rd.type || 'Expense',
      description: rd.description || '',
      amount: parseFloat(rd.amount) || 0,
      townName: rd.townName,
      incomeType: rd.incomeType || '',
      category: rd.category || 'Daily',
      subcategory: rd.subcategory || '',
      createdBy: 'CEO Approved Appeal',
      reviewStatus: 'approved',
    });

    if (isCurrentCeoContext()) showDesktopNotification({
      title: entry?.duplicate ? 'Daily Entry Already Saved' : 'Daily Entry Saved',
      body: `${rd.type || 'Entry'} ${rd.date} has been saved to local accounts.`,
      silent: true,
    });

    try {
      if (activeWindow && !activeWindow.isDestroyed() && activeWindow.webContents) {
        activeWindow.webContents.send('sync-warning', `${rd.type || 'Entry'} ${rd.date} saved after CEO approval`);
      }
    } catch (_) {}
  };

  const appealUpdatesChannel = supabase
    .channel('main-appeal-updates')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'appeals' },
      (payload) => {
        const updatedAppeal = payload.new || {};
        const status = String(updatedAppeal.status || '').toLowerCase();
        if (status === 'approved' || status === 'rejected') {
          const appealType = String(updatedAppeal.appeal_type || 'appeal').replace(/_/g, ' ');
          const townName = updatedAppeal.town_name || updatedAppeal.requested_data?.townName || updatedAppeal.requested_data?.Town_Name || '';
          const message = `${appealType} ${status}${townName ? ` for ${townName}` : ''}`;
          try {
            if (activeWindow && !activeWindow.isDestroyed() && activeWindow.webContents) {
              activeWindow.webContents.send('sync-warning', `CEO review ${status}: ${message}`);
              activeWindow.webContents.send('realtime-new-appeal', updatedAppeal);
            }
          } catch (_) {}
          if (isCurrentCeoContext() || isCurrentAccountantContext()) {
            showDesktopNotification({
              title: `Appeal ${status}`,
              body: message,
              silent: true,
            });
          }
        }
        applyApprovedDailyEntryAppeal(payload.new).catch((e) => {
          console.error('[appeal-sync] Failed to apply approved daily entry appeal:', e);
          if (isCurrentCeoContext()) showDesktopNotification({
            title: 'Daily Entry Approval Sync Failed',
            body: e.message || 'Approved appeal could not be saved locally.',
          });
        });
      }
    )
    .subscribe();
  realtimeChannels.push(appealUpdatesChannel);

  const commissionsChannel = supabase
    .channel('main-commissions')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'commissions' },
      (payload) => {
        const c = payload.new;
        if (isCurrentCeoContext()) showDesktopNotification({
          title: 'New Commission Pending',
          body: 'Commission of PKR ' + (parseFloat(c.commission_amount) || 0).toLocaleString() + ' is pending payment.',
        });
      }
    )
    .subscribe();
  realtimeChannels.push(commissionsChannel);

  const businessNotificationsChannel = supabase
    .channel('main-business-notifications')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        if (!isCurrentCeoContext()) return;
        const n = payload.new || {};
        showDesktopNotification({
          title: n.Type || n.type || 'Business Notification',
          body: n.Message || n.message || 'New business activity recorded.',
        });
      }
    )
    .subscribe();
  realtimeChannels.push(businessNotificationsChannel);

  // Cleanup on quit
  app.on('before-quit', () => {
    realtimeChannels.forEach(ch => {
      try { supabase.removeChannel(ch); } catch (_) {}
    });
  });

  // ─── Custom Logo Handlers ─────────────────────────────────────────────────
  const LOGO_CONFIG_PATH = path.join(app.getPath('userData'), 'logo_config.json');

  function getSavedLogoPath() {
    try {
      if (fs.existsSync(LOGO_CONFIG_PATH)) {
        const cfg = JSON.parse(fs.readFileSync(LOGO_CONFIG_PATH, 'utf8'));
        if (cfg.logoPath && fs.existsSync(cfg.logoPath)) return cfg.logoPath;
      }
    } catch (e) {}
    return null;
  }

  function buildLogoDataUrl(logoPath) {
    if (!logoPath) return null;
    try {
      const ext = path.extname(logoPath).toLowerCase().slice(1);
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
      const mime = mimeMap[ext] || 'image/png';
      const data = fs.readFileSync(logoPath);
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch (e) { return null; }
  }

  ipcMain.handle('get-logo-data-url', () => {
    const logoPath = getSavedLogoPath();
    return { dataUrl: buildLogoDataUrl(logoPath) };
  });

  ipcMain.handle('select-logo-image', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Company Logo',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };

    const srcPath = result.filePaths[0];
    const ext = path.extname(srcPath);
    const userData = app.getPath('userData');

    // Remove old custom logo files
    ['png', 'jpg', 'jpeg', 'webp', 'gif'].forEach(e => {
      const old = path.join(userData, `custom_logo.${e}`);
      try { if (fs.existsSync(old)) fs.rmSync(old); } catch (_) {}
    });

    const destPath = path.join(userData, `custom_logo${ext}`);
    fs.copyFileSync(srcPath, destPath);
    fs.writeFileSync(LOGO_CONFIG_PATH, JSON.stringify({ logoPath: destPath }));

    return { dataUrl: buildLogoDataUrl(destPath) };
  });

  ipcMain.handle('remove-logo-image', () => {
    try {
      const userData = app.getPath('userData');
      ['png', 'jpg', 'jpeg', 'webp', 'gif'].forEach(e => {
        const old = path.join(userData, `custom_logo.${e}`);
        try { if (fs.existsSync(old)) fs.rmSync(old); } catch (_) {}
      });
      if (fs.existsSync(LOGO_CONFIG_PATH)) fs.rmSync(LOGO_CONFIG_PATH);
    } catch (e) {}
    return { success: true };
  });
  // ─────────────────────────────────────────────────────────────────────────

  // Developer config: read from project root or app resources
  ipcMain.handle('get-dev-config', () => {
    const configPaths = [
      path.join(__dirname, '../../developer_config.json'),     // dev
      path.join(process.resourcesPath || '', 'developer_config.json'), // packaged
      path.join(app.getAppPath(), 'developer_config.json'),   // packaged alt
    ];
    for (const p of configPaths) {
      try {
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch (e) { /* skip */ }
    }
    return { developer_website: 'https://example.com', powered_by: 'MAHAD AND MAHDI DEVELOPERS' };
  });

  // Open external URL in default system browser
  ipcMain.handle('open-external-url', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Verify CEO Password
  ipcMain.handle('verify-ceo-password', (_, inputPassword) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ceo_config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.password) {
          return inputPassword === config.password;
        }
      }
    } catch (e) { /* ignore */ }
    return inputPassword === 'ceo123' || inputPassword === 'admin123';
  });

  try {
    reportSplash(94, 'Starting Application...');
    await finishSplash();
    // Ensure main window definitely opens
    try {
      console.log('[startup] opening initial window');
      openInitialWindow();
      if (app.isPackaged) setupAutoUpdater(() => activeWindow || launcherWindow);
    } catch (err) {
      console.error('[startup] openInitialWindow failed:', err);
      openInitialWindow();
      if (app.isPackaged) setupAutoUpdater(() => activeWindow || launcherWindow);
    }
  } catch (e) {
    console.error('[startup] failed after splash:', e);

    try {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    } catch (_) {}

    // Strong fallback: always open a window so app doesn't remain blank
    try {
      console.log('[startup] fallback openInitialWindow');
      openInitialWindow();
      if (app.isPackaged) setupAutoUpdater(() => activeWindow || launcherWindow);
    } catch (err) {
      console.error('[startup] fallback openInitialWindow failed:', err);
    }
  }
});

app.on('window-all-closed', () => {
  // Do not auto-quit. Keep running in tray for notifications.
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) openInitialWindow();
});
