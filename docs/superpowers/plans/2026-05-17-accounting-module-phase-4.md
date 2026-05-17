# Accounting Module — Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship bank reconciliation — the final phase of the accounting module. Multi-bank-account model, flexible CSV import, auto+manual N-to-1 matching, session-based reconciliation with locked close, inline adjustments that respect the Phase 3 period-lock guard.

**Architecture:** Three new bank-side tables (BankAccount, BankStatement, BankStatementLine) carry imported reference data. Two new ledger-side tables (Reconciliation, ReconciliationMatch) link bank lines to JournalLine rows. New `MatchingService` is the sole writer to `ReconciliationMatch`; new `BankStatementService` is the sole writer to `BankStatement`/`BankStatementLine`. Inline adjustments delegate to existing `PostingService.postExpense` so the period-lock guard from Phase 3 is inherited.

**Tech Stack:** Node 20, TypeScript 5, Express 4, Prisma 5, Postgres, multer (existing upload middleware), Vitest + supertest. React 18 + Vite + React Query + react-i18next. Existing Phases 1–3 accounting infrastructure.

**Spec:** `docs/superpowers/specs/2026-05-17-accounting-phase-4-design.md`

**Pre-state:**
- Phases 1, 2, 3 merged to master. 345 server tests passing.
- `PostingService.postExpense` exists (Phase 3) and respects period-lock via `ensurePeriodOpen`.
- `upload.middleware.ts` exists from Wave 3B (attachments). Reusable for CSV.
- `Decimal(14, 2)` is the established money precision.

---

## File map

**Created (server):**
- `server/prisma/migrations/<timestamp>_accounting_phase4/migration.sql`
- `server/src/services/accounting/csv-parser.ts` + `.test.ts`
- `server/src/services/accounting/bank-statement.service.ts` + `.test.ts`
- `server/src/services/accounting/matching.service.ts` + `.test.ts`
- `server/src/controllers/accounting-bank-accounts.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-bank-statements.controller.ts` + `.test.ts`
- `server/src/controllers/accounting-reconciliations.controller.ts` + `.test.ts`

**Modified (server):**
- `shared/index.ts` — add 5 new error codes; `ReconciliationStatus` enum
- `server/prisma/schema.prisma` — 5 new tables + back-relations
- `server/src/routes/accounting.routes.ts` — mount new routes

**Created (client):**
- `client/src/lib/api/accounting-phase4.ts`
- `client/src/pages/accounting/BankingPage.tsx`
- `client/src/pages/accounting/BankAccountDetailPage.tsx`
- `client/src/pages/accounting/CsvImportWizard.tsx`
- `client/src/pages/accounting/NewReconciliationModal.tsx`
- `client/src/pages/accounting/ReconciliationPage.tsx`

**Modified (client):**
- `client/src/App.tsx` — 3 new routes
- `client/src/components/layout/Sidebar.tsx` — 1 nav item
- `client/src/i18n/locales/en/translation.json`, `ar/translation.json`

**Modified (docs):**
- `Hotel_Apartment_BRD.md` → v2.4
- `docs/manual-test-plan.md` → §22

---

## Conventions for all tasks

- Server controllers use `try { ... } catch (err) { next(err); }` + `mapAccountingError` (existing helper) for known error codes.
- Server tests use real Postgres via `TEST_DATABASE_URL`; `signToken({ id, role, assignedBuildingId: null })` for cookies.
- Money: `Prisma.Decimal` end-to-end on server; stringified in JSON responses.
- Branch: `feat/accounting-phase-4`. Do NOT work on master.
- Accounting routes inherit `requireRole(SUPER_ADMIN, ADMIN, FINANCE)`; admin-only endpoints use the existing `adminOnly` middleware.

---

# Section A — Shared types, schema, migration

### Task A1: Branch + shared types

**Files:**
- Modify: `D:\Hotel Apartment Management System\shared\index.ts`

- [ ] **Step 1: Create feature branch**

```
git checkout master
git checkout -b feat/accounting-phase-4
git status
```

Expected: clean tree on `feat/accounting-phase-4`.

- [ ] **Step 2: Extend `AccountingErrorCode` union**

Find the existing union (currently 11 codes after Phase 3) and replace with:

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
  | 'ALREADY_CLOSED'
  | 'BANK_ACCOUNT_NOT_FOUND'
  | 'BANK_STATEMENT_INVALID'
  | 'RECONCILIATION_CLOSED'
  | 'RECONCILIATION_UNBALANCED'
  | 'LINE_ALREADY_MATCHED';
```

- [ ] **Step 3: Append new enum at end of file**

```ts
export enum ReconciliationStatus {
  OPEN = 'OPEN',
  LOCKED = 'LOCKED',          // NOTE: keep the Prisma value name in sync (CLOSED on server side)
}
```

Wait — re-check the spec. The spec used `OPEN` / `CLOSED`. Use `CLOSED`:

```ts
export enum ReconciliationStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}
```

- [ ] **Step 4: Commit**

```
git add shared/index.ts
git commit -m "feat(shared): Phase 4 accounting types — ReconciliationStatus, 5 new error codes"
```

---

### Task A2: Prisma schema additions

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\prisma\schema.prisma`

- [ ] **Step 1: Read the current schema to find existing model positions.**

- [ ] **Step 2: Append the new enum (after the existing `enum FiscalPeriodStatus`)**

```prisma
enum ReconciliationStatus {
  OPEN
  CLOSED
}
```

- [ ] **Step 3: Append 5 new models (BEFORE existing `model SystemSettings`)**

```prisma
model BankAccount {
  id            Int      @id @default(autoincrement())
  name          String
  accountId     Int      @unique
  isActive      Boolean  @default(true)

  csvDateColumn        Int?
  csvAmountColumn      Int?
  csvDescriptionColumn Int?
  csvReferenceColumn   Int?
  csvHasHeader         Boolean  @default(true)
  csvDateFormat        String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   Int?
  updatedBy   Int?

  account     Account              @relation(fields: [accountId], references: [id], onDelete: Restrict)
  statements  BankStatement[]
  reconciliations Reconciliation[]
  creator     User?    @relation("BankAccountCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater     User?    @relation("BankAccountUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
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
  bankAccountId   Int
  date            DateTime
  amount          Decimal  @db.Decimal(14, 2)
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

  @@unique([reconciliationId, journalLineId])
  @@index([bankStatementLineId])
}
```

- [ ] **Step 4: Add back-relations on existing models**

In `model JournalLine { ... }`, add:
```prisma
  reconciliationMatches ReconciliationMatch[]
```

In `model Account { ... }`, add:
```prisma
  bankAccounts BankAccount[]
```

In `model User { ... }`, in the back-relations section, add:
```prisma
  createdBankAccounts          BankAccount[]         @relation("BankAccountCreatedBy")
  updatedBankAccounts          BankAccount[]         @relation("BankAccountUpdatedBy")
  importedBankStatements       BankStatement[]       @relation("BankStatementImportedBy")
  closedReconciliations        Reconciliation[]      @relation("ReconciliationClosedBy")
  createdReconciliations       Reconciliation[]      @relation("ReconciliationCreatedBy")
  updatedReconciliations       Reconciliation[]      @relation("ReconciliationUpdatedBy")
  createdReconciliationMatches ReconciliationMatch[] @relation("ReconciliationMatchCreatedBy")
```

- [ ] **Step 5: Format and verify**

```
cd server
npx prisma format
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add server/prisma/schema.prisma
git commit -m "feat(db): Phase 4 schema — BankAccount, BankStatement, BankStatementLine, Reconciliation, ReconciliationMatch"
```

---

### Task A3: Migration

- [ ] **Step 1: Generate migration**

```
cd server
npx prisma migrate dev --name accounting_phase4 --create-only
```

Expected: new folder `server/prisma/migrations/<timestamp>_accounting_phase4/migration.sql`.

- [ ] **Step 2: Apply to dev DB**

```
cd server
npx prisma migrate dev
```

Expected: applies; client regenerates.

- [ ] **Step 3: Apply to test DB**

```
cd server
DATABASE_URL="postgresql://hotel:hotel123@localhost:5433/hotel_test" npx prisma migrate deploy
```

Expected: "All migrations have been successfully applied."

- [ ] **Step 4: Sanity-check**

```
docker exec hotelapartmentmanagementsystem-postgres-1 psql -U hotel -d hotel_dev -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'Bank%' OR table_name LIKE 'Reconciliation%' ORDER BY table_name;"
docker exec hotelapartmentmanagementsystem-postgres-1 psql -U hotel -d hotel_dev -c "SELECT enum_range(NULL::\"ReconciliationStatus\");"
docker exec hotelapartmentmanagementsystem-postgres-test-1 psql -U hotel -d hotel_test -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'Bank%' OR table_name LIKE 'Reconciliation%' ORDER BY table_name;"
```

Expected: 5 tables on both DBs; enum range `{OPEN,CLOSED}`.

- [ ] **Step 5: Commit**

```
git add server/prisma/migrations
git commit -m "feat(db): migration for accounting Phase 4"
```

---

# Section B — CSV parser + BankStatementService

