# Plan A: Entity Amendments + API Updates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ApartmentType, KycStatus, TenantTier enums + new fields to DB; update controllers to expose them; update client hooks and form modals.

**Architecture:** Prisma migration adds 3 enums and 4 new fields with defaults (no data loss). Server controllers expose new fields in create/update/list. Client hooks and form modals are updated to match. Plan C (UI redesign) depends on this plan completing first.

**Tech Stack:** PostgreSQL + Prisma ORM, Express + TypeScript, React + react-hook-form + zod, @hotel/shared path-aliased enums, Vitest + Supertest

---

## Context for all tasks

- Monorepo root: `D:\Hotel Apartment Management System\`
- Server: `server/` — Express + Prisma. Test DB on port 5433 via `TEST_DATABASE_URL`.
- Client: `client/` — React 18 + Vite + Tailwind
- Shared: `shared/index.ts` — enums imported by both server and client via `@hotel/shared`
- Run server tests from `server/` directory: `npx vitest run --reporter=verbose`
- Run migrations from `server/` directory: `npx prisma migrate dev --name <name>`

---

## Task 1: Prisma Schema + Shared Enums + Migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `shared/index.ts`

- [ ] **Step 1: Add enums and fields to schema.prisma**

Replace the `Apartment` and `Tenant` models and add three new enums. Full updated schema sections:

```prisma
model Apartment {
  id       Int             @id @default(autoincrement())
  number   String          @unique
  floor    Int
  type     ApartmentType   @default(STUDIO)
  status   ApartmentStatus @default(AVAILABLE)
  bookings Booking[]
  tickets  MaintenanceTicket[]
}

model Tenant {
  id        Int         @id @default(autoincrement())
  fullName  String
  phone     String
  idNumber  String      @unique
  kycStatus KycStatus   @default(PENDING)
  tier      TenantTier  @default(NEW)
  notes     String?
  bookings  Booking[]
  createdAt DateTime    @default(now())
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

Add these three enums at the bottom of `schema.prisma` (after `AuditLogEntity`). Also update the `Apartment` and `Tenant` model blocks as shown above (other models stay unchanged).

- [ ] **Step 2: Run migration**

```bash
cd server
npx prisma migrate dev --name add_apartment_type_tenant_fields
```

Expected: Migration created and applied successfully. Prisma client regenerated automatically.

- [ ] **Step 3: Add enums to shared/index.ts**

Add after the existing `ApartmentStatus` enum:

```typescript
export enum ApartmentType {
  STUDIO = 'STUDIO',
  ONE_BEDROOM = 'ONE_BEDROOM',
  TWO_BEDROOM = 'TWO_BEDROOM',
  PENTHOUSE = 'PENTHOUSE',
}

export enum KycStatus {
  VERIFIED = 'VERIFIED',
  PENDING = 'PENDING',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
}

export enum TenantTier {
  NEW = 'NEW',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd server
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations shared/index.ts
git commit -m "feat: add ApartmentType, KycStatus, TenantTier enums and fields"
```

---

## Task 2: Update Apartments Controller + Tests

**Files:**
- Modify: `server/src/controllers/apartments.controller.ts`
- Modify: `server/tests/apartments.test.ts`

- [ ] **Step 1: Write failing tests for new apartment fields**

Add these tests inside the existing `describe('POST /api/v1/apartments')` and `describe('GET /api/v1/apartments')` blocks in `server/tests/apartments.test.ts`:

In `describe('POST /api/v1/apartments')`, add after the existing "creates an apartment" test:

```typescript
it('creates apartment with explicit type', async () => {
  const res = await request(app)
    .post('/api/v1/apartments')
    .set('Cookie', adminCookie)
    .send({ number: '102', floor: 1, type: 'ONE_BEDROOM' });
  expect(res.status).toBe(201);
  expect(res.body.type).toBe('ONE_BEDROOM');
});

it('defaults type to STUDIO when not provided', async () => {
  const res = await request(app)
    .post('/api/v1/apartments')
    .set('Cookie', adminCookie)
    .send({ number: '103', floor: 1 });
  expect(res.status).toBe(201);
  expect(res.body.type).toBe('STUDIO');
});

it('returns 400 for invalid type', async () => {
  const res = await request(app)
    .post('/api/v1/apartments')
    .set('Cookie', adminCookie)
    .send({ number: '999', floor: 1, type: 'INVALID_TYPE' });
  expect(res.status).toBe(400);
});
```

In `describe('GET /api/v1/apartments')`, add:

```typescript
it('list items include type and upcomingBooking fields', async () => {
  const res = await request(app)
    .get('/api/v1/apartments')
    .set('Cookie', adminCookie);
  expect(res.status).toBe(200);
  expect(res.body[0]).toHaveProperty('type');
  expect(res.body[0]).toHaveProperty('upcomingBooking');
});

it('filters by type', async () => {
  const res = await request(app)
    .get('/api/v1/apartments?type=ONE_BEDROOM')
    .set('Cookie', adminCookie);
  expect(res.status).toBe(200);
  res.body.forEach((a: { type: string }) => {
    expect(a.type).toBe('ONE_BEDROOM');
  });
});
```

Also update `describe('PUT /api/v1/apartments/:id')`, add:

```typescript
it('updates apartment type', async () => {
  const res = await request(app)
    .put(`/api/v1/apartments/${apt1Id}`)
    .set('Cookie', adminCookie)
    .send({ type: 'PENTHOUSE' });
  expect(res.status).toBe(200);
  expect(res.body.type).toBe('PENTHOUSE');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server
npx vitest run tests/apartments.test.ts --reporter=verbose
```

Expected: New tests fail with "type is not a known field" or similar, existing tests pass.

- [ ] **Step 3: Update apartments controller**

Replace `server/src/controllers/apartments.controller.ts` entirely:

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApartmentStatus, ApartmentType } from '@hotel/shared';
import { Prisma } from '@prisma/client';

