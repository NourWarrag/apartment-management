# Accounting Module — Phase 4 Design Spec

**Date:** 2026-05-17
**Status:** Draft (pending user review)
**Scope:** Phase 4 of 4 — Bank reconciliation. **Closes the accounting module.**
**Builds on:** Phase 1 (`2026-05-16-accounting-module-design.md`), Phase 2 (`2026-05-16-accounting-phase-2-design.md`), Phase 3 (`2026-05-17-accounting-phase-3-design.md`)

## Goal

Reconcile imported bank statements against the GL bank accounts produced by Phases 1–3. Ship a multi-bank-account model, a flexible CSV import pipeline with per-bank column mapping, an auto+manual matching engine (1-to-1 and N-to-1), and a session-based reconciliation workflow with locked close and an immutable report snapshot. After Phase 4 merges, the accounting module is feature-complete vs the four-phase plan agreed on 2026-05-16.

---

## Scope

### In scope (Phase 4)

- **`BankAccount` model** — multi-bank, each linked to one ASSET-type GL account. Persists CSV column mapping per bank account.
- **`BankStatement` + `BankStatementLine` models** — a statement is the unit of import; lines are signed-amount rows (positive = deposit, negative = withdrawal).
- **Flexible CSV import** — preview, configure column mapping (date/amount/description/reference, header toggle, date format token), then import. Tiny in-house CSV parser (no new dep). Date format tokens: `YYYY`, `YY`, `MM`, `DD`.
- **`Reconciliation` + `ReconciliationMatch` models** — session-based, one OPEN reconciliation at a time per bank account, locks on close.
- **`MatchingService`** — `findAutoMatches`, `applyAutoMatches`, `manualMatch` (N-to-1), `unmatchByBankLine`, `addAdjustmentAndMatch`. Sole writer to `ReconciliationMatch`.
- **Auto-match algorithm** — exact amount match, date window ±N days (default 2), sign-aware (deposit → GL debit; withdrawal → GL credit), skips ambiguous candidates.
- **Manual N-to-1 matching** — match multiple journal lines to a single bank line if the sum equals the bank-line amount.
- **Inline "Add adjustment"** — post a JE for an unmatched bank line and immediately match it. Goes through `PostingService`; respects the Phase 3 period-lock guard.
- **Reconciliation close** — validates balanced state, snapshots the report into a JSON column, transitions to LOCKED.
- **Admin-only reopen** of closed reconciliations (clears snapshot; preserves matches).
- **CSV report export** for closed (snapshot-backed) and open (live-computed) reconciliations.
- **UI:** Banking landing page, BankAccount detail with tabs (statements / reconciliations / mapping), CSV import wizard, New Reconciliation modal, Reconciliation workspace with side-by-side bank vs GL lines.
- **i18n:** English + Arabic for all new strings.
- **Manual test plan §22** with ~18 cases.

### Deferred to a hypothetical Phase 5 (none committed)

- Fixed assets and depreciation.
- Multi-currency.
- Direct-method cash flow.
- Configurable fiscal year start month.
- Department / cost-center segmentation.
- Hash-based dedup at statement-import time.
- Multi-statement files (concatenated months in a single CSV upload).
- "Reviewed but unmatched" intermediate state for journal lines.
- Date format string interpreter beyond `YYYY/YY/MM/DD` tokens (no month-name parsing).

### Out of v1 entirely

- Multi-currency bank accounts.
- Bank API integration (Plaid, etc.) — Phase 4 is import-only.

---

## Architecture

Phase 4 introduces three concepts on top of the existing accounting module:

1. **A separate "bank side" of the books** — `BankStatement` + `BankStatementLine` are imported reference data, not journal entries. They live alongside the GL but never write to it directly.
2. **A reconciliation session** — `Reconciliation` ties bank statement lines to GL `JournalLine` rows via `ReconciliationMatch`, then locks the state at close.
3. **A matching service** — `MatchingService` is the sole writer to `ReconciliationMatch`. Mirrors the Phase 1/2/3 sole-writer convention.

