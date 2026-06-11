const dataLayer = require('./db/dataLayer');
const { addTown, getTowns, getTownDetails, getTownPrices, setTownPrices, addCeoExpense, deleteCeoExpense, editCeoExpense, updateTown, deleteTown } = require('./db/towns');
const { addPlot, addShop, getPropertyFile, getAllPropertiesByTown, getAllProperties, sellProperty, updateFileStatus, resellProperty, getSoldProperties, cancelDeal } = require('./db/properties');
const { getDailyEntries, addDailyEntry, deleteDailyEntry } = require('./db/dailyEntries');
const { getInstallments, getDueInstallments, markInstallmentPaid, extendInstallmentDate, addEmployee, getEmployees, deleteEmployee, getNotifications, dismissNotification, getDashboardStats, getAllSales, getAllExpenses, getCeoExpenses, getCeoSalary, addCeoSalary, deleteCeoSalary, getResellHistory, getProfitLossReport, getTownPerformance, getInstallmentProperties, getPropertyInstallments, recordCollectionPaymentLocal } = require('./db/globals');
const EmployeeDB = require('./db/employees');
const { performBackup } = require('./db/backup');
const { performFullSyncUp } = require('./db/syncUp');
const { showDesktopNotification } = require('./notificationService');
const https = require('https');
const path = require('path');
const fs = require('fs');
const onlineDb = require('./db/online');
const storage = require('./db/storage');

let _windowGetter = null;
let _queuedUploadTimer = null;
let _queuedCloudSyncTimer = null;
let _cloudSyncInFlight = false;

function getActiveWindow() {
  return typeof _windowGetter === 'function' ? _windowGetter() : _windowGetter;
}

function sendSyncWarning(message) {
  const win = getActiveWindow();
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('sync-warning', message); } catch {}
  }
}

function scheduleQueuedFileUpload(delayMs = 8000) {
  storage.queueAllLocalFiles();
  if (_queuedUploadTimer) clearTimeout(_queuedUploadTimer);
  _queuedUploadTimer = setTimeout(async () => {
    _queuedUploadTimer = null;
    try {
      await storage.flushUploadQueue();
    } catch (e) {
      sendSyncWarning('Cloud file sync error: ' + (e.message || 'Unknown'));
    }
  }, delayMs);
}

function scheduleQueuedCloudSync(delayMs = 12000) {
  if (_queuedCloudSyncTimer) clearTimeout(_queuedCloudSyncTimer);
  _queuedCloudSyncTimer = setTimeout(async () => {
    _queuedCloudSyncTimer = null;
    if (_cloudSyncInFlight) {
      scheduleQueuedCloudSync(delayMs);
      return;
    }
    _cloudSyncInFlight = true;
    try {
      await performFullSyncUp(() => {});
    } catch (e) {
      sendSyncWarning('Cloud database sync error: ' + (e.message || 'Unknown'));
    } finally {
      _cloudSyncInFlight = false;
    }
  }, delayMs);
}

