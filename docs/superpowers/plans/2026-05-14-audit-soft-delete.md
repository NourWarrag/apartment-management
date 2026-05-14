# Audit Columns + Soft Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `createdBy`/`updatedBy` audit columns to all six models and soft delete (`deletedAt`/`deletedBy`) to `User`, `Tenant`, and `Apartment`, auto-injected via Prisma 5 Client Extensions and `AsyncLocalStorage`.

**Architecture:** A per-request `AsyncLocalStorage` store holds the authenticated user ID. A Prisma Client Extension (`$extends`) auto-injects `createdBy`/`updatedBy` on every create/update, and converts `delete` operations on the three soft-delete models to updates that set `deletedAt`/`deletedBy`. Read operations (`findMany`, `count`, `findFirst`, `findUnique`) on those models automatically exclude soft-deleted records. Deleted records remain visible in related views (Payment, Ticket) with a "Deleted" badge rendered from a `deletedAt` field the API now includes.

**Tech Stack:** Prisma 5 Client Extensions (`$extends` — NOT `$use`, which was removed in Prisma 5), Node.js `AsyncLocalStorage`, TypeScript, Express middleware, React

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `server/prisma/schema.prisma` | Add audit + soft-delete columns + relations |
| Create | `server/src/lib/requestContext.ts` | AsyncLocalStorage store + `getContextUserId()` |
| Modify | `server/src/lib/prisma.ts` | Prisma Client Extensions (audit + soft delete) |
| Modify | `server/src/middleware/auth.middleware.ts` | Wrap `next()` in `requestContext.run()` |
| Create | `server/src/controllers/audit-soft-delete.controller.test.ts` | Integration tests |
| Modify | `server/src/controllers/tickets.controller.ts` | Add `deletedAt` to apartment select |
| Modify | `server/src/controllers/payments.controller.ts` | Add `deletedAt` to tenant + apartment selects |
| Modify | `client/src/hooks/useTickets.ts` | Add `deletedAt` to `TicketItem.apartment` type |
| Modify | `client/src/hooks/usePayments.ts` | Add `deletedAt` to tenant + apartment types |
| Modify | `client/src/pages/tickets/TicketsPage.tsx` | "Deleted" badge on apartment number |
| Modify | `client/src/pages/tickets/TicketDetailPanel.tsx` | "Deleted" badge on apartment number |
| Modify | `client/src/pages/payments/PaymentsPage.tsx` | "Deleted" badge on tenant name + apartment number |

---

### Task 1: Schema Migration

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Replace the full schema with the updated version**

