# Accounting Module — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire operational data (Bookings, Payments, deposit lifecycle) into the Phase 1 accounting ledger with configurable cash/accrual posting, tax-inclusive VAT, deposit auto-posting, payment reversal, backfill tool, and a VAT return report.

**Architecture:** All auto-posting goes through new high-level methods on the existing `PostingService`. Payment/Booking controllers call these methods inside the same `$transaction` as the operational write — atomic guarantee. New `AccountMapping` and `TaxCode` tables drive account selection. `AccountingMode` setting (CASH default / ACCRUAL) controls trigger semantics.

**Tech Stack:** Node 20, TypeScript 5, Express 4, Prisma 5, Postgres, Vitest + supertest (server tests), React 18 + Vite + React Query + react-i18next (client). Existing Phase 1 conventions apply.

**Spec:** `docs/superpowers/specs/2026-05-16-accounting-phase-2-design.md`

**Key existing endpoints we'll hook into (verified):**
- `POST /api/v1/payments` (create) → call `postFromPayment` if status becomes PAID
- `PATCH /api/v1/payments/:id` (markPaid) → call `postFromPayment` on PENDING→PAID
- `POST /api/v1/bookings` (create) → call `postFromBookingCreated` (ACCRUAL) and `postFromDepositTransition(NONE→HELD)` if depositAmount > 0
- `PATCH /api/v1/bookings/:id/deposit` (collectDeposit) → call `postFromDepositTransition(NONE→HELD)`
- `PATCH /api/v1/bookings/:id/checkout` (checkout) → call `postFromDepositTransition(HELD→RELEASED|FORFEITED)`

**Deposit checkout semantics (verified in existing code):**
- `RELEASED`: refund == full deposit. Posting: debit Deposit Liability, credit Cash for full amount.
- `FORFEITED`: any partial refund (incl. 0). Posting: debit Deposit Liability for full amount; credit Cash for refundAmount (omit line if 0); credit Forfeit Income for `depositAmount - refundAmount` (omit line if 0).

---

## File map

**Created (server):**
- `server/src/services/accounting/mapping.service.ts` + `.test.ts`
- `server/src/services/accounting/tax.ts` + `.test.ts` (pure tax-split helper)
- `server/src/services/accounting/vat-return.service.ts` + `.test.ts`
- `server/src/services/accounting/backfill.service.ts` + `.test.ts`
- `server/src/controllers/accounting-mapping.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-taxcodes.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-reversal.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-setup.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-backfill.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-vat-return.controller.ts` + `.test.ts`
- `server/prisma/migrations/<timestamp>_accounting_phase2/migration.sql`

**Modified (server):**
- `shared/index.ts` — add `AccountingMode`, new error codes, mapping-key constants
- `server/prisma/schema.prisma` — new tables, columns, enum additions
- `server/src/services/accounting/posting.service.ts` — 5 new methods
- `server/src/services/accounting/posting.errors.ts` — 3 new codes (already strings in union)
- `server/src/services/accounting/posting.service.test.ts` — extend with new method tests
- `server/src/services/accounting/starter-chart.ts` — add 2 new accounts
- `server/src/controllers/payments.controller.ts` — hook auto-posting on PAID
- `server/src/controllers/payments.controller.test.ts` — verify auto-posting + REVERSED exclusion
- `server/src/controllers/bookings.controller.ts` — hook auto-posting on create, deposit, checkout
- `server/src/controllers/bookings.controller.test.ts` — verify auto-posting
- `server/src/routes/accounting.routes.ts` — add new routes
- `server/src/app.ts` — no change (already mounts /accounting)

**Created (client):**
- `client/src/lib/api/accounting-phase2.ts` (new endpoints)
- `client/src/pages/accounting/AccountMappingPage.tsx`
- `client/src/pages/accounting/TaxCodesPanel.tsx`
- `client/src/pages/accounting/VatReturnPage.tsx`
- `client/src/pages/accounting/BackfillModal.tsx`
- `client/src/pages/accounting/ReversePaymentDialog.tsx`

**Modified (client):**
- `client/src/App.tsx` — register 2 new routes
- `client/src/components/layout/Sidebar.tsx` — add 2 new nav items
- `client/src/pages/settings/SettingsPage.tsx` — accountingMode radio + Setup/Backfill buttons
- `client/src/pages/bookings/BookingFormModal.tsx` — tax-code dropdown (or wherever booking form lives)
- `client/src/pages/payments/PaymentsPage.tsx` — Reverse button on POSTED rows
- `client/src/i18n/locales/en/translation.json`, `ar/translation.json`

**Modified (docs):**
- `Hotel_Apartment_BRD.md` → v2.2
- `docs/manual-test-plan.md` → new §20

---

## Conventions for all tasks

- Server controllers: `try { ... } catch (err) { next(err); }` — same as Phase 1.
- Server tests: real Postgres via `TEST_DATABASE_URL`; `signToken({ id, role, assignedBuildingId: null })` for cookies.
- API: routes mounted under `/api/v1/accounting`. Auth gating: ADMIN/SUPER_ADMIN/FINANCE on all; Backfill+Setup admin-only (ADMIN, SUPER_ADMIN).
- Money: `Decimal` end-to-end on server, stringified in JSON responses, parsed back as `Decimal` on the way in.
- All posting service calls accept an optional `tx: Prisma.TransactionClient` parameter.
- Commits: small, descriptive, prefix `feat:` / `test:` / `chore:` / `docs:`.
- Work on branch `feat/accounting-phase-2` (create at start; do NOT work on master).

---

# Section A — Shared types, schema, migration

### Task A1: Branch + shared types

**Files:**
- Modify: `D:\Hotel Apartment Management System\shared\index.ts`

- [ ] **Step 1: Create feature branch**

```
git checkout master
git pull --ff-only  # optional, only if remote configured
git checkout -b feat/accounting-phase-2
```

- [ ] **Step 2: Update `shared/index.ts`**

Extend `AccountingErrorCode` union (append new codes):

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
  | 'CANNOT_REVERSE';
```

Append at end of file:

```ts
export enum AccountingMode {
  CASH = 'CASH',
  ACCRUAL = 'ACCRUAL',
}

// Mapping key vocabulary (strings, not enum — additive without migrations)
export const MAPPING_KEYS = [
  'CASH_METHOD',
  'CARD_METHOD',
  'INSTALLMENT_METHOD',
  'AR_DEFAULT',
  'REVENUE_DEFAULT',
  'DEPOSIT_LIABILITY',
  'DEPOSIT_FORFEIT_INCOME',
  'VAT_PAYABLE',
] as const;
export type MappingKey = typeof MAPPING_KEYS[number];

// Add REVERSED to existing PaymentStatus enum:
//   PAID, PENDING, FAILED, REVERSED
```

Update the existing `PaymentStatus` enum to add `REVERSED`:

```ts
export enum PaymentStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}
```

- [ ] **Step 3: Commit**

```
git add shared/index.ts
git commit -m "feat(shared): add Phase 2 accounting enums (AccountingMode, MappingKey, REVERSED status)"
```

---

### Task A2: Prisma schema additions

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\prisma\schema.prisma`

- [ ] **Step 1: Append new enums** (after existing `enum BooksMode`)

```prisma
enum AccountingMode {
  CASH
  ACCRUAL
}
```

- [ ] **Step 2: Add `REVERSED` to existing `PaymentStatus`**

Find the existing block:
```prisma
enum PaymentStatus {
  PAID
  PENDING
  FAILED
}
```

Replace with:
```prisma
enum PaymentStatus {
  PAID
  PENDING
  FAILED
  REVERSED
}
```

- [ ] **Step 3: Append new models** (before existing `model SystemSettings`)

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

  account   Account       @relation("TaxCodeAccount", fields: [accountId], references: [id], onDelete: Restrict)
  lines     JournalLine[]
  bookings  Booking[]
  creator   User?         @relation("TaxCodeCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater   User?         @relation("TaxCodeUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 4: Modify `JournalLine`** — add `taxCodeId` field and index

Inside the existing `model JournalLine { ... }`, before the closing `}`, add:

```prisma
  taxCodeId      Int?
  taxCode        TaxCode? @relation(fields: [taxCodeId], references: [id], onDelete: SetNull)

  @@index([taxCodeId])
```

(Keep the existing `@@index([accountId])` and `@@index([journalEntryId])` lines.)

- [ ] **Step 5: Modify `SystemSettings`** — add `accountingMode`

Inside the existing `model SystemSettings { ... }`, add:

```prisma
  accountingMode AccountingMode @default(CASH)
```

- [ ] **Step 6: Modify `Payment`** — add `postedEntryId`

Inside the existing `model Payment { ... }`, add:

```prisma
  postedEntryId Int?
  postedEntry   JournalEntry? @relation("PaymentPostedEntry", fields: [postedEntryId], references: [id], onDelete: SetNull)

  @@index([postedEntryId])
```

Make sure the existing `@@index([bookingId, status])` and `@@index([createdAt])` stay.

- [ ] **Step 7: Modify `Booking`** — add three new columns

Inside the existing `model Booking { ... }`, add:

```prisma
  taxCodeId            Int?
  revenuePostedEntryId Int?
  depositPostedEntryId Int?

  taxCode             TaxCode?      @relation(fields: [taxCodeId], references: [id], onDelete: Restrict)
  revenuePostedEntry  JournalEntry? @relation("BookingRevenuePostedEntry", fields: [revenuePostedEntryId], references: [id], onDelete: SetNull)
  depositPostedEntry  JournalEntry? @relation("BookingDepositPostedEntry", fields: [depositPostedEntryId], references: [id], onDelete: SetNull)
```

- [ ] **Step 8: Modify `JournalEntry`** — add back-relations

Inside the existing `model JournalEntry { ... }`, add:

```prisma
  paymentPostedFor          Payment[]  @relation("PaymentPostedEntry")
  bookingRevenuePostedFor   Booking[]  @relation("BookingRevenuePostedEntry")
  bookingDepositPostedFor   Booking[]  @relation("BookingDepositPostedEntry")
```

- [ ] **Step 9: Modify `User`** — add back-relations

Inside the existing `model User { ... }`, in the back-relations section, add:

```prisma
  accountMappingsUpdated  AccountMapping[] @relation("AccountMappingUpdatedBy")
  createdTaxCodes         TaxCode[]        @relation("TaxCodeCreatedBy")
  updatedTaxCodes         TaxCode[]        @relation("TaxCodeUpdatedBy")
```

- [ ] **Step 10: Modify `Account`** — add back-relations

Inside the existing `model Account { ... }`, add:

```prisma
  mappings   AccountMapping[]
  taxCodes   TaxCode[]        @relation("TaxCodeAccount")
```

- [ ] **Step 11: Format and verify**

```
cd server
npx prisma format
```

Expected: no errors.

- [ ] **Step 12: Commit**

```
git add server/prisma/schema.prisma
git commit -m "feat(db): Phase 2 schema — AccountMapping, TaxCode, AccountingMode, REVERSED status, posting back-pointers"
```

---

### Task A3: Generate and apply migration

**Files:**
- Create: `server/prisma/migrations/<timestamp>_accounting_phase2/migration.sql`

- [ ] **Step 1: Generate scaffolded migration (do not apply)**

```
cd server
npx prisma migrate dev --name accounting_phase2 --create-only
```

Expected: new folder `prisma/migrations/<timestamp>_accounting_phase2/` with `migration.sql`. Review the file — it should include the new tables, the enum addition (`REVERSED`), and the new columns/indexes. No manual SQL appending needed for Phase 2.

- [ ] **Step 2: Apply migration to dev DB**

```
cd server
npx prisma migrate dev
```

Expected: migration applies cleanly; Prisma client regenerates.

- [ ] **Step 3: Apply migration to test DB**

```
cd server
DATABASE_URL="postgresql://hotel:hotel123@localhost:5433/hotel_test" npx prisma migrate deploy
```

Expected: "All migrations have been successfully applied."

- [ ] **Step 4: Sanity-check tables and enum**

```
docker exec hotelapartmentmanagementsystem-postgres-1 psql -U hotel -d hotel_dev -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('AccountMapping','TaxCode') ORDER BY table_name;"
docker exec hotelapartmentmanagementsystem-postgres-1 psql -U hotel -d hotel_dev -c "SELECT enum_range(NULL::\"PaymentStatus\");"
```

Expected: 2 rows returned; enum range includes `REVERSED`.

- [ ] **Step 5: Commit**

```
git add server/prisma/migrations
git commit -m "feat(db): migration for accounting Phase 2"
```

---

# Section B — Foundation services (tax helper + mapping)

### Task B1: Tax-split helper (TDD pair)

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\tax.ts`
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\tax.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tax.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { splitTaxInclusive } from './tax';

const D = (n: string) => new Prisma.Decimal(n);

describe('splitTaxInclusive', () => {
  it('splits 105 at 5% into net=100, vat=5 (canonical case)', () => {
    const r = splitTaxInclusive(D('105'), D('5'));
    expect(r.net.toFixed(2)).toBe('100.00');
    expect(r.vat.toFixed(2)).toBe('5.00');
  });

  it('splits 100 at 5% with HALF_EVEN rounding: vat=4.76, net=95.24', () => {
    const r = splitTaxInclusive(D('100'), D('5'));
    expect(r.net.toFixed(2)).toBe('95.24');
    expect(r.vat.toFixed(2)).toBe('4.76');
  });

  it('returns net=gross, vat=0 when rate is 0 — zero-rated and exempt cases', () => {
    const r = splitTaxInclusive(D('500'), D('0'));
    expect(r.net.toFixed(2)).toBe('500.00');
    expect(r.vat.toFixed(2)).toBe('0.00');
  });

  it('keeps the equation net + vat === gross exact to the cent', () => {
    for (const g of ['100', '105', '1234.56', '0.01', '999.99']) {
      const r = splitTaxInclusive(D(g), D('5'));
      expect(r.net.plus(r.vat).toFixed(2)).toBe(new Prisma.Decimal(g).toFixed(2));
    }
  });
});
```

- [ ] **Step 2: Run — expect import error**

```
cd server && npx vitest run src/services/accounting/tax.test.ts
```

Expected: cannot find module './tax'.

- [ ] **Step 3: Implement `tax.ts`**

```ts
import { Prisma } from '@prisma/client';

const ROUND_HALF_EVEN = Prisma.Decimal.ROUND_HALF_EVEN;

export function splitTaxInclusive(
  gross: Prisma.Decimal,
  ratePct: Prisma.Decimal,
): { net: Prisma.Decimal; vat: Prisma.Decimal } {
  if (ratePct.eq(0)) {
    return { net: gross, vat: new Prisma.Decimal(0) };
  }
  const vat = gross
    .times(ratePct)
    .div(ratePct.plus(100))
    .toDecimalPlaces(2, ROUND_HALF_EVEN);
  const net = gross.minus(vat);
  return { net, vat };
}
```

- [ ] **Step 4: Run — expect all tests pass**

```
cd server && npx vitest run src/services/accounting/tax.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/tax.ts server/src/services/accounting/tax.test.ts
git commit -m "feat(accounting): splitTaxInclusive helper with banker's rounding"
```

---

### Task B2: MappingService (TDD pair)

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\mapping.service.ts`
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\mapping.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MappingService } from './mapping.service';
import { AccountingError } from './posting.errors';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let cashId: number;

beforeAll(async () => {
  await db.accountMapping.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();

  const a = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  cashId = a.id;
});

afterAll(async () => {
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.$disconnect();
});

beforeEach(async () => {
  await db.accountMapping.deleteMany();
});

const svc = () => new MappingService(db as any);

describe('MappingService.resolveAccount()', () => {
  it('returns the mapped account id for a known key', async () => {
    await db.accountMapping.create({ data: { key: 'CASH_METHOD', accountId: cashId } });
    const id = await svc().resolveAccount(db as any, 'CASH_METHOD');
    expect(id).toBe(cashId);
  });

  it('throws MAPPING_MISSING when the key is not mapped', async () => {
    await expect(svc().resolveAccount(db as any, 'CASH_METHOD'))
      .rejects.toMatchObject({ code: 'MAPPING_MISSING' });
  });
});

describe('MappingService.setMapping()', () => {
  it('creates a new mapping when one does not exist', async () => {
    await svc().setMapping('CASH_METHOD', cashId, 42);
    const row = await db.accountMapping.findUnique({ where: { key: 'CASH_METHOD' } });
    expect(row?.accountId).toBe(cashId);
  });

  it('updates an existing mapping', async () => {
    await db.accountMapping.create({ data: { key: 'CASH_METHOD', accountId: cashId } });
    const other = await db.account.create({ data: { code: '1011', name: 'Other', type: 'ASSET' } });
    await svc().setMapping('CASH_METHOD', other.id, 42);
    const row = await db.accountMapping.findUnique({ where: { key: 'CASH_METHOD' } });
    expect(row?.accountId).toBe(other.id);
    await db.account.delete({ where: { id: other.id } });
  });
});

describe('MappingService.listAll()', () => {
  it('returns one row per known key, with accountId or null for unmapped', async () => {
    await db.accountMapping.create({ data: { key: 'CASH_METHOD', accountId: cashId } });
    const rows = await svc().listAll();
    expect(rows.find((r) => r.key === 'CASH_METHOD')?.accountId).toBe(cashId);
    expect(rows.find((r) => r.key === 'AR_DEFAULT')?.accountId).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect import error**

- [ ] **Step 3: Implement `mapping.service.ts`**

```ts
import { Prisma, PrismaClient } from '@prisma/client';
import { MAPPING_KEYS, MappingKey } from '@hotel/shared';
import { AccountingError } from './posting.errors';

export class MappingService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveAccount(tx: Prisma.TransactionClient | PrismaClient, key: MappingKey): Promise<number> {
    const m = await tx.accountMapping.findUnique({ where: { key } });
    if (!m) {
      throw new AccountingError('MAPPING_MISSING', `No account mapped to ${key}`, { key });
    }
    return m.accountId;
  }

  async setMapping(key: MappingKey, accountId: number, userId: number) {
    return this.prisma.accountMapping.upsert({
      where: { key },
      create: { key, accountId, updatedBy: userId },
      update: { accountId, updatedBy: userId },
    });
  }

  async listAll(): Promise<Array<{ key: string; accountId: number | null; account: { code: string; name: string } | null }>> {
    const existing = await this.prisma.accountMapping.findMany({
      include: { account: { select: { code: true, name: true } } },
    });
    const byKey = new Map(existing.map((m) => [m.key, m]));
    return MAPPING_KEYS.map((key) => {
      const m = byKey.get(key);
      return {
        key,
        accountId: m?.accountId ?? null,
        account: m ? { code: m.account.code, name: m.account.name } : null,
      };
    });
  }
}
```

- [ ] **Step 4: Run — expect all tests pass**

```
cd server && npx vitest run src/services/accounting/mapping.service.test.ts
```

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/mapping.service.ts server/src/services/accounting/mapping.service.test.ts
git commit -m "feat(accounting): MappingService — resolveAccount, setMapping, listAll"
```