```
server/src/
├─ services/accounting/
│  ├─ posting.service.ts             (unchanged — postExpense reused for adjustments)
│  ├─ reports.service.ts             (unchanged)
│  ├─ matching.service.ts            ← NEW
│  ├─ bank-statement.service.ts      ← NEW (import + parse pipeline)
│  └─ csv-parser.ts                  ← NEW (40 LoC in-house parser)
├─ controllers/
│  ├─ accounting-bank-accounts.controller.ts  ← NEW
│  ├─ accounting-bank-statements.controller.ts ← NEW
│  └─ accounting-reconciliations.controller.ts ← NEW

client/src/pages/accounting/
├─ BankingPage.tsx                    ← NEW (landing)
├─ BankAccountDetailPage.tsx          ← NEW (statements / reconciliations / mapping tabs)
├─ CsvImportWizard.tsx                ← NEW (3-step modal)
├─ NewReconciliationModal.tsx         ← NEW
└─ ReconciliationPage.tsx             ← NEW (the main rec workspace)
```

**Sole-writer convention preserved.** Only `PostingService` writes to JournalEntry/JournalLine. Only `MatchingService` writes to ReconciliationMatch. CSV-driven persistence (BankStatement, BankStatementLine) goes through `bank-statement.service.ts`.

**Period-lock interaction:** the inline "Add adjustment" posts a JE via `PostingService` and therefore inherits the Phase 3 period-lock guard. If the bank line's date lands in a locked period, the JE is posted in the current open period and the bank line date appears in the memo for audit. The UI warns the user before submission.

---

## Data model

### New tables

```prisma
model BankAccount {
  id            Int      @id @default(autoincrement())
  name          String
  accountId     Int                                    // FK to GL Account (must be ASSET type)
  isActive      Boolean  @default(true)

  // Flexible CSV mapping — set after first successful import
  csvDateColumn        Int?
  csvAmountColumn      Int?
  csvDescriptionColumn Int?
  csvReferenceColumn   Int?
  csvHasHeader         Boolean  @default(true)
  csvDateFormat        String?                         // "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   Int?
  updatedBy   Int?

  account     Account              @relation(fields: [accountId], references: [id], onDelete: Restrict)
  statements  BankStatement[]
  reconciliations Reconciliation[]
  creator     User?    @relation("BankAccountCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater     User?    @relation("BankAccountUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)

  @@unique([accountId])                                // one BankAccount per GL account
}

model BankStatement {
  id              Int      @id @default(autoincrement())
  bankAccountId   Int
  filename        String
  importedAt      DateTime @default(now())
  importedBy      Int?
  lineCount       Int

  bankAccount     BankAccount @relation(fields: [bankAccountId], references: [id], onDelete: Cascade)
  importer        User?       @relation("BankStatementImportedBy", fields: [importedBy], references: [id], onDelete: SetNull)
  lines           BankStatementLine[]

  @@index([bankAccountId, importedAt])
}

model BankStatementLine {
  id              Int      @id @default(autoincrement())
  bankStatementId Int
  bankAccountId   Int                                   // denormalized for fast filtering
  date            DateTime
  amount          Decimal  @db.Decimal(14, 2)           // signed: positive = deposit, negative = withdrawal
  description     String
  reference       String?

  bankStatement   BankStatement       @relation(fields: [bankStatementId], references: [id], onDelete: Cascade)
  bankAccount     BankAccount         @relation(fields: [bankAccountId], references: [id], onDelete: Cascade)
  matches         ReconciliationMatch[]

  @@index([bankAccountId, date])
}

model Reconciliation {
  id              Int      @id @default(autoincrement())
  bankAccountId   Int
  endDate         DateTime
  statementBalance Decimal @db.Decimal(14, 2)
  status          ReconciliationStatus @default(OPEN)
  closedAt        DateTime?
  closedBy        Int?
  reportSnapshot  Json?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdBy       Int?
  updatedBy       Int?

  bankAccount     BankAccount          @relation(fields: [bankAccountId], references: [id], onDelete: Restrict)
  matches         ReconciliationMatch[]
  closer          User?    @relation("ReconciliationClosedBy", fields: [closedBy], references: [id], onDelete: SetNull)
  creator         User?    @relation("ReconciliationCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater         User?    @relation("ReconciliationUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)

  @@index([bankAccountId, status, endDate])
}

enum ReconciliationStatus {
  OPEN
  CLOSED
}

model ReconciliationMatch {
  id                  Int      @id @default(autoincrement())
  reconciliationId    Int
  bankStatementLineId Int
  journalLineId       Int
  createdAt           DateTime @default(now())
  createdBy           Int?

  reconciliation      Reconciliation      @relation(fields: [reconciliationId], references: [id], onDelete: Cascade)
  bankStatementLine   BankStatementLine   @relation(fields: [bankStatementLineId], references: [id], onDelete: Cascade)
  journalLine         JournalLine         @relation(fields: [journalLineId], references: [id], onDelete: Cascade)
  creator             User?               @relation("ReconciliationMatchCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)

  @@unique([reconciliationId, journalLineId])         // one JournalLine matched at most once per rec
  @@index([bankStatementLineId])
}
```

