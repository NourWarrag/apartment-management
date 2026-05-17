# Accounting Module — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase 1/2 ledger periodic and reportable — ship the three financial statements (income, balance sheet, cash flow), fiscal periods with monthly lock and year-end close, manual JE reversal for corrections, and a dedicated expense entry form.

**Architecture:** Two new infrastructure pieces — `FiscalPeriod` model with lazy auto-create, and a period-lock guard in `PostingService.post()`. Three new posting methods (`reverseEntry`, `closeFiscalYear`, `postExpense`). Three new report queries on `ReportsService`. Pages and controllers mirror Phase 1/2 layout. Sole-writer convention preserved.

**Tech Stack:** Node 20, TypeScript 5, Express 4, Prisma 5, Postgres, Vitest + supertest. React 18 + Vite + React Query + react-i18next. Existing accounting infrastructure from Phases 1–2.

**Spec:** `docs/superpowers/specs/2026-05-17-accounting-phase-3-design.md`

**Pre-state:**
- Phase 1 + 2 merged to master. 297 server tests passing.
- `JESource` enum already has `YEAR_END_CLOSE` (declared speculatively in Phase 1, now actually used).
- `Account` code `3020 Retained Earnings` exists in the starter chart and seeded via setup endpoint.
- `AccountMapping` keys (`CASH_METHOD`, `CARD_METHOD`, `INSTALLMENT_METHOD`) drive cash-set membership for cash flow.

**Two cosmetic adjustments to spec during planning** (none functional):
- Sidebar entry order: statements come first in the new block, then the admin-only Periods entry, matching how Phase 2 added entries.
- `reverseEntry` test for PAYMENT_AUTO rejection: written against an actual auto-posted payment fixture rather than a synthetic JE, so the rejection is exercised end-to-end.

---

## File map

**Created (server):**
- `server/prisma/migrations/<timestamp>_accounting_phase3/migration.sql`
- `server/src/controllers/accounting-statements.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-periods.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-year-close.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-expenses.controller.ts` + `.test.ts`

**Modified (server):**
- `shared/index.ts` — add `PERIOD_LOCKED`, `ALREADY_CLOSED` error codes; add `FiscalPeriodStatus` enum
- `server/prisma/schema.prisma` — new `FiscalPeriod` table, `MANUAL_REVERSAL` enum value, `reversesEntryId` on `JournalEntry`
- `server/src/services/accounting/posting.service.ts` — `ensurePeriodOpen` helper, `post()` guard, `reverseEntry`, `closeFiscalYear`, `postExpense`
- `server/src/services/accounting/posting.service.test.ts` — extend with new tests
- `server/src/services/accounting/reports.service.ts` — `incomeStatement`, `balanceSheet`, `cashFlow`, `listFiscalPeriods`
- `server/src/services/accounting/reports.service.test.ts` — extend
- `server/src/controllers/accounting-reversal.controller.ts` — add `reverseEntry` action alongside Phase 2's `reverse`
- `server/src/routes/accounting.routes.ts` — mount new routes
- `server/src/controllers/payments.controller.test.ts` + `bookings.controller.test.ts` — regression tests for period-lock

**Created (client):**
- `client/src/pages/accounting/IncomeStatementPage.tsx`
- `client/src/pages/accounting/BalanceSheetPage.tsx`
- `client/src/pages/accounting/CashFlowPage.tsx`
- `client/src/pages/accounting/FiscalPeriodsPage.tsx`
- `client/src/pages/accounting/ExpenseFormModal.tsx`
- `client/src/lib/api/accounting-phase3.ts`

**Modified (client):**
- `client/src/App.tsx` — register 4 new routes
- `client/src/components/layout/Sidebar.tsx` — add 4 nav items
- `client/src/pages/accounting/JournalEntriesPage.tsx` — add "+ Add Expense" button
- `client/src/pages/accounting/JournalEntryDetailPage.tsx` (or whatever the detail page is named — verify) — add "Reverse this entry" button
- `client/src/pages/settings/SettingsPage.tsx` — link to periods page + per-year close button
- `client/src/i18n/locales/en/translation.json`, `ar/translation.json`

**Modified (docs):**
- `Hotel_Apartment_BRD.md` → v2.3
- `docs/manual-test-plan.md` → new §21

---

## Conventions for all tasks

- Server controllers use `try { ... } catch (err) { next(err); }` and `mapAccountingError` for known error codes.
- Server tests use real Postgres via `TEST_DATABASE_URL`; `signToken({ id, role, assignedBuildingId: null })` for cookies.
- All new posting methods accept optional `tx: Prisma.TransactionClient`.
- Money: `Prisma.Decimal` end-to-end on server, stringified in JSON, parsed back as `Decimal` on the way in.
- Commits: small, conventional-commit style.
- Work on branch `feat/accounting-phase-3` (create at start; do NOT work on master).
- Accounting routes inherit `requireRole(SUPER_ADMIN, ADMIN, FINANCE)` from `router.use(...)`. Admin-only endpoints add `requireRole(SUPER_ADMIN, ADMIN)` per-route.

---

# Section A — Branch, shared types, schema, migration

### Task A1: Branch + shared types

**Files:**
- Modify: `D:\Hotel Apartment Management System\shared\index.ts`

- [ ] **Step 1: Create feature branch**

```
git checkout master
git checkout -b feat/accounting-phase-3
git status
```

Expected: on `feat/accounting-phase-3`, clean tree.

- [ ] **Step 2: Extend `AccountingErrorCode` union in `shared/index.ts`**

Find the existing union (9 codes from Phase 2) and replace with:

```ts
export type AccountingErrorCode =
  | 'UNBALANCED'
  | 'INVALID_LINE'
  | 'MIN_LINES'
  | 'INVALID_ACCOUNT'
  | 'INVALID_BUILDING'
  | 'ALREADY_POSTED'
  | 'MAPPING_MISSING'
  | 'ALREADY_REVERSED'
  | 'CANNOT_REVERSE'
  | 'PERIOD_LOCKED'
  | 'ALREADY_CLOSED';
```

- [ ] **Step 3: Append the new enum at the end of the file**

```ts
export enum FiscalPeriodStatus {
  OPEN = 'OPEN',
  LOCKED = 'LOCKED',
}
```

- [ ] **Step 4: Commit**

```
git add shared/index.ts
git commit -m "feat(shared): Phase 3 accounting types — FiscalPeriodStatus, PERIOD_LOCKED, ALREADY_CLOSED error codes"
```

---

### Task A2: Prisma schema

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\prisma\schema.prisma`

- [ ] **Step 1: Read the current schema to understand existing structure**

- [ ] **Step 2: Append the new enum** (after the existing `enum AccountingMode`)

```prisma
enum FiscalPeriodStatus {
  OPEN
  LOCKED
}
```

- [ ] **Step 3: Add `MANUAL_REVERSAL` to the existing `JESource` enum**

Find:
```prisma
enum JESource {
  MANUAL
  PAYMENT_AUTO
  VAT_ADJUST
  YEAR_END_CLOSE
}
```

Replace with:
```prisma
enum JESource {
  MANUAL
  PAYMENT_AUTO
  VAT_ADJUST
  YEAR_END_CLOSE
  MANUAL_REVERSAL
}
```

- [ ] **Step 4: Add new model `FiscalPeriod`** (place before existing `model SystemSettings`)

```prisma
model FiscalPeriod {
  id        Int                @id @default(autoincrement())
  year      Int
  month     Int
  status    FiscalPeriodStatus @default(OPEN)
  lockedAt  DateTime?
  lockedBy  Int?
  closingEntryId Int?

  closingEntry  JournalEntry? @relation("FiscalPeriodClosingEntry", fields: [closingEntryId], references: [id], onDelete: SetNull)
  locker        User?         @relation("FiscalPeriodLockedBy", fields: [lockedBy], references: [id], onDelete: SetNull)

  @@unique([year, month])
  @@index([status])
}
```

- [ ] **Step 5: Modify `JournalEntry`** — add `reversesEntryId` field, relation, and back-relations

Inside the existing `model JournalEntry { ... }`, add:

```prisma
  reversesEntryId Int?
  reversesEntry   JournalEntry?  @relation("JEReverses", fields: [reversesEntryId], references: [id], onDelete: SetNull)
  reversedBy      JournalEntry[] @relation("JEReverses")
  fiscalPeriodsClosed FiscalPeriod[] @relation("FiscalPeriodClosingEntry")
```

- [ ] **Step 6: Modify `User`** — add back-relation for FiscalPeriod locker

Inside `model User { ... }`, in the back-relations section, add:

```prisma
  lockedFiscalPeriods FiscalPeriod[] @relation("FiscalPeriodLockedBy")