### Task B1: CSV parser (TDD)

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\csv-parser.ts`
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\csv-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `csv-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv-parser';

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a','b','c'], ['1','2','3']]);
  });

  it('handles quoted fields with embedded commas', () => {
    expect(parseCsv('a,"b,c",d\n')).toEqual([['a','b,c','d']]);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    expect(parseCsv('a,"b""c",d\n')).toEqual([['a','b"c','d']]);
  });

  it('strips BOM from file start', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual([['a','b'], ['1','2']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a','b'], ['1','2']]);
  });

  it('handles trailing line without newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a','b'], ['1','2']]);
  });

  it('filters out fully-empty rows', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a','b'], ['1','2']]);
  });

  it('parses a realistic UAE bank export', () => {
    const csv =
      'Date,Description,Amount,Reference\n' +
      '01/05/2026,"Rent payment, Apt 1",1050.00,REF-001\n' +
      '03/05/2026,Bank fee,-25.00,\n';
    expect(parseCsv(csv)).toEqual([
      ['Date','Description','Amount','Reference'],
      ['01/05/2026','Rent payment, Apt 1','1050.00','REF-001'],
      ['03/05/2026','Bank fee','-25.00',''],
    ]);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
cd server && npx vitest run src/services/accounting/csv-parser.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `csv-parser.ts`**

```ts
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  const t = text.replace(/^﻿/, '');

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); field = ''; rows.push(cur); cur = []; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.length > 0 && r.some((f) => f.length > 0));
}
```

- [ ] **Step 4: Run — expect 8/8 pass**

```
cd server && npx vitest run src/services/accounting/csv-parser.test.ts
```

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/csv-parser.ts server/src/services/accounting/csv-parser.test.ts
git commit -m "feat(accounting): tiny in-house CSV parser (handles quotes, BOM, CRLF)"
```

---

### Task B2: Date format parser helper

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\csv-parser.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\csv-parser.test.ts`

- [ ] **Step 1: Add failing tests for `parseDate`**

Append to `csv-parser.test.ts`:

```ts
import { parseDate } from './csv-parser';

describe('parseDate', () => {
  it('parses DD/MM/YYYY', () => {
    const d = parseDate('15/05/2026', 'DD/MM/YYYY');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4); // May = index 4
    expect(d.getUTCDate()).toBe(15);
  });

  it('parses MM/DD/YYYY', () => {
    const d = parseDate('05/15/2026', 'MM/DD/YYYY');
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(15);
  });

  it('parses YYYY-MM-DD', () => {
    const d = parseDate('2026-05-15', 'YYYY-MM-DD');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(15);
  });

  it('parses YY with 20xx prefix', () => {
    const d = parseDate('15/05/26', 'DD/MM/YY');
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it('throws on unparseable string', () => {
    expect(() => parseDate('not a date', 'YYYY-MM-DD')).toThrow();
  });

  it('throws on mismatched format', () => {
    expect(() => parseDate('15/05/2026', 'YYYY-MM-DD')).toThrow();
  });
});
```

- [ ] **Step 2: Add `parseDate` implementation to `csv-parser.ts`**

```ts
export function parseDate(value: string, format: string): Date {
  const tokens = /YYYY|YY|MM|DD/g;
  const literals = format.split(tokens).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const ts = format.match(tokens) ?? [];

  const patternParts: string[] = [];
  for (let i = 0; i < ts.length; i++) {
    patternParts.push(literals[i] ?? '');
    if (ts[i] === 'YYYY') patternParts.push('(\\d{4})');
    else if (ts[i] === 'YY') patternParts.push('(\\d{2})');
    else if (ts[i] === 'MM') patternParts.push('(\\d{1,2})');
    else if (ts[i] === 'DD') patternParts.push('(\\d{1,2})');
  }
  patternParts.push(literals[ts.length] ?? '');
  const re = new RegExp('^' + patternParts.join('') + '$');
  const m = value.trim().match(re);
  if (!m) throw new Error(`Date "${value}" does not match format "${format}"`);

  let year = 0, month = 0, day = 0;
  for (let i = 0; i < ts.length; i++) {
    const v = Number(m[i + 1]);
    if (ts[i] === 'YYYY') year = v;
    else if (ts[i] === 'YY') year = 2000 + v;
    else if (ts[i] === 'MM') month = v;
    else if (ts[i] === 'DD') day = v;
  }
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Date "${value}" out of range`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}
```

- [ ] **Step 3: Run — expect 6/6 new pass**

- [ ] **Step 4: Commit**

```
git add server/src/services/accounting/csv-parser.ts server/src/services/accounting/csv-parser.test.ts
git commit -m "feat(accounting): parseDate helper for CSV date columns (YYYY/YY/MM/DD tokens)"
```

---

### Task B3: BankStatementService (TDD)

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\bank-statement.service.ts`
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\bank-statement.service.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BankStatementService } from './bank-statement.service';
import { AccountingError } from './posting.errors';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let userId: number;
let bankAccountId: number;
let bankGlAccountId: number;

const SAMPLE_CSV =
  'Date,Description,Amount,Reference\n' +
  '01/05/2026,Rent Apt 1,1050.00,REF-001\n' +
  '03/05/2026,Bank fee,-25.00,REF-002\n';

beforeAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'bss@test.local' } });

  const u = await db.user.create({ data: { name: 'BS', email: 'bss@test.local', password: 'x', role: 'ADMIN' } });
  userId = u.id;

  const acc = await db.account.create({ data: { code: '1020', name: 'Bank', type: 'ASSET' } });
  bankGlAccountId = acc.id;
  const ba = await db.bankAccount.create({
    data: {
      name: 'Main Checking',
      accountId: bankGlAccountId,
      csvDateColumn: 0,
      csvDescriptionColumn: 1,
      csvAmountColumn: 2,
      csvReferenceColumn: 3,
      csvHasHeader: true,
      csvDateFormat: 'DD/MM/YYYY',
    },
  });
  bankAccountId = ba.id;
});

afterAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'bss@test.local' } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
});

const svc = () => new BankStatementService(db as any);

describe('BankStatementService.preview', () => {
  it('returns sample rows and column count without persisting', async () => {
    const r = await svc().preview(SAMPLE_CSV);
    expect(r.columnCount).toBe(4);
    expect(r.sampleRows.length).toBe(3); // header + 2 rows
    expect(r.sampleRows[1][0]).toBe('01/05/2026');
    expect(await db.bankStatement.count()).toBe(0);
  });
});

describe('BankStatementService.import', () => {
  it('persists statement + lines when mapping is set', async () => {
    const result = await svc().import(bankAccountId, 'main-may.csv', SAMPLE_CSV, userId);
    expect(result.lineCount).toBe(2);
    const lines = await db.bankStatementLine.findMany({ where: { bankStatementId: result.statementId }, orderBy: { date: 'asc' } });
    expect(lines).toHaveLength(2);
    expect(lines[0].amount.toFixed(2)).toBe('1050.00');
    expect(lines[1].amount.toFixed(2)).toBe('-25.00');
    expect(lines[0].description).toBe('Rent Apt 1');
    expect(lines[0].reference).toBe('REF-001');
  });

  it('throws BANK_STATEMENT_INVALID when mapping is unset', async () => {
    const newAcc = await db.bankAccount.create({
      data: { name: 'Unmapped', accountId: (await db.account.create({ data: { code: '1099', name: 'X', type: 'ASSET' } })).id },
    });
    await expect(svc().import(newAcc.id, 'x.csv', SAMPLE_CSV, userId))
      .rejects.toMatchObject({ code: 'BANK_STATEMENT_INVALID' });
    await db.bankAccount.delete({ where: { id: newAcc.id } });
  });

  it('throws BANK_STATEMENT_INVALID with row number on parse failure (atomic)', async () => {
    const bad =
      'Date,Description,Amount,Reference\n' +
      '01/05/2026,Good,100.00,\n' +
      'bad-date,Bad,200.00,\n';
    await expect(svc().import(bankAccountId, 'bad.csv', bad, userId))
      .rejects.toMatchObject({ code: 'BANK_STATEMENT_INVALID', details: { row: 2 } });
    expect(await db.bankStatement.count()).toBe(0); // atomic rollback
  });
});
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Implement `bank-statement.service.ts`**

```ts
import { PrismaClient, Prisma } from '@prisma/client';
import { parseCsv, parseDate } from './csv-parser';
import { AccountingError } from './posting.errors';

export type PreviewResult = {
  columnCount: number;
  sampleRows: string[][];
};

export class BankStatementService {
  constructor(private readonly prisma: PrismaClient) {}

  async preview(csvText: string): Promise<PreviewResult> {
    const rows = parseCsv(csvText);
    const sample = rows.slice(0, 20);
    return {
      columnCount: rows[0]?.length ?? 0,
      sampleRows: sample,
    };
  }

  async import(
    bankAccountId: number,
    filename: string,
    csvText: string,
    userId: number,
  ): Promise<{ statementId: number; lineCount: number; dateRange: { from: string; to: string } }> {
    const ba = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!ba) throw new AccountingError('BANK_ACCOUNT_NOT_FOUND', `BankAccount ${bankAccountId} not found`);
    if (ba.csvDateColumn === null || ba.csvAmountColumn === null || ba.csvDescriptionColumn === null || !ba.csvDateFormat) {
      throw new AccountingError('BANK_STATEMENT_INVALID', 'CSV mapping not configured', { bankAccountId });
    }

    const rows = parseCsv(csvText);
    const dataRows = ba.csvHasHeader ? rows.slice(1) : rows;

    const parsed: { date: Date; amount: Prisma.Decimal; description: string; reference: string | null }[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        const dateStr = row[ba.csvDateColumn!];
        const amtStr = row[ba.csvAmountColumn!];
        const descStr = row[ba.csvDescriptionColumn!];
        const refStr = ba.csvReferenceColumn !== null ? row[ba.csvReferenceColumn] : null;
        if (!dateStr || !amtStr) {
          throw new Error(`Missing date or amount in row ${i + 1}`);
        }
        const date = parseDate(dateStr, ba.csvDateFormat!);
        const amount = new Prisma.Decimal(amtStr.replace(/,/g, ''));
        parsed.push({
          date,
          amount,
          description: descStr ?? '',
          reference: refStr || null,
        });
      } catch (err: any) {
        throw new AccountingError('BANK_STATEMENT_INVALID', `Row ${i + 1}: ${err.message}`, { row: i + 1 });
      }
    }

    if (parsed.length === 0) {
      throw new AccountingError('BANK_STATEMENT_INVALID', 'CSV has no data rows');
    }

    return this.prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: {
          bankAccountId,
          filename,
          importedBy: userId,
          lineCount: parsed.length,
        },
      });
      await tx.bankStatementLine.createMany({
        data: parsed.map((p) => ({
          bankStatementId: statement.id,
          bankAccountId,
          date: p.date,
          amount: p.amount,
          description: p.description,
          reference: p.reference,
        })),
      });
      const dates = parsed.map((p) => p.date).sort((a, b) => a.getTime() - b.getTime());
      return {
        statementId: statement.id,
        lineCount: parsed.length,
        dateRange: { from: dates[0].toISOString(), to: dates[dates.length - 1].toISOString() },
      };
    });
  }
}
```

