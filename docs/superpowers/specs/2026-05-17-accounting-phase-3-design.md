# Accounting Module — Phase 3 Design Spec

**Date:** 2026-05-17
**Status:** Draft (pending user review)
**Scope:** Phase 3 of 4 — Financial statements, fiscal periods, year-end close, manual JE reversal, expense entry workflow.
**Builds on:** Phase 1 (`2026-05-16-accounting-module-design.md`), Phase 2 (`2026-05-16-accounting-phase-2-design.md`)

## Goal

Make the ledger built in Phases 1–2 usable for periodic financial reporting and disciplined book closing. Ship the three core statements (income statement, balance sheet, cash flow), a calendar-year fiscal-period model with monthly lock/close, a year-end closing workflow that moves net income to Retained Earnings, manual reversal of any posted journal entry for corrections, and a dedicated expense entry form to make day-to-day expense recording easy for FINANCE users.

Phase 1 shipped the ledger. Phase 2 wired operations to it. Phase 3 makes the ledger periodic and reportable.

---

## Scope

### In scope (Phase 3)

- **`FiscalPeriod` model** — one row per (year, month) with status `OPEN` or `LOCKED`. Auto-created lazily when a JE is first posted in that month.
- **Period-lock enforcement** — `PostingService.post()` checks that the target period is OPEN before stamping `entryNumber`. Hard lock (rejects with `PERIOD_LOCKED`).
- **Year-end close** — `PostingService.closeFiscalYear(year, userId)` posts a single closing JE zeroing INCOME and EXPENSE balances to Retained Earnings (account `3020`, already in the starter chart), then transitions all 12 months of that year to LOCKED. Idempotent via the `closingEntryId` back-pointer on December.
- **Manual JE reversal** — `PostingService.reverseEntry(originalId, userId)` works on any POSTED entry regardless of source. Reverses lines (debit/credit swap), posts to today's date (current open period), tags the reversal entry with `reversesEntryId` pointing at the original. Used for corrections after a period is locked.
- **Expense entry workflow** — `PostingService.postExpense(input, userId)` builds a JE from a simple expense form: debit Expense (net), debit VAT Payable (if tax code applies), credit Pay-From account (Cash/Bank/AP). New UI form `ExpenseFormModal`.
- **Income statement, balance sheet, cash flow (indirect, operating-only)** — three new `ReportsService` methods, three new pages, CSV exports.
- **`FiscalPeriodsPage`** — admin-only calendar grid showing OPEN/LOCKED status per month with click-to-lock toggles and per-year "Close Year" buttons.
- **Settings page additions** — "Close Fiscal Year" quick-access and a link to the periods page.
- **New error codes** — `PERIOD_LOCKED`, `ALREADY_CLOSED`.
- **New `JESource` value** — `MANUAL_REVERSAL` (alongside the existing `YEAR_END_CLOSE` which Phase 1 added speculatively and Phase 3 actually uses).
- **i18n** — English + Arabic for all new strings.
- **Manual test plan §21** with ~15 cases.

### Deferred to later phases

- **Bank accounts + statement import + reconciliation** → Phase 4.
- **Fixed assets + depreciation** → out of v1.
- **Configurable fiscal year start month** (e.g. April) → out of v1; calendar year is hardcoded.
- **CLOSED-but-not-LOCKED intermediate period status** → out of v1; periods are binary OPEN/LOCKED.
- **Investing and Financing sections** of the cash flow statement → there's nothing to track yet (no fixed assets, no loans). Operating section only.
- **Direct method cash flow** → out of v1.
- **Segment-level statements** beyond per-building filtering → out of v1.

### Out of v1 entirely

- Multi-currency.
- Multi-tenant scoping.
- Department / cost-center segmentation.

---

## Architecture

Phase 3 extends the existing accounting module with two new infrastructure pieces (`FiscalPeriod`, period-lock guard) and five new operations on `PostingService` / `ReportsService`. No new top-level subsystems; no new design patterns. Mirror the Phase 1/2 controller/route/test layout.

