// ─── AL SIRAJ DEVELOPERS — i18n Translations ────────────────────────────────
// Excel files & user inputs remain English-only.
// Only UI labels / headings change per language.

export const LANGUAGES = [
  { code: 'en',    label: 'English',    dir: 'ltr' },
  { code: 'roman', label: 'Roman Urdu', dir: 'ltr' },
  { code: 'urdu',  label: 'اردو',       dir: 'rtl', font: "'Noto Nastaliq Urdu', serif" },
];

const en = {
  // Sidebar
  dashboard: 'Dashboard', addTown: 'Add Town', addProperty: 'Add Plot / Shop',
  ceoExpenses: 'CEO Expenses', manageEmployees: 'Manage Employees',
  soldProperties: 'Sold Properties', resellProperty: 'Resell Property',
  resellHistory: 'Resell History', installmentTracker: 'Installment Tracker',
  commissionTracker: 'Commission Tracker', profitLoss: 'Profit / Loss Report',
  manualBackup: 'Manual Backup', logout: 'Logout',
  ceoOptions: 'CEO Options', salesSystem: 'Sales System', sellProperty: 'Sell Property',

  // Dashboard
  dashboardOverview: 'Dashboard Overview',
  dashboardWelcome: 'Business data syncs across CEO & Employee windows in real time.',
  allTowns: 'All Towns', totalIncome: 'Total Income', totalExpenses: 'Total Expenses',
  commissionPaid: 'Commission Paid', netProfitLoss: 'Net Profit / Loss',
  plotsSold: 'Plots Sold', shopsSold: 'Shops Sold',
  actualCashReceived: 'Actual cash received', ceoEmployee: 'CEO + Employee',
  agentCommission: 'Agent commission', profitPosition: 'Profit position',
  lossPosition: 'Loss position', incomeVsExpenses: 'Income vs Expenses',
  townPerformance: 'Town Performance', distribution: 'Distribution',
  thisMonth: 'This Month', recentSales: 'Recent Sales', viewAll: 'View All',
  quickActions: 'Quick Actions', shortcuts: 'Shortcuts',
  addNewTown: 'Add New Town', addPlotShop: 'Add Plot / Shop',
  sellPropertyBtn: 'Sell Property', viewReports: 'View Reports',
  noSalesFound: 'No sales recorded yet.', noTownData: 'Add towns to see performance.',
  noFinancialData: 'No financial data yet.',

  // Table
  type: 'Type', propertyNo: 'Property #', town: 'Town', customer: 'Customer',
  amount: 'Amount', date: 'Date', agent: 'Agent', status: 'Status',

  // Notifications
  notifications: 'Notifications', noNotifications: 'No notifications',
  all: 'All', dueSoon: 'Due Soon', overdue: 'Overdue',
  viewAllNotifications: 'View All Notifications',

  // Installment Tracker
  paid: 'Paid', due: 'Due', upcoming: 'Upcoming',
  payInstallment: 'Pay', extendDate: 'Extend Date', newDueDate: 'New Due Date',
  confirmExtension: 'Confirm Extension', monthlyAmount: 'Monthly Amount',
  dueDate: 'Due Date', paidDate: 'Paid Date', actions: 'Actions',
  extendDueDateTitle: 'Extend Due Date', month: 'Month',

  // P&L
  totalReceived: 'Total Received (Income)', totalDeductions: 'Total Deductions',
  netCompanyPL: 'Net Company P / L', operationExpenses: 'Operation Expenses',
  ceoExpensesLabel: 'CEO Expenses', ceoSalary: 'CEO Salary',
  townWiseReport: 'Town-wise Profit / Loss Report', commission: 'Commission',
  profit: 'Profit', loss: 'Loss', profitable: 'Profitable', inLoss: 'In Loss',
  advancePaidInstallments: 'Advance + Paid Installments',

  // Common
  cancel: 'Cancel', confirm: 'Confirm', save: 'Save', delete: 'Delete',
  language: 'Language',

  // Town Prices & Add Property
  townPricesTitle: 'Town Prices Setup',
  townPricesDesc: 'Set per marla price for each town — for both road types and plots',
  selectTown: 'Select Town',
  customRoadName: 'Custom Road Name',
  perMarlaPrice: 'Per Marla Price (PKR)',
  savePrices: 'Save Prices',
  saving: 'Saving...',
  saved: 'Saved!',
  currentPriceSetup: 'Current Price Setup',
  category: 'Category',
  roadType: 'Road / Type',
  propertyType: 'Property Type',
  shopRoadTypeSelect: 'Select Shop Road Type',
  noPricesSetWarning: 'Prices are not set for this town. Set them in Town Prices section.',
  shopSizeMarla: 'Select Shop Size (Marla)',
  customSize: 'Custom Size (decimals allowed)',
  priceBreakdown: 'Price Breakdown',
  size: 'Size',
  plotMarlaPrice: 'Plot Per Marla Price',
  plotSizeMarla: 'Select Plot Size (Marla)',
  ownerNameOpt: 'Owner Name (Optional)',
  adding: 'Adding...',
  addPlotShopBtn: 'Add Property',
  noPropertyFound: 'No properties found',
  addPropertiesFirst: 'Add properties to see them here.',
  
  // Sell Flow auto-fetch
  propFound: 'Found:',
};