---

### Task B3: Extend starter chart with VAT Payable + Forfeit Income

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\starter-chart.ts`

- [ ] **Step 1: Read the existing file** to confirm the `STARTER_ACCOUNTS` array shape.

- [ ] **Step 2: Add two entries to `STARTER_ACCOUNTS`**

Insert after the existing `4010 Other Income` line:

```ts
  { code: '2100', name: 'VAT Payable', type: 'LIABILITY' as const },
  { code: '4020', name: 'Forfeited Deposit Income', type: 'INCOME' as const },
```

The full array should now contain 16 entries (was 14).

- [ ] **Step 3: Commit**

```
git add server/src/services/accounting/starter-chart.ts
git commit -m "feat(accounting): add VAT Payable (2100) and Forfeit Income (4020) to starter chart"
```

---

# Section C — PostingService extensions

The existing `PostingService` already owns the low-level primitives (`createDraft`, `post`, `createAndPost`, `validate`, `prepareLinesForWrite`). Phase 2 adds **5 new public methods** plus a private mapping-resolution helper. All five accept an optional `tx` parameter (so they can run inside a caller's transaction) and use `createAndPost` internally to produce the JE.

### Task C1: postFromPayment (CASH mode)

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.test.ts`

- [ ] **Step 1: Add failing tests to `posting.service.test.ts`**

Append a new `describe` block (use the existing `beforeAll` fixtures; you'll need to add a SystemSettings row, Building (already in seed), Booking, Payment, AccountMapping rows for CASH_METHOD, REVENUE_DEFAULT, VAT_PAYABLE; TaxCode VAT_STANDARD 5%):

```ts
import { MappingService } from './mapping.service';

// Extend top-level state — add at top with the existing lets:
let vatAccountId: number;
let bldgId: number;
let bookingId: number;
let pendingPaymentId: number;
let paidPaymentId: number;
let taxCodeStandardId: number;

// Extend beforeAll (add inside the existing beforeAll, after creating cash/revenue/inactive accounts):
async function setUpPhase2Fixtures() {
  const vat = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  vatAccountId = vat.id;

  const bldg = await db.building.create({ data: { name: 'TST-Bldg', code: 'TST-P2', address: '' } });
  bldgId = bldg.id;

  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'VAT Standard', ratePct: 5, accountId: vatAccountId, isDefault: true },
  });
  taxCodeStandardId = tc.id;

  await db.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, accountingMode: 'CASH' },
    update: { accountingMode: 'CASH' },
  });

  await db.accountMapping.deleteMany();
  await db.accountMapping.createMany({
    data: [
      { key: 'CASH_METHOD', accountId: cashId },
      { key: 'CARD_METHOD', accountId: cashId },
      { key: 'INSTALLMENT_METHOD', accountId: cashId },
      { key: 'AR_DEFAULT', accountId: cashId }, // placeholder
      { key: 'REVENUE_DEFAULT', accountId: revenueId },
      { key: 'DEPOSIT_LIABILITY', accountId: vatAccountId }, // placeholder
      { key: 'DEPOSIT_FORFEIT_INCOME', accountId: revenueId }, // placeholder
      { key: 'VAT_PAYABLE', accountId: vatAccountId },
    ],
  });

  const apt = await db.apartment.findFirst() ?? await db.apartment.create({
    data: { number: 'P2-1', floor: 1, type: 'STUDIO', status: 'OCCUPIED', buildingId: bldgId },
  });
  const tenant = await db.tenant.findFirst() ?? await db.tenant.create({
    data: { fullName: 'P2 Tenant', phone: '+971500000099', idNumber: 'P2-TEST-001' },
  });
  const booking = await db.booking.create({
    data: {
      apartmentId: apt.id,
      tenantId: tenant.id,
      checkIn: new Date('2026-04-01'),
      checkOut: new Date('2026-07-01'),
      totalAmount: 10000,
      taxCodeId: taxCodeStandardId,
    },
  });
  bookingId = booking.id;

  const pending = await db.payment.create({
    data: { bookingId, method: 'INSTALLMENT', amount: 1050, status: 'PENDING' },
  });
  pendingPaymentId = pending.id;

  const paid = await db.payment.create({
    data: { bookingId, method: 'CASH', amount: 1050, status: 'PAID', paidAt: new Date() },
  });
  paidPaymentId = paid.id;
}
```

Call `await setUpPhase2Fixtures()` at the end of the existing `beforeAll`. Add cleanup of new tables (taxCode, accountMapping, building TST-P2, etc.) in `afterAll` BEFORE the existing account/user cleanup.

Then add the test cases:

```ts
describe('PostingService.postFromPayment (CASH mode)', () => {
  it('posts a 3-line JE with VAT split: debit Cash gross, credit Revenue net, credit VAT Payable tax', async () => {
    const svc = service();
    const entry = await svc.postFromPayment(paidPaymentId, 1);
    expect(entry).not.toBeNull();
    const lines = await db.journalLine.findMany({
      where: { journalEntryId: entry!.id },
      orderBy: { lineOrder: 'asc' },
    });
    expect(lines).toHaveLength(3);
    // Cash debit = 1050 (gross)
    expect(lines.find((l) => l.accountId === cashId)?.debit.toFixed(2)).toBe('1050.00');
    // Revenue credit = 1000 (net)
    expect(lines.find((l) => l.accountId === revenueId)?.credit.toFixed(2)).toBe('1000.00');
    // VAT Payable credit = 50
    expect(lines.find((l) => l.accountId === vatAccountId)?.credit.toFixed(2)).toBe('50.00');
  });

  it('sets payment.postedEntryId after successful post', async () => {
    const p = await db.payment.findUnique({ where: { id: paidPaymentId } });
    expect(p?.postedEntryId).not.toBeNull();
  });

  it('is idempotent — second call returns the existing entry without creating a new one', async () => {
    const before = await db.journalEntry.count();
    const result = await service().postFromPayment(paidPaymentId, 1);
    const after = await db.journalEntry.count();
    expect(after).toBe(before);
    expect(result?.id).toBe((await db.payment.findUnique({ where: { id: paidPaymentId } }))?.postedEntryId);
  });

  it('throws MAPPING_MISSING when REVENUE_DEFAULT is unmapped', async () => {
    // Create a fresh PAID payment
    const newPayment = await db.payment.create({
      data: { bookingId, method: 'CASH', amount: '100', status: 'PAID', paidAt: new Date() },
    });
    await db.accountMapping.delete({ where: { key: 'REVENUE_DEFAULT' } });
    await expect(service().postFromPayment(newPayment.id, 1))
      .rejects.toMatchObject({ code: 'MAPPING_MISSING', details: { key: 'REVENUE_DEFAULT' } });
    // Restore mapping for downstream tests
    await db.accountMapping.create({ data: { key: 'REVENUE_DEFAULT', accountId: revenueId } });
    await db.payment.delete({ where: { id: newPayment.id } });
  });

  it('posts a 2-line JE (no VAT line) when rate is 0 (VAT_ZERO booking)', async () => {
    const tcZero = await db.taxCode.create({
      data: { code: 'VAT_ZERO', name: 'Zero', ratePct: 0, accountId: vatAccountId, isDefault: false },
    });
    const b = await db.booking.create({
      data: {
        apartmentId: (await db.apartment.findFirst())!.id,
        tenantId: (await db.tenant.findFirst())!.id,
        checkIn: new Date('2026-04-01'),
        checkOut: new Date('2026-07-01'),
        totalAmount: 500,
        taxCodeId: tcZero.id,
      },
    });
    const p = await db.payment.create({
      data: { bookingId: b.id, method: 'CASH', amount: '500', status: 'PAID', paidAt: new Date() },
    });
    const entry = await service().postFromPayment(p.id, 1);
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id } });
    expect(lines).toHaveLength(2);
    // Cleanup
    await db.journalLine.deleteMany({ where: { journalEntryId: entry!.id } });
    await db.journalEntry.delete({ where: { id: entry!.id } });
    await db.payment.delete({ where: { id: p.id } });
    await db.booking.delete({ where: { id: b.id } });
    await db.taxCode.delete({ where: { id: tcZero.id } });
  });
});
```

- [ ] **Step 2: Run — expect failure (postFromPayment doesn't exist)**

```
cd server && npx vitest run src/services/accounting/posting.service.test.ts
```

Expected: tests fail because `postFromPayment` is not defined on `PostingService`.

- [ ] **Step 3: Implement `postFromPayment` (CASH branch only)**

In `posting.service.ts`, add imports at the top:

```ts
import { splitTaxInclusive } from './tax';
import { MappingService } from './mapping.service';
```

Add a private MappingService instance and a helper to load the system mode:

```ts
private mapping = new MappingService(this.prisma);

private async getAccountingMode(tx: Prisma.TransactionClient | PrismaClient): Promise<'CASH' | 'ACCRUAL'> {
  const s = await tx.systemSettings.findUnique({ where: { id: 1 } });
  return (s?.accountingMode ?? 'CASH') as 'CASH' | 'ACCRUAL';
}

private async getEffectiveTaxCode(tx: Prisma.TransactionClient | PrismaClient, taxCodeId: number | null) {
  if (taxCodeId !== null) {
    const tc = await tx.taxCode.findUnique({ where: { id: taxCodeId } });
    if (tc) return tc;
  }
  return tx.taxCode.findFirst({ where: { isDefault: true, isActive: true } });
}
```

Then add the public method:

```ts
async postFromPayment(paymentId: number, userId: number, tx?: Prisma.TransactionClient): Promise<JournalEntry | null> {
  const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry | null> => {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });
    if (!payment) throw new AccountingError('INVALID_LINE', `Payment ${paymentId} not found`);
    if (payment.postedEntryId) {
      // idempotency: return existing entry
      return db.journalEntry.findUnique({ where: { id: payment.postedEntryId } });
    }
    if (payment.status !== 'PAID') {
      // Non-PAID payments don't post (callers normally guard, but be defensive)
      return null;
    }

    const mode = await this.getAccountingMode(db);
    const methodKey =
      payment.method === 'CASH' ? 'CASH_METHOD' :
      payment.method === 'CARD' ? 'CARD_METHOD' :
      'INSTALLMENT_METHOD';
    const methodAccountId = await this.mapping.resolveAccount(db, methodKey);
    const gross = new Prisma.Decimal(payment.amount);

    let lines: LineInput[];
    let memo: string;

    if (mode === 'ACCRUAL') {
      const arId = await this.mapping.resolveAccount(db, 'AR_DEFAULT');
      lines = [
        { accountId: methodAccountId, debit: gross },
        { accountId: arId, credit: gross },
      ];
      memo = `Cash collection: Payment #${payment.id}`;
    } else {
      // CASH mode
      const revenueId = await this.mapping.resolveAccount(db, 'REVENUE_DEFAULT');
      const taxCode = await this.getEffectiveTaxCode(db, payment.booking.taxCodeId);
      const rate = taxCode ? new Prisma.Decimal(taxCode.ratePct) : new Prisma.Decimal(0);
      const { net, vat } = splitTaxInclusive(gross, rate);

      lines = [{ accountId: methodAccountId, debit: gross }];
      lines.push({
        accountId: revenueId,
        credit: net,
        ...(taxCode ? { /* tax tag on revenue line */ } : {}),
      });
      // Add a tax tag to the revenue line via raw line data after createAndPost — see note below.
      if (vat.gt(0) && taxCode) {
        const vatAccountId = await this.mapping.resolveAccount(db, 'VAT_PAYABLE');
        lines.push({ accountId: vatAccountId, credit: vat });
      }
      memo = `Payment #${payment.id} (${payment.method})`;
    }

    const entry = await this.createAndPost(
      {
        date: payment.paidAt ?? new Date(),
        memo,
        buildingId: null, // resolved at read time from booking.apartment.buildingId in future iteration
        source: 'PAYMENT_AUTO',
        sourceRefId: payment.id,
        lines,
      },
      userId,
      db, // pass the transaction client through
    );

    // Tag revenue line with taxCodeId (only relevant in CASH mode)
    if (mode === 'CASH') {
      const taxCode = await this.getEffectiveTaxCode(db, payment.booking.taxCodeId);
      if (taxCode) {
        await db.journalLine.updateMany({
          where: { journalEntryId: entry.id, accountId: { not: methodAccountId } },
          data: { taxCodeId: taxCode.id },
        });
      }
    }

    await db.payment.update({
      where: { id: paymentId },
      data: { postedEntryId: entry.id },
    });

    return entry;
  };

  if (tx) return runner(tx);
  return this.prisma.$transaction(runner);
}
```

**Note**: `createAndPost` currently doesn't accept a transaction client. You also need to extend `createDraft`, `post`, and `createAndPost` to accept an optional `tx` parameter so that the posting and the operational write share a single transaction.

Extend the existing signatures:

```ts
async createDraft(input: EntryInput, userId: number, tx?: Prisma.TransactionClient): Promise<JournalEntry> {
  const preparedLines = this.prepareLinesForWrite(input.lines);
  const runner = async (db: Prisma.TransactionClient) => {
    const entry = await db.journalEntry.create({ /* ...as before, using db instead of tx... */ });
    if (preparedLines.length > 0) {
      await db.journalLine.createMany({ data: preparedLines.map((l) => ({ ...l, journalEntryId: entry.id })) });
    }
    return entry;
  };
  if (tx) return runner(tx);
  return this.prisma.$transaction(runner);
}
```

Apply the same pattern to `updateDraft`, `deleteDraft`, `post`, `createAndPost`. Internal callers always pass `tx` through.

- [ ] **Step 4: Run — expect tests pass**

```
cd server && npx vitest run src/services/accounting/posting.service.test.ts
```

Expected: all existing 10 tests still pass + 5 new tests pass.

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/posting.service.ts server/src/services/accounting/posting.service.test.ts
git commit -m "feat(accounting): postFromPayment with CASH/ACCRUAL split + transaction passthrough"
```