```
server/src/
├─ services/accounting/
│  ├─ posting.service.ts              ← EXTENDED: ensurePeriodOpen guard,
│  │                                    reverseEntry, closeFiscalYear, postExpense
│  ├─ posting.errors.ts               ← inherits new shared codes (PERIOD_LOCKED, ALREADY_CLOSED)
│  ├─ reports.service.ts              ← EXTENDED: incomeStatement, balanceSheet,
│  │                                    cashFlow, listFiscalPeriods
│  └─ tax.ts                           (unchanged — reused by postExpense)
├─ controllers/
│  ├─ accounting-statements.controller.ts  ← NEW (3 statements + CSVs)
│  ├─ accounting-periods.controller.ts     ← NEW (list, lock, unlock)
│  ├─ accounting-year-close.controller.ts  ← NEW (close-year endpoint)
│  ├─ accounting-expenses.controller.ts    ← NEW (post-expense endpoint)
│  └─ accounting-reversal.controller.ts    ← EXTENDED: add reverse-entry endpoint
│                                            alongside the existing reverse-payment

client/src/pages/accounting/
├─ IncomeStatementPage.tsx
├─ BalanceSheetPage.tsx
├─ CashFlowPage.tsx
├─ FiscalPeriodsPage.tsx
└─ ExpenseFormModal.tsx
```

**Sole-writer convention preserved.** Only `PostingService` writes to `JournalEntry` / `JournalLine`. The year-end close builds its closing JE through `createAndPost` like every other posting path.

**Period-lock as a defense-in-depth check.** The guard lives in `PostingService.post()` so every posting path is covered uniformly. Controllers don't need to know about periods.

---

## Data model

### New table

```prisma
model FiscalPeriod {
  id        Int                @id @default(autoincrement())
  year      Int
  month     Int                              // 1..12
  status    FiscalPeriodStatus @default(OPEN)
  lockedAt  DateTime?
  lockedBy  Int?
  closingEntryId Int?                        // set only on month=12 when year-end close runs

  closingEntry  JournalEntry? @relation("FiscalPeriodClosingEntry", fields: [closingEntryId], references: [id], onDelete: SetNull)
  locker        User?         @relation("FiscalPeriodLockedBy", fields: [lockedBy], references: [id], onDelete: SetNull)

  @@unique([year, month])
  @@index([status])
}

enum FiscalPeriodStatus {
  OPEN
  LOCKED
}
```

### Modified models

```prisma
// Add MANUAL_REVERSAL to existing enum:
enum JESource {
  MANUAL
  PAYMENT_AUTO
  VAT_ADJUST
  YEAR_END_CLOSE
  MANUAL_REVERSAL                    // NEW
}

model JournalEntry {
  // ... existing fields ...
  reversesEntryId Int?
  reversesEntry   JournalEntry?  @relation("JEReverses", fields: [reversesEntryId], references: [id], onDelete: SetNull)
  reversedBy      JournalEntry[] @relation("JEReverses")
  fiscalPeriodsClosed FiscalPeriod[] @relation("FiscalPeriodClosingEntry")
}

model User {
  // ... existing fields ...
  lockedFiscalPeriods FiscalPeriod[] @relation("FiscalPeriodLockedBy")
}
```

### New error codes (in `shared/index.ts`)

```ts
export type AccountingErrorCode =
  | 'UNBALANCED' | 'INVALID_LINE' | 'MIN_LINES'
  | 'INVALID_ACCOUNT' | 'INVALID_BUILDING' | 'ALREADY_POSTED'
  | 'MAPPING_MISSING' | 'ALREADY_REVERSED' | 'CANNOT_REVERSE'
  | 'PERIOD_LOCKED'                                            // NEW
  | 'ALREADY_CLOSED';                                          // NEW
```

### Migration

Single migration adds:
1. `FiscalPeriodStatus` enum.
2. `FiscalPeriod` table with the unique index on `(year, month)`.
3. `MANUAL_REVERSAL` value on `JESource` enum.
4. `reversesEntryId` column on `JournalEntry` + back-relation.
5. User back-relation for `FiscalPeriodLockedBy`.

No data migration. Safe to deploy.

### Why no `RETAINED_EARNINGS` mapping key

