# Accounting Module — Phase 1 Design Spec

**Date:** 2026-05-16
**Status:** Draft (pending user review)
**Scope:** Phase 1 of 4 — Foundation only.

## Goal

Add a full double-entry accounting module to the Hotel Apartment Management System. Phase 1 ships the foundation: chart of accounts, manual journal entries, general ledger, trial balance, and a books-mode setting. Subsequent phases add auto-posting + VAT (Phase 2), financial statements + period close (Phase 3), and bank reconciliation (Phase 4).

The system already tracks revenue via Payments but has no chart of accounts, no expenses, no ledger, and no true financial statements. Phase 1 puts the bones in place that everything else builds on.

---

## Scope

### In scope (Phase 1)

- Chart of Accounts CRUD with five account types (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE) and self-referential parent for hierarchy.
- Manual journal entries with DRAFT and POSTED states.
- PostingService — the sole writer to the ledger; enforces balance invariant transactionally.
- General Ledger view per account with running balance.
- Trial Balance report with imbalance banner.
- Building tag on every transaction (header and/or line level), nullable.
- `booksMode` setting on `SystemSettings`: `CONSOLIDATED` (default) or `PER_BUILDING`. Controls report defaults only — never the data shape.
- `FEATURE_ACCOUNTING` feature flag gating both server routes and client navigation.
- Access: `ADMIN`, `SUPER_ADMIN`, `FINANCE` get full access. All other roles get no access.
- CSV export from Trial Balance and General Ledger.
- i18n: English + Arabic with RTL support, matching existing patterns.

### Deferred to later phases

- Auto-posting from Payments → **Phase 2**.
- Tax codes / VAT handling / VAT return report → **Phase 2**.
- Account-mapping configuration (which CASH/Bank account a payment posts to) → **Phase 2**.
- `FiscalPeriod` model + period locking + year-end close to retained earnings → **Phase 3**.
- Income statement, balance sheet, cash flow → **Phase 3**.
- Reversing-entry workflow ("void posted entry" UI) → **Phase 3**, alongside period lock.
- Bank accounts, statement import, line matching, reconciliation → **Phase 4**.

### Out of v1 entirely

- Fixed assets & depreciation.
- Multi-currency (everything in `SystemSettings.currency`, default AED).
- Multi-tenant scoping (`companyId`). Single-tenant system.

---

## Architecture

Native build on Prisma + Express, mirroring existing controller/route/test layout. Not a third-party accounting library and not external sync — those fight the stack and don't know about buildings/bookings.

Module boundary:

```
server/src/
├─ controllers/
│  ├─ accounting-accounts.controller.ts        (Chart of Accounts CRUD)
│  ├─ accounting-journal.controller.ts         (Journal Entry CRUD + post)
│  └─ accounting-reports.controller.ts         (Trial balance, GL)
├─ routes/
│  └─ accounting.routes.ts
├─ services/
│  └─ accounting/
│     ├─ posting.service.ts                    (sole writer to JE/JL)
│     ├─ posting.service.test.ts
│     ├─ posting.errors.ts                     (AccountingError + codes)
│     └─ reports.service.ts                    (trial balance, GL queries)
└─ middleware/
   (existing requireFeature, requireRole reused)

client/src/pages/accounting/
├─ AccountsPage.tsx
├─ JournalEntriesPage.tsx
├─ JournalEntryEditorPage.tsx        (handles /new and /:id/edit)
├─ JournalEntryDetailPage.tsx        (read-only for POSTED)
├─ GeneralLedgerPage.tsx
└─ TrialBalancePage.tsx
```

**Critical invariant:** Only `PostingService` writes to `JournalEntry` and `JournalLine`. Controllers never call `prisma.journalEntry.*` directly. Enforced by code review.

---

## Data model

### New enums