---

### Task C2: postFromBookingCreated (ACCRUAL only)

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe('PostingService.postFromBookingCreated (ACCRUAL mode)', () => {
  beforeEach(async () => {
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'ACCRUAL' } });
  });
  afterAll(async () => {
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'CASH' } });
  });

  it('posts AR + Revenue + VAT for a new booking with standard tax', async () => {
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-06-01'),
        checkOut: new Date('2026-09-01'),
        totalAmount: 10500,
        taxCodeId: taxCodeStandardId,
      },
    });
    const entry = await service().postFromBookingCreated(b.id, 1);
    expect(entry).not.toBeNull();
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id } });
    expect(lines).toHaveLength(3);
    // AR debit = 10500 gross
    const arLine = lines.find((l) => l.debit.gt(0));
    expect(arLine?.debit.toFixed(2)).toBe('10500.00');
    // Revenue + VAT = 10500
    const credits = lines.filter((l) => l.credit.gt(0));
    const sum = credits.reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0));
    expect(sum.toFixed(2)).toBe('10500.00');
    // Cleanup
    await db.payment.deleteMany({ where: { bookingId: b.id } });
    await db.booking.update({ where: { id: b.id }, data: { revenuePostedEntryId: null } });
    await db.journalLine.deleteMany({ where: { journalEntryId: entry!.id } });
    await db.journalEntry.delete({ where: { id: entry!.id } });
    await db.booking.delete({ where: { id: b.id } });
  });

  it('is a no-op in CASH mode', async () => {
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'CASH' } });
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-08-01'),
        checkOut: new Date('2026-11-01'),
        totalAmount: 1000,
        taxCodeId: taxCodeStandardId,
      },
    });
    const result = await service().postFromBookingCreated(b.id, 1);
    expect(result).toBeNull();
    expect((await db.booking.findUnique({ where: { id: b.id } }))?.revenuePostedEntryId).toBeNull();
    await db.booking.delete({ where: { id: b.id } });
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'ACCRUAL' } });
  });

  it('is idempotent — does not create a second JE on repeat call', async () => {
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-10-01'),
        checkOut: new Date('2026-12-01'),
        totalAmount: 500,
        taxCodeId: taxCodeStandardId,
      },
    });
    await service().postFromBookingCreated(b.id, 1);
    const before = await db.journalEntry.count();
    await service().postFromBookingCreated(b.id, 1);
    const after = await db.journalEntry.count();
    expect(after).toBe(before);
    await db.booking.delete({ where: { id: b.id } });
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

```ts
async postFromBookingCreated(bookingId: number, userId: number, tx?: Prisma.TransactionClient): Promise<JournalEntry | null> {
  const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry | null> => {
    const mode = await this.getAccountingMode(db);
    if (mode !== 'ACCRUAL') return null;

    const booking = await db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new AccountingError('INVALID_LINE', `Booking ${bookingId} not found`);
    if (booking.revenuePostedEntryId) {
      return db.journalEntry.findUnique({ where: { id: booking.revenuePostedEntryId } });
    }

    const arId = await this.mapping.resolveAccount(db, 'AR_DEFAULT');
    const revenueId = await this.mapping.resolveAccount(db, 'REVENUE_DEFAULT');
    const gross = new Prisma.Decimal(booking.totalAmount);
    const taxCode = await this.getEffectiveTaxCode(db, booking.taxCodeId);
    const rate = taxCode ? new Prisma.Decimal(taxCode.ratePct) : new Prisma.Decimal(0);
    const { net, vat } = splitTaxInclusive(gross, rate);

    const lines: LineInput[] = [
      { accountId: arId, debit: gross },
      { accountId: revenueId, credit: net },
    ];
    if (vat.gt(0) && taxCode) {
      const vatAccountId = await this.mapping.resolveAccount(db, 'VAT_PAYABLE');
      lines.push({ accountId: vatAccountId, credit: vat });
    }

    const entry = await this.createAndPost(
      {
        date: booking.createdAt,
        memo: `Booking #${booking.id} revenue (accrual)`,
        buildingId: null,
        source: 'PAYMENT_AUTO',
        sourceRefId: booking.id,
        lines,
      },
      userId,
      db,
    );

    if (taxCode) {
      await db.journalLine.updateMany({
        where: { journalEntryId: entry.id, accountId: { not: arId } },
        data: { taxCodeId: taxCode.id },
      });
    }
    await db.booking.update({ where: { id: booking.id }, data: { revenuePostedEntryId: entry.id } });
    return entry;
  };

  if (tx) return runner(tx);
  return this.prisma.$transaction(runner);
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/posting.service.ts server/src/services/accounting/posting.service.test.ts
git commit -m "feat(accounting): postFromBookingCreated (ACCRUAL revenue + AR)"
```

---

### Task C3: postFromDepositTransition

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.test.ts`

- [ ] **Step 1: Add failing tests**

Replace placeholder DEPOSIT_LIABILITY and DEPOSIT_FORFEIT_INCOME mappings with real accounts in `setUpPhase2Fixtures` — first create dedicated accounts:

```ts
// Inside setUpPhase2Fixtures, add:
const depositLiability = await db.account.create({ data: { code: '2050', name: 'Security Deposits Held', type: 'LIABILITY' } });
const forfeitIncome = await db.account.create({ data: { code: '4020', name: 'Forfeited Deposit Income', type: 'INCOME' } });

// Update the createMany to point those keys at the right accounts:
//   { key: 'DEPOSIT_LIABILITY', accountId: depositLiability.id },
//   { key: 'DEPOSIT_FORFEIT_INCOME', accountId: forfeitIncome.id },

// Store ids for tests to use:
depositLiabilityId = depositLiability.id;
forfeitIncomeId = forfeitIncome.id;
```

Add tests:

```ts
describe('PostingService.postFromDepositTransition', () => {
  let depBookingId: number;

  beforeAll(async () => {
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-01-01'),
        checkOut: new Date('2026-02-01'),
        totalAmount: 5000,
        depositAmount: 1000,
        depositStatus: 'HELD',
        depositCollectedAt: new Date(),
      },
    });
    depBookingId = b.id;
  });

  it('NONE → HELD: debit Cash, credit Deposit Liability for depositAmount', async () => {
    const entry = await service().postFromDepositTransition(depBookingId, 'NONE', 'HELD', 1);
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id }, orderBy: { lineOrder: 'asc' } });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.accountId === cashId)?.debit.toFixed(2)).toBe('1000.00');
    expect(lines.find((l) => l.accountId === depositLiabilityId)?.credit.toFixed(2)).toBe('1000.00');
  });

  it('HELD → RELEASED (full refund): debit Liability, credit Cash for full amount', async () => {
    await db.booking.update({
      where: { id: depBookingId },
      data: { depositStatus: 'RELEASED', depositRefundAmount: 1000, depositPostedEntryId: null },
    });
    const entry = await service().postFromDepositTransition(depBookingId, 'HELD', 'RELEASED', 1);
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id } });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.accountId === depositLiabilityId)?.debit.toFixed(2)).toBe('1000.00');
    expect(lines.find((l) => l.accountId === cashId)?.credit.toFixed(2)).toBe('1000.00');
  });

  it('HELD → FORFEITED (zero refund): debit Liability, credit Forfeit Income for full amount', async () => {
    await db.booking.update({
      where: { id: depBookingId },
      data: { depositStatus: 'FORFEITED', depositRefundAmount: 0, depositPostedEntryId: null },
    });
    const entry = await service().postFromDepositTransition(depBookingId, 'HELD', 'FORFEITED', 1);
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id } });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.accountId === depositLiabilityId)?.debit.toFixed(2)).toBe('1000.00');
    expect(lines.find((l) => l.accountId === forfeitIncomeId)?.credit.toFixed(2)).toBe('1000.00');
  });

  it('HELD → FORFEITED (partial refund): splits Cash and Forfeit Income credit', async () => {
    await db.booking.update({
      where: { id: depBookingId },
      data: { depositStatus: 'FORFEITED', depositRefundAmount: 400, depositPostedEntryId: null },
    });
    const entry = await service().postFromDepositTransition(depBookingId, 'HELD', 'FORFEITED', 1);
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id } });
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.accountId === depositLiabilityId)?.debit.toFixed(2)).toBe('1000.00');
    expect(lines.find((l) => l.accountId === cashId)?.credit.toFixed(2)).toBe('400.00');
    expect(lines.find((l) => l.accountId === forfeitIncomeId)?.credit.toFixed(2)).toBe('600.00');
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

```ts
async postFromDepositTransition(
  bookingId: number,
  fromStatus: 'NONE' | 'HELD' | 'RELEASED' | 'FORFEITED',
  toStatus: 'NONE' | 'HELD' | 'RELEASED' | 'FORFEITED',
  userId: number,
  tx?: Prisma.TransactionClient,
): Promise<JournalEntry | null> {
  const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry | null> => {
    const booking = await db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new AccountingError('INVALID_LINE', `Booking ${bookingId} not found`);

    const cashKey = 'CASH_METHOD';
    const cashId = await this.mapping.resolveAccount(db, cashKey);
    const liabilityId = await this.mapping.resolveAccount(db, 'DEPOSIT_LIABILITY');
    const forfeitId = await this.mapping.resolveAccount(db, 'DEPOSIT_FORFEIT_INCOME');

    let lines: LineInput[];
    let memo: string;
    const depAmt = new Prisma.Decimal(booking.depositAmount ?? 0);

    if (fromStatus === 'NONE' && toStatus === 'HELD') {
      lines = [
        { accountId: cashId, debit: depAmt },
        { accountId: liabilityId, credit: depAmt },
      ];
      memo = `Deposit collected for Booking #${booking.id}`;
    } else if (fromStatus === 'HELD' && toStatus === 'RELEASED') {
      lines = [
        { accountId: liabilityId, debit: depAmt },
        { accountId: cashId, credit: depAmt },
      ];
      memo = `Deposit released for Booking #${booking.id}`;
    } else if (fromStatus === 'HELD' && toStatus === 'FORFEITED') {
      const refundAmt = new Prisma.Decimal(booking.depositRefundAmount ?? 0);
      const forfeitAmt = depAmt.minus(refundAmt);
      lines = [{ accountId: liabilityId, debit: depAmt }];
      if (refundAmt.gt(0)) lines.push({ accountId: cashId, credit: refundAmt });
      if (forfeitAmt.gt(0)) lines.push({ accountId: forfeitId, credit: forfeitAmt });
      memo = `Deposit forfeited for Booking #${booking.id}`;
    } else {
      return null;
    }

    const entry = await this.createAndPost(
      {
        date: new Date(),
        memo,
        buildingId: null,
        source: 'PAYMENT_AUTO',
        sourceRefId: booking.id,
        lines,
      },
      userId,
      db,
    );

    await db.booking.update({
      where: { id: booking.id },
      data: { depositPostedEntryId: entry.id },
    });

    return entry;
  };

  if (tx) return runner(tx);
  return this.prisma.$transaction(runner);
}
```

- [ ] **Step 4: Run — expect 4/4 deposit tests pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/posting.service.ts server/src/services/accounting/posting.service.test.ts
git commit -m "feat(accounting): postFromDepositTransition (collect, release, forfeit, partial)"
```

---

### Task C4: reversePayment

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\posting.service.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe('PostingService.reversePayment', () => {
  it('posts a balancing JE with debits and credits swapped, marks Payment REVERSED', async () => {
    // Use the existing paidPaymentId which already has postedEntryId
    const result = await service().reversePayment(paidPaymentId, 1);
    expect(result).not.toBeNull();
    const reversingLines = await db.journalLine.findMany({
      where: { journalEntryId: result!.id },
      orderBy: { lineOrder: 'asc' },
    });
    expect(reversingLines).toHaveLength(3);
    // Cash now credited (was debited), revenue+VAT now debited
    expect(reversingLines.find((l) => l.accountId === cashId)?.credit.toFixed(2)).toBe('1050.00');
    expect(reversingLines.find((l) => l.accountId === revenueId)?.debit.toFixed(2)).toBe('1000.00');
    expect(reversingLines.find((l) => l.accountId === vatAccountId)?.debit.toFixed(2)).toBe('50.00');

    const p = await db.payment.findUnique({ where: { id: paidPaymentId } });
    expect(p?.status).toBe('REVERSED');
  });

  it('throws ALREADY_REVERSED on a second attempt', async () => {
    await expect(service().reversePayment(paidPaymentId, 1))
      .rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
  });

  it('throws CANNOT_REVERSE on a PENDING payment', async () => {
    await expect(service().reversePayment(pendingPaymentId, 1))
      .rejects.toMatchObject({ code: 'CANNOT_REVERSE' });
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

```ts
async reversePayment(paymentId: number, userId: number, tx?: Prisma.TransactionClient): Promise<JournalEntry | null> {
  const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry> => {
    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AccountingError('INVALID_LINE', `Payment ${paymentId} not found`);
    if (payment.status === 'REVERSED') {
      throw new AccountingError('ALREADY_REVERSED', 'Payment is already reversed');
    }
    if (payment.status !== 'PAID' || !payment.postedEntryId) {
      throw new AccountingError('CANNOT_REVERSE', 'Only PAID payments with a posted entry can be reversed', {
        status: payment.status,
        hasPostedEntry: !!payment.postedEntryId,
      });
    }

    const original = await db.journalEntry.findUnique({
      where: { id: payment.postedEntryId },
      include: { lines: true },
    });
    if (!original) throw new AccountingError('INVALID_LINE', 'Original entry missing');

    const reversingLines: LineInput[] = original.lines.map((l) => ({
      accountId: l.accountId,
      buildingId: l.buildingId,
      debit: l.credit, // swap
      credit: l.debit, // swap
      description: l.description ?? undefined,
    }));

    const entry = await this.createAndPost(
      {
        date: new Date(),
        memo: `Reversal of ${original.entryNumber}`,
        buildingId: original.buildingId,
        source: 'PAYMENT_AUTO',
        sourceRefId: payment.id,
        lines: reversingLines,
      },
      userId,
      db,
    );

    await db.payment.update({
      where: { id: paymentId },
      data: { status: 'REVERSED' },
    });

    return entry;
  };

  if (tx) return runner(tx);
  return this.prisma.$transaction(runner);
}
```

- [ ] **Step 4: Run — expect 3/3 reversal tests pass + all prior tests still pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/posting.service.ts server/src/services/accounting/posting.service.test.ts
git commit -m "feat(accounting): reversePayment with swapped-line balancing JE and REVERSED status"
```

---

# Section D — Setup, Backfill, VAT Return services

### Task D1: Setup service + controller + tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-setup.controller.ts`
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-setup.controller.test.ts`

- [ ] **Step 1: Create the controller**

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { seedStarterChart } from '../services/accounting/starter-chart';
import { MAPPING_KEYS, MappingKey } from '@hotel/shared';

const DEFAULT_TAX_CODES = [
  { code: 'VAT_STANDARD', name: 'VAT Standard', ratePct: 5, isDefault: true, isExempt: false },
  { code: 'VAT_ZERO', name: 'VAT Zero-rated', ratePct: 0, isDefault: false, isExempt: false },
  { code: 'VAT_EXEMPT', name: 'VAT Exempt', ratePct: 0, isDefault: false, isExempt: true },
];

const DEFAULT_MAPPINGS: { key: MappingKey; code: string }[] = [
  { key: 'CASH_METHOD', code: '1010' },
  { key: 'CARD_METHOD', code: '1020' },
  { key: 'INSTALLMENT_METHOD', code: '1020' },
  { key: 'AR_DEFAULT', code: '1100' },
  { key: 'REVENUE_DEFAULT', code: '4000' },
  { key: 'DEPOSIT_LIABILITY', code: '2050' },
  { key: 'DEPOSIT_FORFEIT_INCOME', code: '4020' },
  { key: 'VAT_PAYABLE', code: '2100' },
];

export async function setup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    // 1. Seed starter chart (idempotent)
    const createdAccounts = await seedStarterChart(prisma as any, userId);

    // 2. Seed tax codes (idempotent by code)
    const vatPayable = await prisma.account.findUnique({ where: { code: '2100' } });
    if (!vatPayable) {
      res.status(400).json({ message: 'VAT Payable account (code 2100) missing. Add it manually.' });
      return;
    }
    let createdTaxCodes = 0;
    for (const tc of DEFAULT_TAX_CODES) {
      const existing = await prisma.taxCode.findUnique({ where: { code: tc.code } });
      if (existing) continue;
      await prisma.taxCode.create({
        data: { ...tc, accountId: vatPayable.id, createdBy: userId, updatedBy: userId },
      });
      createdTaxCodes++;
    }

    // 3. Seed mappings (idempotent by key)
    let createdMappings = 0;
    const unmappedKeys: MappingKey[] = [];
    for (const { key, code } of DEFAULT_MAPPINGS) {
      const existing = await prisma.accountMapping.findUnique({ where: { key } });
      if (existing) continue;
      const acc = await prisma.account.findUnique({ where: { code } });
      if (!acc) {
        unmappedKeys.push(key);
        continue;
      }
      await prisma.accountMapping.create({ data: { key, accountId: acc.id, updatedBy: userId } });
      createdMappings++;
    }

    res.json({ createdAccounts, createdTaxCodes, createdMappings, unmappedKeys });
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: Create the test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string;
let financeCookie: string;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.accountMapping.deleteMany();
  await db.taxCode.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['setup-admin@test.local', 'setup-fin@test.local'] } } });

  const admin = await db.user.create({ data: { name: 'A', email: 'setup-admin@test.local', password: 'x', role: 'ADMIN' } });
  const fin = await db.user.create({ data: { name: 'F', email: 'setup-fin@test.local', password: 'x', role: 'FINANCE' } });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: fin.id, role: 'FINANCE', assignedBuildingId: null })}`;
});

afterAll(async () => {
  await db.accountMapping.deleteMany();
  await db.taxCode.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['setup-admin@test.local', 'setup-fin@test.local'] } } });
  await db.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await db.accountMapping.deleteMany();
  await db.taxCode.deleteMany();
  await db.account.deleteMany();
});