```

- [ ] **Step 7: Format and verify**

```
cd server
npx prisma format
```

Expected: schema is rewritten cleanly, no error.

- [ ] **Step 8: Commit**

```
git add server/prisma/schema.prisma
git commit -m "feat(db): Phase 3 schema — FiscalPeriod, MANUAL_REVERSAL source, reversesEntryId on JournalEntry"
```

---

### Task A3: Generate and apply migration

- [ ] **Step 1: Generate scaffolded migration (do not apply)**

```
cd server
npx prisma migrate dev --name accounting_phase3 --create-only
```

Expected: new folder `server/prisma/migrations/<timestamp>_accounting_phase3/migration.sql` with the autogenerated DDL. No manual SQL needed.

- [ ] **Step 2: Apply to dev DB**

```
cd server
npx prisma migrate dev
```

Expected: migration applies; Prisma client regenerates.

- [ ] **Step 3: Apply to test DB**

```
cd server
DATABASE_URL="postgresql://hotel:hotel123@localhost:5433/hotel_test" npx prisma migrate deploy
```

Expected: "All migrations have been successfully applied."

- [ ] **Step 4: Sanity-check the new table and enum**

```
docker exec hotelapartmentmanagementsystem-postgres-1 psql -U hotel -d hotel_dev -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='FiscalPeriod';"
docker exec hotelapartmentmanagementsystem-postgres-1 psql -U hotel -d hotel_dev -c "SELECT enum_range(NULL::\"JESource\");"
docker exec hotelapartmentmanagementsystem-postgres-test-1 psql -U hotel -d hotel_test -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='FiscalPeriod';"
```

Expected: `FiscalPeriod` exists in both DBs; `JESource` includes `MANUAL_REVERSAL`.

- [ ] **Step 5: Commit**

```
git add server/prisma/migrations
git commit -m "feat(db): migration for accounting Phase 3"
```

---

# Section B — PostingService extensions

### Task B1: ensurePeriodOpen helper + post() guard (TDD)

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `posting.service.test.ts`:

```ts
describe('PostingService.post() period-lock guard', () => {
  beforeEach(async () => {
    // Ensure no leftover FiscalPeriod rows from prior tests
    await db.fiscalPeriod.deleteMany();
  });

  it('auto-creates a missing FiscalPeriod as OPEN on first post', async () => {
    const before = await db.fiscalPeriod.count();
    expect(before).toBe(0);

    await service().createAndPost(
      {
        date: new Date('2026-07-15'),
        lines: [
          { accountId: cashId, debit: '10' },
          { accountId: revenueId, credit: '10' },
        ],
      },
      userId,
    );

    const period = await db.fiscalPeriod.findUnique({ where: { year_month: { year: 2026, month: 7 } } });
    expect(period?.status).toBe('OPEN');
  });

  it('rejects a new POSTED entry when the target period is LOCKED', async () => {
    await db.fiscalPeriod.create({
      data: { year: 2026, month: 8, status: 'LOCKED', lockedAt: new Date(), lockedBy: userId },
    });

    await expect(
      service().createAndPost(
        {
          date: new Date('2026-08-15'),
          lines: [
            { accountId: cashId, debit: '10' },
            { accountId: revenueId, credit: '10' },
          ],
        },
        userId,
      ),
    ).rejects.toMatchObject({ code: 'PERIOD_LOCKED', details: { year: 2026, month: 8 } });
  });

  it('allows posting when the target period is OPEN', async () => {
    await db.fiscalPeriod.create({ data: { year: 2026, month: 9, status: 'OPEN' } });
    const entry = await service().createAndPost(
      {
        date: new Date('2026-09-15'),
        lines: [
          { accountId: cashId, debit: '10' },
          { accountId: revenueId, credit: '10' },
        ],
      },
      userId,
    );
    expect(entry.status).toBe('POSTED');
  });
});
```

- [ ] **Step 2: Run — expect failures (helper doesn't exist, guard not called)**

```
cd server && npx vitest run src/services/accounting/posting.service.test.ts -t "period-lock guard"
```

- [ ] **Step 3: Implement the helper inside `PostingService` class**

Add as a private method (place near `getAccountingMode`):

```ts
private async ensurePeriodOpen(
  tx: Prisma.TransactionClient,
  date: Date,
): Promise<void> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const period = await tx.fiscalPeriod.upsert({
    where: { year_month: { year, month } },
    create: { year, month, status: 'OPEN' },
    update: {},
  });

  if (period.status === 'LOCKED') {
    throw new AccountingError('PERIOD_LOCKED', `Period ${year}-${String(month).padStart(2, '0')} is locked`, {
      year, month,
    });
  }
}
```

- [ ] **Step 4: Wire the guard into `post()`**

Find the existing `post()` runner body. After the `validate(...)` call and before the `nextval` query for `entryNumber`, insert:

```ts
await this.ensurePeriodOpen(db, entry.date);
```

- [ ] **Step 5: Add cleanup in test file's `afterAll`**

Add (before existing payment/booking cleanup):

```ts
await db.fiscalPeriod.deleteMany();
```

- [ ] **Step 6: Run all PostingService tests — expect prior 26 + new 3 = 29 pass**

```
cd server && npx vitest run src/services/accounting/posting.service.test.ts
```

If existing tests fail because they post entries with arbitrary dates that now lazy-create periods: that's correct behavior; just verify the periods are created OPEN.

- [ ] **Step 7: Commit**

```
git add server/src/services/accounting/posting.service.ts server/src/services/accounting/posting.service.test.ts
git commit -m "feat(accounting): period-lock guard in post() + ensurePeriodOpen helper (lazy auto-create)"
```

---

### Task B2: reverseEntry (TDD)

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `posting.service.test.ts`:

```ts
describe('PostingService.reverseEntry', () => {
  beforeEach(async () => {
    await db.fiscalPeriod.deleteMany();
  });

  it('posts a balancing JE with swapped debits and credits, links via reversesEntryId', async () => {
    const original = await service().createAndPost(
      {
        date: new Date('2026-07-15'),
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '100' },
        ],
      },
      userId,
    );

    const reversal = await service().reverseEntry(original.id, userId);

    expect(reversal.source).toBe('MANUAL_REVERSAL');
    expect(reversal.reversesEntryId).toBe(original.id);
    expect(reversal.memo).toBe(`Reversal of ${original.entryNumber}`);

    const lines = await db.journalLine.findMany({
      where: { journalEntryId: reversal.id },
      orderBy: { lineOrder: 'asc' },
    });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.accountId === cashId)?.credit.toFixed(2)).toBe('100.00');
    expect(lines.find((l) => l.accountId === revenueId)?.debit.toFixed(2)).toBe('100.00');
  });

  it('posts the reversal to today regardless of original date', async () => {
    const original = await service().createAndPost(
      {
        date: new Date('2026-03-01'),
        lines: [
          { accountId: cashId, debit: '50' },
          { accountId: revenueId, credit: '50' },
        ],
      },
      userId,
    );
    const reversal = await service().reverseEntry(original.id, userId);
    const today = new Date();
    expect(reversal.date.getUTCFullYear()).toBe(today.getUTCFullYear());
    expect(reversal.date.getUTCMonth()).toBe(today.getUTCMonth());
  });

  it('throws ALREADY_REVERSED on second attempt', async () => {
    const original = await service().createAndPost(
      {
        date: new Date('2026-07-15'),
        lines: [
          { accountId: cashId, debit: '50' },
          { accountId: revenueId, credit: '50' },
        ],
      },
      userId,
    );
    await service().reverseEntry(original.id, userId);
    await expect(service().reverseEntry(original.id, userId))
      .rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
  });

  it('throws CANNOT_REVERSE when original is PAYMENT_AUTO (use the payment-specific endpoint instead)', async () => {
    // Reuse paidPaymentId fixture (PAYMENT_AUTO from postFromPayment)
    // Re-post it freshly to ensure postedEntryId is set
    await db.payment.update({ where: { id: paidPaymentId }, data: { status: 'PAID', postedEntryId: null } });
    const autoPosted = await service().postFromPayment(paidPaymentId, userId);
    await expect(service().reverseEntry(autoPosted!.id, userId))
      .rejects.toMatchObject({ code: 'CANNOT_REVERSE' });
  });
});
```

- [ ] **Step 2: Run — expect failures (reverseEntry doesn't exist)**

- [ ] **Step 3: Implement `reverseEntry` in `posting.service.ts`**

Add as a public method on `PostingService` after `reversePayment`:

```ts
async reverseEntry(
  originalId: number,
  userId: number,
  tx?: Prisma.TransactionClient,
): Promise<JournalEntry> {
  const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry> => {
    const original = await db.journalEntry.findUnique({
      where: { id: originalId },
      include: { lines: true },
    });
    if (!original) {
      throw new AccountingError('INVALID_LINE', `Entry ${originalId} not found`);
    }
    if (original.status !== 'POSTED') {
      throw new AccountingError('CANNOT_REVERSE', 'Only POSTED entries can be reversed');
    }
    if (original.source === 'PAYMENT_AUTO') {
      throw new AccountingError(
        'CANNOT_REVERSE',
        'Use POST /accounting/payments/:id/reverse to reverse an auto-posted payment',
        { source: 'PAYMENT_AUTO' },
      );
    }
    const existingReversal = await db.journalEntry.findFirst({
      where: { reversesEntryId: originalId },
    });
    if (existingReversal) {
      throw new AccountingError('ALREADY_REVERSED', 'Entry has already been reversed', {
        reversalId: existingReversal.id,
        reversalNumber: existingReversal.entryNumber,
      });
    }

    const reversingLines: LineInput[] = original.lines.map((l) => ({
      accountId: l.accountId,
      buildingId: l.buildingId,
      debit: l.credit,
      credit: l.debit,
      description: l.description ?? undefined,
    }));

    const entry = await this.createAndPost(
      {
        date: new Date(),
        memo: `Reversal of ${original.entryNumber}`,
        buildingId: original.buildingId,
        source: 'MANUAL_REVERSAL',
        sourceRefId: original.id,
        lines: reversingLines,
      },
      userId,
      db,
    );

    // Set reversesEntryId on the new entry
    return db.journalEntry.update({
      where: { id: entry.id },
      data: { reversesEntryId: original.id },
    });
  };

  if (tx) return runner(tx);
  return this.prisma.$transaction(runner);
}
```

- [ ] **Step 4: Run — expect 4/4 new tests pass + all prior tests still pass**

```
cd server && npx vitest run src/services/accounting/posting.service.test.ts
```

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/posting.service.ts server/src/services/accounting/posting.service.test.ts
git commit -m "feat(accounting): reverseEntry for manual JE reversal (rejects PAYMENT_AUTO)"
```

---

### Task B3: closeFiscalYear (TDD)

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.test.ts`

- [ ] **Step 1: Add failing tests**

Append a new describe block:

```ts
describe('PostingService.closeFiscalYear', () => {
  let retainedEarningsId: number;

  beforeAll(async () => {
    // Ensure Retained Earnings (code 3020) exists
    const existing = await db.account.findUnique({ where: { code: '3020' } });
    if (existing) {
      retainedEarningsId = existing.id;
    } else {
      const re = await db.account.create({
        data: { code: '3020', name: 'Retained Earnings', type: 'EQUITY' },
      });
      retainedEarningsId = re.id;
    }
  });

  beforeEach(async () => {
    await db.fiscalPeriod.deleteMany();
    // Wipe Phase 2 fixtures that might pollute period close totals
    await db.journalLine.deleteMany();
    await db.journalEntry.deleteMany();
  });

  it('posts a closing JE that zeros INCOME and EXPENSE and credits net income to Retained Earnings', async () => {
    // Post 300 of revenue
    await service().createAndPost(
      {
        date: new Date('2027-06-15'),
        lines: [
          { accountId: cashId, debit: '300' },
          { accountId: revenueId, credit: '300' },
        ],
      },
      userId,
    );

    const closing = await service().closeFiscalYear(2027, userId);
    expect(closing.source).toBe('YEAR_END_CLOSE');
    const lines = await db.journalLine.findMany({ where: { journalEntryId: closing.id } });
    // 2 lines: zero revenue + credit RE
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.accountId === revenueId)?.debit.toFixed(2)).toBe('300.00');
    expect(lines.find((l) => l.accountId === retainedEarningsId)?.credit.toFixed(2)).toBe('300.00');
  });

  it('locks all 12 months of the year and sets closingEntryId on December', async () => {
    await service().createAndPost(
      {
        date: new Date('2028-03-15'),
        lines: [
          { accountId: cashId, debit: '50' },
          { accountId: revenueId, credit: '50' },
        ],
      },
      userId,
    );
    const closing = await service().closeFiscalYear(2028, userId);
    const periods = await db.fiscalPeriod.findMany({ where: { year: 2028 }, orderBy: { month: 'asc' } });
    expect(periods).toHaveLength(12);
    expect(periods.every((p) => p.status === 'LOCKED')).toBe(true);
    expect(periods.find((p) => p.month === 12)?.closingEntryId).toBe(closing.id);
  });

  it('throws ALREADY_CLOSED on second close of the same year', async () => {
    await service().createAndPost(
      {
        date: new Date('2029-04-01'),
        lines: [
          { accountId: cashId, debit: '10' },
          { accountId: revenueId, credit: '10' },
        ],
      },
      userId,
    );
    await service().closeFiscalYear(2029, userId);
    await expect(service().closeFiscalYear(2029, userId))
      .rejects.toMatchObject({ code: 'ALREADY_CLOSED' });
  });

  it('throws MIN_LINES when there is no closeable activity', async () => {
    await expect(service().closeFiscalYear(2030, userId))
      .rejects.toMatchObject({ code: 'MIN_LINES' });
  });

  it('handles net loss — debits Retained Earnings, credits Expense', async () => {
    // Need an expense account; create one
    const expenseAcc = await db.account.create({
      data: { code: '5099', name: 'Test Expense P3', type: 'EXPENSE' },
    });
    await service().createAndPost(
      {
        date: new Date('2031-05-15'),
        lines: [
          { accountId: expenseAcc.id, debit: '500' },
          { accountId: cashId, credit: '500' },
        ],
      },
      userId,
    );
    const closing = await service().closeFiscalYear(2031, userId);
    const lines = await db.journalLine.findMany({ where: { journalEntryId: closing.id } });
    expect(lines.find((l) => l.accountId === expenseAcc.id)?.credit.toFixed(2)).toBe('500.00');
    expect(lines.find((l) => l.accountId === retainedEarningsId)?.debit.toFixed(2)).toBe('500.00');
    await db.journalLine.deleteMany({ where: { accountId: expenseAcc.id } });
    await db.account.delete({ where: { id: expenseAcc.id } });
  });
});
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Implement `closeFiscalYear` in `posting.service.ts`**

Add as a public method after `reverseEntry`:

```ts
async closeFiscalYear(
  year: number,
  userId: number,
  tx?: Prisma.TransactionClient,
): Promise<JournalEntry> {
  const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry> => {
    // 1. Idempotency: reject if December's period already has a closingEntryId
    const existingClose = await db.fiscalPeriod.findFirst({
      where: { year, month: 12, closingEntryId: { not: null } },
    });
    if (existingClose) {
      throw new AccountingError('ALREADY_CLOSED', `Fiscal year ${year} is already closed`, {
        closingEntryId: existingClose.closingEntryId,
      });
    }

    // 2. Compute net balance per INCOME and EXPENSE account up to Dec 31 23:59:59 UTC
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const accounts = await db.account.findMany({
      where: { type: { in: ['INCOME', 'EXPENSE'] } },
    });

    const closingLines: LineInput[] = [];
    let netIncome = new Prisma.Decimal(0);

    for (const a of accounts) {
      const agg = await db.journalLine.aggregate({
        where: {
          accountId: a.id,
          journalEntry: { status: 'POSTED', date: { lte: yearEnd } },
        },
        _sum: { debit: true, credit: true },
      });
      const debit = new Prisma.Decimal(agg._sum.debit ?? 0);
      const credit = new Prisma.Decimal(agg._sum.credit ?? 0);

      if (a.type === 'INCOME') {
        const balance = credit.minus(debit);
        if (balance.gt(0)) {
          closingLines.push({ accountId: a.id, debit: balance });
          netIncome = netIncome.plus(balance);
        } else if (balance.lt(0)) {
          closingLines.push({ accountId: a.id, credit: balance.abs() });
          netIncome = netIncome.minus(balance.abs());
        }
      } else {
        // EXPENSE
        const balance = debit.minus(credit);
        if (balance.gt(0)) {
          closingLines.push({ accountId: a.id, credit: balance });
          netIncome = netIncome.minus(balance);
        } else if (balance.lt(0)) {
          closingLines.push({ accountId: a.id, debit: balance.abs() });
          netIncome = netIncome.plus(balance.abs());
        }
      }
    }

    // 3. Retained Earnings balancing line
    const retainedEarnings = await db.account.findUnique({ where: { code: '3020' } });
    if (!retainedEarnings) {
      throw new AccountingError('INVALID_ACCOUNT', 'Retained Earnings (code 3020) account missing');
    }
    if (netIncome.gt(0)) {
      closingLines.push({ accountId: retainedEarnings.id, credit: netIncome });
    } else if (netIncome.lt(0)) {
      closingLines.push({ accountId: retainedEarnings.id, debit: netIncome.abs() });
    }

    if (closingLines.length < 2) {
      throw new AccountingError('MIN_LINES', `Fiscal year ${year} has no closeable activity`);
    }

    // 4. Post the closing entry (December is auto-created as OPEN by ensurePeriodOpen)
    const closingEntry = await this.createAndPost(
      {
        date: yearEnd,
        memo: `Year-end close for fiscal year ${year}`,
        buildingId: null,
        source: 'YEAR_END_CLOSE',
        sourceRefId: year,
        lines: closingLines,
      },
      userId,
      db,
    );

    // 5. Lock all 12 months; set closingEntryId on December
    const now = new Date();
    for (let m = 1; m <= 12; m++) {
      await db.fiscalPeriod.upsert({
        where: { year_month: { year, month: m } },
        create: {
          year, month: m, status: 'LOCKED',
          lockedAt: now, lockedBy: userId,
          ...(m === 12 ? { closingEntryId: closingEntry.id } : {}),
        },
        update: {
          status: 'LOCKED',
          lockedAt: now,
          lockedBy: userId,
          ...(m === 12 ? { closingEntryId: closingEntry.id } : {}),
        },
      });
    }

    return closingEntry;
  };

  if (tx) return runner(tx);
  return this.prisma.$transaction(runner);
}
```