const VALID_STATUSES = Object.values(ApartmentStatus);
const VALID_TYPES = Object.values(ApartmentType);

export async function list(req: AuthRequest, res: Response): Promise<void> {
  const { status, type, search } = req.query as { status?: string; type?: string; search?: string };

  if (status && !VALID_STATUSES.includes(status as ApartmentStatus)) {
    res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }
  if (type && !VALID_TYPES.includes(type as ApartmentType)) {
    res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }

  const where: Prisma.ApartmentWhereInput = {};
  if (status) where.status = status as ApartmentStatus;
  if (type) where.type = type as ApartmentType;
  if (search) where.number = { contains: search, mode: 'insensitive' };

  const now = new Date();

  const apartments = await prisma.apartment.findMany({
    where,
    orderBy: { number: 'asc' },
    include: {
      bookings: {
        where: { checkOut: { gte: now } },
        orderBy: { checkIn: 'asc' },
        take: 2,
        include: {
          tenant: { select: { id: true, fullName: true, phone: true } },
          payments: { select: { method: true, amount: true, status: true, paidAt: true } },
        },
      },
      tickets: {
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        take: 1,
        select: { id: true, status: true, priority: true },
      },
    },
  });

  const result = apartments.map((a) => {
    const currentBooking = a.bookings.find(
      (b) => new Date(b.checkIn) <= now && new Date(b.checkOut) >= now
    ) ?? null;
    const upcomingBooking = a.bookings.find((b) => new Date(b.checkIn) > now) ?? null;

    return {
      id: a.id,
      number: a.number,
      floor: a.floor,
      type: a.type,
      status: a.status,
      currentBooking,
      upcomingBooking,
      activeTicket: a.tickets[0] ?? null,
    };
  });

  res.json(result);
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { number, floor, type } = req.body as { number: string; floor: number; type?: string };

  if (!number || floor === undefined) {
    res.status(400).json({ message: 'number and floor are required' });
    return;
  }
  if (type !== undefined && !VALID_TYPES.includes(type as ApartmentType)) {
    res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }

  try {
    const apartment = await prisma.apartment.create({
      data: {
        number: String(number).trim(),
        floor: Number(floor),
        ...(type ? { type: type as ApartmentType } : {}),
      },
    });
    res.status(201).json(apartment);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'Apartment number already exists' });
      return;
    }
    throw err;
  }
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const apartment = await prisma.apartment.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { checkIn: 'desc' },
        include: {
          tenant: { select: { id: true, fullName: true, phone: true } },
          payments: { select: { id: true, method: true, amount: true, status: true, paidAt: true, createdAt: true } },
        },
      },
      tickets: {
        orderBy: { createdAt: 'desc' },
        include: { assignedTo: { select: { id: true, name: true } } },
      },
    },
  });

  if (!apartment) {
    res.status(404).json({ message: 'Apartment not found' });
    return;
  }

  const now = new Date();
  const currentBooking = apartment.bookings.find(
    (b) => new Date(b.checkIn) <= now && new Date(b.checkOut) >= now
  ) ?? null;

  res.json({ ...apartment, currentBooking });
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const { number, floor, status, type } = req.body as {
    number?: string;
    floor?: number;
    status?: ApartmentStatus;
    type?: ApartmentType;
  };

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }

  const data: Prisma.ApartmentUpdateInput = {};
  if (number !== undefined) data.number = String(number).trim();
  if (floor !== undefined) data.floor = Number(floor);
  if (status !== undefined) data.status = status;
  if (type !== undefined) data.type = type;

  try {
    const apartment = await prisma.apartment.update({ where: { id }, data });
    res.json(apartment);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        res.status(404).json({ message: 'Apartment not found' });
        return;
      }
      if (err.code === 'P2002') {
        res.status(409).json({ message: 'Apartment number already exists' });
        return;
      }
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server
npx vitest run tests/apartments.test.ts --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/apartments.controller.ts server/tests/apartments.test.ts
git commit -m "feat: apartments controller supports type field, type filter, and upcomingBooking"
```

---

## Task 3: Update Tenants Controller + Tests

**Files:**
- Modify: `server/src/controllers/tenants.controller.ts`
- Modify: `server/tests/tenants.test.ts`

- [ ] **Step 1: Write failing tests for new tenant fields**

In `server/tests/tenants.test.ts`, inside `describe('POST /api/v1/tenants')`, add after the first "creates a tenant" test:

```typescript
it('creates tenant with explicit kycStatus and tier', async () => {
  const res = await request(app)
    .post('/api/v1/tenants')
    .set('Cookie', adminCookie)
    .send({ fullName: 'KYC Test', phone: '+971501112222', idNumber: 'KYC-001', kycStatus: 'VERIFIED', tier: 'GOLD' });
  expect(res.status).toBe(201);
  expect(res.body.kycStatus).toBe('VERIFIED');
  expect(res.body.tier).toBe('GOLD');
});