describe('POST /accounting/setup', () => {
  it('seeds accounts, tax codes, and mappings from a clean state', async () => {
    const r = await request(app).post('/api/v1/accounting/setup').set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.createdAccounts).toBeGreaterThan(0);
    expect(r.body.createdTaxCodes).toBe(3);
    expect(r.body.createdMappings).toBe(8);
    expect(r.body.unmappedKeys).toEqual([]);
  });

  it('is idempotent — second call creates nothing', async () => {
    await request(app).post('/api/v1/accounting/setup').set('Cookie', adminCookie);
    const r = await request(app).post('/api/v1/accounting/setup').set('Cookie', adminCookie);
    expect(r.body.createdAccounts).toBe(0);
    expect(r.body.createdTaxCodes).toBe(0);
    expect(r.body.createdMappings).toBe(0);
  });

  it('returns unmappedKeys when a default account is missing', async () => {
    await request(app).post('/api/v1/accounting/setup').set('Cookie', adminCookie);
    // Delete one mapping + the underlying account
    await db.accountMapping.delete({ where: { key: 'VAT_PAYABLE' } });
    // Can't delete VAT Payable account because TaxCode references it; instead change its code
    await db.account.update({ where: { code: '2100' }, data: { code: '2199' } });

    const r = await request(app).post('/api/v1/accounting/setup').set('Cookie', adminCookie);
    expect(r.body.unmappedKeys).toContain('VAT_PAYABLE');
  });

  it('403 for FINANCE — admin-only operation', async () => {
    const r = await request(app).post('/api/v1/accounting/setup').set('Cookie', financeCookie);
    expect(r.status).toBe(403);
  });
});
```

- [ ] **Step 3: Commit (route wiring comes in Section E)**

```
git add server/src/controllers/accounting-setup.controller.ts server/src/controllers/accounting-setup.controller.test.ts
git commit -m "feat(accounting): setup endpoint — seed chart, tax codes, mappings (admin-only, idempotent)"
```

---

### Task D2: VAT return service + tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\vat-return.service.ts`
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\vat-return.service.test.ts`

- [ ] **Step 1: Create the service**

```ts
import { PrismaClient, Prisma } from '@prisma/client';

export type VatReturnRow = {
  taxCodeId: number;
  code: string;
  name: string;
  ratePct: string;
  isExempt: boolean;
  output: { net: string; vat: string };
  input:  { net: string; vat: string };
};

export type VatReturnResult = {
  from: string;
  to:   string;
  rows: VatReturnRow[];
  outputVatTotal: string;
  inputVatTotal:  string;
  netVatDue:      string;
};

const toFixed2 = (d: Prisma.Decimal) => d.toFixed(2);

export class VatReturnService {
  constructor(private readonly prisma: PrismaClient) {}

  async vatReturn(from: Date, to: Date): Promise<VatReturnResult> {
    const taxCodes = await this.prisma.taxCode.findMany({ orderBy: { code: 'asc' } });
    const rows: VatReturnRow[] = [];

    let outputVatTotal = new Prisma.Decimal(0);
    let inputVatTotal = new Prisma.Decimal(0);

    for (const tc of taxCodes) {
      // Find revenue/expense lines tagged with this taxCodeId in range, posted entries only
      const taggedLines = await this.prisma.journalLine.findMany({
        where: {
          taxCodeId: tc.id,
          journalEntry: { status: 'POSTED', date: { gte: from, lte: to } },
        },
        include: {
          account: true,
          journalEntry: { include: { lines: true } },
        },
      });

      let outputNet = new Prisma.Decimal(0);
      let outputVat = new Prisma.Decimal(0);
      let inputNet  = new Prisma.Decimal(0);
      let inputVat  = new Prisma.Decimal(0);

      for (const line of taggedLines) {
        // The line itself is the net (revenue or expense)
        const isOutput = line.account.type === 'INCOME';
        const isInput  = line.account.type === 'EXPENSE';

        const netAmt = isOutput ? new Prisma.Decimal(line.credit) : new Prisma.Decimal(line.debit);

        // Find the paired VAT line within the same entry: same entry, touches the tax code's VAT Payable account
        const vatLine = line.journalEntry.lines.find(
          (l) => l.id !== line.id && l.accountId === tc.accountId,
        );
        const vatAmt = vatLine
          ? (isOutput ? new Prisma.Decimal(vatLine.credit) : new Prisma.Decimal(vatLine.debit))
          : new Prisma.Decimal(0);

        if (isOutput) { outputNet = outputNet.plus(netAmt); outputVat = outputVat.plus(vatAmt); }
        else if (isInput) { inputNet = inputNet.plus(netAmt); inputVat = inputVat.plus(vatAmt); }
      }

      outputVatTotal = outputVatTotal.plus(outputVat);
      inputVatTotal = inputVatTotal.plus(inputVat);

      rows.push({
        taxCodeId: tc.id,
        code: tc.code,
        name: tc.name,
        ratePct: tc.ratePct.toFixed(2),
        isExempt: tc.isExempt,
        output: { net: toFixed2(outputNet), vat: toFixed2(outputVat) },
        input:  { net: toFixed2(inputNet),  vat: toFixed2(inputVat) },
      });
    }

    return {
      from: from.toISOString(),
      to:   to.toISOString(),
      rows,
      outputVatTotal: toFixed2(outputVatTotal),
      inputVatTotal:  toFixed2(inputVatTotal),
      netVatDue:      toFixed2(outputVatTotal.minus(inputVatTotal)),
    };
  }
}
```

- [ ] **Step 2: Create the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PostingService } from './posting.service';
import { VatReturnService } from './vat-return.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);
const vatSvc = new VatReturnService(db as any);

let cashId: number;
let revenueId: number;
let vatPayableId: number;
let tcStandardId: number;
let bookingId: number;
let userId: number;

beforeAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'VR-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'VR-1' } });
  await db.building.deleteMany({ where: { code: 'VR-B' } });
  await db.user.deleteMany({ where: { email: 'vr@test.local' } });

  const u = await db.user.create({ data: { name: 'V', email: 'vr@test.local', password: 'x', role: 'ADMIN' } });
  userId = u.id;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const revenue = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  const vatp = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  cashId = cash.id; revenueId = revenue.id; vatPayableId = vatp.id;

  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'Standard', ratePct: 5, accountId: vatp.id, isDefault: true },
  });
  tcStandardId = tc.id;

  await db.accountMapping.createMany({
    data: [
      { key: 'CASH_METHOD', accountId: cashId },
      { key: 'CARD_METHOD', accountId: cashId },
      { key: 'INSTALLMENT_METHOD', accountId: cashId },
      { key: 'AR_DEFAULT', accountId: cashId },
      { key: 'REVENUE_DEFAULT', accountId: revenueId },
      { key: 'DEPOSIT_LIABILITY', accountId: vatPayableId },
      { key: 'DEPOSIT_FORFEIT_INCOME', accountId: revenueId },
      { key: 'VAT_PAYABLE', accountId: vatPayableId },
    ],
  });

  await db.systemSettings.upsert({
    where: { id: 1 }, create: { id: 1, accountingMode: 'CASH' }, update: { accountingMode: 'CASH' },
  });

  const bldg = await db.building.create({ data: { name: 'B', code: 'VR-B', address: '' } });
  const apt = await db.apartment.create({ data: { number: 'VR-1', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldg.id } });
  const ten = await db.tenant.create({ data: { fullName: 'T', phone: '+9711', idNumber: 'VR-TEST-001' } });
  const b = await db.booking.create({
    data: {
      apartmentId: apt.id, tenantId: ten.id,
      checkIn: new Date('2026-04-01'), checkOut: new Date('2026-07-01'),
      totalAmount: 1000, taxCodeId: tcStandardId,
    },
  });
  bookingId = b.id;

  // Post 3 paid payments in May, totaling 3150 gross
  for (const amt of ['1050', '1050', '1050']) {
    const p = await db.payment.create({
      data: { bookingId, method: 'CASH', amount: amt, status: 'PAID', paidAt: new Date('2026-05-15') },
    });
    await posting.postFromPayment(p.id, userId);
  }
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'VR-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'VR-1' } });
  await db.building.deleteMany({ where: { code: 'VR-B' } });
  await db.user.deleteMany({ where: { email: 'vr@test.local' } });
  await db.$disconnect();
});

describe('VatReturnService', () => {
  it('groups output VAT by tax code for the given period', async () => {
    const r = await vatSvc.vatReturn(new Date('2026-05-01'), new Date('2026-05-31'));
    const std = r.rows.find((row) => row.code === 'VAT_STANDARD')!;
    expect(std.output.net).toBe('3000.00');
    expect(std.output.vat).toBe('150.00');
    expect(r.outputVatTotal).toBe('150.00');
    expect(r.inputVatTotal).toBe('0.00');
    expect(r.netVatDue).toBe('150.00');
  });

  it('returns zero for periods with no activity', async () => {
    const r = await vatSvc.vatReturn(new Date('2026-01-01'), new Date('2026-02-28'));
    expect(r.outputVatTotal).toBe('0.00');
    expect(r.netVatDue).toBe('0.00');
  });
});
```

- [ ] **Step 3: Run — expect tests pass**

```
cd server && npx vitest run src/services/accounting/vat-return.service.test.ts
```

- [ ] **Step 4: Commit**

```
git add server/src/services/accounting/vat-return.service.ts server/src/services/accounting/vat-return.service.test.ts
git commit -m "feat(accounting): VatReturnService grouping output/input VAT by tax code"
```

---

### Task D3: Backfill service + tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\backfill.service.ts`
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\backfill.service.test.ts`

- [ ] **Step 1: Create the service**

```ts
import { PrismaClient } from '@prisma/client';
import { PostingService } from './posting.service';
import { isAccountingError } from './posting.errors';

export type BackfillFailure = {
  kind: 'payment' | 'booking-revenue' | 'booking-deposit';
  id: number;
  code: string;
  message: string;
};

export type BackfillResult = {
  processed: number;
  posted: number;
  skipped: number;
  failed: BackfillFailure[];
};

export class BackfillService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly posting: PostingService,
  ) {}

  async run(opts: { fromDate?: Date; userId: number }): Promise<BackfillResult> {
    const result: BackfillResult = { processed: 0, posted: 0, skipped: 0, failed: [] };
    const dateFilter = opts.fromDate ? { gte: opts.fromDate } : undefined;
    const mode = (await this.prisma.systemSettings.findUnique({ where: { id: 1 } }))?.accountingMode ?? 'CASH';

    // 1. Bookings revenue (ACCRUAL only)
    if (mode === 'ACCRUAL') {
      const bookings = await this.prisma.booking.findMany({
        where: { revenuePostedEntryId: null, ...(dateFilter ? { createdAt: dateFilter } : {}) },
        orderBy: { createdAt: 'asc' },
      });
      for (const b of bookings) {
        result.processed++;
        try {
          const out = await this.posting.postFromBookingCreated(b.id, opts.userId);
          if (out) result.posted++; else result.skipped++;
        } catch (err) {
          if (isAccountingError(err)) {
            result.failed.push({ kind: 'booking-revenue', id: b.id, code: err.code, message: err.message });
          } else throw err;
        }
      }
    }

    // 2. Booking deposits (any mode) — only NONE→HELD for now (collected but not posted)
    const heldBookings = await this.prisma.booking.findMany({
      where: {
        depositStatus: 'HELD',
        depositPostedEntryId: null,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { depositCollectedAt: 'asc' },
    });
    for (const b of heldBookings) {
      result.processed++;
      try {
        const out = await this.posting.postFromDepositTransition(b.id, 'NONE', 'HELD', opts.userId);
        if (out) result.posted++; else result.skipped++;
      } catch (err) {
        if (isAccountingError(err)) {
          result.failed.push({ kind: 'booking-deposit', id: b.id, code: err.code, message: err.message });
        } else throw err;
      }
    }

    // 3. Payments (any mode)
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'PAID',
        postedEntryId: null,
        ...(dateFilter ? { paidAt: dateFilter } : {}),
      },
      orderBy: { paidAt: 'asc' },
    });
    for (const p of payments) {
      result.processed++;
      try {
        const out = await this.posting.postFromPayment(p.id, opts.userId);
        if (out) result.posted++; else result.skipped++;
      } catch (err) {
        if (isAccountingError(err)) {
          result.failed.push({ kind: 'payment', id: p.id, code: err.code, message: err.message });
        } else throw err;
      }
    }

    return result;
  }
}
```

- [ ] **Step 2: Create the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PostingService } from './posting.service';
import { BackfillService } from './backfill.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);
const backfill = new BackfillService(db as any, posting);

let userId: number;
let cashId: number;
let revenueId: number;
let vatId: number;
let tcId: number;
let bldgId: number;
let bookingId: number;

beforeAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'BF-001' } });
  await db.apartment.deleteMany({ where: { number: 'BF-1' } });
  await db.building.deleteMany({ where: { code: 'BF-B' } });
  await db.user.deleteMany({ where: { email: 'bf@test.local' } });

  const u = await db.user.create({ data: { name: 'B', email: 'bf@test.local', password: 'x', role: 'ADMIN' } });
  userId = u.id;
  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  const vat = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  cashId = cash.id; revenueId = rev.id; vatId = vat.id;

  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'S', ratePct: 5, accountId: vatId, isDefault: true },
  });
  tcId = tc.id;

  await db.accountMapping.createMany({
    data: [
      { key: 'CASH_METHOD', accountId: cashId },
      { key: 'CARD_METHOD', accountId: cashId },
      { key: 'INSTALLMENT_METHOD', accountId: cashId },
      { key: 'AR_DEFAULT', accountId: cashId },
      { key: 'REVENUE_DEFAULT', accountId: revenueId },
      { key: 'DEPOSIT_LIABILITY', accountId: vatId },
      { key: 'DEPOSIT_FORFEIT_INCOME', accountId: revenueId },
      { key: 'VAT_PAYABLE', accountId: vatId },
    ],
  });
  await db.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, accountingMode: 'CASH' }, update: { accountingMode: 'CASH' } });

  const bldg = await db.building.create({ data: { name: 'B', code: 'BF-B', address: '' } });
  bldgId = bldg.id;
  const apt = await db.apartment.create({ data: { number: 'BF-1', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldgId } });
  const ten = await db.tenant.create({ data: { fullName: 'T', phone: '+9712', idNumber: 'BF-001' } });
  const b = await db.booking.create({
    data: { apartmentId: apt.id, tenantId: ten.id, checkIn: new Date('2026-01-01'), checkOut: new Date('2026-04-01'),
            totalAmount: 1000, taxCodeId: tcId },
  });
  bookingId = b.id;

  // Three historical paid payments, none with postedEntryId
  for (const amt of ['1050', '1050', '1050']) {
    await db.payment.create({
      data: { bookingId, method: 'CASH', amount: amt, status: 'PAID', paidAt: new Date('2026-03-15') },
    });
  }
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'BF-001' } });
  await db.apartment.deleteMany({ where: { number: 'BF-1' } });
  await db.building.deleteMany({ where: { code: 'BF-B' } });
  await db.user.deleteMany({ where: { email: 'bf@test.local' } });
  await db.$disconnect();
});

describe('BackfillService.run()', () => {
  it('posts all paid Payments and skips already-posted', async () => {
    const r1 = await backfill.run({ userId });
    expect(r1.processed).toBe(3);
    expect(r1.posted).toBe(3);

    const r2 = await backfill.run({ userId });
    expect(r2.processed).toBe(0);
    expect(r2.posted).toBe(0);
    expect(r2.skipped).toBe(0);
  });

  it('records per-row failures without halting', async () => {
    // Create a new paid payment then break a mapping
    const p = await db.payment.create({
      data: { bookingId, method: 'CASH', amount: '100', status: 'PAID', paidAt: new Date('2026-03-20') },
    });
    await db.accountMapping.delete({ where: { key: 'REVENUE_DEFAULT' } });

    const r = await backfill.run({ userId });
    expect(r.failed.length).toBe(1);
    expect(r.failed[0].code).toBe('MAPPING_MISSING');

    // Restore for downstream tests
    await db.accountMapping.create({ data: { key: 'REVENUE_DEFAULT', accountId: revenueId } });
    await db.payment.delete({ where: { id: p.id } });
  });
});
```