- [ ] **Step 4: Run — expect 4/4 new pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/bank-statement.service.ts server/src/services/accounting/bank-statement.service.test.ts
git commit -m "feat(accounting): BankStatementService — preview + atomic import with row-level errors"
```

---

# Section C — MatchingService

### Task C1: MatchingService — auto-match + manual match (TDD)

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\matching.service.ts`
- Create: `D:\Hotel Apartment Management System\server\src\services\accounting\matching.service.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { MatchingService } from './matching.service';
import { PostingService } from './posting.service';
import { AccountingError } from './posting.errors';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);

let userId: number;
let bankGlId: number;
let revenueId: number;
let bankAccountId: number;
let reconciliationId: number;

beforeAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.fiscalPeriod.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'match@test.local' } });

  const u = await db.user.create({ data: { name: 'M', email: 'match@test.local', password: 'x', role: 'ADMIN' } });
  userId = u.id;

  const bank = await db.account.create({ data: { code: '1020', name: 'Bank', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  bankGlId = bank.id;
  revenueId = rev.id;

  const ba = await db.bankAccount.create({
    data: { name: 'Main', accountId: bankGlId, csvDateFormat: 'DD/MM/YYYY' },
  });
  bankAccountId = ba.id;

  const rec = await db.reconciliation.create({
    data: { bankAccountId, endDate: new Date('2026-05-31'), statementBalance: '0' },
  });
  reconciliationId = rec.id;
});

afterAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.fiscalPeriod.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'match@test.local' } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.reconciliationMatch.deleteMany();
});

const svc = () => new MatchingService(db as any);

async function postBankDeposit(amount: string, date: Date) {
  return posting.createAndPost(
    {
      date,
      lines: [
        { accountId: bankGlId, debit: amount },
        { accountId: revenueId, credit: amount },
      ],
    },
    userId,
  );
}

async function createBankLine(amount: string, date: Date, description = 'test') {
  const statement = await db.bankStatement.findFirst() ?? await db.bankStatement.create({
    data: { bankAccountId, filename: 'test.csv', importedBy: userId, lineCount: 0 },
  });
  return db.bankStatementLine.create({
    data: { bankStatementId: statement.id, bankAccountId, date, amount, description },
  });
}

describe('MatchingService.findAutoMatches', () => {
  it('finds exact 1-to-1 matches within date window', async () => {
    const date = new Date('2026-05-15');
    const entry = await postBankDeposit('1050', date);
    const bankLine = await createBankLine('1050', date);

    const matches = await svc().findAutoMatches(reconciliationId);
    expect(matches).toHaveLength(1);
    expect(matches[0].bankStatementLineId).toBe(bankLine.id);
  });

  it('skips ambiguous matches (multiple GL candidates)', async () => {
    const date = new Date('2026-05-16');
    await postBankDeposit('500', date);
    await postBankDeposit('500', date);
    await createBankLine('500', date);

    const matches = await svc().findAutoMatches(reconciliationId);
    expect(matches).toHaveLength(0);
  });

  it('respects sign — withdrawal matches a credit', async () => {
    const date = new Date('2026-05-17');
    await posting.createAndPost(
      {
        date,
        lines: [
          { accountId: revenueId, debit: '50' },
          { accountId: bankGlId, credit: '50' },
        ],
      },
      userId,
    );
    await createBankLine('-50', date);

    const matches = await svc().findAutoMatches(reconciliationId);
    expect(matches).toHaveLength(1);
  });
});

describe('MatchingService.applyAutoMatches', () => {
  it('persists all auto-matches in one call', async () => {
    const date = new Date('2026-05-18');
    await postBankDeposit('200', date);
    await createBankLine('200', date);
    const before = await db.reconciliationMatch.count();
    const count = await svc().applyAutoMatches(reconciliationId, userId);
    expect(count).toBe(1);
    expect(await db.reconciliationMatch.count()).toBe(before + 1);
  });
});

describe('MatchingService.manualMatch — N-to-1', () => {
  it('matches multiple journal lines to one bank line when sums equal', async () => {
    const date = new Date('2026-05-19');
    const e1 = await postBankDeposit('500', date);
    const e2 = await postBankDeposit('300', date);
    const e3 = await postBankDeposit('200', date);
    const bankLine = await createBankLine('1000', date);

    const jLines = await db.journalLine.findMany({
      where: { journalEntryId: { in: [e1.id, e2.id, e3.id] }, accountId: bankGlId },
    });
    const matches = await svc().manualMatch(reconciliationId, bankLine.id, jLines.map((l) => l.id), userId);
    expect(matches).toHaveLength(3);
  });

  it('rejects when sum does not equal bank line', async () => {
    const date = new Date('2026-05-20');
    const e1 = await postBankDeposit('500', date);
    const bankLine = await createBankLine('1000', date);
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: e1.id, accountId: bankGlId } });
    await expect(svc().manualMatch(reconciliationId, bankLine.id, [jLine!.id], userId))
      .rejects.toMatchObject({ code: 'UNBALANCED' });
  });

  it('rejects sign-flip (debits matched to a withdrawal)', async () => {
    const date = new Date('2026-05-21');
    const e1 = await postBankDeposit('100', date); // debit to bank
    const bankLine = await createBankLine('-100', date); // withdrawal
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: e1.id, accountId: bankGlId } });
    await expect(svc().manualMatch(reconciliationId, bankLine.id, [jLine!.id], userId))
      .rejects.toMatchObject({ code: 'INVALID_LINE' });
  });

  it('rejects already-matched journal lines', async () => {
    const date = new Date('2026-05-22');
    const e1 = await postBankDeposit('150', date);
    const bankLine1 = await createBankLine('150', date);
    const bankLine2 = await createBankLine('150', date);
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: e1.id, accountId: bankGlId } });
    await svc().manualMatch(reconciliationId, bankLine1.id, [jLine!.id], userId);
    await expect(svc().manualMatch(reconciliationId, bankLine2.id, [jLine!.id], userId))
      .rejects.toMatchObject({ code: 'LINE_ALREADY_MATCHED' });
  });
});

describe('MatchingService.unmatchByBankLine', () => {
  it('removes all matches for a bank line', async () => {
    const date = new Date('2026-05-23');
    const e1 = await postBankDeposit('75', date);
    const bankLine = await createBankLine('75', date);
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: e1.id, accountId: bankGlId } });
    await svc().manualMatch(reconciliationId, bankLine.id, [jLine!.id], userId);
    const removed = await svc().unmatchByBankLine(reconciliationId, bankLine.id);
    expect(removed).toBe(1);
    expect(await db.reconciliationMatch.count({ where: { bankStatementLineId: bankLine.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Implement `matching.service.ts`**

```ts
import { Prisma, PrismaClient, ReconciliationMatch } from '@prisma/client';
import { AccountingError } from './posting.errors';

export type AutoMatchCandidate = {
  bankStatementLineId: number;
  journalLineId: number;
};

export class MatchingService {
  constructor(private readonly prisma: PrismaClient) {}

  async findAutoMatches(reconciliationId: number, dateWindowDays = 2): Promise<AutoMatchCandidate[]> {
    const rec = await this.prisma.reconciliation.findUnique({
      where: { id: reconciliationId },
      include: { bankAccount: true },
    });
    if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${reconciliationId} not found`);

    const bankAccountId = rec.bankAccountId;
    const glAccountId = rec.bankAccount.accountId;

    // Unmatched bank lines on this account, dated ≤ endDate
    const bankLines = await this.prisma.bankStatementLine.findMany({
      where: {
        bankAccountId,
        date: { lte: rec.endDate },
        matches: { none: {} },
      },
      orderBy: { date: 'asc' },
    });

    const candidates: AutoMatchCandidate[] = [];
    for (const bl of bankLines) {
      const lo = new Date(bl.date.getTime() - dateWindowDays * 86400000);
      const hi = new Date(bl.date.getTime() + dateWindowDays * 86400000);
      const amt = new Prisma.Decimal(bl.amount);
      const isDeposit = amt.gt(0);

      const lineCandidates = await this.prisma.journalLine.findMany({
        where: {
          accountId: glAccountId,
          journalEntry: { status: 'POSTED', date: { gte: lo, lte: hi } },
          reconciliationMatches: { none: {} },
          ...(isDeposit
            ? { debit: amt, credit: new Prisma.Decimal(0) }
            : { credit: amt.abs(), debit: new Prisma.Decimal(0) }),
        },
        take: 2,
      });
      if (lineCandidates.length === 1) {
        candidates.push({
          bankStatementLineId: bl.id,
          journalLineId: lineCandidates[0].id,
        });
      }
    }
    return candidates;
  }

  async applyAutoMatches(reconciliationId: number, userId: number, dateWindowDays = 2): Promise<number> {
    const candidates = await this.findAutoMatches(reconciliationId, dateWindowDays);
    if (candidates.length === 0) return 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of candidates) {
        await tx.reconciliationMatch.create({
          data: {
            reconciliationId,
            bankStatementLineId: c.bankStatementLineId,
            journalLineId: c.journalLineId,
            createdBy: userId,
          },
        });
      }
    });
    return candidates.length;
  }

  async manualMatch(
    reconciliationId: number,
    bankStatementLineId: number,
    journalLineIds: number[],
    userId: number,
  ): Promise<ReconciliationMatch[]> {
    if (journalLineIds.length === 0) {
      throw new AccountingError('INVALID_LINE', 'At least one journal line required');
    }

    return this.prisma.$transaction(async (tx) => {
      const rec = await tx.reconciliation.findUnique({
        where: { id: reconciliationId },
        include: { bankAccount: true },
      });
      if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${reconciliationId} not found`);
      if (rec.status === 'CLOSED') throw new AccountingError('RECONCILIATION_CLOSED', 'Reconciliation is closed');

      const bankLine = await tx.bankStatementLine.findUnique({ where: { id: bankStatementLineId } });
      if (!bankLine) throw new AccountingError('INVALID_LINE', `BankStatementLine ${bankStatementLineId} not found`);