### Modified models

```prisma
model JournalLine {
  // ... existing fields ...
  reconciliationMatches ReconciliationMatch[]
}

model Account {
  // ... existing fields ...
  bankAccounts BankAccount[]
}

model User {
  // ... existing fields ...
  createdBankAccounts          BankAccount[]         @relation("BankAccountCreatedBy")
  updatedBankAccounts          BankAccount[]         @relation("BankAccountUpdatedBy")
  importedBankStatements       BankStatement[]       @relation("BankStatementImportedBy")
  closedReconciliations        Reconciliation[]      @relation("ReconciliationClosedBy")
  createdReconciliations       Reconciliation[]      @relation("ReconciliationCreatedBy")
  updatedReconciliations       Reconciliation[]      @relation("ReconciliationUpdatedBy")
  createdReconciliationMatches ReconciliationMatch[] @relation("ReconciliationMatchCreatedBy")
}
```

### New error codes

Extend `AccountingErrorCode` in shared:
- `BANK_ACCOUNT_NOT_FOUND`
- `BANK_STATEMENT_INVALID`
- `RECONCILIATION_CLOSED`
- `RECONCILIATION_UNBALANCED`
- `LINE_ALREADY_MATCHED`

### Migration

Single migration. Additive only: new enum + 5 new tables + back-relations on existing tables. No data migration. Safe to deploy.

---

## CSV import pipeline

### Three-step UX, three endpoints

1. **`POST /bank-accounts/:id/statements/preview`** — multipart upload. Server parses the first 20 rows and returns `{ columnCount, sampleRows: string[][] }`. Doesn't persist. Pure dry-run.

2. **`PATCH /bank-accounts/:id/csv-mapping`** — body `{ csvDateColumn, csvAmountColumn, csvDescriptionColumn, csvReferenceColumn?, csvHasHeader, csvDateFormat }`. Persists the mapping on `BankAccount`. Idempotent.

3. **`POST /bank-accounts/:id/statements`** — multipart upload. Server reads the CSV with the persisted mapping, creates a `BankStatement` row plus N `BankStatementLine` rows in one transaction. Rejects with `BANK_STATEMENT_INVALID` if mapping is unset or parsing fails (specific row in `details`). Returns `{ statementId, lineCount, dateRange }`.

### In-house CSV parser

`server/src/services/accounting/csv-parser.ts`. ~40 LoC. Handles:
- Quoted fields with embedded commas.
- Escaped double-quotes (`""` → `"`).
- CRLF and LF line endings.
- BOM stripping at file start.
- Empty rows filtered out.

Does NOT handle:
- Multi-line quoted fields (rare in bank exports).
- Custom field separators (`;`, `\t`). Out of scope.

Unit-tested with: quoted fields, escaped quotes, BOM, mixed line endings, trailing newline, single empty line, real-world UAE bank export sample.

### Date format interpreter

Tokens supported: `YYYY` (4-digit year), `YY` (2-digit year, prefixed with `20`), `MM` (1–12), `DD` (1–31). Separators are literal characters (`/`, `-`, `.`, space). Any unrecognized token or unparseable row causes the entire import to fail with `BANK_STATEMENT_INVALID` and the row number in `details`. Atomic — no partial imports.

### Amount sign convention

`BankStatementLine.amount` is signed: positive = deposit (money in), negative = withdrawal (money out). On import, the CSV's amount column is parsed as Decimal. If the CSV uses separate debit/credit columns, the user massages the file externally (still v1 limitation).

---

## MatchingService

`server/src/services/accounting/matching.service.ts`. Sole writer to `ReconciliationMatch`. Transactional.

