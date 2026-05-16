# Accounting Module — Phase 2 Design Spec

**Date:** 2026-05-16
**Status:** Draft (pending user review)
**Scope:** Phase 2 of 4 — Auto-posting, VAT, deposits, backfill, reversal.
**Builds on:** Phase 1 (`2026-05-16-accounting-module-design.md`)

## Goal

Wire the operational data of the Hotel Apartment Management System (Bookings, Payments, deposit lifecycle) into the Phase 1 accounting ledger via a hybrid posting model — cash-basis by default, accrual optionally. Add VAT tracking (tax-inclusive amounts), a configurable account mapping, a one-time backfill tool for historical data, a payment reversal workflow, and a VAT return report.

Phase 1 shipped the ledger primitives (`Account`, `JournalEntry`, `JournalLine`, `PostingService`) and the manual journal-entry workflow. Phase 2 makes the ledger automatic for the system's most common operations.

---

## Scope

### In scope (Phase 2)

- **`AccountMapping` table** — editable lookup from a mapping key (e.g. `CASH_METHOD`, `AR_DEFAULT`) to an `Account`. Mapping is the substrate for all auto-posting.
- **`TaxCode` table** — code, rate, linked VAT-payable account, default flag. Seeds: `VAT_STANDARD` (5%, default), `VAT_ZERO`, `VAT_EXEMPT`.
- **`accountingMode` setting on `SystemSettings`** — `CASH` (default) or `ACCRUAL`. Controls whether revenue posts at booking time or at payment time.
- **PostingService extensions:** `postFromPayment`, `postFromBookingCreated`, `postFromDepositTransition`, `reversePayment`, `backfill`. Each method is idempotent and participates in the caller's transaction.
- **Booking carries `taxCodeId`** (defaults to the system default) so per-booking tax overrides work without rewriting posting logic.
- **Back-pointers on Payment/Booking** to the auto-posted JE (`postedEntryId`, `revenuePostedEntryId`, `depositPostedEntryId`). Powers idempotency, "View posting" UI links, and audit trail.
- **`REVERSED` `PaymentStatus`** — a fourth status excluded from outstanding-balance queries.
- **Setup endpoint** (`POST /api/v1/accounting/setup`) — seeds default `TaxCode` rows, fills `AccountMapping` against the starter chart, returns a list of any still-unmapped keys for the UI to highlight.
- **Backfill endpoint** (`POST /api/v1/accounting/backfill`) — synchronously walks historical `Booking` and `Payment` rows and auto-posts the missing JEs. Idempotent. Returns a summary.
- **UI:** Account Mapping page (`/accounting/mapping`), VAT Return page (`/accounting/vat-return`), accounting-mode toggle in Settings, tax-code dropdown on the Booking form, "Reverse" action on Payment rows, "Run Setup" and "Run Backfill" actions in Settings → Accounting.
- **i18n:** English + Arabic for all new strings.
- **Manual test plan §20** with ~12 new cases.

### Deferred to later phases

- **Financial statements** (P&L, balance sheet, cash flow) → Phase 3.
- **Period close & lock** → Phase 3.
- **Reversing-entry helper for manual entries** → Phase 3 (Phase 2 only reverses auto-posted payments).
- **Bank accounts, statement import, reconciliation** → Phase 4.
- **Expense entry UI** (manual JEs already work in Phase 1; a dedicated "Add expense" workflow that auto-tags tax codes) → Phase 3 alongside statements.

### Out of v1 entirely

- Fixed assets & depreciation.
- Multi-currency.
- Multi-tenant scoping.
- Asynchronous backfill (job queue / SSE). Phase 2 runs backfill synchronously — adequate for the expected dataset size; revisit if history grows beyond a few thousand payments.

---

## Architecture

Auto-posting is implemented as **new high-level methods on the existing `PostingService`**, called by Payment and Booking controllers immediately after the operational write, inside the same Prisma transaction. No middleware, no event bus, no separate hook layer.

