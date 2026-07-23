const path = require('path');
const fs = require('fs');
const { getGlobalsPath, readExcelFile, writeExcelRow, ensureSheetColumns } = require('./core');

const AUDIT_SCHED_COLS = ['Schedule_ID','Town_Name','Scheduled_Date','Status'];
const LOCKER_AUDIT_COLS = ['Audit_ID','Town_Name','Audit_Date','System_Balance','Physical_Balance','Discrepancy','Audited_By','Audit_Report_JSON'];

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

async function getSystemLockerBalance(townName) {
  try {
    const summaryFp = path.join(getGlobalsPath(), 'Town_Financial_Summary.xlsx');
    if (fs.existsSync(summaryFp)) {
      const rows = await readExcelFile(summaryFp, 'Data');
      const row = rows.find(r => String(r.Town_Name || '').trim() === String(townName || '').trim());
      if (row) {
        return Number(row.Cash_Balance) || 0;
      }
    }
  } catch (e) {
    console.error('[locker-audits] Error reading cash balance:', e);
  }
  return 0;
}

async function generateAuditReport(townName) {
  const globalsPath = getGlobalsPath();
  const salesFp = path.join(globalsPath, 'All_Sales.xlsx');
  const expensesFp = path.join(globalsPath, 'All_Expenses.xlsx');
  const salariesFp = path.join(globalsPath, 'Salary_Records.xlsx');

  const report = {
    activeSalesCount: 0,
    expectedRevenue: 0,
    collectedAmount: 0,
    remainingRevenue: 0,
    recordedExpenses: 0,
    recordedSalaries: 0
  };

  try {
    // 1. Sales
    if (fs.existsSync(salesFp)) {
      const sales = await readExcelFile(salesFp, 'Data');
      const townSales = sales.filter(s => 
        String(s.Town_Name || '').trim() === String(townName || '').trim() &&
        String(s.Status || '').trim().toLowerCase() !== 'cancelled'
      );
      report.activeSalesCount = townSales.length;
      report.expectedRevenue = townSales.reduce((sum, s) => sum + (Number(s.Deal_Amount_PKR || s.Total_Amount_PKR) || 0), 0);
      report.collectedAmount = townSales.reduce((sum, s) => sum + (Number(s.Received_Amount) || 0), 0);
      report.remainingRevenue = townSales.reduce((sum, s) => sum + (Number(s.Remaining_Amount) || 0), 0);
    }

    // 2. Expenses
    if (fs.existsSync(expensesFp)) {
      const expenses = await readExcelFile(expensesFp, 'Data');
      const townExpenses = expenses.filter(e => 
        String(e.Town_Name || '').trim() === String(townName || '').trim()
      );
      report.recordedExpenses = townExpenses.reduce((sum, e) => sum + (Number(e.Amount_PKR || e.Amount) || 0), 0);
    }

    // 3. Salaries
    if (fs.existsSync(salariesFp)) {
      const salaries = await readExcelFile(salariesFp, 'Data');
      const townSalaries = salaries.filter(s => 
        String(s.Town_Name || '').trim() === String(townName || '').trim()
      );
      report.recordedSalaries = townSalaries.reduce((sum, s) => sum + (Number(s.Amount || s.Salary_Paid_Amount) || 0), 0);
    }
  } catch (err) {
    console.error('[locker-audits] Error generating report:', err);
  }

  return report;
}

