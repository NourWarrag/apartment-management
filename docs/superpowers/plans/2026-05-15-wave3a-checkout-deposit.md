# Wave 3A — Checkout + Security Deposit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a checkout flow (OCCUPIED → CLEANING → AVAILABLE) and security deposit tracking (collect at booking creation or separately; partially or fully release/forfeit at checkout).

**Architecture:** Five nullable columns + `DepositStatus` enum added to `Booking`. Checkout is a PATCH endpoint that atomically sets `checkedOutAt`, deposit disposition, and apartment status → CLEANING. Mark-ready is a second PATCH on the apartment that moves CLEANING → AVAILABLE. All deposit mutations invalidate `['apartments']` on the client.

**Tech Stack:** Express + Prisma + Vitest + Supertest (server), React Query + react-hook-form + zod + Tailwind MD3 tokens (client)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `shared/index.ts` | Add `DepositStatus` enum |
| Modify | `server/prisma/schema.prisma` | Add `DepositStatus` enum + 5 fields to `Booking` |
| Create | `server/prisma/migrations/20260515100000_wave3a_checkout_deposit/migration.sql` | DB migration |
| Modify | `server/src/controllers/bookings.controller.ts` | Add deposit to `create`, add `collectDeposit`, `checkout` |
| Modify | `server/src/routes/bookings.routes.ts` | Add two PATCH routes |
| Modify | `server/src/controllers/apartments.controller.ts` | Add `markReady` |
| Modify | `server/src/routes/apartments.routes.ts` | Add mark-ready route |
| Create | `server/src/controllers/bookings.controller.test.ts` | Integration tests |
| Modify | `client/src/hooks/useApartments.ts` | Update `ApartmentListItem` + `ApartmentDetail` types; add `useMarkReady` |
| Modify | `client/src/hooks/useBookings.ts` | Update `CreateBookingDto`; add `useCollectDeposit`, `useCheckout` |
| Create | `client/src/pages/apartments/CheckoutModal.tsx` | Checkout confirmation modal |
| Create | `client/src/pages/apartments/CollectDepositModal.tsx` | Collect deposit modal (detail page) |
| Modify | `client/src/pages/apartments/ApartmentsPage.tsx` | Add Checkout (OCCUPIED) + Mark Ready (CLEANING) buttons |
| Modify | `client/src/pages/bookings/BookingFormModal.tsx` | Add optional deposit amount field |
| Modify | `client/src/pages/apartments/ApartmentDetailPage.tsx` | Add Collect Deposit button |

---

### Task 1: Schema + Migration + Shared Enum

**Files:**
- Modify: `shared/index.ts`
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260515100000_wave3a_checkout_deposit/migration.sql`

**Context:** `shared/index.ts` already exports `Role`, `ApartmentStatus`, `PaymentMethod`, `PaymentStatus`, etc. as string enums. Follow that exact pattern. The Prisma schema already has `DepositStatus` referenced nowhere — add it as a new enum and add 5 fields to the `Booking` model. Existing bookings automatically get `depositStatus = 'NONE'` and nulls for the rest (no backfill needed). Run the migration with `prisma migrate deploy` against `DATABASE_URL`. The test DB also needs the migration applied (use `TEST_DATABASE_URL`).

- [ ] **Step 1: Add `DepositStatus` enum to `shared/index.ts`**

Open `shared/index.ts`. After the `PaymentStatus` enum, add:

```typescript
export enum DepositStatus {
  NONE = 'NONE',
  HELD = 'HELD',
  RELEASED = 'RELEASED',
  FORFEITED = 'FORFEITED',
}
```

- [ ] **Step 2: Add enum + fields to `server/prisma/schema.prisma`**

In `schema.prisma`, find the `Booking` model. After `updatedBy Int?`, add:

```prisma
  depositAmount       Decimal?      @db.Decimal(10, 2)
  depositStatus       DepositStatus @default(NONE)
  depositRefundAmount Decimal?      @db.Decimal(10, 2)
  depositCollectedAt  DateTime?
  checkedOutAt        DateTime?
```

At the bottom of `schema.prisma` (after the existing enums), add:

```prisma
enum DepositStatus {
  NONE
  HELD
  RELEASED
  FORFEITED
}
```

- [ ] **Step 3: Create the migration file**

Create directory `server/prisma/migrations/20260515100000_wave3a_checkout_deposit/` and create `migration.sql` inside it:

```sql
-- Add DepositStatus enum
CREATE TYPE "DepositStatus" AS ENUM ('NONE', 'HELD', 'RELEASED', 'FORFEITED');

-- Add deposit + checkout columns to Booking
ALTER TABLE "Booking" ADD COLUMN "depositAmount" DECIMAL(10,2);
ALTER TABLE "Booking" ADD COLUMN "depositStatus" "DepositStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Booking" ADD COLUMN "depositRefundAmount" DECIMAL(10,2);
ALTER TABLE "Booking" ADD COLUMN "depositCollectedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "checkedOutAt" TIMESTAMP(3);
```

- [ ] **Step 4: Apply migration to dev and test databases**

```bash
cd server
npx prisma migrate deploy
TEST_DATABASE_URL="$(grep TEST_DATABASE_URL .env | cut -d= -f2-)" DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