```prisma
enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  INCOME
  EXPENSE
}

enum JEStatus {
  DRAFT
  POSTED
}

enum JESource {
  MANUAL           // Phase 1 — only value used
  PAYMENT_AUTO     // Phase 2 placeholder
  VAT_ADJUST       // Phase 2 placeholder
  YEAR_END_CLOSE   // Phase 3 placeholder
}

enum BooksMode {
  CONSOLIDATED
  PER_BUILDING
}
```

`JESource` placeholder values exist in the schema from Phase 1 so Phase 2 adds no enum-migration churn.

### New models

```prisma
model Account {
  id          Int          @id @default(autoincrement())
  code        String       @unique
  name        String
  type        AccountType
  parentId    Int?
  isActive    Boolean      @default(true)
  description String?

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  createdBy   Int?
  updatedBy   Int?

  parent      Account?     @relation("AccountParent", fields: [parentId], references: [id], onDelete: Restrict)
  children    Account[]    @relation("AccountParent")
  lines       JournalLine[]

  creator     User?        @relation("AccountCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater     User?        @relation("AccountUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)

  @@index([type, isActive])
}

model JournalEntry {
  id          Int          @id @default(autoincrement())
  entryNumber String       @unique
  date        DateTime
  memo        String?
  buildingId  Int?
  status      JEStatus     @default(DRAFT)
  source      JESource     @default(MANUAL)
  sourceRefId Int?
  postedAt    DateTime?
  postedBy    Int?

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  createdBy   Int?
  updatedBy   Int?

  building    Building?    @relation("JEBuilding", fields: [buildingId], references: [id], onDelete: Restrict)
  lines       JournalLine[]
  poster      User?        @relation("JEPostedBy", fields: [postedBy], references: [id], onDelete: SetNull)
  creator     User?        @relation("JECreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater     User?        @relation("JEUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)

  @@index([status, date])
  @@index([date])
  @@index([source, sourceRefId])
}

model JournalLine {
  id             Int          @id @default(autoincrement())
  journalEntryId Int
  accountId      Int
  buildingId     Int?
  debit          Decimal      @db.Decimal(14, 2) @default(0)
  credit         Decimal      @db.Decimal(14, 2) @default(0)
  description    String?
  lineOrder      Int

  journalEntry   JournalEntry @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
  account        Account      @relation(fields: [accountId], references: [id], onDelete: Restrict)
  building       Building?    @relation("JLBuilding", fields: [buildingId], references: [id], onDelete: Restrict)

  @@index([accountId])
  @@index([journalEntryId])
}
```

### Modified models

```prisma
model SystemSettings {
  // ...existing fields...
  booksMode   BooksMode    @default(CONSOLIDATED)
}

model Building {
  // ...existing fields...
  journalEntries JournalEntry[] @relation("JEBuilding")
  journalLines   JournalLine[]  @relation("JLBuilding")
}

model User {
  // ...existing fields...
  createdAccounts        Account[]      @relation("AccountCreatedBy")
  updatedAccounts        Account[]      @relation("AccountUpdatedBy")
  postedJournalEntries   JournalEntry[] @relation("JEPostedBy")
  createdJournalEntries  JournalEntry[] @relation("JECreatedBy")
  updatedJournalEntries  JournalEntry[] @relation("JEUpdatedBy")
}
```

### Migration steps (single migration)

1. Create enums `AccountType`, `JEStatus`, `JESource`, `BooksMode`.
2. Create tables `Account`, `JournalEntry`, `JournalLine`.
3. Create indexes listed above.
4. Create sequence `journal_entry_number_seq` (start 1, increment 1).
5. Add CHECK constraint on `JournalLine`:
   `CHECK ((debit = 0 AND credit > 0) OR (debit > 0 AND credit = 0))`.
6. ALTER `SystemSettings` ADD COLUMN `booksMode` with default `'CONSOLIDATED'`.

No data backfill. Safe to deploy with the flag off.

### Decimal precision

`Decimal(14, 2)` on `JournalLine.debit` and `JournalLine.credit` — wider than `Booking`/`Payment` (10, 2) so accumulated balances over time can't overflow. Prisma `Decimal` end-to-end on the server; `decimal.js` on the client for line-total math. **Never `number`** for monetary values.