      const jLines = await tx.journalLine.findMany({
        where: { id: { in: journalLineIds } },
        include: { reconciliationMatches: true },
      });
      if (jLines.length !== journalLineIds.length) {
        throw new AccountingError('INVALID_LINE', 'One or more journal lines not found');
      }
      if (jLines.some((l) => l.accountId !== rec.bankAccount.accountId)) {
        throw new AccountingError('INVALID_ACCOUNT', 'All journal lines must belong to the bank GL account');
      }
      if (jLines.some((l) => l.reconciliationMatches.length > 0)) {
        throw new AccountingError('LINE_ALREADY_MATCHED', 'One or more journal lines are already matched');
      }

      const bankAmount = new Prisma.Decimal(bankLine.amount);
      const isDeposit = bankAmount.gt(0);

      // Sign-consistency check
      for (const l of jLines) {
        const d = new Prisma.Decimal(l.debit);
        const c = new Prisma.Decimal(l.credit);
        if (isDeposit && !d.gt(0)) {
          throw new AccountingError('INVALID_LINE', 'Bank deposit must match debits on the bank account');
        }
        if (!isDeposit && !c.gt(0)) {
          throw new AccountingError('INVALID_LINE', 'Bank withdrawal must match credits on the bank account');
        }
      }

      // Sum-equality check
      const sum = jLines.reduce(
        (acc, l) => acc.plus(isDeposit ? l.debit : l.credit),
        new Prisma.Decimal(0),
      );
      const target = bankAmount.abs();
      if (!sum.equals(target)) {
        throw new AccountingError('UNBALANCED', 'Sum of journal lines does not equal bank line amount', {
          sum: sum.toFixed(2),
          target: target.toFixed(2),
        });
      }

      const results: ReconciliationMatch[] = [];
      for (const l of jLines) {
        const m = await tx.reconciliationMatch.create({
          data: {
            reconciliationId,
            bankStatementLineId,
            journalLineId: l.id,
            createdBy: userId,
          },
        });
        results.push(m);
      }
      return results;
    });
  }

  async unmatchByBankLine(reconciliationId: number, bankStatementLineId: number): Promise<number> {
    const rec = await this.prisma.reconciliation.findUnique({ where: { id: reconciliationId } });
    if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${reconciliationId} not found`);
    if (rec.status === 'CLOSED') throw new AccountingError('RECONCILIATION_CLOSED', 'Reconciliation is closed');

    const result = await this.prisma.reconciliationMatch.deleteMany({
      where: { reconciliationId, bankStatementLineId },
    });
    return result.count;
  }
}
```

- [ ] **Step 4: Run — expect 8/8 pass**

```
cd server && npx vitest run src/services/accounting/matching.service.test.ts
```

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/matching.service.ts server/src/services/accounting/matching.service.test.ts
git commit -m "feat(accounting): MatchingService — auto-match + manual N-to-1 + unmatch"
```

---

### Task C2: MatchingService.addAdjustmentAndMatch + close (TDD)

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\matching.service.ts`
- Modify: `D:\Hotel Apartment Management System\server\src\services\accounting\matching.service.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```ts
describe('MatchingService.addAdjustmentAndMatch', () => {
  it('posts a JE for an unmatched bank line and matches it', async () => {
    const date = new Date('2026-05-25');
    const feeAcc = await db.account.create({ data: { code: '5010', name: 'Bank Fees', type: 'EXPENSE' } });
    const bankLine = await createBankLine('-30', date, 'Bank fee');
    const result = await svc().addAdjustmentAndMatch(
      {
        reconciliationId,
        bankStatementLineId: bankLine.id,
        offsetAccountId: feeAcc.id,
        memo: 'Monthly bank fee',
      },
      userId,
    );
    expect(result).toBeDefined();
    const matches = await db.reconciliationMatch.findMany({ where: { bankStatementLineId: bankLine.id } });
    expect(matches).toHaveLength(1);
    await db.account.delete({ where: { id: feeAcc.id } });
  });
});

describe('MatchingService.close', () => {
  it('closes a balanced reconciliation and snapshots state', async () => {
    // Create a fresh rec
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-06-30'), statementBalance: '0' },
    });
    const closed = await svc().close(rec.id, userId);
    expect(closed.status).toBe('CLOSED');
    expect(closed.reportSnapshot).not.toBeNull();
    expect(closed.closedAt).not.toBeNull();
    await db.reconciliation.delete({ where: { id: rec.id } });
  });

  it('rejects unbalanced close', async () => {
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-07-31'), statementBalance: '9999' },
    });
    await expect(svc().close(rec.id, userId))
      .rejects.toMatchObject({ code: 'RECONCILIATION_UNBALANCED' });
    await db.reconciliation.delete({ where: { id: rec.id } });
  });

  it('rejects double-close', async () => {
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-08-31'), statementBalance: '0' },
    });
    await svc().close(rec.id, userId);
    await expect(svc().close(rec.id, userId))
      .rejects.toMatchObject({ code: 'RECONCILIATION_CLOSED' });
    await db.reconciliation.delete({ where: { id: rec.id } });
  });
});
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Add methods to `matching.service.ts`**

Add imports at the top:
```ts
import { PostingService } from './posting.service';
```

Add a class field and constructor wiring:
```ts
private posting: PostingService;
constructor(private readonly prisma: PrismaClient) {
  this.posting = new PostingService(prisma);
}
```

Note: this requires updating the existing constructor. If the test file passes `db as any` and expects a single-arg constructor, keep that signature working by initializing `posting` from the prisma argument.

Add the methods:

```ts
async addAdjustmentAndMatch(
  input: {
    reconciliationId: number;
    bankStatementLineId: number;
    offsetAccountId: number;
    memo?: string;
  },
  userId: number,
): Promise<ReconciliationMatch> {
  return this.prisma.$transaction(async (tx) => {
    const rec = await tx.reconciliation.findUnique({
      where: { id: input.reconciliationId },
      include: { bankAccount: true },
    });
    if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${input.reconciliationId} not found`);
    if (rec.status === 'CLOSED') throw new AccountingError('RECONCILIATION_CLOSED', 'Reconciliation is closed');

    const bankLine = await tx.bankStatementLine.findUnique({ where: { id: input.bankStatementLineId } });
    if (!bankLine) throw new AccountingError('INVALID_LINE', `BankStatementLine ${input.bankStatementLineId} not found`);

    const gross = new Prisma.Decimal(bankLine.amount);
    const isDeposit = gross.gt(0);
    const absAmount = gross.abs();

    // Build the JE: bank account debit (or credit) + offset account credit (or debit)
    const lines = isDeposit
      ? [
          { accountId: rec.bankAccount.accountId, debit: absAmount, description: input.memo },
          { accountId: input.offsetAccountId, credit: absAmount },
        ]
      : [
          { accountId: input.offsetAccountId, debit: absAmount },
          { accountId: rec.bankAccount.accountId, credit: absAmount, description: input.memo },
        ];

    // Post via PostingService; period-lock fallback handled by createAndPost via ensurePeriodOpen.
    // If the bank line's date is in a locked period, fall back to today.
    let entryDate = bankLine.date;
    const periodRow = await tx.fiscalPeriod.findUnique({
      where: { year_month: { year: entryDate.getUTCFullYear(), month: entryDate.getUTCMonth() + 1 } },
    });
    if (periodRow?.status === 'CLOSED' as any /* keep types loose — value is 'LOCKED' */ || periodRow?.status === 'LOCKED') {
      entryDate = new Date();
    }

    const entry = await this.posting.createAndPost(
      {
        date: entryDate,
        memo: input.memo ?? `Bank adjustment: ${bankLine.description} (${bankLine.date.toISOString().slice(0,10)})`,
        buildingId: null,
        source: 'MANUAL',
        lines,
      },
      userId,
      tx,
    );

    // Find the line on the bank GL account
    const newJournalLine = await tx.journalLine.findFirst({
      where: { journalEntryId: entry.id, accountId: rec.bankAccount.accountId },
    });
    if (!newJournalLine) throw new Error('Expected bank GL line not created');

    return tx.reconciliationMatch.create({
      data: {
        reconciliationId: input.reconciliationId,
        bankStatementLineId: input.bankStatementLineId,
        journalLineId: newJournalLine.id,
        createdBy: userId,
      },
    });
  });
}