Expected: `All migrations have been successfully applied.`

- [ ] **Step 5: Regenerate Prisma client**

```bash
cd server && npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 6: Commit**

```bash
git add shared/index.ts server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add DepositStatus enum and deposit/checkout fields to Booking schema"
```

---

### Task 2: Server — Bookings Controller + Routes

**Files:**
- Modify: `server/src/controllers/bookings.controller.ts`
- Modify: `server/src/routes/bookings.routes.ts`

**Context:** The existing `bookings.controller.ts` has only one export: `create`. It imports from `@hotel/shared` and uses `prisma` from `'../lib/prisma'`. The `create` function creates a booking + payment + updates apartment status in a single `$transaction`. You must keep all existing logic in `create` and only add the optional deposit branch. The `collectDeposit` and `checkout` functions follow the same error-handling pattern: validate inputs, check guards, update in a transaction (for checkout), return the updated record.

The `checkout` function uses `Number(booking.depositAmount)` to convert Prisma's `Decimal` to a JS number for comparison with `depositRefundAmount`. Decimal from Prisma serializes to a special object in JS — always wrap in `Number()` before comparing.

- [ ] **Step 1: Write the failing test (defer — covered in Task 4)**

Skip — tests are written in Task 4. Proceed to implementation.

- [ ] **Step 2: Replace `server/src/controllers/bookings.controller.ts`**

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PaymentMethod, PaymentStatus, ApartmentStatus, DepositStatus } from '@hotel/shared';

const VALID_METHODS = Object.values(PaymentMethod);

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { apartmentId, tenantId, checkIn, checkOut, totalAmount, payment, deposit } = req.body as {
      apartmentId?: number;
      tenantId?: number;
      checkIn?: string;
      checkOut?: string;
      totalAmount?: number;
      payment?: { method?: string; amount?: number; referenceNumber?: string };
      deposit?: { amount?: number };
    };

    if (!apartmentId || !tenantId || !checkIn || !checkOut || totalAmount === undefined || totalAmount === null) {
      res.status(400).json({ message: 'apartmentId, tenantId, checkIn, checkOut, and totalAmount are required' });
      return;
    }
    if (!payment || !payment.method || payment.amount === undefined || payment.amount === null) {
      res.status(400).json({ message: 'payment.method and payment.amount are required' });
      return;
    }
    if (!VALID_METHODS.includes(payment.method as PaymentMethod)) {
      res.status(400).json({ message: `Invalid payment method. Must be one of: ${VALID_METHODS.join(', ')}` });
      return;
    }
    if (typeof payment.amount !== 'number' || payment.amount <= 0) {
      res.status(400).json({ message: 'payment.amount must be a positive number' });
      return;
    }
    if (typeof totalAmount !== 'number' || totalAmount <= 0) {
      res.status(400).json({ message: 'totalAmount must be a positive number' });
      return;
    }
    if (deposit !== undefined && (typeof deposit.amount !== 'number' || deposit.amount <= 0)) {
      res.status(400).json({ message: 'deposit.amount must be a positive number' });
      return;
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      res.status(400).json({ message: 'Invalid date format for checkIn or checkOut' });
      return;
    }
    if (checkOutDate <= checkInDate) {
      res.status(400).json({ message: 'checkOut must be after checkIn' });
      return;
    }

    const apartment = await prisma.apartment.findUnique({ where: { id: Number(apartmentId) } });
    if (!apartment) {
      res.status(404).json({ message: 'Apartment not found' });
      return;
    }
    if (apartment.status !== ApartmentStatus.AVAILABLE) {
      res.status(409).json({ message: 'Apartment is not available' });
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
    if (!tenant) {
      res.status(404).json({ message: 'Tenant not found' });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const checkInStr = checkIn.slice(0, 10);
    const newStatus = checkInStr <= todayStr ? ApartmentStatus.OCCUPIED : ApartmentStatus.RESERVED;

    const depositData =
      deposit?.amount
        ? {
            depositAmount: deposit.amount,
            depositStatus: DepositStatus.HELD,
            depositCollectedAt: new Date(),
          }
        : {};

    const booking = await prisma.$transaction(async (tx) => {
      const newBooking = await tx.booking.create({
        data: {
          apartmentId: Number(apartmentId),
          tenantId: Number(tenantId),
          checkIn: checkInDate,
          checkOut: checkOutDate,
          totalAmount,
          ...depositData,
        },
      });

      await tx.payment.create({
        data: {
          bookingId: newBooking.id,
          method: payment.method as PaymentMethod,
          amount: payment.amount as number,
          referenceNumber: payment.referenceNumber?.trim() || null,
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      await tx.apartment.update({
        where: { id: Number(apartmentId) },
        data: { status: newStatus },
      });

      return tx.booking.findUnique({
        where: { id: newBooking.id },
        include: {
          apartment: { select: { id: true, number: true, floor: true } },
          tenant: { select: { id: true, fullName: true, phone: true } },
          payments: { select: { id: true, method: true, amount: true, status: true } },
        },
      });
    });

    res.status(201).json(booking);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function collectDeposit(req: AuthRequest, res: Response): Promise<void> {
  try {
    const bookingId = Number(req.params.id);
    if (isNaN(bookingId) || bookingId <= 0) {
      res.status(400).json({ message: 'Invalid booking ID' });
      return;
    }

    const { amount } = req.body as { amount?: number };
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ message: 'amount must be a positive number' });
      return;
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }
    if (booking.checkedOutAt !== null) {
      res.status(409).json({ message: 'Cannot collect deposit on a checked-out booking' });
      return;
    }
    if (booking.depositStatus !== DepositStatus.NONE) {
      res.status(409).json({ message: 'Deposit already collected' });
      return;
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        depositAmount: amount,
        depositStatus: DepositStatus.HELD,
        depositCollectedAt: new Date(),
      },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function checkout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const bookingId = Number(req.params.id);
    if (isNaN(bookingId) || bookingId <= 0) {
      res.status(400).json({ message: 'Invalid booking ID' });
      return;
    }

    const { depositRefundAmount } = req.body as { depositRefundAmount?: number };

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { apartment: true },
    });

    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }
    if (booking.checkedOutAt !== null) {
      res.status(409).json({ message: 'Booking already checked out' });
      return;
    }
    if (booking.apartment.status !== ApartmentStatus.OCCUPIED) {
      res.status(400).json({ message: 'Apartment is not in OCCUPIED status' });
      return;
    }

    if (booking.depositStatus === DepositStatus.HELD) {
      if (depositRefundAmount === undefined || depositRefundAmount === null) {
        res.status(400).json({ message: 'depositRefundAmount is required when deposit is held' });
        return;
      }
      if (typeof depositRefundAmount !== 'number' || depositRefundAmount < 0) {
        res.status(400).json({ message: 'depositRefundAmount must be a non-negative number' });
        return;
      }
      if (depositRefundAmount > Number(booking.depositAmount)) {
        res.status(400).json({ message: 'Refund amount cannot exceed deposit amount' });
        return;
      }
    }

    const newDepositStatus =
      booking.depositStatus === DepositStatus.HELD
        ? depositRefundAmount === Number(booking.depositAmount)
          ? DepositStatus.RELEASED
          : DepositStatus.FORFEITED
        : booking.depositStatus;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          checkedOutAt: new Date(),
          ...(booking.depositStatus === DepositStatus.HELD
            ? { depositStatus: newDepositStatus, depositRefundAmount }
            : {}),
        },
      });

      await tx.apartment.update({
        where: { id: booking.apartmentId },
        data: { status: ApartmentStatus.CLEANING },
      });

      return updated;
    });

    res.json(result);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 3: Replace `server/src/routes/bookings.routes.ts`**

```typescript
import { Router } from 'express';
import { create, collectDeposit, checkout } from '../controllers/bookings.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.patch('/:id/deposit', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), collectDeposit);
router.patch('/:id/checkout', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), checkout);