---

## PostingService API

Single class in `server/src/services/accounting/posting.service.ts`. Sole writer to `JournalEntry` and `JournalLine`.

```ts
type LineInput = {
  accountId: number;
  buildingId?: number | null;
  debit?: string | Decimal;       // exactly one of debit/credit > 0
  credit?: string | Decimal;
  description?: string;
};

type EntryInput = {
  date: Date;
  memo?: string;
  buildingId?: number | null;
  lines: LineInput[];
};

class PostingService {
  createDraft(input: EntryInput, userId: number): Promise<JournalEntry>;
  updateDraft(id: number, input: EntryInput, userId: number): Promise<JournalEntry>;
  deleteDraft(id: number, userId: number): Promise<void>;
  post(id: number, userId: number): Promise<JournalEntry>;
  createAndPost(input: EntryInput, userId: number): Promise<JournalEntry>;
}
```

### Balance invariant (enforced by `post()` and `createAndPost()`)

Inside a single `prisma.$transaction`:

1. Every line: `debit >= 0`, `credit >= 0`, exactly one of them `> 0`.
2. `lines.length >= 2`.
3. `Σ debits === Σ credits` to the cent (compared as `Decimal`, not `number`).
4. Every `accountId` exists and `isActive = true`.
5. Every non-null `buildingId` (line or header) exists.
6. Entry is currently `DRAFT`.

On violation, the transaction rolls back and the service throws `AccountingError` with one of these codes:

| Code | Meaning |
|---|---|
| `UNBALANCED` | Σ debits ≠ Σ credits |
| `INVALID_LINE` | Line shape violation (zero on both sides, positive on both, negative) |
| `MIN_LINES` | Fewer than 2 lines |
| `INVALID_ACCOUNT` | Account missing or inactive |
| `INVALID_BUILDING` | Building missing |
| `ALREADY_POSTED` | Entry already in POSTED status |

Drafts are not validated. `createDraft` and `updateDraft` accept incomplete or unbalanced data so users can save partial work.

### Entry numbering

`entryNumber` format: `JE-000001` (monotonic, no year reset). Backed by Postgres sequence `journal_entry_number_seq`. Concurrency-safe; never reuses numbers. Gaps from rolled-back transactions are expected and documented.

### Concurrency model

`post()` re-reads the entry inside the transaction with `SELECT ... FOR UPDATE` (via `$queryRaw`) to prevent two concurrent posts on the same DRAFT.

### Building-tag resolution

At read time only. `effectiveBuildingId = line.buildingId ?? entry.buildingId ?? null`. Implemented once in `services/accounting/reports.service.ts` and reused by every report query.

---

## API surface

All routes mounted under `/api/accounting`, gated by `requireFeature('FEATURE_ACCOUNTING')` and `requireRole(['ADMIN', 'SUPER_ADMIN', 'FINANCE'])`.

### Chart of Accounts

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/accounting/accounts` | required | List, optional `?type=` filter |
| POST | `/api/accounting/accounts` | required | Create |
| PATCH | `/api/accounting/accounts/:id` | required | Edit (code mutable only if no activity; type/parent locked if any activity) |
| POST | `/api/accounting/accounts/:id/deactivate` | required | Sets `isActive = false` |
| POST | `/api/accounting/accounts/:id/activate` | required | Sets `isActive = true` |
| POST | `/api/accounting/accounts/seed-starter` | required | Idempotent seed of a standard small chart |

No DELETE. Deactivation is the only "close" affordance.

### Journal entries

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/accounting/journal-entries` | required | List, filters: status, dateFrom, dateTo, buildingId, q |
| GET | `/api/accounting/journal-entries/:id` | required | Detail (entry + lines) |
| POST | `/api/accounting/journal-entries` | required | Create DRAFT |
| PATCH | `/api/accounting/journal-entries/:id` | required | Update DRAFT (fails if POSTED) |
| DELETE | `/api/accounting/journal-entries/:id` | required | Delete DRAFT (fails if POSTED) |
| POST | `/api/accounting/journal-entries/:id/post` | required | Transition DRAFT → POSTED |
| POST | `/api/accounting/journal-entries/post` | required | Create-and-post in one call |