- [ ] **Step 4: Run — expect 5/5 new tests pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/posting.service.ts server/src/services/accounting/posting.service.test.ts
git commit -m "feat(accounting): closeFiscalYear posts closing JE to Retained Earnings and locks all 12 months"
```

---

### Task B4: postExpense (TDD)

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe('PostingService.postExpense', () => {
  let expenseAccountId: number;

  beforeAll(async () => {
    const existing = await db.account.findUnique({ where: { code: '5099' } });
    if (existing) {
      expenseAccountId = existing.id;
    } else {
      const e = await db.account.create({ data: { code: '5099', name: 'Test Expense P3', type: 'EXPENSE' } });
      expenseAccountId = e.id;
    }
  });

  it('posts a 3-line JE with VAT split when a tax code is supplied', async () => {
    const entry = await service().postExpense(
      {
        date: new Date('2026-07-10'),
        memo: 'Utilities',
        expenseAccountId,
        amount: '210',
        payFromAccountId: cashId,
        taxCodeId: taxCodeStandardId,
      },
      userId,
    );
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry.id } });
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.accountId === expenseAccountId)?.debit.toFixed(2)).toBe('200.00');
    expect(lines.find((l) => l.accountId === vatAccountId)?.debit.toFixed(2)).toBe('10.00');
    expect(lines.find((l) => l.accountId === cashId)?.credit.toFixed(2)).toBe('210.00');
  });

  it('posts a 2-line JE (no VAT) when no tax code is supplied', async () => {
    const entry = await service().postExpense(
      {
        date: new Date('2026-07-11'),
        memo: 'Out-of-scope expense',
        expenseAccountId,
        amount: '50',
        payFromAccountId: cashId,
      },
      userId,
    );
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry.id } });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.accountId === expenseAccountId)?.debit.toFixed(2)).toBe('50.00');
    expect(lines.find((l) => l.accountId === cashId)?.credit.toFixed(2)).toBe('50.00');
  });

  it('tags the expense line with taxCodeId (for VAT return input column)', async () => {
    const entry = await service().postExpense(
      {
        date: new Date('2026-07-12'),
        expenseAccountId,
        amount: '105',
        payFromAccountId: cashId,
        taxCodeId: taxCodeStandardId,
      },
      userId,
    );
    const expenseLine = await db.journalLine.findFirst({
      where: { journalEntryId: entry.id, accountId: expenseAccountId },
    });
    expect(expenseLine?.taxCodeId).toBe(taxCodeStandardId);
  });

  it('accepts an AP account (LIABILITY) as payFromAccountId', async () => {
    const ap = await db.account.findUnique({ where: { code: '2010' } })
      ?? await db.account.create({ data: { code: '2010', name: 'Accounts Payable', type: 'LIABILITY' } });
    const entry = await service().postExpense(
      {
        date: new Date('2026-07-13'),
        expenseAccountId,
        amount: '100',
        payFromAccountId: ap.id,
      },
      userId,
    );
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry.id } });
    expect(lines.find((l) => l.accountId === ap.id)?.credit.toFixed(2)).toBe('100.00');
  });
});
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Implement `postExpense`**

Add to `posting.service.ts` after `closeFiscalYear`:

```ts
async postExpense(
  input: {
    date: Date;
    memo?: string;
    buildingId?: number | null;
    expenseAccountId: number;
    amount: string | Prisma.Decimal | number;
    payFromAccountId: number;
    taxCodeId?: number | null;
  },
  userId: number,
  tx?: Prisma.TransactionClient,
): Promise<JournalEntry> {
  const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry> => {
    const gross = new Prisma.Decimal(input.amount);
    const taxCode = input.taxCodeId
      ? await db.taxCode.findUnique({ where: { id: input.taxCodeId } })
      : null;
    const rate = taxCode ? new Prisma.Decimal(taxCode.ratePct) : new Prisma.Decimal(0);
    const { net, vat } = splitTaxInclusive(gross, rate);

    const lines: LineInput[] = [
      { accountId: input.expenseAccountId, debit: net, description: input.memo },
    ];
    if (vat.gt(0) && taxCode) {
      const vatAccountId = await this.mapping.resolveAccount(db, 'VAT_PAYABLE');
      lines.push({ accountId: vatAccountId, debit: vat });
    }
    lines.push({ accountId: input.payFromAccountId, credit: gross });

    const entry = await this.createAndPost(
      {
        date: input.date,
        memo: input.memo ?? 'Expense',
        buildingId: input.buildingId ?? null,
        source: 'MANUAL',
        lines,
      },
      userId,
      db,
    );

    if (taxCode) {
      await db.journalLine.updateMany({
        where: { journalEntryId: entry.id, accountId: input.expenseAccountId },
        data: { taxCodeId: taxCode.id },
      });
    }

    return entry;
  };

  if (tx) return runner(tx);
  return this.prisma.$transaction(runner);
}
```

- [ ] **Step 4: Run — expect 4/4 new tests pass + all prior tests still pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/posting.service.ts server/src/services/accounting/posting.service.test.ts
git commit -m "feat(accounting): postExpense with optional VAT split + tax-code tagging"
```

---

# Section C — ReportsService extensions

### Task C1: incomeStatement (TDD)

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\reports.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\reports.service.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `reports.service.test.ts`:

```ts
describe('ReportsService.incomeStatement', () => {
  it('aggregates posted INCOME and EXPENSE within range and computes net income', async () => {
    // Fixture is already set up in beforeAll: 5 posted entries in April + May, total revenue 380
    const r = await reports.incomeStatement({
      from: new Date('2026-04-01'),
      to: new Date('2026-05-31'),
    });
    const revenue = r.income.rows.find((row) => row.accountId === revenueId)!;
    expect(revenue.amount).toBe('380.00');
    expect(r.income.total).toBe('380.00');
    expect(r.expenses.total).toBe('0.00');
    expect(r.netIncome).toBe('380.00');
  });

  it('filters by building when buildingId is provided', async () => {
    const r = await reports.incomeStatement({
      from: new Date('2026-04-01'),
      to: new Date('2026-05-31'),
      buildingId: bldgA,
    });
    expect(r.income.total).toBe('300.00');
  });

  it('returns empty sections when no activity in range', async () => {
    const r = await reports.incomeStatement({
      from: new Date('2026-01-01'),
      to: new Date('2026-01-31'),
    });
    expect(r.income.total).toBe('0.00');
    expect(r.expenses.total).toBe('0.00');
    expect(r.netIncome).toBe('0.00');
  });
});
```