The year-end close needs the Retained Earnings account. Phase 2's `AccountMapping` table could hold a `RETAINED_EARNINGS` key, but the account has exactly one canonical role across all installations and pre-exists in the starter chart (`3020 Retained Earnings`). Looking it up by code is simpler than adding a mapping key, and there's no realistic scenario where a user wants to map year-end close to a different account.

If a user has a custom chart without code `3020`, `closeFiscalYear` throws `INVALID_ACCOUNT` with a clear message — same defensive posture as the Phase 2 setup endpoint reporting unmapped keys.

---

## PostingService extensions

All methods accept an optional `tx: Prisma.TransactionClient` parameter, consistent with Phase 2's pattern.

### Helper: `ensurePeriodOpen(tx, date)`

Lazily upserts the `FiscalPeriod` row for the date's (year, month). If the row exists and is `LOCKED`, throws `PERIOD_LOCKED` with `{ year, month }` in `details`. If it doesn't exist, creates it as `OPEN`. The auto-create makes period management painless — the user never has to bootstrap.

### `post()` guard

Inside the existing `post()` runner, after `validate` and before `nextval`:

```ts
await this.ensurePeriodOpen(db, entry.date);
```

Every posting path that lands in `post()` — manual JE editor, `postFromPayment`, `postFromBookingCreated`, `postFromDepositTransition`, `reversePayment`, `reverseEntry`, `closeFiscalYear` itself — is covered.

**Year-end close ordering:** the close runs its `createAndPost` BEFORE locking the periods. So the closing JE's December date passes through an OPEN period guard. Then all 12 months are locked. The order matters.

### `reverseEntry(originalId, userId, tx?)` — for any POSTED JE

Preconditions:
- `original.status === 'POSTED'`
- No existing entry has `reversesEntryId = original.id` (would throw `ALREADY_REVERSED`)
- `original.source !== 'PAYMENT_AUTO'` (would throw `CANNOT_REVERSE` with a message pointing the user at the payment-specific reversal endpoint; this keeps `Payment.status` accounting in sync with the ledger)

Behavior:
1. Read original entry + lines.
2. Build reversing lines (debit ↔ credit swap, account/building/description preserved).
3. `createAndPost` with `date = new Date()` (today, current open period — corrections never go into history), `memo = "Reversal of JE-NNNNNN"`, `source = MANUAL_REVERSAL`, `sourceRefId = original.id`.
4. Update the new entry's `reversesEntryId` to `original.id` (one extra `update` after `createAndPost` returns).
5. Return the new entry.

To "un-reverse" a reversal, the user reverses the reversal — symmetric, avoids chain semantics.

### `closeFiscalYear(year, userId, tx?)`

Preconditions:
- No `FiscalPeriod` row with `(year, month=12, closingEntryId IS NOT NULL)` exists. If one does, throws `ALREADY_CLOSED` with `{ closingEntryId }` in `details`.

Algorithm:
1. Compute net balance per INCOME and EXPENSE account up to `Dec 31 year 23:59:59 UTC`.
2. Build closing lines:
   - For each INCOME account with non-zero balance: debit it for its credit balance (zeroing).
   - For each EXPENSE account with non-zero balance: credit it for its debit balance (zeroing).
   - Net income accumulates as `Σ(income credits) − Σ(expense debits)`.
3. Balancing line on Retained Earnings (code `3020`):
   - Net income > 0 → credit Retained Earnings.
   - Net income < 0 → debit Retained Earnings.
4. If closing lines < 2 (no activity), throws `MIN_LINES` with a clear message.
5. `createAndPost` the closing JE with `source = YEAR_END_CLOSE`, `sourceRefId = year`, `date = Dec 31`, `memo = "Year-end close for fiscal year YYYY"`.
6. Upsert all 12 `FiscalPeriod` rows for that year to `status = LOCKED`, set `lockedAt = now`, `lockedBy = userId`, and on month=12 also set `closingEntryId = closingEntry.id`.

The whole thing runs in a single `$transaction`. Failure rolls back both the entry and the period locks.

### `postExpense(input, userId, tx?)`