### Reports

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/accounting/reports/trial-balance` | required | Query: `asOf`, `buildingId?`. Returns rows grouped by account type, plus grand totals |
| GET | `/api/accounting/reports/general-ledger` | required | Query: `accountIds`, `dateFrom`, `dateTo`, `buildingId?`. Returns per-account lines with opening/closing balance |
| GET | `/api/accounting/reports/trial-balance.csv` | required | Same data, CSV stream |
| GET | `/api/accounting/reports/general-ledger.csv` | required | Same data, CSV stream |

### Settings (existing endpoint, extended)

`GET /api/settings` and `PATCH /api/settings` already exist. Add `booksMode` to the response and patch schema.

### Config (existing endpoint, extended)

`GET /api/config` returns feature flags to the client. Add `FEATURE_ACCOUNTING` so the sidebar can conditionally render the group.

### Error format

`AccountingError` codes map to HTTP 400 with body:

```json
{ "code": "UNBALANCED", "message": "Debits do not equal credits.", "details": { "diff": "12.50" } }
```

The client UI maps codes to inline messages (see UI section).

---

## UI

### Sidebar

New group "Accounting" inserted between Reports and Settings. Visible only when `FEATURE_ACCOUNTING=true` AND role ∈ {ADMIN, SUPER_ADMIN, FINANCE}.

```
Accounting
  ├─ Chart of Accounts        /accounting/accounts
  ├─ Journal Entries          /accounting/journal-entries
  ├─ General Ledger           /accounting/general-ledger
  └─ Trial Balance            /accounting/trial-balance
