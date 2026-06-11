# AL SIRAJ DEVELOPERS – Real Estate ERP System

## Overview
A fully offline Windows Desktop application for real estate business management built with Electron.js + React.

## Features
- **Admin/CEO Panel** — Full system control, dashboard, expenses, employees
- **Employee Panel** — Guided sell flow with auto-calculations
- **Excel-Based Storage** — Every plot/shop gets its own `.xlsx` file
- **Installment Tracker** — Due/overdue alerts with mark-paid & extend date
- **Auto Backup** — Every 24 hours to D:\ or E:\ (falls back to C:\)
- **Windows Installer** — Standard NSIS wizard-style setup.exe

## Project Structure
```
ZameenKhata/
├── src/
│   ├── main/                  ← Electron main process (Node.js)
│   │   ├── main.js            ← App entry, window creation
│   │   ├── preload.js         ← Secure IPC bridge
│   │   ├── ipc.js             ← All IPC handler registrations
│   │   └── db/
│   │       ├── core.js        ← Excel read/write engine (exceljs)
│   │       ├── properties.js  ← Plot/Shop CRUD + sell/resell logic
│   │       ├── towns.js       ← Town CRUD + CEO expense logic
│   │       ├── globals.js     ← Installments, employees, dashboard
│   │       └── backup.js      ← Auto backup scheduler
│   └── renderer/              ← React frontend
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css          ← Full design system
│       └── components/
│           ├── LoginScreen.jsx
│           ├── Sidebar.jsx
│           ├── Dashboard.jsx
│           ├── AddTown.jsx
│           ├── AddProperty.jsx
│           ├── CeoExpenses.jsx
│           ├── AddEmployee.jsx
│           ├── SellFlow.jsx
│           ├── ResellProperty.jsx
│           ├── SoldProperties.jsx
│           ├── InstallmentTracker.jsx
│           ├── ProfitLossReport.jsx
│           ├── ResellHistory.jsx
│           └── NotificationPanel.jsx
├── public/
│   └── logo.png
├── index.html
├── vite.config.js
├── package.json
├── SETUP.bat       ← Run this to build the installer
└── DEV_RUN.bat     ← Run this to launch in dev mode
```

## Excel Database Architecture
Data is stored in: `%APPDATA%\AL SIRAJ DEVELOPERS\ZameenKhata_Database\`

```
ZameenKhata_Database/
├── Properties/
│   ├── Plot_101_Lahore.xlsx
│   ├── Shop_12_Lahore.xlsx
│   └── ...
├── Towns/
│   ├── Lahore.xlsx
│   ├── RahimYarKhan.xlsx
│   └── ...
├── Global/
│   ├── All_Sales.xlsx
│   ├── All_Expenses.xlsx
│   ├── Installments_Tracker.xlsx
│   ├── CEO_Admin_Expenses.xlsx
│   ├── Resell_History.xlsx
│   ├── Notifications_Log.xlsx
│   ├── Profit_Loss_Report.xlsx
│   └── Employees.xlsx
└── backup_info.json
```

## How to Build (Step by Step)

### Step 1 – Install Node.js
Download and install from: https://nodejs.org/en/download (LTS version, 64-bit)

Or just **double-click `SETUP.bat`** — it will auto-download and install Node.js for you.

### Step 2 – Build the Installer
```
Double-click SETUP.bat
```
This will:
1. Install Node.js if missing
2. Run `npm install` (downloads all dependencies)
3. Run `npm run build` (creates setup.exe)
4. Output: `dist_electron\AL SIRAJ DEVELOPERS Setup 1.0.0.exe`

### Step 3 – Install the App
Run the generated `setup.exe` and follow the wizard:
- Choose install directory (default: Program Files)
- Creates Desktop shortcut
- Creates Start Menu entry
- Fully uninstallable via Control Panel → Programs

## Default Login
| Role | Access | PIN |
|------|--------|-----|
| Admin/CEO | Full system | **1234** |
| Employee | Sales only | No PIN |

## Business Rules Implemented
- **CEO Expense Limit**: Max 10% of town income. Red warning + notification if exceeded.
- **Installment Formula**: `(Total - Advance + Interest) ÷ Months`
- **Extension Rule**: Only the CURRENT installment due date is extended; future installments remain unchanged.
- **Receipt Number**: Mandatory manual entry on every sale and resell.
- **Resell**: Moves property to Resell_History.xlsx, removes from active sold list.

## Backup
- **Auto**: Every 24 hours on app startup check
- **Manual**: Sidebar → "Manual Backup" button  
- **Location**: `D:\TownEstate_Backup\` → `E:\` → `C:\` (fallback)
