# Broker Module — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the Broker module — companies (`Broker`) with multiple people (`BrokerAgent`) — and let staff attach a broker+agent to a booking. Commission is computed (agent override → broker default) and stored on the booking. Phase 1 does **not** post to the GL; the commission lives on the booking only.

**Architecture:** Two new Prisma models (`Broker`, `BrokerAgent`) + four nullable columns on `Booking` (`brokerId`, `agentId`, `commissionType`, `commissionAmount`) + one nullable column on `Tenant` (`defaultAgentId`). Server enforces the invariant `agent.brokerId === booking.brokerId`. Booking create/update derives the effective commission rate from the agent's override or the broker's default. New top-level UI: `BrokersPage` (list of companies), `BrokerDetailPage` (with Agents and Bookings tabs; Payouts tab is a placeholder until Phase 2). Reusable `BrokerAgentSelector` flows the chosen (broker, agent) pair into `BookingFormModal`, `TenantDetailPage`, and `ApartmentDetailPage`. No accounting integration in this phase; GL posting + payouts come in Phase 2.

**Tech Stack:** Prisma + PostgreSQL, Express + TypeScript, Vitest (server tests), React + react-hook-form + zod + TanStack Query v5 (client). Client has no test framework — verification is `tsc` build + manual browser check.

**Source spec:** `docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md` § "Broker module".

**Phase 2 (out of scope for this plan):** `BrokerPayout` + `BrokerPayoutSettlement` models, settlement endpoint, mapping keys `BROKER_COMMISSION_EXPENSE` / `BROKERS_PAYABLE`, posting integration for ACCRUAL accrual + CASH-mode payout, Payouts tab on `BrokerDetailPage`. Phase 1 establishes the foundation.

---

## Vocabulary alignment

The BRD uses "broker" sometimes for the company, sometimes loosely. This plan and the new code use **strictly**:
- `Broker` = the company entity.
- `BrokerAgent` = a person who works for a broker.
- "Agent" alone (in UI copy) = `BrokerAgent`.

The pair `(brokerId, agentId)` is the unit of attribution; an `agentId` set requires a `brokerId` set, and `agent.brokerId === booking.brokerId`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/prisma/schema.prisma` | Modify | Add `Broker`, `BrokerAgent`, three enums (`BrokerStatus`, `BrokerAgentStatus`, `CommissionType`); add `brokerId`/`agentId`/`commissionType`/`commissionAmount` to `Booking`; add `defaultAgentId` to `Tenant` |
| `server/prisma/migrations/<new>/migration.sql` | Create | DDL for new tables/enums/columns |
| `shared/index.ts` | Modify | Export `BrokerStatus`, `BrokerAgentStatus`, `CommissionType` enums for client |
| `server/src/services/bookings/commission.ts` | Create | Pure `resolveCommission` function — single source of truth for "agent override else broker default" + amount math |
| `server/src/services/bookings/commission.test.ts` | Create | Unit tests for `resolveCommission` |
| `server/src/controllers/brokers.controller.ts` | Create | List/create/get/update/soft-delete `Broker`; nested list/create for agents under a broker |
| `server/src/controllers/brokers.controller.test.ts` | Create | HTTP tests for broker + agent CRUD + cross-company search |
| `server/src/controllers/broker-agents.controller.ts` | Create | get/update/soft-delete a `BrokerAgent` by id; flat search across brokers |
| `server/src/routes/brokers.routes.ts` | Create | Wire all broker routes |
| `server/src/routes/broker-agents.routes.ts` | Create | Wire all agent routes |
| `server/src/index.ts` (or app.ts) | Modify | Mount the new route files |
| `server/src/controllers/bookings.controller.ts` | Modify | Accept `brokerId`/`agentId` on create + update; enforce invariant; call `resolveCommission`; persist all four new fields |
| `server/src/controllers/bookings.controller.test.ts` | Modify | New tests for broker/agent invariant + commission compute + override on create |
| `server/src/controllers/tenants.controller.ts` | Modify | Accept `defaultAgentId` in create/update |
| `client/src/hooks/useBrokers.ts` | Create | TanStack queries + mutations for brokers + agents (CRUD + search) |
| `client/src/pages/brokers/BrokerFormModal.tsx` | Create | Create/edit a broker company |
| `client/src/pages/brokers/BrokerAgentFormModal.tsx` | Create | Create/edit a broker agent (broker FK pre-set from context) |
| `client/src/components/BrokerAgentSelector.tsx` | Create | Hierarchical (broker → agent) searchable selector |
| `client/src/pages/brokers/BrokersPage.tsx` | Create | List of broker companies with search + summary stats |
| `client/src/pages/brokers/BrokerDetailPage.tsx` | Create | Broker info + tabs: Agents, Bookings, Payouts (placeholder) |
| `client/src/pages/bookings/BookingFormModal.tsx` | Modify | Integrate `<BrokerAgentSelector />`; submit broker/agent fields |
| `client/src/hooks/useBookings.ts` | Modify | Extend `CreateBookingDto` and Detail/List types with broker/agent/commission fields |
| `client/src/pages/tenants/TenantDetailPage.tsx` | Modify | Show "Default agent" + change picker |
| `client/src/pages/apartments/ApartmentDetailPage.tsx` | Modify | Convenience picker (no persistence on apartment) |
| `client/src/components/layout/Sidebar.tsx` | Modify | Add "Brokers" nav entry between Tenants and Bookings |
| `client/src/App.tsx` | Modify | Register `/brokers` + `/brokers/:id` routes |

---

## Task 1: Schema + migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_broker_module_phase_1/migration.sql`

- [ ] **Step 1: Add three enums to `schema.prisma`**

Locate the existing enum block (search for `enum DepositStatus`). Add immediately after it:

```prisma
enum BrokerStatus {
  ACTIVE
  INACTIVE
}

enum BrokerAgentStatus {
  ACTIVE
  INACTIVE
}

enum CommissionType {
  PERCENT
  FLAT
}
```

- [ ] **Step 2: Add `Broker` model**

After the `Tenant` model in `schema.prisma`, add:

```prisma
model Broker {
  id                     Int             @id @default(autoincrement())
  name                   String
  phone                  String
  email                  String?
  taxRegistrationNumber  String?
  address                String?
  notes                  String?
  status                 BrokerStatus    @default(ACTIVE)
  commissionType         CommissionType  @default(PERCENT)
  defaultCommissionValue Decimal         @default(0) @db.Decimal(10, 2)
  createdAt              DateTime        @default(now())
  updatedAt              DateTime        @updatedAt
  deletedAt              DateTime?
  createdBy              Int?
  updatedBy              Int?
  deletedBy              Int?

  agents   BrokerAgent[]
  bookings Booking[]

  creator User? @relation("BrokerCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater User? @relation("BrokerUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  deleter User? @relation("BrokerDeletedBy", fields: [deletedBy], references: [id], onDelete: SetNull)

  @@index([status, deletedAt])
}
```

- [ ] **Step 3: Add `BrokerAgent` model**

Immediately after the `Broker` model, add:

```prisma
model BrokerAgent {
  id                      Int                @id @default(autoincrement())
  brokerId                Int
  fullName                String
  phone                   String
  email                   String?
  idNumber                String?
  notes                   String?
  status                  BrokerAgentStatus  @default(ACTIVE)
  commissionType          CommissionType?
  commissionValueOverride Decimal?           @db.Decimal(10, 2)
  createdAt               DateTime           @default(now())
  updatedAt               DateTime           @updatedAt
  deletedAt               DateTime?
  createdBy               Int?
  updatedBy               Int?
  deletedBy               Int?

  broker   Broker   @relation(fields: [brokerId], references: [id], onDelete: Restrict)
  bookings Booking[]
  tenants  Tenant[]

  creator User? @relation("BrokerAgentCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater User? @relation("BrokerAgentUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  deleter User? @relation("BrokerAgentDeletedBy", fields: [deletedBy], references: [id], onDelete: SetNull)

  @@index([brokerId, status])
  @@index([brokerId, deletedAt])
}
```

- [ ] **Step 4: Add new fields to `Booking` and `Tenant` models**

In the `Booking` model, after the existing `discountAmount` line (added in CR-3), add:

```prisma
  brokerId          Int?
  agentId           Int?
  commissionType    CommissionType?
  commissionAmount  Decimal?       @db.Decimal(10, 2)

  broker Broker?      @relation(fields: [brokerId], references: [id], onDelete: SetNull)
  agent  BrokerAgent? @relation(fields: [agentId], references: [id], onDelete: SetNull)
```

In the `Tenant` model, before the existing `bookings Booking[]` line, add:

```prisma
  defaultAgentId Int?

  defaultAgent BrokerAgent? @relation(fields: [defaultAgentId], references: [id], onDelete: SetNull)
```

- [ ] **Step 5: Add back-relations on `User` for the new audit columns**

The `User` model already has back-relations for many entities (apartments, tenants, bookings, etc.). Add five more, placed near the existing `createdAttachments` / `createdTaxCodes` etc. group:

```prisma
  createdBrokers       Broker[]      @relation("BrokerCreatedBy")
  updatedBrokers       Broker[]      @relation("BrokerUpdatedBy")
  deletedBrokers       Broker[]      @relation("BrokerDeletedBy")
  createdBrokerAgents  BrokerAgent[] @relation("BrokerAgentCreatedBy")
  updatedBrokerAgents  BrokerAgent[] @relation("BrokerAgentUpdatedBy")
  deletedBrokerAgents  BrokerAgent[] @relation("BrokerAgentDeletedBy")
```

- [ ] **Step 6: Generate the migration**

From `D:/Hotel Apartment Management System/server`:

```
npx prisma migrate dev --name broker_module_phase_1 --create-only
```

This creates a new migration directory. Inspect the generated `migration.sql` — it should contain:
- Three `CREATE TYPE` statements (the new enums).
- Two `CREATE TABLE` statements (`Broker`, `BrokerAgent`) with all columns + FK constraints.
- Five `ALTER TABLE "Booking" ADD COLUMN` statements (brokerId, agentId, commissionType, commissionAmount, plus FK definitions in separate statements).
- One `ALTER TABLE "Tenant" ADD COLUMN defaultAgentId INTEGER` plus its FK.
- `CREATE INDEX` statements for the `@@index` directives.

If anything looks off, fix the schema and regenerate (delete the directory, re-run `--create-only`).

- [ ] **Step 7: Apply the migration locally**

```
npx prisma migrate dev
```

Expected: `Migration applied`, `@prisma/client` regenerated. No warnings about data loss (all new columns are nullable or have defaults).

- [ ] **Step 8: Apply the migration to the test database**

Same pattern Task 1 of CR-3 used:

```
$env:DATABASE_URL = "postgresql://..."  # test DB URL — read from .env.test or wherever the project keeps it
npx prisma migrate deploy
```

If the project has a `server/package.json` script like `db:migrate:test`, prefer that.

- [ ] **Step 9: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(brokers): schema for Broker + BrokerAgent + booking/tenant FK columns

