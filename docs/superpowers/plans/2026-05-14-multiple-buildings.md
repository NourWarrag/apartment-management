# Multiple Buildings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Building` model so apartments and all downstream data can be scoped per building, with a nav-level building selector that filters the whole app and a reports page showing per-building summaries.

**Architecture:** Thin optional filter — existing list endpoints accept `?buildingId=X`; omitting it returns all buildings unchanged. A React `BuildingContext` (persisted to `localStorage`) drives the selector; every data hook appends `buildingId` to its query params and React Query cache key. The schema adds a `Building` model and changes `Apartment.number` from globally unique to unique per building via `@@unique([buildingId, number])`. A migration seeds a default "Main Building" and assigns all existing apartments to it.

**Tech Stack:** Prisma 5, Express, TypeScript, React 18, React Query, React Router, Tailwind CSS

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `server/prisma/schema.prisma` | Add Building model, buildingId on Apartment, User back-relations |
| Create | `server/src/controllers/buildings.controller.ts` | CRUD for buildings |
| Create | `server/src/routes/buildings.routes.ts` | Register buildings routes |
| Create | `server/src/controllers/reports.controller.ts` | Per-building stats aggregation |
| Create | `server/src/routes/reports.routes.ts` | Register reports routes |
| Modify | `server/src/app.ts` | Register buildings + reports routers |
| Modify | `server/src/controllers/apartments.controller.ts` | buildingId filter + building include + uniqueness check |
| Modify | `server/src/controllers/payments.controller.ts` | buildingId filter |
| Modify | `server/src/controllers/tickets.controller.ts` | buildingId filter |
| Modify | `server/src/controllers/dashboard.controller.ts` | buildingId filter on all queries |
| Create | `server/src/controllers/buildings.controller.test.ts` | Integration tests |
| Create | `client/src/context/BuildingContext.tsx` | selectedBuilding state + localStorage + useBuilding() |
| Create | `client/src/hooks/useBuildings.ts` | Fetch GET /buildings |
| Create | `client/src/hooks/useReportsBuildings.ts` | Fetch GET /reports/buildings |
| Create | `client/src/components/layout/BuildingSelector.tsx` | Dropdown for building context |
| Modify | `client/src/components/layout/TopBar.tsx` | Mount BuildingSelector |
| Modify | `client/src/hooks/useApartments.ts` | Pass buildingId param + add building to types |
| Modify | `client/src/hooks/useDashboard.ts` | Pass buildingId to stats/activity/revenueTrend |
| Modify | `client/src/hooks/usePayments.ts` | Pass buildingId param |
| Modify | `client/src/hooks/useTickets.ts` | Pass buildingId param |
| Modify | `client/src/pages/apartments/ApartmentsPage.tsx` | Building code badge in "All" mode |
| Create | `client/src/pages/buildings/BuildingsPage.tsx` | List + manage buildings (ADMIN) |
| Create | `client/src/pages/buildings/BuildingFormModal.tsx` | Create / edit building form |
| Create | `client/src/pages/reports/ReportsPage.tsx` | Per-building summary table |
| Modify | `client/src/components/layout/Sidebar.tsx` | Add Buildings nav item (ADMIN only) |
| Modify | `client/src/App.tsx` | Add /buildings and /reports routes |
| Modify | `client/src/main.tsx` | Wrap app in BuildingContext provider |

---

### Task 1: Schema Migration — Add Building Model

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Update schema.prisma**

Add the `Building` model and modify `Apartment` and `User`. Replace only the `User`, `Apartment` models and add `Building` — leave all other models untouched.

**Building model (add after AuditLog):**
```prisma
model Building {
  id         Int        @id @default(autoincrement())
  name       String
  code       String     @unique
  address    String
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
  createdBy  Int?
  updatedBy  Int?
  creator    User?      @relation("BuildingCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater    User?      @relation("BuildingUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  apartments Apartment[]
}
```

**Apartment model — add `buildingId`, drop `@unique` on number, add compound unique:**
```prisma
model Apartment {
  id         Int             @id @default(autoincrement())
  number     String
  floor      Int
  type       ApartmentType   @default(STUDIO)
  status     ApartmentStatus @default(AVAILABLE)
  buildingId Int             @default(1)
  updatedAt  DateTime        @updatedAt
  deletedAt  DateTime?
  createdBy  Int?
  updatedBy  Int?
  deletedBy  Int?

  building  Building @relation(fields: [buildingId], references: [id], onDelete: Restrict)
  creator   User?    @relation("ApartmentCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater   User?    @relation("ApartmentUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  deleter   User?    @relation("ApartmentDeletedBy", fields: [deletedBy], references: [id], onDelete: SetNull)

  bookings Booking[]
  tickets  MaintenanceTicket[]

  @@unique([buildingId, number])
}
```

**User model — add two back-relations for Building** (append after existing back-relations):
```prisma
  createdBuildings Building[] @relation("BuildingCreatedBy")
  updatedBuildings Building[] @relation("BuildingUpdatedBy")
```

- [ ] **Step 2: Create migration file without applying it**

```bash
cd "D:\Hotel Apartment Management System\server"
npx prisma migrate dev --create-only --name add-buildings
```

Expected: a new file created at `server/prisma/migrations/<timestamp>_add_buildings/migration.sql`.

- [ ] **Step 3: Edit the migration SQL**

Open the generated `migration.sql`. Find the `CREATE TABLE "Building"` statement and add a seed INSERT immediately after it. Also find `ALTER TABLE "Apartment" ADD COLUMN "buildingId"` and verify it has `DEFAULT 1`. Add a line to drop that database default after the column is populated (so future rows require explicit buildingId from the app).

The file should contain these sections in order (Prisma generates most of this, you add the INSERT and DROP DEFAULT lines):