async close(reconciliationId: number, userId: number): Promise<Reconciliation> {
  return this.prisma.$transaction(async (tx) => {
    const rec = await tx.reconciliation.findUnique({
      where: { id: reconciliationId },
      include: { bankAccount: true },
    });
    if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${reconciliationId} not found`);
    if (rec.status === 'CLOSED') throw new AccountingError('RECONCILIATION_CLOSED', 'Reconciliation is already closed');

    const glAccountId = rec.bankAccount.accountId;

    // GL balance through endDate
    const glAgg = await tx.journalLine.aggregate({
      where: {
        accountId: glAccountId,
        journalEntry: { status: 'POSTED', date: { lte: rec.endDate } },
      },
      _sum: { debit: true, credit: true },
    });
    const glBalance = new Prisma.Decimal(glAgg._sum.debit ?? 0).minus(glAgg._sum.credit ?? 0);

    // Unmatched journal-line balances on the bank GL account ≤ endDate
    const unmatchedJlAgg = await tx.journalLine.aggregate({
      where: {
        accountId: glAccountId,
        journalEntry: { status: 'POSTED', date: { lte: rec.endDate } },
        reconciliationMatches: { none: {} },
      },
      _sum: { debit: true, credit: true },
    });
    const outstandingDeposits = new Prisma.Decimal(unmatchedJlAgg._sum.debit ?? 0);
    const outstandingWithdrawals = new Prisma.Decimal(unmatchedJlAgg._sum.credit ?? 0);

    const statementBalance = new Prisma.Decimal(rec.statementBalance);
    const reconciledBalance = statementBalance.plus(outstandingDeposits).minus(outstandingWithdrawals);
    const diff = glBalance.minus(reconciledBalance);

    if (diff.abs().gt(new Prisma.Decimal('0.005'))) {
      throw new AccountingError('RECONCILIATION_UNBALANCED', 'Reconciliation is not balanced', {
        glBalance: glBalance.toFixed(2),
        reconciledBalance: reconciledBalance.toFixed(2),
        diff: diff.toFixed(2),
      });
    }

    // Build snapshot
    const matches = await tx.reconciliationMatch.findMany({
      where: { reconciliationId },
      include: {
        bankStatementLine: true,
        journalLine: { include: { journalEntry: { select: { entryNumber: true, date: true, memo: true } } } },
      },
    });
    const unmatchedBankLines = await tx.bankStatementLine.findMany({
      where: { bankAccountId: rec.bankAccountId, date: { lte: rec.endDate }, matches: { none: {} } },
    });
    const unmatchedJournalLines = await tx.journalLine.findMany({
      where: {
        accountId: glAccountId,
        journalEntry: { status: 'POSTED', date: { lte: rec.endDate } },
        reconciliationMatches: { none: {} },
      },
      include: { journalEntry: { select: { entryNumber: true, date: true, memo: true } } },
    });

    const snapshot = {
      closedAt: new Date().toISOString(),
      endDate: rec.endDate.toISOString(),
      statementBalance: statementBalance.toFixed(2),
      glBalance: glBalance.toFixed(2),
      outstandingDeposits: outstandingDeposits.toFixed(2),
      outstandingWithdrawals: outstandingWithdrawals.toFixed(2),
      matches,
      unmatchedBankLines,
      unmatchedJournalLines,
    };

    return tx.reconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: userId,
        reportSnapshot: snapshot as any,
        updatedBy: userId,
      },
    });
  });
}

async reopen(reconciliationId: number, userId: number): Promise<Reconciliation> {
  const rec = await this.prisma.reconciliation.findUnique({ where: { id: reconciliationId } });
  if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${reconciliationId} not found`);
  if (rec.status !== 'CLOSED') throw new AccountingError('INVALID_LINE', 'Reconciliation is not closed');
  return this.prisma.reconciliation.update({
    where: { id: reconciliationId },
    data: {
      status: 'OPEN',
      closedAt: null,
      closedBy: null,
      reportSnapshot: null as any,
      updatedBy: userId,
    },
  });
}
```

Also add the `Reconciliation` import to the imports at the top:
```ts
import { Prisma, PrismaClient, ReconciliationMatch, Reconciliation } from '@prisma/client';
```

- [ ] **Step 4: Run — expect tests pass**

- [ ] **Step 5: Commit**

```
git add server/src/services/accounting/matching.service.ts server/src/services/accounting/matching.service.test.ts
git commit -m "feat(accounting): MatchingService — addAdjustmentAndMatch + close (with snapshot) + reopen"
```

---

# Section D — Controllers + routes

### Task D1: BankAccounts controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-bank-accounts.controller.ts`

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await prisma.bankAccount.findMany({
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
        _count: { select: { statements: true, reconciliations: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, accountId } = req.body as { name?: string; accountId?: number };
    if (!name?.trim() || typeof accountId !== 'number') {
      res.status(400).json({ message: 'name and accountId required' });
      return;
    }
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) { res.status(400).json({ message: 'Account not found' }); return; }
    if (acc.type !== 'ASSET') { res.status(400).json({ message: 'Bank account must link to an ASSET account' }); return; }
    if (!acc.isActive) { res.status(400).json({ message: 'Cannot link to an inactive account' }); return; }
    try {
      const ba = await prisma.bankAccount.create({
        data: { name: name.trim(), accountId, createdBy: req.user!.id, updatedBy: req.user!.id },
      });
      res.status(201).json(ba);
    } catch (err: any) {
      if (err?.code === 'P2002') { res.status(409).json({ message: 'GL account already linked to a bank account' }); return; }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: 'BankAccount not found' }); return; }
    const { name, isActive } = req.body as { name?: string; isActive?: boolean };
    const data: any = { updatedBy: req.user!.id };
    if (name !== undefined) data.name = name.trim();
    if (isActive !== undefined) data.isActive = isActive;
    const updated = await prisma.bankAccount.update({ where: { id }, data });
    res.json(updated);
  } catch (err) { next(err); }
}

export async function updateCsvMapping(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: 'BankAccount not found' }); return; }
    const body = req.body as {
      csvDateColumn?: number; csvAmountColumn?: number;
      csvDescriptionColumn?: number; csvReferenceColumn?: number | null;
      csvHasHeader?: boolean; csvDateFormat?: string;
    };
    const updated = await prisma.bankAccount.update({
      where: { id },
      data: {
        csvDateColumn: body.csvDateColumn,
        csvAmountColumn: body.csvAmountColumn,
        csvDescriptionColumn: body.csvDescriptionColumn,
        csvReferenceColumn: body.csvReferenceColumn,
        csvHasHeader: body.csvHasHeader,
        csvDateFormat: body.csvDateFormat,
        updatedBy: req.user!.id,
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
}

export async function deactivate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.bankAccount.update({ where: { id }, data: { isActive: false, updatedBy: req.user!.id } });
    res.json(updated);
  } catch (err) { next(err); }
}
```

Commit:
```
git add server/src/controllers/accounting-bank-accounts.controller.ts
git commit -m "feat(accounting): bank accounts controller — CRUD + CSV mapping"
```

---

### Task D2: BankStatements controller (with multer upload)

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-bank-statements.controller.ts`

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { BankStatementService } from '../services/accounting/bank-statement.service';
import { AccountingError } from '../services/accounting/posting.errors';
import fs from 'fs/promises';

const svc = new BankStatementService(prisma as any);

export async function preview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const bankAccountId = Number(req.params.id);
    if (!req.file) { res.status(400).json({ message: 'CSV file required' }); return; }
    const ba = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!ba) { res.status(404).json({ message: 'BankAccount not found' }); return; }

    const text = await fs.readFile(req.file.path, 'utf-8');
    await fs.unlink(req.file.path).catch(() => {});
    const result = await svc.preview(text);
    res.json(result);
  } catch (err) { next(err); }
}

export async function importStatement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const bankAccountId = Number(req.params.id);
    if (!req.file) { res.status(400).json({ message: 'CSV file required' }); return; }

    const text = await fs.readFile(req.file.path, 'utf-8');
    await fs.unlink(req.file.path).catch(() => {});

    try {
      const result = await svc.import(bankAccountId, req.file.originalname, text, req.user!.id);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof AccountingError) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function listStatements(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const bankAccountId = Number(req.params.id);
    const rows = await prisma.bankStatement.findMany({
      where: { bankAccountId },
      include: { _count: { select: { lines: true } } },
      orderBy: { importedAt: 'desc' },
    });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function deleteStatement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const matchedCount = await prisma.reconciliationMatch.count({
      where: { bankStatementLine: { bankStatementId: id } },
    });
    if (matchedCount > 0) {
      res.status(400).json({ message: 'Cannot delete a statement whose lines are matched in a reconciliation' });
      return;
    }
    await prisma.bankStatement.delete({ where: { id } });
    res.status(204).end();
  } catch (err) { next(err); }
}
```

Commit:
```
git add server/src/controllers/accounting-bank-statements.controller.ts
git commit -m "feat(accounting): bank statements controller (preview, import, list, delete)"
```

---

### Task D3: Reconciliations controller

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-reconciliations.controller.ts`

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { MatchingService } from '../services/accounting/matching.service';
import { AccountingError } from '../services/accounting/posting.errors';

const matching = new MatchingService(prisma as any);

function mapErr(err: unknown, res: Response): boolean {
  if (err instanceof AccountingError) {
    res.status(400).json({ code: err.code, message: err.message, details: err.details });
    return true;
  }
  return false;
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { bankAccountId, endDate, statementBalance } = req.body as {
      bankAccountId?: number; endDate?: string; statementBalance?: string | number;
    };
    if (typeof bankAccountId !== 'number' || !endDate || statementBalance === undefined) {
      res.status(400).json({ message: 'bankAccountId, endDate, statementBalance required' });
      return;
    }
    const existingOpen = await prisma.reconciliation.findFirst({
      where: { bankAccountId, status: 'OPEN' },
    });
    if (existingOpen) {
      res.status(400).json({ message: 'An OPEN reconciliation already exists for this bank account' });
      return;
    }
    const rec = await prisma.reconciliation.create({
      data: {
        bankAccountId,
        endDate: new Date(endDate),
        statementBalance: String(statementBalance),
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      },
    });
    res.status(201).json(rec);
  } catch (err) { next(err); }
}

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { bankAccountId, status } = req.query as { bankAccountId?: string; status?: string };
    const where: any = {};
    if (bankAccountId) where.bankAccountId = Number(bankAccountId);
    if (status === 'OPEN' || status === 'CLOSED') where.status = status;
    const rows = await prisma.reconciliation.findMany({
      where,
      include: { bankAccount: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { endDate: 'desc' }],
    });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const rec = await prisma.reconciliation.findUnique({
      where: { id },
      include: { bankAccount: true },
    });
    if (!rec) { res.status(404).json({ message: 'Reconciliation not found' }); return; }

    // Compute current state — bank lines and GL lines (matched + unmatched)
    const bankLines = await prisma.bankStatementLine.findMany({
      where: { bankAccountId: rec.bankAccountId, date: { lte: rec.endDate } },
      include: { matches: { where: { reconciliationId: id } } },
      orderBy: { date: 'asc' },
    });
    const journalLines = await prisma.journalLine.findMany({
      where: {
        accountId: rec.bankAccount.accountId,
        journalEntry: { status: 'POSTED', date: { lte: rec.endDate } },
      },
      include: {
        journalEntry: { select: { id: true, entryNumber: true, date: true, memo: true } },
        reconciliationMatches: { where: { reconciliationId: id } },
      },
      orderBy: { journalEntry: { date: 'asc' } },
    });
    res.json({ ...rec, bankLines, journalLines });
  } catch (err) { next(err); }
}