Adds Broker (company) and BrokerAgent (person) models with audit
columns and soft-delete support. Adds three enums (BrokerStatus,
BrokerAgentStatus, CommissionType). Booking gets nullable brokerId,
agentId, commissionType, commissionAmount columns. Tenant gets a
nullable defaultAgentId. No existing rows are migrated — all new
columns are nullable with no backfill needed.

Phase 1 of the broker module: no GL/accounting integration yet.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared enums + `resolveCommission` pure function (TDD)

**Files:**
- Modify: `shared/index.ts`
- Create: `server/src/services/bookings/commission.ts`
- Create: `server/src/services/bookings/commission.test.ts`

- [ ] **Step 1: Export enums in `shared/index.ts`**

Add immediately after the existing `enum AccountingMode` (or similar location near other shared enums):

```ts
export enum BrokerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum BrokerAgentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum CommissionType {
  PERCENT = 'PERCENT',
  FLAT = 'FLAT',
}
```

- [ ] **Step 2: Write the failing tests**

Create `server/src/services/bookings/commission.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { resolveCommission } from './commission';

const Dec = (v: string | number) => new Prisma.Decimal(v);

describe('resolveCommission', () => {
  it('returns null when there is no broker', () => {
    const result = resolveCommission({
      broker: null,
      agent: null,
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toBeNull();
  });

  it('uses broker default when no agent override is set', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(5) },
      agent: null,
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(50).toString(),
    });
  });

  it('uses agent override when both override type and value are set', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(5) },
      agent: { commissionType: 'PERCENT', commissionValueOverride: Dec(10) },
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(100).toString(),
    });
  });

  it('falls back to broker default when agent has type but no value', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(5) },
      agent: { commissionType: 'PERCENT', commissionValueOverride: null },
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(50).toString(),
    });
  });

  it('uses FLAT broker default ignoring booking total', () => {
    const result = resolveCommission({
      broker: { commissionType: 'FLAT', defaultCommissionValue: Dec(500) },
      agent: null,
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'FLAT',
      commissionAmount: Dec(500).toString(),
    });
  });

  it('lets staff override the final amount even when broker/agent dictate a default', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(5) },
      agent: null,
      bookingTotal: Dec(1000),
      override: 75, // staff says "actually pay 75"
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(75).toString(),
    });
  });

  it('rounds PERCENT result to 2 decimal places', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec('3.33') },
      agent: null,
      bookingTotal: Dec('333.33'),
      override: undefined,
    });
    // 3.33% of 333.33 = 11.099889 → rounds to 11.10
    expect(result?.commissionAmount).toBe('11.1');
  });

  it('returns null when broker is set but type/default is unusable AND no override given', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(0) },
      agent: null,
      bookingTotal: Dec(1000),
      override: undefined,
    });
    // Zero commission is a valid value — return 0, not null
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(0).toString(),
    });
  });
});
```

- [ ] **Step 3: Run the tests, watch them fail**

```
npm --prefix server test commission.test.ts
```

Expected: FAIL — module `./commission` not found.

- [ ] **Step 4: Implement the function**

Create `server/src/services/bookings/commission.ts`:

```ts
import { Prisma } from '@prisma/client';

export type Decimalish = string | number | Prisma.Decimal;

export interface BrokerLike {
  commissionType: 'PERCENT' | 'FLAT';
  defaultCommissionValue: Prisma.Decimal | Decimalish;
}

export interface AgentLike {
  commissionType: 'PERCENT' | 'FLAT' | null;
  commissionValueOverride: Prisma.Decimal | Decimalish | null;
}

export interface ResolveCommissionInput {
  broker: BrokerLike | null;
  agent: AgentLike | null;
  bookingTotal: Decimalish;
  override: Decimalish | undefined;
}

export interface ResolvedCommission {
  commissionType: 'PERCENT' | 'FLAT';
  commissionAmount: string;
}

const HUNDRED = new Prisma.Decimal(100);
const toDec = (v: Decimalish): Prisma.Decimal =>
  v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v as any);

export function resolveCommission(input: ResolveCommissionInput): ResolvedCommission | null {
  if (!input.broker) return null;

  const useAgentRate =
    input.agent &&
    input.agent.commissionType !== null &&
    input.agent.commissionValueOverride !== null;

  const commissionType = useAgentRate
    ? (input.agent!.commissionType as 'PERCENT' | 'FLAT')
    : input.broker.commissionType;

  const rateValue = useAgentRate
    ? toDec(input.agent!.commissionValueOverride as Decimalish)
    : toDec(input.broker.defaultCommissionValue);

  let amount: Prisma.Decimal;
  if (input.override !== undefined) {
    amount = toDec(input.override).toDecimalPlaces(2);
  } else if (commissionType === 'PERCENT') {
    amount = toDec(input.bookingTotal).times(rateValue).dividedBy(HUNDRED).toDecimalPlaces(2);
  } else {
    amount = rateValue.toDecimalPlaces(2);
  }

  return { commissionType, commissionAmount: amount.toString() };
}
```

- [ ] **Step 5: Run the tests, watch them pass**

```
npm --prefix server test commission.test.ts
```

Expected: PASS (8/8).

- [ ] **Step 6: Commit**

```bash
git add shared/index.ts server/src/services/bookings/commission.ts server/src/services/bookings/commission.test.ts
git commit -m "$(cat <<'EOF'
feat(brokers): resolveCommission pure function + shared enums

Exports BrokerStatus, BrokerAgentStatus, CommissionType enums.
Adds resolveCommission(broker, agent, bookingTotal, override) that
returns null when no broker, agent override when both type+value
present on agent, broker default otherwise. Staff override always
wins. PERCENT result rounds to 2dp; FLAT is taken as-is.

8/8 tests passing.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Broker + BrokerAgent controllers + routes

**Files:**
- Create: `server/src/controllers/brokers.controller.ts`
- Create: `server/src/controllers/broker-agents.controller.ts`
- Create: `server/src/controllers/brokers.controller.test.ts`
- Create: `server/src/routes/brokers.routes.ts`
- Create: `server/src/routes/broker-agents.routes.ts`
- Modify: `server/src/index.ts` (or wherever routes are mounted)

- [ ] **Step 1: Read the existing routes mounting code**

Open `server/src/index.ts` (or `app.ts` — find the file that has `app.use('/auth', ...)`). Note the exact pattern used to mount routes (e.g. `app.use('/api/v1/brokers', brokersRoutes)` or similar). Match that prefix exactly when adding new routes.

- [ ] **Step 2: Write tests first**

Create `server/src/controllers/brokers.controller.test.ts`. Read `server/src/controllers/tenants.controller.test.ts` to learn the fixture / auth pattern (which token names, how `request(app)` is set up, etc.) and match it. The tests should cover:

```ts
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
// Adapt these imports to match the existing test file's imports
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { getAdminToken /* or whatever the helper is */ } from './test-helpers';

let adminToken: string;

beforeAll(async () => {
  adminToken = await getAdminToken();
});

beforeEach(async () => {
  await prisma.brokerAgent.deleteMany();
  await prisma.broker.deleteMany();
});