const roman = {
  dashboard: 'Dashboard', addTown: 'Town Shamil Karen', addProperty: 'Plot / Shop Shamil Karen',
  ceoExpenses: 'CEO Kharche', manageEmployees: 'Mulazim Manage Karen',
  soldProperties: 'Bechi Gayi Properties', resellProperty: 'Dobarah Bechen',
  resellHistory: 'Resell History', installmentTracker: 'Qist Tracker',
  commissionTracker: 'Commission Tracker', profitLoss: 'Nafa / Nuqsan Report',
  manualBackup: 'Backup Lein', logout: 'Bahar Jayen',
  ceoOptions: 'CEO Options', salesSystem: 'Sales System', sellProperty: 'Property Bechen',

  dashboardOverview: 'Dashboard Overview',
  dashboardWelcome: 'Business data CEO aur Employee dono windows mein sync hoti hai.',
  allTowns: 'Tamam Towns', totalIncome: 'Kul Amdani', totalExpenses: 'Kul Kharche',
  commissionPaid: 'Commission Di Gayi', netProfitLoss: 'Net Nafa / Nuqsan',
  plotsSold: 'Beche Gaye Plot', shopsSold: 'Beche Gaye Shop',
  actualCashReceived: 'Asli raqam hasil hui', ceoEmployee: 'CEO + Mulazim',
  agentCommission: 'Agent commission', profitPosition: 'Nafa ki halat',
  lossPosition: 'Nuqsan ki halat', incomeVsExpenses: 'Amdani banam Kharche',
  townPerformance: 'Town Performance', distribution: 'Taqseem',
  thisMonth: 'Is Mahine', recentSales: 'Haal Ki Sales', viewAll: 'Sab Dekhen',
  quickActions: 'Jaldi Actions', shortcuts: 'Shortcuts',
  addNewTown: 'Naya Town Shamil Karen', addPlotShop: 'Plot / Shop Shamil Karen',
  sellPropertyBtn: 'Property Bechen', viewReports: 'Reports Dekhen',
  noSalesFound: 'Abhi koi sale nahi.', noTownData: 'Town add karen performance dekhne ke liye.',
  noFinancialData: 'Koi financial data nahi.',

  type: 'Qisam', propertyNo: 'Property No.', town: 'Town', customer: 'Grahak',
  amount: 'Raqam', date: 'Tarikh', agent: 'Agent', status: 'Halat',

  notifications: 'Ittilaat', noNotifications: 'Koi ittilaa nahi',
  all: 'Sab', dueSoon: 'Jaldi Baqaya', overdue: 'Miati Guzar Gayi',
  viewAllNotifications: 'Tamam Ittilaat Dekhen',

  paid: 'Ada Shuda', due: 'Baqi', upcoming: 'Aane Wala',
  payInstallment: 'Ada Karen', extendDate: 'Tarikh Barhayen', newDueDate: 'Nayi Tarikh',
  confirmExtension: 'Theek Hai', monthlyAmount: 'Mahewar Raqam',
  dueDate: 'Waqt Parast', paidDate: 'Ada Hone Ki Tarikh', actions: 'Kaam',
  extendDueDateTitle: 'Tarikh Barhayen', month: 'Mahina',

  totalReceived: 'Kul Hasil Raqam', totalDeductions: 'Kul Katautian',
  netCompanyPL: 'Net Company Nafa / Nuqsan', operationExpenses: 'Operational Kharche',
  ceoExpensesLabel: 'CEO Kharche', ceoSalary: 'CEO Tankhwah',
  townWiseReport: 'Town Muta Nafa / Nuqsan Report', commission: 'Commission',
  profit: 'Nafa', loss: 'Nuqsan', profitable: 'Nafa Mand', inLoss: 'Nuqsan Mand',
  advancePaidInstallments: 'Advance + Di Gayi Qistain',

  cancel: 'Rok Den', confirm: 'Theek Hai', save: 'Mahfooz Karen', delete: 'Mita Den',
  language: 'Zaban',

  townPricesTitle: 'Town Prices Setup',
  townPricesDesc: 'Har town ka per marla price set karein — road type aur plot dono k liye',
  selectTown: 'Town Select Karein',
  customRoadName: 'Custom Road Ka Naam',
  perMarlaPrice: 'Per Marla Price (PKR)',
  savePrices: 'Prices Save Karein',
  saving: 'Save ho raha hai...',
  saved: 'Save ho gaya!',
  currentPriceSetup: 'Current Price Setup',
  category: 'Category',
  roadType: 'Road / Type',
  propertyType: 'Property Type',
  shopRoadTypeSelect: 'Shop Road Type Select Karein',
  noPricesSetWarning: 'Is town ki prices set nahi hain (Town Prices section mein set karein)',
  shopSizeMarla: 'Shop ka Size (Marla) Select Karein',
  customSize: 'Custom Size (decimal bhi ho sakta hai)',
  priceBreakdown: 'Price Breakdown',
  size: 'Size',
  plotMarlaPrice: 'Plot Per Marla Price',
  plotSizeMarla: 'Plot ka Size (Marla) Select Karein',
  ownerNameOpt: 'Owner Name (Optional)',
  adding: 'Add ho raha hai...',
  addPlotShopBtn: 'Add Karein',
  noPropertyFound: 'Koi property nahi mili',
  addPropertiesFirst: 'Properties add karein yahan dekhne k liye.',

  propFound: 'Mili:',
};