export async function autoMatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const count = await matching.applyAutoMatches(id, req.user!.id);
    res.json({ matchedCount: count });
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function manualMatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const { bankStatementLineId, journalLineIds } = req.body as {
      bankStatementLineId?: number; journalLineIds?: number[];
    };
    if (typeof bankStatementLineId !== 'number' || !Array.isArray(journalLineIds)) {
      res.status(400).json({ message: 'bankStatementLineId and journalLineIds required' });
      return;
    }
    const matches = await matching.manualMatch(id, bankStatementLineId, journalLineIds, req.user!.id);
    res.status(201).json(matches);
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function unmatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const bankLineId = Number(req.params.bankLineId);
    const count = await matching.unmatchByBankLine(id, bankLineId);
    res.json({ removed: count });
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function adjustment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const { bankStatementLineId, offsetAccountId, memo } = req.body as {
      bankStatementLineId?: number; offsetAccountId?: number; memo?: string;
    };
    if (typeof bankStatementLineId !== 'number' || typeof offsetAccountId !== 'number') {
      res.status(400).json({ message: 'bankStatementLineId and offsetAccountId required' });
      return;
    }
    const match = await matching.addAdjustmentAndMatch(
      { reconciliationId: id, bankStatementLineId, offsetAccountId, memo },
      req.user!.id,
    );
    res.status(201).json(match);
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function close(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const closed = await matching.close(id, req.user!.id);
    res.json(closed);
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function reopen(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const reopened = await matching.reopen(id, req.user!.id);
    res.json(reopened);
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function reportCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const rec = await prisma.reconciliation.findUnique({ where: { id } });
    if (!rec) { res.status(404).json({ message: 'Not found' }); return; }
    const snapshot = rec.reportSnapshot as any;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${id}.csv"`);
    res.write('Type,Detail,Amount\n');
    if (snapshot) {
      res.write(`Summary,Statement Balance,${snapshot.statementBalance}\n`);
      res.write(`Summary,GL Balance,${snapshot.glBalance}\n`);
      res.write(`Summary,Outstanding Deposits,${snapshot.outstandingDeposits}\n`);
      res.write(`Summary,Outstanding Withdrawals,${snapshot.outstandingWithdrawals}\n`);
    } else {
      res.write('Summary,Reconciliation is OPEN — live snapshot not implemented in CSV\n');
    }
    res.end();
  } catch (err) { next(err); }
}
```

Commit:
```
git add server/src/controllers/accounting-reconciliations.controller.ts
git commit -m "feat(accounting): reconciliations controller (create/list/get + auto/manual match + adjustment + close/reopen + CSV)"
```

---

### Task D4: Routes wiring

**Files:**
- Modify: `D:\Hotel Apartment Management System\server\src\routes\accounting.routes.ts`

Add imports near other controller imports:
```ts
import * as bankAccounts from '../controllers/accounting-bank-accounts.controller';
import * as bankStatements from '../controllers/accounting-bank-statements.controller';
import * as reconciliations from '../controllers/accounting-reconciliations.controller';
import { uploadFile } from '../middleware/upload.middleware';
```

Add new routes BEFORE `export default router`:
```ts
// Phase 4: Bank accounts
router.get('/bank-accounts', bankAccounts.list);
router.post('/bank-accounts', bankAccounts.create);
router.patch('/bank-accounts/:id', bankAccounts.update);
router.patch('/bank-accounts/:id/csv-mapping', bankAccounts.updateCsvMapping);
router.post('/bank-accounts/:id/deactivate', bankAccounts.deactivate);

// Phase 4: Bank statements (multipart upload for preview + import)
router.post('/bank-accounts/:id/statements/preview', uploadFile, bankStatements.preview);
router.post('/bank-accounts/:id/statements', uploadFile, bankStatements.importStatement);
router.get('/bank-accounts/:id/statements', bankStatements.listStatements);
router.delete('/bank-statements/:id', bankStatements.deleteStatement);

// Phase 4: Reconciliations
router.post('/reconciliations', reconciliations.create);
router.get('/reconciliations', reconciliations.list);
router.get('/reconciliations/:id', reconciliations.get);
router.post('/reconciliations/:id/auto-match', reconciliations.autoMatch);
router.post('/reconciliations/:id/match', reconciliations.manualMatch);
router.delete('/reconciliations/:id/match/:bankLineId', reconciliations.unmatch);
router.post('/reconciliations/:id/adjustment', reconciliations.adjustment);
router.post('/reconciliations/:id/close', reconciliations.close);
router.post('/reconciliations/:id/reopen', adminOnly, reconciliations.reopen);
router.get('/reconciliations/:id/report.csv', reconciliations.reportCsv);
```

Run typecheck:
```
cd server && npx tsc --noEmit
```

Commit:
```
git add server/src/routes/accounting.routes.ts
git commit -m "feat(accounting): mount Phase 4 routes (bank accounts, statements, reconciliations)"
```

---

# Section E — HTTP integration tests

Each controller test file follows the Phase 1/2/3 template (real Postgres, `signToken`, admin/finance cookies, `process.env.FEATURE_ACCOUNTING = 'true'`).

### Task E1: BankAccounts HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-bank-accounts.controller.test.ts`

Tests (~5):
1. `GET /bank-accounts` returns array (auth ✓).
2. `POST /bank-accounts` happy path creates row.
3. `POST` with non-ASSET account → 400.
4. `POST` with already-linked account → 409.
5. `PATCH /bank-accounts/:id/csv-mapping` round-trips fields.

Use the Phase 2 `accounting-mapping.controller.test.ts` as the template.

Commit:
```
git add server/src/controllers/accounting-bank-accounts.controller.test.ts
git commit -m "test(accounting): bank accounts HTTP tests"
```

---

### Task E2: BankStatements HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-bank-statements.controller.test.ts`

Tests (~5). For the upload tests, use `supertest`'s `.attach()`:

```ts
const csv = 'Date,Description,Amount\n01/05/2026,Test,100.00\n';
const r = await request(app)
  .post(`/api/v1/accounting/bank-accounts/${bankAccountId}/statements/preview`)
  .set('Cookie', adminCookie)
  .attach('file', Buffer.from(csv), 'test.csv');
```

Specifically:
1. Preview returns sample rows.
2. Import without mapping → 400 BANK_STATEMENT_INVALID.
3. Import with valid mapping persists statement + lines.
4. Delete unmatched statement succeeds.
5. Delete matched statement → 400.

The upload middleware field name is the existing convention from `attachments.controller.test.ts` — check what field name multer expects (`file` is the common default; verify by reading `upload.middleware.ts`).

Commit:
```
git add server/src/controllers/accounting-bank-statements.controller.test.ts
git commit -m "test(accounting): bank statements HTTP tests (preview, import, delete)"
```

---

### Task E3: Reconciliations HTTP tests

**Files:**
- Create: `D:\Hotel Apartment Management System\server\src\controllers\accounting-reconciliations.controller.test.ts`

Tests (~7):
1. `POST /reconciliations` creates OPEN.
2. Duplicate OPEN for same bank account → 400.
3. `GET /reconciliations/:id` returns computed state with bankLines + journalLines.
4. `POST /:id/auto-match` returns matchedCount.
5. `POST /:id/match` manual N-to-1 happy path.
6. `POST /:id/close` on balanced succeeds; double-close → 400.
7. `POST /:id/reopen` admin-only; finance → 403.

Commit:
```
git add server/src/controllers/accounting-reconciliations.controller.test.ts
git commit -m "test(accounting): reconciliations HTTP tests"
```

---

### Task E4: Full server sweep

```
cd server && npx vitest run --silent --reporter=verbose 2>&1 | grep -aE "Test Files|Tests +" | head -3
```

Expected: total tests ≈ 345 (Phase 3) + ~45 = ~390. If any regress, READ the failure and escalate BLOCKED.

No commit unless fixes are needed.

---

# Section F — Client API + components

### Task F1: Client API module

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\lib\api\accounting-phase4.ts`

```ts
import api from '../axios';

export type BankAccount = {
  id: number; name: string; accountId: number; isActive: boolean;
  csvDateColumn: number | null; csvAmountColumn: number | null;
  csvDescriptionColumn: number | null; csvReferenceColumn: number | null;
  csvHasHeader: boolean; csvDateFormat: string | null;
  account: { id: number; code: string; name: string; type: string };
  _count: { statements: number; reconciliations: number };
};

export type BankStatement = {
  id: number; bankAccountId: number; filename: string;
  importedAt: string; lineCount: number;
  _count: { lines: number };
};

export type BankStatementLine = {
  id: number; bankStatementId: number; bankAccountId: number;
  date: string; amount: string; description: string; reference: string | null;
  matches: { id: number }[];
};

export type Reconciliation = {
  id: number; bankAccountId: number; endDate: string;
  statementBalance: string; status: 'OPEN' | 'CLOSED';
  closedAt: string | null; closedBy: number | null;
  reportSnapshot: any | null;
  bankAccount: { id: number; name: string };
};

export type ReconciliationDetail = Reconciliation & {
  bankAccount: BankAccount;
  bankLines: BankStatementLine[];
  journalLines: Array<{
    id: number; debit: string; credit: string; description: string | null;
    journalEntry: { id: number; entryNumber: string; date: string; memo: string | null };
    reconciliationMatches: { id: number }[];
  }>;
};

export const bankAccountsApi = {
  list: () => api.get<BankAccount[]>('/accounting/bank-accounts').then((r) => r.data),
  create: (d: { name: string; accountId: number }) =>
    api.post<BankAccount>('/accounting/bank-accounts', d).then((r) => r.data),
  update: (id: number, d: { name?: string; isActive?: boolean }) =>
    api.patch<BankAccount>(`/accounting/bank-accounts/${id}`, d).then((r) => r.data),
  updateCsvMapping: (id: number, d: {
    csvDateColumn: number; csvAmountColumn: number;
    csvDescriptionColumn: number; csvReferenceColumn?: number | null;
    csvHasHeader: boolean; csvDateFormat: string;
  }) => api.patch<BankAccount>(`/accounting/bank-accounts/${id}/csv-mapping`, d).then((r) => r.data),
  deactivate: (id: number) =>
    api.post<BankAccount>(`/accounting/bank-accounts/${id}/deactivate`).then((r) => r.data),
};