- [ ] **Step 3: Run — expect pass**

```
cd server && npx vitest run src/services/accounting/backfill.service.test.ts
```

- [ ] **Step 4: Commit**

```
git add server/src/services/accounting/backfill.service.ts server/src/services/accounting/backfill.service.test.ts
git commit -m "feat(accounting): BackfillService — synchronous, idempotent, per-row failures"
```

---

# Section E — Controllers for new endpoints

### Task E1: Mapping controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-mapping.controller.ts`

- [ ] **Step 1: Create the file**

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { MAPPING_KEYS, MappingKey } from '@hotel/shared';
import { MappingService } from '../services/accounting/mapping.service';

const mapping = new MappingService(prisma as any);
const VALID_KEYS = new Set<string>(MAPPING_KEYS);

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await mapping.listAll();
    res.json(rows);
  } catch (err) { next(err); }
}

export async function setOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const key = req.params.key;
    if (!VALID_KEYS.has(key)) { res.status(400).json({ message: `Unknown mapping key: ${key}` }); return; }
    const { accountId } = req.body as { accountId?: number };
    if (typeof accountId !== 'number' || accountId <= 0) {
      res.status(400).json({ message: 'accountId required' });
      return;
    }
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) { res.status(400).json({ message: 'Account not found' }); return; }
    if (!acc.isActive) { res.status(400).json({ message: 'Cannot map to an inactive account' }); return; }

    const updated = await mapping.setMapping(key as MappingKey, accountId, req.user!.id);
    res.json(updated);
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: Commit (routes wired in Task E6)**

```
git add server/src/controllers/accounting-mapping.controller.ts
git commit -m "feat(accounting): mapping controller — list, setOne"
```

---

### Task E2: Tax codes controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-taxcodes.controller.ts`

- [ ] **Step 1: Create the file**

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await prisma.taxCode.findMany({ orderBy: { code: 'asc' } });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, name, ratePct, accountId, isDefault, isExempt } = req.body as {
      code?: string; name?: string; ratePct?: number; accountId?: number;
      isDefault?: boolean; isExempt?: boolean;
    };
    if (!code?.trim() || !name?.trim() || typeof ratePct !== 'number' || typeof accountId !== 'number') {
      res.status(400).json({ message: 'code, name, ratePct, accountId required' });
      return;
    }
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) { res.status(400).json({ message: 'accountId not found' }); return; }

    try {
      const result = await prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.taxCode.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.taxCode.create({
          data: {
            code: code.trim(), name: name.trim(),
            ratePct, accountId,
            isDefault: !!isDefault, isExempt: !!isExempt,
            createdBy: req.user!.id, updatedBy: req.user!.id,
          },
        });
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err?.code === 'P2002') { res.status(409).json({ message: 'TaxCode code already exists' }); return; }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid id' }); return; }
    const existing = await prisma.taxCode.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: 'Not found' }); return; }

    const body = req.body as { code?: string; name?: string; ratePct?: number; accountId?: number; isDefault?: boolean; isExempt?: boolean };
    const data: any = { updatedBy: req.user!.id };
    if (body.code !== undefined) data.code = body.code.trim();
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.ratePct !== undefined) data.ratePct = body.ratePct;
    if (body.accountId !== undefined) data.accountId = body.accountId;
    if (body.isExempt !== undefined) data.isExempt = body.isExempt;

    const result = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.taxCode.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
        data.isDefault = true;
      }
      return tx.taxCode.update({ where: { id }, data });
    });

    res.json(result);
  } catch (err) { next(err); }
}

export async function deactivate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.taxCode.update({ where: { id }, data: { isActive: false, updatedBy: req.user!.id } });
    res.json(updated);
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: Commit**

```
git add server/src/controllers/accounting-taxcodes.controller.ts
git commit -m "feat(accounting): tax codes controller — CRUD + atomic default toggle"
```

---

### Task E3: Reversal controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-reversal.controller.ts`

- [ ] **Step 1: Create the file**

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService } from '../services/accounting/posting.service';
import { AccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);

export async function reverse(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const paymentId = Number(req.params.id);
    if (isNaN(paymentId) || paymentId <= 0) { res.status(400).json({ message: 'Invalid id' }); return; }

    try {
      const entry = await posting.reversePayment(paymentId, req.user!.id);
      res.json(entry);
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

- [ ] **Step 2: Commit**

```
git add server/src/controllers/accounting-reversal.controller.ts
git commit -m "feat(accounting): reversal controller (POST /accounting/payments/:id/reverse)"
```

---

### Task E4: Backfill controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-backfill.controller.ts`

- [ ] **Step 1: Create the file**

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService } from '../services/accounting/posting.service';
import { BackfillService } from '../services/accounting/backfill.service';

const posting = new PostingService(prisma as any);
const backfill = new BackfillService(prisma as any, posting);

export async function run(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fromDate } = req.body as { fromDate?: string };
    const parsed = fromDate ? new Date(fromDate) : undefined;
    if (fromDate && isNaN(parsed!.getTime())) {
      res.status(400).json({ message: 'fromDate must be a valid ISO date' });
      return;
    }
    const result = await backfill.run({ fromDate: parsed, userId: req.user!.id });
    res.json(result);
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: Commit**

```
git add server/src/controllers/accounting-backfill.controller.ts
git commit -m "feat(accounting): backfill controller (POST /accounting/backfill, admin-only)"
```

---

### Task E5: VAT return controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-vat-return.controller.ts`

- [ ] **Step 1: Create the file**

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { VatReturnService } from '../services/accounting/vat-return.service';

const svc = new VatReturnService(prisma as any);

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function vatReturn(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const result = await svc.vatReturn(new Date(from), new Date(to));
    res.json(result);
  } catch (err) { next(err); }
}

export async function vatReturnCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const result = await svc.vatReturn(new Date(from), new Date(to));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vat-return-${from}-${to}.csv"`);
    res.write('Tax Code,Name,Rate %,Output Net,Output VAT,Input Net,Input VAT\n');
    for (const r of result.rows) {
      res.write([r.code, r.name, r.ratePct, r.output.net, r.output.vat, r.input.net, r.input.vat]
        .map((x) => csvEscape(String(x))).join(',') + '\n');
    }
    res.write(`Output VAT Total,,,,${result.outputVatTotal}\n`);
    res.write(`Input VAT Total,,,,,,${result.inputVatTotal}\n`);
    res.write(`Net VAT Due,,,,${result.netVatDue}\n`);
    res.end();
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: Commit**

```
git add server/src/controllers/accounting-vat-return.controller.ts
git commit -m "feat(accounting): VAT return controller (JSON + CSV)"
```

---

### Task E6: Routes wiring

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\routes\accounting.routes.ts`

- [ ] **Step 1: Add new imports**

At the top of `accounting.routes.ts`:

```ts
import * as mapping from '../controllers/accounting-mapping.controller';
import * as taxCodes from '../controllers/accounting-taxcodes.controller';
import * as reversal from '../controllers/accounting-reversal.controller';
import * as setup from '../controllers/accounting-setup.controller';
import * as backfill from '../controllers/accounting-backfill.controller';
import * as vatReturn from '../controllers/accounting-vat-return.controller';
```

- [ ] **Step 2: Add new routes** (after the existing `/reports/general-ledger.csv` line)

```ts
// Mapping
router.get('/mapping', mapping.list);
router.patch('/mapping/:key', mapping.setOne);

// Tax codes
router.get('/tax-codes', taxCodes.list);
router.post('/tax-codes', taxCodes.create);
router.patch('/tax-codes/:id', taxCodes.update);
router.post('/tax-codes/:id/deactivate', taxCodes.deactivate);

// Reversal (admin or finance)
router.post('/payments/:id/reverse', reversal.reverse);

// VAT return
router.get('/reports/vat-return', vatReturn.vatReturn);
router.get('/reports/vat-return.csv', vatReturn.vatReturnCsv);

// Admin-only: setup + backfill
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';
const adminOnly = requireRole(Role.ADMIN, Role.SUPER_ADMIN);
router.post('/setup', adminOnly, setup.setup);
router.post('/backfill', adminOnly, backfill.run);
```

Note: `requireRole` may already be imported at the top of the file. If so, don't duplicate the import; just add the `adminOnly` constant and the routes.

- [ ] **Step 3: Run typecheck**

```
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add server/src/routes/accounting.routes.ts
git commit -m "feat(accounting): mount Phase 2 routes (mapping, tax-codes, reverse, setup, backfill, vat-return)"
```

---

# Section F — Hook auto-posting into existing controllers

### Task F1: Hook postFromPayment into Payments controller

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\controllers\payments.controller.ts`

- [ ] **Step 1: Add import**

```ts
import { PostingService } from '../services/accounting/posting.service';
import { isAccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);
```

- [ ] **Step 2: Modify `create` to wrap in transaction and auto-post**

Replace the existing `create` function:

```ts
export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { bookingId, method, amount, referenceNumber } = req.body as {
      bookingId?: number; method?: string; amount?: number; referenceNumber?: string;
    };

    if (!bookingId || !method || amount === undefined || amount === null) {
      res.status(400).json({ message: 'bookingId, method, and amount are required' });
      return;
    }
    if (!VALID_METHODS.includes(method as PaymentMethod)) {
      res.status(400).json({ message: `Invalid method. Must be one of: ${VALID_METHODS.join(', ')}` });
      return;
    }
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ message: 'amount must be a positive number' });
      return;
    }

    const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }

    const now = new Date();
    const isPaidOnCreate = method === PaymentMethod.CASH || method === PaymentMethod.CARD;

    try {
      const payment = await prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            bookingId: Number(bookingId),
            method: method as PaymentMethod,
            amount,
            referenceNumber: referenceNumber?.trim() || null,
            status: isPaidOnCreate ? PaymentStatus.PAID : PaymentStatus.PENDING,
            paidAt: isPaidOnCreate ? now : null,
          },
          include: bookingInclude,
        });

        if (isPaidOnCreate) {
          // Auto-post only if AccountMapping exists; silent no-op otherwise (keeps systems without setup working)
          const hasMapping = (await tx.accountMapping.count({ where: { key: 'REVENUE_DEFAULT' } })) > 0;
          if (hasMapping) {
            await posting.postFromPayment(created.id, req.user!.id, tx);
          }
        }
        return created;
      });

      res.status(201).json(payment);
    } catch (err) {
      if (isAccountingError(err)) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}
```

- [ ] **Step 3: Modify `markPaid` similarly**

```ts
export async function markPaid(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ message: 'Invalid payment id' });
      return;
    }

    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) { res.status(404).json({ message: 'Payment not found' }); return; }
    if (payment.status === PaymentStatus.PAID) { res.status(409).json({ message: 'Payment is already marked as paid' }); return; }
    if (payment.status === PaymentStatus.REVERSED) { res.status(409).json({ message: 'Cannot mark a reversed payment as paid' }); return; }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.payment.update({
          where: { id },
          data: { status: PaymentStatus.PAID, paidAt: new Date() },
          include: bookingInclude,
        });
        const hasMapping = (await tx.accountMapping.count({ where: { key: 'REVENUE_DEFAULT' } })) > 0;
        if (hasMapping) {
          await posting.postFromPayment(u.id, req.user!.id, tx);
        }
        return u;
      });
      res.json(updated);
    } catch (err) {
      if (isAccountingError(err)) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}
```

- [ ] **Step 4: Exclude REVERSED from outstanding balance**

Modify the `stats` function. Find the existing `pendingResult` block:

```ts
prisma.payment.aggregate({
  where: { status: PaymentStatus.PENDING },
  _sum: { amount: true },
}),
```

That already only counts PENDING — REVERSED is naturally excluded. No change needed there.

