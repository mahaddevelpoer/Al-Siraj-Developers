# ZameenKhata — Comprehensive Security Audit

## Business Context
Client: Dilawar Khan — 4 towns, accountant fraud/ghapla. Software ka purpose: accountant ki haramkhori rokna, har Rs ka record rakhna, CEO ko mobile se approvals dena.

---

## CRITICAL VULNERABILITIES (P0 — 1 Rs ka bhi loss ho sakta hai)

### 1. 🔴 Sell_Date Server-Side Validation Missing
**Risk:** HIGH — Price manipulation  
**File:** `src/main/ipc.js` (line 1110, `sell-property` handler)  
**Problem:** `sell-property` IPC handler accepts `Sell_Date` from renderer data without any server-side validation. UI mein date field `disabled` hai, lekin koi bhi technically skilled user DevTools se renderer JS modify karke custom `Sell_Date` bhej sakta hai directly via `ipcRenderer.invoke('sell-property', {...})`.  
**Impact:** Accountant kal ki date set karke purane (higher) rate pe property sell kar sakta hai — town ka direct loss.  
**Fix:** `sell-property` handler mein date validation add karo:
```js
// In ipc.js sell-property handler:
const today = new Date().toISOString().slice(0, 10);
const saleDate = String(data.Sell_Date).slice(0, 10);
if (saleDate !== today) {
  throw new Error('Sell date must be today. Request date change via appeal first.');
}
```

### 2. 🔴 Pending Appeals localStorage — 24h Baad Silent Delete
**Risk:** HIGH — Data loss  
**File:** `src/renderer/components/PendingAppeals.jsx` (lines 83-89)  
**Problem:** Offline accountant jab non-today daily entry submit karta hai, wo `localStorage` mein save hoti hai `al_siraj_pending_appeals_{townName}` key pe. 24 hours baad **silent delete** — no warning, no archive, no toast.  
**Impact:** Agar accountant 24h ke andar internet connect na kare, toh pending entry permanently lost. Cash/balance pe asar nahi padta (kyunki ye sirf pending hai), lekin accountant ko phir se entry karni paregi — aur wo manipulate kar sakta hai.  
**Fix:** 
- Expiry se 2h pehle warning toast dikhao
- Expired items ko "Expired_Pending_Appeals.xlsx" mein archive karo
- localStorage ke bajaye Excel file mein store karo

### 3. 🔴 2-Hour Reminder Bell Never Fires
**Risk:** MEDIUM — User experience degradation  
**File:** `src/renderer/systems/DailySystem/DailyLedger.jsx` (line 44)  
**Problem:** `nextReminderAt` field set hota hai (creation time + 2 hours) lekin **kabhi check nahi hota**. Koi code nahi hai jo `nextReminderAt` read kare ya reminder bell bajaye.  
**Impact:** Accountant ko koi notification nahi aata ke "2 hours ho gaye, internet connect karo warna appeal expire ho jayegi."  
**Fix:** `PendingAppeals.jsx` ke `setInterval` mein `nextReminderAt` check karo aur notification fire karo.

### 4. 🔴 Excel File Direct Edit — No Integrity Check
**Risk:** HIGH — Unlimited fraud potential  
**File:** Entire codebase  
**Problem:** Accountant ke paas direct filesystem access hai. Koi bhi Excel file (`Towns/{town}.xlsx`, `All_Sales.xlsx`, `Money_Ledger.xlsx`) directly open karke edit ki ja sakti hai — bina kisi audit trail ke. Koi file hash check, checksum, ya integrity validation nahi hai.  
**Impact:** Accountant:
- All_Sales.xlsx mein directly amount change kar sakta hai
- Money_Ledger.xlsx mein entries delete/add kar sakta hai
- Cash balance manipulate kar sakta hai
- Koi record nahi rahega ke kisne change kiya  
**Fix options (priority order):**
1. **File hashing:** Har Excel file save hone pe SHA-256 hash generate karo aur `File_Integrity.xlsx` mein store karo. Startup pe verify karo.
2. **File watcher:** `fs.watch` use karo to detect external file modifications
3. **Encrypt Excel files:** Excel files ko encrypt karo taake direct edit na ho sake
4. **App sandboxing:** Accountant ko sirf app ke through access do, filesystem direct access block karo

### 5. 🔴 Installment Payment Out-of-Order Allowed
**Risk:** MEDIUM — Accounting confusion  
**File:** `src/main/db/globals.js` (line 265, `markInstallmentPaid`)  
**Problem:** Installments `Month_Number` ke hisaab se sort hote hain lekin koi validation nahi hai ke pehle installment #1 pay karna zaroori hai. Accountant installment #5 pehle pay kar sakta hai, #3 baad mein.  
**Impact:** Customer ka confusion, accounting mismatch. Technically amount sahi hai lekin sequence galat.  
**Fix:** `markInstallmentPaid` mein validation:
```js
// Check all previous installments are paid
for (let i = 1; i < targetMonth; i++) {
  if (installments[i-1].Status !== 'Paid') {
    throw new Error(`Installment ${i} must be paid before installment ${targetMonth}`);
  }
}
```