it('defaults kycStatus to PENDING and tier to NEW', async () => {
  const res = await request(app)
    .post('/api/v1/tenants')
    .set('Cookie', adminCookie)
    .send({ fullName: 'Default Test', phone: '+971509998888', idNumber: 'DEF-001' });
  expect(res.status).toBe(201);
  expect(res.body.kycStatus).toBe('PENDING');
  expect(res.body.tier).toBe('NEW');
});
```

In `describe('GET /api/v1/tenants')`, add:

```typescript
it('list items include kycStatus, tier, and currentBooking fields', async () => {
  const res = await request(app)
    .get('/api/v1/tenants')
    .set('Cookie', adminCookie);
  expect(res.status).toBe(200);
  expect(res.body[0]).toHaveProperty('kycStatus');
  expect(res.body[0]).toHaveProperty('tier');
  expect(res.body[0]).toHaveProperty('currentBooking');
});
```

In `describe('PUT /api/v1/tenants/:id')`, add:

```typescript
it('updates kycStatus', async () => {
  const res = await request(app)
    .put(`/api/v1/tenants/${tenant1Id}`)
    .set('Cookie', adminCookie)
    .send({ kycStatus: 'VERIFIED' });
  expect(res.status).toBe(200);
  expect(res.body.kycStatus).toBe('VERIFIED');
});

