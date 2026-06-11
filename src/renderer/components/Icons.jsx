import React from 'react';

// Reusable base: each icon renders an inline SVG
const I = ({ children, size = 16, color = 'currentColor', className = '', style = {}, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    {...props}
  >
    {children}
  </svg>
);

// ─── Chart Up ───
export const IconChartUp = (p) => <I {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></I>;

// ─── Hourglass / Loading ───
export const IconHourglass = (p) => <I {...p}><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></I>;

// ─── Upload / Send ───
export const IconUpload = (p) => <I {...p}><path d="M12 17V3"/><path d="m6 11 6-6 6 6"/><path d="M19 21H5"/></I>;

// ─── Check Circle / Success ───
export const IconCheck = (p) => <I {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></I>;

// ─── Trash / Delete ───
export const IconTrash = (p) => <I {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></I>;

// ─── Email / Mail ───
export const IconEmail = (p) => <I {...p}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></I>;

// ─── Clipboard ───
export const IconClipboard = (p) => <I {...p}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></I>;

// ─── Phone ───
export const IconPhone = (p) => <I {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></I>;

// ─── ID Card ───
export const IconIdCard = (p) => <I {...p}><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="8" cy="13" r="1.5"/><path d="M6 13h4"/></I>;

// ─── Money / Rupee ───
export const IconMoney = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v12"/><path d="M8 10h5.5a2.5 2.5 0 0 1 0 5H10"/></I>;

// ─── Banknote ───
export const IconBanknote = (p) => <I {...p}><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></I>;

// ─── Prohibited / No ───
export const IconProhibited = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></I>;

// ─── Lightning / Zap ───
export const IconZap = (p) => <I {...p} fill={p.color || 'currentColor'} stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></I>;

// ─── Calendar ───
export const IconCalendar = (p) => <I {...p}><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></I>;

// ─── Timer ───
export const IconTimer = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></I>;

// ─── Worker / Hard Hat ───
export const IconWorker = (p) => <I {...p}><path d="M2 20h20"/><path d="M5 20V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v12"/><path d="M10 12h4"/></I>;

// ─── Plus / Add ───
export const IconPlus = (p) => <I {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></I>;

// ─── Person / User ───
export const IconUser = (p) => <I {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></I>;

// ─── Pin / Bookmark ───
export const IconPin = (p) => <I {...p}><path d="M12 17v5"/><path d="M9 11l-4 4h14l-4-4"/><path d="M15 3.5L9.5 9 15 11l-2.5 2.5"/><path d="M9.5 9L5 3.5"/><path d="M7 21l2-2"/></I>;

// ─── Empty Mailbox ───
export const IconMailbox = (p) => <I {...p}><path d="M22 12h-6a2 2 0 0 0-2 2v6"/><path d="M2 12h6a2 2 0 0 1 2 2v6"/><path d="M2 12V8"/><path d="M22 12V8"/><path d="M2 8h20"/></I>;

// ─── Document / File ───
export const IconFile = (p) => <I {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></I>;

// ─── House / Home ───
export const IconHome = (p) => <I {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></I>;

// ─── Office / Building ───
export const IconBuilding = (p) => <I {...p}><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></I>;

// ─── Money Fly / Expense ───
export const IconExpense = (p) => <I {...p}><path d="M11 17a1 1 0 0 0 1.414 0l2-2a1 1 0 0 0 0-1.414L12 11.586l-2.293 2.293a1 1 0 0 0 0 1.414z"/><path d="m14 14 3 3"/><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-1.172 1.172A2 2 0 0 0 3 17v-1"/><path d="M3 14h.01"/><path d="M7 14h.01"/></I>;

// ─── Green Circle / Income ───
export const IconIncome = (p) => <I {...p} fill="#16a34a" stroke="#16a34a"><circle cx="12" cy="12" r="8"/><path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" fill="none"/></I>;

// ─── Red Circle / Expense Type ───
export const IconExpenseType = (p) => <I {...p} fill="#dc2626" stroke="#dc2626"><circle cx="12" cy="12" r="8"/><path d="M9 9l6 6M15 9l-6 6" stroke="white" strokeWidth="2" fill="none"/></I>;

// ─── Note / Pencil ───
export const IconNote = (p) => <I {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></I>;

// ─── Warning ───
export const IconWarning = (p) => <I {...p} stroke="#f59e0b" fill="none"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13" stroke="#f59e0b"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="#f59e0b"/></I>;

// ─── Lock / Security ───
export const IconLock = (p) => <I {...p}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></I>;

// ─── Envelope Open / Appeal ───
export const IconMail = (p) => <I {...p}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></I>;

// ─── Refresh / Switch ───
export const IconRefresh = (p) => <I {...p}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></I>;

// ─── Gear / Settings ───
export const IconSettings = (p) => <I {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></I>;

// ─── Save / Floppy ───
export const IconSave = (p) => <I {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></I>;

// ─── Cloud ───
export const IconCloud = (p) => <I {...p}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></I>;

// ─── Info ───
export const IconInfo = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></I>;

// ─── Download ───
export const IconDownload = (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></I>;

// ─── Printer ───
export const IconPrinter = (p) => <I {...p}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></I>;

// ─── Camera / Photo ───
export const IconCamera = (p) => <I {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></I>;

// ─── Credit Card / Payment ───
export const IconCreditCard = (p) => <I {...p}><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></I>;

// ─── Bank ───
export const IconBank = (p) => <I {...p}><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></I>;

// ─── Mobile Phone ───
export const IconMobile = (p) => <I {...p}><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></I>;

// ─── Incoming Mail ───
export const IconMailIn = (p) => <I {...p}><path d="M22 12h-6a2 2 0 0 0-2 2v6"/><path d="M2 12h6a2 2 0 0 1 2 2v6"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M2 7v10"/></I>;

// ─── Cross / Error ───
export const IconCross = (p) => <I {...p} stroke="#dc2626"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></I>;

// ─── Crown / CEO ───
export const IconCrown = (p) => <I {...p}><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" fill="none"/><path d="M3 20h18"/></I>;

// ─── Bar Chart / Stats ───
export const IconBarChart = (p) => <I {...p}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></I>;

// ─── Handshake / Partner ───
export const IconHandshake = (p) => <I {...p}><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 17 2 2a1 1 0 1 0 3-3"/><path d="M17.5 9.5 14 6l-3.5 3.5"/><path d="M14 6 9.5 9.5"/><path d="m6 17 2 2a1 1 0 1 0 3-3"/><path d="M3 17h.01"/><path d="M3 13l3.5 3.5"/><path d="M6 10l3.5 3.5"/><path d="m3 7 3.5 3.5"/><path d="m12 4 4.5 4.5"/><path d="M12 4h4"/></I>;

// ─── Eye (Show Password) ───
export const IconEye = (p) => <I {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></I>;

// ─── Eye Off (Hide Password) ───
export const IconEyeOff = (p) => <I {...p}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></I>;

// ─── Shield ───
export const IconShield = (p) => <I {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></I>;

// ─── Inbox Download / Received ───
export const IconInbox = (p) => <I {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></I>;

// ─── Users / Team ───
export const IconUsers = (p) => <I {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></I>;

// ─── Houses / Community ───
export const IconHouses = (p) => <I {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></I>;

// ─── Key ───
export const IconKey = (p) => <I {...p}><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></I>;

// ─── Crystal Ball / Future ───
export const IconCrystalBall = (p) => <I {...p}><path d="M18 12a6 6 0 0 0-6-6 6 6 0 0 0-6 6"/><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/></I>;

// ─── Agent (office worker) ───
export const IconAgent = (p) => <I {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M4 21h16"/><path d="M12 3v4"/></I>;

// ─── Sync / Cloud Upload ───
export const IconSync = (p) => <I {...p}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></I>;

// ─── Copy ───
export const IconCopy = (p) => <I {...p}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></I>;

// ─── Contact / Address Book ───
export const IconContact = (p) => <I {...p}><path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2"/><rect width="18" height="18" x="3" y="4" rx="2"/><circle cx="12" cy="10" r="2"/><line x1="8" y1="2" x2="8" y2="4"/><line x1="16" y1="2" x2="16" y2="4"/></I>;

// ─── Cheque / Check Square ───
export const IconCheckSquare = (p) => <I {...p}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></I>;

// ─── Appeal Submit ───
export const IconSend = (p) => <I {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></I>;

// ─── Close / X ───
export const IconClose = (p) => <I {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></I>;

// ─── List / Menu ───
export const IconList = (p) => <I {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></I>;

// ─── Dashboard ───
export const IconDashboard = (p) => <I {...p}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></I>;

// ─── Arrow Up (for increase) ───
export const IconArrowUp = (p) => <I {...p}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></I>;

// ─── Dollar Sign ───
export const IconDollarSign = (p) => <I {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></I>;

// ─── Zap Outline (for fast OTP) ───
export const IconZapOutline = (p) => <I {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></I>;

// ─── Resend / Rotate ───
export const IconResend = (p) => <I {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></I>;

// ─── Logout ───
export const IconLogout = (p) => <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></I>;

// ─── Globe / Language ───
export const IconGlobe = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></I>;

// ─── Briefcase ───
export const IconBriefcase = (p) => <I {...p}><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></I>;

// ─── Search ───
export const IconSearch = (p) => <I {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></I>;

// ─── Bell / Notification ───
export const IconBell = (p) => <I {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></I>;

// ─── Skip ───
export const IconSkip = (p) => <I {...p}><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></I>;

// ─── Dollar ─── (alias for DollarSign)
export const IconDollar = IconDollarSign;

// ─── TrendUp ─── (alias for ChartUp)
export const IconTrendUp = IconChartUp;

// ─── History ─── (alias for Refresh)
export const IconHistory = IconRefresh;

// ─── Ruler ─── (close enough with Note)
export const IconRuler = (p) => <I {...p}><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></I>;

// ─── BOOK / Book ───
export const IconBook = (p) => <I {...p}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></I>;

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPATIBLE ALIASES (old Icons.jsx export names)
// ═══════════════════════════════════════════════════════════════════════════
export const DashboardIcon = IconDashboard;
export const TownIcon = IconHouses;
export const ExpenseIcon = IconExpense;
export const EmployeeIcon = IconWorker;
export const SoldIcon = IconCheck;
export const CalendarIcon = IconCalendar;
export const ChartIcon = IconBarChart;
export const SaveIcon = IconSave;
export const LogoutIcon = IconLogout;
export const SellIcon = IconMoney;
export const LangIcon = IconGlobe;
export const PropertyIcon = IconBuilding;
export const UsersIcon = IconUsers;
export const BriefcaseIcon = IconBriefcase;
export const PlusIcon = IconPlus;
export const ClockIcon = IconHourglass;
export const PlotIcon = IconHome;
export const ShopIcon = IconBuilding;
export const RulerIcon = IconRuler;
export const WarnIcon = IconWarning;
export const EditIcon = IconNote;
export const WalletIcon = IconMoney;
export const SkipIcon = IconSkip;
export const CheckIcon = IconCheck;
export const CrossIcon = IconClose;
export const NeighborhoodIcon = IconHouses;
export const BankIcon = IconBank;
export const TrashIcon = IconTrash;
export const SearchIcon = IconSearch;
export const BuildingIcon = IconBuilding;
export const LockIcon = IconLock;
export const BookIcon = IconBook;
export const BellIcon = IconBell;
export const HistoryIcon = IconHistory;
export const TrendUpIcon = IconTrendUp;
export const DollarIcon = IconDollar;
export const HandshakeIcon = IconHandshake;
export const PinIcon = IconPin;
export const ResellIcon = IconRefresh;

// ─── Emoji map for easy lookup ───
const ICON_MAP = {
  '📈': IconChartUp,
  '⏳': IconHourglass,
  '📤': IconUpload,
  '✅': IconCheck,
  '🗑️': IconTrash,
  '🗑': IconTrash,
  '📧': IconEmail,
  '📋': IconClipboard,
  '📞': IconPhone,
  '🪪': IconIdCard,
  '💰': IconMoney,
  '💵': IconBanknote,
  '🚫': IconProhibited,
  '⚡': IconZap,
  '📅': IconCalendar,
  '⏱️': IconTimer,
  '⏱': IconTimer,
  '👷': IconWorker,
  '➕': IconPlus,
  '👤': IconUser,
  '📌': IconPin,
  '📭': IconMailbox,
  '📄': IconFile,
  '🏠': IconHome,
  '🏢': IconBuilding,
  '💸': IconExpense,
  '🟢': IconIncome,
  '🔴': IconExpenseType,
  '📝': IconNote,
  '⚠️': IconWarning,
  '⚠': IconWarning,
  '🔐': IconLock,
  '📩': IconMail,
  '🔄': IconRefresh,
  '⚙️': IconSettings,
  '⚙': IconSettings,
  '💾': IconSave,
  '☁️': IconCloud,
  'ℹ️': IconInfo,
  'ℹ': IconInfo,
  '⬇️': IconDownload,
  '🖨️': IconPrinter,
  '📸': IconCamera,
  '💳': IconCreditCard,
  '🏦': IconBank,
  '📱': IconMobile,
  '📨': IconMailIn,
  '❌': IconCross,
  '👑': IconCrown,
  '📊': IconBarChart,
  '🤝': IconHandshake,
  '🙈': IconEyeOff,
  '👁': IconEye,
  '🛡': IconShield,
  '📥': IconInbox,
  '👥': IconUsers,
  '🏘️': IconHouses,
  '🔑': IconKey,
  '🔮': IconCrystalBall,
  '🧑‍💼': IconAgent,
  '✒️': IconNote,
  '🔢': IconCheckSquare,
};

// Generic component that takes an emoji string and renders the corresponding SVG
export const Emoji = ({ emoji, size = 16, color, style = {}, className = '' }) => {
  const IconComp = ICON_MAP[emoji];
  if (IconComp) return <IconComp size={size} color={color} style={style} className={className} />;
  // Fallback: render the original emoji as text
  return <span style={{ fontSize: size, lineHeight: 1, ...style }} className={className}>{emoji}</span>;
};

export default ICON_MAP;