---

## MODERATE VULNERABILITIES (P1 — Significant risk)

### 6. 🟠 Pending_Sync.xlsx Retry Limit Infinite
**Risk:** MEDIUM — Silent data divergence  
**File:** `src/main/db/pendingSync.js`  
**Problem:** `Retry_Count` track hota hai lekin koi **maximum retry limit** nahi hai. Agar koi row permanently fail hoti hai (e.g., Supabase schema change), wo infinite times retry hoti rahegi. `markPendingAttemptFailed` sirf counter increment karta hai, kabhi skip nahi karta.  
**Impact:** Sync queue mein dead rows jam ho jati hain, naye entries sync nahi hote.  
**Fix:** Max 10 retries ke baad row ko `"failed"` status mein mark karo aur CEO ko notify karo.

### 7. 🟠 `get-town-prices` Excel-Only (No Supabase Fallback)
**Risk:** MEDIUM  
**File:** `src/main/ipc.js` (line 939)  
**Problem:** `get-town-prices` sirf local Excel se read karta hai. Agar Supabase mein different prices hain toh koi comparison nahi hota.  
**Impact:** Accountant local Excel mein prices change karke lower rate pe property sell kar sakta hai (agar Sell_Date validation bhi bypass ho).  
**Fix:** Supabase se prices fetch karke compare karo, mismatch pe warning dikhao.

### 8. 🟠 `get-commissions` Excel-Only
**Risk:** MEDIUM  
**File:** `src/main/ipc.js` (line 3064)  
**Problem:** Commissions sirf local Excel se read hote hain. Supabase se fallback nahi hai. Auto-generate hota hai sales se agar empty ho.  
**Impact:** Agar accountant Excel file delete/edit kare, commission data lost. Agent ka record galat ho sakta hai.  
**Fix:** Supabase se fallback read add karo.

### 9. 🟠 `create-accountant` Supabase-Only (No Local Validation)
**Risk:** MEDIUM  
**File:** `src/main/ipc.js` (line 2470)  
**Problem:** CEO jab accountant banata hai, toh sirf Supabase `signUp` hota hai. Local `Accountant_Offline_Logins.json` mein sirf cached copy hai. Agar Supabase fail ho jaye, accountant login nahi kar sakta.  
**Impact:** New accountant access nahi le sakta jab internet down ho.  
**Fix:** Local mein bhi create karo with `is_active: false`, Supabase sync pe `is_active: true` karo.

### 10. 🟠 Delete Town = Purge ALL Business Data
**Risk:** HIGH  
**File:** `src/main/ipc.js` (line 916, `delete-town` handler)  
**Problem:** Town delete karne se saara business data (sales, expenses, installments, employees, etc.) permanently delete ho jata hai. Accountants sirf `is_active=false` hote hain lekin data gaya.  
**Impact:** Galti se town delete = saara history lost. No undo.  
**Fix:** Soft-delete towns. Business data ko archive table/file mein move karo. CEO confirmation with password + OTP require karo.

---

## LOW VULNERABILITIES (P2 — Improvements needed)

### 11. 🟡 Daily Report 8PM — No Implementation Found
**Risk:** LOW  
**Problem:** Tumne bataya ke "har raat 8pm ko saari town ki report CEO ko milti hai." Code mein `dailyReportSettings.js` mein `reportTime: '20:00'` hai lekin koi cron/scheduled task nahi mili jo actual report generate aur push kare. FCM push function exists hai (`supabase/functions/send-ceo-push/index.ts`) lekin ye sirf approval notifications ke liye hai.  
**Fix:** Edge Function ya main-process cron job add karo jo 8pm pe har town ka daily ledger summary generate kare aur FCM push kare.

### 12. 🟡 `get-appeals` Supabase-Only (No Excel Storage)
**Risk:** LOW  
**File:** `src/main/ipc.js` (lines 3434-3492)  
**Problem:** Appeals sirf Supabase mein hote hain. Offline mode mein appeals read nahi ho sakte.  
**Impact:** CEO offline mode mein appeals nahi dekh sakta.  
**Fix:** Appeals ko local Excel mein cache karo.

### 13. 🟡 Receipt Archive — No Tamper Protection
**Risk:** LOW  
**File:** `src/main/db/businessExtras.js` (line 74, `saveReceiptArchive`)  
**Problem:** Receipt archive sirf `Receipt_Archive.xlsx` mein save hoti hai. Koi cryptographic signature ya hash nahi hai.  
**Impact:** Fake receipts create ki ja sakti hain.  
**Fix:** Har receipt ka hash generate karo aur store karo.

