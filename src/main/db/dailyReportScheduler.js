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

function generateTownSummary(towns, sales, expenses, entries) {
  const summaries = [];
  for (const town of towns) {
    const townName = town.Town_Name;
    const townSales = (sales || []).filter(s => s.Town_Name === townName);
    const townExpenses = (expenses || []).filter(e => e.Town_Name === townName);
    const townEntries = (entries || []).filter(e => String(e.Town_Name || e.townName) === townName);

    const totalReceived = townSales.reduce((sum, s) => sum + (parseFloat(s.Received_Amount) || 0), 0);
    const totalExpenses = townExpenses.reduce((sum, e) => sum + (parseFloat(e.Amount) || 0), 0);
    const dailyEntries = townEntries.reduce((sum, e) => sum + (parseFloat(e.Amount) || 0), 0);
    const propertiesSold = townSales.filter(s => String(s.Status || '').toLowerCase() === 'sold').length;

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
    const supabase = require('./db/supabase');

    const towns = await getTowns();
    const sales = await getAllSales();
    const expenses = await getAllExpenses();
    const entries = await getAllEntries();

    const summaries = generateTownSummary(towns, sales, expenses, entries);

    // Build notification message
    let message = '';
    for (const s of summaries) {
      message += `\n${s.townName}: ${s.propertiesSold} sold | PKR ${s.net.toLocaleString()} net`;
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
            title: '📊 Daily Town Report',
            body: summaries.map(s => `${s.townName}: PKR ${s.net.toLocaleString()} net`).join('\n'),
            data: { type: 'daily_report', date: new Date().toISOString().slice(0, 10) },
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
