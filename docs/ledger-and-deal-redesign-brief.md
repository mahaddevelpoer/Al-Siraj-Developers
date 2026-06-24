# Ledger and Deal Redesign Brief

## Design Read
Internal real-estate accounting product for CEO/accountant users. The UI should feel like a serious financial command center: clear balances, strong hierarchy, fast scanning, no fake decoration, and every rupee traceable.

## User Requirements Captured
- Every money movement must have both sides visible:
  - money received
  - money paid
  - money receivable
  - money payable
- Every person must have an individual ledger first, then group totals, then overall totals:
  - employee ledger
  - manual sales agent ledger
  - investor ledger
  - constructor ledger
  - customer/property ledger
- Employee salary is fixed monthly, but paid in parts:
  - example salary: PKR 20,000
  - payment can be PKR 5,000, PKR 10,000, then remaining
  - system must show paid and remaining for the selected month
  - once monthly salary is fully paid, any extra payment prompt should ask whether this is advance salary
- Agent commission is earned from sale and paid in parts:
  - example commission: PKR 100,000
  - payment can be PKR 20,000
  - remaining payable should become PKR 80,000
  - every payment must be recorded and printable
- Town dashboard overview must generate a complete report for selected date range:
  - PDF
  - Excel
  - total received
  - total paid
  - receivable
  - payable
  - individual and group ledgers
- Property sale must support negotiated deal amount:
  - expected amount from property price calculation
  - final deal amount entered during selling
  - discount/difference saved for reporting
  - received amount and remaining amount calculated from final deal amount, not expected amount

## Current Code Findings
- `src/main/db/moneyLedger.js` already has a central approved income/expense ledger, but it does not model payable/receivable balances by party.
- `src/main/db/globals.js` salary payment currently blocks duplicate monthly salary payment, which conflicts with partial salary payments.
- `src/renderer/systems/ExpenseSystem/EmployeeSalary.jsx` assumes one salary payment panel with base salary as amount, not a month ledger with partial payments and remaining balance.
- `src/renderer/components/CommissionTracker.jsx` shows pending commission and has `Give Commission`, but it treats commission as one paid action, not partial commission installments.
- `src/renderer/components/SellFlow.jsx` auto-fills `Total_Amount_PKR` from calculated property price and currently renders it read-only. This needs to split into expected amount and editable final deal amount.
- `src/main/db/properties.js` stores sale amount, advance, received, remaining, commission and ledger events, so the sale flow is close to the required model but needs explicit expected/deal fields.

## Proposed Data Model
### Central Ledger
Continue using `money_ledger`, but add richer fields:
- `party_type`: customer, employee, agent, investor, constructor, company
- `party_id`
- `party_name`
- `account_type`: cash, receivable, payable, income, expense, advance
- `direction`: debit or credit
- `amount`
- `town_name`
- `source_type`
- `source_id`
- `receipt_number`
- `date`
- `status`

### Employee Salary Ledger
New or normalized table/file:
- `employee_salary_periods`
  - employee id/name
  - town
  - salary month
  - fixed salary amount
  - paid amount
  - remaining amount
  - status: unpaid, partial, paid
- `employee_salary_payments`
  - payment id
  - salary period id
  - amount
  - date
  - receipt number
  - note

### Agent Commission Ledger
New or normalized table/file:
- `agent_commission_periods`
  - commission id
  - sale id
  - agent id/name
  - town
  - commission earned
  - paid amount
  - remaining amount
  - status: pending, partial, paid
- `agent_commission_payments`
  - payment id
  - commission id
  - amount
  - date
  - receipt number
  - note

### Sale Deal Fields
Add sale/property fields:
- `Expected_Amount_PKR`
- `Deal_Amount_PKR`
- `Discount_Amount_PKR`
- `Deal_Note`

All receivables should use `Deal_Amount_PKR`.

## UI Direction
- Town Overview becomes a money command center:
  - Cash Balance
  - Total Received
  - Total Paid
  - Receivable
  - Payable
  - Profit/Loss
  - date-range report button
- Employee tab becomes:
  - employee cards with monthly balance
  - individual employee ledger drawer
  - salary payment modal supports partial payment
  - extra payment after full salary prompts for advance
- Commission tab becomes:
  - agent cards with earned, paid, remaining
  - click agent to open individual ledger
  - pay partial commission modal
- Selling tab becomes:
  - expected price card
  - editable final deal amount
  - discount/negotiation summary
  - advance and remaining from final deal amount

## Questions To Lock Before Implementation
1. Employee salary month: should it be selected as calendar month like `June 2026`, or should accountant enter custom period `from date` and `to date`?
2. If employee salary is PKR 20,000 and accountant pays PKR 5,000, should this immediately create an expense/cash-out ledger row?
3. If employee receives more than remaining salary, should the extra amount be auto-split as advance, or should system block and ask confirmation first?
4. Employee advance should be recovered from next salary automatically, or manually deducted when accountant pays salary?
5. Agent commission: should commission become payable immediately when property is sold, or only when full property payment is received?
6. Agent commission payment: should accountant be allowed to pay partial commission before customer fully pays the property?
7. Agent ledger should group by agent only, or by agent plus town?
8. Property deal: should final deal amount be allowed lower only, or can it also be higher than expected amount?
9. If final deal amount is lower than expected, should discount require CEO approval or accountant can do it directly?
10. Date-range report: should it include all towns for CEO and only assigned town for accountant?
11. Report output should be one combined PDF/Excel, or separate pages/sheets for employees, agents, investors, constructors, customers?
12. Should receipts be generated for every partial salary and every partial commission payment?
13. Should payable/receivable balances appear on CEO mobile app too, or desktop only in this phase?
14. For “debit and credit”, do you want accounting-style double-entry labels, or simpler business labels: Received, Paid, Receivable, Payable?
15. Should old salary/commission records be migrated into the new ledger model, or is this only for new real data after reset?