For `allPaidResult` block, REVERSED payments should also be excluded (they had been PAID before reversal but shouldn't count anymore):

```ts
prisma.payment.aggregate({
  where: { status: PaymentStatus.PAID }, // PAID-only — REVERSED naturally excluded
  _sum: { amount: true },
}),
```

This is already correct because we changed `REVERSED` to its own status — `status: PAID` no longer includes reversed payments.

Also check `installmentPlans` — same logic applies.

- [ ] **Step 5: Run existing payment tests + typecheck**

```
cd server && npx tsc --noEmit
cd server && npx vitest run src/controllers/payments.controller.test.ts
```

Expected: typecheck passes; existing payment tests still pass (they pre-date Phase 2, no AccountMapping exists in those test fixtures, so the `hasMapping` check returns false and auto-posting is silently skipped).

- [ ] **Step 6: Commit**

```
git add server/src/controllers/payments.controller.ts
git commit -m "feat(payments): wire postFromPayment into create + markPaid (transactional, silent if mapping absent)"
```

---

### Task F2: Hook auto-posting into Bookings controller

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\controllers\bookings.controller.ts`

- [ ] **Step 1: Add imports**

```ts
import { PostingService } from '../services/accounting/posting.service';
import { isAccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);
```

- [ ] **Step 2: Modify `create` to auto-post inside a transaction**

Wrap the existing booking creation in `prisma.$transaction`. After `tx.booking.create`, if `depositAmount > 0`, call `postFromDepositTransition(NONE→HELD)`. In ACCRUAL mode, call `postFromBookingCreated`.

Use the same `hasMapping` guard as in payments. Add the same try/catch wrapping `isAccountingError → 400`.

Example skeleton (adapt to the current `create` body):

```ts
const result = await prisma.$transaction(async (tx) => {
  const booking = await tx.booking.create({ data: { /* existing fields incl. taxCodeId */ } });

  const hasMapping = (await tx.accountMapping.count({ where: { key: 'REVENUE_DEFAULT' } })) > 0;
  if (hasMapping) {
    // ACCRUAL revenue posting (no-op in CASH)
    await posting.postFromBookingCreated(booking.id, req.user!.id, tx);
    // Deposit posting if collected on create
    if (booking.depositAmount && Number(booking.depositAmount) > 0 && booking.depositStatus === 'HELD') {
      await posting.postFromDepositTransition(booking.id, 'NONE', 'HELD', req.user!.id, tx);
    }
  }
  return booking;
});
```

Also accept optional `taxCodeId` in the request body and pass it to `tx.booking.create`.

- [ ] **Step 3: Modify `collectDeposit` similarly**

Wrap the update in a transaction; call `postFromDepositTransition(NONE→HELD)` after.

- [ ] **Step 4: Modify `checkout` similarly**

Wrap in a transaction (it already uses `$transaction` — extend it). After updating booking, call `postFromDepositTransition(HELD→RELEASED|FORFEITED)` based on `newDepositStatus`. Skip if `booking.depositStatus !== 'HELD'` (no deposit transition).

- [ ] **Step 5: Run typecheck**

```
cd server && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
git add server/src/controllers/bookings.controller.ts
git commit -m "feat(bookings): wire auto-posting into create, collectDeposit, checkout"
```

---

# Section G — HTTP integration tests (extending existing files)

### Task G1: Mapping + tax codes HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-mapping.controller.test.ts`
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-taxcodes.controller.test.ts`

- [ ] **Step 1: Mapping tests**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string; let cashId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'map@test.local' } });

  const admin = await db.user.create({ data: { name: 'M', email: 'map@test.local', password: 'x', role: 'ADMIN' } });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  const a = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  cashId = a.id;
});
afterAll(async () => {
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'map@test.local' } });
  await db.$disconnect(); await prisma.$disconnect();
});
beforeEach(async () => { await db.accountMapping.deleteMany(); });

describe('GET /accounting/mapping', () => {
  it('returns one row per known key, unmapped keys have null accountId', async () => {
    const r = await request(app).get('/api/v1/accounting/mapping').set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(8);
    expect(r.body.every((row: any) => row.accountId === null)).toBe(true);
  });
});

describe('PATCH /accounting/mapping/:key', () => {
  it('upserts a mapping', async () => {
    const r = await request(app)
      .patch('/api/v1/accounting/mapping/CASH_METHOD')
      .set('Cookie', adminCookie)
      .send({ accountId: cashId });
    expect(r.status).toBe(200);
    expect((await db.accountMapping.findUnique({ where: { key: 'CASH_METHOD' } }))?.accountId).toBe(cashId);
  });

  it('rejects unknown key with 400', async () => {
    const r = await request(app)
      .patch('/api/v1/accounting/mapping/NONSENSE')
      .set('Cookie', adminCookie)
      .send({ accountId: cashId });
    expect(r.status).toBe(400);
  });

  it('rejects mapping to a non-existent account', async () => {
    const r = await request(app)
      .patch('/api/v1/accounting/mapping/CASH_METHOD')
      .set('Cookie', adminCookie)
      .send({ accountId: 999999 });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Tax codes tests**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string; let vatAccountId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.taxCode.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'tc@test.local' } });

  const admin = await db.user.create({ data: { name: 'T', email: 'tc@test.local', password: 'x', role: 'ADMIN' } });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  const a = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  vatAccountId = a.id;
});
afterAll(async () => {
  await db.taxCode.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'tc@test.local' } });
  await db.$disconnect(); await prisma.$disconnect();
});
beforeEach(async () => { await db.taxCode.deleteMany(); });

describe('TaxCode CRUD', () => {
  it('creates a tax code', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/tax-codes')
      .set('Cookie', adminCookie)
      .send({ code: 'VAT_STANDARD', name: 'VAT 5%', ratePct: 5, accountId: vatAccountId, isDefault: true });
    expect(r.status).toBe(201);
    expect(r.body.isDefault).toBe(true);
  });

  it('setting isDefault on a second code unsets the first atomically', async () => {
    await db.taxCode.create({ data: { code: 'A', name: 'A', ratePct: 5, accountId: vatAccountId, isDefault: true } });
    const second = await db.taxCode.create({ data: { code: 'B', name: 'B', ratePct: 5, accountId: vatAccountId, isDefault: false } });

    const r = await request(app)
      .patch(`/api/v1/accounting/tax-codes/${second.id}`)
      .set('Cookie', adminCookie)
      .send({ isDefault: true });
    expect(r.status).toBe(200);

    const a = await db.taxCode.findUnique({ where: { code: 'A' } });
    const b = await db.taxCode.findUnique({ where: { code: 'B' } });
    expect(a?.isDefault).toBe(false);
    expect(b?.isDefault).toBe(true);
  });

  it('rejects duplicate code with 409', async () => {
    await request(app).post('/api/v1/accounting/tax-codes').set('Cookie', adminCookie)
      .send({ code: 'X', name: 'X', ratePct: 5, accountId: vatAccountId });
    const r = await request(app).post('/api/v1/accounting/tax-codes').set('Cookie', adminCookie)
      .send({ code: 'X', name: 'X2', ratePct: 5, accountId: vatAccountId });
    expect(r.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run + commit**

```
cd server && npx vitest run src/controllers/accounting-mapping.controller.test.ts src/controllers/accounting-taxcodes.controller.test.ts
```

```
git add server/src/controllers/accounting-mapping.controller.test.ts server/src/controllers/accounting-taxcodes.controller.test.ts
git commit -m "test(accounting): mapping + tax codes HTTP tests"
```

---

### Task G2: Reversal, backfill, vat-return HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-reversal.controller.test.ts`
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-backfill.controller.test.ts`
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-vat-return.controller.test.ts`

These tests follow the same pattern as the existing controller tests. Each one:

1. **Seeds:** an admin user (real DB row for audit FK), Account rows (Cash, Revenue, VAT Payable), TaxCode (VAT_STANDARD), all AccountMapping rows, a Booking + Payment as needed.
2. **Exercises the route** via supertest.
3. **Asserts** status code, response shape, and DB side-effects.

Per file, target ~3 tests:

**Reversal:**
- 200 + REVERSED status on happy path
- 400 ALREADY_REVERSED on double-reverse
- 400 CANNOT_REVERSE on PENDING payment

**Backfill:**
- 200 with `processed > 0` on first run
- 200 with `processed === 0` on second run (idempotent)
- 403 for FINANCE (admin-only)

**VAT return:**
- 200 + correct grouped totals
- 400 when `from`/`to` missing
- CSV variant returns `text/csv`

(Full code follows the same supertest pattern as the existing Phase 1 controller tests; the implementer subagent can use them as the template.)

- [ ] **Step 1: Write each test file using the pattern above; consult the existing `accounting-accounts.controller.test.ts` and the service-level `vat-return.service.test.ts` for fixture setup**

- [ ] **Step 2: Run each test file individually**

```
cd server && npx vitest run src/controllers/accounting-reversal.controller.test.ts
cd server && npx vitest run src/controllers/accounting-backfill.controller.test.ts
cd server && npx vitest run src/controllers/accounting-vat-return.controller.test.ts
```

- [ ] **Step 3: Commit each separately**

```
git add server/src/controllers/accounting-reversal.controller.test.ts
git commit -m "test(accounting): reversal HTTP tests"

git add server/src/controllers/accounting-backfill.controller.test.ts
git commit -m "test(accounting): backfill HTTP tests (admin-only, idempotent)"

git add server/src/controllers/accounting-vat-return.controller.test.ts
git commit -m "test(accounting): VAT return HTTP + CSV tests"
```

---

### Task G3: Extend payments & bookings controller tests

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\controllers\payments.controller.test.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\controllers\bookings.controller.test.ts`

- [ ] **Step 1: Add an "Auto-posting" describe block** to `payments.controller.test.ts`:

```ts
describe('Auto-posting on PAID (Phase 2)', () => {
  let cashAccountId: number; let revenueAccountId: number; let vatAccountId: number;

  beforeAll(async () => {
    const cash = await testPrisma.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
    const rev = await testPrisma.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
    const vat = await testPrisma.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
    cashAccountId = cash.id; revenueAccountId = rev.id; vatAccountId = vat.id;

    const tc = await testPrisma.taxCode.create({
      data: { code: 'VAT_STANDARD', name: 'Standard', ratePct: 5, accountId: vatAccountId, isDefault: true },
    });
    await testPrisma.booking.update({ where: { id: bookingId }, data: { taxCodeId: tc.id } });

    await testPrisma.accountMapping.createMany({
      data: [
        { key: 'CASH_METHOD', accountId: cashAccountId },
        { key: 'CARD_METHOD', accountId: cashAccountId },
        { key: 'INSTALLMENT_METHOD', accountId: cashAccountId },
        { key: 'AR_DEFAULT', accountId: cashAccountId },
        { key: 'REVENUE_DEFAULT', accountId: revenueAccountId },
        { key: 'DEPOSIT_LIABILITY', accountId: vatAccountId },
        { key: 'DEPOSIT_FORFEIT_INCOME', accountId: revenueAccountId },
        { key: 'VAT_PAYABLE', accountId: vatAccountId },
      ],
    });
    await testPrisma.systemSettings.upsert({
      where: { id: 1 }, create: { id: 1, accountingMode: 'CASH' }, update: { accountingMode: 'CASH' },
    });
  });

  afterAll(async () => {
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.taxCode.deleteMany();
    // Order matters: lines reference accounts
    await testPrisma.journalLine.deleteMany();
    await testPrisma.journalEntry.deleteMany();
    await testPrisma.account.deleteMany();
  });

  it('POST /payments with CASH+PAID auto-posts a JE; verify via JournalEntry', async () => {
    const r = await request(app).post('/api/v1/payments').set('Cookie', adminCookie).send({
      bookingId, method: 'CASH', amount: 1050,
    });
    expect(r.status).toBe(201);
    expect(r.body.postedEntryId).toBeTruthy();
    const lines = await testPrisma.journalLine.findMany({ where: { journalEntryId: r.body.postedEntryId } });
    expect(lines).toHaveLength(3); // Cash + Revenue + VAT
  });

  it('PATCH /payments/:id (markPaid) auto-posts', async () => {
    const r = await request(app).patch(`/api/v1/payments/${pendingPaymentId}`).set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.postedEntryId).toBeTruthy();
  });

  it('payment.create rolls back when posting throws MAPPING_MISSING', async () => {
    await testPrisma.accountMapping.delete({ where: { key: 'REVENUE_DEFAULT' } });
    const before = await testPrisma.payment.count();
    const r = await request(app).post('/api/v1/payments').set('Cookie', adminCookie).send({
      bookingId, method: 'CASH', amount: 100,
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('MAPPING_MISSING');
    expect(await testPrisma.payment.count()).toBe(before); // rollback
    // Restore for the next test
    await testPrisma.accountMapping.create({ data: { key: 'REVENUE_DEFAULT', accountId: revenueAccountId } });
  });
});
```

- [ ] **Step 2: Bookings test extension**

Add a similar describe block in `bookings.controller.test.ts` covering: POST /bookings in ACCRUAL mode auto-posts AR/Revenue; PATCH /bookings/:id/deposit auto-posts liability; PATCH /bookings/:id/checkout posts release/forfeit.

- [ ] **Step 3: Run full server suite**

```
cd server && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add server/src/controllers/payments.controller.test.ts server/src/controllers/bookings.controller.test.ts
git commit -m "test: extend payments/bookings controller tests with auto-posting + transaction rollback"
```

---

# Section H — Client API + components

### Task H1: Client API additions

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\lib\api\accounting-phase2.ts`

- [ ] **Step 1: Create the file**

```ts
import api from '../axios';
import type { MappingKey } from '@hotel/shared';

export type MappingRow = {
  key: MappingKey;
  accountId: number | null;
  account: { code: string; name: string } | null;
};

export const mappingApi = {
  list: () => api.get<MappingRow[]>('/accounting/mapping').then((r) => r.data),
  set: (key: MappingKey, accountId: number) =>
    api.patch(`/accounting/mapping/${key}`, { accountId }).then((r) => r.data),
};

export type TaxCode = {
  id: number; code: string; name: string; ratePct: string;
  accountId: number; isDefault: boolean; isExempt: boolean; isActive: boolean;
};

export const taxCodesApi = {
  list: () => api.get<TaxCode[]>('/accounting/tax-codes').then((r) => r.data),
  create: (d: { code: string; name: string; ratePct: number; accountId: number; isDefault?: boolean; isExempt?: boolean }) =>
    api.post<TaxCode>('/accounting/tax-codes', d).then((r) => r.data),
  update: (id: number, d: Partial<{ code: string; name: string; ratePct: number; accountId: number; isDefault: boolean; isExempt: boolean }>) =>
    api.patch<TaxCode>(`/accounting/tax-codes/${id}`, d).then((r) => r.data),
  deactivate: (id: number) =>
    api.post<TaxCode>(`/accounting/tax-codes/${id}/deactivate`).then((r) => r.data),
};

export const accountingAdminApi = {
  setup: () =>
    api.post<{ createdAccounts: number; createdTaxCodes: number; createdMappings: number; unmappedKeys: string[] }>(
      '/accounting/setup'
    ).then((r) => r.data),

  backfill: (fromDate?: string) =>
    api.post<{
      processed: number; posted: number; skipped: number;
      failed: Array<{ kind: string; id: number; code: string; message: string }>;
    }>('/accounting/backfill', fromDate ? { fromDate } : {}).then((r) => r.data),

  reversePayment: (paymentId: number) =>
    api.post(`/accounting/payments/${paymentId}/reverse`).then((r) => r.data),
};

export type VatReturnRow = {
  taxCodeId: number; code: string; name: string; ratePct: string; isExempt: boolean;
  output: { net: string; vat: string };
  input:  { net: string; vat: string };
};

export type VatReturnResult = {
  from: string; to: string;
  rows: VatReturnRow[];
  outputVatTotal: string; inputVatTotal: string; netVatDue: string;
};

export const vatReturnApi = {
  get: (params: { from: string; to: string }) =>
    api.get<VatReturnResult>('/accounting/reports/vat-return', { params }).then((r) => r.data),
};
```

- [ ] **Step 2: Commit**

```
git add client/src/lib/api/accounting-phase2.ts
git commit -m "feat(client): accounting Phase 2 API client (mapping, tax codes, setup, backfill, reverse, vat return)"
```

---

### Task H2: AccountMappingPage + TaxCodesPanel

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\AccountMappingPage.tsx`
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\TaxCodesPanel.tsx`

- [ ] **Step 1: Create `TaxCodesPanel.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { taxCodesApi, type TaxCode } from '../../lib/api/accounting-phase2';
import { accountsApi } from '../../lib/api/accounting';

export default function TaxCodesPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: taxCodes = [] } = useQuery({ queryKey: ['accounting', 'tax-codes'], queryFn: taxCodesApi.list });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: accountsApi.list });
  const [showNew, setShowNew] = useState(false);

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => taxCodesApi.update(id, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'tax-codes'] }),
  });
  const createMut = useMutation({
    mutationFn: (d: any) => taxCodesApi.create(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'tax-codes'] }),
  });

  return (
    <section className="mt-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-bold">{t('accounting.taxCodes.title', 'Tax Codes')}</h2>
        <button onClick={() => setShowNew(true)} className="px-3 py-1 rounded bg-primary text-on-primary text-sm">
          + {t('accounting.taxCodes.new', 'New')}
        </button>
      </div>
      <table className="w-full text-sm bg-surface-container-low rounded">
        <thead className="text-on-surface-variant">
          <tr><th className="px-2 py-1 text-left">Code</th><th className="px-2 py-1 text-left">Name</th>
              <th className="px-2 py-1 text-right">Rate %</th><th className="px-2 py-1 text-left">Account</th>
              <th className="px-2 py-1 text-center">Default</th><th className="px-2 py-1 text-center">Active</th></tr>
        </thead>
        <tbody>
          {taxCodes.map((tc) => {
            const acc = accounts.find((a) => a.id === tc.accountId);
            return (
              <tr key={tc.id} className="border-t border-outline-variant">
                <td className="px-2 py-1 font-mono">{tc.code}</td>
                <td className="px-2 py-1">{tc.name}</td>
                <td className="px-2 py-1 text-right">{tc.ratePct}</td>
                <td className="px-2 py-1">{acc ? `${acc.code} – ${acc.name}` : '?'}</td>
                <td className="px-2 py-1 text-center">
                  <input type="radio" name="default-tc" checked={tc.isDefault}
                    onChange={() => updateMut.mutate({ id: tc.id, d: { isDefault: true } })} />
                </td>
                <td className="px-2 py-1 text-center">
                  {tc.isActive ? <span className="text-primary">Yes</span> : <span className="text-on-surface-variant">No</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {showNew && <NewTaxCodeModal accounts={accounts} onSubmit={(d) => createMut.mutateAsync(d).then(() => setShowNew(false))} onClose={() => setShowNew(false)} />}
    </section>
  );
}

function NewTaxCodeModal({ accounts, onSubmit, onClose }: any) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [ratePct, setRatePct] = useState('5');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [isDefault, setIsDefault] = useState(false);
  const [isExempt, setIsExempt] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await onSubmit({ code, name, ratePct: Number(ratePct), accountId: Number(accountId), isDefault, isExempt });
    } catch (e: any) { setErr(e?.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <form onSubmit={submit} className="bg-surface rounded-lg shadow-xl w-[420px] p-6">
        <h2 className="text-lg font-bold mb-4">New Tax Code</h2>
        {err && <div className="text-error text-sm mb-2">{err}</div>}
        <label className="block text-sm mb-2">Code <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required /></label>
        <label className="block text-sm mb-2">Name <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required /></label>
        <label className="block text-sm mb-2">Rate % <input type="number" step="0.01" value={ratePct} onChange={(e) => setRatePct(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required /></label>
        <label className="block text-sm mb-2">VAT Payable Account
          <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required>
            <option value="">— select —</option>
            {accounts.filter((a: any) => a.type === 'LIABILITY').map((a: any) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
        </label>
        <label className="block text-sm mb-2"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="ltr:mr-2 rtl:ml-2" />Set as default</label>
        <label className="block text-sm mb-4"><input type="checkbox" checked={isExempt} onChange={(e) => setIsExempt(e.target.checked)} className="ltr:mr-2 rtl:ml-2" />Exempt (vs zero-rated)</label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-primary text-on-primary text-sm">Create</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `AccountMappingPage.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { mappingApi } from '../../lib/api/accounting-phase2';
import { accountsApi } from '../../lib/api/accounting';
import type { MappingKey } from '@hotel/shared';
import AccountPicker from './components/AccountPicker';
import TaxCodesPanel from './TaxCodesPanel';

const KEY_LABELS: Record<string, string> = {
  CASH_METHOD: 'Cash payments',
  CARD_METHOD: 'Card payments',
  INSTALLMENT_METHOD: 'Installment payments',
  AR_DEFAULT: 'Accounts Receivable',
  REVENUE_DEFAULT: 'Revenue (default)',
  DEPOSIT_LIABILITY: 'Security Deposits Held',
  DEPOSIT_FORFEIT_INCOME: 'Forfeited Deposit Income',
  VAT_PAYABLE: 'VAT Payable',
};

export default function AccountMappingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['accounting', 'mapping'], queryFn: mappingApi.list });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: accountsApi.list });
  const [editing, setEditing] = useState<MappingKey | null>(null);

  const setMut = useMutation({
    mutationFn: ({ key, accountId }: { key: MappingKey; accountId: number }) => mappingApi.set(key, accountId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting', 'mapping'] }); setEditing(null); },
  });

  if (isLoading) return <div className="p-6 text-on-surface-variant">{t('common.loading', 'Loading…')}</div>;
  const unmapped = rows.filter((r) => r.accountId === null).map((r) => r.key);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.mapping.title', 'Account Mapping')}</h1>
      {unmapped.length > 0 && (
        <div className="mb-4 p-3 bg-error-container text-error rounded">
          ⚠ Mapping incomplete — auto-posting is disabled until you map: {unmapped.join(', ')}
        </div>
      )}
      <table className="w-full text-sm bg-surface-container-low rounded">
        <thead className="text-on-surface-variant">
          <tr><th className="px-2 py-1 text-left">Mapping</th><th className="px-2 py-1 text-left">Currently maps to</th><th className="px-2 py-1 text-right">Action</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-outline-variant">
              <td className="px-2 py-1">{KEY_LABELS[r.key] ?? r.key}</td>
              <td className="px-2 py-1">
                {r.account ? <span><span className="font-mono">{r.account.code}</span> – {r.account.name}</span> : <span className="text-error">— unmapped —</span>}
              </td>
              <td className="px-2 py-1 text-right">
                <button onClick={() => setEditing(r.key)} className="text-primary text-sm">Change</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
          <div className="bg-surface rounded-lg shadow-xl w-[420px] p-6">
            <h2 className="text-lg font-bold mb-4">Map {KEY_LABELS[editing] ?? editing}</h2>
            <AccountPicker
              accounts={accounts}
              value={rows.find((r) => r.key === editing)?.accountId ?? null}
              onChange={(id) => id && setMut.mutate({ key: editing, accountId: id })}
            />
            <div className="mt-4 flex justify-end">
              <button onClick={() => setEditing(null)} className="px-3 py-1 rounded border border-outline-variant text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      <TaxCodesPanel />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```
git add client/src/pages/accounting/AccountMappingPage.tsx client/src/pages/accounting/TaxCodesPanel.tsx
git commit -m "feat(client): Account Mapping page + Tax Codes panel"
```

---

### Task H3: VatReturnPage

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\VatReturnPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { vatReturnApi } from '../../lib/api/accounting-phase2';

function previousMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export default function VatReturnPage() {
  const { t } = useTranslation();
  const init = previousMonthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data } = useQuery({
    queryKey: ['accounting', 'vat-return', { from, to }],
    queryFn: () => vatReturnApi.get({ from, to }),
  });

  const csvUrl = `/api/v1/accounting/reports/vat-return.csv?from=${from}&to=${to}`;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.vat.title', 'VAT Return')}</h1>
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>
      </div>
      {data && (
        <>
          <section className="mb-6">
            <h2 className="font-bold mb-2">Output VAT (tax collected)</h2>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr><th className="px-2 py-1 text-left">Tax Code</th><th className="px-2 py-1 text-right">Net</th><th className="px-2 py-1 text-right">VAT</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`out-${r.taxCodeId}`} className="border-t border-outline-variant">
                    <td className="px-2 py-1">{r.code} ({r.ratePct}%){r.isExempt ? ' — exempt' : ''}</td>
                    <td className="px-2 py-1 text-right">{r.output.net}</td>
                    <td className="px-2 py-1 text-right">{r.output.vat}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Output VAT</td><td className="px-2 py-1 text-right">{data.outputVatTotal}</td></tr></tfoot>
            </table>
          </section>

          <section className="mb-6">
            <h2 className="font-bold mb-2">Input VAT (tax paid)</h2>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr><th className="px-2 py-1 text-left">Tax Code</th><th className="px-2 py-1 text-right">Net</th><th className="px-2 py-1 text-right">VAT</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`in-${r.taxCodeId}`} className="border-t border-outline-variant">
                    <td className="px-2 py-1">{r.code} ({r.ratePct}%)</td>
                    <td className="px-2 py-1 text-right">{r.input.net}</td>
                    <td className="px-2 py-1 text-right">{r.input.vat}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Input VAT</td><td className="px-2 py-1 text-right">{data.inputVatTotal}</td></tr></tfoot>
            </table>
          </section>

          <div className="text-right text-lg font-bold border-t-2 border-on-surface pt-3">
            Net VAT Due: <span className="font-mono">{data.netVatDue}</span>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add client/src/pages/accounting/VatReturnPage.tsx
git commit -m "feat(client): VAT Return page with output/input VAT and CSV export"
```

---

### Task H4: Backfill modal + Reverse payment dialog

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\BackfillModal.tsx`
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\ReversePaymentDialog.tsx`

- [ ] **Step 1: BackfillModal**

```tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { accountingAdminApi } from '../../lib/api/accounting-phase2';

type Props = { onClose: () => void };

export default function BackfillModal({ onClose }: Props) {
  const [fromDate, setFromDate] = useState('');
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: () => accountingAdminApi.backfill(fromDate || undefined),
    onSuccess: (r) => setResult(r),
  });

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <div className="bg-surface rounded-lg shadow-xl w-[480px] p-6">
        <h2 className="text-lg font-bold mb-4">Backfill auto-posting</h2>
        {!result ? (
          <>
            <p className="text-sm text-on-surface-variant mb-3">
              Walks historical Payments and Bookings and posts missing journal entries. Idempotent — already-posted rows are skipped.
            </p>
            <label className="block text-sm mb-4">
              From date (optional)
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
              <button disabled={mut.isPending} onClick={() => mut.mutate()} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
                {mut.isPending ? 'Running…' : 'Run Backfill'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm space-y-1 mb-4">
              <div>Processed: <b>{result.processed}</b></div>
              <div>Posted: <b>{result.posted}</b></div>
              <div>Skipped (already posted): <b>{result.skipped}</b></div>
              <div>Failed: <b>{result.failed.length}</b></div>
              {result.failed.length > 0 && (
                <ul className="mt-2 text-error text-xs">
                  {result.failed.map((f: any, i: number) => <li key={i}>{f.kind} #{f.id}: {f.code} — {f.message}</li>)}
                </ul>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-3 py-1 rounded bg-primary text-on-primary text-sm">Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ReversePaymentDialog**

```tsx
import { useMutation } from '@tanstack/react-query';
import { accountingAdminApi } from '../../lib/api/accounting-phase2';

type Props = {
  paymentId: number;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ReversePaymentDialog({ paymentId, onClose, onSuccess }: Props) {
  const mut = useMutation({
    mutationFn: () => accountingAdminApi.reversePayment(paymentId),
    onSuccess: () => { onSuccess(); onClose(); },
  });
  const err = (mut.error as any)?.response?.data;

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <div className="bg-surface rounded-lg shadow-xl w-[480px] p-6">
        <h2 className="text-lg font-bold mb-4">Reverse Payment</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          This will post a balancing journal entry and mark the payment as REVERSED. The original entry remains in the ledger for audit. Continue?
        </p>
        {err && <div className="text-error text-sm mb-2">{err.code}: {err.message}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button disabled={mut.isPending} onClick={() => mut.mutate()} className="px-3 py-1 rounded bg-error text-on-primary text-sm disabled:opacity-50">
            {mut.isPending ? 'Reversing…' : 'Reverse'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```
git add client/src/pages/accounting/BackfillModal.tsx client/src/pages/accounting/ReversePaymentDialog.tsx
git commit -m "feat(client): BackfillModal + ReversePaymentDialog"
```

---

# Section I — Wire client (routes, sidebar, settings, payments page, booking form, i18n)

### Task I1: Register routes in App.tsx

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\App.tsx`

- [ ] **Step 1: Add imports**

```tsx
import AccountMappingPage from './pages/accounting/AccountMappingPage';
import VatReturnPage from './pages/accounting/VatReturnPage';
```

- [ ] **Step 2: Add two routes inside the existing `{f[FeatureFlag.ACCOUNTING] && (<>...</>)}` block**

```tsx
<Route path="accounting/mapping" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><AccountMappingPage /></ProtectedRoute>} />
<Route path="accounting/vat-return" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><VatReturnPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Commit**

```
git add client/src/App.tsx
git commit -m "feat(client): register accounting Phase 2 routes (mapping, vat-return)"
```

---

### Task I2: Sidebar entries

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\components\layout\Sidebar.tsx`

- [ ] **Step 1: Add to `NAV_ITEMS`**

Insert after the existing `accounting/trial-balance` entry:

```ts
  { to: '/accounting/mapping', icon: 'settings_input_component', key: 'accountingMapping', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE], feature: FeatureFlag.ACCOUNTING },
  { to: '/accounting/vat-return', icon: 'request_quote', key: 'accountingVAT', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE], feature: FeatureFlag.ACCOUNTING },
```

- [ ] **Step 2: Commit**

```
git add client/src/components/layout/Sidebar.tsx
git commit -m "feat(client): sidebar entries for Account Mapping + VAT Return"
```

---

### Task I3: Settings page additions

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\pages\settings\SettingsPage.tsx`

- [ ] **Step 1: Read the current file** to understand its current state shape.

- [ ] **Step 2: Add `AccountingMode` state, mirror the existing `booksMode` pattern**

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Role, FeatureFlag } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useSettings, useUpdateSettings, SystemSettings } from '../../hooks/useSettings';
import { useMutation } from '@tanstack/react-query';
import { accountingAdminApi } from '../../lib/api/accounting-phase2';
import BackfillModal from '../accounting/BackfillModal';