```sql
-- CreateTable
CREATE TABLE "Building" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Building_code_key" ON "Building"("code");

-- Seed default building BEFORE adding buildingId column so it gets id = 1
INSERT INTO "Building" (name, code, address, "createdAt", "updatedAt")
VALUES ('Main Building', 'MB', '', NOW(), NOW());

-- AlterTable: add buildingId with DEFAULT 1 so existing apartments get assigned
ALTER TABLE "Apartment" ADD COLUMN "buildingId" INTEGER NOT NULL DEFAULT 1;

-- Drop the column-level default; app must always supply buildingId explicitly going forward
ALTER TABLE "Apartment" ALTER COLUMN "buildingId" DROP DEFAULT;

-- Drop old global unique on number
DROP INDEX IF EXISTS "Apartment_number_key";

-- Add compound unique (buildingId, number)
CREATE UNIQUE INDEX "Apartment_buildingId_number_key" ON "Apartment"("buildingId", "number");

-- AddForeignKey for Building.creator / Building.updater
ALTER TABLE "Building" ADD CONSTRAINT "Building_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Building" ADD CONSTRAINT "Building_updatedBy_fkey"
    FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey for Apartment.buildingId
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

```bash
npx prisma migrate dev
npx prisma generate
```

Expected: migration applied successfully, client regenerated with `Building` type and `buildingId` on `Apartment`.

- [ ] **Step 5: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add Building model and buildingId to Apartment schema"
```

---

### Task 2: Buildings Controller + Routes

**Files:**
- Create: `server/src/controllers/buildings.controller.ts`
- Create: `server/src/routes/buildings.routes.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Create `server/src/controllers/buildings.controller.ts`**

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const buildingSelect = { id: true, name: true, code: true, address: true, createdAt: true } as const;

export async function list(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const buildings = await prisma.building.findMany({
      select: buildingSelect,
      orderBy: { name: 'asc' },
    });
    res.json(buildings);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid building id' }); return; }
    const building = await prisma.building.findUnique({ where: { id }, select: buildingSelect });
    if (!building) { res.status(404).json({ message: 'Building not found' }); return; }
    res.json(building);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, code, address } = req.body as { name?: string; code?: string; address?: string };
    if (!name?.trim() || !code?.trim() || address === undefined) {
      res.status(400).json({ message: 'name, code, and address are required' });
      return;
    }
    const existing = await prisma.building.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (existing) { res.status(409).json({ message: 'A building with this code already exists' }); return; }
    const building = await prisma.building.create({
      data: { name: name.trim(), code: code.trim().toUpperCase(), address: address.trim() },
      select: buildingSelect,
    });
    res.status(201).json(building);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid building id' }); return; }
    const { name, code, address } = req.body as { name?: string; code?: string; address?: string };
    if (!name?.trim() && !code?.trim() && address === undefined) {
      res.status(400).json({ message: 'At least one field required' });
      return;
    }
    const data: { name?: string; code?: string; address?: string } = {};
    if (name?.trim()) data.name = name.trim();
    if (code?.trim()) {
      const upper = code.trim().toUpperCase();
      const conflict = await prisma.building.findFirst({ where: { code: upper, NOT: { id } } });
      if (conflict) { res.status(409).json({ message: 'A building with this code already exists' }); return; }
      data.code = upper;
    }
    if (address !== undefined) data.address = address.trim();
    try {
      const building = await prisma.building.update({ where: { id }, data, select: buildingSelect });
      res.json(building);
    } catch (err: any) {
      if (err?.code === 'P2025') { res.status(404).json({ message: 'Building not found' }); return; }
      throw err;
    }
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid building id' }); return; }
    const aptCount = await prisma.apartment.count({ where: { buildingId: id } });
    if (aptCount > 0) {
      res.status(409).json({ message: 'Cannot delete a building that has apartments' });
      return;
    }
    try {
      await prisma.building.delete({ where: { id } });
      res.status(204).send();
    } catch (err: any) {
      if (err?.code === 'P2025') { res.status(404).json({ message: 'Building not found' }); return; }
      throw err;
    }
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Create `server/src/routes/buildings.routes.ts`**

```typescript
import { Router } from 'express';
import { list, getById, create, update, remove } from '../controllers/buildings.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.get('/', list);
router.get('/:id', getById);
router.post('/', requireRole(Role.ADMIN), create);
router.patch('/:id', requireRole(Role.ADMIN), update);
router.delete('/:id', requireRole(Role.ADMIN), remove);

export default router;
```

- [ ] **Step 3: Register in `server/src/app.ts`**

Add after the existing imports:
```typescript
import buildingsRoutes from './routes/buildings.routes';
```

Add after the last `app.use('/api/v1/...')` line (before the health check):
```typescript
app.use('/api/v1/buildings', buildingsRoutes);
```

- [ ] **Step 4: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add server/src/controllers/buildings.controller.ts server/src/routes/buildings.routes.ts server/src/app.ts
git commit -m "feat: add buildings CRUD controller and routes"
```

---

### Task 3: Modify Existing Endpoints for buildingId Filter

**Files:**
- Modify: `server/src/controllers/apartments.controller.ts`
- Modify: `server/src/controllers/payments.controller.ts`
- Modify: `server/src/controllers/tickets.controller.ts`
- Modify: `server/src/controllers/dashboard.controller.ts`

The pattern for all list endpoints: parse `buildingId` from query, validate it's a positive integer if present, add to `where` clause.