Builds a JE from a simplified expense input shape (see Section 2 detail above). VAT split via `splitTaxInclusive` when a tax code is provided. Tax code tagged on the expense line so it appears in the input VAT column of the VAT return.

`payFromAccountId` is supplied by the caller — the form offers a dropdown of active Asset and Liability accounts. No new mapping key; the user picks per-expense.

---

## ReportsService extensions

Three new methods returning structured payloads. All three accept optional `buildingId` filter. Sole-reader convention: only `ReportsService` queries the ledger for reporting purposes.

### `incomeStatement({ from, to, buildingId? })`

Returns Income and Expenses sections (each with per-account rows and a section total) plus `netIncome`.

Per-row amount math:
- INCOME: `credit − debit` (natural credit balance).
- EXPENSE: `debit − credit` (natural debit balance).

A refunded payment or a reversed expense can flip the natural sign; rows display the signed amount as-is. Section totals are the algebraic sum.

### `balanceSheet({ asOf, buildingId? })`

Returns Assets, Liabilities, Equity sections plus a synthetic `currentYearIncome` equity row.

Per-account balance math:
- ASSET: `Σ debits − Σ credits` over all posted entries `≤ asOf`.
- LIABILITY, EQUITY: `Σ credits − Σ debits` over the same range.

`currentYearIncome` = net income from January 1 of `asOf`'s year up to `asOf`, computed via `incomeStatement` with that range. Displayed as a virtual equity row "Current Year Earnings". This is what makes a mid-year balance sheet balance: the unclosed period's net is shown as part of equity instead of being lost.

When year-end close has run for the most recent prior year, `Retained Earnings` (the real account 3020) holds the historical net; the synthetic row only covers the current unclosed year. After running close for the current year, `currentYearIncome` for an `asOf` after the close drops to 0 (everything is now in RE).

`isBalanced = Math.abs(assets.total − (liabilities.total + equity.total + currentYearIncome)) < 0.005`. Defense-in-depth check; the UI shows a red banner if false.

### `cashFlow({ from, to, buildingId? })` — indirect, Operating only

1. Net income for `[from, to]` (reuse `incomeStatement`).
2. Working capital changes: for every non-cash ASSET and every LIABILITY account, compute `(balance at to) − (balance at from − 1ms)`. ASSET changes are negated (an increase in AR uses cash); LIABILITY changes pass through (an increase in AP sources cash).
3. `netCashFromOperations = netIncome + Σ workingCapitalChanges`.
4. `beginningCash` = sum of balances of accounts mapped to `CASH_METHOD`, `CARD_METHOD`, `INSTALLMENT_METHOD` (deduplicated by accountId) at `from − 1ms`.
5. `endingCash` = same accounts at `to`.
6. `reconcilesToCash = (endingCash − beginningCash).equals(netCashFromOperations)`. If false, the page shows a banner — should never be false in a correctly posted ledger.

"Non-cash asset" = any ASSET account not in the cash mapping set. "Non-cash liability" = all LIABILITY accounts.

### `listFiscalPeriods(year?)`

Returns all `FiscalPeriod` rows (filtered by year if given), ordered by `(year asc, month asc)`. Includes `closingEntry { id, entryNumber }` when present.

---

## API surface