async function getLockerAuditSchedule(townName) {
  const globalsPath = getGlobalsPath();
  const auditsFp = path.join(globalsPath, 'Locker_Audits.xlsx');
  const fp = path.join(globalsPath, 'Audit_Schedules.xlsx');
  const todayStr = getTodayStr();

  // Guard: If an audit was ALREADY completed today for this town, do not prompt again!
  if (fs.existsSync(auditsFp)) {
    try {
      const auditRows = await readExcelFile(auditsFp, 'Data');
      const doneToday = (auditRows || []).some(a => {
        const tMatch = String(a.Town_Name || a.town_name || '').trim().toLowerCase() === String(townName || '').trim().toLowerCase();
        const aDate = String(a.Audit_Date || a.audit_date || a.Created_At || a.created_at || '').slice(0, 10);
        return tMatch && aDate >= todayStr;
      });
      if (doneToday) return null;
    } catch (_) {}
  }

  if (!fs.existsSync(fp)) return null;

  try {
    const rows = await readExcelFile(fp, 'Data');
    
    // 1. Auto-expire past overdue pending schedules (scheduled_date < todayStr)
    const pastPending = (rows || []).filter(r => 
      String(r.Town_Name || '').trim().toLowerCase() === String(townName || '').trim().toLowerCase() &&
      String(r.Status || '').trim().toLowerCase() === 'pending' &&
      String(r.Scheduled_Date || '').slice(0, 10) < todayStr &&
      r._rowNumber
    );

    for (const p of pastPending) {
      try {
        await writeExcelRow(fp, 'Data', { ...p, Status: 'expired' }, 'Schedule_ID', p._rowNumber);
      } catch (_) {}
    }

    // 2. Find a pending schedule specifically for TODAY
    const schedule = (rows || []).find(r => 
      String(r.Town_Name || '').trim().toLowerCase() === String(townName || '').trim().toLowerCase() &&
      String(r.Status || '').trim().toLowerCase() === 'pending' &&
      String(r.Scheduled_Date || '').slice(0, 10) === todayStr
    );
    
    if (schedule) {
      const systemBalance = await getSystemLockerBalance(townName);
      const report = await generateAuditReport(townName);
      return {
        id: schedule.Schedule_ID,
        townName: schedule.Town_Name,
        scheduledDate: schedule.Scheduled_Date,
        status: schedule.Status,
        systemBalance,
        report
      };
    }
    
    return null;
  } catch (e) {
    console.error('[locker-audits] Error reading audit schedules:', e);
    return null;
  }
}

async function submitLockerAudit({ id, townName, auditDate, systemBalance, physicalBalance, discrepancy, auditedBy, report }) {
  const globalsPath = getGlobalsPath();
  const auditsFp = path.join(globalsPath, 'Locker_Audits.xlsx');
  const schedulesFp = path.join(globalsPath, 'Audit_Schedules.xlsx');
  const todayStr = getTodayStr();

  // 1. Write to Locker_Audits.xlsx
  await ensureSheetColumns(auditsFp, 'Data', LOCKER_AUDIT_COLS);
  const auditId = id || `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const auditRow = {
    Audit_ID: auditId,
    Town_Name: townName,
    Audit_Date: todayStr,
    System_Balance: Number(systemBalance) || 0,
    Physical_Balance: Number(physicalBalance) || 0,
    Discrepancy: Number(discrepancy) || 0,
    Audited_By: auditedBy || 'Accountant',
    Audit_Report_JSON: JSON.stringify(report || {})
  };
  await writeExcelRow(auditsFp, 'Data', auditRow, 'Audit_ID');

  // 2. Mark schedule as completed in Audit_Schedules.xlsx
  if (fs.existsSync(schedulesFp)) {
    try {
      await ensureSheetColumns(schedulesFp, 'Data', AUDIT_SCHED_COLS);
      const schedules = await readExcelFile(schedulesFp, 'Data');
      for (const s of (schedules || [])) {
        if (
          String(s.Town_Name || '').trim().toLowerCase() === String(townName || '').trim().toLowerCase() &&
          String(s.Status || '').trim().toLowerCase() === 'pending' &&
          String(s.Scheduled_Date || '').slice(0, 10) <= todayStr &&
          s._rowNumber
        ) {
          await writeExcelRow(schedulesFp, 'Data', { ...s, Status: 'completed' }, 'Schedule_ID', s._rowNumber);
        }
      }
    } catch (err) {
      console.error('[locker-audits] Error updating schedule status:', err);
    }
  }

  return { success: true, auditId };
}

module.exports = {
  getLockerAuditSchedule,
  submitLockerAudit
};