export default router;
```

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/bookings.controller.ts server/src/routes/bookings.routes.ts
git commit -m "feat: add deposit to booking create, collectDeposit and checkout endpoints"
```

---

### Task 3: Server — Apartments Mark-Ready Endpoint

**Files:**
- Modify: `server/src/controllers/apartments.controller.ts`
- Modify: `server/src/routes/apartments.routes.ts`

**Context:** `apartments.controller.ts` already exports `list`, `create`, `getById`, `update`, `remove`. Add `markReady` at the bottom of the file — same pattern as the others. The route is `PATCH /:id/mark-ready` so it won't conflict with `PATCH /:id` (which calls `update`). Add the route before the `export default router` line in `apartments.routes.ts`.

- [ ] **Step 1: Add `markReady` to `server/src/controllers/apartments.controller.ts`**

At the bottom of the file, add:

```typescript
export async function markReady(req: AuthRequest, res: Response): Promise<void> {
  try {
    const aptId = Number(req.params.id);
    if (isNaN(aptId) || aptId <= 0) {
      res.status(400).json({ message: 'Invalid apartment ID' });
      return;
    }

    const apartment = await prisma.apartment.findUnique({ where: { id: aptId } });
    if (!apartment) {
      res.status(404).json({ message: 'Apartment not found' });
      return;
    }
    if (apartment.status !== ApartmentStatus.CLEANING) {
      res.status(400).json({ message: 'Apartment is not in CLEANING status' });
      return;
    }

    const updated = await prisma.apartment.update({
      where: { id: aptId },
      data: { status: ApartmentStatus.AVAILABLE },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Add mark-ready route to `server/src/routes/apartments.routes.ts`**

Replace the file content:

```typescript
import { Router } from 'express';
import { list, create, getById, update, remove, markReady } from '../controllers/apartments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();