Replace the entire content of `server/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int       @id @default(autoincrement())
  name      String
  email     String    @unique
  password  String
  role      Role
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  createdBy Int?
  updatedBy Int?
  deletedBy Int?

  // Self-referential audit + soft-delete relations
  creator      User?   @relation("UserCreatedBy",  fields: [createdBy], references: [id], onDelete: SetNull)
  updater      User?   @relation("UserUpdatedBy",  fields: [updatedBy], references: [id], onDelete: SetNull)
  deleter      User?   @relation("UserDeletedBy",  fields: [deletedBy], references: [id], onDelete: SetNull)
  createdUsers User[]  @relation("UserCreatedBy")
  updatedUsers User[]  @relation("UserUpdatedBy")
  deletedUsers User[]  @relation("UserDeletedBy")

  // Existing relation — must be named now that there are multiple User↔MaintenanceTicket relations
  assignedTickets MaintenanceTicket[] @relation("TicketAssignedTo")
  auditLogs       AuditLog[]

  // Back-relations for audit columns on other models
  createdApartments Apartment[]         @relation("ApartmentCreatedBy")
  updatedApartments Apartment[]         @relation("ApartmentUpdatedBy")
  deletedApartments Apartment[]         @relation("ApartmentDeletedBy")
  createdTenants    Tenant[]            @relation("TenantCreatedBy")
  updatedTenants    Tenant[]            @relation("TenantUpdatedBy")
  deletedTenants    Tenant[]            @relation("TenantDeletedBy")
  createdBookings   Booking[]           @relation("BookingCreatedBy")
  updatedBookings   Booking[]           @relation("BookingUpdatedBy")
  createdPayments   Payment[]           @relation("PaymentCreatedBy")
  updatedPayments   Payment[]           @relation("PaymentUpdatedBy")
  createdTickets    MaintenanceTicket[] @relation("TicketCreatedBy")
  updatedTickets    MaintenanceTicket[] @relation("TicketUpdatedBy")
}

model Apartment {
  id        Int             @id @default(autoincrement())
  number    String          @unique
  floor     Int
  type      ApartmentType   @default(STUDIO)
  status    ApartmentStatus @default(AVAILABLE)
  updatedAt DateTime        @updatedAt
  deletedAt DateTime?
  createdBy Int?
  updatedBy Int?
  deletedBy Int?

  creator   User?   @relation("ApartmentCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater   User?   @relation("ApartmentUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  deleter   User?   @relation("ApartmentDeletedBy", fields: [deletedBy], references: [id], onDelete: SetNull)

  bookings Booking[]
  tickets  MaintenanceTicket[]
}

model Tenant {
  id        Int        @id @default(autoincrement())
  fullName  String
  phone     String
  idNumber  String     @unique
  kycStatus KycStatus  @default(PENDING)
  tier      TenantTier @default(NEW)
  notes     String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  deletedAt DateTime?
  createdBy Int?
  updatedBy Int?
  deletedBy Int?

  creator  User?   @relation("TenantCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater  User?   @relation("TenantUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  deleter  User?   @relation("TenantDeletedBy", fields: [deletedBy], references: [id], onDelete: SetNull)

  bookings Booking[]
}

model Booking {
  id          Int       @id @default(autoincrement())
  apartmentId Int
  tenantId    Int
  checkIn     DateTime
  checkOut    DateTime
  totalAmount Decimal   @db.Decimal(10, 2)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  createdBy   Int?
  updatedBy   Int?

  apartment Apartment @relation(fields: [apartmentId], references: [id], onDelete: Restrict)
  tenant    Tenant    @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  creator   User?     @relation("BookingCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater   User?     @relation("BookingUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  payments  Payment[]

  @@index([apartmentId])
  @@index([tenantId])
  @@index([checkOut])
}

model Payment {
  id              Int           @id @default(autoincrement())
  bookingId       Int
  method          PaymentMethod
  amount          Decimal       @db.Decimal(10, 2)
  status          PaymentStatus @default(PENDING)
  referenceNumber String?
  paidAt          DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  createdBy       Int?
  updatedBy       Int?

  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  creator User?   @relation("PaymentCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater User?   @relation("PaymentUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)

  @@index([bookingId, status])
  @@index([createdAt])
}

model MaintenanceTicket {
  id           Int          @id @default(autoincrement())
  apartmentId  Int
  description  String
  priority     Priority
  status       TicketStatus @default(OPEN)
  assignedToId Int?
  notes        String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  resolvedAt   DateTime?
  createdBy    Int?
  updatedBy    Int?

  // Must use explicit relation names — there are now 3 User relations on this model
  apartment  Apartment @relation(fields: [apartmentId], references: [id], onDelete: Restrict)
  assignedTo User?     @relation("TicketAssignedTo", fields: [assignedToId], references: [id], onDelete: SetNull)
  creator    User?     @relation("TicketCreatedBy",  fields: [createdBy], references: [id], onDelete: SetNull)
  updater    User?     @relation("TicketUpdatedBy",  fields: [updatedBy], references: [id], onDelete: SetNull)

  @@index([status, priority])
  @@index([assignedToId])
}

model AuditLog {
  id        Int            @id @default(autoincrement())
  entity    AuditLogEntity
  entityId  Int
  action    String
  userId    Int
  metadata  Json?
  user      User           @relation(fields: [userId], references: [id])
  createdAt DateTime       @default(now())

  @@index([entity, entityId])
  @@index([createdAt])
}

enum Role {
  ADMIN
  RECEPTIONIST
  MAINTENANCE
  FINANCE
}

enum ApartmentStatus {
  AVAILABLE
  OCCUPIED
  MAINTENANCE
  RESERVED
  CLEANING
  PENDING_CHECKOUT
}

enum PaymentMethod {
  CASH
  CARD
  INSTALLMENT
}

enum PaymentStatus {
  PAID
  PENDING
  FAILED
}

enum Priority {
  LOW
  MEDIUM
  HIGH
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  COMPLETED
  CLOSED
}

enum AuditLogEntity {
  PAYMENT
  TICKET
  BOOKING
  APARTMENT
  TENANT
  USER
}

enum ApartmentType {
  STUDIO
  ONE_BEDROOM
  TWO_BEDROOM
  PENTHOUSE
}

enum KycStatus {
  VERIFIED
  PENDING
  ACTION_REQUIRED
}

enum TenantTier {
  NEW
  SILVER
  GOLD
  PLATINUM
}
```