- [ ] **Step 2: Run — expect failures (method doesn't exist)**

- [ ] **Step 3: Implement `incomeStatement` in `reports.service.ts`**

Add the type and method to `ReportsService`:

```ts
export type IncomeStatementSection = {
  type: 'INCOME' | 'EXPENSE';
  rows: { accountId: number; code: string; name: string; amount: string }[];
  total: string;
};

export type IncomeStatementResult = {
  from: string;
  to: string;
  income: IncomeStatementSection;
  expenses: IncomeStatementSection;
  netIncome: string;
};

// Add to ReportsService class:
async incomeStatement(opts: {
  from: Date;
  to: Date;
  buildingId?: number;
}): Promise<IncomeStatementResult> {
  const accounts = await this.prisma.account.findMany({
    where: { type: { in: ['INCOME', 'EXPENSE'] } },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  });

  const lines = await this.prisma.journalLine.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      journalEntry: { status: 'POSTED', date: { gte: opts.from, lte: opts.to } },
      ...(opts.buildingId
        ? {
            OR: [
              { buildingId: opts.buildingId },
              { buildingId: null, journalEntry: { buildingId: opts.buildingId } },
            ],
          }
        : {}),
    },
    select: { accountId: true, debit: true, credit: true },
  });

  const byAccount = new Map<number, { d: Prisma.Decimal; c: Prisma.Decimal }>();
  for (const l of lines) {
    const t = byAccount.get(l.accountId) ?? { d: ZERO, c: ZERO };
    byAccount.set(l.accountId, { d: t.d.plus(l.debit), c: t.c.plus(l.credit) });
  }

  const incomeRows: IncomeStatementSection['rows'] = [];
  const expenseRows: IncomeStatementSection['rows'] = [];
  let incomeTotal = new Prisma.Decimal(0);
  let expenseTotal = new Prisma.Decimal(0);

  for (const a of accounts) {
    const t = byAccount.get(a.id) ?? { d: ZERO, c: ZERO };
    const amount = a.type === 'INCOME' ? t.c.minus(t.d) : t.d.minus(t.c);
    if (amount.eq(0)) continue;
    const row = { accountId: a.id, code: a.code, name: a.name, amount: amount.toFixed(2) };
    if (a.type === 'INCOME') {
      incomeRows.push(row);
      incomeTotal = incomeTotal.plus(amount);
    } else {
      expenseRows.push(row);
      expenseTotal = expenseTotal.plus(amount);
    }
  }

  return {
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    income: { type: 'INCOME', rows: incomeRows, total: incomeTotal.toFixed(2) },
    expenses: { type: 'EXPENSE', rows: expenseRows, total: expenseTotal.toFixed(2) },
    netIncome: incomeTotal.minus(expenseTotal).toFixed(2),
  };
}
```

- [ ] **Step 4: Run — expect 3/3 new tests pass**

```
cd server && npx vitest run src/services/accounting/reports.service.test.ts
```

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/reports.service.ts server/src/services/accounting/reports.service.test.ts
git commit -m "feat(accounting): incomeStatement report with building filter"
```

---

### Task C2: balanceSheet (TDD)

**Files:**
- Modify: `server/src/services/accounting/reports.service.ts`
- Modify: `server/src/services/accounting/reports.service.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe('ReportsService.balanceSheet', () => {
  it('returns Assets, Liabilities, Equity with A = L + E + currentYearIncome', async () => {
    const r = await reports.balanceSheet({ asOf: new Date('2026-12-31') });
    const a = Number(r.assets.total);
    const l = Number(r.liabilities.total);
    const e = Number(r.equity.total);
    const cyi = Number(r.currentYearIncome);
    expect(Math.abs(a - (l + e + cyi))).toBeLessThan(0.005);
    expect(r.isBalanced).toBe(true);
  });

  it('puts unclosed-year net income into currentYearIncome', async () => {
    const r = await reports.balanceSheet({ asOf: new Date('2026-12-31') });
    expect(Number(r.currentYearIncome)).toBeGreaterThan(0);
  });

  it('filters by building when buildingId is provided', async () => {
    const r = await reports.balanceSheet({ asOf: new Date('2026-12-31'), buildingId: bldgB });
    // bldgB total revenue 80 → currentYearIncome 80 (no expenses)
    expect(r.currentYearIncome).toBe('80.00');
  });
});
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Implement `balanceSheet`**

```ts
export type BalanceSheetSection = {
  type: 'ASSET' | 'LIABILITY' | 'EQUITY';
  rows: { accountId: number; code: string; name: string; balance: string }[];
  total: string;
};

export type BalanceSheetResult = {
  asOf: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  currentYearIncome: string;
  totalLiabilitiesAndEquity: string;
  isBalanced: boolean;
};

// Add to class:
async balanceSheet(opts: { asOf: Date; buildingId?: number }): Promise<BalanceSheetResult> {
  const accounts = await this.prisma.account.findMany({
    where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  });

  const lines = await this.prisma.journalLine.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      journalEntry: { status: 'POSTED', date: { lte: opts.asOf } },
      ...(opts.buildingId
        ? {
            OR: [
              { buildingId: opts.buildingId },
              { buildingId: null, journalEntry: { buildingId: opts.buildingId } },
            ],
          }
        : {}),
    },
    select: { accountId: true, debit: true, credit: true },
  });

  const byAccount = new Map<number, { d: Prisma.Decimal; c: Prisma.Decimal }>();
  for (const l of lines) {
    const t = byAccount.get(l.accountId) ?? { d: ZERO, c: ZERO };
    byAccount.set(l.accountId, { d: t.d.plus(l.debit), c: t.c.plus(l.credit) });
  }

  const make = (type: 'ASSET' | 'LIABILITY' | 'EQUITY'): BalanceSheetSection => {
    const rows: BalanceSheetSection['rows'] = [];
    let total = new Prisma.Decimal(0);
    for (const a of accounts) {
      if (a.type !== type) continue;
      const t = byAccount.get(a.id) ?? { d: ZERO, c: ZERO };
      const balance = type === 'ASSET' ? t.d.minus(t.c) : t.c.minus(t.d);
      if (balance.eq(0)) continue;
      rows.push({ accountId: a.id, code: a.code, name: a.name, balance: balance.toFixed(2) });
      total = total.plus(balance);
    }
    return { type, rows, total: total.toFixed(2) };
  };

  const assets = make('ASSET');
  const liabilities = make('LIABILITY');
  const equity = make('EQUITY');

  // Current Year Earnings = net income from Jan 1 of asOf's year to asOf
  const yearStart = new Date(Date.UTC(opts.asOf.getUTCFullYear(), 0, 1));
  const isResult = await this.incomeStatement({
    from: yearStart,
    to: opts.asOf,
    buildingId: opts.buildingId,
  });
  const currentYearIncome = new Prisma.Decimal(isResult.netIncome);

  const totalLE = new Prisma.Decimal(liabilities.total).plus(equity.total).plus(currentYearIncome);
  const assetsTotal = new Prisma.Decimal(assets.total);
  const isBalanced = assetsTotal.minus(totalLE).abs().lt(new Prisma.Decimal('0.005'));

  return {
    asOf: opts.asOf.toISOString(),
    assets, liabilities, equity,
    currentYearIncome: currentYearIncome.toFixed(2),
    totalLiabilitiesAndEquity: totalLE.toFixed(2),
    isBalanced,
  };
}
```

- [ ] **Step 4: Run — expect tests pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/reports.service.ts server/src/services/accounting/reports.service.test.ts
git commit -m "feat(accounting): balanceSheet with synthetic current-year-earnings equity row"
```

---

### Task C3: cashFlow (TDD)

**Files:**
- Modify: `server/src/services/accounting/reports.service.ts`
- Modify: `server/src/services/accounting/reports.service.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe('ReportsService.cashFlow', () => {
  it('reconciles: beginning + netCashFromOperations === ending', async () => {
    const r = await reports.cashFlow({
      from: new Date('2026-04-01'),
      to: new Date('2026-05-31'),
    });
    expect(r.reconcilesToCash).toBe(true);
  });

  it('reports net income within the period', async () => {
    const r = await reports.cashFlow({
      from: new Date('2026-04-01'),
      to: new Date('2026-05-31'),
    });
    expect(r.netIncome).toBe('380.00');
  });
});
```

(Two tests are enough for Phase 3's CF — full AR/AP working-capital coverage is exercised via Phase 4 once expense entry data lands. Keep it focused on the reconciliation invariant.)

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Implement `cashFlow`**

```ts
export type WorkingCapitalChange = {
  accountId: number;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY';
  change: string;
};

export type CashFlowResult = {
  from: string;
  to: string;
  netIncome: string;
  workingCapitalChanges: WorkingCapitalChange[];
  netCashFromOperations: string;
  beginningCash: string;
  endingCash: string;
  reconcilesToCash: boolean;
};

// Add to class:
async cashFlow(opts: { from: Date; to: Date; buildingId?: number }): Promise<CashFlowResult> {
  // 1. Net income for the period
  const is = await this.incomeStatement({ from: opts.from, to: opts.to, buildingId: opts.buildingId });
  const netIncome = new Prisma.Decimal(is.netIncome);

  // 2. Identify cash accounts via mappings
  const cashMappings = await this.prisma.accountMapping.findMany({
    where: { key: { in: ['CASH_METHOD', 'CARD_METHOD', 'INSTALLMENT_METHOD'] } },
  });
  const cashAccountIds = new Set(cashMappings.map((m) => m.accountId));

  // 3. Non-cash asset + liability accounts
  const accounts = await this.prisma.account.findMany({
    where: { type: { in: ['ASSET', 'LIABILITY'] } },
    orderBy: { code: 'asc' },
  });

  const balanceAt = async (accountId: number, date: Date): Promise<Prisma.Decimal> => {
    const agg = await this.prisma.journalLine.aggregate({
      where: {
        accountId,
        journalEntry: { status: 'POSTED', date: { lte: date } },
        ...(opts.buildingId
          ? {
              OR: [
                { buildingId: opts.buildingId },
                { buildingId: null, journalEntry: { buildingId: opts.buildingId } },
              ],
            }
          : {}),
      },
      _sum: { debit: true, credit: true },
    });
    return new Prisma.Decimal(agg._sum.debit ?? 0).minus(agg._sum.credit ?? 0);
    // ASSET: debit - credit = balance. For LIABILITY caller should negate.
  };

  const fromMinus = new Date(opts.from.getTime() - 1);
  const workingCapitalChanges: WorkingCapitalChange[] = [];
  let totalWcChange = new Prisma.Decimal(0);

  for (const a of accounts) {
    if (cashAccountIds.has(a.id)) continue;
    const begin = await balanceAt(a.id, fromMinus);
    const end = await balanceAt(a.id, opts.to);
    // For ASSET: balance = debit - credit. Increase in asset → cash usage (negate).
    // For LIABILITY: stored as debit - credit but natural balance is credit - debit. Flip sign.
    const rawChange = end.minus(begin);
    const change = a.type === 'ASSET' ? rawChange.negated() : rawChange.negated().negated();
    // ^ Equivalent to: ASSET → negate (increase = cash usage). LIABILITY → keep (increase = cash source, but storage is reversed so flip).
    // Simpler: LIABILITY's `rawChange` is `debit - credit`, which is negative when liability INCREASED.
    // To get the cash flow effect (liability up = +cash), we negate rawChange.
    // ASSET's `rawChange` is `debit - credit`, positive when ASSET INCREASED. To get cash flow effect (asset up = -cash), we negate.
    // So both negate. Let's keep that.
    if (change.eq(0)) continue;
    workingCapitalChanges.push({
      accountId: a.id, code: a.code, name: a.name,
      type: a.type as 'ASSET' | 'LIABILITY',
      change: change.toFixed(2),
    });
    totalWcChange = totalWcChange.plus(change);
  }

  const netCashFromOperations = netIncome.plus(totalWcChange);

  // 4. Beginning / ending cash
  let beginningCash = new Prisma.Decimal(0);
  let endingCash = new Prisma.Decimal(0);
  for (const id of cashAccountIds) {
    beginningCash = beginningCash.plus(await balanceAt(id, fromMinus));
    endingCash = endingCash.plus(await balanceAt(id, opts.to));
  }

  const reconcilesToCash = endingCash.minus(beginningCash).minus(netCashFromOperations).abs()
    .lt(new Prisma.Decimal('0.005'));

  return {
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    netIncome: netIncome.toFixed(2),
    workingCapitalChanges,
    netCashFromOperations: netCashFromOperations.toFixed(2),
    beginningCash: beginningCash.toFixed(2),
    endingCash: endingCash.toFixed(2),
    reconcilesToCash,
  };
}
```

NOTE: the comment in the change-sign math is critical — both ASSET and LIABILITY rawChanges get negated. ASSET increase = cash usage (negative). LIABILITY storage is debit-minus-credit which is negative when liability increased; negating turns it positive (cash source). Simplify the assignment to `change = rawChange.negated()` and delete the conditional. The simpler form:

```ts
const change = rawChange.negated();
```

Replace the verbose snippet above with that single line and remove the now-unused conditional comment block. Test the reconciliation invariant.

- [ ] **Step 4: Run — expect tests pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/reports.service.ts server/src/services/accounting/reports.service.test.ts
git commit -m "feat(accounting): cashFlow indirect method (operating only)"
```

---

### Task C4: listFiscalPeriods helper

**Files:**
- Modify: `server/src/services/accounting/reports.service.ts`

- [ ] **Step 1: Add the method**

```ts
async listFiscalPeriods(year?: number) {
  return this.prisma.fiscalPeriod.findMany({
    where: year !== undefined ? { year } : {},
    include: { closingEntry: { select: { id: true, entryNumber: true } } },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });
}
```

- [ ] **Step 2: Commit**

```
git add server/src/services/accounting/reports.service.ts
git commit -m "feat(accounting): listFiscalPeriods helper"
```

---

# Section D — Controllers + routes

### Task D1: Statements controller (3 reports + 3 CSV variants)

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-statements.controller.ts`

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ReportsService } from '../services/accounting/reports.service';

const reports = new ReportsService(prisma as any);

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function incomeStatement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, buildingId } = req.query as { from?: string; to?: string; buildingId?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const result = await reports.incomeStatement({
      from: new Date(from), to: new Date(to),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function incomeStatementCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, buildingId } = req.query as { from?: string; to?: string; buildingId?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const r = await reports.incomeStatement({
      from: new Date(from), to: new Date(to),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="income-statement-${from}-${to}.csv"`);
    res.write('Section,Code,Name,Amount\n');
    for (const row of r.income.rows) res.write(['Income', row.code, row.name, row.amount].map((v) => csvEscape(String(v))).join(',') + '\n');
    res.write(`Income,,,Total,${r.income.total}\n`);
    for (const row of r.expenses.rows) res.write(['Expenses', row.code, row.name, row.amount].map((v) => csvEscape(String(v))).join(',') + '\n');
    res.write(`Expenses,,,Total,${r.expenses.total}\n`);
    res.write(`Net Income,,,,${r.netIncome}\n`);
    res.end();
  } catch (err) { next(err); }
}

export async function balanceSheet(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { asOf, buildingId } = req.query as { asOf?: string; buildingId?: string };
    if (!asOf) { res.status(400).json({ message: 'asOf query param required' }); return; }
    const result = await reports.balanceSheet({
      asOf: new Date(asOf),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function balanceSheetCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { asOf, buildingId } = req.query as { asOf?: string; buildingId?: string };
    if (!asOf) { res.status(400).json({ message: 'asOf query param required' }); return; }
    const r = await reports.balanceSheet({
      asOf: new Date(asOf),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="balance-sheet-${asOf}.csv"`);
    res.write('Section,Code,Name,Balance\n');
    for (const sec of [r.assets, r.liabilities, r.equity]) {
      for (const row of sec.rows) res.write([sec.type, row.code, row.name, row.balance].map((v) => csvEscape(String(v))).join(',') + '\n');
      res.write(`${sec.type},,,Total,${sec.total}\n`);
    }
    res.write(`EQUITY,,,Current Year Earnings,${r.currentYearIncome}\n`);
    res.write(`,,,Total Liabilities + Equity,${r.totalLiabilitiesAndEquity}\n`);
    res.end();
  } catch (err) { next(err); }
}

export async function cashFlow(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, buildingId } = req.query as { from?: string; to?: string; buildingId?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const result = await reports.cashFlow({
      from: new Date(from), to: new Date(to),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function cashFlowCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, buildingId } = req.query as { from?: string; to?: string; buildingId?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const r = await reports.cashFlow({
      from: new Date(from), to: new Date(to),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cash-flow-${from}-${to}.csv"`);
    res.write('Line,Detail,Amount\n');
    res.write(`Net Income,,${r.netIncome}\n`);
    for (const wc of r.workingCapitalChanges) {
      res.write(['Working Capital', `${wc.code} ${wc.name}`, wc.change].map((v) => csvEscape(String(v))).join(',') + '\n');
    }
    res.write(`Net Cash from Operations,,${r.netCashFromOperations}\n`);
    res.write(`Beginning Cash,,${r.beginningCash}\n`);
    res.write(`Ending Cash,,${r.endingCash}\n`);
    res.end();
  } catch (err) { next(err); }
}
```

Commit:
```
git add server/src/controllers/accounting-statements.controller.ts
git commit -m "feat(accounting): statements controller (income, balance, cash flow + CSVs)"
```

---

### Task D2: Periods controller (list, lock, unlock)

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-periods.controller.ts`

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ReportsService } from '../services/accounting/reports.service';

const reports = new ReportsService(prisma as any);

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { year } = req.query as { year?: string };
    const rows = await reports.listFiscalPeriods(year ? Number(year) : undefined);
    res.json(rows);
  } catch (err) { next(err); }
}