type AccountingMode = 'CASH' | 'ACCRUAL';

// Inside SettingsPage component, add state next to booksMode:
const [accountingMode, setAccountingMode] = useState<AccountingMode>('CASH');
const [showBackfill, setShowBackfill] = useState(false);
const [setupResult, setSetupResult] = useState<any>(null);

useEffect(() => {
  if (settings) {
    const raw = (settings as SystemSettings & { accountingMode?: AccountingMode }).accountingMode;
    setAccountingMode(raw ?? 'CASH');
  }
}, [settings]);

const setupMut = useMutation({
  mutationFn: () => accountingAdminApi.setup(),
  onSuccess: (r) => setSetupResult(r),
});

async function handleAccountingModeChange(value: AccountingMode) {
  setAccountingMode(value);
  if (canEdit) {
    await updateSettings.mutateAsync({ accountingMode: value } as any);
  }
}
```

- [ ] **Step 3: Inside the existing Accounting section (already gated by `flags?.[FeatureFlag.ACCOUNTING]` from Phase 1), append:**

```tsx
<div className="mt-6 border-t border-outline-variant pt-4">
  <h3 className="text-sm font-bold mb-2">{t('settings.accounting.modeTitle', 'Accounting mode')}</h3>
  <p className="text-sm text-on-surface-variant mb-3">
    {t('settings.accounting.modeHelp', "Cash basis posts revenue when payment is received. Accrual posts revenue when the booking is created and clears AR when payment is received. Switching modes does not affect historical entries.")}
  </p>
  <label className="block text-sm mb-1">
    <input type="radio" name="accountingMode" value="CASH" checked={accountingMode === 'CASH'} onChange={() => handleAccountingModeChange('CASH')} disabled={!canEdit} className="ltr:mr-2 rtl:ml-2" />
    {t('settings.accounting.cash', 'Cash basis')}
  </label>
  <label className="block text-sm">
    <input type="radio" name="accountingMode" value="ACCRUAL" checked={accountingMode === 'ACCRUAL'} onChange={() => handleAccountingModeChange('ACCRUAL')} disabled={!canEdit} className="ltr:mr-2 rtl:ml-2" />
    {t('settings.accounting.accrual', 'Accrual basis')}
  </label>
</div>

{canEdit && (
  <div className="mt-6 border-t border-outline-variant pt-4 space-y-3">
    <div>
      <button onClick={() => setupMut.mutate()} disabled={setupMut.isPending} className="px-3 py-2 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
        {setupMut.isPending ? 'Running…' : t('settings.accounting.runSetup', 'Run Setup')}
      </button>
      {setupResult && (
        <div className="mt-2 text-sm">
          Created {setupResult.createdAccounts} accounts, {setupResult.createdTaxCodes} tax codes, {setupResult.createdMappings} mappings.
          {setupResult.unmappedKeys.length > 0 && <span className="text-error"> Unmapped: {setupResult.unmappedKeys.join(', ')}</span>}
        </div>
      )}
    </div>
    <div>
      <button onClick={() => setShowBackfill(true)} className="px-3 py-2 rounded border border-primary text-primary text-sm">
        {t('settings.accounting.runBackfill', 'Run Backfill')}
      </button>
    </div>
  </div>
)}