export const bankStatementsApi = {
  preview: (bankAccountId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ columnCount: number; sampleRows: string[][] }>(
      `/accounting/bank-accounts/${bankAccountId}/statements/preview`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then((r) => r.data);
  },
  import: (bankAccountId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ statementId: number; lineCount: number; dateRange: { from: string; to: string } }>(
      `/accounting/bank-accounts/${bankAccountId}/statements`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then((r) => r.data);
  },
  list: (bankAccountId: number) =>
    api.get<BankStatement[]>(`/accounting/bank-accounts/${bankAccountId}/statements`).then((r) => r.data),
  delete: (id: number) => api.delete(`/accounting/bank-statements/${id}`),
};

export const reconciliationsApi = {
  create: (d: { bankAccountId: number; endDate: string; statementBalance: string }) =>
    api.post<Reconciliation>('/accounting/reconciliations', d).then((r) => r.data),
  list: (params?: { bankAccountId?: number; status?: 'OPEN' | 'CLOSED' }) =>
    api.get<Reconciliation[]>('/accounting/reconciliations', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<ReconciliationDetail>(`/accounting/reconciliations/${id}`).then((r) => r.data),
  autoMatch: (id: number) =>
    api.post<{ matchedCount: number }>(`/accounting/reconciliations/${id}/auto-match`).then((r) => r.data),
  manualMatch: (id: number, body: { bankStatementLineId: number; journalLineIds: number[] }) =>
    api.post(`/accounting/reconciliations/${id}/match`, body).then((r) => r.data),
  unmatch: (id: number, bankLineId: number) =>
    api.delete(`/accounting/reconciliations/${id}/match/${bankLineId}`).then((r) => r.data),
  adjustment: (id: number, body: { bankStatementLineId: number; offsetAccountId: number; memo?: string }) =>
    api.post(`/accounting/reconciliations/${id}/adjustment`, body).then((r) => r.data),
  close: (id: number) =>
    api.post<Reconciliation>(`/accounting/reconciliations/${id}/close`).then((r) => r.data),
  reopen: (id: number) =>
    api.post<Reconciliation>(`/accounting/reconciliations/${id}/reopen`).then((r) => r.data),
};
```

Commit:
```
git add client/src/lib/api/accounting-phase4.ts
git commit -m "feat(client): accounting Phase 4 API client"
```

---

### Task F2: BankingPage (landing)

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\BankingPage.tsx`

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { bankAccountsApi, reconciliationsApi } from '../../lib/api/accounting-phase4';
import { accountsApi } from '../../lib/api/accounting';

export default function BankingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['accounting', 'bank-accounts'],
    queryFn: bankAccountsApi.list,
  });
  const { data: recs = [] } = useQuery({
    queryKey: ['accounting', 'reconciliations'],
    queryFn: () => reconciliationsApi.list(),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: accountsApi.list,
  });

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [err, setErr] = useState<string | null>(null);

  const linkedIds = new Set(bankAccounts.map((b) => b.accountId));
  const availableAssets = accounts.filter((a) => a.type === 'ASSET' && a.isActive && !linkedIds.has(a.id));

  const createMut = useMutation({
    mutationFn: () => bankAccountsApi.create({ name, accountId: Number(accountId) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting', 'bank-accounts'] }); setShowNew(false); setName(''); setAccountId(''); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed'),
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.banking.title', 'Bank Reconciliation')}</h1>

      <section className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-bold">Bank Accounts</h2>
          <button onClick={() => setShowNew(true)} className="px-3 py-2 rounded bg-primary text-on-primary text-sm">
            + New Bank Account
          </button>
        </div>
        {bankAccounts.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No bank accounts yet. Add one to start reconciling.</p>
        ) : (
          <table className="w-full text-sm bg-surface-container-low rounded">
            <thead className="text-on-surface-variant">
              <tr><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-left">GL Account</th><th className="px-2 py-1 text-right">Statements</th><th className="px-2 py-1 text-right">Reconciliations</th></tr>
            </thead>
            <tbody>
              {bankAccounts.map((b) => (
                <tr key={b.id} className="border-t border-outline-variant">
                  <td className="px-2 py-1"><Link to={`/accounting/banking/${b.id}`} className="text-primary">{b.name}</Link></td>
                  <td className="px-2 py-1">{b.account.code} – {b.account.name}</td>
                  <td className="px-2 py-1 text-right">{b._count.statements}</td>
                  <td className="px-2 py-1 text-right">{b._count.reconciliations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-2">Reconciliations</h2>
        {recs.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No reconciliations yet.</p>
        ) : (
          <table className="w-full text-sm bg-surface-container-low rounded">
            <thead className="text-on-surface-variant">
              <tr><th className="px-2 py-1 text-left">Bank Account</th><th className="px-2 py-1 text-left">End Date</th><th className="px-2 py-1 text-left">Status</th><th /></tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id} className="border-t border-outline-variant">
                  <td className="px-2 py-1">{r.bankAccount.name}</td>
                  <td className="px-2 py-1">{r.endDate.slice(0, 10)}</td>
                  <td className="px-2 py-1">{r.status}</td>
                  <td className="px-2 py-1 text-right">
                    <Link to={`/accounting/banking/reconciliations/${r.id}`} className="text-primary text-xs">
                      {r.status === 'OPEN' ? 'Continue →' : 'View report →'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showNew && (
        <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
          <div className="bg-surface rounded-lg shadow-xl w-[420px] p-6">
            <h2 className="text-lg font-bold mb-4">New Bank Account</h2>
            {err && <div className="text-error text-sm mb-2">{err}</div>}
            <label className="block text-sm mb-2">Name <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" /></label>
            <label className="block text-sm mb-4">Linked GL Account
              <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
                <option value="">— pick an ASSET account —</option>
                {availableAssets.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
              <button onClick={() => createMut.mutate()} disabled={!name || !accountId} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

Commit:
```
git add client/src/pages/accounting/BankingPage.tsx
git commit -m "feat(client): Banking landing page (bank accounts + reconciliations lists)"
```

---

### Task F3: BankAccountDetailPage + CsvImportWizard

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\CsvImportWizard.tsx`
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\BankAccountDetailPage.tsx`

These two pages are the most UI-heavy. Implementation guidance:

**`CsvImportWizard.tsx`**: 3-step modal. Step 1 file picker + preview call. Step 2 mapping dropdowns (date column, amount column, description column, optional reference column, header checkbox, date format select). Step 3 confirm + import. Calls `bankStatementsApi.preview` and `bankStatementsApi.import`. After successful import, calls the `onImported` callback.

**`BankAccountDetailPage.tsx`**: tabs for Statements / Reconciliations / CSV Mapping. Statements tab lists imported statements with delete buttons (disabled if matched). Has "Import statement" button that opens `CsvImportWizard`. Reconciliations tab lists recs for this bank account with "Start new" button opening `NewReconciliationModal`. CSV Mapping tab shows current mapping (read-only) with "Edit mapping" button reopening the wizard at Step 2.

Two files; one commit:
```
git add client/src/pages/accounting/CsvImportWizard.tsx client/src/pages/accounting/BankAccountDetailPage.tsx
git commit -m "feat(client): BankAccountDetailPage + CsvImportWizard (3-step modal)"
```

The detailed JSX is left to the implementer — follow the patterns in Phase 3's `FiscalPeriodsPage.tsx` (tabs, modals, mutations with invalidations).

---

### Task F4: NewReconciliationModal + ReconciliationPage

**Files:**
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\NewReconciliationModal.tsx`
- Create: `D:\Hotel Apartment Management System\client\src\pages\accounting\ReconciliationPage.tsx`

**`NewReconciliationModal.tsx`**: form fields `endDate` (defaults to last day of previous month) and `statementBalance`. POSTs to `reconciliationsApi.create`. On success, navigates to `/accounting/banking/reconciliations/:id`.

**`ReconciliationPage.tsx`**: the main workspace. Layout:
- Header showing bank account name, end date, statement balance, computed difference (live), status pill.
- Action bar: "Run auto-match" button (only OPEN), "Close reconciliation" button (only OPEN and difference is 0), "Reopen" button (only CLOSED + admin), "Export CSV" link.
- Two columns side-by-side: bank lines (left) and journal lines (right).
  - Each row has a checkbox if unmatched (and rec is OPEN). Matched rows show ✓ and link to the counterpart.
- Selection model: user selects 1 bank line + N journal lines, clicks "Match selected" button. Calls `reconciliationsApi.manualMatch`.
- "Add adjustment" button on each unmatched bank line opens a small inline form (offset account combobox + memo).
- Difference math (live): bank line totals matched + outstanding GL = expected end balance vs statementBalance.

Two files; one commit:
```
git add client/src/pages/accounting/NewReconciliationModal.tsx client/src/pages/accounting/ReconciliationPage.tsx
git commit -m "feat(client): NewReconciliationModal + ReconciliationPage (side-by-side workflow)"
```

The detailed implementation is left to the implementer — follow Phase 3's `FiscalPeriodsPage.tsx` for the calendar-grid pattern as a reference, but the reconciliation workspace is its own beast. Aim for ~250 LoC for `ReconciliationPage.tsx`.

---

# Section G — Client wiring + i18n

### Task G1: App.tsx routes

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\App.tsx`

Add imports near other accounting page imports:
```tsx
import BankingPage from './pages/accounting/BankingPage';
import BankAccountDetailPage from './pages/accounting/BankAccountDetailPage';
import ReconciliationPage from './pages/accounting/ReconciliationPage';
```

Inside `{f[FeatureFlag.ACCOUNTING] && (<>...</>)}` block, add three routes:
```tsx
<Route path="accounting/banking" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><BankingPage /></ProtectedRoute>} />
<Route path="accounting/banking/:id" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><BankAccountDetailPage /></ProtectedRoute>} />
<Route path="accounting/banking/reconciliations/:id" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><ReconciliationPage /></ProtectedRoute>} />
```

Commit:
```
git add client/src/App.tsx
git commit -m "feat(client): register Phase 4 routes (banking, bank account detail, reconciliation)"
```

---

### Task G2: Sidebar entry

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\components\layout\Sidebar.tsx`

Append to `NAV_ITEMS` after the existing Phase 3 entries:
```ts
  { to: '/accounting/banking', icon: 'account_balance', key: 'accountingBanking', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE], feature: FeatureFlag.ACCOUNTING },
```

Commit:
```
git add client/src/components/layout/Sidebar.tsx
git commit -m "feat(client): sidebar entry for Bank Reconciliation"
```

---

### Task G3: i18n EN + AR

**Files:**
- Modify: `D:\Hotel Apartment Management System\client\src\i18n\locales\en\translation.json`
- Modify: `D:\Hotel Apartment Management System\client\src\i18n\locales\ar\translation.json`

Deep-merge into existing files (preserve all existing keys):

**English:**
```json
{
  "nav": { "accountingBanking": "Bank Reconciliation" },
  "accounting": {
    "banking": { "title": "Bank Reconciliation" }
  }
}
```

**Arabic:**
```json
{
  "nav": { "accountingBanking": "مطابقة البنك" },
  "accounting": {
    "banking": { "title": "مطابقة البنك" }
  }
}
```

Commit:
```
git add client/src/i18n/locales
git commit -m "feat(i18n): English and Arabic translations for accounting Phase 4"
```

---

# Section H — Docs

### Task H1: BRD v2.4

**Files:**
- Modify: `D:\Hotel Apartment Management System\Hotel_Apartment_BRD.md`

Replace the version line:
```
**Version:** 2.4 — Updated 2026-05-17 — Accounting module Phase 4 (bank reconciliation). Module complete.
```

After §4.12 add §4.13:

```markdown
### 4.13 Accounting Module (Phase 4) — Bank Reconciliation

- **Multi-bank:** `BankAccount` table; one bank account per linked GL Asset account.
- **CSV import:** flexible per-account column mapping; 3-step wizard (preview, configure, confirm).
- **Matching:** auto-match (exact amount, ±2 day window, sign-aware) + manual 1-to-1 + manual N-to-1.
- **Reconciliation sessions:** one OPEN session per bank account; close requires balanced state; admin-only reopen.
- **Inline adjustments:** "Add adjustment" posts a JE via PostingService and matches it. Period-lock fallback (Phase 3 guard inherited).
- **Reconciliation report:** snapshotted to JSON at close; CSV export.

Phase 4 closes the accounting module. Bank API integration, multi-currency, dedup at import, and other extensions are out of v1.
```

Commit:
```
git add Hotel_Apartment_BRD.md
git commit -m "docs(brd): v2.4 — accounting module Phase 4. Module complete."
```

---

### Task H2: Manual test plan §22

**Files:**
- Modify: `D:\Hotel Apartment Management System\docs\manual-test-plan.md`

Append at the end:

```markdown

## 22. Accounting Module (Phase 4) — Bank Reconciliation

**Prerequisites:** Phases 1–3 active; `FEATURE_ACCOUNTING=true`. Log in as ADMIN.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 22.1 | Create bank account | Banking page → + New Bank Account; name "Main Checking"; pick Bank (1020) | Created and visible in list |
| 22.2 | Configure CSV mapping | Bank account detail → CSV Mapping tab → Edit; pick columns for date/amount/description; date format DD/MM/YYYY | Mapping persists |
| 22.3 | Preview CSV import | Upload a sample CSV (5 rows) | First rows displayed; nothing persisted |
| 22.4 | Import CSV | Confirm import | Statement + lines persist; line count matches CSV |
| 22.5 | Malformed CSV | Upload a CSV with a bad date | 400 BANK_STATEMENT_INVALID with row number; nothing persisted |
| 22.6 | Start reconciliation | New reconciliation; endDate end-of-month; statementBalance from bank | OPEN reconciliation created |
| 22.7 | Auto-match | Run auto-match button | Exact-amount matches highlighted; count returned |
| 22.8 | Manual N-to-1 | Select 1 bank deposit + N journal lines summing to its amount; click Match | Match persists; lines show as matched |
| 22.9 | Manual match — wrong sum | Select journal lines summing to wrong amount | 400 UNBALANCED |
| 22.10 | Add bank-fee adjustment | Click unmatched bank fee line → Add adjustment → pick Bank Fees expense | JE posts; line matches |
| 22.11 | Adjustment for locked-period bank line | Lock previous month; import statement with bank fee dated in locked month; add adjustment | JE posts in current open period with warning shown |
| 22.12 | Close balanced reconciliation | Match everything; difference 0; Close | Status CLOSED; report snapshot populated |
| 22.13 | Close unbalanced rejected | Leave a bank line unmatched; Close | 400 RECONCILIATION_UNBALANCED with diff |
| 22.14 | Admin reopen | On closed rec, click Reopen | Status OPEN; matches preserved; snapshot cleared |
| 22.15 | Finance cannot reopen | Log in as FINANCE; try to reopen | 403 |
| 22.16 | Delete unmatched statement | Statements tab → Delete an unmatched statement | Succeeds |
| 22.17 | Delete matched statement blocked | Try to delete a statement with matched lines | 400 |
| 22.18 | Arabic RTL | Switch to Arabic; walk all 4 screens | Mirrors correctly |
```

Commit:
```
git add docs/manual-test-plan.md
git commit -m "docs: add §22 manual test plan for accounting Phase 4"
```

---

# Section I — Final integration

### Task I1: Full sweep + smoke test

- [ ] **Step 1: Full server test suite**

```
cd server && npx vitest run --silent --reporter=verbose 2>&1 | grep -aE "Test Files|Tests +" | head -3
```

Expected: all tests pass. Should be ~390 total.

- [ ] **Step 2: Client typecheck**

```
cd client && npx tsc --noEmit
```

Expected: only the pre-existing `LoginPage.tsx` error.

- [ ] **Step 3: Start dev servers and walk the happy path**

```
# Terminal 1
cd server && npm run dev
# Terminal 2
cd client && npm run dev
```

In a browser, log in as ADMIN:

1. Visit `/accounting/banking` — page loads.
2. Create a Bank Account linked to GL Bank (1020).
3. Visit bank account detail → CSV Mapping tab → set mapping.
4. Import a sample CSV (3-5 lines covering deposits + a fee).
5. Start a Reconciliation for the imported month with the correct statement balance.
6. Run auto-match — exact matches snap into place.
7. Manually match a multi-line deposit (N-to-1).
8. Add an adjustment for the bank fee.
9. Close the reconciliation — should succeed with difference at 0.
10. Try to delete the closed reconciliation's statement — should be blocked.
11. Admin reopens the reconciliation — verify state reverts.
12. Switch UI to Arabic — verify RTL on all 4 screens.

- [ ] **Step 4: Run manual test plan §22** end-to-end.

- [ ] **Step 5: Final commit (only if smoke surfaced fixes)**

```
git add -p
git commit -m "fix(accounting): address issues found during Phase 4 smoke test"
```

---

## Done

Phase 4 ships and the accounting module is **feature-complete** vs the four-phase plan agreed on 2026-05-16.

Total counts after Phase 4:
- ~390 server tests across the module.
- 5 phases worth of feature: chart of accounts → ops auto-posting → statements + period close → bank reconciliation.
- 12 sidebar entries under the accounting umbrella (a nested-group sidebar refactor is overdue but still deferred).

---

## Self-review notes

**Spec coverage:**

- [x] BankAccount model — Tasks A2, D1
- [x] CSV mapping persisted per BankAccount — Tasks A2, D1
- [x] BankStatement + BankStatementLine — Tasks A2, B3
- [x] CSV parser in-house — Task B1
- [x] Date format token interpreter — Task B2
- [x] BankStatementService preview + atomic import — Task B3
- [x] Auto-match exact, sign-aware, date window — Task C1
- [x] Manual N-to-1 with sum equality, sign-consistency — Task C1
- [x] addAdjustmentAndMatch with period-lock fallback — Task C2
- [x] close with snapshot — Task C2
- [x] reopen admin-only — Task C2 (service), D3 (controller), D4 (route gating)
- [x] Reconciliation get with computed state — Task D3
- [x] Reconciliation CSV report — Task D3
- [x] BankAccounts/Statements/Reconciliations controllers — Tasks D1–D3
- [x] Routes wiring — Task D4
- [x] HTTP integration tests — Tasks E1–E3
- [x] Client API — Task F1
- [x] BankingPage — Task F2
- [x] BankAccountDetailPage + CsvImportWizard — Task F3
- [x] NewReconciliationModal + ReconciliationPage — Task F4
- [x] App routes — Task G1
- [x] Sidebar entry — Task G2
- [x] i18n EN+AR — Task G3
- [x] BRD v2.4 + manual test plan §22 — Tasks H1–H2
- [x] Smoke test — Task I1
- [x] 5 new error codes — Task A1

**Placeholder scan:** F3 and F4 leave detailed JSX to the implementer with "follow Phase 3 patterns" guidance — that's a deliberate trade-off given the plan's already-significant size. Both files have clear structural guidance and well-typed API clients to build against.

**Type consistency:**
- `BankAccount`, `BankStatement`, `BankStatementLine`, `Reconciliation`, `ReconciliationMatch` defined in Prisma (A2) and mirrored in client types (F1). ✓
- `ReconciliationStatus` enum: `OPEN | CLOSED` in shared (A1) and Prisma (A2). ✓
- `MatchingService` method signatures (C1, C2) match controller calls (D3) and client API (F1). ✓
- `BankStatementService.preview` returns `{ columnCount, sampleRows }` — matches controller and client. ✓
- `BankStatementService.import` returns `{ statementId, lineCount, dateRange }` — matches controller and client. ✓
- New error codes (`BANK_ACCOUNT_NOT_FOUND`, `BANK_STATEMENT_INVALID`, `RECONCILIATION_CLOSED`, `RECONCILIATION_UNBALANCED`, `LINE_ALREADY_MATCHED`) declared in shared (A1) and thrown in services (B3, C1, C2). ✓