- [ ] **Step 2: Run the migration**

```bash
cd server
npx prisma migrate dev --name add-audit-soft-delete
```

Expected: Prisma applies migration, generates updated client. If it prompts "Are you sure you want to create and apply this migration?" answer yes.

- [ ] **Step 3: Verify generated client**

```bash
npx prisma generate
```

Expected: no errors. The generated client should now include `deletedAt`, `createdBy`, `updatedBy`, `deletedBy` on the relevant models.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add audit columns and soft-delete fields to schema"
```

---

### Task 2: AsyncLocalStorage Request Context

**Files:**
- Create: `server/src/lib/requestContext.ts`

- [ ] **Step 1: Create the file**

```typescript
// server/src/lib/requestContext.ts
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<{ userId: number | null }>();

export function getContextUserId(): number | null {
  return requestContext.getStore()?.userId ?? null;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/lib/requestContext.ts
git commit -m "feat: add AsyncLocalStorage request context for per-request user ID"
```

---

### Task 3: Prisma Client Extensions (Audit Auto-Inject + Soft Delete)

**Files:**
- Modify: `server/src/lib/prisma.ts`

Key design decisions:
- Use Prisma 5 `$extends` with `query` extension — `$use()` was removed in Prisma 5.
- `$allModels` interceptors handle audit field injection for all models.
- Per-model interceptors (`user`, `tenant`, `apartment`) handle soft-delete logic.
- The `delete`/`deleteMany` interceptors call `prismaBase` directly (the unextended client) to perform an update, avoiding recursion with the audit `update` interceptor.
- `findUnique` post-filters: fetch the record normally then return `null` if `deletedAt` is set (Prisma doesn't allow adding arbitrary `where` fields to `findUnique`).

- [ ] **Step 1: Replace `server/src/lib/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client';
import { getContextUserId } from './requestContext';

const prismaBase = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

function buildExtendedClient(base: typeof prismaBase) {
  return base.$extends({
    name: 'audit-soft-delete',
    query: {
      $allModels: {
        async create({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const userId = getContextUserId();
          if (args.data && typeof args.data === 'object' && !Array.isArray(args.data)) {
            args.data.createdBy = userId;
            args.data.updatedBy = userId;
          }
          return query(args);
        },
        async update({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const userId = getContextUserId();
          if (args.data && typeof args.data === 'object') {
            args.data.updatedBy = userId;
          }
          return query(args);
        },
        async createMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const userId = getContextUserId();
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: Record<string, unknown>) => ({
              ...d, createdBy: userId, updatedBy: userId,
            }));
          }
          return query(args);
        },
      },

      user: {
        async delete({ args }: { args: any }) {
          return base.user.update({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async deleteMany({ args }: { args: any }) {
          return base.user.updateMany({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const result = await query(args);
          if (result?.deletedAt != null) return null;
          return result;
        },
      },

      tenant: {
        async delete({ args }: { args: any }) {
          return base.tenant.update({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async deleteMany({ args }: { args: any }) {
          return base.tenant.updateMany({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const result = await query(args);
          if (result?.deletedAt != null) return null;
          return result;
        },
      },

      apartment: {
        async delete({ args }: { args: any }) {
          return base.apartment.update({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async deleteMany({ args }: { args: any }) {
          return base.apartment.updateMany({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const result = await query(args);
          if (result?.deletedAt != null) return null;
          return result;
        },
      },
    },
  });
}

type ExtendedPrisma = ReturnType<typeof buildExtendedClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrisma };

export const prisma: ExtendedPrisma =
  globalForPrisma.prisma ?? buildExtendedClient(prismaBase);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/prisma.ts
git commit -m "feat: add Prisma 5 Client Extensions for audit auto-inject and soft delete"
```

---

### Task 4: Auth Middleware — Wrap next() in requestContext.run()

**Files:**
- Modify: `server/src/middleware/auth.middleware.ts`

- [ ] **Step 1: Update auth middleware**

Replace the entire file:

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { Role } from '@hotel/shared';
import { requestContext } from '../lib/requestContext';

export interface AuthRequest extends Request {
  user?: { id: number; role: Role };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id as number, role: payload.role as Role };
    requestContext.run({ userId: payload.id as number }, () => next());
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/auth.middleware.ts
git commit -m "feat: run auth next() inside requestContext for async user ID propagation"
```

---

### Task 5: Integration Tests

**Files:**
- Create: `server/src/controllers/audit-soft-delete.controller.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// server/src/controllers/audit-soft-delete.controller.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';

// Use the real test DB directly (bypasses soft-delete extension for setup/teardown)
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

const ADMIN_ID = 999001;
const ADMIN_COOKIE = `token=${signToken({ id: ADMIN_ID, role: 'ADMIN' })}`;

describe('Audit columns + soft delete', () => {
  beforeAll(async () => {
    await db.maintenanceTicket.deleteMany({ where: { apartment: { number: 'AUDIT-101' } } });
    await db.payment.deleteMany({ where: { booking: { apartment: { number: 'AUDIT-101' } } } });
    await db.booking.deleteMany({ where: { apartment: { number: 'AUDIT-101' } } });
    await db.apartment.deleteMany({ where: { number: 'AUDIT-101' } });
    await db.tenant.deleteMany({ where: { idNumber: 'AUDIT-ID-001' } });
    await db.user.deleteMany({ where: { id: ADMIN_ID } });
    await db.user.create({
      data: { id: ADMIN_ID, name: 'Audit Admin', email: 'audit-admin@test.com', password: 'x', role: 'ADMIN' },
    });
  });

  afterAll(async () => {
    await db.maintenanceTicket.deleteMany({ where: { apartment: { number: 'AUDIT-101' } } });
    await db.payment.deleteMany({ where: { booking: { apartment: { number: 'AUDIT-101' } } } });
    await db.booking.deleteMany({ where: { apartment: { number: 'AUDIT-101' } } });
    await db.apartment.deleteMany({ where: { number: 'AUDIT-101' } });
    await db.tenant.deleteMany({ where: { idNumber: 'AUDIT-ID-001' } });
    await db.user.deleteMany({ where: { id: ADMIN_ID } });
    await db.$disconnect();
  });

  describe('Audit columns — createdBy / updatedBy', () => {
    it('POST /apartments sets createdBy and updatedBy to the authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/apartments')
        .set('Cookie', ADMIN_COOKIE)
        .send({ number: 'AUDIT-101', floor: 9, type: 'STUDIO', status: 'AVAILABLE' });

      expect(res.status).toBe(201);
      const row = await db.apartment.findUnique({ where: { number: 'AUDIT-101' } });
      expect(row).not.toBeNull();
      expect(row!.createdBy).toBe(ADMIN_ID);
      expect(row!.updatedBy).toBe(ADMIN_ID);
    });

    it('PATCH /apartments/:id sets updatedBy and leaves createdBy unchanged', async () => {
      const apt = await db.apartment.findUnique({ where: { number: 'AUDIT-101' } });
      expect(apt).not.toBeNull();

      const res = await request(app)
        .patch(`/api/v1/apartments/${apt!.id}`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ status: 'MAINTENANCE' });

      expect(res.status).toBe(200);
      const updated = await db.apartment.findUnique({ where: { id: apt!.id } });
      expect(updated!.createdBy).toBe(ADMIN_ID);
      expect(updated!.updatedBy).toBe(ADMIN_ID);
    });
  });

  describe('Soft delete — Tenant', () => {
    let tenantId: number;

    beforeAll(async () => {
      await db.tenant.deleteMany({ where: { idNumber: 'AUDIT-ID-001' } });
      const t = await db.tenant.create({
        data: { fullName: 'Audit Tenant', phone: '0501112222', idNumber: 'AUDIT-ID-001' },
      });
      tenantId = t.id;
    });

    it('DELETE /tenants/:id sets deletedAt and deletedBy (does not hard-delete)', async () => {
      const res = await request(app)
        .delete(`/api/v1/tenants/${tenantId}`)
        .set('Cookie', ADMIN_COOKIE);

      expect(res.status).toBe(204);
      // Use raw db client (bypasses soft-delete filter) to verify the record still exists
      const raw = await db.tenant.findUnique({ where: { id: tenantId } });
      expect(raw).not.toBeNull();
      expect(raw!.deletedAt).not.toBeNull();
      expect(raw!.deletedBy).toBe(ADMIN_ID);
    });

    it('GET /tenants does not include soft-deleted tenant', async () => {
      const res = await request(app)
        .get('/api/v1/tenants')
        .set('Cookie', ADMIN_COOKIE);

      expect(res.status).toBe(200);
      const ids = (res.body.data ?? res.body).map((t: { id: number }) => t.id);
      expect(ids).not.toContain(tenantId);
    });

    it('DELETE /tenants/:id a second time is idempotent (200 or 204)', async () => {
      const res = await request(app)
        .delete(`/api/v1/tenants/${tenantId}`)
        .set('Cookie', ADMIN_COOKIE);

      expect([200, 204]).toContain(res.status);
    });
  });

  describe('Soft delete — Apartment', () => {
    it('Soft-deleted apartment does not appear in GET /apartments', async () => {
      const apt = await db.apartment.findUnique({ where: { number: 'AUDIT-101' } });
      expect(apt).not.toBeNull();

      await request(app)
        .delete(`/api/v1/apartments/${apt!.id}`)
        .set('Cookie', ADMIN_COOKIE);

      const res = await request(app)
        .get('/api/v1/apartments')
        .set('Cookie', ADMIN_COOKIE);

      const ids = (res.body.data ?? res.body).map((a: { id: number }) => a.id);
      expect(ids).not.toContain(apt!.id);

      // Verify DB still has the record with deletedAt set
      const raw = await db.apartment.findUnique({ where: { id: apt!.id } });
      expect(raw!.deletedAt).not.toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd server
npm test -- audit-soft-delete
```

Expected: all tests pass. If `POST /apartments` or `DELETE /tenants` routes don't exist yet, the test will fail with 404 — that means the API doesn't have those routes and they need to be checked. The audit columns and soft-delete logic should work transparently once the extension is in place.

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/audit-soft-delete.controller.test.ts
git commit -m "test: integration tests for audit columns and soft delete"
```

---

### Task 6: API — Add deletedAt to Ticket and Payment Selects

**Files:**
- Modify: `server/src/controllers/tickets.controller.ts` (line 10–13)
- Modify: `server/src/controllers/payments.controller.ts` (line 10–17)

The client needs `deletedAt` from the joined apartment/tenant to render the "Deleted" badge. Currently neither select includes it.

- [ ] **Step 1: Update `ticketInclude` in tickets.controller.ts**

Find this block (lines 10–13):
```typescript
const ticketInclude = {
  apartment: { select: { id: true, number: true, floor: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;
```

Replace with:
```typescript
const ticketInclude = {
  apartment: { select: { id: true, number: true, floor: true, deletedAt: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;
```

- [ ] **Step 2: Update `bookingInclude` in payments.controller.ts**

Find this block (lines 10–17):
```typescript
const bookingInclude = {
  booking: {
    include: {
      tenant: { select: { id: true, fullName: true, phone: true } },
      apartment: { select: { id: true, number: true, floor: true } },
    },
  },
} as const;
```

Replace with:
```typescript
const bookingInclude = {
  booking: {
    include: {
      tenant: { select: { id: true, fullName: true, phone: true, deletedAt: true } },
      apartment: { select: { id: true, number: true, floor: true, deletedAt: true } },
    },
  },
} as const;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/tickets.controller.ts server/src/controllers/payments.controller.ts
git commit -m "feat: include deletedAt in ticket apartment and payment tenant/apartment selects"
```

---

### Task 7: Client — "Deleted" Badge

**Files:**
- Modify: `client/src/hooks/useTickets.ts`
- Modify: `client/src/hooks/usePayments.ts`
- Modify: `client/src/pages/tickets/TicketsPage.tsx`
- Modify: `client/src/pages/tickets/TicketDetailPanel.tsx`
- Modify: `client/src/pages/payments/PaymentsPage.tsx`

The badge is a small red pill rendered inline after the entity name/number. It appears only when `deletedAt` is non-null.

**Badge snippet (use this inline everywhere, no new component file):**
```tsx
{record.deletedAt && (
  <span className="ml-1 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
    Deleted
  </span>
)}
```

- [ ] **Step 1: Update `TicketItem` type in `useTickets.ts`**

Find:
```typescript
  apartment: { id: number; number: string; floor: number };
```
Replace with:
```typescript
  apartment: { id: number; number: string; floor: number; deletedAt: string | null };
```

- [ ] **Step 2: Update `PaymentListItem` type in `usePayments.ts`**

Find:
```typescript
    tenant: { id: number; fullName: string; phone: string };
    apartment: { id: number; number: string; floor: number };
```
Replace with:
```typescript
    tenant: { id: number; fullName: string; phone: string; deletedAt: string | null };
    apartment: { id: number; number: string; floor: number; deletedAt: string | null };
```

- [ ] **Step 3: Add badge in `TicketsPage.tsx` — list view apartment number**

In `TicketsPage.tsx`, find all places where `ticket.apartment.number` is rendered in the list/table view (in the list-view `<tr>` cells, not the Kanban cards). Add the badge inline.

Find the list-view apartment cell. It will look like:
```tsx
<td ...>{t.apartment.number}</td>
```
or similar. Replace with:
```tsx
<td ...>
  <span className="flex items-center flex-wrap gap-0.5">
    {t.apartment.number}
    {t.apartment.deletedAt && (
      <span className="ml-1 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
        Deleted
      </span>
    )}
  </span>
</td>
```

- [ ] **Step 4: Add badge in `TicketDetailPanel.tsx` — apartment info line**

Find (line 103):
```tsx
<p className="text-xs text-on-surface-variant">Apt. {ticket.apartment.number} · Floor {ticket.apartment.floor}</p>
```
Replace with:
```tsx
<p className="text-xs text-on-surface-variant flex items-center flex-wrap gap-1">
  Apt. {ticket.apartment.number}
  {ticket.apartment.deletedAt && (
    <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
      Deleted
    </span>
  )}
  · Floor {ticket.apartment.floor}
</p>
```

- [ ] **Step 5: Add badges in `PaymentsPage.tsx` — apartment number and tenant name columns**

Find the apartment number cell (around line 212):
```tsx
<td className="px-4 py-3 text-sm font-bold text-on-surface">
  {p.booking.apartment.number}
</td>
```
Replace with:
```tsx
<td className="px-4 py-3 text-sm font-bold text-on-surface">
  <span className="flex items-center flex-wrap gap-0.5">
    {p.booking.apartment.number}
    {p.booking.apartment.deletedAt && (
      <span className="ml-1 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
        Deleted
      </span>
    )}
  </span>
</td>
```

Find the tenant name cell (around line 215):
```tsx
<td className="px-4 py-3 text-sm text-on-surface">
  {p.booking.tenant.fullName}
</td>
```
Replace with:
```tsx
<td className="px-4 py-3 text-sm text-on-surface">
  <span className="flex items-center flex-wrap gap-0.5">
    {p.booking.tenant.fullName}
    {p.booking.tenant.deletedAt && (
      <span className="ml-1 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
        Deleted
      </span>
    )}
  </span>
</td>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks/useTickets.ts client/src/hooks/usePayments.ts \
        client/src/pages/tickets/TicketsPage.tsx \
        client/src/pages/tickets/TicketDetailPanel.tsx \
        client/src/pages/payments/PaymentsPage.tsx
git commit -m "feat: show Deleted badge for soft-deleted tenants and apartments in tickets and payments views"
```

---

## Spec Self-Review

**Spec coverage:**
- ✅ `createdBy`/`updatedBy` on all 6 models → Task 1 (schema) + Task 3 (extension)
- ✅ `deletedAt`/`deletedBy` on User, Tenant, Apartment → Task 1 (schema) + Task 3 (extension)
- ✅ `AsyncLocalStorage` context → Task 2
- ✅ Auth middleware wraps next() → Task 4
- ✅ `delete` → soft-delete update → Task 3
- ✅ `findMany`/`findUnique`/`findFirst`/`count` filter soft-deleted → Task 3
- ✅ Integration tests → Task 5
- ✅ `deletedAt` in API selects → Task 6
- ✅ "Deleted" badge in PaymentsPage, TicketsPage, TicketDetailPanel → Task 7
- ✅ Idempotent double-delete → covered by `findUnique` post-filter (returns null, caller returns 204/404)

**Prisma 5 compatibility check:**
- ✅ Uses `$extends` not `$use()`
- ✅ `delete`/`deleteMany` call `base` (pre-extension) client to avoid recursion
- ✅ `findUnique` uses post-filter (can't add arbitrary where fields to findUnique in Prisma)

**Relation naming check:**
- ✅ `MaintenanceTicket.assignedTo` → renamed to `@relation("TicketAssignedTo")` to avoid ambiguity with the 2 new User relations on that model
- ✅ User self-referential relations use distinct names (`"UserCreatedBy"`, `"UserUpdatedBy"`, `"UserDeletedBy"`)
- ✅ All back-relations on User use fully-qualified names (`"ApartmentCreatedBy"`, `"TenantCreatedBy"`, etc.)