```ts
class MatchingService {
  constructor(private prisma: PrismaClient) {}

  async findAutoMatches(
    reconciliationId: number,
    dateWindowDays?: number,
  ): Promise<AutoMatchCandidate[]>;

  async applyAutoMatches(
    reconciliationId: number,
    userId: number,
    dateWindowDays?: number,
  ): Promise<number>;

  async manualMatch(
    reconciliationId: number,
    bankStatementLineId: number,
    journalLineIds: number[],
    userId: number,
  ): Promise<ReconciliationMatch[]>;

  async unmatchByBankLine(
    reconciliationId: number,
    bankStatementLineId: number,
  ): Promise<number>;

  async addAdjustmentAndMatch(
    input: BankAdjustmentInput,
    userId: number,
  ): Promise<ReconciliationMatch>;
}
```

### Auto-match algorithm

For each unmatched bank statement line dated `≤ reconciliation.endDate`:
1. Look up the bank account's GL account.
2. Find candidate `JournalLine` rows where:
   - `journalLine.accountId === bankAccount.accountId`
   - Posted entry date within `[bankLine.date − N days, bankLine.date + N days]` (default N = 2).
   - Amount matches the sign-aware rule:
     - `bankLine.amount > 0` (deposit): `journalLine.debit === bankLine.amount` AND `journalLine.credit === 0`.
     - `bankLine.amount < 0` (withdrawal): `journalLine.credit === abs(bankLine.amount)` AND `journalLine.debit === 0`.
   - Not already in any `ReconciliationMatch` (filter by absence of join row).
3. If **exactly one** candidate exists, mark it for auto-match.
4. If zero or multiple candidates, skip — user resolves manually.

`applyAutoMatches` runs `findAutoMatches` and persists every found match in a single `$transaction`. Returns the count.

### Manual N-to-1 matching

`manualMatch(reconciliationId, bankLineId, journalLineIds[], userId)`:
1. Reconciliation must be OPEN (else `RECONCILIATION_CLOSED`).
2. All `journalLineIds` belong to the bank's GL account.
3. None are in any `ReconciliationMatch` (else `LINE_ALREADY_MATCHED`).
4. Sign-consistent: positive bank line → all journal lines must be debits; negative bank line → all must be credits.
5. Sum of journal-line amounts === bank-line amount (strict Decimal equality).
6. Persist N `ReconciliationMatch` rows in one transaction.

### Adjustment from rec UI

