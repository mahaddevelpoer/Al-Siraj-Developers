const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

class EmployeeDB {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.employeesFile = path.join(dbPath, 'Employees_V2.xlsx');
    this.advanceSalaryFile = path.join(dbPath, 'Advance_Salaries.xlsx');
  }

  // ── Ensure Employees file exists with correct headers ────────────────────
  async _ensureEmployeesFile() {
    if (fs.existsSync(this.employeesFile)) {
      // Verify it's a valid workbook
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(this.employeesFile);
        const ws = wb.getWorksheet('Employees');
        if (ws) return; // all good
      } catch { /* fall through to recreate */ }
    }
    // Create fresh
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.columns = [
      { header: 'ID',           key: 'id',           width: 10 },
      { header: 'Town_Name',    key: 'Town_Name',    width: 20 },
      { header: 'Name',         key: 'Name',         width: 20 },
      { header: 'Designation',  key: 'Designation',  width: 15 },
      { header: 'Phone',        key: 'Phone',        width: 15 },
      { header: 'CNIC',         key: 'CNIC',         width: 20 },
      { header: 'Base_Salary',  key: 'Base_Salary',  width: 12 },
      { header: 'Join_Date',    key: 'Join_Date',    width: 12 },
      { header: 'Status',       key: 'Status',       width: 10 },
    ];
    await workbook.xlsx.writeFile(this.employeesFile);
  }

  // ── Ensure Advance Salaries file exists ───────────────────────────────────
  async _ensureAdvanceFile() {
    if (fs.existsSync(this.advanceSalaryFile)) {
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(this.advanceSalaryFile);
        const ws = wb.getWorksheet('Advance_Salaries');
        if (ws) return;
      } catch { /* fall through */ }
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Advance_Salaries');
    sheet.columns = [
      { header: 'ID',                 key: 'id',                 width: 10 },
      { header: 'Town_Name',          key: 'Town_Name',          width: 20 },
      { header: 'Employee_Name',      key: 'Employee_Name',      width: 20 },
      { header: 'Advance_Type',       key: 'Advance_Type',       width: 15 },
      { header: 'Total_Amount',       key: 'Total_Amount',       width: 12 },
      { header: 'Total_Installments', key: 'Total_Installments', width: 12 },
      { header: 'Current_Installment',key: 'Current_Installment',width: 12 },
      { header: 'Monthly_Deduction',  key: 'Monthly_Deduction',  width: 12 },
      { header: 'Start_Date',         key: 'Start_Date',         width: 12 },
      { header: 'Status',             key: 'Status',             width: 10 },
    ];
    await workbook.xlsx.writeFile(this.advanceSalaryFile);
  }

  // ── Legacy init wrappers (keep compat) ────────────────────────────────────
  async initializeEmployeesSheet() { await this._ensureEmployeesFile(); }
  async initializeAdvanceSalarySheet() { await this._ensureAdvanceFile(); }

  // ── Get Employees ─────────────────────────────────────────────────────────
  async getEmployees(townName) {
    await this._ensureEmployeesFile();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.employeesFile);
    const sheet = workbook.getWorksheet('Employees');
    if (!sheet) return [];

    const employees = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const id = row.getCell(1).value;
      if (!id && id !== 0) return; // skip empty rows
      const rowTown = row.getCell(2).value;
      if (townName && String(rowTown).toLowerCase() !== String(townName).toLowerCase()) return;

      employees.push({
        id:          row.getCell(1).value,
        townName:    row.getCell(2).value,
        name:        row.getCell(3).value,
        designation: row.getCell(4).value,
        phone:       row.getCell(5).value,
        cnic:        row.getCell(6).value,
        baseSalary:  row.getCell(7).value,
        joinDate:    row.getCell(8).value,
        status:      row.getCell(9).value,
      });
    });

    return employees;
  }

  // ── Add Employee ──────────────────────────────────────────────────────────
  async addEmployee(data) {
    await this._ensureEmployeesFile();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.employeesFile);
    const sheet = workbook.getWorksheet('Employees');
    if (!sheet) throw new Error('Employees sheet not found');

    // Count real data rows (skip header) to compute ID
    let maxId = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = row.getCell(1).value;
      if (id && typeof id === 'number' && id > maxId) maxId = id;
    });
    const newId = maxId + 1;

    const row = sheet.addRow([
      newId,
      data.townName   || '',
      data.name        || '',
      data.designation || 'Employee',
      data.phone       || '',
      data.cnic        || '',
      parseFloat(data.baseSalary) || 0,
      new Date().toISOString().split('T')[0],
      'Active',
    ]);
    row.commit();

    await workbook.xlsx.writeFile(this.employeesFile);
    return { id: newId, success: true, ...data };
  }

  // ── Update Employee ───────────────────────────────────────────────────────
  async updateEmployee(employeeId, data) {
    await this._ensureEmployeesFile();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.employeesFile);
    const sheet = workbook.getWorksheet('Employees');
    if (!sheet) throw new Error('Employees sheet not found');

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.getCell(1).value === employeeId) {
        if (data.name        !== undefined) row.getCell(3).value = data.name;
        if (data.designation !== undefined) row.getCell(4).value = data.designation;
        if (data.phone       !== undefined) row.getCell(5).value = data.phone;
        if (data.cnic        !== undefined) row.getCell(6).value = data.cnic;
        if (data.baseSalary  !== undefined) row.getCell(7).value = parseFloat(data.baseSalary) || 0;
        if (data.status      !== undefined) row.getCell(9).value = data.status;
        row.commit();
      }
    });

    await workbook.xlsx.writeFile(this.employeesFile);
    return { success: true };
  }

  // ── Add Advance Salary ────────────────────────────────────────────────────
  async addAdvanceSalary(data) {
    await this._ensureAdvanceFile();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.advanceSalaryFile);
    const sheet = workbook.getWorksheet('Advance_Salaries');
    if (!sheet) throw new Error('Advance_Salaries sheet not found');

    let maxId = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = row.getCell(1).value;
      if (id && typeof id === 'number' && id > maxId) maxId = id;
    });
    const newId = maxId + 1;

    const monthlyDed = data.monthlyDeduction !== undefined
      ? data.monthlyDeduction
      : (data.advanceType === 'installment'
          ? Math.ceil(data.totalAmount / (data.totalInstallments || 1))
          : data.totalAmount);

    const row = sheet.addRow([
      newId,
      data.townName,
      data.employeeName,
      data.advanceType,
      data.totalAmount,
      data.advanceType === 'installment' ? (data.totalInstallments || 1) : 1,
      0,
      monthlyDed,
      new Date().toISOString().split('T')[0],
      'Active',
    ]);
    row.commit();

    await workbook.xlsx.writeFile(this.advanceSalaryFile);
    return { id: newId, success: true };
  }

  // ── Get Advance Salaries ──────────────────────────────────────────────────
  async getAdvanceSalaries(townName, employeeName) {
    await this._ensureAdvanceFile();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.advanceSalaryFile);
    const sheet = workbook.getWorksheet('Advance_Salaries');
    if (!sheet) return [];

    const advances = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = row.getCell(1).value;
      if (!id && id !== 0) return;
      if (townName    && row.getCell(2).value !== townName)    return;
      if (employeeName && row.getCell(3).value !== employeeName) return;
      if (row.getCell(10).value !== 'Active') return;

      advances.push({
        id:                  row.getCell(1).value,
        townName:            row.getCell(2).value,
        employeeName:        row.getCell(3).value,
        advanceType:         row.getCell(4).value,
        totalAmount:         row.getCell(5).value,
        totalInstallments:   row.getCell(6).value,
        currentInstallment:  row.getCell(7).value,
        monthlyDeduction:    row.getCell(8).value,
        startDate:           row.getCell(9).value,
        status:              row.getCell(10).value,
      });
    });

    return advances;
  }

  // ── Update Advance (mark installment paid) ────────────────────────────────
  async updateAdvanceSalary(advanceId) {
    await this._ensureAdvanceFile();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.advanceSalaryFile);
    const sheet = workbook.getWorksheet('Advance_Salaries');
    if (!sheet) return;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.getCell(1).value === advanceId) {
        const current = (row.getCell(7).value || 0) + 1;
        row.getCell(7).value = current;
        if (current >= (row.getCell(6).value || 1)) {
          row.getCell(10).value = 'Completed';
        }
        row.commit();
      }
    });

    await workbook.xlsx.writeFile(this.advanceSalaryFile);
  }
}

module.exports = EmployeeDB;