router.use(authMiddleware);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', getById);
router.put('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);
router.patch('/:id/mark-ready', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), markReady);
router.patch('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);
router.delete('/:id', requireRole(Role.ADMIN), remove);

export default router;
```

Note: `PATCH /:id/mark-ready` must be registered **before** `PATCH /:id` so Express matches the more specific route first.

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/apartments.controller.ts server/src/routes/apartments.routes.ts
git commit -m "feat: add mark-ready endpoint (CLEANING → AVAILABLE)"
```

---

### Task 4: Server — Integration Tests

**Files:**
- Create: `server/src/controllers/bookings.controller.test.ts`

**Context:** Follow the exact pattern from `server/src/controllers/users.controller.test.ts`. Use `testPrisma` (bare `new PrismaClient` against `TEST_DATABASE_URL`) for setup/teardown. Use `supertest` with `app` from `'../app'`. Auth tokens are set as cookies: `set('Cookie', adminToken)`. The `signToken` signature is `signToken({ id, role, assignedBuildingId: null })`. Clean up using raw SQL in `beforeAll` and `afterAll`. The test database must have the wave3a migration applied (done in Task 1 Step 4).

Tests create a Building → Apartment → Tenant in beforeAll. Each describe block that needs a fresh booking creates one in a nested beforeAll, or creates the booking inside each test. Since checkout modifies apartment state, each checkout test needs its own OCCUPIED apartment+booking pair — create them inside the test using `testPrisma` directly, bypassing the controller's AVAILABLE-only guard by setting status to OCCUPIED via raw update.

- [ ] **Step 1: Create `server/src/controllers/bookings.controller.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import db from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { Role, ApartmentStatus, DepositStatus } from '@hotel/shared';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminToken: string;
let buildingId: number;
let tenantId: number;

beforeAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001'))`;
  await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'TEST-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000001'`;
  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'TEST-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email = 'admin_booking_test@test.com'`;

  const building = await testPrisma.building.create({
    data: { name: 'Test Building', code: 'TEST-BLD', address: '1 Test St' },
  });
  buildingId = building.id;

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Test Tenant', phone: '0500000001', idNumber: 'TEST-ID-001' },
  });
  tenantId = tenant.id;

  const admin = await testPrisma.user.create({
    data: {
      name: 'Booking Admin',
      email: 'admin_booking_test@test.com',
      password: await hashPassword('password123'),
      role: Role.ADMIN,
    },
  });
  adminToken = `token=${signToken({ id: admin.id, role: admin.role, assignedBuildingId: null })}`;
});

afterAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001'))`;
  await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'TEST-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000001'`;
  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'TEST-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email = 'admin_booking_test@test.com'`;
  await testPrisma.$disconnect();
  await db.$disconnect();
});

async function createAvailableApartment(suffix: string) {
  return testPrisma.apartment.create({
    data: { number: `TEST-${suffix}`, floor: 1, buildingId },
  });
}

async function createOccupiedBookingWithDeposit(aptId: number, depositAmount: number) {
  const booking = await testPrisma.booking.create({
    data: {
      apartmentId: aptId,
      tenantId,
      checkIn: new Date('2026-01-01'),
      checkOut: new Date('2026-02-01'),
      totalAmount: 5000,
      depositAmount,
      depositStatus: 'HELD',
      depositCollectedAt: new Date(),
    },
  });
  await testPrisma.apartment.update({
    where: { id: aptId },
    data: { status: 'OCCUPIED' },
  });
  return booking;
}

describe('POST /api/v1/bookings — with deposit', () => {
  it('creates booking with depositStatus HELD when deposit.amount provided', async () => {
    const apt = await createAvailableApartment('DEP-CREATE');

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminToken)
      .send({
        apartmentId: apt.id,
        tenantId,
        checkIn: '2026-06-01',
        checkOut: '2026-07-01',
        totalAmount: 5000,
        payment: { method: 'CASH', amount: 5000 },
        deposit: { amount: 1000 },
      });

    expect(res.status).toBe(201);
    expect(res.body.depositStatus).toBe('HELD');
    expect(Number(res.body.depositAmount)).toBe(1000);
    expect(res.body.depositCollectedAt).not.toBeNull();
  });
});

describe('PATCH /api/v1/bookings/:id/deposit', () => {
  it('collects deposit on a booking that has none', async () => {
    const apt = await createAvailableApartment('DEP-COLLECT');
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date('2026-06-01'),
        checkOut: new Date('2026-07-01'),
        totalAmount: 5000,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/deposit`)
      .set('Cookie', adminToken)
      .send({ amount: 1500 });

    expect(res.status).toBe(200);
    expect(res.body.depositStatus).toBe('HELD');
    expect(Number(res.body.depositAmount)).toBe(1500);
  });

  it('returns 409 when deposit is already held', async () => {
    const apt = await createAvailableApartment('DEP-ALREADY');
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date('2026-06-01'),
        checkOut: new Date('2026-07-01'),
        totalAmount: 5000,
        depositAmount: 1000,
        depositStatus: 'HELD',
        depositCollectedAt: new Date(),
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/deposit`)
      .set('Cookie', adminToken)
      .send({ amount: 500 });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Deposit already collected');
  });
});