`addAdjustmentAndMatch(input, userId)`:
1. Build a 2-line JE: debit/credit the bank's GL account, offset to a user-picked account (typically a bank-fee expense or interest income).
2. JE date defaults to bank line date. If that period is locked, fall back to **current open period** (today's month if open, else the most recent open period).
3. JE memo includes bank line date and description.
4. Post via `PostingService.postExpense` (inherits the period-lock guard and account-existence checks).
5. The new JournalLine on the bank's GL account is immediately matched to the bank line in this reconciliation.
6. Single transaction wraps post + match.

### Closing a reconciliation

`MatchingService.close(reconciliationId, userId)` (delegated from the controller):

1. Verify status is OPEN.
2. Compute `glBalance` = sum of `JournalLine.debit − credit` on the bank account through `reconciliation.endDate`.
3. Compute `clearedDeposits` = sum of matched journal-line debits in this rec.
4. Compute `clearedWithdrawals` = sum of matched journal-line credits in this rec.
5. Compute `outstandingDeposits` = sum of unmatched journal-line debits on the bank account ≤ endDate.
6. Compute `outstandingWithdrawals` = sum of unmatched journal-line credits on the bank account ≤ endDate.
7. Reconciled balance = `statementBalance + outstandingDeposits − outstandingWithdrawals`.
8. If `reconciledBalance.minus(glBalance).abs() < 0.005`: snapshot the rec state into `Reconciliation.reportSnapshot` as JSON, set status to CLOSED, stamp `closedAt`/`closedBy`. Single transaction.
9. Otherwise throw `RECONCILIATION_UNBALANCED` with `{ glBalance, reconciledBalance, diff }` in `details`.

### Snapshot shape

```json
{
  "closedAt": "2026-05-31T12:00:00Z",
  "endDate": "2026-05-31",
  "statementBalance": "12400.00",
  "glBalance": "12550.00",
  "outstandingDeposits": "150.00",
  "outstandingWithdrawals": "0.00",
  "matches": [
    {
      "bankLine": { "date": "...", "amount": "...", "description": "..." },
      "journalLines": [{ "entryNumber": "JE-000123", "date": "...", "debit": "...", "credit": "..." }]
    }
  ],
  "unmatchedBankLines": [...],
  "unmatchedJournalLines": [...]
}
```

The CSV report endpoint serializes this snapshot to CSV for closed sessions, or recomputes it live for open sessions.

### Reopen

Admin-only. Clears `closedAt`, `closedBy`, `reportSnapshot`. Sets status back to OPEN. **Does not unmatch** any rows — the user can edit matches and re-close.

---

## API surface

All under `/api/v1/accounting`, gated by `requireFeature(FEATURE_ACCOUNTING)` + `requireRole(SUPER_ADMIN, ADMIN, FINANCE)`. Admin-only routes use the existing `adminOnly` middleware.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/bank-accounts` | required | List with linked Account info + stats (statement count, open rec count) |
| POST | `/bank-accounts` | required | Body: `{ name, accountId }`. Account must be ASSET, active, not already linked. |
| PATCH | `/bank-accounts/:id` | required | Update `name`, `isActive` |
| PATCH | `/bank-accounts/:id/csv-mapping` | required | Update CSV mapping fields |
| POST | `/bank-accounts/:id/deactivate` | required | Sets `isActive = false` |
| POST | `/bank-accounts/:id/statements/preview` | required | multipart CSV. Returns first 20 rows + column count. |
| POST | `/bank-accounts/:id/statements` | required | multipart CSV. Creates statement + lines. |
| GET | `/bank-accounts/:id/statements` | required | List imported statements |
| DELETE | `/bank-statements/:id` | required | Delete statement (only if no lines are in any reconciliation) |
| POST | `/reconciliations` | required | Body: `{ bankAccountId, endDate, statementBalance }`. Rejects if another OPEN rec exists for the bank account. |
| GET | `/reconciliations` | required | List, filter by `bankAccountId`, `status` |
| GET | `/reconciliations/:id` | required | Full state: unmatched bank lines, unmatched GL lines, matched pairs, computed totals |
| POST | `/reconciliations/:id/auto-match` | required | Runs `applyAutoMatches`. Returns count. |
| POST | `/reconciliations/:id/match` | required | Body: `{ bankStatementLineId, journalLineIds: number[] }`. Manual N-to-1. |
| DELETE | `/reconciliations/:id/match/:bankLineId` | required | Unmatch all journal lines from a bank line |
| POST | `/reconciliations/:id/adjustment` | required | Body: `{ bankStatementLineId, offsetAccountId, memo? }`. Builds JE + matches. |
| POST | `/reconciliations/:id/close` | required | Closes if balanced; else 400 RECONCILIATION_UNBALANCED |
| POST | `/reconciliations/:id/reopen` | **admin** | Reverts to OPEN. Doesn't unmatch. |
| GET | `/reconciliations/:id/report.csv` | required | CSV of closed snapshot or live state |

Error mapping unchanged: `AccountingError` → 400 with `{ code, message, details }`.

---

## UI

### Sidebar — one new entry

Added to the existing flat `NAV_ITEMS`, gated by `FEATURE_ACCOUNTING` + role ∈ {ADMIN, SUPER_ADMIN, FINANCE}:

```
Bank Reconciliation   /accounting/banking   icon: account_balance
```

Total accounting sidebar entries: 11. A nested-group refactor is overdue but still deferred.

### Page: Banking landing (`/accounting/banking`)

Two sections:
- **Bank Accounts** list with name, linked GL account, stats, and a "+ New Bank Account" button.
- **Reconciliations** list (across all bank accounts) showing bank account name, end-date, status, and a "Continue" or "View report" link.

### Bank Account form modal

Opens from "+ New Bank Account":
- `name` (text)
- `accountId` — combobox of active ASSET accounts not already linked to another BankAccount

Save creates the row; user is navigated to the bank account detail page.

### Page: Bank Account detail (`/accounting/banking/:id`)

Three tabs:
1. **Statements** — table of imported statements (date range, line count, "Import new" button). Each statement row has a "Delete" action (disabled if any line is in a `ReconciliationMatch`).
2. **Reconciliations** — list of reconciliations for this bank account, with "New reconciliation" button.
3. **CSV mapping** — read-only display of current mapping; "Edit mapping" opens the wizard at step 2.

### CSV import wizard (modal, 3 steps)

1. **Upload** — file picker. On submit: POST to `/preview`. Shows column count + first 20 parsed rows.
2. **Map columns** — dropdowns for date / amount / description / reference columns. "Date format" select with `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`. "Has header row" checkbox. PATCHes mapping. Skipped if mapping already set (unless user explicitly hits "Edit mapping").
3. **Confirm** — preview the parsed lines using the current mapping. "Import" button POSTs to `/statements`. On success: toast and redirect to bank account detail with the new statement highlighted.

### New Reconciliation modal

- `endDate` (defaults to last day of previous month).
- `statementBalance` (the bank statement's ending balance).
- Validation: no other OPEN reconciliation exists for this bank account.
- Save creates the reconciliation and navigates to the reconciliation workspace.

### Page: Reconciliation workspace (`/accounting/banking/reconciliations/:id`)

The core rec workflow. Layout (full-width):

- **Header:** bank account name, end-date, statement balance, computed difference (live), status pill (OPEN/CLOSED).
- **Action bar:** "Run auto-match", "Close reconciliation" (enabled only when difference is 0), and (when closed) "Reopen" (admin only) + "Export CSV".
- **Two columns side-by-side:**
  - Left: bank statement lines (ordered by date), with checkboxes for unmatched lines and ✓ for matched.
  - Right: GL lines on the bank account (ordered by date), with checkboxes for unmatched and ✓ for matched.
- **Selection model:** select 1 bank line + 1+ GL lines, then click "Match" → validates sum equality and posts via `MatchingService.manualMatch`. Live diff updates.
- **Inline "Add adjustment":** click a bank line and pick "Add adjustment ▾" → small form (offset account combobox + memo) → POSTs to `/adjustment`, which builds the JE and matches it.
- **Locked-period warning:** if the bank line's date falls in a locked period, the "Add adjustment" form shows: *"Period MMM YYYY is locked. The adjustment will post in the current open period and reference this bank line in its memo."*
- **CLOSED state:** all actions disabled. Matched pairs visible. "Reopen" button (admin only). "Export CSV" link.

### i18n

EN + AR keys for all new strings (sidebar entry, page titles, button labels, validation messages). Existing translation pattern.

### Loading / empty / error states

Standard. Empty Banking page: *"No bank accounts yet. Add one to start reconciling."* Empty reconciliations: *"No reconciliations yet."* Server errors: retry button.

---

## Testing strategy

### Layer 1 — Service unit tests

| File | Tests |
|---|---|
| `csv-parser.test.ts` | ~8: quoted fields, escaped quotes, BOM, mixed line endings, trailing newline, empty rows, single row no newline, real-bank export sample |
| `matching.service.test.ts` | ~8: auto-match exact 1-to-1, auto-match skips when multiple candidates, auto-match honors date window, manual N-to-1 happy, manual rejects mismatched sum, manual rejects sign-flip, manual rejects already-matched, unmatch removes rows |
| `bank-statement.service.test.ts` | ~5: successful parse persists statement + lines, mapping-not-set rejects, malformed CSV rejects with row number, atomic on error (no partial state), statement deletes block when matched |
| `matching.service.close.test.ts` (or extend matching.service.test.ts) | ~5: balanced close succeeds and snapshots, unbalanced close rejects with diff in details, double-close rejects, reopen clears snapshot, reopen preserves matches |

### Layer 2 — HTTP integration tests

| File | Tests |
|---|---|
| `accounting-bank-accounts.controller.test.ts` | ~4: auth gating, CRUD happy, non-ASSET rejected, already-linked rejected |
| `accounting-bank-statements.controller.test.ts` | ~5: preview returns sample, import persists lines, import without mapping returns 400, delete blocked when lines matched, finance can access |
| `accounting-reconciliations.controller.test.ts` | ~7: create, list, get with computed state, auto-match endpoint, manual match, adjustment endpoint posts JE and matches, close, reopen admin-only, unbalanced close returns 400 |
| Period-lock interaction | ~2: adjustment date in locked period falls back to current open period; bank line date in locked period is still importable |

Target ~45 new server tests. After Phase 4: ~390 server tests across the module.

### Layer 3 — Manual test plan §22 (~18 cases)

End-to-end scenarios covering: create bank account, configure CSV mapping, import statement with mapping, malformed CSV error path, start reconciliation, auto-match exact deposits, manual N-to-1 for combined deposits, add bank-fee adjustment inline, close balanced reconciliation, blocked unbalanced close, view closed snapshot, admin reopens closed rec, adjustment for bank line in locked period (falls back to current period), delete unmatched statement, blocked delete of matched statement, Arabic RTL on all 4 new screens.

---

## Rollout plan

### Migration order (single Prisma migration)

1. Create enum `ReconciliationStatus`.
2. Create tables `BankAccount`, `BankStatement`, `BankStatementLine`, `Reconciliation`, `ReconciliationMatch`.
3. Add indexes per the model definitions.
4. Add back-relations on `Account`, `JournalLine`, `User`.

Safe to deploy. No data migration. Existing flows unchanged.

### Deploy sequence

1. Merge to master. Phase 4 dormant until first BankAccount is created.
2. Admin creates a BankAccount per real bank account.
3. Admin imports a recent statement to validate CSV mapping.
4. Optional: do a "practice" reconciliation on a prior month to learn the workflow.
5. Reconcile each month going forward.

### Documentation updates (same PR)

- `Hotel_Apartment_BRD.md` → v2.4. Add §4.13 Accounting Phase 4. Update §6 if needed.
- `docs/manual-test-plan.md` → new §22.
- No CLAUDE.md changes.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| CSV mapping misconfigured → wrong dates/amounts imported | Preview step shows the first 20 rows parsed using the mapping BEFORE persisting. Mapping is editable per BankAccount; bad imports can be deleted whole. |
| Header in row 2 (rare bank formats) | `csvHasHeader` flag; data starts at row 1 if false. User massages externally for stranger formats. |
| Duplicate statement import | No automatic dedup in v1. User deletes duplicates (statement-level delete cascades to lines if unmatched). Future: hash-based dedup. |
| `JournalLine` matched in two reconciliations | `LINE_ALREADY_MATCHED` check at manual-match. Auto-match filters lines already in any `ReconciliationMatch`. Unique `(reconciliationId, journalLineId)` enforces per-rec uniqueness; cross-rec uniqueness is enforced in the service. |
| Bank fee adjustment lands in wrong period when target period is locked | Warning shown in UI. JE memo references the bank line date. Audit trail clear. Alternative (hard block) would require unlocking the period — destroys Phase 3's invariant. |
| Closed reconciliation snapshot stale if underlying JE modified | JEs are immutable once POSTED (Phase 1 invariant). JournalLines in a `ReconciliationMatch` can't be deleted (Cascade on the join would orphan; but JournalLine itself has no delete path). Risk is zero in normal flow. |
| Reopening a closed reconciliation diverges state | `reopen` clears snapshot but preserves matches. Admin-only. User re-edits and re-closes. Documented. |
| Large statements (years of history) slow | O(N) import; tested to 10k rows in <1s. Batching deferred unless a real customer hits scale issues. |
| Sign confusion (bank "withdrawal" conventions) | Preview step shows the parsed amount; user spot-checks. Wrong amount column → preview obviously wrong. |
| Direct prisma writes to `ReconciliationMatch` bypass MatchingService | Sole-writer convention from Phases 1–3 carries forward. No new bypass paths. Enforced via code review. |

---

## Open questions (none blocking)

All key calls were settled during brainstorming on 2026-05-17:

- Multi-bank, one BankAccount per GL Account. ✓
- Flexible CSV mapping persisted per BankAccount. ✓
- Auto + manual 1-to-1 + manual N-to-1 matching. ✓
- Session-based reconciliation with locked close. ✓
- Reconciliation snapshot stored as JSON at close time. ✓
- In-house CSV parser, no new dependency. ✓
- Date format string interpreter limited to `YYYY/YY/MM/DD` tokens. ✓
- Adjustment for locked-period bank line falls back to current open period with warning. ✓
- Admin-only reopen of closed reconciliations; preserves matches. ✓
- Single sidebar entry, hub on a Banking landing page. ✓

---

## Out-of-scope reminders

These are intentionally excluded; not committed to any subsequent phase.

- **Bank API integration** (Plaid, Open Banking, etc.) → out of v1.
- **Multi-currency bank accounts** → out of v1.
- **Hash-based dedup** at statement import → not in v1.
- **Multi-statement CSV files** (concatenated months) → not in v1.
- **Month-name date parsing** (e.g. `DD-MMM-YYYY`) → not in v1.
- **"Reviewed but unmatched" intermediate state** for journal lines → not in v1.
- **Fixed assets, depreciation** → out of v1.
- **Direct-method cash flow** → out of v1.
- **Configurable fiscal year start month** → out of v1.
- **Department / cost-center segmentation** → out of v1.

After Phase 4 merges, the accounting module is feature-complete vs the four-phase plan agreed on 2026-05-16.