{showBackfill && <BackfillModal onClose={() => setShowBackfill(false)} />}
```

- [ ] **Step 4: Commit**

```
git add client/src/pages/settings/SettingsPage.tsx
git commit -m "feat(client): SettingsPage — accountingMode radio + Setup/Backfill buttons"
```

---

### Task I4: PaymentsPage — Reverse button

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\pages\payments\PaymentsPage.tsx`

- [ ] **Step 1: Add import + state**

```tsx
import ReversePaymentDialog from '../accounting/ReversePaymentDialog';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { FeatureFlag } from '@hotel/shared';

// inside the component:
const { data: flags } = useFeatureFlags();
const [reversingId, setReversingId] = useState<number | null>(null);
```

- [ ] **Step 2: Add a Reverse button to each POSTED payment row** (find the payment row JSX; add at the end of the action cell):

```tsx
{flags?.[FeatureFlag.ACCOUNTING] && payment.status === 'PAID' && payment.postedEntryId && (
  <button onClick={() => setReversingId(payment.id)} className="text-error text-xs ltr:ml-2 rtl:mr-2">
    Reverse
  </button>
)}
```

- [ ] **Step 3: Render dialog at component bottom**

```tsx
{reversingId && (
  <ReversePaymentDialog
    paymentId={reversingId}
    onClose={() => setReversingId(null)}
    onSuccess={() => qc.invalidateQueries({ queryKey: ['payments'] })}
  />
)}
```

(Replace `qc` with the actual `useQueryClient()` reference in the file; or invalidate by whatever key the page uses.)

Also add a visual `REVERSED` pill for reversed payments — reuse the status pill component if it exists, or add a conditional class.

- [ ] **Step 4: Commit**

```
git add client/src/pages/payments/PaymentsPage.tsx
git commit -m "feat(client): Reverse button + REVERSED visual on PaymentsPage"
```

---

### Task I5: Booking form tax-code dropdown

**Files:**
- Modify: the booking form component (find via search — likely `client/src/pages/bookings/BookingsPage.tsx` or a nested modal component).

- [ ] **Step 1: Find the form**

```
cd "D:\Hotel Apartment Management System" && grep -rn "totalAmount" client/src/pages/bookings/ --include="*.tsx" | head -5
```

- [ ] **Step 2: Add tax-code dropdown**

In the booking-create form (only render when `FEATURE_ACCOUNTING` is on):

```tsx
import { useQuery } from '@tanstack/react-query';
import { taxCodesApi } from '../../lib/api/accounting-phase2';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { FeatureFlag } from '@hotel/shared';

// inside the form component:
const { data: flags } = useFeatureFlags();
const accountingOn = !!flags?.[FeatureFlag.ACCOUNTING];
const { data: taxCodes = [] } = useQuery({
  queryKey: ['accounting', 'tax-codes'],
  queryFn: taxCodesApi.list,
  enabled: accountingOn,
});

// in JSX, near other booking fields:
{accountingOn && taxCodes.length > 0 && (
  <label className="block text-sm mb-2">
    Tax code (defaults to system default)
    <select value={taxCodeId ?? ''} onChange={(e) => setTaxCodeId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
      <option value="">— system default —</option>
      {taxCodes.filter((tc) => tc.isActive).map((tc) => (
        <option key={tc.id} value={tc.id}>{tc.code} ({tc.ratePct}%)</option>
      ))}
    </select>
  </label>
)}
```

Include `taxCodeId` in the POST body when the form submits.

- [ ] **Step 3: Commit**

```
git add client/src/pages/bookings/
git commit -m "feat(client): booking form tax-code dropdown (when FEATURE_ACCOUNTING)"
```

---

### Task I6: i18n EN + AR

**Files:**
- Modify: `client/src/i18n/locales/en/translation.json`
- Modify: `client/src/i18n/locales/ar/translation.json`

- [ ] **Step 1: Merge into existing JSON files** (don't clobber Phase 1 keys)

**English** keys to add:

```json
{
  "nav": {
    "accountingMapping": "Account Mapping",
    "accountingVAT": "VAT Return"
  },
  "accounting": {
    "mapping": { "title": "Account Mapping" },
    "vat":     { "title": "VAT Return" },
    "taxCodes": { "title": "Tax Codes", "new": "New Tax Code" }
  },
  "settings": {
    "accounting": {
      "modeTitle": "Accounting mode",
      "modeHelp": "Cash basis posts revenue when payment is received. Accrual posts revenue when the booking is created and clears AR when payment is received. Switching modes does not affect historical entries.",
      "cash": "Cash basis",
      "accrual": "Accrual basis",
      "runSetup": "Run Setup",
      "runBackfill": "Run Backfill"
    }
  }
}
```

**Arabic** equivalents:

```json
{
  "nav": {
    "accountingMapping": "ربط الحسابات",
    "accountingVAT": "إقرار ضريبة القيمة المضافة"
  },
  "accounting": {
    "mapping": { "title": "ربط الحسابات" },
    "vat":     { "title": "إقرار ضريبة القيمة المضافة" },
    "taxCodes": { "title": "أكواد الضريبة", "new": "كود ضريبة جديد" }
  },
  "settings": {
    "accounting": {
      "modeTitle": "نمط المحاسبة",
      "modeHelp": "النقدي يسجل الإيراد عند استلام الدفع. الاستحقاق يسجل الإيراد عند إنشاء الحجز ويصفي الذمم عند استلام الدفع. تغيير النمط لا يؤثر على القيود السابقة.",
      "cash": "النقدي",
      "accrual": "الاستحقاق",
      "runSetup": "تشغيل الإعداد",
      "runBackfill": "ترحيل البيانات السابقة"
    }
  }
}
```

- [ ] **Step 2: Commit**

```
git add client/src/i18n/locales
git commit -m "feat(i18n): English and Arabic translations for accounting Phase 2"
```

---

# Section J — Docs

### Task J1: BRD v2.2

**Files:**
- Modify: `D:\Hotel Apartment Management System\Hotel_Apartment_BRD.md`

- [ ] **Step 1: Bump version line**

Replace `**Version:** 2.1 ...` with:

```
**Version:** 2.2 — Updated 2026-05-17 — Accounting module Phase 2 (auto-posting, VAT, deposits, reversal, backfill)
```

- [ ] **Step 2: Add §4.11**

After §4.10:

```markdown
### 4.11 Accounting Module (Phase 2)

- **Auto-posting** of Payments and Bookings to the GL via PostingService. Trigger semantics are configurable via the `accountingMode` setting:
  - **CASH (default):** A Payment becoming PAID posts a JE (Cash/Bank debit, Revenue net credit, VAT credit if applicable).
  - **ACCRUAL:** Booking creation posts AR/Revenue/VAT. A Payment becoming PAID clears AR.
- **VAT (tax-inclusive)** with banker's rounding. Each Booking carries a `taxCodeId` defaulting to the system default. Tax codes seeded: `VAT_STANDARD` (5%, default), `VAT_ZERO`, `VAT_EXEMPT`.
- **Account mapping** in a dedicated `AccountMapping` table: 8 keys (CASH_METHOD, CARD_METHOD, INSTALLMENT_METHOD, AR_DEFAULT, REVENUE_DEFAULT, DEPOSIT_LIABILITY, DEPOSIT_FORFEIT_INCOME, VAT_PAYABLE). Editable via Account Mapping page.
- **Deposit lifecycle** auto-posted on transitions: NONE→HELD (collect), HELD→RELEASED (full refund), HELD→FORFEITED (partial or zero refund — splits cash refund and forfeit income).
- **Payment reversal**: a `REVERSED` PaymentStatus + a balancing JE referencing the original.
- **Backfill tool** to retroactively post historical Payments and Bookings.
- **VAT return report** grouping output and input VAT by tax code over a period; CSV export.

Posting calls participate in the parent transaction so operational write and GL entry are atomic. Period close and reversal of manual JEs are scoped to Phase 3.
```

- [ ] **Step 3: Commit**

```
git add Hotel_Apartment_BRD.md
git commit -m "docs(brd): v2.2 — accounting module Phase 2"
```

---

### Task J2: Manual test plan §20

**Files:**
- Modify: `D:\Hotel Apartment Management System\docs\manual-test-plan.md`

- [ ] **Step 1: Append §20**

```markdown

## 20. Accounting Module (Phase 2)

**Prerequisites:** Phase 1 complete and `FEATURE_ACCOUNTING=true`. Log in as ADMIN.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 20.1 | Run Setup from a clean Phase 1 state | Settings → Accounting → Run Setup | Creates 2 new accounts (2100, 4020), 3 tax codes, 8 mappings. unmappedKeys is empty. |
| 20.2 | Account Mapping page shows all 8 rows mapped | Visit `/accounting/mapping` | All rows show codes; no red banner. |
| 20.3 | Set custom mapping | Click Change on CASH_METHOD, pick a different Asset account, save | Mapping updates; banner clear. |
| 20.4 | Cash payment auto-posts | Create a CASH payment for 1050 on a booking tagged VAT_STANDARD | Payment row shows postedEntryId set. JE has 3 lines (Cash 1050 debit, Revenue 1000 credit, VAT Payable 50 credit). |
| 20.5 | Switch to ACCRUAL mode and create a Booking | Settings → Accrual basis; create new Booking 10500 | Booking has revenuePostedEntryId set; JE shows AR 10500 / Revenue 10000 / VAT 500. |
| 20.6 | Mark an installment PAID in ACCRUAL mode | Mark a PENDING installment as PAID | New JE: Cash debit, AR credit, no VAT (already recognized at booking). |
| 20.7 | Deposit collection auto-posts | Booking with depositAmount=500, status HELD | depositPostedEntryId set; JE Cash debit / Deposit Liability credit. |
| 20.8 | Checkout with full refund (RELEASED) | Checkout with depositRefundAmount === depositAmount | JE Deposit Liability debit / Cash credit. |
| 20.9 | Checkout with zero refund (FORFEITED) | Checkout with depositRefundAmount = 0 | JE Deposit Liability debit / Forfeit Income credit. |
| 20.10 | Checkout with partial refund (FORFEITED) | Checkout with depositRefundAmount = 200 (deposit was 500) | JE 3 lines: Deposit Liability 500 debit / Cash 200 credit / Forfeit Income 300 credit. |
| 20.11 | Reverse a paid payment | On a POSTED payment, click Reverse, confirm | Payment status REVERSED; new JE (reversal of JE-NNNNNN) with swapped lines. Outstanding balance updates. |
| 20.12 | Run Backfill | Settings → Run Backfill (no fromDate) | Summary shows processed > 0. Subsequent run shows processed = 0. |
| 20.13 | VAT Return for current period | Visit `/accounting/vat-return` | Output VAT totals match the sum of VAT_PAYABLE credits in the period. Net VAT Due = Output − Input. |
| 20.14 | Setup is admin-only | Log in as FINANCE; visit Settings → Run Setup | Button is hidden / 403 returned from API. |
| 20.15 | Backfill is admin-only | Log in as FINANCE | Same as above. |
| 20.16 | Posting failure rolls back the operation | Delete REVENUE_DEFAULT mapping; create a CASH+PAID payment | Payment creation returns 400 MAPPING_MISSING; no Payment row left in DB. |
| 20.17 | Arabic RTL | Switch to Arabic; visit mapping and VAT return pages | Layout mirrors correctly. |
```

- [ ] **Step 2: Commit**

```
git add docs/manual-test-plan.md
git commit -m "docs: add §20 manual test plan for accounting Phase 2"
```

---

# Section K — Final integration

### Task K1: Full sweep + smoke test

- [ ] **Step 1: Run full server test suite**

```
cd server && npx vitest run
```

Expected: all tests pass (existing Phase 1 + Phase 2 additions). If any regression, READ the failure and fix the underlying issue — don't modify tests.

- [ ] **Step 2: Client typecheck**

```
cd client && npx tsc --noEmit
```

Expected: only the pre-existing LoginPage error from before — no new errors from Phase 2.

- [ ] **Step 3: Start dev servers and walk the happy path**

In one terminal: `cd server && npm run dev`. In another: `cd client && npm run dev`. With `FEATURE_ACCOUNTING=true` in `server/.env`:

1. Log in as ADMIN.
2. Settings → Accounting → Run Setup. Verify 16 accounts (14 starter + VAT Payable + Forfeit Income), 3 tax codes, 8 mappings.
3. Visit `/accounting/mapping`. Verify all 8 rows show codes; no red banner.
4. Create a CASH payment for 1050 on a booking; verify JE auto-posted with 3 lines.
5. Switch to ACCRUAL mode; create a new Booking 10500; verify AR posted with 3 lines.
6. In ACCRUAL mode, mark an installment PAID; verify Cash/AR JE posted.
7. Create a booking with deposit 500, status HELD; verify deposit JE.
8. Checkout with full refund; verify release JE.
9. Reverse a paid payment; verify reversing JE.
10. Visit `/accounting/vat-return` for the month; verify totals.
11. Switch to Arabic; re-walk steps 3–6; verify RTL.

- [ ] **Step 4: Run manual test plan §20** end-to-end.

- [ ] **Step 5: Final commit (only if smoke test surfaced small fixes)**

```
git add -p
git commit -m "fix(accounting): address issues found during Phase 2 smoke test"
```

---

## Done

Phase 2 ships with:

- `FEATURE_ACCOUNTING` already on from Phase 1 — Phase 2 dormant until user runs Setup.
- Existing Payment / Booking flows unchanged for systems without setup (auto-posting silently no-ops if mappings are empty).
- Auto-posting becomes active the moment mappings are populated.
- Posting calls participate in operational transactions: partial state is impossible.
- 41 new tests, 282 total passing (estimated).

Phase 3 (financial statements + period close) is unblocked because: AccountMapping pattern is proven; `taxCodeId` lineage exists for income-statement breakdowns; ACCRUAL path is exercised by real users; reversal infrastructure exists to layer onto manual entries.

---

## Self-review notes

**Spec coverage:**

- [x] AccountMapping table — Task A2, B2 (service), E1 (controller), H2 (UI)
- [x] TaxCode table + default flag — Task A2, E2 (controller), H2 (UI)
- [x] accountingMode setting — Task A2 (schema), I3 (Settings UI)
- [x] PostingService.postFromPayment (CASH + ACCRUAL) — Task C1
- [x] PostingService.postFromBookingCreated — Task C2
- [x] PostingService.postFromDepositTransition (all 4 cases) — Task C3
- [x] PostingService.reversePayment — Task C4
- [x] Backfill — Task D3 (service), E4 (controller)
- [x] Setup — Task D1
- [x] VAT return — Task D2 (service), E5 (controller), H3 (UI)
- [x] REVERSED status — Task A1 (shared), A2 (Prisma), F1 (controller uses)
- [x] Posting back-pointers — Task A2
- [x] taxCodeId on Booking — Task A2, I5 (form)
- [x] Tax-inclusive split with banker's rounding — Task B1
- [x] Transaction passthrough — Tasks C1–C4, F1–F2
- [x] mapAccountingError extended for new codes — Task F1 (inline pattern)
- [x] Auto-posting silently no-op if mapping empty — Task F1, F2 (hasMapping guard)
- [x] Sidebar 2 new entries — Task I2
- [x] App.tsx 2 new routes — Task I1
- [x] i18n EN+AR — Task I6
- [x] BRD v2.2 + manual test plan §20 — Tasks J1, J2

**Placeholder scan:** no TBDs, no "implement later". Section G3 lightly defers test detail to the implementer pattern ("follow the existing supertest pattern") — acceptable because the existing Phase 1 tests are the literal template.

**Type consistency:**
- `MappingKey` defined in shared (Task A1), used in MappingService (B2), seeds (D1), controller (E1), API client (H1). Consistent.
- `AccountingMode` defined in shared (A1), Prisma (A2), used in posting service (C1, C2), settings UI (I3). Consistent.
- `postFromPayment` / `postFromBookingCreated` / `postFromDepositTransition` / `reversePayment` signatures stable across declaration (C1–C4) and call sites (F1, F2, E3, D3). Consistent.
- Optional `tx` parameter pattern applied to all five new methods + extended on the four existing primitives (createDraft, updateDraft, deleteDraft, post, createAndPost). Documented in Task C1.