function parseYM(req: AuthRequest): { year: number; month: number } | null {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function lock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ym = parseYM(req);
    if (!ym) { res.status(400).json({ message: 'Invalid year/month' }); return; }
    const updated = await prisma.fiscalPeriod.upsert({
      where: { year_month: ym },
      create: { ...ym, status: 'LOCKED', lockedAt: new Date(), lockedBy: req.user!.id },
      update: { status: 'LOCKED', lockedAt: new Date(), lockedBy: req.user!.id },
    });
    res.json(updated);
  } catch (err) { next(err); }
}

export async function unlock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ym = parseYM(req);
    if (!ym) { res.status(400).json({ message: 'Invalid year/month' }); return; }
    const existing = await prisma.fiscalPeriod.findUnique({ where: { year_month: ym } });
    if (!existing) { res.status(404).json({ message: 'Period not found' }); return; }
    if (existing.closingEntryId) {
      res.status(400).json({ message: 'Cannot unlock a period belonging to a closed fiscal year' });
      return;
    }
    const updated = await prisma.fiscalPeriod.update({
      where: { year_month: ym },
      data: { status: 'OPEN', lockedAt: null, lockedBy: null },
    });
    res.json(updated);
  } catch (err) { next(err); }
}
```

Commit:
```
git add server/src/controllers/accounting-periods.controller.ts
git commit -m "feat(accounting): periods controller — list, lock, unlock"
```

---

### Task D3: Year-close controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-year-close.controller.ts`

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService } from '../services/accounting/posting.service';
import { AccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);

export async function close(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const year = Number(req.params.year);
    if (isNaN(year) || year < 1900 || year > 9999) {
      res.status(400).json({ message: 'Invalid year' });
      return;
    }
    try {
      const entry = await posting.closeFiscalYear(year, req.user!.id);
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof AccountingError) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}
```

Commit:
```
git add server/src/controllers/accounting-year-close.controller.ts
git commit -m "feat(accounting): year-close controller (POST /accounting/fiscal-years/:year/close)"
```

---

### Task D4: Expense controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-expenses.controller.ts`

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService } from '../services/accounting/posting.service';
import { AccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);

const entryInclude = {
  lines: { orderBy: { lineOrder: 'asc' as const }, include: { account: true } },
  building: { select: { id: true, name: true } },
} as const;

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { date, memo, buildingId, expenseAccountId, amount, payFromAccountId, taxCodeId } = req.body as {
      date?: string; memo?: string; buildingId?: number | null;
      expenseAccountId?: number; amount?: number | string;
      payFromAccountId?: number; taxCodeId?: number | null;
    };

    if (!date) { res.status(400).json({ message: 'date is required' }); return; }
    if (typeof expenseAccountId !== 'number' || expenseAccountId <= 0) {
      res.status(400).json({ message: 'expenseAccountId is required' });
      return;
    }
    if (typeof payFromAccountId !== 'number' || payFromAccountId <= 0) {
      res.status(400).json({ message: 'payFromAccountId is required' });
      return;
    }
    if (amount === undefined || amount === null || (typeof amount === 'number' && amount <= 0)) {
      res.status(400).json({ message: 'amount must be a positive number' });
      return;
    }

    try {
      const entry = await posting.postExpense(
        {
          date: new Date(date),
          memo: memo ?? undefined,
          buildingId: buildingId ?? null,
          expenseAccountId,
          amount,
          payFromAccountId,
          taxCodeId: taxCodeId ?? null,
        },
        req.user!.id,
      );
      const full = await prisma.journalEntry.findUnique({ where: { id: entry.id }, include: entryInclude });
      res.status(201).json(full);
    } catch (err) {
      if (err instanceof AccountingError) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}
```

Commit:
```
git add server/src/controllers/accounting-expenses.controller.ts
git commit -m "feat(accounting): expense controller (POST /accounting/expenses)"
```

---

### Task D5: Extend reversal controller with reverseEntry endpoint

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\controllers\accounting-reversal.controller.ts`

The existing file has `reverse` (for payments). Add a new export `reverseEntry`:

```ts
// At the top (alongside the existing PostingService instance), no new imports needed.

export async function reverseEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entryId = Number(req.params.id);
    if (isNaN(entryId) || entryId <= 0) { res.status(400).json({ message: 'Invalid id' }); return; }
    try {
      const reversal = await posting.reverseEntry(entryId, req.user!.id);
      res.status(201).json(reversal);
    } catch (err) {
      if (err instanceof AccountingError) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}
```

Commit:
```
git add server/src/controllers/accounting-reversal.controller.ts
git commit -m "feat(accounting): reversal controller — add reverseEntry endpoint for manual JE reversal"
```

---

### Task D6: Routes wiring

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\routes\accounting.routes.ts`

- [ ] **Step 1: Add new controller imports**

```ts
import * as statements from '../controllers/accounting-statements.controller';
import * as periods from '../controllers/accounting-periods.controller';
import * as yearClose from '../controllers/accounting-year-close.controller';
import * as expenses from '../controllers/accounting-expenses.controller';
import { reverseEntry as reverseEntryHandler } from '../controllers/accounting-reversal.controller';
```

- [ ] **Step 2: Add new routes** before the `export default router` line. The `adminOnly` constant already exists in the file from Phase 2.

```ts
// Statements
router.get('/reports/income-statement', statements.incomeStatement);
router.get('/reports/income-statement.csv', statements.incomeStatementCsv);
router.get('/reports/balance-sheet', statements.balanceSheet);
router.get('/reports/balance-sheet.csv', statements.balanceSheetCsv);
router.get('/reports/cash-flow', statements.cashFlow);
router.get('/reports/cash-flow.csv', statements.cashFlowCsv);

// Fiscal periods
router.get('/fiscal-periods', periods.list);
router.post('/fiscal-periods/:year/:month/lock', adminOnly, periods.lock);
router.post('/fiscal-periods/:year/:month/unlock', adminOnly, periods.unlock);

// Year-end close
router.post('/fiscal-years/:year/close', adminOnly, yearClose.close);

// Manual JE reversal (works on any POSTED JE except PAYMENT_AUTO)
router.post('/journal-entries/:id/reverse', reverseEntryHandler);

// Expense entry
router.post('/expenses', expenses.create);
```

- [ ] **Step 3: Typecheck**

```
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add server/src/routes/accounting.routes.ts
git commit -m "feat(accounting): mount Phase 3 routes (statements, periods, year-close, reverse-entry, expenses)"
```

---

# Section E — HTTP integration tests

### Task E1: Statements HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-statements.controller.test.ts`

Follow the Phase 2 pattern (`accounting-vat-return.controller.test.ts` is the closest template — real DB, admin cookie, seeded accounts + mappings + tax code + bookings + posted payments via PostingService).

Seed:
- Admin user, real DB row.
- Cash, Revenue, Expense, VAT Payable accounts.
- TaxCode VAT_STANDARD 5% default.
- All 8 AccountMappings.
- SystemSettings accountingMode CASH.
- Building, apartment, tenant, booking taxCodeId VAT_STANDARD.
- 3 posted payments of 1050 each (net 1000 + VAT 50 each).
- One posted expense of 105 (net 100 + VAT 5) via `postExpense`.

Tests (~6):
- `GET /accounting/reports/income-statement?from=...&to=...` returns 200 with `netIncome` matching expected.
- `GET /accounting/reports/income-statement.csv` returns `text/csv` content-type and a header row.
- `GET /accounting/reports/balance-sheet?asOf=...` returns 200 with `isBalanced: true`.
- `GET /accounting/reports/balance-sheet.csv` returns CSV.
- `GET /accounting/reports/cash-flow?from=...&to=...` returns 200 with `reconcilesToCash: true`.
- `GET /accounting/reports/cash-flow.csv` returns CSV.

Run + commit:
```
cd server && npx vitest run src/controllers/accounting-statements.controller.test.ts
git add server/src/controllers/accounting-statements.controller.test.ts
git commit -m "test(accounting): statements HTTP + CSV tests (income, balance, cash flow)"
```

---

### Task E2: Periods HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-periods.controller.test.ts`