```
server/src/
├─ controllers/
│  ├─ payments.controller.ts          ← MODIFIED: call postFromPayment after PAID writes
│  ├─ bookings.controller.ts          ← MODIFIED: call postFromBookingCreated (accrual)
│  │                                    + postFromDepositTransition on deposit changes
│  ├─ accounting-mapping.controller.ts   ← NEW
│  ├─ accounting-taxcodes.controller.ts  ← NEW
│  ├─ accounting-reversal.controller.ts  ← NEW (POST /payments/:id/reverse)
│  ├─ accounting-setup.controller.ts     ← NEW (POST /accounting/setup)
│  ├─ accounting-backfill.controller.ts  ← NEW (POST /accounting/backfill)
│  └─ accounting-vat-return.controller.ts ← NEW (GET /accounting/reports/vat-return)
├─ services/accounting/
│  ├─ posting.service.ts              ← EXTENDED: 5 new methods + tax-split helper
│  ├─ posting.errors.ts               ← EXTENDED: 3 new error codes
│  ├─ mapping.service.ts              ← NEW (resolveAccount, listMappings, setMapping)
│  ├─ starter-chart.ts                ← EXTENDED: add VAT Payable + Forfeited Income
│  └─ vat-return.service.ts           ← NEW (aggregates JournalLine by taxCodeId)

client/src/pages/accounting/
├─ AccountMappingPage.tsx             ← NEW
├─ TaxCodesPanel.tsx                  ← NEW (rendered inside mapping page)
├─ VatReturnPage.tsx                  ← NEW
├─ BackfillModal.tsx                  ← NEW (accessed from Settings)
└─ ReversePaymentDialog.tsx           ← NEW

client/src/pages/settings/
└─ SettingsPage.tsx                   ← MODIFIED: accountingMode radio + setup/backfill buttons
```

**Sole-writer convention preserved.** Only `PostingService` writes to `JournalEntry` / `JournalLine`. Controllers call its methods; they never construct entries themselves.

**Critical invariant:** Every controller path that creates/transitions a Payment, Booking, or deposit status is wrapped in `prisma.$transaction`; the posting call participates in the same transaction so the operational write and its JE are atomic.

---

## Data model

### New tables

```prisma
model AccountMapping {
  id        Int      @id @default(autoincrement())
  key       String   @unique
  accountId Int
  updatedAt DateTime @updatedAt
  updatedBy Int?

  account   Account  @relation(fields: [accountId], references: [id], onDelete: Restrict)
  updater   User?    @relation("AccountMappingUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
}

model TaxCode {
  id        Int      @id @default(autoincrement())
  code      String   @unique
  name      String
  ratePct   Decimal  @db.Decimal(5, 2)
  accountId Int
  isDefault Boolean  @default(false)
  isExempt  Boolean  @default(false)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy Int?
  updatedBy Int?

  account   Account       @relation(fields: [accountId], references: [id], onDelete: Restrict)
  lines     JournalLine[]
  bookings  Booking[]
  creator   User?         @relation("TaxCodeCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater   User?         @relation("TaxCodeUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
}
```

### Mapping key vocabulary (string union, not a Prisma enum)