```

Material Symbols Outlined icon: `account_balance` for the group; per-item icons match existing pattern.

### Page: Chart of Accounts

Single page, table grouped by `AccountType` (Assets → Liabilities → Equity → Income → Expense), collapsible groups. Columns: Code · Name · Parent · Current balance · Active toggle · Actions.

- **New Account** button opens a modal (code, name, type, parent, description, active).
- Edit modal: name and description always editable; code editable only if no journal lines; type and parent locked once there's activity.
- No delete. Deactivate via toggle. Tooltip explains that accounts with activity can only be closed, not deleted.
- Empty state shows "Add starter chart" action that calls `POST /accounts/seed-starter`.

### Page: Journal Entries list

Paginated list using shared pagination primitive. Columns: Entry # · Date · Memo · Total · Status pill · Source · Building. Filters: Status, Date range, Building (only when books mode = PER_BUILDING), search on memo/entry #.

- **New Entry** button → `/accounting/journal-entries/new`.
- Row click → editor (DRAFT) or detail (POSTED).
- Bulk action: "Delete drafts" only.

### Page: Journal Entry editor

Full page (not a modal — line editing needs space). Layout: header (date, memo, building), editable lines table, live totals footer, action bar.

- Account picker: searchable combobox over active accounts (`code – name`).
- Debit and Credit mutually exclusive per line — typing in one clears the other.
- Live totals recompute on keystroke (100ms debounce). Difference indicator: green at 0, red with delta otherwise.
- **Save as Draft**: always enabled.
- **Save & Post**: disabled until `lines.length >= 2`, every line has account + exactly one positive of debit/credit, difference = 0.
- Posting prompts confirm: *"Posting is permanent. To correct a posted entry later, you'll create a reversing entry. Continue?"*

Server error mapping:

| Code | UI behavior |
|---|---|
| `UNBALANCED` | Highlight Difference indicator, show server-supplied `diff` |
| `INVALID_LINE` | Inline error on the offending row |
| `INVALID_ACCOUNT` | Inline error on the account picker |
| `INVALID_BUILDING` | Inline error on building cell |
| `ALREADY_POSTED` | Page-level toast; redirect to detail view |
| `MIN_LINES` | Footer message |

POSTED entries render in a read-only detail view: same layout, all inputs disabled, action bar replaced by "Export PDF" / "Back" (PDF reuses existing in-browser pattern from receipts/invoices).

### Page: General Ledger

Top filter bar: Account (multi-select, default All), Date range, Building (only in PER_BUILDING mode). Single table when one account is selected; grouped sections when multiple. Columns: Date · Entry # · Memo · Debit · Credit · Running balance. Opening balance row at top (sum of activity pre-range), closing balance row at bottom. CSV export.

### Page: Trial Balance

Filters: As-of date (default today), Building (only in PER_BUILDING mode). Single table grouped by `AccountType`. Columns: Code · Name · Total Debit · Total Credit · Net balance. Footer with grand totals. **Imbalance banner** at top (red) shown only when grand totals don't match — defense-in-depth alarm. CSV export.

### Settings page

New "Accounting" section added to the existing System Settings page:

- **Books mode** radio:
  - ○ Consolidated *(default)* — one set of books; building tag informational
  - ○ Per-building — reports default to one building at a time, with consolidation available

Helper text: *"Switching modes never changes the underlying data — only how reports group and which filters appear."*

### Components

| Component | New / Reuse |
|---|---|
| `AccountPicker` (searchable combobox over active accounts) | New |
| `JournalLinesTable` (editable rows, validation, totals) | New |
| `JournalEntryStatusPill` | New (thin wrapper on existing badge) |
| `LedgerTable` (running balance) | New |
| Table, Modal, Button, Input, Pagination, Confirm dialog | Reuse existing primitives |
| Money formatter using `SystemSettings.currency` | Reuse existing helper |
| CSV export helper | Reuse from reports |

### i18n

Both English and Arabic locales updated. RTL verified visually on editor and ledger before sign-off — column order mirrors via Tailwind logical properties.

### Loading / empty / error states

Every page covers initial loading skeleton, empty state with guiding next action, server-error retry. Matches existing pages (apartments, payments).

---

## Testing strategy

### Layer 1 — Service unit tests
`server/src/services/accounting/posting.service.test.ts`:

- `post() rejects when debits ≠ credits` (UNBALANCED)
- `post() rejects single-line entry` (MIN_LINES)
- `post() rejects line with both debit and credit > 0` (INVALID_LINE)
- `post() rejects line with zero on both sides` (INVALID_LINE)
- `post() rejects inactive account` (INVALID_ACCOUNT)
- `post() transitions DRAFT → POSTED and sets postedAt/postedBy`
- `post() on POSTED entry throws ALREADY_POSTED`
- `deleteDraft() rejects POSTED entry`
- `concurrent posts get distinct entry numbers` (sequence safety)
- `unbalanced lines on createDraft() are allowed`

Each test name encodes *why* the behavior matters (CLAUDE.md Rule 9). Real Postgres, no DB mocks (existing project pattern).

### Layer 2 — Controller / HTTP tests

- Auth gating: 401 unauthenticated; 403 for RECEPTIONIST, MAINTENANCE, BUILDING_ADMIN; 200 for ADMIN, SUPER_ADMIN, FINANCE.
- Feature-flag gating: 404 when `FEATURE_ACCOUNTING=false`.
- `AccountingError` codes map to HTTP 400 with correct `code` field.
- Account cannot be deleted; deactivation/activation round-trip works.
- `booksMode` round-trips through `/api/settings`.

### Layer 3 — Report query tests

Seed a tiny fixture (5–8 posted entries spanning two buildings, two months), assert:

- Trial balance per-account totals, grand-total equality, building filter excludes other building's lines.
- General Ledger opening balance computed from pre-range activity; running balance correct line-by-line.
- Building-tag resolution rule verified on a mixed entry.

### Layer 4 — Migration test

Fresh DB + new migration applied, then assert:

- `JournalLine` CHECK constraint rejects a row with both debit and credit > 0.
- `journal_entry_number_seq` exists; `nextval` returns monotonically increasing integers.
- `SystemSettings.booksMode` defaults to `CONSOLIDATED`.

### Layer 5 — Manual test plan

New "Accounting" section added to `docs/manual-test-plan.md` with ~15 cases:

- Chart of Accounts CRUD (incl. cannot delete with activity, can deactivate).
- Create draft → edit → post (happy path).
- Cannot post unbalanced.
- Cannot edit / delete a posted entry.
- Trial balance reflects posted entries; ignores drafts.
- GL running balance, opening/closing rows, date-range filter.
- Building filter behavior in both books modes.
- Role gating (each role logs in, sees / doesn't see the menu).
- Feature flag off → menu hidden, routes 404.
- i18n: Arabic RTL renders correctly on editor + ledger.
- CSV export from Trial Balance and GL opens cleanly.
- Imbalance banner renders if grand totals diverge (force via direct DB write to test the alarm).

---

## Rollout plan

### Deploy sequence
1. Merge with `FEATURE_ACCOUNTING=false` in production env.
2. Enable in dev → service + report tests + manual test plan.
3. Enable in staging → manual test plan with realistic data; verify CSV exports.
4. Enable in production once user signs off.

### Initial-data story
- No historical backfill. Existing payments do NOT auto-post in Phase 1 (that's Phase 2).
- User enters opening balances as a single manual journal entry dated their chosen opening date.
- "Add starter chart" empty-state action seeds a standard small chart (Cash, Bank, Accounts Receivable, Accounts Payable, Owner's Equity, Rental Revenue, Utilities Expense, Maintenance Expense, etc.). User free to edit/extend.

### Documentation updates (same PR)
- `Hotel_Apartment_BRD.md` → v2.1; add §4.10 Accounting; add `FEATURE_ACCOUNTING` to §6 table; add ACCOUNTING column to §5 access matrix.
- `docs/manual-test-plan.md` → new Accounting section.
- No CLAUDE.md changes needed.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Direct DB writes bypass PostingService → unbalanced entries | Sole-writer convention enforced by code review; trial balance imbalance banner is the visible alarm |
| Decimal-precision rounding errors | `Decimal` end-to-end (server) and `decimal.js` on client. Never `number` for money. Pattern already in Payments. |
| Sequence gaps from rolled-back transactions surprise users | Document in BRD: JE numbers monotonic, gaps expected, never reused |
| Trial balance perf at scale | Indexes from day one; revisit only if data > ~100k lines |
| Phase 2 needs Phase 1 schema changes | `source` enum and `sourceRefId` column included in Phase 1 schema even though only `MANUAL` is used. Keeps Phase 2 additive. |

---

## Open questions (none blocking)

All key design calls were settled during brainstorming on 2026-05-16:

- Hybrid posting model (auto-post payments in Phase 2; manual JE for everything else). ✓
- Books mode toggle defaulting to consolidated. ✓
- VAT, period close, bank reconciliation all in v1 (in later phases). ✓
- Fixed assets and multi-currency out of v1. ✓
- Sequence-based JE numbering (no year reset) in Phase 1. ✓
- No DB-level sum check — service is sole guard. ✓
- Building tag at both header and line level, line wins. ✓
- Editor is a full page, not a modal. ✓
- "Add starter chart" seed action stays in scope. ✓
- No browser-automation tests in Phase 1. ✓

---

## Out-of-scope reminders (do not add to Phase 1)

These were intentionally excluded. Each has a planned home in a later phase. If a reviewer thinks "obvious gap, let me add it" — it's not a gap, it's deferred.

- `FiscalPeriod` model + period lock → Phase 3
- `TaxCode` model + VAT → Phase 2
- `PostingService.postFromPayment()` and any auto-posting hooks → Phase 2
- Reversing-entry helper / void-posted workflow → Phase 3
- Income statement, balance sheet, cash flow → Phase 3
- `BankAccount`, `BankStatementLine` and reconciliation → Phase 4
- Fixed assets, depreciation → out of v1
- Multi-currency → out of v1
- `companyId` / multi-tenant scoping → not planned