Helper to add at the top of each modified controller (or inline — no shared file needed, it's 4 lines):
```typescript
function parseBuildingId(query: Record<string, unknown>): number | undefined {
  const raw = query.buildingId;
  if (!raw) return undefined;
  const n = Number(raw);
  return isNaN(n) || n <= 0 ? undefined : n;
}
```

- [ ] **Step 1: Update `apartments.controller.ts`**

In the `list` function, after reading `{ status, type, search }` from `req.query`, also read `buildingId`:

```typescript
export async function list(req: AuthRequest, res: Response): Promise<void> {
  const { status, type, search } = req.query as { status?: string; type?: string; search?: string };
  const rawBuilding = req.query.buildingId;
  const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
  if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
    res.status(400).json({ message: 'Invalid buildingId' });
    return;
  }
  // ... existing status/type validation ...
  const where: Prisma.ApartmentWhereInput = {};
  if (buildingId) where.buildingId = buildingId;
  if (status) where.status = status as ApartmentStatus;
  if (type) where.type = type as ApartmentType;
  if (search) where.number = { contains: search, mode: 'insensitive' };
  // ... rest unchanged, but add building to include:
```

In the `include` object inside `list`, add:
```typescript
    include: {
      building: { select: { id: true, name: true, code: true } },
      bookings: { ... },  // existing
      tickets: { ... },   // existing
    },
```

And in the `.map()` result object, add:
```typescript
      building: a.building,
```

In the `create` function, accept `buildingId` from the request body and validate the building exists:

```typescript
export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { number, floor, type, buildingId } = req.body as {
      number?: string; floor?: number; type?: string; buildingId?: number;
    };
    if (!number?.trim() || floor === undefined || floor === null) {
      res.status(400).json({ message: 'number and floor are required' });
      return;
    }
    if (!buildingId || isNaN(Number(buildingId))) {
      res.status(400).json({ message: 'buildingId is required' });
      return;
    }
    const bId = Number(buildingId);
    const building = await prisma.building.findUnique({ where: { id: bId } });
    if (!building) { res.status(404).json({ message: 'Building not found' }); return; }

    // Check uniqueness per building (compound unique replaces old global unique)
    const conflict = await prisma.apartment.findFirst({
      where: { buildingId: bId, number: number.trim() },
    });
    if (conflict) {
      res.status(409).json({ message: 'Apartment number already exists in this building' });
      return;
    }
    const apartment = await prisma.apartment.create({
      data: {
        number: number.trim(),
        floor: Number(floor),
        type: (type as ApartmentType) ?? ApartmentType.STUDIO,
        buildingId: bId,
      },
      include: { building: { select: { id: true, name: true, code: true } } },
    });
    res.status(201).json(apartment);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

In the `update` function, when updating `number`, replace the old global uniqueness check with a per-building check. Read the current apartment first to get its `buildingId`, then check `findFirst({ where: { buildingId: apt.buildingId, number: newNumber, NOT: { id } } })`.

- [ ] **Step 2: Update `payments.controller.ts`**

In the `list` function, add buildingId parsing and filter:

```typescript
  const rawBuilding = req.query.buildingId;
  const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
  if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
    res.status(400).json({ message: 'Invalid buildingId' });
    return;
  }
```

In the `where` object, add:
```typescript
  if (buildingId) where.booking = { apartment: { buildingId } };
```

Note: if `where.OR` is already set (search), merge carefully — the `OR` and `buildingId` filter need to coexist. Use:
```typescript
  if (buildingId && where.OR) {
    where.AND = [{ OR: where.OR }, { booking: { apartment: { buildingId } } }];
    delete where.OR;
  } else if (buildingId) {
    where.booking = { apartment: { buildingId } };
  }
```

- [ ] **Step 3: Update `tickets.controller.ts`**

In the `list` function and the `baseWhere` helper, add buildingId. The `baseWhere` function currently doesn't take `req.query` — add buildingId to `list()` directly by merging into the result of `baseWhere`:

```typescript
export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, priority } = req.query as { status?: string; priority?: string };
    const rawBuilding = req.query.buildingId;
    const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
    if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
      res.status(400).json({ message: 'Invalid buildingId' });
      return;
    }
    const where = baseWhere(req);
    if (buildingId) where.apartment = { buildingId };
    // ... rest unchanged
```

- [ ] **Step 4: Update `dashboard.controller.ts`**

In the `stats` function, parse `buildingId` and add to all Prisma queries:

```typescript
export async function stats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawBuilding = req.query.buildingId;
    const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
    if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
      res.status(400).json({ message: 'Invalid buildingId' });
      return;
    }
    const aptWhere = buildingId ? { buildingId } : {};
    const paymentWhere = buildingId
      ? { status: 'PAID' as const, paidAt: { gte: startOfToday, lt: startOfTomorrow }, booking: { apartment: { buildingId } } }
      : { status: 'PAID' as const, paidAt: { gte: startOfToday, lt: startOfTomorrow } };
    const installmentWhere = buildingId
      ? { method: 'INSTALLMENT' as const, status: 'PENDING' as const, booking: { apartment: { buildingId } } }
      : { method: 'INSTALLMENT' as const, status: 'PENDING' as const };
    const ticketWhere = buildingId
      ? { status: { in: ['OPEN', 'IN_PROGRESS'] as const }, apartment: { buildingId } }
      : { status: { in: ['OPEN', 'IN_PROGRESS'] as const } };

    const [aptGroups, revenueGroups, pendingInstallments, openTickets] = await Promise.all([
      prisma.apartment.groupBy({ by: ['status'], where: aptWhere, _count: { _all: true } }),
      prisma.payment.groupBy({ by: ['method'], where: paymentWhere, _sum: { amount: true } }),
      prisma.payment.count({ where: installmentWhere }),
      prisma.maintenanceTicket.count({ where: ticketWhere }),
    ]);
    // ... rest unchanged