describe('Brokers API', () => {
  describe('POST /brokers', () => {
    it('creates a broker with required fields', async () => {
      const res = await request(app)
        .post('/api/v1/brokers') // adjust prefix to match project's mount path
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Acme Referrals',
          phone: '+971500000001',
          commissionType: 'PERCENT',
          defaultCommissionValue: 5,
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Acme Referrals');
      expect(res.body.status).toBe('ACTIVE');
      expect(Number(res.body.defaultCommissionValue)).toBe(5);
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/brokers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects negative defaultCommissionValue', async () => {
      const res = await request(app)
        .post('/api/v1/brokers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'X',
          phone: '+971500000002',
          commissionType: 'FLAT',
          defaultCommissionValue: -10,
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /brokers', () => {
    it('lists active brokers and excludes soft-deleted', async () => {
      const a = await prisma.broker.create({
        data: { name: 'Active', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      await prisma.broker.create({
        data: { name: 'Gone', phone: '+2', commissionType: 'PERCENT', defaultCommissionValue: 5, deletedAt: new Date() },
      });
      const res = await request(app)
        .get('/api/v1/brokers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.map((b: any) => b.id)).toEqual([a.id]);
    });

    it('search filter matches name (case-insensitive)', async () => {
      await prisma.broker.create({
        data: { name: 'Alpha Co', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      await prisma.broker.create({
        data: { name: 'Beta Co', phone: '+2', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const res = await request(app)
        .get('/api/v1/brokers?search=alpha')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.map((b: any) => b.name)).toEqual(['Alpha Co']);
    });
  });

  describe('PATCH /brokers/:id', () => {
    it('updates the rate and notes', async () => {
      const b = await prisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const res = await request(app)
        .patch(`/api/v1/brokers/${b.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ defaultCommissionValue: 7.5, notes: 'now 7.5%' });
      expect(res.status).toBe(200);
      expect(Number(res.body.defaultCommissionValue)).toBe(7.5);
      expect(res.body.notes).toBe('now 7.5%');
    });
  });

  describe('DELETE /brokers/:id', () => {
    it('soft-deletes when no active agents and no commission-owed bookings', async () => {
      const b = await prisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const res = await request(app)
        .delete(`/api/v1/brokers/${b.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
      const after = await prisma.broker.findUnique({ where: { id: b.id } });
      expect(after?.deletedAt).not.toBeNull();
    });

    it('rejects soft-delete when broker has ACTIVE agents', async () => {
      const b = await prisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      await prisma.brokerAgent.create({
        data: { brokerId: b.id, fullName: 'A', phone: '+1', status: 'ACTIVE' },
      });
      const res = await request(app)
        .delete(`/api/v1/brokers/${b.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/active agents/i);
    });
  });

  describe('Agents nested under a broker', () => {
    it('creates an agent under a broker', async () => {
      const b = await prisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const res = await request(app)
        .post(`/api/v1/brokers/${b.id}/agents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Jane', phone: '+97150000000' });
      expect(res.status).toBe(201);
      expect(res.body.brokerId).toBe(b.id);
      expect(res.body.fullName).toBe('Jane');
      expect(res.body.status).toBe('ACTIVE');
    });

    it('lists agents under a broker, excluding soft-deleted', async () => {
      const b = await prisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const active = await prisma.brokerAgent.create({
        data: { brokerId: b.id, fullName: 'A', phone: '+1' },
      });
      await prisma.brokerAgent.create({
        data: { brokerId: b.id, fullName: 'B', phone: '+2', deletedAt: new Date() },
      });
      const res = await request(app)
        .get(`/api/v1/brokers/${b.id}/agents`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.map((a: any) => a.id)).toEqual([active.id]);
    });

    it('agent PATCH can set commission override', async () => {
      const b = await prisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const a = await prisma.brokerAgent.create({
        data: { brokerId: b.id, fullName: 'A', phone: '+1' },
      });
      const res = await request(app)
        .patch(`/api/v1/agents/${a.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ commissionType: 'PERCENT', commissionValueOverride: 10 });
      expect(res.status).toBe(200);
      expect(res.body.commissionType).toBe('PERCENT');
      expect(Number(res.body.commissionValueOverride)).toBe(10);
    });
  });

  describe('GET /agents?search=', () => {
    it('flat agent search across brokers, grouped in response', async () => {
      const b1 = await prisma.broker.create({
        data: { name: 'B1', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const b2 = await prisma.broker.create({
        data: { name: 'B2', phone: '+2', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      await prisma.brokerAgent.create({ data: { brokerId: b1.id, fullName: 'Alice', phone: '+1' } });
      await prisma.brokerAgent.create({ data: { brokerId: b2.id, fullName: 'Alex', phone: '+2' } });

      const res = await request(app)
        .get('/api/v1/agents?search=al')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      // Response shape: array of { broker: { id, name }, agents: [{ id, fullName, ... }] }
      expect(res.body.length).toBe(2);
      const names = res.body.flatMap((g: any) => g.agents.map((a: any) => a.fullName));
      expect(names.sort()).toEqual(['Alex', 'Alice']);
    });
  });
});
```

- [ ] **Step 3: Run the tests, watch them fail**

```
npm --prefix server test brokers.controller.test.ts
```

Expected: every test fails (controllers/routes don't exist yet).

- [ ] **Step 4: Implement `brokers.controller.ts`**

Create `server/src/controllers/brokers.controller.ts`:

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { CommissionType } from '@hotel/shared';

const VALID_TYPES = Object.values(CommissionType);

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const brokers = await prisma.broker.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status: status as 'ACTIVE' | 'INACTIVE' } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }
          : {}),
      },
      include: {
        _count: { select: { agents: { where: { deletedAt: null } }, bookings: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(brokers);
  } catch (err) {
    next(err);
  }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, phone, email, taxRegistrationNumber, address, notes, commissionType, defaultCommissionValue } =
      req.body as {
        name?: string;
        phone?: string;
        email?: string;
        taxRegistrationNumber?: string;
        address?: string;
        notes?: string;
        commissionType?: string;
        defaultCommissionValue?: number;
      };

    if (!name || !phone) {
      res.status(400).json({ message: 'name and phone are required' });
      return;
    }
    if (commissionType && !VALID_TYPES.includes(commissionType as CommissionType)) {
      res.status(400).json({ message: `commissionType must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (defaultCommissionValue !== undefined && (typeof defaultCommissionValue !== 'number' || defaultCommissionValue < 0)) {
      res.status(400).json({ message: 'defaultCommissionValue must be a non-negative number' });
      return;
    }

    const broker = await prisma.broker.create({
      data: {
        name,
        phone,
        email: email ?? null,
        taxRegistrationNumber: taxRegistrationNumber ?? null,
        address: address ?? null,
        notes: notes ?? null,
        commissionType: (commissionType as CommissionType) ?? CommissionType.PERCENT,
        defaultCommissionValue: defaultCommissionValue ?? 0,
        createdBy: req.user?.id ?? null,
        updatedBy: req.user?.id ?? null,
      },
    });
    res.status(201).json(broker);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const broker = await prisma.broker.findFirst({
      where: { id, deletedAt: null },
      include: {
        agents: { where: { deletedAt: null }, orderBy: { fullName: 'asc' } },
      },
    });
    if (!broker) {
      res.status(404).json({ message: 'Broker not found' });
      return;
    }
    res.json(broker);
  } catch (err) {
    next(err);
  }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.broker.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Broker not found' });
      return;
    }
    const { name, phone, email, taxRegistrationNumber, address, notes, status, commissionType, defaultCommissionValue } =
      req.body as {
        name?: string;
        phone?: string;
        email?: string | null;
        taxRegistrationNumber?: string | null;
        address?: string | null;
        notes?: string | null;
        status?: 'ACTIVE' | 'INACTIVE';
        commissionType?: 'PERCENT' | 'FLAT';
        defaultCommissionValue?: number;
      };

    if (defaultCommissionValue !== undefined && (typeof defaultCommissionValue !== 'number' || defaultCommissionValue < 0)) {
      res.status(400).json({ message: 'defaultCommissionValue must be a non-negative number' });
      return;
    }
    if (commissionType && !VALID_TYPES.includes(commissionType as CommissionType)) {
      res.status(400).json({ message: `commissionType must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }

    const broker = await prisma.broker.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(taxRegistrationNumber !== undefined ? { taxRegistrationNumber } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(commissionType !== undefined ? { commissionType } : {}),
        ...(defaultCommissionValue !== undefined ? { defaultCommissionValue } : {}),
        updatedBy: req.user?.id ?? null,
      },
    });
    res.json(broker);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.broker.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Broker not found' });
      return;
    }

    const activeAgentCount = await prisma.brokerAgent.count({
      where: { brokerId: id, deletedAt: null, status: 'ACTIVE' },
    });
    if (activeAgentCount > 0) {
      res.status(409).json({
        message: 'Cannot delete broker with active agents. Deactivate all agents first.',
      });
      return;
    }

    // Phase 1: no commission-owed check (commission tracking lives only on the booking with no GL
    // accrual yet). Phase 2 will add a "commission OWED on a booking referencing this broker" check.

    await prisma.broker.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: req.user?.id ?? null },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Nested agent endpoints under a broker
export async function listAgents(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const brokerId = Number(req.params.brokerId);
    const agents = await prisma.brokerAgent.findMany({
      where: { brokerId, deletedAt: null },
      orderBy: { fullName: 'asc' },
    });
    res.json(agents);
  } catch (err) {
    next(err);
  }
}

export async function createAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const brokerId = Number(req.params.brokerId);
    const broker = await prisma.broker.findFirst({ where: { id: brokerId, deletedAt: null } });
    if (!broker) {
      res.status(404).json({ message: 'Broker not found' });
      return;
    }
    const { fullName, phone, email, idNumber, notes, commissionType, commissionValueOverride } = req.body as {
      fullName?: string;
      phone?: string;
      email?: string;
      idNumber?: string;
      notes?: string;
      commissionType?: string;
      commissionValueOverride?: number;
    };
    if (!fullName || !phone) {
      res.status(400).json({ message: 'fullName and phone are required' });
      return;
    }
    if (commissionType && !VALID_TYPES.includes(commissionType as CommissionType)) {
      res.status(400).json({ message: `commissionType must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (commissionValueOverride !== undefined && (typeof commissionValueOverride !== 'number' || commissionValueOverride < 0)) {
      res.status(400).json({ message: 'commissionValueOverride must be a non-negative number' });
      return;
    }
    const agent = await prisma.brokerAgent.create({
      data: {
        brokerId,
        fullName,
        phone,
        email: email ?? null,
        idNumber: idNumber ?? null,
        notes: notes ?? null,
        commissionType: (commissionType as CommissionType) ?? null,
        commissionValueOverride: commissionValueOverride ?? null,
        createdBy: req.user?.id ?? null,
        updatedBy: req.user?.id ?? null,
      },
    });
    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 5: Implement `broker-agents.controller.ts`**

Create `server/src/controllers/broker-agents.controller.ts`:

```ts
import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { CommissionType } from '@hotel/shared';

const VALID_TYPES = Object.values(CommissionType);

export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const agent = await prisma.brokerAgent.findFirst({
      where: { id, deletedAt: null },
      include: { broker: true },
    });
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (err) {
    next(err);
  }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.brokerAgent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    const { fullName, phone, email, idNumber, notes, status, commissionType, commissionValueOverride } =
      req.body as {
        fullName?: string;
        phone?: string;
        email?: string | null;
        idNumber?: string | null;
        notes?: string | null;
        status?: 'ACTIVE' | 'INACTIVE';
        commissionType?: 'PERCENT' | 'FLAT' | null;
        commissionValueOverride?: number | null;
      };
    if (commissionType && !['PERCENT', 'FLAT', null].includes(commissionType as any)) {
      res.status(400).json({ message: `commissionType must be PERCENT, FLAT, or null` });
      return;
    }
    if (commissionValueOverride !== undefined && commissionValueOverride !== null && (typeof commissionValueOverride !== 'number' || commissionValueOverride < 0)) {
      res.status(400).json({ message: 'commissionValueOverride must be a non-negative number or null' });
      return;
    }
    const agent = await prisma.brokerAgent.update({
      where: { id },
      data: {
        ...(fullName !== undefined ? { fullName } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(idNumber !== undefined ? { idNumber } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(commissionType !== undefined ? { commissionType } : {}),
        ...(commissionValueOverride !== undefined ? { commissionValueOverride } : {}),
        updatedBy: req.user?.id ?? null,
      },
    });
    res.json(agent);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.brokerAgent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    // Phase 1: no commission-owed check yet. Phase 2 will block when any active booking
    // references this agent with commission still owed (not yet settled).
    await prisma.brokerAgent.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: req.user?.id ?? null },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const agents = await prisma.brokerAgent.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        broker: { deletedAt: null, status: 'ACTIVE' },
        ...(q
          ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }
          : {}),
      },
      include: { broker: { select: { id: true, name: true } } },
      orderBy: [{ broker: { name: 'asc' } }, { fullName: 'asc' }],
    });

    // Group by broker for the selector UI
    const groups = new Map<number, { broker: { id: number; name: string }; agents: typeof agents }>();
    for (const a of agents) {
      const key = a.broker.id;
      if (!groups.has(key)) {
        groups.set(key, { broker: a.broker, agents: [] });
      }
      groups.get(key)!.agents.push(a);
    }
    res.json(Array.from(groups.values()));
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 6: Create the route files**

Create `server/src/routes/brokers.routes.ts`:

```ts
import { Router } from 'express';
import { list, create, getById, update, remove, listAgents, createAgent } from '../controllers/brokers.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.get('/', list);
router.post('/', requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE), create);
router.get('/:id', getById);
router.patch('/:id', requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE), update);
router.delete('/:id', requireRole(Role.SUPER_ADMIN, Role.ADMIN), remove);

router.get('/:brokerId/agents', listAgents);
router.post('/:brokerId/agents', requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE), createAgent);

export default router;
```

Create `server/src/routes/broker-agents.routes.ts`:

```ts
import { Router } from 'express';
import { getById, update, remove, search } from '../controllers/broker-agents.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.get('/', search);
router.get('/:id', getById);
router.patch('/:id', requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE), update);
router.delete('/:id', requireRole(Role.SUPER_ADMIN, Role.ADMIN), remove);

export default router;
```

- [ ] **Step 7: Mount the new routes**

In `server/src/index.ts` (or wherever routes are mounted), add the two new route imports + `app.use` calls. Match the existing prefix pattern. Example:

```ts
import brokersRoutes from './routes/brokers.routes';
import brokerAgentsRoutes from './routes/broker-agents.routes';

// ... after other app.use(...) calls
app.use('/api/v1/brokers', brokersRoutes);
app.use('/api/v1/agents', brokerAgentsRoutes);
```

The exact prefix MUST match the existing pattern (probably `/api/v1/...`). Read the file before editing.

- [ ] **Step 8: Run tests until green**

```
npm --prefix server test brokers.controller.test.ts
```

Iterate until all tests pass.

- [ ] **Step 9: Commit**

```bash
git add server/src/controllers/brokers.controller.ts server/src/controllers/brokers.controller.test.ts server/src/controllers/broker-agents.controller.ts server/src/routes/brokers.routes.ts server/src/routes/broker-agents.routes.ts server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(brokers): broker + agent controllers, routes, and HTTP tests (Phase 1)

Adds /api/v1/brokers (list/create/get/update/soft-delete) with
nested /:brokerId/agents (list/create). Adds /api/v1/agents
(search/get/update/soft-delete). Broker soft-delete is blocked
while any active agents remain. Search across agents is grouped
by broker for the selector UI.

Phase 1 does not enforce commission-owed checks on soft-delete —
that comes with Phase 2's GL accrual.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Booking controller — accept broker/agent + invariant + commission compute

**Files:**
- Modify: `server/src/controllers/bookings.controller.ts`
- Modify: `server/src/controllers/bookings.controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `server/src/controllers/bookings.controller.test.ts`, inside the existing `describe('POST /bookings', ...)`:

```ts
  it('accepts a broker + agent and stores both on the booking', async () => {
    const apt = await prisma.apartment.findFirst({ where: { status: 'AVAILABLE' } });
    const tenant = await prisma.tenant.findFirst();
    const broker = await prisma.broker.create({
      data: { name: 'B', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
    });
    const agent = await prisma.brokerAgent.create({
      data: { brokerId: broker.id, fullName: 'A', phone: '+1' },
    });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        apartmentId: apt!.id,
        tenantId: tenant!.id,
        checkIn: new Date(Date.now() + 86_400_000).toISOString(),
        checkOut: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        rentAmount: 1000,
        brokerId: broker.id,
        agentId: agent.id,
        payment: { method: 'CASH', amount: 100 },
      });

    expect(res.status).toBe(201);
    expect(res.body.brokerId).toBe(broker.id);
    expect(res.body.agentId).toBe(agent.id);
    expect(res.body.commissionType).toBe('PERCENT');
    expect(Number(res.body.commissionAmount)).toBe(50); // 5% of 1000
  });

  it('rejects (422) when agent.brokerId does not match booking.brokerId', async () => {
    const apt = await prisma.apartment.findFirst({ where: { status: 'AVAILABLE' } });
    const tenant = await prisma.tenant.findFirst();
    const b1 = await prisma.broker.create({
      data: { name: 'B1', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
    });
    const b2 = await prisma.broker.create({
      data: { name: 'B2', phone: '+2', commissionType: 'PERCENT', defaultCommissionValue: 5 },
    });
    const agentOfB1 = await prisma.brokerAgent.create({
      data: { brokerId: b1.id, fullName: 'A', phone: '+1' },
    });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        apartmentId: apt!.id,
        tenantId: tenant!.id,
        checkIn: new Date(Date.now() + 86_400_000).toISOString(),
        checkOut: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        rentAmount: 1000,
        brokerId: b2.id,
        agentId: agentOfB1.id, // mismatch
        payment: { method: 'CASH', amount: 100 },
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/agent.*broker/i);
  });

  it('uses agent commission override when both type and value are set on the agent', async () => {
    const apt = await prisma.apartment.findFirst({ where: { status: 'AVAILABLE' } });
    const tenant = await prisma.tenant.findFirst();
    const broker = await prisma.broker.create({
      data: { name: 'B', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
    });
    const agent = await prisma.brokerAgent.create({
      data: {
        brokerId: broker.id,
        fullName: 'A',
        phone: '+1',
        commissionType: 'PERCENT',
        commissionValueOverride: 10,
      },
    });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        apartmentId: apt!.id,
        tenantId: tenant!.id,
        checkIn: new Date(Date.now() + 86_400_000).toISOString(),
        checkOut: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        rentAmount: 1000,
        brokerId: broker.id,
        agentId: agent.id,
        payment: { method: 'CASH', amount: 100 },
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.commissionAmount)).toBe(100); // 10% of 1000
  });

  it('staff-supplied commissionAmount overrides computed value', async () => {
    const apt = await prisma.apartment.findFirst({ where: { status: 'AVAILABLE' } });
    const tenant = await prisma.tenant.findFirst();
    const broker = await prisma.broker.create({
      data: { name: 'B', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
    });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        apartmentId: apt!.id,
        tenantId: tenant!.id,
        checkIn: new Date(Date.now() + 86_400_000).toISOString(),
        checkOut: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        rentAmount: 1000,
        brokerId: broker.id,
        commissionAmount: 75,
        payment: { method: 'CASH', amount: 100 },
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.commissionAmount)).toBe(75);
    expect(res.body.commissionType).toBe('PERCENT'); // type still from broker
  });

  it('with no broker, commission fields are null', async () => {
    const apt = await prisma.apartment.findFirst({ where: { status: 'AVAILABLE' } });
    const tenant = await prisma.tenant.findFirst();

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        apartmentId: apt!.id,
        tenantId: tenant!.id,
        checkIn: new Date(Date.now() + 86_400_000).toISOString(),
        checkOut: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        rentAmount: 1000,
        payment: { method: 'CASH', amount: 100 },
      });
    expect(res.status).toBe(201);
    expect(res.body.brokerId).toBeNull();
    expect(res.body.agentId).toBeNull();
    expect(res.body.commissionType).toBeNull();
    expect(res.body.commissionAmount).toBeNull();
  });
```

- [ ] **Step 2: Run tests, watch them fail**

```
npm --prefix server test bookings.controller.test.ts
```

- [ ] **Step 3: Extend the controller**

Open `server/src/controllers/bookings.controller.ts`.

**3a.** Add import (place near the existing `import { computeBookingTotal }`):

```ts
import { resolveCommission } from '../services/bookings/commission';
```

**3b.** In `create`, extend the request body destructure to include the new fields. Replace the existing destructure block with one that includes:

```ts
      brokerId,
      agentId,
      commissionAmount: rawCommissionAmount,
```

…added to the existing destructured fields list, with corresponding entries in the `as { ... }` type:

```ts
      brokerId?: number;
      agentId?: number;
      commissionAmount?: number;
```

**3c.** After tenant/apartment validation and before the existing `const settings = await prisma.systemSettings.findUnique(...)` block, add:

```ts
    let resolvedBrokerId: number | null = null;
    let resolvedAgentId: number | null = null;
    let resolvedCommissionType: 'PERCENT' | 'FLAT' | null = null;
    let resolvedCommissionAmount: number | null = null;

    if (brokerId !== undefined && brokerId !== null) {
      const broker = await prisma.broker.findFirst({
        where: { id: Number(brokerId), deletedAt: null },
      });
      if (!broker) {
        res.status(404).json({ message: 'Broker not found' });
        return;
      }
      resolvedBrokerId = broker.id;

      let agentRecord: { commissionType: 'PERCENT' | 'FLAT' | null; commissionValueOverride: any; brokerId: number } | null = null;
      if (agentId !== undefined && agentId !== null) {
        agentRecord = await prisma.brokerAgent.findFirst({
          where: { id: Number(agentId), deletedAt: null },
          select: { commissionType: true, commissionValueOverride: true, brokerId: true },
        });
        if (!agentRecord) {
          res.status(404).json({ message: 'Agent not found' });
          return;
        }
        if (agentRecord.brokerId !== broker.id) {
          res.status(422).json({ message: 'Agent does not belong to the specified broker' });
          return;
        }
        resolvedAgentId = Number(agentId);
      }

      const commission = resolveCommission({
        broker: { commissionType: broker.commissionType, defaultCommissionValue: broker.defaultCommissionValue },
        agent: agentRecord
          ? { commissionType: agentRecord.commissionType, commissionValueOverride: agentRecord.commissionValueOverride }
          : null,
        bookingTotal: totals.totalAmount, // computed earlier in the function via computeBookingTotal
        override: rawCommissionAmount,
      });
      if (commission) {
        resolvedCommissionType = commission.commissionType;
        resolvedCommissionAmount = Number(commission.commissionAmount);
      }
    } else if (agentId !== undefined && agentId !== null) {
      // agentId without brokerId is invalid — invariant requires both
      res.status(422).json({ message: 'agentId requires brokerId to be set' });
      return;
    }
```

NOTE: This block depends on `totals` being computed already. Re-read the existing function — if the order is "validate → load apartment/tenant → compute totals → create booking", insert this block AFTER `totals` is computed and BEFORE the `tx.booking.create(...)` call.

**3d.** Add the four new fields to the `tx.booking.create({ data: { ... } })` call:

```ts
            brokerId: resolvedBrokerId,
            agentId: resolvedAgentId,
            commissionType: resolvedCommissionType,
            commissionAmount: resolvedCommissionAmount,
```

**3e.** Also update the `update` handler (PATCH /:id) so it accepts broker/agent/commissionAmount changes. The same invariant applies. Refresh `commissionAmount` whenever broker, agent, or override changes; preserve existing values if none of these are touched. Add this block AFTER the existing component validation:

```ts
    // Broker/agent invariants + commission re-compute on update
    let brokerUpdate: {
      brokerId?: number | null;
      agentId?: number | null;
      commissionType?: 'PERCENT' | 'FLAT' | null;
      commissionAmount?: number | null;
    } = {};

    const brokerTouched = 'brokerId' in req.body || 'agentId' in req.body || 'commissionAmount' in req.body;
    if (brokerTouched) {
      const nextBrokerId = req.body.brokerId === undefined ? existing.brokerId : req.body.brokerId;
      const nextAgentId = req.body.agentId === undefined ? existing.agentId : req.body.agentId;
      const nextOverride = req.body.commissionAmount;

      if (nextBrokerId === null || nextBrokerId === undefined) {
        // Clearing broker also clears agent + commission
        brokerUpdate = { brokerId: null, agentId: null, commissionType: null, commissionAmount: null };
      } else {
        const broker = await prisma.broker.findFirst({
          where: { id: Number(nextBrokerId), deletedAt: null },
        });
        if (!broker) {
          res.status(404).json({ message: 'Broker not found' });
          return;
        }
        let agentRecord: { commissionType: 'PERCENT' | 'FLAT' | null; commissionValueOverride: any; brokerId: number } | null = null;
        if (nextAgentId !== null && nextAgentId !== undefined) {
          agentRecord = await prisma.brokerAgent.findFirst({
            where: { id: Number(nextAgentId), deletedAt: null },
            select: { commissionType: true, commissionValueOverride: true, brokerId: true },
          });
          if (!agentRecord) {
            res.status(404).json({ message: 'Agent not found' });
            return;
          }
          if (agentRecord.brokerId !== broker.id) {
            res.status(422).json({ message: 'Agent does not belong to the specified broker' });
            return;
          }
        }
        const commission = resolveCommission({
          broker: { commissionType: broker.commissionType, defaultCommissionValue: broker.defaultCommissionValue },
          agent: agentRecord
            ? { commissionType: agentRecord.commissionType, commissionValueOverride: agentRecord.commissionValueOverride }
            : null,
          bookingTotal: totals.totalAmount,
          override: nextOverride,
        });
        brokerUpdate = {
          brokerId: broker.id,
          agentId: nextAgentId ?? null,
          commissionType: commission?.commissionType ?? null,
          commissionAmount: commission ? Number(commission.commissionAmount) : null,
        };
      }
    }

    // Merge brokerUpdate into the prisma.booking.update data alongside existing component fields:
    //   data: { ..., ...brokerUpdate }
```

(Adapt the final merge to match the existing PATCH handler's structure.)

- [ ] **Step 4: Run tests, watch them pass**

```
npm --prefix server test bookings.controller.test.ts
```

If broker-related tests fail because the test database lacks a broker schema, ensure Task 1's migration was applied to the test DB before re-running.

Then run the full server suite to catch regressions:

```
npm --prefix server test
```

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/bookings.controller.ts server/src/controllers/bookings.controller.test.ts
git commit -m "$(cat <<'EOF'
feat(bookings): broker + agent attribution with invariant + commission compute

Booking create/update accept optional brokerId/agentId/commissionAmount.
Invariant agent.brokerId === booking.brokerId is enforced (422). Commission
is computed via resolveCommission (agent override → broker default → staff
override). All four new booking fields persist.

Phase 1 of the broker module. No GL accrual yet (deferred to Phase 2).

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Tenant controller — `defaultAgentId` support

**Files:**
- Modify: `server/src/controllers/tenants.controller.ts`
- Modify: `server/src/controllers/tenants.controller.test.ts`

- [ ] **Step 1: Read the existing tenant controller**

Read `server/src/controllers/tenants.controller.ts`. The `create` and `update` handlers will be extended to accept `defaultAgentId`.

- [ ] **Step 2: Write the failing tests**

Append to `server/src/controllers/tenants.controller.test.ts`:

```ts
  it('accepts defaultAgentId on create', async () => {
    const broker = await prisma.broker.create({
      data: { name: 'B', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
    });
    const agent = await prisma.brokerAgent.create({
      data: { brokerId: broker.id, fullName: 'A', phone: '+1' },
    });

    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'New Tenant',
        phone: '+97150000000',
        idNumber: 'ID-NEW-1',
        defaultAgentId: agent.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.defaultAgentId).toBe(agent.id);
  });

  it('rejects defaultAgentId pointing to a non-existent agent (404)', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Bad',
        phone: '+97150000001',
        idNumber: 'ID-NEW-2',
        defaultAgentId: 999999,
      });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/agent/i);
  });

  it('clears defaultAgentId on update when set to null', async () => {
    const broker = await prisma.broker.create({
      data: { name: 'B', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
    });
    const agent = await prisma.brokerAgent.create({
      data: { brokerId: broker.id, fullName: 'A', phone: '+1' },
    });
    const tenant = await prisma.tenant.create({
      data: {
        fullName: 'T',
        phone: '+1',
        idNumber: 'ID-T-1',
        defaultAgentId: agent.id,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/tenants/${tenant.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ defaultAgentId: null });
    expect(res.status).toBe(200);
    expect(res.body.defaultAgentId).toBeNull();
  });
```

- [ ] **Step 3: Extend the controller**

In `tenants.controller.ts`, the `create` handler accepts a request body. Add `defaultAgentId` parsing. The exact code depends on the existing destructure pattern — adapt to match. Conceptual additions:

```ts
const { /* existing fields */, defaultAgentId } = req.body as { /* existing */; defaultAgentId?: number | null };

if (defaultAgentId !== undefined && defaultAgentId !== null) {
  const agent = await prisma.brokerAgent.findFirst({
    where: { id: Number(defaultAgentId), deletedAt: null },
  });
  if (!agent) {
    res.status(404).json({ message: 'Default agent not found' });
    return;
  }
}

// In prisma.tenant.create:
//   defaultAgentId: defaultAgentId ?? null,
```

For `update`, accept `defaultAgentId` (including explicit `null` to clear), validate existence when non-null, and pass through to `prisma.tenant.update`.

- [ ] **Step 4: Run tests until green**

```
npm --prefix server test tenants.controller.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/tenants.controller.ts server/src/controllers/tenants.controller.test.ts
git commit -m "$(cat <<'EOF'
feat(tenants): defaultAgentId for repeat-broker referrals (Phase 1)

Tenant create/update accept defaultAgentId (nullable, validated to
exist if non-null). The booking form (separate commit) will use it
to pre-fill the broker selector for this tenant's future bookings.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Client hooks for brokers + agents

**Files:**
- Create: `client/src/hooks/useBrokers.ts`

- [ ] **Step 1: Implement the hook file**

Create `client/src/hooks/useBrokers.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { BrokerStatus, BrokerAgentStatus, CommissionType } from '@hotel/shared';

export interface Broker {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  taxRegistrationNumber: string | null;
  address: string | null;
  notes: string | null;
  status: BrokerStatus;
  commissionType: CommissionType;
  defaultCommissionValue: string;
  createdAt: string;
  _count?: { agents: number; bookings: number };
}

export interface BrokerAgent {
  id: number;
  brokerId: number;
  fullName: string;
  phone: string;
  email: string | null;
  idNumber: string | null;
  notes: string | null;
  status: BrokerAgentStatus;
  commissionType: CommissionType | null;
  commissionValueOverride: string | null;
  createdAt: string;
}

export interface BrokerDetail extends Broker {
  agents: BrokerAgent[];
}

export interface CreateBrokerDto {
  name: string;
  phone: string;
  email?: string;
  taxRegistrationNumber?: string;
  address?: string;
  notes?: string;
  commissionType?: CommissionType;
  defaultCommissionValue?: number;
}

export interface UpdateBrokerDto extends Partial<CreateBrokerDto> {
  status?: BrokerStatus;
}

export interface CreateBrokerAgentDto {
  fullName: string;
  phone: string;
  email?: string;
  idNumber?: string;
  notes?: string;
  commissionType?: CommissionType;
  commissionValueOverride?: number;
}

export interface UpdateBrokerAgentDto extends Partial<CreateBrokerAgentDto> {
  status?: BrokerAgentStatus;
}

export interface AgentGroup {
  broker: { id: number; name: string };
  agents: BrokerAgent[];
}

export function useBrokers(search?: string) {
  return useQuery<Broker[]>({
    queryKey: ['brokers', search ?? ''],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/brokers${params}`);
      return res.data;
    },
  });
}

export function useBroker(id: number) {
  return useQuery<BrokerDetail>({
    queryKey: ['broker', id],
    queryFn: async () => (await api.get(`/brokers/${id}`)).data,
    enabled: id > 0,
  });
}

export function useCreateBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBrokerDto) => api.post('/brokers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brokers'] }),
  });
}

export function useUpdateBroker(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBrokerDto) => api.patch(`/brokers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brokers'] });
      qc.invalidateQueries({ queryKey: ['broker', id] });
    },
  });
}

export function useDeleteBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/brokers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brokers'] }),
  });
}

export function useCreateBrokerAgent(brokerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBrokerAgentDto) => api.post(`/brokers/${brokerId}/agents`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broker', brokerId] });
      qc.invalidateQueries({ queryKey: ['agent-search'] });
    },
  });
}

export function useUpdateBrokerAgent(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBrokerAgentDto) => api.patch(`/agents/${id}`, data),
    onSuccess: (res) => {
      const brokerId = (res.data as BrokerAgent).brokerId;
      qc.invalidateQueries({ queryKey: ['broker', brokerId] });
      qc.invalidateQueries({ queryKey: ['agent-search'] });
    },
  });
}

export function useDeleteBrokerAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broker'] });
      qc.invalidateQueries({ queryKey: ['agent-search'] });
    },
  });
}

export function useAgentSearch(search: string) {
  return useQuery<AgentGroup[]>({
    queryKey: ['agent-search', search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/agents${params}`);
      return res.data;
    },
  });
}
```

- [ ] **Step 2: TypeScript check**

```
npm --prefix client run build
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useBrokers.ts
git commit -m "$(cat <<'EOF'
feat(brokers): TanStack hooks for brokers + agents (Phase 1)

useBrokers / useBroker / useCreateBroker / useUpdateBroker /
useDeleteBroker for the company entity. useCreateBrokerAgent /
useUpdateBrokerAgent / useDeleteBrokerAgent for the person entity
(operate via the nested or /agents/:id routes). useAgentSearch for
the BrokerAgentSelector's typeahead, returning broker-grouped results.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: BrokerFormModal + BrokerAgentFormModal

**Files:**
- Create: `client/src/pages/brokers/BrokerFormModal.tsx`
- Create: `client/src/pages/brokers/BrokerAgentFormModal.tsx`

Both modals follow the same shape pattern as `TenantFormModal.tsx` (existing reference for form modal style). Key requirements:

- [ ] **Step 1: BrokerFormModal**

Create `client/src/pages/brokers/BrokerFormModal.tsx`:

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { CommissionType, BrokerStatus } from '@hotel/shared';
import { useCreateBroker, useUpdateBroker, Broker } from '../../hooks/useBrokers';

const schema = z.object({
  name: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  email: z.string().email().optional().or(z.literal('')),
  taxRegistrationNumber: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(BrokerStatus).optional(),
  commissionType: z.nativeEnum(CommissionType),
  defaultCommissionValue: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  broker?: Broker | null;
  onClose: () => void;
  onSaved?: (broker: Broker) => void;
}

export default function BrokerFormModal({ broker, onClose, onSaved }: Props) {
  const isEdit = !!broker;
  const create = useCreateBroker();
  const update = useUpdateBroker(broker?.id ?? -1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      taxRegistrationNumber: '',
      address: '',
      notes: '',
      commissionType: CommissionType.PERCENT,
      defaultCommissionValue: 0,
    },
  });

  useEffect(() => {
    if (broker) {
      reset({
        name: broker.name,
        phone: broker.phone,
        email: broker.email ?? '',
        taxRegistrationNumber: broker.taxRegistrationNumber ?? '',
        address: broker.address ?? '',
        notes: broker.notes ?? '',
        status: broker.status,
        commissionType: broker.commissionType,
        defaultCommissionValue: Number(broker.defaultCommissionValue),
      });
    }
  }, [broker, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      const payload = {
        ...data,
        email: data.email || undefined,
        taxRegistrationNumber: data.taxRegistrationNumber || undefined,
        address: data.address || undefined,
        notes: data.notes || undefined,
      };
      const res = isEdit
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      toast.success(isEdit ? 'Saved' : 'Broker created');
      onSaved?.(res.data as Broker);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Something went wrong');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-[90vw] lg:max-w-md p-6 border border-outline-variant max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">{isEdit ? 'Edit broker' : 'New broker'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors" type="button">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Company name</label>
            <input {...register('name')} className={inputCls} autoFocus />
            {errors.name && <p className="text-error text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input {...register('phone')} type="tel" className={inputCls} />
            {errors.phone && <p className="text-error text-xs mt-1">{errors.phone.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Email <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <input {...register('email')} type="email" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tax Registration Number <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <input {...register('taxRegistrationNumber')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Address <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <input {...register('address')} className={inputCls} />
          </div>

          <div className="border-t border-outline-variant pt-4">
            <p className="text-sm font-bold text-on-surface mb-3">Default commission</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Type</label>
                <select {...register('commissionType')} className={inputCls}>
                  <option value="PERCENT">Percent</option>
                  <option value="FLAT">Flat (AED)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Value</label>
                <input {...register('defaultCommissionValue')} type="number" min="0" step="0.01" className={inputCls} />
              </div>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls}>Status</label>
              <select {...register('status')} className={inputCls}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Notes <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <textarea {...register('notes')} rows={3} className={inputCls + ' resize-none'} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: BrokerAgentFormModal**

Create `client/src/pages/brokers/BrokerAgentFormModal.tsx`. The agent form has the same shape, but with these differences:
- Props: `agent?: BrokerAgent | null`, `brokerId: number` (REQUIRED — agents always live under a broker), `onClose`, `onSaved`.
- Fields: fullName, phone, email, idNumber, notes, status (edit only), commissionType (optional), commissionValueOverride (optional).
- Uses `useCreateBrokerAgent(brokerId)` for create, `useUpdateBrokerAgent(agent.id)` for edit.
- Commission section says "Override broker default (optional)" with a clear "leave blank to use broker's default" hint.

Full code:

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { CommissionType, BrokerAgentStatus } from '@hotel/shared';
import { useCreateBrokerAgent, useUpdateBrokerAgent, BrokerAgent } from '../../hooks/useBrokers';

const schema = z.object({
  fullName: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  email: z.string().email().optional().or(z.literal('')),
  idNumber: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(BrokerAgentStatus).optional(),
  commissionType: z.union([z.nativeEnum(CommissionType), z.literal('')]).optional(),
  commissionValueOverride: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  brokerId: number;
  agent?: BrokerAgent | null;
  onClose: () => void;
  onSaved?: (agent: BrokerAgent) => void;
}

export default function BrokerAgentFormModal({ brokerId, agent, onClose, onSaved }: Props) {
  const isEdit = !!agent;
  const create = useCreateBrokerAgent(brokerId);
  const update = useUpdateBrokerAgent(agent?.id ?? -1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '', phone: '', email: '', idNumber: '', notes: '',
      commissionType: '', commissionValueOverride: '',
    },
  });

  useEffect(() => {
    if (agent) {
      reset({
        fullName: agent.fullName,
        phone: agent.phone,
        email: agent.email ?? '',
        idNumber: agent.idNumber ?? '',
        notes: agent.notes ?? '',
        status: agent.status,
        commissionType: agent.commissionType ?? '',
        commissionValueOverride: agent.commissionValueOverride !== null ? Number(agent.commissionValueOverride) : '',
      });
    }
  }, [agent, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      const payload = {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email || undefined,
        idNumber: data.idNumber || undefined,
        notes: data.notes || undefined,
        commissionType: data.commissionType === '' ? undefined : (data.commissionType as CommissionType),
        commissionValueOverride: data.commissionValueOverride === '' ? undefined : Number(data.commissionValueOverride),
        ...(isEdit && data.status ? { status: data.status } : {}),
      };
      const res = isEdit
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      toast.success(isEdit ? 'Saved' : 'Agent created');
      onSaved?.(res.data as BrokerAgent);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Something went wrong');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-[90vw] lg:max-w-md p-6 border border-outline-variant max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">{isEdit ? 'Edit agent' : 'New agent'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors" type="button">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Full name</label>
            <input {...register('fullName')} className={inputCls} autoFocus />
            {errors.fullName && <p className="text-error text-xs mt-1">{errors.fullName.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input {...register('phone')} type="tel" className={inputCls} />
            {errors.phone && <p className="text-error text-xs mt-1">{errors.phone.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Email <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <input {...register('email')} type="email" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>ID number <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <input {...register('idNumber')} className={inputCls} />
          </div>

          <div className="border-t border-outline-variant pt-4">
            <p className="text-sm font-bold text-on-surface mb-1">Override broker default <span className="font-normal text-on-surface-variant">(optional)</span></p>
            <p className="text-xs text-on-surface-variant mb-3">Leave blank to use this broker's default commission.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Type</label>
                <select {...register('commissionType')} className={inputCls}>
                  <option value="">(use default)</option>
                  <option value="PERCENT">Percent</option>
                  <option value="FLAT">Flat (AED)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Value</label>
                <input {...register('commissionValueOverride')} type="number" min="0" step="0.01" className={inputCls} placeholder="(use default)" />
              </div>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls}>Status</label>
              <select {...register('status')} className={inputCls}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Notes <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <textarea {...register('notes')} rows={3} className={inputCls + ' resize-none'} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build + commit**

```
npm --prefix client run build
```

Expected: passes.

```bash
git add client/src/pages/brokers/BrokerFormModal.tsx client/src/pages/brokers/BrokerAgentFormModal.tsx
git commit -m "$(cat <<'EOF'
feat(brokers): BrokerFormModal + BrokerAgentFormModal (Phase 1)

Two create/edit modals matching the TenantFormModal pattern. Broker
form captures company info + default commission. Agent form is always
opened with a brokerId in scope; agent commission fields are optional
overrides ("leave blank to use broker default").

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: BrokerAgentSelector reusable component

**Files:**
- Create: `client/src/components/BrokerAgentSelector.tsx`

The selector is the most reused piece in Phase 1: it appears in `BookingFormModal`, `TenantDetailPage`, and `ApartmentDetailPage`. Three modes:
- **Pick existing** — searchable typeahead of agents grouped under their broker company.
- **+ New agent under <broker>** — opens `BrokerAgentFormModal` pre-filled with the chosen company.
- **+ New broker** — opens `BrokerFormModal`; on save the new broker becomes "selected" (without an agent) and the user can immediately add an agent under it.

- [ ] **Step 1: Implement the component**

Create `client/src/components/BrokerAgentSelector.tsx`:

```tsx
import { useState } from 'react';
import { useAgentSearch, useBroker, Broker, BrokerAgent } from '../hooks/useBrokers';
import BrokerFormModal from '../pages/brokers/BrokerFormModal';
import BrokerAgentFormModal from '../pages/brokers/BrokerAgentFormModal';

export interface BrokerAgentSelection {
  brokerId: number | null;
  agentId: number | null;
}

interface Props {
  value: BrokerAgentSelection;
  onChange: (next: BrokerAgentSelection, agent?: BrokerAgent | null, broker?: Broker | null) => void;
  disabled?: boolean;
  className?: string;
}

export default function BrokerAgentSelector({ value, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState<{ brokerId: number } | null>(null);
  const { data: groups = [] } = useAgentSearch(search);

  // Resolve the current display label
  const { data: currentBroker } = useBroker(value.brokerId ?? -1);
  const currentAgent = currentBroker?.agents.find((a) => a.id === value.agentId) ?? null;
  const displayLabel = value.agentId
    ? `${currentAgent?.fullName ?? `Agent #${value.agentId}`} — ${currentBroker?.name ?? ''}`
    : value.brokerId
      ? `${currentBroker?.name ?? `Broker #${value.brokerId}`} (no agent)`
      : 'No broker selected';

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';

  function clear() {
    onChange({ brokerId: null, agentId: null }, null, null);
    setOpen(false);
  }

  function pickAgent(agent: BrokerAgent, broker: { id: number; name: string }) {
    onChange({ brokerId: broker.id, agentId: agent.id }, agent, null);
    setOpen(false);
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={inputCls + ' text-left flex items-center justify-between' + (disabled ? ' opacity-60 cursor-not-allowed' : '')}
      >
        <span className={value.brokerId ? 'text-on-surface' : 'text-on-surface-variant'}>{displayLabel}</span>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg max-h-96 overflow-y-auto">
          <div className="p-2 border-b border-outline-variant">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search broker or agent…"
              className={inputCls + ' text-xs'}
            />
          </div>

          {value.brokerId !== null && (
            <button type="button" onClick={clear} className="w-full text-left px-3 py-2 text-xs text-error hover:bg-surface-container">
              Clear selection
            </button>
          )}

          {groups.length === 0 && search && (
            <p className="p-3 text-xs text-on-surface-variant">No agents match "{search}".</p>
          )}

          {groups.map((g) => (
            <div key={g.broker.id} className="border-b border-outline-variant last:border-b-0">
              <div className="px-3 py-2 bg-surface-container text-xs font-bold text-on-surface flex items-center justify-between">
                <span>{g.broker.name}</span>
                <button
                  type="button"
                  onClick={() => setShowAgentModal({ brokerId: g.broker.id })}
                  className="text-primary text-xs hover:underline"
                >
                  + Agent
                </button>
              </div>
              {g.agents.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => pickAgent(a, g.broker)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-container flex items-center justify-between"
                >
                  <span>{a.fullName}</span>
                  <span className="text-xs text-on-surface-variant">{a.phone}</span>
                </button>
              ))}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setShowBrokerModal(true)}
            className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container border-t border-outline-variant"
          >
            + New broker
          </button>
        </div>
      )}

      {showBrokerModal && (
        <BrokerFormModal
          onClose={() => setShowBrokerModal(false)}
          onSaved={(broker) => {
            onChange({ brokerId: broker.id, agentId: null }, null, broker);
            setShowBrokerModal(false);
            setShowAgentModal({ brokerId: broker.id });
          }}
        />
      )}

      {showAgentModal && (
        <BrokerAgentFormModal
          brokerId={showAgentModal.brokerId}
          onClose={() => setShowAgentModal(null)}
          onSaved={(agent) => {
            onChange({ brokerId: agent.brokerId, agentId: agent.id }, agent, null);
            setShowAgentModal(null);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
```

Notes:
- Keeps the dropdown logic local; no portal needed.
- Uses `useBroker(value.brokerId ?? -1)` to fetch the current broker for the display label. The `enabled: id > 0` guard in the hook prevents a wasted request when no broker is selected.

- [ ] **Step 2: Build + commit**

```
npm --prefix client run build
```

```bash
git add client/src/components/BrokerAgentSelector.tsx
git commit -m "$(cat <<'EOF'
feat(brokers): BrokerAgentSelector reusable picker (Phase 1)

Hierarchical typeahead that returns a {brokerId, agentId} pair.
Supports three flows: pick existing agent grouped under broker,
"+ Agent" under an existing broker, and "+ New broker" (which
chains into "+ Agent" automatically). Used by BookingFormModal
plus tenant/apartment pages.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: BrokersPage + BrokerDetailPage

**Files:**
- Create: `client/src/pages/brokers/BrokersPage.tsx`
- Create: `client/src/pages/brokers/BrokerDetailPage.tsx`

- [ ] **Step 1: BrokersPage (list)**

Create `client/src/pages/brokers/BrokersPage.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';
import Badge from '../../components/ui/Badge';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useBrokers } from '../../hooks/useBrokers';
import BrokerFormModal from './BrokerFormModal';

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: 'Active', classes: 'bg-green-100 text-green-800' },
  INACTIVE: { label: 'Inactive', classes: 'bg-surface-container text-on-surface-variant' },
};

export default function BrokersPage() {
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { data: brokers = [], isLoading } = useBrokers(search);

  const canCreate = user?.role === Role.SUPER_ADMIN || user?.role === Role.ADMIN || user?.role === Role.FINANCE;
  const totalActive = brokers.filter((b) => b.status === 'ACTIVE').length;
  const totalAgents = brokers.reduce((sum, b) => sum + (b._count?.agents ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Brokers</h1>
          <p className="text-sm text-on-surface-variant mt-1">Referral companies and their agents</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Broker
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4 border border-outline-variant">
          <span className="material-symbols-outlined text-3xl text-primary">apartment</span>
          <div>
            <p className="text-2xl font-bold text-on-surface">{brokers.length}</p>
            <p className="text-xs text-on-surface-variant">Total brokers</p>
          </div>
        </div>
        <div className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4 border border-outline-variant">
          <span className="material-symbols-outlined text-3xl text-green-600">check_circle</span>
          <div>
            <p className="text-2xl font-bold text-on-surface">{totalActive}</p>
            <p className="text-xs text-on-surface-variant">Active</p>
          </div>
        </div>
        <div className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4 border border-outline-variant">
          <span className="material-symbols-outlined text-3xl text-blue-600">person</span>
          <div>
            <p className="text-2xl font-bold text-on-surface">{totalAgents}</p>
            <p className="text-xs text-on-surface-variant">Active agents</p>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant">
        <input
          type="text"
          placeholder="Search brokers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <TableContainer
        isLoading={isLoading}
        isEmpty={!isLoading && brokers.length === 0}
        emptyMessage="No brokers yet."
      >
        <Table>
          <TableHead headers={['Name', 'Phone', 'Default rate', 'Agents', 'Status']} />
          <TableBody>
            {brokers.map((b) => (
              <TableRow key={b.id}>
                <TableCell variant="strong">
                  <Link to={`/brokers/${b.id}`} className="text-primary hover:underline">{b.name}</Link>
                </TableCell>
                <TableCell variant="muted">{b.phone}</TableCell>
                <TableCell variant="text">
                  {b.commissionType === 'PERCENT'
                    ? `${Number(b.defaultCommissionValue)}%`
                    : `AED ${Number(b.defaultCommissionValue).toFixed(2)}`}
                </TableCell>
                <TableCell variant="text">{b._count?.agents ?? 0}</TableCell>
                <TableCell>
                  <Badge className={STATUS_BADGE[b.status].classes}>{STATUS_BADGE[b.status].label}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {createOpen && <BrokerFormModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: BrokerDetailPage with tabs**

Create `client/src/pages/brokers/BrokerDetailPage.tsx`:

```tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useBroker, useDeleteBrokerAgent, BrokerAgent } from '../../hooks/useBrokers';
import { useBookingsList } from '../../hooks/useBookings';
import BrokerFormModal from './BrokerFormModal';
import BrokerAgentFormModal from './BrokerAgentFormModal';
import Badge from '../../components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';

type Tab = 'agents' | 'bookings' | 'payouts';

export default function BrokerDetailPage() {
  const { id } = useParams();
  const brokerId = Number(id);
  const { data: broker, isLoading } = useBroker(brokerId);
  const { data: user } = useAuth();
  const [tab, setTab] = useState<Tab>('agents');
  const [editOpen, setEditOpen] = useState(false);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<BrokerAgent | null>(null);
  const deleteAgent = useDeleteBrokerAgent();

  const canEdit = user?.role === Role.SUPER_ADMIN || user?.role === Role.ADMIN || user?.role === Role.FINANCE;

  // We re-use the existing bookings list filter via brokerId param.
  // If the server's GET /bookings does not yet support a brokerId filter,
  // we add that filter in Task 9 client-side by passing it through.
  // For Phase 1 simplicity, we show "Bookings tab coming soon" if the endpoint doesn't support it.
  const { data: bookingsRes } = useBookingsList({});

  if (isLoading) return <div className="p-6 text-on-surface-variant">Loading…</div>;
  if (!broker) return <div className="p-6 text-error">Broker not found.</div>;

  const brokerBookings = (bookingsRes?.data ?? []).filter((b: any) => b.brokerId === broker.id);

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
    }`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/brokers" className="text-sm text-primary hover:underline">← Brokers</Link>
          <h1 className="text-2xl font-bold text-on-surface mt-1">{broker.name}</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {broker.phone} {broker.email && `• ${broker.email}`}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditOpen(true)}
            className="px-4 py-2 border border-outline-variant text-on-surface rounded-lg text-sm font-medium hover:bg-surface-container transition-colors"
          >
            Edit broker
          </button>
        )}
      </div>

      <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-on-surface-variant">Status</p>
          <Badge className={broker.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-surface-container text-on-surface-variant'}>
            {broker.status}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant">Default commission</p>
          <p className="text-sm font-bold text-on-surface">
            {broker.commissionType === 'PERCENT'
              ? `${Number(broker.defaultCommissionValue)}%`
              : `AED ${Number(broker.defaultCommissionValue).toFixed(2)}`}
          </p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant">Agents</p>
          <p className="text-sm font-bold text-on-surface">{broker.agents.length}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant">Bookings</p>
          <p className="text-sm font-bold text-on-surface">{brokerBookings.length}</p>
        </div>
      </div>

      <div className="border-b border-outline-variant flex gap-2">
        <button className={tabCls('agents')} onClick={() => setTab('agents')}>Agents ({broker.agents.length})</button>
        <button className={tabCls('bookings')} onClick={() => setTab('bookings')}>Bookings ({brokerBookings.length})</button>
        <button className={tabCls('payouts')} onClick={() => setTab('payouts')}>Payouts</button>
      </div>

      {tab === 'agents' && (
        <div className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <button
                onClick={() => setNewAgentOpen(true)}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Add Agent
              </button>
            </div>
          )}
          <TableContainer isLoading={false} isEmpty={broker.agents.length === 0} emptyMessage="No agents yet.">
            <Table>
              <TableHead headers={['Name', 'Phone', 'Override', 'Status', '']} />
              <TableBody>
                {broker.agents.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell variant="strong">{a.fullName}</TableCell>
                    <TableCell variant="muted">{a.phone}</TableCell>
                    <TableCell variant="text">
                      {a.commissionType && a.commissionValueOverride
                        ? a.commissionType === 'PERCENT'
                          ? `${Number(a.commissionValueOverride)}%`
                          : `AED ${Number(a.commissionValueOverride).toFixed(2)}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={a.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-surface-container text-on-surface-variant'}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell align="right">
                      {canEdit && (
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditAgent(a)} className="text-xs text-primary hover:underline">Edit</button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete agent ${a.fullName}?`)) return;
                              try {
                                await deleteAgent.mutateAsync(a.id);
                                toast.success('Agent deleted');
                              } catch (err: unknown) {
                                toast.error('Failed to delete');
                              }
                            }}
                            className="text-xs text-error hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}

      {tab === 'bookings' && (
        <TableContainer isLoading={false} isEmpty={brokerBookings.length === 0} emptyMessage="No bookings referenced this broker yet.">
          <Table>
            <TableHead headers={['Tenant', 'Apartment', 'Total', 'Commission', 'Status']} />
            <TableBody>
              {brokerBookings.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell variant="strong">{b.tenant?.fullName ?? '—'}</TableCell>
                  <TableCell variant="text">{b.apartment?.number ?? '—'}</TableCell>
                  <TableCell variant="text">AED {Number(b.totalAmount).toFixed(2)}</TableCell>
                  <TableCell variant="text">
                    {b.commissionAmount !== null ? `AED ${Number(b.commissionAmount).toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-amber-100 text-amber-800">Owed</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 'payouts' && (
        <div className="bg-surface-container-low rounded-2xl p-8 border border-outline-variant text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant">payments</span>
          <p className="text-sm text-on-surface-variant mt-2">Payouts arrive in Phase 2 of the broker module.</p>
        </div>
      )}

      {editOpen && <BrokerFormModal broker={broker} onClose={() => setEditOpen(false)} />}
      {newAgentOpen && <BrokerAgentFormModal brokerId={broker.id} onClose={() => setNewAgentOpen(false)} />}
      {editAgent && <BrokerAgentFormModal brokerId={broker.id} agent={editAgent} onClose={() => setEditAgent(null)} />}
    </div>
  );
}
```

NOTE on bookings tab: this Phase-1 implementation filters the full bookings list client-side. For very large datasets it's not ideal — Phase 2 should add a `brokerId` query param to `GET /bookings`. Phase 1's bookings count is approximate; the underlying list query may paginate. Acceptable for v1; revisit if perf becomes an issue.

- [ ] **Step 3: Wire routes**

In `client/src/App.tsx`, find the existing route declarations (search for `<Route path="/tenants"`). Add:

```tsx
<Route path="/brokers" element={<BrokersPage />} />
<Route path="/brokers/:id" element={<BrokerDetailPage />} />
```

Add the imports:

```tsx
import BrokersPage from './pages/brokers/BrokersPage';
import BrokerDetailPage from './pages/brokers/BrokerDetailPage';
```

- [ ] **Step 4: Add sidebar nav entry**

In `client/src/components/layout/Sidebar.tsx`, find the existing "Tenants" nav entry. Add a new "Brokers" entry directly after it. Match the existing entry's shape exactly (icon, label, route, role check if any). Use `apartment` or `handshake` as the material icon.

- [ ] **Step 5: Build + commit**

```
npm --prefix client run build
```

```bash
git add client/src/pages/brokers/BrokersPage.tsx client/src/pages/brokers/BrokerDetailPage.tsx client/src/App.tsx client/src/components/layout/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(brokers): BrokersPage + BrokerDetailPage with Agents/Bookings/Payouts tabs

List page with search + summary stats. Detail page shows broker info,
agents tab (create/edit/delete), bookings tab (client-filtered for now,
Phase 2 will add a server-side brokerId filter on /bookings), and a
Payouts tab placeholder until Phase 2 ships the payout flow.

Adds /brokers + /brokers/:id routes and a sidebar nav entry between
Tenants and Bookings.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: BookingFormModal — integrate selector + DTO

**Files:**
- Modify: `client/src/hooks/useBookings.ts`
- Modify: `client/src/pages/bookings/BookingFormModal.tsx`

- [ ] **Step 1: Extend `CreateBookingDto` and types**

In `client/src/hooks/useBookings.ts`, add to `CreateBookingDto`:

```ts
  brokerId?: number;
  agentId?: number;
  commissionAmount?: number;
```

Add to `BookingDetail`:

```ts
  brokerId: number | null;
  agentId: number | null;
  commissionType: 'PERCENT' | 'FLAT' | null;
  commissionAmount: string | null;
```

Add the same four fields to `BookingListItem`.

- [ ] **Step 2: Integrate the selector into `BookingFormModal`**

In `client/src/pages/bookings/BookingFormModal.tsx`:

**2a.** Add imports:

```ts
import BrokerAgentSelector, { BrokerAgentSelection } from '../../components/BrokerAgentSelector';
```

**2b.** Add state inside the component body:

```ts
  const [brokerSelection, setBrokerSelection] = useState<BrokerAgentSelection>({ brokerId: null, agentId: null });
  const [commissionOverride, setCommissionOverride] = useState<string>('');
```

**2c.** Place the selector + override input AFTER the Tenant field and BEFORE the dates field. Use the existing labelCls/inputCls. Wrap in a section:

```tsx
          {/* Broker (optional) */}
          <div className="border-t border-outline-variant pt-4">
            <p className="text-sm font-bold text-on-surface mb-3">Referrer <span className="font-normal text-on-surface-variant">(optional)</span></p>
            <BrokerAgentSelector
              value={brokerSelection}
              onChange={setBrokerSelection}
            />
            {brokerSelection.brokerId && (
              <div className="mt-3">
                <label className={labelCls}>Commission override <span className="font-normal text-on-surface-variant">(optional)</span></label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Use computed default"
                  value={commissionOverride}
                  onChange={(e) => setCommissionOverride(e.target.value)}
                  className={inputCls}
                />
                <p className="text-xs text-on-surface-variant mt-1">Leave blank to compute from the agent/broker default rate.</p>
              </div>
            )}
          </div>
```

**2d.** In `onSubmit`, add the broker/agent fields to the payload:

```ts
        ...(brokerSelection.brokerId !== null ? { brokerId: brokerSelection.brokerId } : {}),
        ...(brokerSelection.agentId !== null ? { agentId: brokerSelection.agentId } : {}),
        ...(commissionOverride !== '' ? { commissionAmount: Number(commissionOverride) } : {}),
```

- [ ] **Step 3: Build + commit**

```
npm --prefix client run build
```

```bash
git add client/src/hooks/useBookings.ts client/src/pages/bookings/BookingFormModal.tsx
git commit -m "$(cat <<'EOF'
feat(bookings): broker/agent selector + commission override in form (Phase 1)

CreateBookingDto gains brokerId / agentId / commissionAmount.
BookingDetail and BookingListItem expose brokerId / agentId /
commissionType / commissionAmount for read paths.

BookingFormModal adds a "Referrer" section with BrokerAgentSelector
and an optional commission override input. The server validates the
agent.brokerId === booking.brokerId invariant and computes the final
commission via resolveCommission.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: TenantDetailPage + ApartmentDetailPage convenience widgets

**Files:**
- Modify: `client/src/pages/tenants/TenantDetailPage.tsx`
- Modify: `client/src/pages/apartments/ApartmentDetailPage.tsx`
- Modify: `client/src/hooks/useTenants.ts` (extend `UpdateTenantDto` + `TenantDetail`)

- [ ] **Step 1: Extend tenant types**

In `client/src/hooks/useTenants.ts`:
- Add `defaultAgentId: number | null` to `TenantListItem` and `TenantDetail`.
- Add `defaultAgentId?: number | null` to `CreateTenantDto` and `UpdateTenantDto`.

- [ ] **Step 2: TenantDetailPage — default agent row**

In `TenantDetailPage.tsx`, find the tenant info section (typically the top card with fullName, phone, idNumber, kycStatus). After kycStatus, add a "Default agent" row with a Change button that opens `<BrokerAgentSelector />`. On selection, PATCH `/tenants/:id` with `defaultAgentId`.

Pseudo-code:

```tsx
  const updateTenant = useUpdateTenant(tenantId);
  const [selectorOpen, setSelectorOpen] = useState(false);

  // In JSX, near other info rows:
  <div>
    <p className="text-xs text-on-surface-variant">Default agent</p>
    {tenant.defaultAgentId ? (
      <p className="text-sm text-on-surface">{tenant.defaultAgent?.fullName ?? `Agent #${tenant.defaultAgentId}`}</p>
    ) : (
      <p className="text-sm text-on-surface-variant">None</p>
    )}
    {canEdit && (
      <button onClick={() => setSelectorOpen(true)} className="text-xs text-primary hover:underline">
        Change
      </button>
    )}
  </div>

  // Selector mounted at the bottom:
  {selectorOpen && (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-surface-container-lowest rounded-xl p-6 w-full max-w-md">
        <BrokerAgentSelector
          value={{ brokerId: null, agentId: tenant.defaultAgentId }}
          onChange={async (next) => {
            try {
              await updateTenant.mutateAsync({ defaultAgentId: next.agentId });
              toast.success('Default agent updated');
              setSelectorOpen(false);
            } catch {
              toast.error('Failed to update');
            }
          }}
        />
        <div className="mt-4 flex justify-end">
          <button onClick={() => setSelectorOpen(false)} className="text-sm text-on-surface-variant">Close</button>
        </div>
      </div>
    </div>
  )}
```

NOTE: Read the existing `TenantDetailPage.tsx` to understand where the tenant info section is rendered and what cls patterns to match. The above is a sketch — adapt to the file's actual structure.

- [ ] **Step 3: ApartmentDetailPage — convenience selector**

The BRD specifies: "Apartment page gets the same `<BrokerAgentSelector />` widget in its actions area for convenience only: selecting a broker navigates to that broker's detail page; nothing is persisted on the apartment."

In `ApartmentDetailPage.tsx`, find the actions/quick-actions area. Add a small selector with an onChange that navigates:

```tsx
import { useNavigate } from 'react-router-dom';
// ...
const navigate = useNavigate();
// In JSX, in the actions area:
<div className="w-64">
  <p className="text-xs text-on-surface-variant mb-1">Quick: find broker</p>
  <BrokerAgentSelector
    value={{ brokerId: null, agentId: null }}
    onChange={(next) => {
      if (next.brokerId) navigate(`/brokers/${next.brokerId}`);
    }}
  />
</div>
```

- [ ] **Step 4: Build + commit**

```
npm --prefix client run build
```

```bash
git add client/src/hooks/useTenants.ts client/src/pages/tenants/TenantDetailPage.tsx client/src/pages/apartments/ApartmentDetailPage.tsx
git commit -m "$(cat <<'EOF'
feat(brokers): default agent on tenant + convenience selector on apartment

TenantDetailPage shows the tenant's default agent and lets staff change
it via BrokerAgentSelector. defaultAgentId is added to the tenant
hooks/types. ApartmentDetailPage gets the same selector for convenience
— selecting a broker navigates to its detail page; nothing persists
on the apartment.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md
EOF
)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Manual browser verification (controller runs after all 11 tasks)

Start the server + client dev environments.

**Path A — create a broker + agent:**
1. Log in as ADMIN. Navigate to `/brokers`.
2. Click "+ New Broker". Fill name "Acme Referrals", phone, commissionType=PERCENT, defaultCommissionValue=5. Save.
3. Click the new broker's row → BrokerDetailPage.
4. Click the Agents tab → "+ Add Agent". Fill "Jane Doe", phone, leave override blank. Save.

**Path B — booking with broker + agent + automatic commission:**
1. Go to `/bookings`. Click "+ New Booking".
2. Pick an apartment, tenant, fill rent=1000.
3. In the "Referrer (optional)" section, open the selector → pick "Jane Doe — Acme Referrals".
4. Verify the commission override input appears, leave it blank.
5. Submit. Booking is created.
6. Navigate to `/brokers/<acme-id>` → Bookings tab. The new booking should appear with commission 50 (5% of 1000).

**Path C — agent override:**
1. Edit Jane → set commissionType=PERCENT, commissionValueOverride=10. Save.
2. Create another booking referring "Jane Doe". Commission should compute to 100 (10% of rent).

**Path D — staff override:**
1. Create a booking referring an agent, but enter commissionOverride=75 in the form.
2. The created booking has commissionAmount=75 regardless of the agent's rate.

**Path E — invariant rejection:**
1. Try the request `POST /api/v1/bookings { brokerId: B1, agentId: agentOfB2, ... }` via curl or a similar tool.
2. Expect 422 with a message about the agent not belonging to the broker.

**Path F — default agent on tenant:**
1. Go to a tenant detail page. Click Change next to "Default agent". Pick Jane.
2. Go to `/bookings` → + New Booking. Pick that tenant. (Phase 1 doesn't auto-pre-fill the broker selector based on the tenant default — that's a Phase 2 nice-to-have; for now, confirm the default agent is stored on the tenant.)

If any path fails, report the specific step and I'll dispatch a fix subagent.

---

## Acceptance check (BRD § Broker module — Phase 1 scope)

- [x] Broker (company) + BrokerAgent (person) entities — Task 1.
- [x] Booking gains brokerId + agentId with server-enforced invariant — Task 4.
- [x] Commission cascade: agent override → broker default → staff override — Task 2 + 4.
- [x] Tenant gains defaultAgentId — Task 1 + 5.
- [x] BrokerFormModal, BrokerAgentFormModal — Task 7.
- [x] BrokerAgentSelector (reusable) — Task 8.
- [x] BrokersPage + BrokerDetailPage with Agents/Bookings/Payouts tabs — Task 9.
- [x] Sidebar nav entry — Task 9.
- [x] BookingFormModal integration — Task 10.
- [x] Convenience widgets on tenant/apartment pages — Task 11.

**Deferred to Phase 2:**
- BrokerPayout + BrokerPayoutSettlement models, settlement endpoints, payout UI.
- Accounting integration: BROKER_COMMISSION_EXPENSE + BROKERS_PAYABLE mapping keys, accrual JE on booking creation (ACCRUAL mode), payout JE.
- Soft-delete commission-owed checks (block deletion when a booking referencing this broker has OWED commission that hasn't been settled).
- Server-side `brokerId` filter on GET /bookings (Phase 1's BrokerDetailPage uses client-side filtering).
- Auto-prefill broker selector from `tenant.defaultAgentId` in BookingFormModal.

---

## Notes for the implementer

- **Phase 1 has NO GL accrual.** Don't add `commissionAccrualEntryId` to the schema, don't add the new mapping keys, don't touch posting.service.ts. That's Phase 2.
- **Always Phase 2's hooks are ready to graft on.** The `Broker` model carries `_count` for agents + bookings so future "Total Owed" stats can be added without schema changes.
- **The selector is the integration point.** Three pages use it identically; make sure its contract (`onChange({ brokerId, agentId }, agent, broker)`) is consistent. Don't fork its behaviour per consumer.
- **Existing tenants tests may break.** When you extend the tenant DTOs in Task 5, also check that existing tenant tests still pass. If a test asserts the exact shape of the tenant response (e.g. `expect(tenant).toEqual({ ... })` without `defaultAgentId`), it'll fail — add the field to the expected shape.
- **If a server test fails because the test DB lacks the broker tables**, run `npx prisma migrate deploy` against the test DB (same pattern CR-3 used).
- **If the build fails for unrelated reasons** (a TypeScript regression in code you didn't touch), STOP and report BLOCKED. Rule 3 — surgical changes.