async function syncOnline(localFn, supabaseFn) {
  const localResult = await localFn();
  let syncWarning = '';

  if (typeof supabaseFn === 'function') {
    try {
      await supabaseFn();
    } catch (e) {
      syncWarning = 'Cloud quick sync failed: ' + (e.message || 'Unknown');
      sendSyncWarning(syncWarning);
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
      return await dataLayer.read(
        () => getTowns(),
        () => onlineDb.getAll('towns')
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('add-town', async (_, data) => {
    try {
      assertObjectPayload(data, 'town payload');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      return await syncOnline(() => addTown(data), () => onlineDb.insert('towns', { Town_Name: data.Town_Name, Location: data.Location || '', Status: data.Status || 'Active', Total_Plots: parseInt(data.Total_Plots) || 0, Total_Shops: parseInt(data.Total_Shops) || 0 }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('update-town', async (_, townName, data) => {
    try {
      if (!isNonEmpty(townName)) throw new Error('Town name is required');
      assertObjectPayload(data, 'update payload');
      return await syncOnline(() => updateTown(townName, data), () => onlineDb.updateWhere('towns', { Town_Name: townName }, data));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('delete-town', async (_, townName) => {
    try {
      assertPermanentDeleteAllowed();
      if (!isNonEmpty(townName)) throw new Error('Town name is required');
      return await syncOnline(() => deleteTown(townName), () => onlineDb.deleteWhere('towns', { Town_Name: townName }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-town-details', async (_, townName) => { try { if (!isNonEmpty(townName)) throw new Error('Town name is required'); return await dataLayer.read(() => getTownDetails(townName), () => onlineDb.findOne('towns', { Town_Name: townName })); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-town-prices', async (_, townName) => { try { if (!isNonEmpty(townName)) throw new Error('Town name is required'); return await dataLayer.read(() => getTownPrices(townName), () => onlineDb.findOne('towns', { Town_Name: townName })); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('set-town-prices', async (_, townName, prices) => {
    try {
      if (!isNonEmpty(townName)) throw new Error('Town name is required');
      assertObjectPayload(prices, 'prices payload');
      return await syncOnline(() => setTownPrices(townName, prices), () => onlineDb.updateWhere('towns', { Town_Name: townName }, prices));
    } catch(e) { return { error: e.message }; }
  });

  // Properties
  ipcMain.handle('add-plot', async (_, data) => {
    try {
      assertObjectPayload(data, 'plot payload');
      if (!isNonEmpty(data.Plot_Number)) throw new Error('Plot_Number is required');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      return await syncOnline(() => addPlot(data), () => onlineDb.insert('properties', { Property_Type: 'Plot', Property_Number: data.Plot_Number, Town_Name: data.Town_Name, Status: 'Available', Price: parseFloat(data.Price) || 0 }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('add-shop', async (_, data) => {
    try {
      assertObjectPayload(data, 'shop payload');
      if (!isNonEmpty(data.Shop_Number)) throw new Error('Shop_Number is required');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      return await syncOnline(() => addShop(data), () => onlineDb.insert('properties', { Property_Type: 'Shop', Property_Number: data.Shop_Number, Town_Name: data.Town_Name, Status: 'Available', Price: parseFloat(data.Price) || 0 }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-plot', async (_, num, town) => { try { if (!isNonEmpty(num)) throw new Error('Plot number is required'); if (!isNonEmpty(town)) throw new Error('Town is required'); return await dataLayer.read(() => getPropertyFile('Plot', num, town), () => onlineDb.getProperty('Plot', num, town)); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-shop', async (_, num, town) => { try { if (!isNonEmpty(num)) throw new Error('Shop number is required'); if (!isNonEmpty(town)) throw new Error('Town is required'); return await dataLayer.read(() => getPropertyFile('Shop', num, town), () => onlineDb.getProperty('Shop', num, town)); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-all-plots', async (_, town) => {
    try {
      return await dataLayer.read(
        () => getAllPropertiesByTown(town, 'Plot'),
        () => onlineDb.getPropertiesByTown(town, 'Plot')
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-all-shops', async (_, town) => {
    try {
      return await dataLayer.read(
        () => getAllPropertiesByTown(town, 'Shop'),
        () => onlineDb.getPropertiesByTown(town, 'Shop')
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-all-properties', async () => {
    try {
      return await dataLayer.read(
        () => getAllProperties(),
        () => onlineDb.getAllProperties()
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
      if (!isNonEmpty(data.Customer_Name)) throw new Error('Customer_Name is required');
      if (!isNonEmpty(data.Receipt_Number)) throw new Error('Receipt_Number is required');
      return await syncOnline(() => sellProperty(data), () => onlineDb.sellProperty(data));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('cancel-deal', async (_, data) => {
    try {
      assertPermanentDeleteAllowed();
      assertObjectPayload(data, 'cancel payload');
      assertEnum(data.type, ['Plot', 'Shop'], 'property type');
      if (!isNonEmpty(data.number)) throw new Error('Property number is required');
      if (!isNonEmpty(data.townName)) throw new Error('Town name is required');
      if (!isNonEmpty(data.Receipt_Number)) throw new Error('Receipt_Number is required');
      return await syncOnline(() => cancelDeal(data), () => onlineDb.cancelDeal(data));
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('updateFileStatus', async (_, params) => {
    try {
      assertObjectPayload(params, 'updateFileStatus payload');
      return await syncOnline(() => updateFileStatus(params), () => onlineDb.updateFileStatus(params));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-sold-properties', async () => {
    try {
      return await dataLayer.read(
        () => getSoldProperties(),
        () => onlineDb.getSoldProperties()
      );
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-all-sales', async () => {
    try {
      return await dataLayer.read(
        () => getAllSales(),
        () => onlineDb.getAllSales()
      );
    } catch(e) { return { error: e.message }; }
  });

  // Installments
  ipcMain.handle('get-installments', async () => { try { return await dataLayer.read(() => getInstallments(), () => onlineDb.getAllInstallments()); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-due-installments', async () => { try { return await dataLayer.read(() => getDueInstallments(), async () => { const all = await onlineDb.getAllInstallments(); const today = new Date().toISOString().split('T')[0]; return (all || []).filter(i => { const s = (i.Status || '').toLowerCase(); if (s === 'paid') return false; const d = i.Due_Date || ''; return d < today; }).map(i => ({ ...i, Status: 'Overdue' })); }); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('mark-installment-paid', async (_, data) => {
    try {
      assertObjectPayload(data, 'installment payload');
      if (!isNonEmpty(data.Tracker_ID)) throw new Error('Tracker_ID is required');
      return await syncOnline(() => markInstallmentPaid(data), () => onlineDb.markInstallmentPaid(data));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('extend-installment-date', async (_, data) => {
    try {
      assertObjectPayload(data, 'installment payload');
      if (!isNonEmpty(data.Tracker_ID)) throw new Error('Tracker_ID is required');
      if (!isNonEmpty(data.New_Due_Date)) throw new Error('New_Due_Date is required');
      return await syncOnline(() => extendInstallmentDate(data), () => onlineDb.extendInstallmentDueDate(data));
    } catch(e) { return { error: e.message }; }
  });

  // Resell
  ipcMain.handle('resell-property', async (_, data) => {
    try {
      assertObjectPayload(data, 'resell payload');
      assertEnum(data.type, ['Plot', 'Shop'], 'property type');
      if (!isNonEmpty(data.number)) throw new Error('Property number is required');
      if (!isNonEmpty(data.townName)) throw new Error('Town name is required');
      if (!isNonEmpty(data.Receipt_Number)) throw new Error('Receipt_Number is required');
      return await syncOnline(() => resellProperty(data), () => onlineDb.resellProperty(data));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-resell-history', async () => { try { return await dataLayer.read(() => getResellHistory(), () => onlineDb.getAll('resell_history')); } catch(e) { return { error: e.message }; } });

  // Expenses
  ipcMain.handle('add-expense', async (_, data) => {
    try {
      assertObjectPayload(data, 'expense payload');
      const { generateId } = require('./db/core');
      const expData = { Expense_ID: generateId(), Town_Name: data.Town_Name||'', Expense_Name: data.Expense_Name||'', Amount_PKR: parseFloat(data.Amount_PKR)||0, Description: data.Description||'', Category: data.Category||'General', Date: data.Date || new Date().toISOString().split('T')[0], Added_By: data.Added_By||'Employee' };
      const { appendToExcel, getGlobalsPath } = require('./db/core');
      const p = require('path');
      await appendToExcel(p.join(getGlobalsPath(), 'All_Expenses.xlsx'), 'Data', expData);
      return await syncOnline(() => expData, () => onlineDb.insert('expenses', expData));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-expenses', async (_, town) => { try { return await dataLayer.read(() => { const all = getAllExpenses(); return town ? all.filter(e => e.Town_Name === town) : all; }, async () => { const all = await onlineDb.getAll('expenses'); return town ? (all || []).filter(e => e.Town_Name === town) : (all || []); }); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-all-expenses', async () => { try { return await dataLayer.read(() => getAllExpenses(), () => onlineDb.getAll('expenses')); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('get-ceo-expenses', async () => { try { return await dataLayer.read(() => getCeoExpenses(), () => onlineDb.getAll('ceo_expenses')); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('add-ceo-expense', async (_, data) => {
    try {
      assertObjectPayload(data, 'ceo expense payload');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      if (!isNonEmpty(data.Expense_Name)) throw new Error('Expense_Name is required');
      return await syncOnline(() => addCeoExpense(data), () => onlineDb.insert('ceo_expenses', { Expense_ID: onlineDb.generateId(), Town_Name: data.Town_Name, Expense_Name: data.Expense_Name, Amount_PKR: parseFloat(data.Amount_PKR)||0, Description: data.Description||'', Category: data.Category||'General', Date: data.Date||new Date().toISOString().split('T')[0] }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('delete-ceo-expense', async (_, id) => {
    try {
      assertPermanentDeleteAllowed();
      if (!isNonEmpty(id)) throw new Error('Expense id is required');
      return await syncOnline(() => deleteCeoExpense(id), () => onlineDb.deleteWhere('ceo_expenses', { Expense_ID: id }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('edit-ceo-expense', async (_, data) => {
    try {
      assertObjectPayload(data, 'ceo expense payload');
      if (!isNonEmpty(data.Expense_ID)) throw new Error('Expense_ID is required');
      return await syncOnline(() => editCeoExpense(data), () => onlineDb.updateWhere('ceo_expenses', { Expense_ID: data.Expense_ID }, data));
    } catch(e) { return { error: e.message }; }
  });

  // CEO Salary
  ipcMain.handle('get-ceo-salary', async () => { try { return await dataLayer.read(() => getCeoSalary(), () => onlineDb.getAll('ceo_salary')); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('add-ceo-salary', async (_, data) => {
    try {
      assertObjectPayload(data, 'ceo salary payload');
      if (!isNonEmpty(data.Town_Name)) throw new Error('Town_Name is required');
      if (!isNonEmpty(data.Month_Year)) throw new Error('Month_Year is required');
      return await syncOnline(() => addCeoSalary(data), () => onlineDb.insert('ceo_salary', { Salary_ID: onlineDb.generateId(), Town_Name: data.Town_Name, Month_Year: data.Month_Year, Amount_PKR: parseFloat(data.Amount_PKR)||0, Date: data.Date||new Date().toISOString().split('T')[0] }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('delete-ceo-salary', async (_, id) => {
    try {
      assertPermanentDeleteAllowed();
      if (!isNonEmpty(id)) throw new Error('Salary id is required');
      return await syncOnline(() => deleteCeoSalary(id), () => onlineDb.deleteWhere('ceo_salary', { Salary_ID: id }));
    } catch(e) { return { error: e.message }; }
  });

  // Employees
  ipcMain.handle('add-employee', async (_, data) => {
    try {
      assertObjectPayload(data, 'employee payload');
      if (!isNonEmpty(data.Employee_Name)) throw new Error('Employee_Name is required');
      return await syncOnline(() => addEmployee(data), () => onlineDb.insert('employees', { Employee_ID: onlineDb.generateId(), Employee_Name: data.Employee_Name, CNIC: data.CNIC||'', Phone: data.Phone||'', Role: data.Role||'', Town_Name: data.Town_Name||'', Salary: parseFloat(data.Salary)||0 }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('get-employees', async () => { try { return await dataLayer.read(() => getEmployees(), () => onlineDb.getAll('employees')); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('delete-employee', async (_, id) => {
    try {
      assertPermanentDeleteAllowed();
      if (!isNonEmpty(id)) throw new Error('Employee id is required');
      return await syncOnline(() => deleteEmployee(id), () => onlineDb.deleteWhere('employees', { Employee_ID: id }));
    } catch(e) { return { error: e.message }; }
  });

  // Dashboard
  ipcMain.handle('get-dashboard-stats', async () => { try { return await dataLayer.read(() => getDashboardStats(), () => onlineDb.getDashboardStats()); } catch(e) { return { error: e.message }; } });

  // Notifications
  ipcMain.handle('get-notifications', async () => { try { return await dataLayer.read(() => getNotifications(), () => onlineDb.getAll('notifications')); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('dismiss-notification', async (_, id) => {
    try {
      if (!isNonEmpty(id)) throw new Error('Notification id is required');
      return await syncOnline(() => dismissNotification(id), () => onlineDb.updateWhere('notifications', { Notification_ID: id }, { Dismissed: 'Yes', Status: 'Dismissed' }));
    } catch(e) { return { error: e.message }; }
  });

  // Backup & Sync
  ipcMain.handle('trigger-backup', async () => { try { return await performBackup(dbPath); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('configure-file-sync-context', async (_, context) => {
    try {
      storage.setSyncContext(context || {});
      storage.startPeriodicFileSync({
        intervalMs: 5 * 60 * 1000,
        onError: (e) => sendSyncWarning('Cloud file sync error: ' + (e.message || 'Unknown')),
      });
      storage.runFileSyncCycle().catch((e) => {
        sendSyncWarning('Cloud file sync error: ' + (e.message || 'Unknown'));
      });
      return { success: true, context: storage.getSyncContext() };
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
      sendProgress(10, 'Downloading Excel files...');
      const result = await storage.downloadMissingFiles((filePath) => {
        sendProgress(50, `Downloaded ${path.basename(filePath)}`);
      });
      sendProgress(100, 'Sync Complete!');
      return { success: true, ...result };
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
      return { success: true, ...result };
    } catch(e) { return { error: e.message }; }
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
  ipcMain.handle('get-town-performance', async (_, townName) => {
    try {
      if (!isNonEmpty(townName)) throw new Error('Town name is required');
      return await dataLayer.read(() => getTownPerformance(townName), async () => { const stats = await onlineDb.getDashboardStats(); const tp = (stats.townPerformance || []).find(t => t.name === townName); return tp || { error: 'Town not found' }; });
    } catch(e) { return { error: e.message }; }
  });

  // Installment Properties (for daily income entry)
  ipcMain.handle('getInstallmentProperties', async (_, townName) => { try { if (!isNonEmpty(townName)) throw new Error('Town name is required'); return await dataLayer.read(() => getInstallmentProperties(townName), () => onlineDb.getInstallmentProperties(townName)); } catch(e) { return { error: e.message }; } });
  ipcMain.handle('getPropertyInstallments', async (_, propertyId) => { try { if (!isNonEmpty(propertyId)) throw new Error('Property ID is required'); return await dataLayer.read(() => getPropertyInstallments(propertyId), () => onlineDb.getPropertyInstallments(propertyId)); } catch(e) { return { error: e.message }; } });

  // Daily Entries
  ipcMain.handle('getDailyEntries', async (_, params) => {
    try {
      assertObjectPayload(params, 'getDailyEntries payload');
      return await dataLayer.read(() => getDailyEntries(params), async () => { const all = await onlineDb.getAll('daily_entries'); const t = params.townName; return t ? (all || []).filter(e => e.Town_Name === t) : (all || []); });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('addDailyEntry', async (_, params) => {
    try {
      assertObjectPayload(params, 'addDailyEntry payload');
      return await syncOnline(() => addDailyEntry(params), () => onlineDb.insert('daily_entries', { Entry_ID: onlineDb.generateId(), ...params }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('deleteDailyEntry', async (_, params) => {
    try {
      assertPermanentDeleteAllowed();
      assertObjectPayload(params, 'deleteDailyEntry payload');
      return await syncOnline(() => deleteDailyEntry(params), () => onlineDb.deleteWhere('daily_entries', { Entry_ID: params.Entry_ID }));
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('recordSalaryPayment', async (_, data) => {
    try {
      assertObjectPayload(data, 'salary payload');
      const { recordSalaryPayment, getSalaryRecords } = require('./db/globals');
      
      // Check for duplicate monthly salary payment
      const existing = await getSalaryRecords(data.townName);
      if (Array.isArray(existing)) {
        const isDuplicate = existing.some(r => 
          String(r.Name).trim().toLowerCase() === String(data.employeeName).trim().toLowerCase() &&
          String(r.Month).trim().toLowerCase() === String(data.month).trim().toLowerCase()
        );
        if (isDuplicate) {
          return { error: `Salary already paid to ${data.employeeName} for the month of ${data.month}` };
        }
      }

      return await syncOnline(() => recordSalaryPayment(data), () => onlineDb.insert('salary_payments', {
        Payment_ID: onlineDb.generateId(),
        Employee_Name: data.employeeName,
        Town_Name: data.townName,
        Amount: parseFloat(data.amount) || 0,
        Month: data.month,
        Payment_Date: new Date().toISOString().split('T')[0],
        Notes: data.note || '',
        Recorded_By: 'Accountant',
        Advance_Deduction: parseFloat(data.advanceDeduction) || 0,
        New_Advance_Given: parseFloat(data.newAdvanceGiven) || 0,
      }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('getSalaryRecords', async (_, params) => {
    try {
      const { getSalaryRecords } = require('./db/globals');
      return await dataLayer.read(() => getSalaryRecords(params?.townName), async () => { const all = await onlineDb.getAll('salary_payments'); const tn = params?.townName; return tn ? (all || []).filter(r => r.Town_Name === tn) : (all || []); });
    } catch(e) { return { error: e.message }; }
  });

  // Employee DB (per-town)
  const employeeDB = new EmployeeDB(dbPath);
  employeeDB.initializeEmployeesSheet().catch(() => {});
  employeeDB.initializeAdvanceSalarySheet().catch(() => {});

  ipcMain.handle('getEmployeesV2', async (_, townName) => {
    try {
      return await dataLayer.read(() => employeeDB.getEmployees(townName), () => townName ? onlineDb.findMany('employees_v2', { Town_Name: townName }) : onlineDb.getAll('employees_v2'));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('addEmployeeV2', async (_, data) => {
    try {
      const name = data.name || data.Name || data.Employee_Name || '';
      const cnic = data.cnic || data.CNIC || '';
      const phone = data.phone || data.Phone || data.Phone_Number || '';
      const townName = data.townName || data.Town_Name || '';
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
      }));
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
      return await syncOnline(() => ({ success: true }), () => onlineDb.updateWhere('employees_v2', { Employee_ID: String(employeeId) }, onlineUpdates));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('addAdvanceSalary', async (_, data) => {
    try {
      return await syncOnline(() => employeeDB.addAdvanceSalary(data), () => onlineDb.insert('advance_salaries', {
        Advance_ID: onlineDb.generateId(),
        Employee_Name: data.employeeName,
        Town_Name: data.townName,
        Amount: parseFloat(data.totalAmount) || 0,
        Date: new Date().toISOString().split('T')[0],
        Status: 'Active',
        Notes: data.advanceType === 'installment' ? `Installments: ${data.totalInstallments}, Monthly: ${data.monthlyDeduction}` : 'Lump Sum',
      }));
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('getAdvanceSalaries', async (_, { townName, employeeName }) => {
    try {
      return await dataLayer.read(() => employeeDB.getAdvanceSalaries(townName, employeeName), async () => { const match = {}; if (townName) match.Town_Name = townName; if (employeeName) match.Employee_Name = employeeName; return await onlineDb.findMany('advance_salaries', match); });
    } catch(e) { return { error: e.message }; }
  });
  ipcMain.handle('updateAdvanceSalary', async (_, advanceId) => {
    try {
      await employeeDB.updateAdvanceSalary(advanceId);
      return await syncOnline(() => ({ success: true }), () => onlineDb.updateWhere('advance_salaries', { Advance_ID: advanceId }, { Status: 'Paid' }));
    } catch(e) { return { error: e.message }; }
  });

  // ─── Salary Increase Appeal ────────────────────────────────────────────────
  ipcMain.handle('submitSalaryIncreaseAppeal', async (_, { employeeName, employeeId, currentSalary, proposedSalary, reason, townName, requestedByUserId }) => {
    try {
      const supabase = require('./db/supabase');
      const { data, error } = await supabase.from('appeals').insert([{
        appeal_type: 'salary_increase',
        status: 'pending',
        reason,
        requested_data: {
          employeeName,
          employeeId,
          townName,
          currentSalary,
          proposedSalary,
        },
        requested_by_user_id: requestedByUserId || null,
        created_at: new Date().toISOString(),
      }]).select().single();
      if (error) throw error;
      return { success: true, id: data?.id };
    } catch(e) { return { error: e.message }; }
  });

  // ─── Delete Employee and Appeal ───────────────────────────────────────────
  ipcMain.handle('deleteEmployeeV2', async (_, { employeeId, townName }) => {
    try {
      assertPermanentDeleteAllowed();
      await employeeDB.updateEmployee(employeeId, { status: 'Deleted' });
      return await syncOnline(() => ({ success: true }), () => onlineDb.updateWhere('employees_v2', { Employee_ID: String(employeeId) }, { Status: 'Deleted' }));
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('submitDeleteEmployeeAppeal', async (_, { employeeId, employeeName, designation, townName, requestedByUserId, otpCode }) => {
    try {
      const supabase = require('./db/supabase');
      const { data, error } = await supabase.from('appeals').insert([{
        appeal_type: 'delete_employee',
        entity_type: 'employee',
        entity_id: String(employeeId),
        status: 'pending',
        reason: `Delete employee: ${employeeName} (${designation || 'Employee'})`,
        requested_data: {
          employeeId,
          employeeName,
          designation,
          townName,
        },
        requested_by_user_id: requestedByUserId || null,
        requested_by_role: 'accountant',
        otp_code: otpCode || null,
        created_at: new Date().toISOString(),
      }]).select().single();
      if (error) throw error;
      return { success: true, id: data?.id };
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
  ipcMain.handle('create-accountant', async (_, { fullName, email, password }) => {
    try {
      if (!fullName || !email || !password) throw new Error('Name, email and password are required');
      const supabase = require('./db/supabase');
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'accountant' } },
      });
      if (authError) throw authError;
      const { error: profileError } = await supabase.from('users').insert([{
        id: authData.user.id,
        email,
        full_name: fullName,
        role: 'accountant',
        is_active: true,
      }]);
      if (profileError) throw profileError;
      return { success: true, userId: authData.user.id };
    } catch (e) {
      return { error: e.message };
    }
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
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT \'available\';',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.users(id);',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS sale_id UUID;',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS installment_active BOOLEAN DEFAULT FALSE;',
    'ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS property_category VARCHAR(20) DEFAULT \'Residential\';',
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
    // Realtime publication: ensure tables broadcast changes (safe idempotent add)
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = \'supabase_realtime\' AND tablename = \'appeals\' AND schemaname = \'public\') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.appeals; END IF; END $$;',
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = \'supabase_realtime\' AND tablename = \'commissions\' AND schemaname = \'public\') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.commissions; END IF; END $$;',
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = \'supabase_realtime\' AND tablename = \'installments\' AND schemaname = \'public\') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.installments; END IF; END $$;',
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
      const data = rows
        .map((c) => ({
          ...c,
          id: c.Commission_ID || c.id,
          commission_amount: c.Commission_Amount || c.commission_amount,
          agent_name: c.Agent_Name || c.agent_name,
          agent_email: c.Agent_Email || c.agent_email || '',
          status: String(c.Status || c.status || 'pending').toLowerCase(),
        }))
        .filter((c) => !filter?.status || c.status === String(filter.status).toLowerCase());
      return { data };
    }
    catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('mark-commission-paid', async (_, commissionId) => {
    try {
      if (!isNonEmpty(commissionId)) throw new Error('Commission ID is required');
      const { readExcelFile, updateExcelRow, getGlobalsPath } = require('./db/core');
      const commissionPath = path.join(getGlobalsPath(), 'Commissions.xlsx');
      const rows = await readExcelFile(commissionPath, 'Data');
      const row = (rows || []).find((c) => String(c.Commission_ID || c.id) === String(commissionId));
      if (row?._rowNumber) {
        await updateExcelRow(commissionPath, 'Data', row._rowNumber, {
          Status: 'paid',
          Paid_Date: new Date().toISOString().split('T')[0],
        });
        scheduleQueuedFileUpload();
      }
      return { success: true };
    } catch (e) { return { error: e.message }; }
  });

  // ─── Pending Collections ──────────────────────────────────────
  ipcMain.handle('get-pending-collections', async (_, agentName) => {
    try {
      const rows = await getAllSales();
      const data = (rows || [])
        .map((r) => ({
          ...r,
          id: r.Sale_ID || `${r.Type}|${r.Plot_Shop_Number}|${r.Town_Name}`,
          Received_Amount: parseFloat(r.Received_Amount || r.Advance_Amount_PKR) || 0,
          Remaining_Amount: parseFloat(r.Remaining_Amount) || Math.max(0, (parseFloat(r.Total_Amount_PKR) || 0) - (parseFloat(r.Received_Amount || r.Advance_Amount_PKR) || 0)),
        }))
        .filter((r) => (parseFloat(r.Remaining_Amount) || 0) > 0)
        .filter((r) => !agentName || String(r.Agent_Name || '').trim().toLowerCase() === String(agentName).trim().toLowerCase());
      return { data };
    }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('record-pending-collection', async (_, { saleId, amount, paymentMethod, notes, type, plotShopNumber, townName, customerName, agentName, totalAmount, currentReceived }) => {
    try {
      const result = await syncOnline(
        () => recordCollectionPaymentLocal({ type, plotShopNumber, townName, amount }),
        () => onlineDb.recordCollectionPayment(saleId, amount, paymentMethod, notes)
      );
      return { success: true, ...result };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-collection-history', async (_, saleId) => {
    try { return { data: [] }; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('deliver-file-after-payment', async (_, saleId) => {
    try {
      const rows = await getAllSales();
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
        () => Promise.resolve({ success: true })
      );
      return { success: true, ...result };
    }
    catch (e) { return { error: e.message }; }
  });

  // ─── Desktop Notifications ─────────────────────────────────────
  ipcMain.handle('show-notification', (_, { title, body, silent }) => {
    return showDesktopNotification({ title, body, silent });
  });

  ipcMain.on('show-notification-fire', (_, { title, body }) => {
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
}

module.exports = { registerIpcHandlers };