```

Apply the same `buildingId` filter pattern to `activity()` and `revenueTrend()`. In `activity()`, filter each `findMany` by adding `apartment: { buildingId }` (or `booking: { apartment: { buildingId } }` for payment/booking queries) when `buildingId` is set. In `revenueTrend()`, add `booking: { apartment: { buildingId } }` to the payment `where`.

- [ ] **Step 5: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add server/src/controllers/apartments.controller.ts \
        server/src/controllers/payments.controller.ts \
        server/src/controllers/tickets.controller.ts \
        server/src/controllers/dashboard.controller.ts
git commit -m "feat: add optional buildingId filter to apartments, payments, tickets, dashboard endpoints"
```

---

### Task 4: Reports Endpoint

**Files:**
- Create: `server/src/controllers/reports.controller.ts`
- Create: `server/src/routes/reports.routes.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Create `server/src/controllers/reports.controller.ts`**

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function buildingStats(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const buildings = await prisma.building.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      buildings.map(async (b) => {
        const [totalApartments, occupied, monthlyRevRaw, openTickets] = await Promise.all([
          prisma.apartment.count({ where: { buildingId: b.id } }),
          prisma.apartment.count({ where: { buildingId: b.id, status: 'OCCUPIED' } }),
          prisma.payment.aggregate({
            where: {
              status: 'PAID',
              paidAt: { gte: startOfMonth, lt: startOfNextMonth },
              booking: { apartment: { buildingId: b.id } },
            },
            _sum: { amount: true },
          }),
          prisma.maintenanceTicket.count({
            where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, apartment: { buildingId: b.id } },
          }),
        ]);
        const monthlyRevenue = Number(monthlyRevRaw._sum.amount ?? 0);
        return {
          buildingId: b.id,
          buildingName: b.name,
          buildingCode: b.code,
          totalApartments,
          occupied,
          occupancyRate: totalApartments === 0 ? 0 : Math.round((occupied / totalApartments) * 100) / 100,
          monthlyRevenue,
          openTickets,
        };
      })
    );

    // Global totals row
    const global = rows.reduce(
      (acc, r) => ({
        totalApartments: acc.totalApartments + r.totalApartments,
        occupied: acc.occupied + r.occupied,
        monthlyRevenue: acc.monthlyRevenue + r.monthlyRevenue,
        openTickets: acc.openTickets + r.openTickets,
      }),
      { totalApartments: 0, occupied: 0, monthlyRevenue: 0, openTickets: 0 }
    );

    res.json([
      ...rows,
      {
        buildingId: null,
        buildingName: 'All Buildings',
        buildingCode: null,
        totalApartments: global.totalApartments,
        occupied: global.occupied,
        occupancyRate: global.totalApartments === 0 ? 0 : Math.round((global.occupied / global.totalApartments) * 100) / 100,
        monthlyRevenue: global.monthlyRevenue,
        openTickets: global.openTickets,
      },
    ]);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Create `server/src/routes/reports.routes.ts`**

```typescript
import { Router } from 'express';
import { buildingStats } from '../controllers/reports.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);
router.get('/buildings', requireRole(Role.ADMIN, Role.FINANCE), buildingStats);
export default router;
```

- [ ] **Step 3: Register in `server/src/app.ts`**

```typescript
import reportsRoutes from './routes/reports.routes';
// ...
app.use('/api/v1/reports', reportsRoutes);
```

- [ ] **Step 4: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add server/src/controllers/reports.controller.ts server/src/routes/reports.routes.ts server/src/app.ts
git commit -m "feat: add reports/buildings endpoint with per-building stats and global totals"
```

---

### Task 5: Server Integration Tests

**Files:**
- Create: `server/src/controllers/buildings.controller.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

const ADMIN_COOKIE = `token=${signToken({ id: 1, role: 'ADMIN' })}`;
const FINANCE_COOKIE = `token=${signToken({ id: 1, role: 'FINANCE' })}`;
const RECEP_COOKIE = `token=${signToken({ id: 1, role: 'RECEPTIONIST' })}`;

describe('Buildings API', () => {
  let buildingId: number;
  let aptId: number;

  beforeAll(async () => {
    await db.building.deleteMany({ where: { code: { in: ['T1', 'T2'] } } });
  });

  afterAll(async () => {
    await db.apartment.deleteMany({ where: { number: 'BLD-001' } });
    await db.building.deleteMany({ where: { code: { in: ['T1', 'T2'] } } });
    await db.$disconnect();
  });

  it('POST /buildings returns 403 for non-ADMIN', async () => {
    const res = await request(app)
      .post('/api/v1/buildings')
      .set('Cookie', RECEP_COOKIE)
      .send({ name: 'Tower 1', code: 'T1', address: '1 Main St' });
    expect(res.status).toBe(403);
  });

  it('POST /buildings creates a building', async () => {
    const res = await request(app)
      .post('/api/v1/buildings')
      .set('Cookie', ADMIN_COOKIE)
      .send({ name: 'Tower 1', code: 'T1', address: '1 Main St' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Tower 1', code: 'T1', address: '1 Main St' });
    buildingId = res.body.id;
  });

  it('POST /buildings returns 409 for duplicate code', async () => {
    const res = await request(app)
      .post('/api/v1/buildings')
      .set('Cookie', ADMIN_COOKIE)
      .send({ name: 'Tower 1 Dup', code: 'T1', address: 'x' });
    expect(res.status).toBe(409);
  });

  it('GET /buildings returns array including created building', async () => {
    const res = await request(app).get('/api/v1/buildings').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((b: { id: number }) => b.id === buildingId)).toBe(true);
  });

  it('PATCH /buildings/:id updates name', async () => {
    const res = await request(app)
      .patch(`/api/v1/buildings/${buildingId}`)
      .set('Cookie', ADMIN_COOKIE)
      .send({ name: 'Tower One' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tower One');
  });

  it('DELETE /buildings/:id returns 409 when building has apartments', async () => {
    const apt = await db.apartment.create({
      data: { number: 'BLD-001', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId },
    });
    aptId = apt.id;
    const res = await request(app)
      .delete(`/api/v1/buildings/${buildingId}`)
      .set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(409);
  });

  it('DELETE /buildings/:id succeeds when no apartments', async () => {
    await db.apartment.delete({ where: { id: aptId } });
    const res = await request(app)
      .delete(`/api/v1/buildings/${buildingId}`)
      .set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(204);
  });

  it('GET /apartments?buildingId= filters by building', async () => {
    const b = await db.building.create({ data: { name: 'Tower 2', code: 'T2', address: '' } });
    await db.apartment.create({ data: { number: 'BLD-001', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: b.id } });

    const res = await request(app)
      .get(`/api/v1/apartments?buildingId=${b.id}`)
      .set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    const ids = (Array.isArray(res.body) ? res.body : res.body.data ?? [])
      .map((a: { id: number; building?: { id: number } }) => a.building?.id ?? a.id);

    // Cleanup
    await db.apartment.deleteMany({ where: { buildingId: b.id } });
    await db.building.delete({ where: { id: b.id } });
  });

  it('GET /reports/buildings returns per-building rows + global totals', async () => {
    const res = await request(app).get('/api/v1/reports/buildings').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const global = res.body.find((r: { buildingId: null }) => r.buildingId === null);
    expect(global).toBeDefined();
    expect(global).toMatchObject({
      buildingName: 'All Buildings',
      totalApartments: expect.any(Number),
      occupied: expect.any(Number),
      occupancyRate: expect.any(Number),
      monthlyRevenue: expect.any(Number),
      openTickets: expect.any(Number),
    });
  });

  it('GET /reports/buildings returns 403 for non-ADMIN/FINANCE', async () => {
    const res = await request(app).get('/api/v1/reports/buildings').set('Cookie', RECEP_COOKIE);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd "D:\Hotel Apartment Management System\server"
npm test -- buildings
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add server/src/controllers/buildings.controller.test.ts
git commit -m "test: integration tests for buildings CRUD, filter, and reports"
```

