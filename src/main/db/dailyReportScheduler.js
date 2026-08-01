/**
 * Daily Report Scheduler — Runs at 8PM (20:00) every day
 * Generates daily town summary report and sends FCM push notification to CEO
 */

const { showDesktopNotification } = require('../notificationService');

let scheduledTimer = null;

function getReportTime() {
  const { readDailyReportSettings } = require('./dailyReportSettings');
  try {
    const settings = readDailyReportSettings();
    // settings.reportTime is in "HH:MM" format, e.g. "20:00"
    return settings.reportTime || '20:00';
  } catch {
    return '20:00';
  }
}

function calculateNextRunTime() {
  const timeStr = getReportTime();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  // If 8PM already passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function normalizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return val.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0];
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return s;
}

function generateTownSummary(towns, sales, expenses, entries, ledger, reportDate) {
  const summaries = [];
  const todayStr = normalizeDate(reportDate || new Date());

  for (const town of towns) {
    const townName = town.Town_Name;
    const townSalesToday = (sales || []).filter(s => 
      String(s.Town_Name || '').trim().toLowerCase() === String(townName).trim().toLowerCase() && 
      normalizeDate(s.Sell_Date || s.date || s.Date) === todayStr
    );
    const townEntriesToday = (entries || []).filter(e => 
      String(e.Town_Name || e.townName || '').trim().toLowerCase() === String(townName).trim().toLowerCase() && 
      normalizeDate(e.Date || e.date) === todayStr
    );
    const townLedgerToday = (ledger || []).filter(r => 
      String(r.Town_Name || r.town_name || '').trim().toLowerCase() === String(townName).trim().toLowerCase() && 
      normalizeDate(r.Date || r.date) === todayStr &&
      String(r.Status || 'approved').toLowerCase() === 'approved'
    );

    const totalReceived = townLedgerToday
      .filter(r => String(r.Direction || '').toLowerCase() === 'income')
      .reduce((sum, r) => sum + (parseFloat(r.Amount) || 0), 0);
      
    const totalExpenses = townLedgerToday
      .filter(r => String(r.Direction || '').toLowerCase() === 'expense')
      .reduce((sum, r) => sum + (parseFloat(r.Amount) || 0), 0);
      
    const dailyEntries = townEntriesToday.reduce((sum, e) => sum + (parseFloat(e.Amount) || 0), 0);
    const propertiesSold = townSalesToday.filter(s => String(s.Status || '').toLowerCase() === 'sold').length;

    summaries.push({
      townName,
      propertiesSold,
      totalReceived: Math.round(totalReceived),
      totalExpenses: Math.round(totalExpenses),
      dailyEntries: Math.round(dailyEntries),
      net: Math.round(totalReceived - totalExpenses),
    });
  }
  return summaries;
}

async function runDailyReport(dbPath, mainWindow) {
  console.log('[daily-report] Running daily report...');
  try {
    const { getTowns } = require('./towns');
    const { getAllSales } = require('./properties');
    const { getAllExpenses } = require('./globals');
    const { getAllEntries } = require('./dailyEntries');
    const { getMoneyLedger } = require('./moneyLedger');
    const supabase = require('./supabase');

    const towns = await getTowns();
    const sales = await getAllSales();
    const expenses = await getAllExpenses();
    const entries = await getAllEntries();
    const ledger = await getMoneyLedger().catch(() => []);

    const reportDate = new Date().toISOString().slice(0, 10);
    const summaries = generateTownSummary(towns, sales, expenses, entries, ledger, reportDate);

    // Build notification message and Save Daily Reports Locally (triggers sync)
    let message = '';
    const { saveDailyReportLocally } = require('./dailyReports');
    const onlineDb = require('./online');
    const { syncOnline } = require('./syncHelpers');
    
    for (const s of summaries) {
      message += `\n${s.townName}: ${s.propertiesSold} sold | PKR ${s.net.toLocaleString()} net`;
      
      // Dual-write snapshot
      const reportPayload = {
        Report_ID: `EOD-${s.townName}-${reportDate}`.replace(/[^a-zA-Z0-9-]/g, ''),
        Town_Name: s.townName,
        Date: reportDate,
        Generated_At: new Date().toISOString(),
        Total_Received: s.totalReceived,
        Total_Expenses: s.totalExpenses,
        Daily_Entries: s.dailyEntries,
        Net_Balance: s.net,
        Properties_Sold: s.propertiesSold,
        Report_Data: s,
      };

      await syncOnline(
        () => saveDailyReportLocally(reportPayload),
        (localReport) => onlineDb.insert('daily_reports', localReport),
        { tableName: 'daily_reports', operation: 'insert', payload: reportPayload, clientWriteId: reportPayload.Report_ID }
      ).catch(e => console.warn('[daily-report] Failed to save/sync report for', s.townName, e.message));
    }

    // Desktop notification
    showDesktopNotification({
      title: '📊 Daily Town Report',
      body: `End of day summary:\n${message}`,
    });

    // Send to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('daily-report-ready', {
        date: new Date().toISOString(),
        summaries,
      });
    }

    // Send FCM push to CEO mobile via Supabase Edge Function
    try {
      const { data: ceoUser } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'ceo')
        .eq('is_active', true)
        .single()
        .timeout(3000);
      if (ceoUser) {
        await supabase.functions.invoke('send-ceo-push', {
          body: {
            topic: 'ceo-alerts',
            title: '📊 Daily Town Report',
            body: summaries.map(s => `${s.townName}: PKR ${s.net.toLocaleString()} net`).join('\n'),
            data: {
              route: 'daily_report',
              type: 'daily_report',
              date: new Date().toISOString().slice(0, 10),
            },
          },
        });
      }
    } catch (e) {
      console.warn('[daily-report] FCM push failed:', e.message);
    }

    console.log('[daily-report] Daily report sent successfully');
    return { success: true, summaries };
  } catch (e) {
    console.error('[daily-report] Failed:', e);
    return { success: false, error: e.message };
  }
}

function startDailyReportScheduler(dbPath, mainWindow) {
  stopDailyReportScheduler();
  const nextRun = calculateNextRunTime();
  const delay = nextRun.getTime() - Date.now();

  console.log(`[daily-report] Scheduled for ${nextRun.toLocaleString()} (in ${Math.round(delay / 60000)} minutes)`);

  scheduledTimer = setTimeout(() => {
    runDailyReport(dbPath, mainWindow).finally(() => {
      // Re-schedule for tomorrow
      startDailyReportScheduler(dbPath, mainWindow);
    });
  }, Math.max(delay, 0));
}

function stopDailyReportScheduler() {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
  console.log('[daily-report] Scheduler stopped');
}

module.exports = {
  startDailyReportScheduler,
  stopDailyReportScheduler,
  runDailyReport,
  calculateNextRunTime,
};