All routes under `/api/v1/accounting`, gated by `requireFeature(FEATURE_ACCOUNTING)` + role ∈ {ADMIN, SUPER_ADMIN, FINANCE} unless noted.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/accounting/reports/income-statement` | required | Query: `from`, `to`, `buildingId?` |
| GET | `/accounting/reports/income-statement.csv` | required | CSV variant |
| GET | `/accounting/reports/balance-sheet` | required | Query: `asOf`, `buildingId?` |
| GET | `/accounting/reports/balance-sheet.csv` | required | CSV |
| GET | `/accounting/reports/cash-flow` | required | Query: `from`, `to`, `buildingId?` |
| GET | `/accounting/reports/cash-flow.csv` | required | CSV |
| GET | `/accounting/fiscal-periods` | required | Optional `?year=` |
| POST | `/accounting/fiscal-periods/:year/:month/lock` | **ADMIN/SUPER_ADMIN** | Locks a single month |
| POST | `/accounting/fiscal-periods/:year/:month/unlock` | **ADMIN/SUPER_ADMIN** | Reopens; only if the year hasn't been closed |
| POST | `/accounting/fiscal-years/:year/close` | **ADMIN/SUPER_ADMIN** | Year-end close. Idempotent. |
| POST | `/accounting/journal-entries/:id/reverse` | required | New endpoint — reverses any POSTED JE. Phase 2's `/accounting/payments/:id/reverse` stays for payment-specific reversal. |
| POST | `/accounting/expenses` | required | Body: `{ date, memo?, buildingId?, expenseAccountId, amount, payFromAccountId, taxCodeId? }`. Returns the JE. |

All new error codes (`PERIOD_LOCKED`, `ALREADY_CLOSED`) flow through the existing `mapAccountingError` helper to HTTP 400 with `{ code, message, details }`.

---

## UI

### Sidebar — three new entries

Inserted into the existing flat NAV_ITEMS list (Phase 1/2 convention), gated by `FEATURE_ACCOUNTING` + role ∈ {ADMIN, SUPER_ADMIN, FINANCE}:

```
Income Statement   /accounting/income-statement   icon: trending_up
Balance Sheet      /accounting/balance-sheet      icon: account_balance_wallet
Cash Flow          /accounting/cash-flow          icon: water_drop
```

Plus an admin-only entry:

```
Periods            /accounting/periods             icon: lock_clock
```

Total accounting sidebar entries: 10. A nested-group refactor would be reasonable at this size but is out of scope.

### Page: Income Statement (`/accounting/income-statement`)

Filters: date range (default current month), optional building filter (shown only when `booksMode = PER_BUILDING`).

Layout:
- Section "Income" — table with Code · Name · Amount columns, footer Total Income.
- Section "Expenses" — same shape, footer Total Expenses.
- Bottom: large "Net Income" row, color-coded (green positive, red negative).
- "Export CSV" link.

### Page: Balance Sheet (`/accounting/balance-sheet`)

Filter: as-of date (default today), optional building filter.

Layout:
- Three sections (Assets, Liabilities, Equity) stacked on small screens, two columns on wide (Assets left, Liabilities + Equity right).
- Equity section includes the synthetic "Current Year Earnings" row at the bottom.
- Top of page: imbalance banner shown if `isBalanced === false`.
- Footer: "Total Liabilities + Equity" reconciliation row.
- "Export CSV" link.

### Page: Cash Flow (`/accounting/cash-flow`)

Filter: date range (default current month).

Layout (single column):
1. "Net income" line.
2. "Working capital changes" table — Account · Change. Signed.
3. "Net cash from operations" line.
4. "Beginning cash" / "Ending cash" lines.
5. Reconciliation banner (only shown when `reconcilesToCash === false`).
6. "Export CSV" link.

### Page: Fiscal Periods (`/accounting/periods`) — admin-only

Calendar grid: rows = years (oldest to newest, only years with activity), columns = months (Jan…Dec). Each cell shows OPEN (green) or LOCKED (gray with lock icon). Clicking an OPEN cell prompts a confirm and calls `POST /fiscal-periods/:year/:month/lock`. Clicking a LOCKED cell prompts and calls unlock (only allowed if the year isn't yet closed). Each year row has a "Close Year YYYY" button next to it (admin-only) that triggers the year-end close.

Settings → Accounting also gets a "Manage Periods" link to this page.

### Form: Expense Entry

Entry point: a "+ Add Expense" button on the existing Journal Entries list page, alongside the existing "+ New Entry".

`ExpenseFormModal` fields:
- **Date** (default today)
- **Memo**
- **Expense Account** — combobox over active EXPENSE accounts
- **Amount** (gross, tax-inclusive)
- **Tax Code** — defaults to system default; "None" disables VAT split
- **Pay From** — combobox over active ASSET + LIABILITY accounts (Cash, Bank, AP)
- **Building** — optional, when multi-building is enabled

On submit calls `POST /accounting/expenses`. On success navigates to the resulting JE's detail page.

### Reverse Entry action

On the Journal Entry detail page (`/accounting/journal-entries/:id`), when the entry is POSTED and not already reversed: a "Reverse this entry" button (ADMIN/SUPER_ADMIN/FINANCE). Confirm dialog: *"This will post a balancing journal entry dated today. The original remains in the ledger for audit. Continue?"* On accept, calls `POST /accounting/journal-entries/:id/reverse` and navigates to the new reversing entry.

### Settings page additions

- **"Close Fiscal Year ..."** quick-access button per year with activity (admin-only). Same backend call as the periods page.
- Link "Manage Periods →" to `/accounting/periods`.

### i18n

EN + AR keys for all new UI strings. Existing pattern from Phase 1/2.

### Loading / empty / error states

Every page covers initial loading, empty state, server-error retry. Matches Phase 1/2.

---

## Testing strategy

### Layer 1 — Service unit tests (extend `posting.service.test.ts` and `reports.service.test.ts`; new `closeFiscalYear.test.ts` for the close-specific scenarios)

| Tests | Coverage |
|---|---|
| `incomeStatement` (4) | Happy path multi-account; building filter; empty range; signed-negative when a refund flips a row |
| `balanceSheet` (5) | A = L + E invariant; Current Year Earnings synthetic row; year-closed includes RE; building filter; imbalance detection (forces unbalanced state via raw insert) |
| `cashFlow` (4) | Reconciliation invariant; AR increase → negative working capital change; AP increase → positive; multi-cash-account beginning balance |
| `reverseEntry` (4) | Happy path; ALREADY_REVERSED on second attempt; lines correctly swapped; reversal lands in today's period regardless of original date |
| `closeFiscalYear` (5) | Zeros INCOME/EXPENSE; RE absorbs net income (positive and negative cases); locks all 12 months; ALREADY_CLOSED on rerun; MIN_LINES when no activity |
| `postExpense` (4) | With VAT split; without VAT; taxCodeId tagged on expense line; payFromAccount accepts Cash and AP |
| `post()` period-lock guard (3) | Rejects new POSTED entry in locked period with PERIOD_LOCKED; allows in OPEN period; auto-creates missing period as OPEN |
| Regression after period lock (4) | `postFromPayment`, `postFromBookingCreated`, `postFromDepositTransition`, `reversePayment` all reject when target period is locked |

### Layer 2 — HTTP integration tests

| File | New tests |
|---|---|
| `accounting-statements.controller.test.ts` | ~6 — JSON + CSV for each statement, building filter, auth gating |
| `accounting-periods.controller.test.ts` | ~5 — list, lock, unlock, lock idempotency, finance can't lock |
| `accounting-year-close.controller.test.ts` | ~4 — close happy path, ALREADY_CLOSED, no activity → MIN_LINES, finance forbidden |
| `accounting-expenses.controller.test.ts` | ~4 — happy path with VAT, without VAT, into AP, invalid expenseAccountId |
| `accounting-reversal.controller.test.ts` (extended) | ~3 new — reverse-entry endpoint works on a manual JE, on a payment JE, ALREADY_REVERSED guard |

### Layer 3 — Manual test plan §21 (~15 cases)

Sample: Open the income statement for May 2026; create three balanced JEs; verify totals. Lock period 2026-05; try posting a new JE dated 2026-05-15 — gets PERIOD_LOCKED. Unlock 2026-05; same JE now succeeds. Close fiscal year 2026 — verify closing JE posted, RE updated, balance sheet for 2027-01-01 shows RE absorbed the income. Manually reverse a posted expense — verify reversing JE dated today. Switch UI to Arabic — verify all four new pages mirror. Etc.

---

## Rollout plan

### Migration order (single Prisma migration)

1. Create enum `FiscalPeriodStatus`.
2. Create table `FiscalPeriod`.
3. Add `MANUAL_REVERSAL` to `JESource` enum.
4. Add `reversesEntryId` column on `JournalEntry`.
5. Add indexes per the model definitions.

Safe to deploy. No data migration. The lazy-period-create logic means no `FiscalPeriod` rows exist until a JE triggers one — no retroactive lock applied to historical entries.

### Deploy sequence

1. Merge to master. Phase 3 behavior dormant until first JE creates the first FiscalPeriod row.
2. Existing Phase 1/2 flows continue unchanged. Auto-posting still works because every JE triggers `ensurePeriodOpen` which creates the row as OPEN.
3. When ready, an ADMIN visits `/accounting/periods` and uses lock/close as desired.
4. End of fiscal year: ADMIN runs `POST /accounting/fiscal-years/:year/close`.

### Documentation updates (same PR)

- `Hotel_Apartment_BRD.md` → v2.3. Add §4.12 Accounting Phase 3.
- `docs/manual-test-plan.md` → §21.
- No CLAUDE.md changes.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Premature month lock breaks day-to-day posting | Admin-only unlock endpoint reverses the action; year-end close is the durable lock; mid-year locks are advisory |
| Year-end close partial failure | Single `$transaction` wraps closing-entry post + 12 period locks; rolls back atomically |
| Closing JE unbalanced due to rounding | Decimal arithmetic throughout; net income computed from sums of debits/credits, not from intermediate balances; tested |
| `reverseEntry` creates an infinite chain | Method rejects if `original` already has a `reversedBy` entry. To reverse a reversal, the user must target the reversal entry directly |
| Cash flow's "non-cash asset" set shifts when mappings change | Documented: freeze mappings before period close. Mid-year mapping changes affect future cash flow runs, never historical close entries |
| Mid-year balance sheet looks wrong because RE is empty | The synthetic "Current Year Earnings" equity row keeps A = L + E balanced. Clearly labeled; users understand the unclosed portion lives there |
| Direct prisma writes to `JournalEntry` / `JournalLine` bypass the period guard | Sole-writer convention from Phases 1/2 carries forward. No new bypass paths. |
| User reverses a payment-auto JE via the new generic reverse endpoint instead of the payment-specific one | Both paths post a reversing JE; the payment-specific endpoint also marks `Payment.status = REVERSED`. The generic endpoint does not flip Payment status, so the payment would still count as PAID. **Solution: the generic endpoint refuses to reverse entries with `source = PAYMENT_AUTO` and tells the user to use the payment-specific reversal.** Implemented as a precondition check in `reverseEntry`. |

---

## Open questions (none blocking)

All key calls were settled during brainstorming on 2026-05-17:

- Fiscal period structure: calendar year, monthly. ✓
- Period status: binary OPEN/LOCKED, hard lock. ✓
- Period auto-creation on first JE in that month. ✓
- Year-end close: manual trigger, idempotent, ADMIN-only. ✓
- Retained Earnings looked up by code `3020` rather than mapping key. ✓
- Cash flow: indirect, Operating section only. ✓
- Manual reversal in Phase 3 works on any POSTED entry; reversal lands in today's period. ✓
- Manual reversal refuses `source = PAYMENT_AUTO` and points the user at the payment-specific endpoint. ✓
- Expense entry: dedicated `ExpenseFormModal` with `payFromAccountId` chosen per-expense (no mapping key). ✓
- Reverse Entry button visible to FINANCE (matches rest of accounting access). ✓
- Cash flow page shows only Operating; no empty Investing/Financing sections. ✓
- Sidebar stays flat (10 accounting entries now). Nested-group refactor deferred. ✓

---

## Out-of-scope reminders (do not add to Phase 3)

These are intentionally excluded; each has a planned home in a later phase or is permanently out.

- **`BankAccount`, `BankStatementLine`, reconciliation** → Phase 4.
- **Direct-method cash flow** → out of v1.
- **Investing and Financing sections of cash flow** → out of v1 (nothing to track yet).
- **Configurable fiscal year start month** → out of v1.
- **CLOSED-but-not-LOCKED intermediate status** → out of v1.
- **Fixed assets + depreciation** → out of v1.
- **Multi-currency** → out of v1.
- **Department / cost-center segmentation** → out of v1.
- **Async year-end close (job queue / SSE)** → not needed; close runs synchronously in < 1s for realistic data sizes.