describe('PATCH /api/v1/bookings/:id/checkout', () => {
  it('full release: sets checkedOutAt, depositStatus RELEASED, apartment CLEANING', async () => {
    const apt = await createAvailableApartment('CO-FULL');
    const booking = await createOccupiedBookingWithDeposit(apt.id, 1000);

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({ depositRefundAmount: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.depositStatus).toBe('RELEASED');
    expect(Number(res.body.depositRefundAmount)).toBe(1000);
    expect(res.body.checkedOutAt).not.toBeNull();

    const updatedApt = await testPrisma.apartment.findUnique({ where: { id: apt.id } });
    expect(updatedApt?.status).toBe('CLEANING');
  });

  it('partial refund: sets depositStatus FORFEITED', async () => {
    const apt = await createAvailableApartment('CO-FORFEIT');
    const booking = await createOccupiedBookingWithDeposit(apt.id, 1000);

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({ depositRefundAmount: 500 });

    expect(res.status).toBe(200);
    expect(res.body.depositStatus).toBe('FORFEITED');
    expect(Number(res.body.depositRefundAmount)).toBe(500);
  });

  it('returns 409 when booking is already checked out', async () => {
    const apt = await createAvailableApartment('CO-ALREADY');
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date('2026-01-01'),
        checkOut: new Date('2026-02-01'),
        totalAmount: 5000,
        checkedOutAt: new Date(),
      },
    });
    await testPrisma.apartment.update({ where: { id: apt.id }, data: { status: 'CLEANING' } });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Booking already checked out');
  });

  it('returns 400 when deposit held but depositRefundAmount missing', async () => {
    const apt = await createAvailableApartment('CO-MISSING');
    const booking = await createOccupiedBookingWithDeposit(apt.id, 1000);

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('depositRefundAmount is required when deposit is held');
  });
});

describe('PATCH /api/v1/apartments/:id/mark-ready', () => {
  it('marks a CLEANING apartment as AVAILABLE', async () => {
    const apt = await testPrisma.apartment.create({
      data: { number: 'TEST-MR-1', floor: 2, buildingId, status: 'CLEANING' },
    });

    const res = await request(app)
      .patch(`/api/v1/apartments/${apt.id}/mark-ready`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AVAILABLE');
  });

  it('returns 400 when apartment is not CLEANING', async () => {
    const apt = await testPrisma.apartment.create({
      data: { number: 'TEST-MR-2', floor: 2, buildingId, status: 'AVAILABLE' },
    });

    const res = await request(app)
      .patch(`/api/v1/apartments/${apt.id}/mark-ready`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Apartment is not in CLEANING status');
  });
});
```

- [ ] **Step 2: Run the tests and verify they pass**

```bash
cd server && npx vitest run --reporter=verbose src/controllers/bookings.controller.test.ts
```

Expected: All 8 tests pass (green).

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/bookings.controller.test.ts
git commit -m "test: booking checkout + deposit + mark-ready integration tests"
```

---

### Task 5: Client — Type Updates + Mutation Hooks

**Files:**
- Modify: `client/src/hooks/useApartments.ts`
- Modify: `client/src/hooks/useBookings.ts`

**Context:** The apartments list endpoint uses Prisma `include` on bookings (not `select`), so all scalar booking fields — including the new deposit fields — are returned automatically after the migration. The TypeScript interfaces need updating to match. Prisma's `Decimal` type serializes to a string in JSON responses, so `depositAmount` and `depositRefundAmount` are typed as `string | null`. `depositStatus` is typed as `DepositStatus` (from `@hotel/shared`). `checkedOutAt` and `depositCollectedAt` are typed as `string | null`.

`useMarkReady` invalidates `['apartments']` on success (apartment status changes). `useCheckout` and `useCollectDeposit` also invalidate `['apartments']`.

- [ ] **Step 1: Update `client/src/hooks/useApartments.ts`**

Replace the file with:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { ApartmentStatus, ApartmentType, DepositStatus } from '@hotel/shared';
import { useBuilding } from '../context/BuildingContext';

export interface BookingOnApartment {
  id: number;
  checkIn: string;
  checkOut: string;
  totalAmount: string;
  depositAmount: string | null;
  depositStatus: DepositStatus;
  depositRefundAmount: string | null;
  depositCollectedAt: string | null;
  checkedOutAt: string | null;
  tenant: { id: number; fullName: string; phone: string };
  payments: { method: string; amount: string; status: string; paidAt: string | null }[];
}

export interface ApartmentListItem {
  id: number;
  number: string;
  floor: number;
  type: ApartmentType;
  status: ApartmentStatus;
  currentBooking: BookingOnApartment | null;
  upcomingBooking: {
    id: number;
    checkIn: string;
    checkOut: string;
    tenant: { id: number; fullName: string; phone: string };
  } | null;
  activeTicket: { id: number; status: string; priority: string } | null;
  building: { id: number; name: string; code: string };
}

export interface ApartmentDetail extends Omit<ApartmentListItem, 'upcomingBooking' | 'activeTicket'> {
  bookings: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
    depositAmount: string | null;
    depositStatus: DepositStatus;
    depositRefundAmount: string | null;
    depositCollectedAt: string | null;
    checkedOutAt: string | null;
    tenant: { id: number; fullName: string; phone: string };
    payments: { id: number; method: string; amount: string; status: string; paidAt: string | null; createdAt: string }[];
  }[];
  tickets: {
    id: number;
    description: string;
    priority: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
    assignedTo: { id: number; name: string } | null;
  }[];
}

export interface CreateApartmentDto {
  number: string;
  floor: number;
  type?: ApartmentType;
  buildingId: number;
}

export interface UpdateApartmentDto {
  number?: string;
  floor?: number;
  type?: ApartmentType;
  status?: ApartmentStatus;
}

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

export function useApartment(id: number) {
  return useQuery<ApartmentDetail>({
    queryKey: ['apartments', id],
    queryFn: async () => {
      const res = await api.get(`/apartments/${id}`);
      return res.data;
    },
    enabled: id > 0,
  });
}

export function useCreateApartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApartmentDto) => api.post('/apartments', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apartments'] }),
  });
}