| Key | Posts when | Default seed (starter chart) |
|---|---|---|
| `CASH_METHOD` | Payment.method = CASH | 1010 Cash on Hand |
| `CARD_METHOD` | Payment.method = CARD | 1020 Bank |
| `INSTALLMENT_METHOD` | Payment.method = INSTALLMENT and status=PAID | 1020 Bank |
| `AR_DEFAULT` | Accrual mode revenue / installment AR | 1100 Accounts Receivable |
| `REVENUE_DEFAULT` | Rental revenue (gross less VAT) | 4000 Rental Revenue |
| `DEPOSIT_LIABILITY` | Security deposit collected | 2050 Security Deposits Held |
| `DEPOSIT_FORFEIT_INCOME` | Deposit forfeited | 4020 Forfeited Deposit Income |
| `VAT_PAYABLE` | Output VAT (fallback if a TaxCode doesn't have its own account) | 2100 VAT Payable |

Adding new keys in later phases requires no schema migration — controllers reference the string constants.

### Modified tables

```prisma
model JournalLine {
  // ... existing fields ...
  taxCodeId Int?
  taxCode   TaxCode? @relation(fields: [taxCodeId], references: [id], onDelete: SetNull)
  @@index([taxCodeId])
}

model SystemSettings {
  // ... existing fields ...
  accountingMode AccountingMode @default(CASH)
}

enum AccountingMode {
  CASH
  ACCRUAL
}

enum PaymentStatus {
  PAID
  PENDING
  FAILED
  REVERSED   // NEW
}

model Payment {
  // ... existing fields ...
  postedEntryId Int?
  postedEntry   JournalEntry? @relation("PaymentPostedEntry", fields: [postedEntryId], references: [id], onDelete: SetNull)
  @@index([postedEntryId])
}

model Booking {
  // ... existing fields ...
  taxCodeId            Int?
  revenuePostedEntryId Int?
  depositPostedEntryId Int?

  taxCode             TaxCode?      @relation(fields: [taxCodeId], references: [id], onDelete: Restrict)
  revenuePostedEntry  JournalEntry? @relation("BookingRevenuePostedEntry", fields: [revenuePostedEntryId], references: [id], onDelete: SetNull)
  depositPostedEntry  JournalEntry? @relation("BookingDepositPostedEntry", fields: [depositPostedEntryId], references: [id], onDelete: SetNull)
}

model JournalEntry {
  // ... existing fields ...
  paymentPostedFor          Payment[]  @relation("PaymentPostedEntry")
  bookingRevenuePostedFor   Booking[]  @relation("BookingRevenuePostedEntry")
  bookingDepositPostedFor   Booking[]  @relation("BookingDepositPostedEntry")
}
```

### Migration

Single migration adds:
1. New tables `AccountMapping`, `TaxCode` with FKs.
2. New enum `AccountingMode`.
3. Add `REVERSED` to `PaymentStatus`.
4. Add `taxCodeId`, `revenuePostedEntryId`, `depositPostedEntryId` to `Booking`.
5. Add `postedEntryId` to `Payment`.
6. Add `taxCodeId` to `JournalLine` + index.
7. Add `accountingMode` column to `SystemSettings` (default `'CASH'`).
8. Add User back-relations for the new audit columns.

No data migration. New columns are nullable / have defaults; safe with the flag off.

### Decimal precision

`TaxCode.ratePct` is `Decimal(5, 2)` — sufficient for rates up to 999.99%; real rates are 0–30%. JournalLine.debit/credit stay at `Decimal(14, 2)`.

---

## PostingService extensions

All methods accept an optional `tx: Prisma.TransactionClient`. If provided, they reuse it (so the operational write and the JE are atomic). If absent, they open their own `$transaction`.

### Tax-split helper

```ts
private splitTaxInclusive(gross: Decimal, rate: Decimal): { net: Decimal; vat: Decimal } {
  if (rate.eq(0)) return { net: gross, vat: new Decimal(0) };
  const vat = gross.times(rate).div(rate.plus(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  const net = gross.minus(vat);
  return { net, vat };
}
```

Rounding is `HALF_EVEN` (banker's rounding) applied once to `vat`; `net` is computed from `gross - vat` to keep the equation exact. Tested against the canonical 105/5% = 100/5 case and the 100/5% = 95.24/4.76 case.

### `postFromPayment(paymentId, userId, tx?)`

Called by Payment controller after a status transition to `PAID` (either on create for CASH/CARD or via `markPaid` for INSTALLMENT).

**Idempotency:** read `Payment.postedEntryId`; if non-null, return early.

**Branches on `SystemSettings.accountingMode`:**

- **CASH mode** (default): builds an entry with three lines using the booking's tax code (or default):
  - debit: account from mapping for the payment method, full gross
  - credit: revenue account, net
  - credit: VAT payable account (from tax code), VAT (only if rate > 0)
  - When rate = 0 (zero-rated or exempt), the VAT credit line is omitted — entry becomes 2 lines.

- **ACCRUAL mode**: the booking already posted AR + revenue + VAT at creation time. The payment just clears AR.
  - debit: account from mapping for the payment method, gross
  - credit: AR account, gross
  - No VAT line (already recognized).

Source: `PAYMENT_AUTO`, `sourceRefId = paymentId`. Calls `createAndPost` internally; sets `Payment.postedEntryId` to the resulting entry id.

### `postFromBookingCreated(bookingId, userId, tx?)`

**No-op in CASH mode.** In ACCRUAL mode, runs at Booking creation.

**Idempotency:** read `Booking.revenuePostedEntryId`; if non-null, return early.

```
debit  AR account                  totalAmount
credit revenue account              net
credit VAT payable (if rate > 0)    vat
```

Tax code: from `Booking.taxCodeId`, falling back to the system default.

Source: `PAYMENT_AUTO`, `sourceRefId = bookingId`. (Same `JESource` enum value; reuses the slot. JE memo distinguishes booking vs payment.)

Sets `Booking.revenuePostedEntryId`.

### `postFromDepositTransition(bookingId, fromStatus, toStatus, userId, tx?)`

Idempotent at the transition level: each transition results in a new JE; the matching back-pointer is overwritten with the latest JE for audit-trail compatibility (the prior JE remains in the ledger, never deleted).

| From → To | JE lines |
|---|---|
| `NONE` → `HELD` | debit Cash/Bank (CASH_METHOD mapping), credit Deposit Liability |
| `HELD` → `RELEASED` | debit Deposit Liability, credit Cash/Bank (refund) — partial refund splits to Forfeit Income |
| `HELD` → `FORFEITED` | debit Deposit Liability, credit Forfeit Income |

No VAT on deposits. Amount sourced from `Booking.depositAmount` / `depositRefundAmount`.

Source: `PAYMENT_AUTO`, `sourceRefId = bookingId`, memo "Deposit collected | released | forfeited for Booking #X".

Sets `Booking.depositPostedEntryId`.

### `reversePayment(paymentId, userId, tx?)`

User-triggered. Preconditions:

- `Payment.status === PAID`
- `Payment.postedEntryId !== null` (i.e. the payment was auto-posted)
- Not already reversed

On any precondition failure, throws `CANNOT_REVERSE` (with details indicating which precondition failed). If a previous reversal exists (i.e. there's already a reversing JE with this payment as `sourceRefId` and "Reversal of …" memo), throws `ALREADY_REVERSED`.

Behavior:

1. Read the original posted entry and its lines.
2. Build a new entry with each line's debit and credit swapped.
3. Source: `PAYMENT_AUTO`, `sourceRefId = paymentId`, memo: `"Reversal of JE-NNNNNN"`.
4. Call `createAndPost`.
5. Update Payment: `status = REVERSED`. **Keep** `postedEntryId` pointing at the original (audit trail; UI shows both entries).

### `backfill({ fromDate?, userId })` — admin only

Synchronous. Walks unfilled rows in chronological order, calls the appropriate posting method per row, accumulates results.

In ACCRUAL mode the order is: Bookings (revenue) → Bookings (deposit if NONE→HELD already happened) → Payments. In CASH mode: Bookings (deposit only) → Payments. Each row is wrapped in its own `$transaction`; a failure in one row records the error and continues to the next.

Returns:

```json
{
  "processed": 247,
  "posted": 230,
  "skipped": 17,
  "failed": [
    { "kind": "payment", "id": 42, "code": "MAPPING_MISSING", "message": "..." }
  ]
}
```

### New error codes

Added to `AccountingErrorCode` in `@hotel/shared`:
- `MAPPING_MISSING` — required `AccountMapping` row doesn't exist for a key.
- `ALREADY_REVERSED` — attempt to reverse a payment that already has a reversing JE.
- `CANNOT_REVERSE` — payment is not in a reversible state (e.g. PENDING, FAILED, not yet posted).

`AccountingError` instances carry the code and optional `details` (e.g. the offending mapping key).

---

## Setup & seed

### `POST /api/v1/accounting/setup`

Admin-only, idempotent. Effect:

1. Ensure starter chart is present (calls existing `seedStarterChart`). Adds two new accounts to the starter array (versioning the helper is fine; idempotent by code lookup):
   - `2100` VAT Payable (Liability)
   - `4020` Forfeited Deposit Income (Income)
2. Ensure `TaxCode` rows exist:
   - `VAT_STANDARD` — 5%, default, linked to VAT Payable
   - `VAT_ZERO` — 0%, not default, linked to VAT Payable
   - `VAT_EXEMPT` — 0%, isExempt=true, not default, linked to VAT Payable
3. Ensure `AccountMapping` rows exist for each key in the vocabulary. Look up by account code; skip if mapping already exists for the key.

Returns:

```json
{
  "createdAccounts": 2,
  "createdTaxCodes": 3,
  "createdMappings": 8,
  "unmappedKeys": []
}
```

If the user has a non-default chart of accounts, `unmappedKeys` lists the keys that couldn't be auto-resolved by code. The UI prompts the user to manually set those.

---

## API surface

All new routes under `/api/v1/accounting`, gated by `requireFeature(FEATURE_ACCOUNTING)` + role ∈ {ADMIN, SUPER_ADMIN, FINANCE} except where noted.

| Method | Path | Notes |
|---|---|---|
| POST | `/accounting/setup` | Admin only. Seeds tax codes + mapping defaults. Idempotent. |
| GET | `/accounting/mapping` | List all mappings + status (mapped / unmapped). |
| PATCH | `/accounting/mapping/:key` | Update a single mapping. Body: `{ accountId }`. |
| GET | `/accounting/tax-codes` | List. |
| POST | `/accounting/tax-codes` | Create. |
| PATCH | `/accounting/tax-codes/:id` | Update (incl. setting `isDefault=true`; controller un-defaults all others atomically). |
| POST | `/accounting/tax-codes/:id/deactivate` | Set `isActive=false`. (No DELETE — referenced by past lines.) |
| POST | `/accounting/payments/:id/reverse` | Admin/Finance. Reverses an auto-posted payment. |
| POST | `/accounting/backfill` | Admin only. Body: `{ fromDate?: "YYYY-MM-DD" }`. Returns summary. |
| GET | `/accounting/reports/vat-return` | Query: `from`, `to`. Returns grouped output/input VAT by tax code. |
| GET | `/accounting/reports/vat-return.csv` | Same data as CSV. |

The Payment and Booking controllers don't get new routes — they get internal posting calls inside their existing endpoints:

| Endpoint | Posting hook |
|---|---|
| `POST /payments` (status becomes PAID on create) | `postFromPayment` |
| `PATCH /payments/:id` (markPaid: PENDING→PAID) | `postFromPayment` |
| `POST /bookings` | `postFromBookingCreated` (ACCRUAL only) |
| `POST /bookings` with `depositAmount > 0` | `postFromDepositTransition(NONE→HELD)` |
| `POST /bookings/:id/checkout` (existing endpoint that sets `depositStatus`) | `postFromDepositTransition(HELD → RELEASED | FORFEITED)` |

Posting calls participate in the parent transaction. On posting failure, the parent operation rolls back; the user sees the `AccountingError` message in the response (HTTP 400 with the error code).

### Error responses

All `AccountingError` thrown by posting methods map to HTTP 400 with body:

```json
{ "code": "MAPPING_MISSING", "message": "...", "details": { "key": "CASH_METHOD" } }
```

Mapped by the existing `mapAccountingError` helper from Phase 1, extended to handle the new codes.

---

## UI

### Sidebar — two new entries

Added to the existing flat sidebar pattern (matching Phase 1's convention), between the existing accounting entries and "Users":

```
Account Mapping     /accounting/mapping        icon: settings_input_component
VAT Return          /accounting/vat-return     icon: receipt_long
```

Both gated by `FEATURE_ACCOUNTING` + role ∈ {ADMIN, SUPER_ADMIN, FINANCE}.

### Page: Account Mapping (`/accounting/mapping`)

Single page with two sections.

**Section 1 — Mapping table** (one row per key from the vocabulary). Columns:

| Key (display label) | Currently maps to | Action |
|---|---|---|
| Cash payments | 1010 – Cash on Hand | Change |
| Card payments | 1020 – Bank | Change |
| Installment payments | 1020 – Bank | Change |
| Accounts Receivable | 1100 – Accounts Receivable | Change |
| Revenue (default) | 4000 – Rental Revenue | Change |
| Security Deposits Held | 2050 – Security Deposits Held | Change |
| Forfeited Deposit Income | 4020 – Forfeited Deposit Income | Change |
| VAT Payable | 2100 – VAT Payable | Change |

"Change" opens the existing `AccountPicker` modal (filtered to active accounts of the appropriate type if known — e.g. CASH_METHOD only shows Asset accounts).

A red banner appears at the top if any key is unmapped: *"Mapping incomplete — auto-posting is disabled until you complete the mapping for: X, Y."*

**Section 2 — Tax Codes** (rendered as a sub-component `TaxCodesPanel`). Table with Code, Name, Rate %, Linked account, Default radio, Active toggle. "New Tax Code" button opens a modal (code, name, rate, account, default checkbox). The "Default" radio is mutually exclusive — clicking it un-defaults all others (controller enforces atomically).

### Page: VAT Return (`/accounting/vat-return`)

Filters: period start, period end (default = previous month). Optional "Export CSV" button.

Layout:

```
Output VAT (tax collected on revenue)
  VAT_STANDARD (5%)         net 12,400.00    tax 620.00
  VAT_ZERO (0%)             net  3,000.00    tax   0.00
  VAT_EXEMPT (0%, exempt)   net    500.00    tax   0.00
                                            ────────
                                  Output VAT 620.00

Input VAT (tax paid on expenses)
  VAT_STANDARD (5%)         net    400.00    tax  20.00
                                            ────────
                                  Input VAT   20.00

                                            ────────
                                  Net VAT due 600.00
```

Query: groups `JournalLine` rows with `taxCodeId IS NOT NULL` and the entry posted within the period, splitting by line direction (credit on VAT Payable = output; debit on VAT Payable = input — well, more precisely: tax codes flag the revenue/expense lines, and the VAT line is paired with them by entry id).

Actually simpler implementation: for each `JournalLine` with a `taxCodeId`, look at its sibling lines in the same entry. The line with the `taxCodeId` is the revenue/expense (net amount). The line touching the VAT Payable account is the tax. Sum per tax code, per direction (revenue = output, expense = input).

### Booking form — tax-code dropdown

A new optional dropdown on the booking create/edit form: "Tax Code (defaults to system default)". Populated from `GET /accounting/tax-codes`. Most users never change it.

Only rendered when `FEATURE_ACCOUNTING=true`.

### Payments page — Reverse action

A new "Reverse" button on each POSTED payment row (admin/finance only, visible only when `FEATURE_ACCOUNTING=true` and `payment.postedEntryId !== null`). Opens `ReversePaymentDialog`:

> *"This will post a balancing journal entry and mark the payment as REVERSED. Reversed payments are excluded from outstanding balance calculations. The original entry remains in the ledger for audit. Continue?"*

On confirm, calls `POST /accounting/payments/:id/reverse`, refreshes the row.

### Settings page — additions to the Accounting section

Added below the existing books-mode radio:

- **Accounting mode** radio (CASH / ACCRUAL, default CASH). Helper: *"Cash basis posts revenue when payment is received. Accrual posts revenue when the booking is created and clears AR when payment is received. Switching modes does not affect historical entries."*
- **Run Setup** button — calls `POST /accounting/setup`. Shows result (created counts, unmapped keys).
- **Run Backfill** button — opens `BackfillModal`. Optional date picker, "Run" button. Shows result summary.
- Link to `/accounting/mapping`.

### i18n

All new strings go through `react-i18next`. Both EN and AR locale files extended.

### Loading / empty / error states

Every page covers: initial loading, empty state with guiding action ("Set up Accounting"), server-error retry. Matches existing pages.

---

## Testing strategy

### Layer 1 — Service unit tests

Extend `posting.service.test.ts` and add `posting.service.backfill.test.ts` and `vat-return.service.test.ts`.

| Test | Why |
|---|---|
| `postFromPayment(CASH)` posts 3 lines with VAT split when rate>0 | Core happy path |
| `postFromPayment(CASH)` posts 2 lines when tax code is VAT_ZERO | Zero-rate path |
| `postFromPayment(CASH)` is idempotent when `postedEntryId` already set | Backfill safety |
| `postFromPayment(ACCRUAL)` clears AR without re-recognizing revenue | Mode semantics |
| `postFromBookingCreated(ACCRUAL)` posts AR + Revenue + VAT | Core happy path |
| `postFromBookingCreated(CASH)` is a no-op | Mode boundary |
| `postFromDepositTransition` for NONE→HELD | Lifecycle |
| `postFromDepositTransition` for HELD→RELEASED full refund | Lifecycle |
| `postFromDepositTransition` for HELD→RELEASED partial refund — split to Forfeit Income | Partial refund |
| `postFromDepositTransition` for HELD→FORFEITED | Lifecycle |
| `reversePayment` posts a balancing JE and sets status=REVERSED | Core reversal |
| `reversePayment` on already-REVERSED throws ALREADY_REVERSED | Idempotency |
| `reversePayment` on PENDING throws CANNOT_REVERSE | State guard |
| Missing AccountMapping throws MAPPING_MISSING | Setup-required |
| VAT split: 105 @ 5% = 100/5 | Rounding correctness |
| VAT split: 100 @ 5% = 95.24/4.76 | Rounding correctness |
| `taxCodeId` on Booking overrides default in resulting JE lines | Per-booking tax |

### Layer 2 — Backfill tests

| Test | Why |
|---|---|
| Posts all paid Payments since fromDate; skips already-posted | Idempotency |
| In ACCRUAL mode posts Bookings before Payments | Ordering |
| One bad row (MAPPING_MISSING) doesn't halt; reported in `failed` | Per-row isolation |
| Empty DB returns processed=0, no errors | Edge case |

### Layer 3 — Controller / HTTP tests

Extend `payments.controller.test.ts`, `bookings.controller.test.ts`, and add new test files per controller.

| Test | Why |
|---|---|
| `POST /payments` with CASH+PAID auto-posts; verify via GET /journal-entries | End-to-end |
| `PATCH /payments/:id/markPaid` triggers posting | Status-transition |
| Payment write rolls back if posting throws (count unchanged after error) | Transactional integrity |
| `POST /accounting/payments/:id/reverse` posts balancing JE and marks REVERSED | Reversal endpoint |
| `GET /payments/stats` excludes REVERSED from outstanding | Query correctness |
| `POST /accounting/backfill` admin-only (403 for FINANCE) | Auth |
| `POST /accounting/backfill` with fromDate posts correct rows | End-to-end |
| `GET /accounting/reports/vat-return` groups output + input by tax code | Report shape |
| `POST /accounting/setup` seeds defaults idempotently | Setup |
| `GET/PATCH /accounting/mapping` round-trips | Mapping management |
| `POST /accounting/tax-codes` and "set default" enforces single default | Tax-code uniqueness |
| `POST /bookings` with depositAmount > 0 (CASH or ACCRUAL) auto-posts deposit JE | Deposit lifecycle |
| `POST /bookings/:id/checkout` with `depositStatus=RELEASED` posts release JE | Deposit lifecycle |

### Layer 4 — Migration test

Migration applies cleanly. New tables exist. `accountingMode` defaults to `CASH` on `SystemSettings`. `REVERSED` is a valid PaymentStatus value.

### Layer 5 — Manual test plan §20

12 cases, appended to `docs/manual-test-plan.md`:

| # | Scenario |
|---|---|
| 20.1 | Enable FEATURE_ACCOUNTING + new module; verify Setup button exists |
| 20.2 | Click "Run Setup" with default chart; verify 2 accounts, 3 tax codes, 8 mappings created |
| 20.3 | View Account Mapping page; verify all keys mapped, no red banner |
| 20.4 | Create a CASH payment (PAID); verify JE auto-created with 3 lines (Cash, Revenue net, VAT) |
| 20.5 | Switch to ACCRUAL mode in Settings; create a new Booking; verify AR + Revenue + VAT posted |
| 20.6 | In ACCRUAL mode mark an installment PAID; verify AR cleared (Cash debit, AR credit) |
| 20.7 | Create a Booking with depositAmount=500; verify Cash debit / Deposit Liability credit |
| 20.8 | Checkout with depositStatus=RELEASED, full refund; verify Deposit Liability debit / Cash credit |
| 20.9 | Checkout with depositStatus=FORFEITED; verify Deposit Liability debit / Forfeit Income credit |
| 20.10 | Reverse a paid payment; verify balancing JE posts, status becomes REVERSED, outstanding balance updates |
| 20.11 | Run Backfill from a date with 3 historical payments; verify summary, JEs created |
| 20.12 | View VAT Return for the current month; verify Output VAT total matches summed VAT lines |

---

## Rollout plan

### Migration order (single Prisma migration)

1. Create enum `AccountingMode`.
2. Create tables `AccountMapping`, `TaxCode`.
3. Add `REVERSED` to `PaymentStatus`.
4. Add columns: `Booking.taxCodeId`, `Booking.revenuePostedEntryId`, `Booking.depositPostedEntryId`, `Payment.postedEntryId`, `JournalLine.taxCodeId`, `SystemSettings.accountingMode`.
5. Add indexes: `JournalLine(taxCodeId)`, `Payment(postedEntryId)`.

Safe to deploy. No data migration. Auto-posting hooks check `AccountMapping` existence and silently no-op if mappings are empty (so existing systems without setup keep working).

### Deploy sequence

1. Merge to master. Phase 2 code is dormant — Phase 1 continues to work as before.
2. Admin clicks **Run Setup** in Settings → Accounting. Seeds tax codes + mappings.
3. Admin reviews mappings (`/accounting/mapping`); fixes any unmapped keys if using a non-default chart.
4. Admin optionally runs **Backfill** from a chosen historical date.
5. Admin sets `accountingMode` to ACCRUAL if desired (default CASH is fine for most rentals).
6. Subsequent Payment / Booking writes auto-post.

### Documentation updates (same PR)

- `Hotel_Apartment_BRD.md` → v2.2. Add §4.11 Accounting Phase 2. Update §6 if needed.
- `docs/manual-test-plan.md` → new §20.
- No CLAUDE.md changes needed.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Payment/Booking write succeeds but JE fails — partial state | Posting calls participate in the parent `$transaction`; if posting throws, the operational write rolls back too. Tested explicitly. |
| Mapping points at the wrong account → silent miscategorization | Setup endpoint flags unmapped keys; mapping page banner; audit-log entry on every mapping change (via existing AUDIT infrastructure). |
| User toggles CASH ↔ ACCRUAL mid-month → inconsistent books | Helper text warns. Period close (Phase 3) is the proper guard. Document the limitation; rely on user discipline. |
| Backfill on huge history times out | Synchronous is adequate for expected sizes (<5k payments). If a customer hits limits, revisit (job queue is a Phase 3+ concern). |
| Decimal rounding drift on many small payments | `HALF_EVEN` rounding applied once per VAT calculation; `net = gross - vat` keeps each line exact. Tested with 100/5% and 105/5% cases. |
| REVERSED payment still appears in revenue reports | Reports query already filters by JE source; the reversing JE nets out automatically. Trial balance and GL show both entries (audit trail). |
| Tax-code default flipped → past bookings still reference old default | `Booking.taxCodeId` is stored at create time; once set, never changes. |
| Mapping references an inactive Account | `AccountMapping.account onDelete: Restrict` (account can be deactivated but FK is preserved; lookup still resolves). |
| TaxCode deletion orphans JournalLine references | `JournalLine.taxCode onDelete: SetNull` — orphaned lines show "Unknown tax code" in VAT return (recoverable) rather than blocking deletion. Active deletion is also blocked by the controller (deactivate instead). |
| Direct prisma writes to JournalEntry/Line bypass PostingService | Code-review convention from Phase 1 carries forward. No new bypass paths introduced. |

---

## Open questions (none blocking)

All key calls were settled during brainstorming on 2026-05-16:

- Posting trigger: configurable CASH (default) / ACCRUAL via setting. ✓
- VAT model: tax-inclusive, banker's rounding. ✓
- Account mapping: dedicated `AccountMapping` table (not Settings columns). ✓
- Deposits: full lifecycle auto-posting. ✓
- Backfill: synchronous, idempotent. ✓
- Reversal: REVERSED PaymentStatus + reversing JE. ✓
- Backfill failure semantics: per-row transaction; failures reported, don't halt. ✓
- Mode-toggle guardrail: soft warning, no hard block. ✓ (Phase 3 period-lock will harden.)
- `postedEntryId` cleared on reversal: **No** — preserve audit trail. ✓
- Posting method accepts optional `tx`: **Yes** — required for atomicity. ✓

---

## Out-of-scope reminders (do not add to Phase 2)

These are intentionally excluded; each has a home in a later phase.

- **`FiscalPeriod` model + period lock** → Phase 3
- **Income statement, balance sheet, cash flow** → Phase 3
- **Reversing-entry helper for manual entries** → Phase 3 (Phase 2 only reverses auto-posted payments)
- **Bank accounts, statement import, reconciliation** → Phase 4
- **Dedicated expense-entry workflow** → Phase 3
- **Asynchronous backfill (job queue / SSE)** → out of v1 unless data volume forces it
- **Fixed assets, depreciation** → out of v1
- **Multi-currency** → out of v1
- **Multi-tenant scoping** → not planned