---

### Task 6: BuildingContext + useBuildings Hook

**Files:**
- Create: `client/src/context/BuildingContext.tsx`
- Create: `client/src/hooks/useBuildings.ts`
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Create `client/src/hooks/useBuildings.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface Building {
  id: number;
  name: string;
  code: string;
  address: string;
}

export function useBuildings() {
  return useQuery<Building[]>({
    queryKey: ['buildings'],
    queryFn: async () => {
      const res = await api.get('/buildings');
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
```

- [ ] **Step 2: Create `client/src/context/BuildingContext.tsx`**

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useBuildings, Building } from '../hooks/useBuildings';

type SelectedBuilding = Building | 'all';

interface BuildingContextValue {
  selectedBuilding: SelectedBuilding;
  setSelectedBuilding: (b: SelectedBuilding) => void;
}

const BuildingContext = createContext<BuildingContextValue>({
  selectedBuilding: 'all',
  setSelectedBuilding: () => {},
});

const STORAGE_KEY = 'selectedBuilding';

function loadFromStorage(): SelectedBuilding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw === 'all') return 'all';
    return JSON.parse(raw) as Building;
  } catch {
    return 'all';
  }
}

export function BuildingProvider({ children }: { children: ReactNode }) {
  const [selectedBuilding, setSelectedBuildingState] = useState<SelectedBuilding>(loadFromStorage);
  const { data: buildings = [] } = useBuildings();

  // Reset to 'all' if the stored building no longer exists
  useEffect(() => {
    if (selectedBuilding === 'all') return;
    if (buildings.length === 0) return; // not loaded yet
    const stillExists = buildings.some((b) => b.id === (selectedBuilding as Building).id);
    if (!stillExists) {
      setSelectedBuildingState('all');
      localStorage.setItem(STORAGE_KEY, 'all');
    }
  }, [buildings, selectedBuilding]);

  function setSelectedBuilding(b: SelectedBuilding) {
    setSelectedBuildingState(b);
    localStorage.setItem(STORAGE_KEY, b === 'all' ? 'all' : JSON.stringify(b));
  }

  return (
    <BuildingContext.Provider value={{ selectedBuilding, setSelectedBuilding }}>
      {children}
    </BuildingContext.Provider>
  );
}

export function useBuilding() {
  return useContext(BuildingContext);
}
```

- [ ] **Step 3: Read `client/src/main.tsx` and wrap the app**

Read `client/src/main.tsx`. Find where `<App />` is rendered and wrap it with `<BuildingProvider>`:

```typescript
import { BuildingProvider } from './context/BuildingContext';
// ...
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BuildingProvider>
        <App />
      </BuildingProvider>
    </QueryClientProvider>
  </StrictMode>
);
```

(The exact wrapper order depends on the existing providers — `BuildingProvider` should be inside `QueryClientProvider` since it uses `useQuery` internally.)

- [ ] **Step 4: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add client/src/context/BuildingContext.tsx client/src/hooks/useBuildings.ts client/src/main.tsx
git commit -m "feat: add BuildingContext with localStorage persistence and useBuildings hook"
```

---

### Task 7: BuildingSelector in TopBar

**Files:**
- Create: `client/src/components/layout/BuildingSelector.tsx`
- Modify: `client/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Create `client/src/components/layout/BuildingSelector.tsx`**

```tsx
import { useBuilding } from '../../context/BuildingContext';
import { useBuildings, Building } from '../../hooks/useBuildings';