export function useUpdateApartment(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateApartmentDto) => api.put(`/apartments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['apartments', id] });
    },
  });
}

export function useMarkReady(apartmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch(`/apartments/${apartmentId}/mark-ready`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apartments'] }),
  });
}
```

- [ ] **Step 2: Update `client/src/hooks/useBookings.ts`**

Replace the file with:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface CreateBookingDto {
  apartmentId: number;
  tenantId: number;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  payment: {
    method: 'CASH' | 'CARD' | 'INSTALLMENT';
    amount: number;
    referenceNumber?: string;
  };
  deposit?: { amount: number };
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookingDto) => api.post('/bookings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}

export function useCollectDeposit(bookingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => api.patch(`/bookings/${bookingId}/deposit`, { amount }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apartments'] }),
  });
}

export function useCheckout(bookingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (depositRefundAmount?: number) =>
      api.patch(`/bookings/${bookingId}/checkout`, { depositRefundAmount }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apartments'] }),
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useApartments.ts client/src/hooks/useBookings.ts
git commit -m "feat: update apartment/booking types with deposit fields, add checkout mutation hooks"
```

---

### Task 6: Client — CheckoutModal + CollectDepositModal

**Files:**
- Create: `client/src/pages/apartments/CheckoutModal.tsx`
- Create: `client/src/pages/apartments/CollectDepositModal.tsx`

**Context:** Both modals follow the same pattern as `ApartmentFormModal.tsx` — fixed overlay, white card, react-hook-form + zod, toast on success/error. `CheckoutModal` receives a `booking` object with the deposit fields; it shows a deposit refund amount input only when `depositStatus === 'HELD'`. The input is pre-filled with the full deposit amount (full release). `CollectDepositModal` is a simpler single-field modal for collecting a deposit on an existing booking.

`useCheckout` takes an optional `depositRefundAmount` number. When calling it, pass `undefined` if there's no deposit, or the form value if deposit is HELD. `useCollectDeposit` takes the amount as the mutationFn argument.

- [ ] **Step 1: Create `client/src/pages/apartments/CheckoutModal.tsx`**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { DepositStatus } from '@hotel/shared';
import { useCheckout } from '../../hooks/useBookings';
import type { BookingOnApartment } from '../../hooks/useApartments';

interface Props {
  booking: BookingOnApartment;
  onClose: () => void;
}

export default function CheckoutModal({ booking, onClose }: Props) {
  const hasDeposit = booking.depositStatus === DepositStatus.HELD;
  const depositAmt = Number(booking.depositAmount ?? 0);

  const schema = z.object({
    depositRefundAmount: hasDeposit
      ? z.coerce
          .number()
          .min(0, 'Must be 0 or more')
          .max(depositAmt, `Cannot exceed deposit of ${depositAmt}`)
      : z.coerce.number().optional(),
  });

  type FormValues = z.infer<typeof schema>;

  const checkout = useCheckout(booking.id);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { depositRefundAmount: hasDeposit ? depositAmt : undefined },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await checkout.mutateAsync(hasDeposit ? data.depositRefundAmount : undefined);
      toast.success('Checkout complete — apartment is now in cleaning');
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Checkout failed');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">Checkout</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-2 mb-6 text-sm text-on-surface-variant">
          <p><span className="font-semibold text-on-surface">Tenant:</span> {booking.tenant.fullName}</p>
          <p>
            <span className="font-semibold text-on-surface">Stay:</span>{' '}
            {new Date(booking.checkIn).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' — '}
            {new Date(booking.checkOut).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <p><span className="font-semibold text-on-surface">Total:</span> AED {Number(booking.totalAmount).toLocaleString()}</p>
          {hasDeposit && (
            <p><span className="font-semibold text-on-surface">Security Deposit:</span> AED {depositAmt.toLocaleString()}</p>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {hasDeposit && (
            <div>
              <label className={labelCls}>Deposit Refund Amount (AED)</label>
              <input
                {...register('depositRefundAmount')}
                type="number"
                min={0}
                max={depositAmt}
                step="0.01"
                className={inputCls}
              />
              {errors.depositRefundAmount && (
                <p className="text-error text-xs mt-1">{errors.depositRefundAmount.message}</p>
              )}
              <p className="text-xs text-on-surface-variant mt-1">
                Full deposit = full release. Any lower amount = forfeited (kept for damages).
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={checkout.isPending}
              className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {checkout.isPending ? 'Processing…' : 'Confirm Checkout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/apartments/CollectDepositModal.tsx`**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useCollectDeposit } from '../../hooks/useBookings';

interface Props {
  bookingId: number;
  tenantName: string;
  onClose: () => void;
}

const schema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
});

