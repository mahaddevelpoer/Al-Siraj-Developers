const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStartupPanel: () => ipcRenderer.invoke('get-startup-panel'),
  getWindowMeta: () => ipcRenderer.invoke('get-window-meta'),
  openPanelWindow: (panel) => ipcRenderer.invoke('open-panel-window', panel),
  returnToLauncher: () => ipcRenderer.invoke('return-to-launcher'),
  getTowns: () => ipcRenderer.invoke('get-towns'),
  addTown: (data) => ipcRenderer.invoke('add-town', data),
  updateTown: (townName, data) => ipcRenderer.invoke('update-town', townName, data),
  deleteTown: (townName) => ipcRenderer.invoke('delete-town', townName),
  getTownDetails: (townName) => ipcRenderer.invoke('get-town-details', townName),
  getTownPrices: (townName) => ipcRenderer.invoke('get-town-prices', townName),
  setTownPrices: (townName, prices) => ipcRenderer.invoke('set-town-prices', townName, prices),
  addPlot: (data) => ipcRenderer.invoke('add-plot', data),
  addShop: (data) => ipcRenderer.invoke('add-shop', data),
  getPlot: (n, t) => ipcRenderer.invoke('get-plot', n, t),
  getShop: (n, t) => ipcRenderer.invoke('get-shop', n, t),
  getAllPlots: (t) => ipcRenderer.invoke('get-all-plots', t),
  getAllShops: (t) => ipcRenderer.invoke('get-all-shops', t),
  getAllProperties: () => ipcRenderer.invoke('get-all-properties'),
  getTownMapShapes: (townName) => ipcRenderer.invoke('get-town-map-shapes', townName),
  saveTownMapShapes: (params) => ipcRenderer.invoke('save-town-map-shapes', params),
  deleteTownMapShape: (shapeId) => ipcRenderer.invoke('delete-town-map-shape', shapeId),
  sellProperty: (data) => ipcRenderer.invoke('sell-property', data),
  getSoldProperties: () => ipcRenderer.invoke('get-sold-properties'),
  updateFileStatus: (params) => ipcRenderer.invoke('updateFileStatus', params),
  getDailyEntries: (params) => ipcRenderer.invoke('getDailyEntries', params),
  addDailyEntry: (params) => ipcRenderer.invoke('addDailyEntry', params),
  deleteDailyEntry: (params) => ipcRenderer.invoke('deleteDailyEntry', params),
  getAllSales: () => ipcRenderer.invoke('get-all-sales'),
  cancelDeal: (data) => ipcRenderer.invoke('cancel-deal', data),
  getInstallments: () => ipcRenderer.invoke('get-installments'),
  getDueInstallments: () => ipcRenderer.invoke('get-due-installments'),
  getInstallmentProperties: (townName) => ipcRenderer.invoke('getInstallmentProperties', townName),
  getPropertyInstallments: (propertyId) => ipcRenderer.invoke('getPropertyInstallments', propertyId),
  markInstallmentPaid: (data) => ipcRenderer.invoke('mark-installment-paid', data),
  extendInstallmentDate: (data) => ipcRenderer.invoke('extend-installment-date', data),
  resellProperty: (data) => ipcRenderer.invoke('resell-property', data),
  getResellHistory: () => ipcRenderer.invoke('get-resell-history'),
  addExpense: (data) => ipcRenderer.invoke('add-expense', data),
  getExpenses: (t) => ipcRenderer.invoke('get-expenses', t),
  getAllExpenses: () => ipcRenderer.invoke('get-all-expenses'),
  getCeoExpenses: () => ipcRenderer.invoke('get-ceo-expenses'),
  addCeoExpense: (data) => ipcRenderer.invoke('add-ceo-expense', data),
  deleteCeoExpense: (id) => ipcRenderer.invoke('delete-ceo-expense', id),
  editCeoExpense: (data) => ipcRenderer.invoke('edit-ceo-expense', data),
  getCeoSalary: () => ipcRenderer.invoke('get-ceo-salary'),
  addCeoSalary: (data) => ipcRenderer.invoke('add-ceo-salary', data),
  deleteCeoSalary: (id) => ipcRenderer.invoke('delete-ceo-salary', id),
  addEmployee: (data) => ipcRenderer.invoke('add-employee', data),
  getEmployees: () => ipcRenderer.invoke('get-employees'),
  deleteEmployee: (id) => ipcRenderer.invoke('delete-employee', id),
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  localAccountantLogin: (params) => ipcRenderer.invoke('local-accountant-login', params),
  unlockLocalAccountant: (params) => ipcRenderer.invoke('unlock-local-accountant', params),
  cacheLocalAccountant: (params) => ipcRenderer.invoke('cache-local-accountant', params),
  getLocalAccountantsFile: () => ipcRenderer.invoke('get-local-accountants-file'),
  openLocalAccountantsFile: () => ipcRenderer.invoke('open-local-accountants-file'),
  getNotifications: () => ipcRenderer.invoke('get-notifications'),
  dismissNotification: (id) => ipcRenderer.invoke('dismiss-notification', id),
  triggerBackup: () => ipcRenderer.invoke('trigger-backup'),
  getProfitLossReport: () => ipcRenderer.invoke('get-profit-loss-report'),
  generateReceiptNumber: (townName) => ipcRenderer.invoke('generate-receipt-number', townName),
  getTownPerformance: (townName) => ipcRenderer.invoke('get-town-performance', townName),
  getTownLedgerReport: (params) => ipcRenderer.invoke('get-town-ledger-report', params),
  exportTownLedgerReport: (params) => ipcRenderer.invoke('export-town-ledger-report', params),
  exportAccountLedgerReport: (params) => ipcRenderer.invoke('export-account-ledger-report', params),
  getDueInstallmentsReport: (params) => ipcRenderer.invoke('get-due-installments-report', params),
  exportDueInstallmentsReport: (params) => ipcRenderer.invoke('export-due-installments-report', params),
  getMediaLibrary: (params) => ipcRenderer.invoke('get-media-library', params),
  exportReceiptArchivePdf: (params) => ipcRenderer.invoke('export-receipt-archive-pdf', params),
  openReportFile: (filePath) => ipcRenderer.invoke('open-report-file', filePath),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  getDevConfig: () => ipcRenderer.invoke('get-dev-config'),
  searchLocation: (query) => ipcRenderer.invoke('searchLocation', query),
  verifyCeoPassword: (password) => ipcRenderer.invoke('verify-ceo-password', password),
  recordSalaryPayment: (data) => ipcRenderer.invoke('recordSalaryPayment', data),
  getSalaryRecords: (params) => ipcRenderer.invoke('getSalaryRecords', params),
  // Employee DB (per-town) — V2
  getEmployeesV2: (townName) => ipcRenderer.invoke('getEmployeesV2', townName),
  addEmployeeV2: (data) => ipcRenderer.invoke('addEmployeeV2', data),
  updateEmployeeV2: (params) => ipcRenderer.invoke('updateEmployeeV2', params),
  addAdvanceSalary: (data) => ipcRenderer.invoke('addAdvanceSalary', data),
  getAdvanceSalaries: (params) => ipcRenderer.invoke('getAdvanceSalaries', params),
  updateAdvanceSalary: (id) => ipcRenderer.invoke('updateAdvanceSalary', id),
  // Logo management
  getLogoDataUrl: () => ipcRenderer.invoke('get-logo-data-url'),
  selectLogoImage: () => ipcRenderer.invoke('select-logo-image'),
  removeLogoImage: () => ipcRenderer.invoke('remove-logo-image'),
  // Resend Email — Send OTP to CEO
  sendOtpEmail: (params) => ipcRenderer.invoke('sendOtpEmail', params),
  // Resend Email — Installment Plan OTP to CEO
  sendInstallmentOtpEmail: (params) => ipcRenderer.invoke('sendInstallmentOtpEmail', params),
  // Resend Email — Date Change OTP to CEO
  sendDateChangeOtpEmail: (params) => ipcRenderer.invoke('sendDateChangeOtpEmail', params),
  // Resend Email — Sale notification
  sendSaleEmail: (params) => ipcRenderer.invoke('sendSaleEmail', params),
  // Resend Email — File delivery notification
  sendFileDeliveryEmail: (params) => ipcRenderer.invoke('sendFileDeliveryEmail', params),
  // Resend Email — Test configuration
  testResendEmail: () => ipcRenderer.invoke('testResendEmail'),
  // Sync warning callback (idempotent: avoid duplicate listeners)
  onSyncWarning: (callback) => {
    try { ipcRenderer.removeAllListeners('sync-warning'); } catch {}
    ipcRenderer.on('sync-warning', (_, msg) => callback(msg));
  },
  // File tamper alert callback (idempotent)
  onFileTamperAlert: (callback) => {
    try { ipcRenderer.removeAllListeners('file-tamper-alert'); } catch {}
    ipcRenderer.on('file-tamper-alert', (_, data) => callback(data));
  },
  resolveTamperLock: (params) => ipcRenderer.invoke('resolve-tamper-lock', params),
  // CEO — Create Accountant
  createAccountant: (params) => ipcRenderer.invoke('create-accountant', params),
  getTownAgents: (townName) => ipcRenderer.invoke('get-town-agents', townName),
  addTownAgent: (data) => ipcRenderer.invoke('add-town-agent', data),
  getInvestors: (townName) => ipcRenderer.invoke('get-investors', townName),
  addInvestor: (data) => ipcRenderer.invoke('add-investor', data),
  recordInvestorTransaction: (data) => ipcRenderer.invoke('record-investor-transaction', data),
  getInvestorTransactions: (params) => ipcRenderer.invoke('get-investor-transactions', params),
  getReceiptArchive: (params) => ipcRenderer.invoke('get-receipt-archive', params),
  saveDailyReceiptArchive: (params) => ipcRenderer.invoke('save-daily-receipt-archive', params),
  getConstructionProjects: (townName) => ipcRenderer.invoke('get-construction-projects', townName),
  addConstructionProject: (data) => ipcRenderer.invoke('add-construction-project', data),
  recordConstructionPayment: (data) => ipcRenderer.invoke('record-construction-payment', data),
  getConstructionPayments: (townName) => ipcRenderer.invoke('get-construction-payments', townName),
  cleanupLegacyAgentData: () => ipcRenderer.invoke('cleanup-legacy-agent-data'),
  deleteEmployeeV2: (params) => ipcRenderer.invoke('deleteEmployeeV2', params),
  sendDeleteEmployeeOtpEmail: (params) => ipcRenderer.invoke('sendDeleteEmployeeOtpEmail', params),
  // Resend Email — Backdated/Future Daily Entry OTP to CEO
  sendDailyEntryOtpEmail: (params) => ipcRenderer.invoke('sendDailyEntryOtpEmail', params),
  sendDailyEntryRejectionEmail: (params) => ipcRenderer.invoke('sendDailyEntryRejectionEmail', params),
  // Database setup
  getSetupSql: () => ipcRenderer.invoke('get-setup-sql'),
  setupAgentDb: () => ipcRenderer.invoke('setup-agent-db'),
  factoryReset: () => ipcRenderer.invoke('factory-reset'),
  // Agent Property Access
  getAgentPropertyAccess: (agentId) => ipcRenderer.invoke('get-agent-property-access', agentId),
  setAgentPropertyAccess: (params) => ipcRenderer.invoke('set-agent-property-access', params),
  // Commissions
  getCommissions: (filter) => ipcRenderer.invoke('get-commissions', filter),
  markCommissionPaid: (id) => ipcRenderer.invoke('mark-commission-paid', id),
  // Realtime new appeal event (main process → renderer)
  onNewAppeal: (callback) => {
    try { ipcRenderer.removeAllListeners('realtime-new-appeal'); } catch {}
    ipcRenderer.on('realtime-new-appeal', (_, data) => callback(data));
  },
  // Pending Collections
  getPendingCollections: (agentName) => ipcRenderer.invoke('get-pending-collections', agentName),
  recordPendingCollection: (params) => ipcRenderer.invoke('record-pending-collection', params),
  getCollectionHistory: (saleId) => ipcRenderer.invoke('get-collection-history', saleId),
  deliverFileAfterPayment: (saleId) => ipcRenderer.invoke('deliver-file-after-payment', saleId),
  // Desktop Notifications (fire-and-forget even when app minimized)
  showNotification: (title, body) => ipcRenderer.send('show-notification-fire', { title, body }),
  // Sync
  configureFileSyncContext: (context) => ipcRenderer.invoke('configure-file-sync-context', context),
  syncFromCloud: () => ipcRenderer.invoke('sync-from-cloud'),
  syncToCloud: () => ipcRenderer.invoke('sync-to-cloud'),
  getPendingSyncStatus: () => ipcRenderer.invoke('get-pending-sync-status'),
  runBusinessAudit: () => ipcRenderer.invoke('run-business-audit'),
  runHandoverAudit: () => ipcRenderer.invoke('run-handover-audit'),
  getPaymentAccounts: (townName) => ipcRenderer.invoke('get-payment-accounts', townName),
  addBankAccount: (data) => ipcRenderer.invoke('add-bank-account', data),
  updateBankAccount: (params) => ipcRenderer.invoke('update-bank-account', params),
  generateDailyTownReceipts: (date) => ipcRenderer.invoke('generate-daily-town-receipts', date),
  getDailyReportSettings: () => ipcRenderer.invoke('get-daily-report-settings'),
  saveDailyReportSettings: (data) => ipcRenderer.invoke('save-daily-report-settings', data),
  getDailyReports: (townName) => ipcRenderer.invoke('get-daily-reports', townName),
  exportDailyReport: (reportId) => ipcRenderer.invoke('export-daily-report', reportId),
  updateDailyReportSettings: (patch) => ipcRenderer.invoke('update-daily-report-settings', patch),
  resendDailyReportToCeo: (params) => ipcRenderer.invoke('resend-daily-report-to-ceo', params),
  onSyncProgress: (callback) => {
    try { ipcRenderer.removeAllListeners('sync-progress'); } catch {}
    ipcRenderer.on('sync-progress', (_, data) => callback(data.percent, data.msg));
  },
  removeSyncProgress: () => {
    try { ipcRenderer.removeAllListeners('sync-progress'); } catch {}
  },
  onCloudRefreshProgress: (callback) => {
    try { ipcRenderer.removeAllListeners('cloud-refresh-progress'); } catch {}
    ipcRenderer.on('cloud-refresh-progress', (_, data) => callback(data));
  },
  removeCloudRefreshProgress: () => {
    try { ipcRenderer.removeAllListeners('cloud-refresh-progress'); } catch {}
  },
  onCloudDataRefreshed: (callback) => {
    try { ipcRenderer.removeAllListeners('cloud-data-refreshed'); } catch {}
    ipcRenderer.on('cloud-data-refreshed', (_, data) => callback(data));
  },
  removeCloudDataRefreshed: () => {
    try { ipcRenderer.removeAllListeners('cloud-data-refreshed'); } catch {}
  },
  onBusinessDataChanged: (callback) => {
    try { ipcRenderer.removeAllListeners('business-data-changed'); } catch {}
    ipcRenderer.on('business-data-changed', (_, data) => callback(data));
  },
  removeBusinessDataChanged: () => {
    try { ipcRenderer.removeAllListeners('business-data-changed'); } catch {}
  },
  onSyncToCloudProgress: (callback) => {
    try { ipcRenderer.removeAllListeners('sync-progress-to-cloud'); } catch {}
    ipcRenderer.on('sync-progress-to-cloud', (_, data) => callback(data.percent, data.msg));
  },
  removeSyncToCloudProgress: () => {
    try { ipcRenderer.removeAllListeners('sync-progress-to-cloud'); } catch {}
  },
  // File sync (Storage upload/download)
  syncFilesUpload: () => ipcRenderer.invoke('sync-files-upload'),
  syncFilesDownload: () => ipcRenderer.invoke('sync-files-download'),
  onSyncFileProgress: (callback) => {
    try { ipcRenderer.removeAllListeners('sync-file-progress'); } catch {}
    ipcRenderer.on('sync-file-progress', (_, data) => callback(data.filePath));
  },
  removeSyncFileProgress: () => {
    try { ipcRenderer.removeAllListeners('sync-file-progress'); } catch {}
  },
  // Appeals IPC route
  getAppeals: (filter) => ipcRenderer.invoke('get-appeals', filter),
  getAppealById: (id) => ipcRenderer.invoke('get-appeal-by-id', id),
  getPendingAppealsCount: () => ipcRenderer.invoke('get-pending-appeals-count'),
});