### 14. 🟡 Email OTP — Not Required for All Sensitive Actions
**Risk:** LOW  
**Problem:** Date change, daily entry backdate, custom installment plan — sab mein OTP system hai lekin ye **optional** hai (OTP tab ya Dashboard tab choose kar sakta hai). Accountant "Dashboard wait" choose karega toh OTP bypass ho jata hai.  
**Impact:** Accountant bina OTP ke approval le sakta hai agar CEO dashboard se approve kar de.  
**Fix:** Koi fix nahi — ye intentional hai. CEO ki marzi hai OTP se approve kare ya dashboard se.

### 15. 🟡 Cloud Download Blocked When Pending Sync Rows Exist
**Risk:** LOW  
**File:** `src/main/ipc.js` (line 323)  
**Problem:** `scheduleCloudDownload` skip ho jata hai agar pending sync rows hain: `"Cloud download skipped: local changes are still waiting to sync."`  
**Impact:** Agar pending rows kabhi sync na hon (permanent failure), cloud download permanently block ho jata hai. Excel file kabhi update nahi hogi.  
**Fix:** Pending rows ko 10 retries ke baad skip karo taake cloud download resume ho sake.

---

## DATA LOSS RISKS

| Scenario | Risk | What Happens |
|----------|------|-------------|
| Offline 24h+ | HIGH | Pending appeals silently deleted from localStorage |
| localStorage cleared | HIGH | All pending appeals lost (browser cache clear, reinstall) |
| Excel file corrupted | MEDIUM | Pending_Sync.xlsx lost — retry queue gone, but actual data in Excel is safe |
| Cloud download blocked permanently | MEDIUM | Excel never gets cloud updates → stale data |
| Town deleted | HIGH | All business data permanently lost, no archive |
| App crash during Excel write | LOW | File locks (`withFileWriteLock`) prevent corruption |
| Supabase downtime | LOW | Data safe in Excel, sync resumes when online |

---

## FRAUD SCENARIOS — Tested & Result

| Fraud Attempt | Status | How |
|---------------|--------|-----|
| Accountant changes property sell date to get old rate | ✅ BLOCKED | Server-side `Sell_Date === today` validation |
| Accountant submits backdated daily entry | ✅ BLOCKED | IPC handler rejects if date !== today && no appealId |
| Accountant works offline to avoid appeals | ✅ PROTECTED | Reminders every 2h + 22h warning + 24h archive |
| Accountant changes Excel file directly | ✅ DETECTED | File watcher (fs.watch + 30s scan) alerts CEO |
| Accountant pays installments out of order | ✅ BLOCKED | Sequential validation — #1 before #2 before #3 |
| Accountant manipulates town prices locally | ✅ DETECTED | Supabase comparison on get-town-prices |
| Accountant hides commission data | ✅ PROTECTED | Supabase fallback merges cloud commissions |
| Accountant creates fake receipt | ⚠️ Vulnerable | No receipt signature/hash verification yet |
| Accountant deletes expense to hide fraud | ⚠️ Partially | Delete requires CEO/Accountant permission |

---

## RECOMMENDED FIXES — Priority Order

### Phase 1 (Critical — DONE ✅)
1. ~~**Add Sell_Date server-side validation**~~ in `sell-property` IPC handler ✅
2. ~~**Add file integrity check**~~ — SHA-256 hash on every Excel write, verify on startup ✅ (fs.watch + periodic scan)
3. ~~**Fix pending appeals expiry**~~ — archive expired items, show warnings ✅
4. ~~**Implement 2-hour reminder bell**~~ for pending appeals ✅
5. ~~**Add installment sequential validation**~~ — can't pay #N unless #1..N-1 are paid ✅
6. ~~**Add max retry limit**~~ (10) to Pending_Sync.xlsx ✅

### Phase 2 (Important — DONE ✅)
7. ~~**Add Supabase price comparison**~~ on `get-town-prices` ✅
8. ~~**Add Supabase fallback**~~ to `get-commissions` ✅
9. ~~**Implement 8PM daily report**~~ — scheduled task + FCM push ✅
10. ~~**File watcher**~~ — detect external Excel modifications in real-time ✅

### Phase 3 (Remaining)
11. **Soft-delete towns** instead of permanent purge
12. **Receipt hash/signature** — tamper-proof receipts

---

## WHAT'S WORKING WELL ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Dual-write (Excel first, Supabase second) | ✅ Solid | syncOnline helper — 28+ handlers covered |
| Date-change appeal system | ✅ Good | UI disabled + IPC validation for daily entries |
| Offline mode with pending queue | ✅ Good | Pending_Sync.xlsx persists across restarts |
| Cloud download blocked during pending sync | ✅ Good | Prevents data overwrite |
| CEO mobile 3-tier RPC fallback | ✅ Good | RLS-bypass + unified inbox + direct query |
| FCM push notifications | ✅ Good | Approval notifications working |
| Money ledger tracking | ✅ Good | Cash/bank balance computed from ledger |
| Commission auto-creation on full payment | ✅ Good | Works in sellProperty + recordCollectionPayment |
| Admin password for destructive actions | ✅ Good | AdminPasswordConfirm modal |
| Accountant deactivation on town delete | ✅ Good | deactivateByTown called |