type FormValues = z.infer<typeof schema>;

export default function CollectDepositModal({ bookingId, tenantName, onClose }: Props) {
  const collectDeposit = useCollectDeposit(bookingId);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await collectDeposit.mutateAsync(data.amount);
      toast.success('Deposit collected');
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to collect deposit');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-sm p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">Collect Security Deposit</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <p className="text-sm text-on-surface-variant mb-4">Tenant: <span className="font-semibold text-on-surface">{tenantName}</span></p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Deposit Amount (AED)</label>
            <input
              {...register('amount')}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={inputCls}
            />
            {errors.amount && <p className="text-error text-xs mt-1">{errors.amount.message}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={collectDeposit.isPending}
              className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {collectDeposit.isPending ? 'Saving…' : 'Collect Deposit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/apartments/CheckoutModal.tsx client/src/pages/apartments/CollectDepositModal.tsx
git commit -m "feat: CheckoutModal and CollectDepositModal components"
```

---

### Task 7: Client — ApartmentsPage Updates

**Files:**
- Modify: `client/src/pages/apartments/ApartmentsPage.tsx`

**Context:** The existing page has a `canEdit` variable: `user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST`. Add a separate `canCheckout` that also includes `BUILDING_ADMIN`. Add `checkoutTarget` state (holds the `BookingOnApartment` to check out) and inline `useMarkReady` calls per-row. The Checkout button appears on OCCUPIED rows with a current booking. The Mark Ready button appears on CLEANING rows — it calls `useMarkReady` directly with a toast (no modal). Each CLEANING row needs its own `useMarkReady` hook call, but hooks can't be called conditionally per row — instead, render a small sub-component `MarkReadyButton` that calls `useMarkReady` inside it.

- [ ] **Step 1: Add imports to `client/src/pages/apartments/ApartmentsPage.tsx`**

Add to the existing imports at the top:

```typescript
import CheckoutModal from './CheckoutModal';
import type { BookingOnApartment } from '../../hooks/useApartments';
import { useMarkReady } from '../../hooks/useApartments';
```

Also add `toast` import if not present:

```typescript
import toast from 'react-hot-toast';
```

- [ ] **Step 2: Add `MarkReadyButton` sub-component above `ApartmentsPage`**

Add this component definition before the `export default function ApartmentsPage()` line:

```typescript
function MarkReadyButton({ apartmentId }: { apartmentId: number }) {
  const markReady = useMarkReady(apartmentId);

  const handleClick = async () => {
    try {
      await markReady.mutateAsync();
      toast.success('Apartment marked as available');
    } catch {
      toast.error('Failed to mark apartment as ready');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={markReady.isPending}
      className="p-1 hover:bg-surface-container rounded-full disabled:opacity-50"
      title="Mark ready (cleaning done)"
    >
      <span className="material-symbols-outlined text-[20px] text-green-600">done_all</span>
    </button>
  );
}
```

- [ ] **Step 3: Add `checkoutTarget` state and `canCheckout` inside `ApartmentsPage`**

In the state declarations section (near `bookingAptId`), add:

```typescript
const [checkoutTarget, setCheckoutTarget] = useState<BookingOnApartment | null>(null);
const canCheckout =
  user?.role === Role.ADMIN ||
  user?.role === Role.RECEPTIONIST ||
  user?.role === Role.BUILDING_ADMIN;
```

- [ ] **Step 4: Add Checkout and Mark Ready buttons in the actions column**

Find the actions `<td>` inside the table row map. Inside the `canEdit` block, after the existing booking payment button and new-reservation button, add:

```typescript
{apt.status === ApartmentStatus.OCCUPIED && apt.currentBooking && canCheckout && (
  <button
    onClick={() => setCheckoutTarget(apt.currentBooking!)}
    className="p-1 hover:bg-surface-container rounded-full"
    title="Checkout"
  >
    <span className="material-symbols-outlined text-[20px] text-amber-600">logout</span>
  </button>
)}
{apt.status === ApartmentStatus.CLEANING && canCheckout && (
  <MarkReadyButton apartmentId={apt.id} />
)}
```

- [ ] **Step 5: Render `CheckoutModal` at the bottom of the JSX**

Find the block where `ApartmentFormModal`, `PaymentFormModal`, and `BookingFormModal` are rendered. Add after them:

```typescript
{checkoutTarget && (
  <CheckoutModal
    booking={checkoutTarget}
    onClose={() => setCheckoutTarget(null)}
  />
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/apartments/ApartmentsPage.tsx
git commit -m "feat: add checkout and mark-ready buttons to ApartmentsPage"
```

---

### Task 8: Client — BookingFormModal Deposit Field

**Files:**
- Modify: `client/src/pages/bookings/BookingFormModal.tsx`

**Context:** The existing `BookingFormModal` has a form with apartment, tenant, dates, totalAmount, and payment fields. Add an optional "Security Deposit" section after the payment section. The deposit amount is optional — if left empty (0 or blank), don't include `deposit` in the submitted data. `CreateBookingDto` now accepts `deposit?: { amount: number }`. Only include it if the user enters a value > 0.

- [ ] **Step 1: Add `depositAmount` to the zod schema in `BookingFormModal.tsx`**

In the existing `schema` object, add after the `referenceNumber` field:

```typescript
depositAmount: z.coerce.number().min(0).optional(),
```

- [ ] **Step 2: Update `onSubmit` to include deposit if provided**

Replace the `createBooking.mutateAsync` call body:

```typescript
await createBooking.mutateAsync({
  apartmentId: values.apartmentId,
  tenantId: values.tenantId,
  checkIn: values.checkIn,
  checkOut: values.checkOut,
  totalAmount: values.totalAmount,
  payment: {
    method: values.paymentMethod,
    amount: values.paymentAmount,
    referenceNumber: values.referenceNumber?.trim() || undefined,
  },
  ...(values.depositAmount && values.depositAmount > 0
    ? { deposit: { amount: values.depositAmount } }
    : {}),
});
```

- [ ] **Step 3: Add the deposit input field to the form JSX**

After the closing `</div>` of the payment section (after the referenceNumber conditional block and before `{apiError && ...}`), add:

```typescript
<div className="border-t border-outline-variant pt-4">
  <p className="text-sm font-bold text-on-surface mb-3">Security Deposit <span className="font-normal text-on-surface-variant">(optional)</span></p>
  <div>
    <label className={labelCls}>Deposit Amount (AED)</label>
    <input
      {...register('depositAmount')}
      type="number"
      min="0"
      step="0.01"
      placeholder="0.00"
      className={inputCls}
    />
    <p className="text-xs text-on-surface-variant mt-1">Leave empty if no deposit collected at check-in.</p>
  </div>
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/bookings/BookingFormModal.tsx
git commit -m "feat: add optional security deposit field to BookingFormModal"
```

---

### Task 9: Client — ApartmentDetailPage Collect Deposit Button

**Files:**
- Modify: `client/src/pages/apartments/ApartmentDetailPage.tsx`

**Context:** `ApartmentDetailPage` uses `useApartment(aptId)` which returns `ApartmentDetail`. `ApartmentDetail` extends `ApartmentListItem` (minus upcomingBooking/activeTicket), so it includes `currentBooking` with deposit fields. Show a "Collect Deposit" button when `apartment.currentBooking?.depositStatus === DepositStatus.NONE` and the user can edit. Clicking opens `CollectDepositModal`.

- [ ] **Step 1: Add imports to `ApartmentDetailPage.tsx`**

Add to existing imports:

```typescript
import { useState } from 'react';  // already present — skip if so
import { DepositStatus } from '@hotel/shared';
import CollectDepositModal from './CollectDepositModal';
```

- [ ] **Step 2: Add `showCollectDeposit` state inside the component**

Near the existing `const [showEdit, setShowEdit] = useState(false);` line, add:

```typescript
const [showCollectDeposit, setShowCollectDeposit] = useState(false);
```

- [ ] **Step 3: Add the Collect Deposit button to the header area**

In the header section where the edit button is (inside the `{canEdit && (...)}` block), add a second button after the edit button:

```typescript
{canEdit && apartment.currentBooking?.depositStatus === DepositStatus.NONE && (
  <button
    onClick={() => setShowCollectDeposit(true)}
    className="flex items-center gap-2 border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2 text-sm font-medium hover:bg-surface-container transition-colors"
  >
    <span className="material-symbols-outlined text-[16px]">savings</span>
    Collect Deposit
  </button>
)}
```

- [ ] **Step 4: Render `CollectDepositModal` at the bottom of the component JSX**

Before the closing `</div>` of the component's return, add:

```typescript
{showCollectDeposit && apartment.currentBooking && (
  <CollectDepositModal
    bookingId={apartment.currentBooking.id}
    tenantName={apartment.currentBooking.tenant.fullName}
    onClose={() => setShowCollectDeposit(false)}
  />
)}
```

- [ ] **Step 5: Verify TypeScript compiles and no regressions**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/apartments/ApartmentDetailPage.tsx
git commit -m "feat: add Collect Deposit button to ApartmentDetailPage"
```