it('updates notes', async () => {
  const res = await request(app)
    .put(`/api/v1/tenants/${tenant1Id}`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Prefers email contact.' });
  expect(res.status).toBe(200);
  expect(res.body.notes).toBe('Prefers email contact.');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server
npx vitest run tests/tenants.test.ts --reporter=verbose
```

Expected: New tests fail, existing tests pass.

- [ ] **Step 3: Update tenants controller**

Replace `server/src/controllers/tenants.controller.ts` entirely:

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { KycStatus, TenantTier } from '@hotel/shared';
import { Prisma } from '@prisma/client';

const VALID_KYC = Object.values(KycStatus);
const VALID_TIERS = Object.values(TenantTier);

export async function list(req: AuthRequest, res: Response): Promise<void> {
  const { search } = req.query as { search?: string };

  const where: Prisma.TenantWhereInput = search
    ? {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { idNumber: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const now = new Date();

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { fullName: 'asc' },
    include: {
      bookings: {
        where: { checkIn: { lte: now }, checkOut: { gte: now } },
        take: 1,
        orderBy: { checkIn: 'desc' },
        include: {
          apartment: { select: { id: true, number: true, type: true } },
        },
      },
    },
  });

  const result = tenants.map(({ bookings, ...t }) => ({
    ...t,
    currentBooking: bookings[0]
      ? {
          id: bookings[0].id,
          checkIn: bookings[0].checkIn,
          checkOut: bookings[0].checkOut,
          apartment: bookings[0].apartment,
        }
      : null,
  }));

  res.json(result);
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { fullName, phone, idNumber, kycStatus, tier, notes } = req.body as {
    fullName?: string;
    phone?: string;
    idNumber?: string;
    kycStatus?: string;
    tier?: string;
    notes?: string;
  };

  if (!fullName?.trim() || !phone?.trim() || !idNumber?.trim()) {
    res.status(400).json({ message: 'fullName, phone, and idNumber are required' });
    return;
  }
  if (kycStatus !== undefined && !VALID_KYC.includes(kycStatus as KycStatus)) {
    res.status(400).json({ message: `Invalid kycStatus. Must be one of: ${VALID_KYC.join(', ')}` });
    return;
  }
  if (tier !== undefined && !VALID_TIERS.includes(tier as TenantTier)) {
    res.status(400).json({ message: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` });
    return;
  }

  try {
    const tenant = await prisma.tenant.create({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        idNumber: idNumber.trim(),
        ...(kycStatus ? { kycStatus: kycStatus as KycStatus } : {}),
        ...(tier ? { tier: tier as TenantTier } : {}),
        ...(notes !== undefined ? { notes: notes.trim() || null } : {}),
      },
    });
    res.status(201).json(tenant);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'ID number already registered' });
      return;
    }
    throw err;
  }
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { checkIn: 'desc' },
        include: {
          apartment: { select: { id: true, number: true, floor: true, type: true } },
          payments: {
            select: { id: true, method: true, amount: true, status: true, paidAt: true },
          },
        },
      },
    },
  });

  if (!tenant) {
    res.status(404).json({ message: 'Tenant not found' });
    return;
  }

  res.json(tenant);
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const { fullName, phone, idNumber, kycStatus, tier, notes } = req.body as {
    fullName?: string;
    phone?: string;
    idNumber?: string;
    kycStatus?: string;
    tier?: string;
    notes?: string;
  };

  if (kycStatus !== undefined && !VALID_KYC.includes(kycStatus as KycStatus)) {
    res.status(400).json({ message: `Invalid kycStatus. Must be one of: ${VALID_KYC.join(', ')}` });
    return;
  }
  if (tier !== undefined && !VALID_TIERS.includes(tier as TenantTier)) {
    res.status(400).json({ message: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` });
    return;
  }

  const data: Prisma.TenantUpdateInput = {};
  if (fullName !== undefined) data.fullName = fullName.trim();
  if (phone !== undefined) data.phone = phone.trim();
  if (idNumber !== undefined) data.idNumber = idNumber.trim();
  if (kycStatus !== undefined) data.kycStatus = kycStatus as KycStatus;
  if (tier !== undefined) data.tier = tier as TenantTier;
  if (notes !== undefined) data.notes = notes.trim() || null;

  try {
    const tenant = await prisma.tenant.update({ where: { id }, data });
    res.json(tenant);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        res.status(404).json({ message: 'Tenant not found' });
        return;
      }
      if (err.code === 'P2002') {
        res.status(409).json({ message: 'ID number already registered' });
        return;
      }
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server
npx vitest run tests/tenants.test.ts --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd server
npx vitest run --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/tenants.controller.ts server/tests/tenants.test.ts
git commit -m "feat: tenants controller supports kycStatus, tier, notes, and currentBooking in list"
```

---

## Task 4: Update Client Hooks + Form Modals + i18n

**Files:**
- Modify: `client/src/hooks/useApartments.ts`
- Modify: `client/src/hooks/useTenants.ts`
- Modify: `client/src/pages/apartments/ApartmentFormModal.tsx`
- Modify: `client/src/pages/tenants/TenantFormModal.tsx`
- Modify: `client/src/i18n/locales/en/translation.json`
- Modify: `client/src/i18n/locales/ar/translation.json`

- [ ] **Step 1: Update useApartments.ts**

Replace `client/src/hooks/useApartments.ts` entirely:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { ApartmentStatus, ApartmentType } from '@hotel/shared';

export interface ApartmentListItem {
  id: number;
  number: string;
  floor: number;
  type: ApartmentType;
  status: ApartmentStatus;
  currentBooking: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
    tenant: { id: number; fullName: string; phone: string };
    payments: { method: string; amount: string; status: string; paidAt: string | null }[];
  } | null;
  upcomingBooking: {
    id: number;
    checkIn: string;
    checkOut: string;
    tenant: { id: number; fullName: string; phone: string };
  } | null;
  activeTicket: { id: number; status: string; priority: string } | null;
}

export interface ApartmentDetail extends Omit<ApartmentListItem, 'upcomingBooking' | 'activeTicket'> {
  bookings: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
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
}

export interface UpdateApartmentDto {
  number?: string;
  floor?: number;
  type?: ApartmentType;
  status?: ApartmentStatus;
}

export function useApartments(filters?: { status?: ApartmentStatus; type?: ApartmentType; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.search) params.set('search', filters.search);

  return useQuery<ApartmentListItem[]>({
    queryKey: ['apartments', filters],
    queryFn: async () => {
      const res = await api.get(`/apartments?${params.toString()}`);
      return res.data;
    },
  });
}

export function useApartment(id: number) {
  return useQuery<ApartmentDetail>({
    queryKey: ['apartments', id],
    queryFn: async () => {
      const res = await api.get(`/apartments/${id}`);
      return res.data;
    },
    enabled: !!id,
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
```

- [ ] **Step 2: Update useTenants.ts**

Replace `client/src/hooks/useTenants.ts` entirely:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { KycStatus, TenantTier, ApartmentType } from '@hotel/shared';

export interface TenantListItem {
  id: number;
  fullName: string;
  phone: string;
  idNumber: string;
  kycStatus: KycStatus;
  tier: TenantTier;
  notes: string | null;
  createdAt: string;
  currentBooking: {
    id: number;
    checkIn: string;
    checkOut: string;
    apartment: { id: number; number: string; type: ApartmentType };
  } | null;
}

export interface TenantDetail extends Omit<TenantListItem, 'currentBooking'> {
  bookings: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
    apartment: { id: number; number: string; floor: number; type: ApartmentType };
    payments: { id: number; method: string; amount: string; status: string; paidAt: string | null }[];
  }[];
}

export interface CreateTenantDto {
  fullName: string;
  phone: string;
  idNumber: string;
  kycStatus?: KycStatus;
  tier?: TenantTier;
  notes?: string;
}

export interface UpdateTenantDto {
  fullName?: string;
  phone?: string;
  idNumber?: string;
  kycStatus?: KycStatus;
  tier?: TenantTier;
  notes?: string;
}

export function useTenants(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return useQuery<TenantListItem[]>({
    queryKey: ['tenants', search],
    queryFn: async () => {
      const res = await api.get(`/tenants${params}`);
      return res.data;
    },
  });
}

export function useTenant(id: number) {
  return useQuery<TenantDetail>({
    queryKey: ['tenants', id],
    queryFn: async () => {
      const res = await api.get(`/tenants/${id}`);
      return res.data;
    },
    enabled: id > 0,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTenantDto) => api.post('/tenants', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenants'] }),
  });
}

export function useUpdateTenant(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTenantDto) => api.put(`/tenants/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants', id] });
    },
  });
}
```

- [ ] **Step 3: Update ApartmentFormModal.tsx**

Replace `client/src/pages/apartments/ApartmentFormModal.tsx` entirely:

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ApartmentStatus, ApartmentType } from '@hotel/shared';
import {
  useCreateApartment,
  useUpdateApartment,
  ApartmentListItem,
} from '../../hooks/useApartments';

const schema = z.object({
  number: z.string().min(1, 'Required'),
  floor: z.coerce.number().int().min(0),
  type: z.nativeEnum(ApartmentType).optional(),
  status: z.nativeEnum(ApartmentStatus).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  apartment?: ApartmentListItem | null;
  onClose: () => void;
}

export default function ApartmentFormModal({ apartment, onClose }: Props) {
  const { t } = useTranslation();
  const isEdit = !!apartment;
  const create = useCreateApartment();
  const update = useUpdateApartment(apartment?.id ?? -1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { number: '', floor: 0, type: ApartmentType.STUDIO },
  });

  useEffect(() => {
    if (apartment) {
      reset({
        number: apartment.number,
        floor: apartment.floor,
        type: apartment.type,
        status: apartment.status,
      });
    }
  }, [apartment, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEdit) {
        await update.mutateAsync(data);
      } else {
        await create.mutateAsync({ number: data.number, floor: data.floor, type: data.type });
      }
      toast.success(isEdit ? t('common.savedSuccessfully', 'Saved successfully') : t('common.createdSuccessfully', 'Created successfully'));
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Something went wrong');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">
            {isEdit ? t('apartments.editApartment') : t('apartments.addApartment')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>{t('apartments.number')}</label>
            <input {...register('number')} className={inputCls} />
            {errors.number && <p className="text-error text-xs mt-1">{errors.number.message}</p>}
          </div>

          <div>
            <label className={labelCls}>{t('apartments.floor')}</label>
            <input {...register('floor')} type="number" min={0} className={inputCls} />
            {errors.floor && <p className="text-error text-xs mt-1">{errors.floor.message}</p>}
          </div>

          <div>
            <label className={labelCls}>{t('apartments.type')}</label>
            <select {...register('type')} className={inputCls}>
              {Object.values(ApartmentType).map((tp) => (
                <option key={tp} value={tp}>{t(`apartmentType.${tp}`)}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls}>{t('apartments.status')}</label>
              <select {...register('status')} className={inputCls}>
                {Object.values(ApartmentStatus).map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update TenantFormModal.tsx**

Replace `client/src/pages/tenants/TenantFormModal.tsx` entirely:

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { KycStatus, TenantTier } from '@hotel/shared';
import { useCreateTenant, useUpdateTenant, TenantListItem } from '../../hooks/useTenants';

const schema = z.object({
  fullName: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  idNumber: z.string().min(3, 'Required'),
  kycStatus: z.nativeEnum(KycStatus).optional(),
  tier: z.nativeEnum(TenantTier).optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  tenant?: TenantListItem | null;
  onClose: () => void;
}

export default function TenantFormModal({ tenant, onClose }: Props) {
  const { t } = useTranslation();
  const isEdit = !!tenant;
  const create = useCreateTenant();
  const update = useUpdateTenant(tenant?.id ?? -1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      phone: '',
      idNumber: '',
      kycStatus: KycStatus.PENDING,
      tier: TenantTier.NEW,
      notes: '',
    },
  });

  useEffect(() => {
    if (tenant) {
      reset({
        fullName: tenant.fullName,
        phone: tenant.phone,
        idNumber: tenant.idNumber,
        kycStatus: tenant.kycStatus,
        tier: tenant.tier,
        notes: tenant.notes ?? '',
      });
    }
  }, [tenant, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEdit) {
        await update.mutateAsync(data);
      } else {
        await create.mutateAsync(data);
      }
      toast.success(isEdit ? t('common.savedSuccessfully', 'Saved successfully') : t('common.createdSuccessfully', 'Created successfully'));
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Something went wrong');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">
            {isEdit ? t('tenants.editTenant') : t('tenants.addTenant')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>{t('tenants.fullName')}</label>
            <input {...register('fullName')} className={inputCls} />
            {errors.fullName && <p className="text-error text-xs mt-1">{errors.fullName.message}</p>}
          </div>

          <div>
            <label className={labelCls}>{t('tenants.phone')}</label>
            <input {...register('phone')} type="tel" className={inputCls} />
            {errors.phone && <p className="text-error text-xs mt-1">{errors.phone.message}</p>}
          </div>

          <div>
            <label className={labelCls}>{t('tenants.idNumber')}</label>
            <input {...register('idNumber')} className={inputCls} />
            {errors.idNumber && <p className="text-error text-xs mt-1">{errors.idNumber.message}</p>}
          </div>

          <div>
            <label className={labelCls}>{t('tenants.kycStatus')}</label>
            <select {...register('kycStatus')} className={inputCls}>
              {Object.values(KycStatus).map((k) => (
                <option key={k} value={k}>{t(`kycStatus.${k}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('tenants.tier')}</label>
            <select {...register('tier')} className={inputCls}>
              {Object.values(TenantTier).map((tr) => (
                <option key={tr} value={tr}>{t(`tenantTier.${tr}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('tenants.notes')}</label>
            <textarea {...register('notes')} rows={3} className={inputCls + ' resize-none'} placeholder={t('tenants.notesPlaceholder', 'Optional operational notes...')} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update English translation file**

In `client/src/i18n/locales/en/translation.json`, add the following new keys:

Under `"apartments"`, add:
```json
"type": "Type",
"allTypes": "All Types",
"typeFilter": "Apartment Type"
```

Under `"tenants"`, add:
```json
"kycStatus": "KYC Status",
"tier": "Tier",
"notes": "Operational Notes",
"notesPlaceholder": "Optional operational notes...",
"activeApartment": "Active Apartment",
"rentalPeriod": "Rental Period",
"allKycStatuses": "All KYC Statuses"
```

Add these top-level keys:
```json
"apartmentType": {
  "STUDIO": "Studio",
  "ONE_BEDROOM": "1-Bedroom",
  "TWO_BEDROOM": "2-Bedroom",
  "PENTHOUSE": "Penthouse"
},
"kycStatus": {
  "VERIFIED": "Verified",
  "PENDING": "Pending",
  "ACTION_REQUIRED": "Action Req."
},
"tenantTier": {
  "NEW": "New Tenant",
  "SILVER": "Silver Tier Resident",
  "GOLD": "Gold Tier Resident",
  "PLATINUM": "Platinum Tier Resident"
}
```

- [ ] **Step 6: Update Arabic translation file**

In `client/src/i18n/locales/ar/translation.json`, add the same keys with Arabic translations:

Under `"apartments"`, add:
```json
"type": "النوع",
"allTypes": "جميع الأنواع",
"typeFilter": "نوع الشقة"
```

Under `"tenants"`, add:
```json
"kycStatus": "حالة KYC",
"tier": "الفئة",
"notes": "ملاحظات تشغيلية",
"notesPlaceholder": "ملاحظات تشغيلية اختيارية...",
"activeApartment": "الشقة الحالية",
"rentalPeriod": "فترة الإيجار",
"allKycStatuses": "جميع حالات KYC"
```

Add top-level keys:
```json
"apartmentType": {
  "STUDIO": "استوديو",
  "ONE_BEDROOM": "غرفة نوم واحدة",
  "TWO_BEDROOM": "غرفتا نوم",
  "PENTHOUSE": "بنتهاوس"
},
"kycStatus": {
  "VERIFIED": "موثق",
  "PENDING": "قيد الانتظار",
  "ACTION_REQUIRED": "يتطلب إجراء"
},
"tenantTier": {
  "NEW": "مستأجر جديد",
  "SILVER": "مستوى فضي",
  "GOLD": "مستوى ذهبي",
  "PLATINUM": "مستوى بلاتيني"
}
```

- [ ] **Step 7: Verify TypeScript compiles in client**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/hooks/useApartments.ts client/src/hooks/useTenants.ts
git add client/src/pages/apartments/ApartmentFormModal.tsx client/src/pages/tenants/TenantFormModal.tsx
git add client/src/i18n/locales/en/translation.json client/src/i18n/locales/ar/translation.json
git commit -m "feat: client hooks and form modals support new apartment/tenant fields"
```