const urdu = {
  dashboard: 'ڈیش بورڈ', addTown: 'شہر شامل کریں', addProperty: 'پلاٹ / دکان شامل کریں',
  ceoExpenses: 'سی ای او اخراجات', manageEmployees: 'ملازمین کا انتظام',
  soldProperties: 'فروخت شدہ جائیداد', resellProperty: 'دوبارہ فروخت',
  resellHistory: 'دوبارہ فروخت تاریخ', installmentTracker: 'قسط ٹریکر',
  commissionTracker: 'کمیشن ٹریکر', profitLoss: 'نفع / نقصان رپورٹ',
  manualBackup: 'دستی بیک اپ', logout: 'باہر جائیں',
  ceoOptions: 'سی ای او اختیارات', salesSystem: 'سیلز سسٹم', sellProperty: 'جائیداد بیچیں',

  dashboardOverview: 'ڈیش بورڈ جائزہ',
  dashboardWelcome: 'کاروباری ڈیٹا سی ای او اور ملازم ونڈوز میں مطابقت پذیر ہے۔',
  allTowns: 'تمام شہر', totalIncome: 'کل آمدنی', totalExpenses: 'کل اخراجات',
  commissionPaid: 'ادا شدہ کمیشن', netProfitLoss: 'خالص نفع / نقصان',
  plotsSold: 'فروخت پلاٹ', shopsSold: 'فروخت دکانیں',
  actualCashReceived: 'اصل رقم موصول', ceoEmployee: 'سی ای او + ملازم',
  agentCommission: 'ایجنٹ کمیشن', profitPosition: 'نفع کی حالت',
  lossPosition: 'نقصان کی حالت', incomeVsExpenses: 'آمدنی بمقابلہ اخراجات',
  townPerformance: 'شہر کارکردگی', distribution: 'تقسیم',
  thisMonth: 'اس مہینے', recentSales: 'حالیہ فروخت', viewAll: 'سب دیکھیں',
  quickActions: 'فوری اقدامات', shortcuts: 'شارٹ کٹس',
  addNewTown: 'نیا شہر شامل کریں', addPlotShop: 'پلاٹ / دکان شامل کریں',
  sellPropertyBtn: 'جائیداد بیچیں', viewReports: 'رپورٹیں دیکھیں',
  noSalesFound: 'ابھی کوئی فروخت نہیں۔', noTownData: 'کارکردگی دیکھنے کے لیے شہر شامل کریں۔',
  noFinancialData: 'کوئی مالی ڈیٹا نہیں۔',

  type: 'قسم', propertyNo: 'نمبر', town: 'شہر', customer: 'گاہک',
  amount: 'رقم', date: 'تاریخ', agent: 'ایجنٹ', status: 'حالت',

  notifications: 'اطلاعات', noNotifications: 'کوئی اطلاع نہیں',
  all: 'سب', dueSoon: 'جلد واجب', overdue: 'میعاد گزر گئی',
  viewAllNotifications: 'تمام اطلاعات دیکھیں',

  paid: 'ادا شدہ', due: 'باقی', upcoming: 'آنے والی',
  payInstallment: 'ادا کریں', extendDate: 'تاریخ بڑھائیں', newDueDate: 'نئی تاریخ',
  confirmExtension: 'ٹھیک ہے', monthlyAmount: 'ماہانہ رقم',
  dueDate: 'واجب تاریخ', paidDate: 'ادائیگی تاریخ', actions: 'اقدامات',
  extendDueDateTitle: 'تاریخ بڑھائیں', month: 'مہینہ',

  totalReceived: 'کل موصول رقم', totalDeductions: 'کل کٹوتیاں',
  netCompanyPL: 'خالص نفع / نقصان', operationExpenses: 'آپریشنل اخراجات',
  ceoExpensesLabel: 'سی ای او اخراجات', ceoSalary: 'سی ای او تنخواہ',
  townWiseReport: 'شہر وار نفع / نقصان رپورٹ', commission: 'کمیشن',
  profit: 'نفع', loss: 'نقصان', profitable: 'نفع بخش', inLoss: 'نقصان میں',
  advancePaidInstallments: 'ایڈوانس + ادا شدہ اقساط',

  cancel: 'منسوخ', confirm: 'تصدیق', save: 'محفوظ کریں', delete: 'حذف کریں',
  language: 'زبان',

  townPricesTitle: 'شہر کی قیمتوں کا سیٹ اپ',
  townPricesDesc: 'ہر شہر کے لیے فی مرلہ قیمت مقرر کریں — سڑک کی اقسام اور پلاٹوں دونوں کے لیے',
  selectTown: 'شہر منتخب کریں',
  customRoadName: 'اپنی مرضی کی سڑک کا نام',
  perMarlaPrice: 'فی مرلہ قیمت (PKR)',
  savePrices: 'قیمتیں محفوظ کریں',
  saving: 'محفوظ ہو رہا ہے...',
  saved: 'محفوظ ہو گیا!',
  currentPriceSetup: 'موجودہ قیمتیں',
  category: 'زمرہ',
  roadType: 'سڑک / قسم',
  propertyType: 'پراپرٹی کی قسم',
  shopRoadTypeSelect: 'دکان کی سڑک کی قسم منتخب کریں',
  noPricesSetWarning: 'اس شہر کی قیمتیں مقرر نہیں ہیں۔ انہیں ٹاؤن پرائس سیکشن میں سیٹ کریں۔',
  shopSizeMarla: 'دکان کا سائز (مرلہ) منتخب کریں',
  customSize: 'اپنی مرضی کا سائز (اعشاریہ بھی شامل کر سکتے ہیں)',
  priceBreakdown: 'قیمت کی تفصیل',
  size: 'سائز',
  plotMarlaPrice: 'پلاٹ فی مرلہ قیمت',
  plotSizeMarla: 'پلاٹ کا سائز (مرلہ) منتخب کریں',
  ownerNameOpt: 'مالک کا نام (اختیاری)',
  adding: 'شامل ہو رہا ہے...',
  addPlotShopBtn: 'شامل کریں',
  noPropertyFound: 'کوئی پراپرٹی نہیں ملی',
  addPropertiesFirst: 'یہاں دیکھنے کے لیے پراپرٹیز شامل کریں۔',

  propFound: 'دستیاب:',
};

export const translations = { en, roman, urdu };