Seed: admin + finance users. No starter chart needed (periods don't reference accounts directly).

Tests (~5):
- `GET /accounting/fiscal-periods` with no rows → returns `[]`.
- `GET /accounting/fiscal-periods?year=2026` filters correctly.
- `POST /accounting/fiscal-periods/2026/5/lock` (admin) creates a LOCKED period.
- `POST /accounting/fiscal-periods/2026/5/lock` (finance) → 403.
- `POST /accounting/fiscal-periods/2026/5/unlock` after lock → status OPEN, `lockedAt` cleared.
- `POST /accounting/fiscal-periods/2026/12/unlock` when the year was closed (has closingEntryId) → 400 with explanatory message.

Run + commit:
```
cd server && npx vitest run src/controllers/accounting-periods.controller.test.ts
git add server/src/controllers/accounting-periods.controller.test.ts
git commit -m "test(accounting): periods HTTP tests (list, lock, unlock, finance forbidden)"
```

---

### Task E3: Year-close HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-year-close.controller.test.ts`

Seed: admin + finance users, accounts (Cash, Revenue, RE 3020), one posted JE in the test year.

Tests (~4):
- `POST /accounting/fiscal-years/2030/close` (admin) returns 201 with the closing JE; the year's 12 periods are LOCKED.
- `POST /accounting/fiscal-years/2030/close` (admin) again → 400 ALREADY_CLOSED.
- `POST /accounting/fiscal-years/2031/close` (admin) with no activity → 400 MIN_LINES.
- `POST /accounting/fiscal-years/2030/close` (finance) → 403.

Run + commit:
```
cd server && npx vitest run src/controllers/accounting-year-close.controller.test.ts
git add server/src/controllers/accounting-year-close.controller.test.ts
git commit -m "test(accounting): year-close HTTP tests (admin-only, idempotent, MIN_LINES on empty)"
```

---

### Task E4: Expenses HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-expenses.controller.test.ts`

Seed: admin user, accounts (Cash, AP, Utilities expense, VAT Payable), TaxCode VAT_STANDARD 5%, all mappings.

Tests (~4):
- `POST /accounting/expenses` with tax code returns 201 + 3-line JE (Expense net, VAT debit, Cash credit).
- `POST /accounting/expenses` without tax code returns 201 + 2-line JE.
- `POST /accounting/expenses` with AP as `payFromAccountId` returns 201 + AP credit.
- `POST /accounting/expenses` missing required fields → 400.

Run + commit:
```
cd server && npx vitest run src/controllers/accounting-expenses.controller.test.ts
git add server/src/controllers/accounting-expenses.controller.test.ts
git commit -m "test(accounting): expense entry HTTP tests"
```

---

### Task E5: Reversal HTTP tests — extend existing file

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\controllers\accounting-reversal.controller.test.ts`

Append a new describe block at the bottom for the manual reverse-entry endpoint:

```ts
describe('POST /accounting/journal-entries/:id/reverse', () => {
  let originalEntryId: number;

  beforeAll(async () => {
    // Post a manual JE that's reversible (not PAYMENT_AUTO)
    const entry = await posting.createAndPost(
      {
        date: new Date(),
        lines: [
          { accountId: cashId, debit: '50' },
          { accountId: revenueId, credit: '50' },
        ],
        source: 'MANUAL',
      },
      userId,
    );
    originalEntryId = entry.id;
  });

  it('posts a reversing JE for a manual POSTED entry', async () => {
    const r = await request(app)
      .post(`/api/v1/accounting/journal-entries/${originalEntryId}/reverse`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(201);
    expect(r.body.source).toBe('MANUAL_REVERSAL');
    expect(r.body.reversesEntryId).toBe(originalEntryId);
  });

  it('rejects reversing a PAYMENT_AUTO entry — points user at /payments/:id/reverse', async () => {
    // paidPaymentId from existing fixtures, freshly posted
    await db.payment.update({ where: { id: paidPaymentId }, data: { status: 'PAID', postedEntryId: null } });
    const autoEntry = await posting.postFromPayment(paidPaymentId, userId);
    const r = await request(app)
      .post(`/api/v1/accounting/journal-entries/${autoEntry!.id}/reverse`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CANNOT_REVERSE');
    expect(r.body.details.source).toBe('PAYMENT_AUTO');
  });
});
```

(The fixture variables `cashId`, `revenueId`, `userId`, `paidPaymentId`, `posting`, `db`, `adminCookie` are already in scope from the file's Phase 2 setup.)

Run + commit:
```
cd server && npx vitest run src/controllers/accounting-reversal.controller.test.ts
git add server/src/controllers/accounting-reversal.controller.test.ts
git commit -m "test(accounting): reverse-entry HTTP tests (manual JE + PAYMENT_AUTO rejection)"
```

---

### Task E6: Regression — payments/bookings tests still pass with period-lock guard

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\controllers\payments.controller.test.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\controllers\bookings.controller.test.ts`

Most existing tests will still pass because they post into recent dates (current open period). Add one regression test in each verifying PERIOD_LOCKED rejection:

```ts
describe('Period-lock regression (Phase 3)', () => {
  it('payment auto-post rejects when target period is LOCKED', async () => {
    // Lock the current month
    const now = new Date();
    await testPrisma.fiscalPeriod.upsert({
      where: { year_month: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 } },
      create: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, status: 'LOCKED' },
      update: { status: 'LOCKED' },
    });

    const r = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CASH', amount: 100 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PERIOD_LOCKED');

    // Unlock for downstream tests
    await testPrisma.fiscalPeriod.update({
      where: { year_month: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 } },
      data: { status: 'OPEN', lockedAt: null, lockedBy: null },
    });
  });
});
```

Adapt the `bookingId` reference to match the test file's actual fixture name.

Run + commit:
```
cd server && npx vitest run src/controllers/payments.controller.test.ts src/controllers/bookings.controller.test.ts
git add server/src/controllers/payments.controller.test.ts server/src/controllers/bookings.controller.test.ts
git commit -m "test: regression — payment/booking auto-posting rejects in locked period"
```

---

### Task E7: Full server sweep

- [ ] **Step 1: Run all server tests**

```
cd server && npx vitest run
```

Expected: all tests pass (Phase 1 + Phase 2 + Phase 3). If any fail, READ the failure and don't guess.

- [ ] **Step 2: Commit nothing — just verification.**

---

# Section F — Client API + components

### Task F1: Client API module

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\lib\api\accounting-phase3.ts`

```ts
import api from '../axios';

export type IncomeStatementRow = { accountId: number; code: string; name: string; amount: string };
export type IncomeStatementSection = { type: 'INCOME' | 'EXPENSE'; rows: IncomeStatementRow[]; total: string };
export type IncomeStatementResult = {
  from: string; to: string;
  income: IncomeStatementSection;
  expenses: IncomeStatementSection;
  netIncome: string;
};

export type BalanceSheetRow = { accountId: number; code: string; name: string; balance: string };
export type BalanceSheetSection = { type: 'ASSET' | 'LIABILITY' | 'EQUITY'; rows: BalanceSheetRow[]; total: string };
export type BalanceSheetResult = {
  asOf: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  currentYearIncome: string;
  totalLiabilitiesAndEquity: string;
  isBalanced: boolean;
};

export type WorkingCapitalChange = {
  accountId: number; code: string; name: string;
  type: 'ASSET' | 'LIABILITY'; change: string;
};

export type CashFlowResult = {
  from: string; to: string;
  netIncome: string;
  workingCapitalChanges: WorkingCapitalChange[];
  netCashFromOperations: string;
  beginningCash: string;
  endingCash: string;
  reconcilesToCash: boolean;
};

export type FiscalPeriod = {
  id: number;
  year: number;
  month: number;
  status: 'OPEN' | 'LOCKED';
  lockedAt: string | null;
  lockedBy: number | null;
  closingEntryId: number | null;
  closingEntry: { id: number; entryNumber: string } | null;
};

export const statementsApi = {
  incomeStatement: (params: { from: string; to: string; buildingId?: number }) =>
    api.get<IncomeStatementResult>('/accounting/reports/income-statement', { params }).then((r) => r.data),
  balanceSheet: (params: { asOf: string; buildingId?: number }) =>
    api.get<BalanceSheetResult>('/accounting/reports/balance-sheet', { params }).then((r) => r.data),
  cashFlow: (params: { from: string; to: string; buildingId?: number }) =>
    api.get<CashFlowResult>('/accounting/reports/cash-flow', { params }).then((r) => r.data),
};

export const periodsApi = {
  list: (year?: number) =>
    api.get<FiscalPeriod[]>('/accounting/fiscal-periods', { params: year ? { year } : {} }).then((r) => r.data),
  lock: (year: number, month: number) =>
    api.post<FiscalPeriod>(`/accounting/fiscal-periods/${year}/${month}/lock`).then((r) => r.data),
  unlock: (year: number, month: number) =>
    api.post<FiscalPeriod>(`/accounting/fiscal-periods/${year}/${month}/unlock`).then((r) => r.data),
};

export const yearCloseApi = {
  close: (year: number) =>
    api.post(`/accounting/fiscal-years/${year}/close`).then((r) => r.data),
};

export const expenseApi = {
  create: (body: {
    date: string;
    memo?: string;
    buildingId?: number | null;
    expenseAccountId: number;
    amount: string | number;
    payFromAccountId: number;
    taxCodeId?: number | null;
  }) => api.post('/accounting/expenses', body).then((r) => r.data),
};

export const reversalApi = {
  reverseEntry: (entryId: number) =>
    api.post(`/accounting/journal-entries/${entryId}/reverse`).then((r) => r.data),
};
```

Commit:
```
git add client/src/lib/api/accounting-phase3.ts
git commit -m "feat(client): accounting Phase 3 API client (statements, periods, year-close, expense, reverse-entry)"
```

---

### Task F2: IncomeStatementPage

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\IncomeStatementPage.tsx`

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { statementsApi } from '../../lib/api/accounting-phase3';
import api from '../../lib/axios';

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export default function IncomeStatementPage() {
  const { t } = useTranslation();
  const init = currentMonthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [buildingId, setBuildingId] = useState<number | ''>('');

  const { data: buildings = [] } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => (await api.get('/buildings')).data as { id: number; name: string }[],
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data as { booksMode: string },
  });
  const showBuildingFilter = settings?.booksMode === 'PER_BUILDING';

  const { data } = useQuery({
    queryKey: ['accounting', 'income-statement', { from, to, buildingId }],
    queryFn: () => statementsApi.incomeStatement({ from, to, buildingId: buildingId === '' ? undefined : buildingId }),
  });

  const csvUrl = `/api/v1/accounting/reports/income-statement.csv?from=${from}&to=${to}${buildingId ? `&buildingId=${buildingId}` : ''}`;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.income.title', 'Income Statement')}</h1>
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        {showBuildingFilter && (
          <label>Building
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : '')} className="border border-outline-variant rounded px-2 py-1 ml-1">
              <option value="">All</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>
      </div>
      {data && (
        <>
          <section className="mb-6">
            <h2 className="font-bold mb-2">Income</h2>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr><th className="px-2 py-1 text-left">Code</th><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {data.income.rows.map((r) => (
                  <tr key={r.accountId} className="border-t border-outline-variant">
                    <td className="px-2 py-1 font-mono">{r.code}</td>
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="px-2 py-1 text-right">{r.amount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Total Income</td><td className="px-2 py-1 text-right">{data.income.total}</td></tr></tfoot>
            </table>
          </section>

          <section className="mb-6">
            <h2 className="font-bold mb-2">Expenses</h2>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr><th className="px-2 py-1 text-left">Code</th><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {data.expenses.rows.map((r) => (
                  <tr key={r.accountId} className="border-t border-outline-variant">
                    <td className="px-2 py-1 font-mono">{r.code}</td>
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="px-2 py-1 text-right">{r.amount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Total Expenses</td><td className="px-2 py-1 text-right">{data.expenses.total}</td></tr></tfoot>
            </table>
          </section>

          <div className={`text-right text-lg font-bold border-t-2 border-on-surface pt-3 ${Number(data.netIncome) >= 0 ? 'text-primary' : 'text-error'}`}>
            Net Income: <span className="font-mono">{data.netIncome}</span>
          </div>
        </>
      )}
    </div>
  );
}
```

Commit:
```
git add client/src/pages/accounting/IncomeStatementPage.tsx
git commit -m "feat(client): Income Statement page"
```

---

### Task F3: BalanceSheetPage

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\BalanceSheetPage.tsx`

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { statementsApi, type BalanceSheetSection } from '../../lib/api/accounting-phase3';
import api from '../../lib/axios';

export default function BalanceSheetPage() {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [buildingId, setBuildingId] = useState<number | ''>('');

  const { data: buildings = [] } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => (await api.get('/buildings')).data as { id: number; name: string }[],
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data as { booksMode: string },
  });
  const showBuildingFilter = settings?.booksMode === 'PER_BUILDING';

  const { data } = useQuery({
    queryKey: ['accounting', 'balance-sheet', { asOf, buildingId }],
    queryFn: () => statementsApi.balanceSheet({ asOf, buildingId: buildingId === '' ? undefined : buildingId }),
  });

  const csvUrl = `/api/v1/accounting/reports/balance-sheet.csv?asOf=${asOf}${buildingId ? `&buildingId=${buildingId}` : ''}`;

  const SectionTable = ({ section }: { section: BalanceSheetSection }) => (
    <table className="w-full text-sm bg-surface-container-low rounded">
      <thead className="text-on-surface-variant">
        <tr><th className="px-2 py-1 text-left">Code</th><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-right">Balance</th></tr>
      </thead>
      <tbody>
        {section.rows.map((r) => (
          <tr key={r.accountId} className="border-t border-outline-variant">
            <td className="px-2 py-1 font-mono">{r.code}</td>
            <td className="px-2 py-1">{r.name}</td>
            <td className="px-2 py-1 text-right">{r.balance}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Total</td><td className="px-2 py-1 text-right">{section.total}</td></tr></tfoot>
    </table>
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.balance.title', 'Balance Sheet')}</h1>
      {data && !data.isBalanced && (
        <div className="mb-4 p-3 bg-error-container text-error rounded">
          ⚠ Out of balance — Assets ({data.assets.total}) ≠ Liabilities + Equity + Current Year Earnings ({data.totalLiabilitiesAndEquity}). Investigate.
        </div>
      )}
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        {showBuildingFilter && (
          <label>Building
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : '')} className="border border-outline-variant rounded px-2 py-1 ml-1">
              <option value="">All</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>
      </div>
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section><h2 className="font-bold mb-2">Assets</h2><SectionTable section={data.assets} /></section>
          <div>
            <section className="mb-4"><h2 className="font-bold mb-2">Liabilities</h2><SectionTable section={data.liabilities} /></section>
            <section><h2 className="font-bold mb-2">Equity</h2>
              <SectionTable section={data.equity} />
              <div className="mt-2 px-2 py-1 bg-surface-container-high text-sm flex justify-between">
                <span>Current Year Earnings</span><span className="font-mono">{data.currentYearIncome}</span>
              </div>
              <div className="mt-2 px-2 py-1 font-bold border-t-2 border-on-surface text-sm flex justify-between">
                <span>Total L + E + Current</span><span className="font-mono">{data.totalLiabilitiesAndEquity}</span>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
```

Commit:
```
git add client/src/pages/accounting/BalanceSheetPage.tsx
git commit -m "feat(client): Balance Sheet page with imbalance banner and current-year-earnings row"
```

---

### Task F4: CashFlowPage

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\CashFlowPage.tsx`

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { statementsApi } from '../../lib/api/accounting-phase3';

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export default function CashFlowPage() {
  const { t } = useTranslation();
  const init = currentMonthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data } = useQuery({
    queryKey: ['accounting', 'cash-flow', { from, to }],
    queryFn: () => statementsApi.cashFlow({ from, to }),
  });

  const csvUrl = `/api/v1/accounting/reports/cash-flow.csv?from=${from}&to=${to}`;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.cashflow.title', 'Cash Flow Statement')}</h1>
      {data && !data.reconcilesToCash && (
        <div className="mb-4 p-3 bg-error-container text-error rounded">
          ⚠ Cash flow doesn't reconcile. Beginning ({data.beginningCash}) + Operations ({data.netCashFromOperations}) ≠ Ending ({data.endingCash}).
        </div>
      )}
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>
      </div>
      {data && (
        <div className="bg-surface-container-low rounded p-4 text-sm space-y-2">
          <div className="flex justify-between"><span>Net Income</span><span className="font-mono">{data.netIncome}</span></div>
          <div className="mt-3">
            <div className="font-bold mb-1">Working Capital Changes</div>
            {data.workingCapitalChanges.length === 0 ? (
              <div className="text-on-surface-variant text-xs">No working capital changes in period.</div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {data.workingCapitalChanges.map((wc) => (
                    <tr key={wc.accountId} className="border-t border-outline-variant">
                      <td className="py-1 font-mono">{wc.code}</td>
                      <td className="py-1">{wc.name}</td>
                      <td className="py-1 text-right font-mono">{wc.change}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex justify-between font-bold pt-2 border-t border-outline-variant"><span>Net Cash from Operations</span><span className="font-mono">{data.netCashFromOperations}</span></div>
          <div className="flex justify-between pt-3 border-t border-outline-variant"><span>Beginning Cash</span><span className="font-mono">{data.beginningCash}</span></div>
          <div className="flex justify-between font-bold border-t-2 border-on-surface pt-2"><span>Ending Cash</span><span className="font-mono">{data.endingCash}</span></div>
        </div>
      )}
    </div>
  );
}
```

Commit:
```
git add client/src/pages/accounting/CashFlowPage.tsx
git commit -m "feat(client): Cash Flow page (indirect method, operating only)"
```

---

### Task F5: FiscalPeriodsPage (admin-only)

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\FiscalPeriodsPage.tsx`

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { periodsApi, yearCloseApi, type FiscalPeriod } from '../../lib/api/accounting-phase3';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function FiscalPeriodsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [closingYear, setClosingYear] = useState<number | null>(null);
  const [closeResult, setCloseResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: periods = [] } = useQuery({ queryKey: ['accounting', 'periods'], queryFn: () => periodsApi.list() });

  const lockMut = useMutation({
    mutationFn: ({ y, m }: { y: number; m: number }) => periodsApi.lock(y, m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'periods'] }),
  });
  const unlockMut = useMutation({
    mutationFn: ({ y, m }: { y: number; m: number }) => periodsApi.unlock(y, m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'periods'] }),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to unlock'),
  });
  const closeMut = useMutation({
    mutationFn: (y: number) => yearCloseApi.close(y),
    onSuccess: (r) => { setCloseResult(r); setClosingYear(null); qc.invalidateQueries({ queryKey: ['accounting', 'periods'] }); },
    onError: (e: any) => { setErr(e?.response?.data?.message ?? 'Close failed'); setClosingYear(null); },
  });

  // Group periods by year
  const years = Array.from(new Set(periods.map((p) => p.year))).sort();
  const byYearMonth = new Map<string, FiscalPeriod>(periods.map((p) => [`${p.year}-${p.month}`, p]));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.periods.title', 'Fiscal Periods')}</h1>
      {err && <div className="mb-4 p-3 bg-error-container text-error rounded">{err}</div>}
      {closeResult && (
        <div className="mb-4 p-3 bg-secondary-container text-primary rounded">
          Year closed. Closing entry: <span className="font-mono">{closeResult.entryNumber}</span>
        </div>
      )}

      {years.length === 0 ? (
        <div className="text-on-surface-variant">No fiscal periods yet. Periods are created automatically when journal entries are posted.</div>
      ) : (
        <table className="text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left">Year</th>
              {MONTHS.map((m) => <th key={m} className="px-2 py-1 text-center">{m}</th>)}
              <th className="px-2 py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const dec = byYearMonth.get(`${y}-12`);
              const closed = dec?.closingEntryId !== null && dec?.closingEntryId !== undefined;
              return (
                <tr key={y} className="border-t border-outline-variant">
                  <td className="px-2 py-1 font-bold">{y}</td>
                  {MONTHS.map((_, idx) => {
                    const p = byYearMonth.get(`${y}-${idx + 1}`);
                    const status = p?.status ?? 'OPEN';
                    return (
                      <td key={idx} className="px-2 py-1 text-center">
                        <button
                          disabled={closed}
                          onClick={() => {
                            if (status === 'OPEN') lockMut.mutate({ y, m: idx + 1 });
                            else unlockMut.mutate({ y, m: idx + 1 });
                          }}
                          className={`px-2 py-0.5 rounded text-xs ${status === 'LOCKED' ? 'bg-surface-container-high text-on-surface-variant' : 'bg-secondary-container text-primary'} disabled:opacity-50`}
                          title={status}
                        >
                          {status === 'LOCKED' ? '🔒' : '○'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right">
                    {!closed ? (
                      <button
                        onClick={() => { if (window.confirm(`Close fiscal year ${y}? This locks all 12 months and posts the closing JE to Retained Earnings.`)) { setClosingYear(y); closeMut.mutate(y); } }}
                        disabled={closingYear === y}
                        className="px-2 py-1 rounded bg-primary text-on-primary text-xs disabled:opacity-50"
                      >
                        {closingYear === y ? 'Closing…' : `Close ${y}`}
                      </button>
                    ) : (
                      <span className="text-xs text-on-surface-variant">Closed</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Commit:
```
git add client/src/pages/accounting/FiscalPeriodsPage.tsx
git commit -m "feat(client): Fiscal Periods page with calendar grid + close-year button"
```

---

### Task F6: ExpenseFormModal

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\ExpenseFormModal.tsx`

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { accountsApi } from '../../lib/api/accounting';
import { taxCodesApi } from '../../lib/api/accounting-phase2';
import { expenseApi } from '../../lib/api/accounting-phase3';
import api from '../../lib/axios';

type Props = { onClose: () => void };

export default function ExpenseFormModal({ onClose }: Props) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [taxCodeId, setTaxCodeId] = useState<number | null>(null);
  const [payFromAccountId, setPayFromAccountId] = useState<number | ''>('');
  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: accountsApi.list });
  const { data: taxCodes = [] } = useQuery({ queryKey: ['accounting', 'tax-codes'], queryFn: taxCodesApi.list });
  const { data: buildings = [] } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => (await api.get('/buildings')).data as { id: number; name: string }[],
  });

  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE' && a.isActive);
  const payFromAccounts = accounts.filter((a) => (a.type === 'ASSET' || a.type === 'LIABILITY') && a.isActive);

  const mut = useMutation({
    mutationFn: () => expenseApi.create({
      date, memo: memo || undefined, buildingId,
      expenseAccountId: Number(expenseAccountId), amount,
      payFromAccountId: Number(payFromAccountId),
      taxCodeId,
    }),
    onSuccess: (entry: any) => nav(`/accounting/journal-entries/${entry.id}`),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to save'),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    mut.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <form onSubmit={submit} className="bg-surface rounded-lg shadow-xl w-[480px] p-6">
        <h2 className="text-lg font-bold mb-4">{t('accounting.expense.title', 'Add Expense')}</h2>
        {err && <div className="text-error text-sm mb-2">{err}</div>}
        <label className="block text-sm mb-2">Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required /></label>
        <label className="block text-sm mb-2">Memo <input value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" /></label>
        <label className="block text-sm mb-2">Expense account
          <select value={expenseAccountId} onChange={(e) => setExpenseAccountId(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required>
            <option value="">— select —</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
        </label>
        <label className="block text-sm mb-2">Amount (gross)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required />
        </label>
        <label className="block text-sm mb-2">Tax code
          <select value={taxCodeId ?? ''} onChange={(e) => setTaxCodeId(e.target.value ? Number(e.target.value) : null)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
            <option value="">— None —</option>
            {taxCodes.filter((tc) => tc.isActive).map((tc) => <option key={tc.id} value={tc.id}>{tc.code} ({tc.ratePct}%)</option>)}
          </select>
        </label>
        <label className="block text-sm mb-2">Pay from
          <select value={payFromAccountId} onChange={(e) => setPayFromAccountId(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required>
            <option value="">— select —</option>
            {payFromAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
        </label>
        {buildings.length > 0 && (
          <label className="block text-sm mb-4">Building (optional)
            <select value={buildingId ?? ''} onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : null)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
              <option value="">— none —</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button type="submit" disabled={mut.isPending} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

Commit:
```
git add client/src/pages/accounting/ExpenseFormModal.tsx
git commit -m "feat(client): ExpenseFormModal — friendlier expense entry form"
```

---

# Section G — Client wiring (routes, sidebar, JE list, JE detail, settings, i18n)

### Task G1: App.tsx — register 4 new routes

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\App.tsx`

Add imports near other accounting page imports:

```tsx
import IncomeStatementPage from './pages/accounting/IncomeStatementPage';
import BalanceSheetPage from './pages/accounting/BalanceSheetPage';
import CashFlowPage from './pages/accounting/CashFlowPage';
import FiscalPeriodsPage from './pages/accounting/FiscalPeriodsPage';
```

Inside the existing `{f[FeatureFlag.ACCOUNTING] && (<>...</>)}` block, after the existing Phase 2 routes (mapping, vat-return), add four routes:

```tsx
<Route path="accounting/income-statement" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><IncomeStatementPage /></ProtectedRoute>} />
<Route path="accounting/balance-sheet" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><BalanceSheetPage /></ProtectedRoute>} />
<Route path="accounting/cash-flow" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><CashFlowPage /></ProtectedRoute>} />
<Route path="accounting/periods" element={<ProtectedRoute allowedRoles={ADMIN_ONLY}><FiscalPeriodsPage /></ProtectedRoute>} />
```

`ADMIN_ONLY` is already defined in App.tsx from Phase 1. If it isn't, add `const ADMIN_ONLY = [Role.SUPER_ADMIN, Role.ADMIN];` near the existing role-set constants.

Commit:
```
git add client/src/App.tsx
git commit -m "feat(client): register Phase 3 routes (income, balance, cash flow, periods)"
```

---

### Task G2: Sidebar — add 4 nav items

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\components\layout\Sidebar.tsx`

Inside `NAV_ITEMS`, after the existing accounting entries (last Phase 2 entry is `accounting/vat-return`), append:

```ts
  { to: '/accounting/income-statement', icon: 'trending_up', key: 'accountingIncome', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE], feature: FeatureFlag.ACCOUNTING },
  { to: '/accounting/balance-sheet', icon: 'account_balance_wallet', key: 'accountingBalance', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE], feature: FeatureFlag.ACCOUNTING },
  { to: '/accounting/cash-flow', icon: 'water_drop', key: 'accountingCashflow', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE], feature: FeatureFlag.ACCOUNTING },
  { to: '/accounting/periods', icon: 'lock_clock', key: 'accountingPeriods', roles: [Role.SUPER_ADMIN, Role.ADMIN], feature: FeatureFlag.ACCOUNTING },
```

Commit:
```
git add client/src/components/layout/Sidebar.tsx
git commit -m "feat(client): sidebar entries for income, balance, cash flow, periods"
```

---

### Task G3: JournalEntriesPage — Add Expense button

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\pages\accounting\JournalEntriesPage.tsx`

Read the file first. In the header area where the "+ New Entry" link currently lives, add a "+ Add Expense" button next to it that opens the modal:

```tsx
import { useState } from 'react';
import ExpenseFormModal from './ExpenseFormModal';

// ... existing state ...
const [showExpense, setShowExpense] = useState(false);

// In the JSX, next to the existing "New Entry" link:
<button onClick={() => setShowExpense(true)} className="ltr:ml-2 rtl:mr-2 px-3 py-2 rounded border border-primary text-primary text-sm">
  + Add Expense
</button>

// At the bottom of the page:
{showExpense && <ExpenseFormModal onClose={() => setShowExpense(false)} />}
```

Commit:
```
git add client/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(client): + Add Expense button on Journal Entries list page"
```

---

### Task G4: Journal Entry detail page — Reverse this entry button

**Files:**
- Locate the JE detail/editor page (likely `client/src/pages/accounting/JournalEntryEditorPage.tsx` — verify by searching for "POSTED" and the existing read-only render path)
- Modify the page to add the reverse button when entry is POSTED and not already reversed

Steps:

- [ ] **Step 1: Read the file to find the POSTED-readonly render path.**

```
cd "D:\Hotel Apartment Management System"
grep -n "POSTED" client/src/pages/accounting/JournalEntryEditorPage.tsx
```

- [ ] **Step 2: Add imports**

```tsx
import { useMutation } from '@tanstack/react-query';
import { reversalApi } from '../../lib/api/accounting-phase3';
```

- [ ] **Step 3: Add state + mutation inside the component**

```tsx
const [showReverseConfirm, setShowReverseConfirm] = useState(false);
const [reverseErr, setReverseErr] = useState<string | null>(null);

const reverseMut = useMutation({
  mutationFn: () => reversalApi.reverseEntry(editingId!),
  onSuccess: (newEntry: any) => nav(`/accounting/journal-entries/${newEntry.id}`),
  onError: (e: any) => setReverseErr(e?.response?.data?.message ?? 'Failed to reverse'),
});
```

- [ ] **Step 4: Add the Reverse button in the POSTED-readonly action bar**

Find where the read-only view renders "Export PDF" / "Back" buttons (or whatever currently exists for POSTED). Add a "Reverse this entry" button that only appears when `existing.source !== 'PAYMENT_AUTO'` and `!existing.reversesEntryId` (it's not itself a reversal — though this is optional UX polish):

```tsx
{readOnly && existing && existing.source !== 'PAYMENT_AUTO' && (
  <button onClick={() => setShowReverseConfirm(true)} className="px-3 py-1 rounded bg-error text-on-primary text-sm">
    Reverse this entry
  </button>
)}

{showReverseConfirm && (
  <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
    <div className="bg-surface rounded-lg shadow-xl w-[480px] p-6">
      <h2 className="text-lg font-bold mb-4">Reverse Journal Entry</h2>
      <p className="text-sm text-on-surface-variant mb-4">
        This will post a balancing entry dated today. The original remains in the ledger for audit. Continue?
      </p>
      {reverseErr && <div className="text-error text-sm mb-2">{reverseErr}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setShowReverseConfirm(false)} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
        <button onClick={() => reverseMut.mutate()} disabled={reverseMut.isPending} className="px-3 py-1 rounded bg-error text-on-primary text-sm disabled:opacity-50">
          {reverseMut.isPending ? 'Reversing…' : 'Reverse'}
        </button>
      </div>
    </div>
  </div>
)}
```

If the actual variable names differ from `existing`, `readOnly`, `editingId`, `nav` — adapt to what the file uses.

Commit:
```
git add client/src/pages/accounting/JournalEntryEditorPage.tsx
git commit -m "feat(client): Reverse this entry button on JE detail (POSTED, non-PAYMENT_AUTO)"
```

---

### Task G5: SettingsPage — periods link + per-year close button

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\pages\settings\SettingsPage.tsx`

Read the file. Inside the existing Accounting section (gated by `flags?.[FeatureFlag.ACCOUNTING]`), after the existing Phase 2 setup/backfill buttons, add a "Manage Periods" link:

```tsx
import { Link } from 'react-router-dom';
// ... inside the Accounting section, after the existing buttons:
<div className="mt-3">
  <Link to="/accounting/periods" className="text-sm text-primary underline">
    Manage fiscal periods →
  </Link>
</div>
```

Per-year close buttons are out of scope here — the periods page itself has those. The Settings link is enough.

Commit:
```
git add client/src/pages/settings/SettingsPage.tsx
git commit -m "feat(client): SettingsPage — link to Fiscal Periods page"
```

---

### Task G6: i18n EN + AR

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\i18n\locales\en\translation.json`
- Modify: `D:\Hotel Apartment Management System\client\src\i18n\locales\ar\translation.json`

Deep-merge these keys into each file (preserve all existing keys, valid JSON):

**English:**
```json
{
  "nav": {
    "accountingIncome": "Income Statement",
    "accountingBalance": "Balance Sheet",
    "accountingCashflow": "Cash Flow",
    "accountingPeriods": "Periods"
  },
  "accounting": {
    "income":     { "title": "Income Statement" },
    "balance":    { "title": "Balance Sheet" },
    "cashflow":   { "title": "Cash Flow Statement" },
    "periods":    { "title": "Fiscal Periods" },
    "expense":    { "title": "Add Expense" }
  }
}
```

**Arabic:**
```json
{
  "nav": {
    "accountingIncome": "قائمة الدخل",
    "accountingBalance": "الميزانية العمومية",
    "accountingCashflow": "التدفقات النقدية",
    "accountingPeriods": "الفترات المحاسبية"
  },
  "accounting": {
    "income":     { "title": "قائمة الدخل" },
    "balance":    { "title": "الميزانية العمومية" },
    "cashflow":   { "title": "قائمة التدفقات النقدية" },
    "periods":    { "title": "الفترات المحاسبية" },
    "expense":    { "title": "إضافة مصروف" }
  }
}
```

Commit:
```
git add client/src/i18n/locales
git commit -m "feat(i18n): English and Arabic translations for accounting Phase 3"
```

---

# Section H — Docs

### Task H1: BRD v2.3

**Files:**
- Modify: `D:\Hotel Apartment Management System\Hotel_Apartment_BRD.md`

(a) Replace the version line. Current: `**Version:** 2.2 — Updated 2026-05-17 — Accounting module Phase 2 ...`. Replace with:

```
**Version:** 2.3 — Updated 2026-05-17 — Accounting module Phase 3 (statements, fiscal periods, year-end close, manual reversal, expense entry)
```

(b) After §4.11, add §4.12:

```markdown
### 4.12 Accounting Module (Phase 3)

- **Financial statements:** Income Statement (P&L), Balance Sheet, Cash Flow Statement (indirect, operating-only). Each supports date range / as-of-date filtering and an optional building filter when `booksMode = PER_BUILDING`. CSV export per statement.
- **Fiscal periods:** calendar-year monthly. New `FiscalPeriod` model with status `OPEN` or `LOCKED`. Periods auto-create lazily on first journal entry in the month.
- **Period lock:** posting a journal entry whose date falls in a LOCKED period throws `PERIOD_LOCKED`. Admin can lock/unlock individual months.
- **Year-end close:** admin action that posts a single closing journal entry zeroing INCOME and EXPENSE balances to Retained Earnings (account `3020`), then locks all 12 months of that year. Idempotent.
- **Manual journal entry reversal:** "Reverse this entry" action on any POSTED journal entry (except `PAYMENT_AUTO` entries — those use the payment-specific reversal). Reversal posts a balancing entry dated today, links via `reversesEntryId`. Used for corrections after a period is locked.
- **Expense entry:** dedicated "Add Expense" form (Date, Memo, Expense Account, Amount, Tax Code, Pay From, Building). Builds a journal entry with optional VAT split.

Period status (CLOSED-but-not-LOCKED), bank reconciliation, configurable fiscal-year-start month, fixed-asset depreciation, and direct-method cash flow are out of v1.
```

Commit:
```
git add Hotel_Apartment_BRD.md
git commit -m "docs(brd): v2.3 — accounting module Phase 3"
```

---

### Task H2: Manual test plan §21

**Files:**
- Modify: `D:\Hotel Apartment Management System\docs\manual-test-plan.md`

Append at the end:

```markdown

## 21. Accounting Module (Phase 3)

**Prerequisites:** Phase 1 + 2 active; `FEATURE_ACCOUNTING=true`; Setup has been run. Log in as ADMIN.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 21.1 | Income statement happy path | Visit `/accounting/income-statement` for the current month after Phase 2 setup + a few posted payments | Income section lists Rental Revenue; total > 0; Net Income > 0 |
| 21.2 | Income statement CSV export | Click Export CSV | Downloads a `.csv` opening cleanly in Excel |
| 21.3 | Balance sheet — balanced | Visit `/accounting/balance-sheet` as-of today | Assets total equals Liabilities + Equity + Current Year Earnings (no red banner) |
| 21.4 | Balance sheet — current year earnings | Compare CYE to the period-to-date net income from Income Statement | They match to the cent |
| 21.5 | Cash flow — reconciles | Visit `/accounting/cash-flow` for the current month | "Ending Cash" equals "Beginning Cash + Net Cash from Operations"; no red banner |
| 21.6 | Add Expense (with VAT) | From JE list, click "+ Add Expense"; pick Utilities Expense, amount 210, VAT_STANDARD, Pay From Cash | JE created with 3 lines (Expense 200 net debit, VAT 10 debit, Cash 210 credit) |
| 21.7 | Add Expense (no VAT) | Same form, tax code "None" | JE has 2 lines (Expense gross debit, Cash gross credit) |
| 21.8 | Add Expense from AP | Pay From = Accounts Payable | JE credits AP instead of Cash |
| 21.9 | Period lock blocks posting | Open Periods; lock current month; try to create any new JE dated today | 400 PERIOD_LOCKED |
| 21.10 | Period unlock restores posting | Unlock the month | New JE succeeds |
| 21.11 | Reverse a manual JE | On a POSTED manual JE detail page, click "Reverse this entry"; confirm | New JE posted dated today with swapped debit/credit; `reversesEntryId` matches original |
| 21.12 | Reverse blocked for PAYMENT_AUTO | Find a payment-auto JE; click Reverse | 400 CANNOT_REVERSE with hint pointing to the payment-specific endpoint |
| 21.13 | Year-end close happy path | Periods page → Close Year YYYY (the previous year if available) | Closing JE posted to Retained Earnings; all 12 months of that year show LOCKED 🔒 |
| 21.14 | Year-end close idempotency | Click Close Year again | 400 ALREADY_CLOSED |
| 21.15 | Year-end close with no activity | Try to close a year with no posted entries | 400 MIN_LINES |
| 21.16 | Statement after year-end close | Balance Sheet as-of Dec 31 of closed year | Retained Earnings absorbs the prior year's net income; Current Year Earnings = 0 if asOf is in the closed year |
| 21.17 | Arabic RTL | Switch to Arabic; visit all 4 new pages | Layout mirrors correctly |
```

Commit:
```
git add docs/manual-test-plan.md
git commit -m "docs: add §21 manual test plan for accounting Phase 3"
```

---

# Section I — Final integration

### Task I1: Full sweep + smoke test

- [ ] **Step 1: Full server test suite**

```
cd server && rtk proxy npx vitest run --silent --reporter=dot 2>&1 | tail -10
```

Expected: all tests pass. The "Test Files" and "Tests passed" summary lines should appear.

- [ ] **Step 2: Client typecheck**

```
cd client && npx tsc --noEmit
```

Expected: only the pre-existing `LoginPage.tsx` error from master. No new errors from Phase 3.

- [ ] **Step 3: Start dev servers and walk the happy path**

```
# Terminal 1
cd server && npm run dev
# Terminal 2
cd client && npm run dev
```

In a browser:
1. Log in as ADMIN.
2. Visit `/accounting/income-statement` — verify rows and totals.
3. Visit `/accounting/balance-sheet` — verify A = L + E + CYE.
4. Visit `/accounting/cash-flow` — verify reconciliation.
5. Visit `/accounting/periods` — verify the calendar grid for the current year.
6. From `/accounting/journal-entries`, click "+ Add Expense", fill in fields, submit — verify the JE.
7. On a manual JE detail page (POSTED, non-PAYMENT_AUTO), click "Reverse this entry" — verify a reversing JE is posted dated today.
8. From the Periods page, lock the current month — try to post a payment dated today — verify 400 PERIOD_LOCKED. Unlock and retry.
9. From the Periods page, close a year that has posted activity — verify the closing JE and that 12 months show as LOCKED.
10. Switch UI to Arabic, re-walk 2-6 to verify RTL.

- [ ] **Step 4: Run manual test plan §21** end-to-end. Note any failures.

- [ ] **Step 5: Final commit (only if smoke surfaced small fixes)**

```
git add -p
git commit -m "fix(accounting): address issues found during Phase 3 smoke test"
```

---

## Done

Phase 3 ships:

- 3 financial statements (income, balance sheet, cash flow) with CSV exports.
- `FiscalPeriod` model + monthly lock/unlock + idempotent year-end close.
- Manual JE reversal for corrections (rejects PAYMENT_AUTO).
- Dedicated expense entry form.
- ~35 new tests; total expected after Phase 3: ~330+ server tests.

What unblocks Phase 4:
- `FiscalPeriod` model exists — bank reconciliation gets a natural per-period boundary.
- Cash flow statement is in place — bank reconciliation differences flow into Operating cash adjustments without a redesign.
- Manual JE reversal infrastructure exists; bank-rec adjustments use the same primitive.

---

## Self-review notes

**Spec coverage:**

- [x] FiscalPeriod model + lazy auto-create — Tasks A2, B1
- [x] Period-lock guard in `post()` — Task B1
- [x] reverseEntry (manual JE reversal, rejects PAYMENT_AUTO) — Task B2
- [x] closeFiscalYear (idempotent, locks 12 months) — Task B3
- [x] postExpense — Task B4
- [x] incomeStatement — Task C1
- [x] balanceSheet (with synthetic Current Year Earnings row) — Task C2
- [x] cashFlow (indirect, operating only) — Task C3
- [x] listFiscalPeriods — Task C4
- [x] 5 new controllers + routes wiring — Tasks D1–D6
- [x] HTTP integration tests for each new controller — Tasks E1–E5
- [x] Regression for period-lock — Task E6
- [x] Client API + 5 new components — Tasks F1–F6
- [x] App routes, sidebar, JE list, JE detail, settings, i18n — Tasks G1–G6
- [x] BRD v2.3 + manual test plan §21 — Tasks H1–H2
- [x] Smoke test — Task I1
- [x] New error codes `PERIOD_LOCKED`, `ALREADY_CLOSED` — Task A1
- [x] New `MANUAL_REVERSAL` source — Task A2

**Placeholder scan:** no TBDs. Task D6 references `adminOnly` constant — verified it exists in the Phase 2 routes file. The plan acknowledges this directly.

**Type consistency:**
- `FiscalPeriodStatus` defined in shared (A1) and Prisma (A2). ✓
- `reverseEntry` signature (B2) matches controller call (D5) and client API (F1). ✓
- `closeFiscalYear` signature (B3) matches controller (D3). ✓
- `postExpense` input shape (B4) matches controller body parsing (D4) and client `expenseApi.create` body (F1). ✓
- `IncomeStatementResult`, `BalanceSheetResult`, `CashFlowResult` defined in `reports.service.ts` (C1–C3) mirror client types in `accounting-phase3.ts` (F1). ✓
- `MANUAL_REVERSAL` enum value referenced in service (B2), reversal controller (D5), client test fixtures (E5). ✓