export default function BuildingSelector() {
  const { selectedBuilding, setSelectedBuilding } = useBuilding();
  const { data: buildings = [] } = useBuildings();

  const currentId = selectedBuilding === 'all' ? 'all' : String(selectedBuilding.id);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === 'all') {
      setSelectedBuilding('all');
    } else {
      const b = buildings.find((b) => String(b.id) === val);
      if (b) setSelectedBuilding(b);
    }
  }

  if (buildings.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">business</span>
      <select
        value={currentId}
        onChange={handleChange}
        className="text-sm font-medium text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
        aria-label="Select building"
      >
        <option value="all">All Buildings</option>
        {buildings.map((b: Building) => (
          <option key={b.id} value={String(b.id)}>
            {b.name} ({b.code})
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Add BuildingSelector to TopBar**

Read `client/src/components/layout/TopBar.tsx`. Import and mount `BuildingSelector` in the left/center section of the top bar (before search or alongside the page title). Add:

```typescript
import BuildingSelector from './BuildingSelector';
// Inside the JSX, add somewhere prominent:
<BuildingSelector />
```

- [ ] **Step 3: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add client/src/components/layout/BuildingSelector.tsx client/src/components/layout/TopBar.tsx
git commit -m "feat: add BuildingSelector dropdown to top nav"
```

---

### Task 8: Update Data Hooks with buildingId

**Files:**
- Modify: `client/src/hooks/useApartments.ts`
- Modify: `client/src/hooks/useDashboard.ts`
- Modify: `client/src/hooks/usePayments.ts`
- Modify: `client/src/hooks/useTickets.ts`

Each hook: import `useBuilding`, derive `buildingId`, add to params and queryKey.

- [ ] **Step 1: Update `useApartments.ts`**

Add `building` to `ApartmentListItem`:
```typescript
export interface ApartmentListItem {
  // ... existing fields ...
  building: { id: number; name: string; code: string };
}
```

Update `useApartments`:
```typescript
import { useBuilding } from '../context/BuildingContext';

export function useApartments(
  filters?: { status?: ApartmentStatus; type?: ApartmentType; search?: string },
  options?: { enabled?: boolean }
) {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;

  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.search) params.set('search', filters.search);
  if (buildingId) params.set('buildingId', String(buildingId));

  return useQuery<ApartmentListItem[]>({
    queryKey: ['apartments', { ...filters, buildingId }],
    queryFn: async () => {
      const res = await api.get(`/apartments?${params.toString()}`);
      return res.data;
    },
    enabled: options?.enabled ?? true,
  });
}
```

- [ ] **Step 2: Update `useDashboard.ts`**

```typescript
import { useBuilding } from '../context/BuildingContext';

export function useDashboardStats() {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;
  const params = buildingId ? `?buildingId=${buildingId}` : '';
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', buildingId],
    queryFn: async () => { const res = await api.get(`/dashboard/stats${params}`); return res.data; },
    retry: 1,
  });
}

export function useDashboardActivity() {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;
  const params = buildingId ? `?buildingId=${buildingId}` : '';
  return useQuery<DashboardActivity>({
    queryKey: ['dashboard', 'activity', buildingId],
    queryFn: async () => { const res = await api.get(`/dashboard/activity${params}`); return res.data; },
    retry: 1,
    refetchInterval: 30_000,
  });
}

export function useRevenueTrend(days: 7 | 30) {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;
  const params = new URLSearchParams({ days: String(days) });
  if (buildingId) params.set('buildingId', String(buildingId));
  return useQuery<RevenueTrendPoint[]>({
    queryKey: ['dashboard', 'revenue-trend', days, buildingId],
    queryFn: async () => { const res = await api.get(`/dashboard/revenue-trend?${params}`); return res.data; },
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Update `usePayments.ts`**

```typescript
import { useBuilding } from '../context/BuildingContext';

export function usePayments(filters?: { status?: string; method?: string; search?: string; page?: number }) {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;

  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.method) params.set('method', filters.method);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page && filters.page > 1) params.set('page', String(filters.page));
  if (buildingId) params.set('buildingId', String(buildingId));

  return useQuery<PaymentsListResponse>({
    queryKey: ['payments', { ...filters, buildingId }],
    queryFn: async () => { const res = await api.get(`/payments?${params.toString()}`); return res.data; },
    retry: 1,
  });
}
```

- [ ] **Step 4: Update `useTickets.ts`**

```typescript
import { useBuilding } from '../context/BuildingContext';

export function useTickets(filters?: { status?: string; priority?: string }) {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;

  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  if (buildingId) params.set('buildingId', String(buildingId));

  return useQuery<{ total: number; data: TicketItem[] }>({
    queryKey: ['tickets', { ...filters, buildingId }],
    queryFn: async () => { const res = await api.get(`/tickets?${params.toString()}`); return res.data; },
    retry: 1,
  });
}
```

- [ ] **Step 5: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add client/src/hooks/useApartments.ts client/src/hooks/useDashboard.ts \
        client/src/hooks/usePayments.ts client/src/hooks/useTickets.ts
git commit -m "feat: pass buildingId from context to all data-fetching hooks"
```

---

### Task 9: Building Code Badge in ApartmentsPage

**Files:**
- Modify: `client/src/pages/apartments/ApartmentsPage.tsx`

When in "All Buildings" mode, apartment cards/rows show a small building code pill so the user can tell which building each apartment belongs to.

- [ ] **Step 1: Add building badge**

In `ApartmentsPage.tsx`, import `useBuilding`:
```typescript
import { useBuilding } from '../../context/BuildingContext';
```

Inside the component:
```typescript
const { selectedBuilding } = useBuilding();
const showBuildingBadge = selectedBuilding === 'all';
```

Find where `apartment.number` is rendered in the card/row. Immediately after the number, add:
```tsx
{showBuildingBadge && apartment.building && (
  <span className="text-[10px] font-bold bg-secondary/10 text-secondary px-1.5 py-0.5 rounded uppercase tracking-wide ml-1">
    {apartment.building.code}
  </span>
)}
```

- [ ] **Step 2: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add client/src/pages/apartments/ApartmentsPage.tsx
git commit -m "feat: show building code badge on apartment cards in All Buildings mode"
```

---

### Task 10: Buildings Admin Page

**Files:**
- Create: `client/src/pages/buildings/BuildingsPage.tsx`
- Create: `client/src/pages/buildings/BuildingFormModal.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/hooks/useBuildingsMutations.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface CreateBuildingDto { name: string; code: string; address: string; }
export interface UpdateBuildingDto { name?: string; code?: string; address?: string; }

export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBuildingDto) => api.post('/buildings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}

export function useUpdateBuilding(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBuildingDto) => api.patch(`/buildings/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}

export function useDeleteBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/buildings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}
```

- [ ] **Step 2: Create `client/src/pages/buildings/BuildingFormModal.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Building } from '../../hooks/useBuildings';
import { useCreateBuilding, useUpdateBuilding } from '../../hooks/useBuildingsMutations';

interface Props {
  building?: Building;
  onClose: () => void;
}

export default function BuildingFormModal({ building, onClose }: Props) {
  const [name, setName] = useState(building?.name ?? '');
  const [code, setCode] = useState(building?.code ?? '');
  const [address, setAddress] = useState(building?.address ?? '');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateBuilding();
  const update = useUpdateBuilding(building?.id ?? 0);
  const isEdit = !!building;
  const isPending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEdit) {
        await update.mutateAsync({ name, code, address });
      } else {
        await create.mutateAsync({ name, code, address });
      }
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Something went wrong');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold text-on-surface mb-4">
          {isEdit ? 'Edit Building' : 'Add Building'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Code (short ID, e.g. "TA")</label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required maxLength={10}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase" />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-bold bg-primary text-on-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Building'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/pages/buildings/BuildingsPage.tsx`**

```tsx
import { useState } from 'react';
import { useBuildings, Building } from '../../hooks/useBuildings';
import { useDeleteBuilding } from '../../hooks/useBuildingsMutations';
import BuildingFormModal from './BuildingFormModal';

export default function BuildingsPage() {
  const { data: buildings = [], isLoading } = useBuildings();
  const deleteBuilding = useDeleteBuilding();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Building | undefined>();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(id: number) {
    setDeleteError(null);
    try {
      await deleteBuilding.mutateAsync(id);
    } catch (err: any) {
      setDeleteError(err.response?.data?.message ?? 'Failed to delete building');
    }
  }

  return (
    <div className="space-y-widget-gap">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-display-lg text-primary">Buildings</h2>
          <p className="text-on-surface-variant text-body-base mt-1">Manage your property buildings.</p>
        </div>
        <button onClick={() => { setEditing(undefined); setShowForm(true); }}
          className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded font-bold text-body-sm hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined text-[20px]">add</span>
          Add Building
        </button>
      </div>

      {deleteError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{deleteError}</div>
      )}

      {isLoading ? (
        <div className="text-on-surface-variant text-sm p-8 text-center">Loading…</div>
      ) : (
        <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                {['NAME', 'CODE', 'ADDRESS', 'ACTIONS'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {buildings.map(b => (
                <tr key={b.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 text-sm font-bold text-on-surface">{b.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold bg-secondary/10 text-secondary px-1.5 py-0.5 rounded uppercase tracking-wide">{b.code}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{b.address || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditing(b); setShowForm(true); }}
                        className="p-1 hover:bg-surface-container rounded-full" title="Edit">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">edit</span>
                      </button>
                      <button onClick={() => handleDelete(b.id)}
                        className="p-1 hover:bg-surface-container rounded-full" title="Delete">
                        <span className="material-symbols-outlined text-[20px] text-error">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && <BuildingFormModal building={editing} onClose={() => setShowForm(false)} />}
    </div>
  );
}
```

- [ ] **Step 4: Add Buildings nav item to Sidebar**

In `client/src/components/layout/Sidebar.tsx`, add to `NAV_ITEMS`:
```typescript
{ to: '/buildings', icon: 'business', key: 'buildings', roles: [Role.ADMIN] },
```

Add it after the Tenants item (position it logically near apartments/tenants).

- [ ] **Step 5: Add i18n key** (if the app uses translation keys for nav labels)

Check if `t('nav.buildings')` needs a fallback. In the existing Sidebar pattern, the `t()` call uses the key. Add a fallback: change the NavLink render to:
```tsx
<span className="text-sm">{t(`nav.${key}`, key.charAt(0).toUpperCase() + key.slice(1))}</span>
```
(The second argument to `t()` is the fallback string, so "Buildings" renders even without an i18n file entry.)

- [ ] **Step 6: Add /buildings route in App.tsx**

Import `BuildingsPage`:
```typescript
import BuildingsPage from './pages/buildings/BuildingsPage';
```

Add inside the `<Route element={<ProtectedRoute ...><AppLayout /></ProtectedRoute>}>` block:
```tsx
<Route
  path="buildings"
  element={
    <ProtectedRoute allowedRoles={[Role.ADMIN]}>
      <BuildingsPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 7: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add client/src/hooks/useBuildingsMutations.ts \
        client/src/pages/buildings/BuildingsPage.tsx \
        client/src/pages/buildings/BuildingFormModal.tsx \
        client/src/components/layout/Sidebar.tsx \
        client/src/App.tsx
git commit -m "feat: add Buildings admin page with CRUD and sidebar nav item"
```

---

### Task 11: Reports Page

**Files:**
- Create: `client/src/hooks/useReportsBuildings.ts`
- Create: `client/src/pages/reports/ReportsPage.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/hooks/useReportsBuildings.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface BuildingReportRow {
  buildingId: number | null;
  buildingName: string;
  buildingCode: string | null;
  totalApartments: number;
  occupied: number;
  occupancyRate: number;
  monthlyRevenue: number;
  openTickets: number;
}

export function useReportsBuildings() {
  return useQuery<BuildingReportRow[]>({
    queryKey: ['reports', 'buildings'],
    queryFn: async () => {
      const res = await api.get('/reports/buildings');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
```

- [ ] **Step 2: Create `client/src/pages/reports/ReportsPage.tsx`**

```tsx
import { useReportsBuildings, BuildingReportRow } from '../../hooks/useReportsBuildings';

function formatAed(n: number) {
  return `AED ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export default function ReportsPage() {
  const { data = [], isLoading, isError } = useReportsBuildings();

  const rows = data.filter(r => r.buildingId !== null);
  const global = data.find(r => r.buildingId === null);

  const thCls = 'px-4 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-wider text-left';
  const tdCls = 'px-4 py-3 text-sm text-on-surface';
  const tdNum = 'px-4 py-3 text-sm text-on-surface text-right';

  function renderRow(r: BuildingReportRow, isGlobal = false) {
    const rowCls = isGlobal
      ? 'bg-surface-container font-bold border-t-2 border-outline-variant'
      : 'hover:bg-surface-container-low transition-colors';
    return (
      <tr key={r.buildingId ?? 'global'} className={rowCls}>
        <td className={tdCls}>
          {r.buildingCode && (
            <span className="text-[10px] font-bold bg-secondary/10 text-secondary px-1.5 py-0.5 rounded uppercase tracking-wide mr-2">
              {r.buildingCode}
            </span>
          )}
          {r.buildingName}
        </td>
        <td className={tdNum}>{r.totalApartments}</td>
        <td className={tdNum}>{r.occupied}</td>
        <td className={tdNum}>{formatPct(r.occupancyRate)}</td>
        <td className={tdNum}>{formatAed(r.monthlyRevenue)}</td>
        <td className={tdNum}>{r.openTickets}</td>
      </tr>
    );
  }

  return (
    <div className="space-y-widget-gap">
      <div>
        <h2 className="text-display-lg text-primary">Reports</h2>
        <p className="text-on-surface-variant text-body-base mt-1">Per-building performance summary.</p>
      </div>

      {isLoading ? (
        <div className="text-on-surface-variant text-sm p-8 text-center">Loading…</div>
      ) : isError ? (
        <div className="text-error text-sm p-8 text-center">Failed to load report data.</div>
      ) : (
        <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className={thCls}>Building</th>
                  <th className={thCls + ' text-right'}>Total Apts</th>
                  <th className={thCls + ' text-right'}>Occupied</th>
                  <th className={thCls + ' text-right'}>Occupancy</th>
                  <th className={thCls + ' text-right'}>Monthly Revenue</th>
                  <th className={thCls + ' text-right'}>Open Tickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map(r => renderRow(r))}
                {global && renderRow(global, true)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update /reports route in App.tsx**

Import `ReportsPage`:
```typescript
import ReportsPage from './pages/reports/ReportsPage';
```

Replace the placeholder route:
```tsx
// REMOVE:
<Route
  path="reports/*"
  element={
    <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
      <div className="text-on-surface font-semibold p-4">Reports — coming in Phase 5</div>
    </ProtectedRoute>
  }
/>

// ADD:
<Route
  path="reports"
  element={
    <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
      <ReportsPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 4: Commit**

```bash
cd "D:\Hotel Apartment Management System"
git add client/src/hooks/useReportsBuildings.ts \
        client/src/pages/reports/ReportsPage.tsx \
        client/src/App.tsx
git commit -m "feat: add Reports page with per-building stats table"
```

---

## Spec Self-Review

**Spec coverage:**
- ✅ Building model (name, code, address, audit fields) → Task 1
- ✅ Apartment.number unique per building, buildingId required → Task 1
- ✅ Migration seeds default "Main Building", assigns existing apartments → Task 1
- ✅ Buildings CRUD API (ADMIN only for write) → Task 2
- ✅ DELETE guard — 409 if apartments exist → Task 2
- ✅ Optional `?buildingId` filter on apartments, payments, tickets, dashboard → Task 3
- ✅ `GET /reports/buildings` — per-building stats + global totals → Task 4
- ✅ Integration tests → Task 5
- ✅ BuildingContext + useBuilding() + localStorage + stale-reset → Task 6
- ✅ useBuildings() hook → Task 6
- ✅ BuildingSelector in TopBar → Task 7
- ✅ All hooks updated with buildingId → Task 8
- ✅ Building code badge in All mode → Task 9
- ✅ BuildingsPage CRUD (ADMIN only) → Task 10
- ✅ Buildings nav item (ADMIN only) → Task 10
- ✅ ReportsPage with per-building table → Task 11

**Type consistency check:**
- `Building` interface defined in `useBuildings.ts` (Task 6) and used in `BuildingContext.tsx`, `BuildingSelector.tsx`, `BuildingFormModal.tsx`, `BuildingsPage.tsx` — all reference same import.
- `BuildingReportRow` defined in `useReportsBuildings.ts` (Task 11) — used only in `ReportsPage.tsx`.
- `ApartmentListItem.building` added in Task 8 — matches `buildingSelect` shape from Task 2 server code.

**Migration risk note:** The `@default(1)` approach in the schema is intentional — it allows existing integration tests that create apartments without specifying `buildingId` to continue working (they get building 1, the default). After migration, drop the column-level DB default (done in Task 1 Step 3 SQL) so the application always supplies `buildingId` explicitly.
