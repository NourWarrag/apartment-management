# Hotel Apartment Management System — Phase 2: Apartments & Tenants

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build full CRUD for Apartments and Tenants — server API with integration tests, React pages (list, detail, add/edit modal), React Query hooks, and the Daily Apartment Status view.

**Architecture:** Server: two new route+controller pairs mounted in app.ts, tested with Vitest+Supertest against the test DB. Client: React Query hooks per module, page components for list/detail/form, ApartmentStatusBadge shared component. The apartment list endpoint returns current booking info inline so the Daily Status view needs no extra request.

**Tech Stack:** Express + Prisma + Vitest + Supertest (server) · React + React Query v5 + React Hook Form + Zod + Tailwind + Lucide React (client)

---

## File Map

```
/server/src
  routes/
    apartments.routes.ts        ← GET/POST /apartments, GET/PUT /apartments/:id
    tenants.routes.ts           ← GET/POST /tenants, GET/PUT /tenants/:id
  controllers/
    apartments.controller.ts    ← list, create, getById, update
    tenants.controller.ts       ← list, create, getById, update
  app.ts                        ← mount 2 new route groups (modify)
  tests/
    apartments.test.ts
    tenants.test.ts

/client/src
  hooks/
    useApartments.ts            ← useApartments, useApartment, useCreateApartment, useUpdateApartment
    useTenants.ts               ← useTenants, useTenant, useCreateTenant, useUpdateTenant
  components/
    apartments/
      ApartmentStatusBadge.tsx  ← colored badge for ApartmentStatus enum values
  pages/
    apartments/
      ApartmentsPage.tsx        ← filterable list + Daily Status view
      ApartmentDetailPage.tsx   ← detail with booking, payments, tickets, status change
      ApartmentFormModal.tsx    ← add/edit modal (number, floor, status)
    tenants/
      TenantsPage.tsx           ← searchable list
      TenantDetailPage.tsx      ← detail with booking history and payment history
      TenantFormModal.tsx       ← add/edit modal (fullName, phone, idNumber)
  App.tsx                       ← replace apartment/tenant placeholders (modify)
  i18n/locales/en/translation.json  ← add apartments + tenants keys (modify)
  i18n/locales/ar/translation.json  ← add apartments + tenants keys (modify)
```

---

## Task 1: Apartments API (Server)

**Files:**
- Create: `server/src/controllers/apartments.controller.ts`
- Create: `server/src/routes/apartments.routes.ts`
- Modify: `server/src/app.ts`
- Create: `server/tests/apartments.test.ts`

### Step 1: Write failing apartments tests

Create `server/tests/apartments.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminCookie: string;
let apt1Id: number;

beforeAll(async () => {
  await prisma.apartment.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@test.com',
      password: await hashPassword('password123'),
      role: 'ADMIN',
    },
  });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.com', password: 'password123' });
  adminCookie = loginRes.headers['set-cookie'][0];
});

afterAll(async () => {
  await prisma.apartment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/v1/apartments', () => {
  it('creates an apartment', async () => {
    const res = await request(app)
      .post('/api/v1/apartments')
      .set('Cookie', adminCookie)
      .send({ number: '101', floor: 1 });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe('101');
    expect(res.body.status).toBe('AVAILABLE');
    apt1Id = res.body.id;
  });

  it('returns 409 on duplicate apartment number', async () => {
    const res = await request(app)
      .post('/api/v1/apartments')
      .set('Cookie', adminCookie)
      .send({ number: '101', floor: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Apartment number already exists');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/apartments')
      .send({ number: '999', floor: 9 });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/apartments', () => {
  it('returns list of apartments', async () => {
    const res = await request(app)
      .get('/api/v1/apartments')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/v1/apartments?status=AVAILABLE')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    res.body.forEach((a: { status: string }) => {
      expect(a.status).toBe('AVAILABLE');
    });
  });

  it('searches by number', async () => {
    const res = await request(app)
      .get('/api/v1/apartments?search=101')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((a: { number: string }) => a.number === '101')).toBe(true);
  });
});

describe('GET /api/v1/apartments/:id', () => {
  it('returns apartment detail', async () => {
    const res = await request(app)
      .get(`/api/v1/apartments/${apt1Id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.number).toBe('101');
    expect(res.body).toHaveProperty('currentBooking');
    expect(res.body).toHaveProperty('tickets');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/v1/apartments/99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/apartments/:id', () => {
  it('updates apartment status', async () => {
    const res = await request(app)
      .put(`/api/v1/apartments/${apt1Id}`)
      .set('Cookie', adminCookie)
      .send({ status: 'MAINTENANCE' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('MAINTENANCE');
  });

  it('updates apartment number', async () => {
    const res = await request(app)
      .put(`/api/v1/apartments/${apt1Id}`)
      .set('Cookie', adminCookie)
      .send({ number: '101A', floor: 1 });
    expect(res.status).toBe(200);
    expect(res.body.number).toBe('101A');
  });
});
```

### Step 2: Run to confirm tests fail

```bash
cd "D:/Hotel Apartment Management System/server" && npx vitest run tests/apartments.test.ts
```

Expected: FAIL — `Cannot GET /api/v1/apartments`

### Step 3: Create `server/src/controllers/apartments.controller.ts`

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApartmentStatus } from '@hotel/shared';
import { Prisma } from '@prisma/client';

export async function list(req: AuthRequest, res: Response): Promise<void> {
  const { status, search } = req.query as { status?: string; search?: string };

  const where: Prisma.ApartmentWhereInput = {};
  if (status) where.status = status as ApartmentStatus;
  if (search) where.number = { contains: search, mode: 'insensitive' };

  const apartments = await prisma.apartment.findMany({
    where,
    orderBy: { number: 'asc' },
    include: {
      bookings: {
        where: { checkOut: { gte: new Date() } },
        take: 1,
        orderBy: { checkIn: 'desc' },
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

  const result = apartments.map((a) => ({
    id: a.id,
    number: a.number,
    floor: a.floor,
    status: a.status,
    currentBooking: a.bookings[0] ?? null,
    activeTicket: a.tickets[0] ?? null,
  }));

  res.json(result);
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { number, floor } = req.body as { number: string; floor: number };

  if (!number || floor === undefined) {
    res.status(400).json({ message: 'number and floor are required' });
    return;
  }

  try {
    const apartment = await prisma.apartment.create({
      data: { number: String(number).trim(), floor: Number(floor) },
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
  const { number, floor, status } = req.body as {
    number?: string;
    floor?: number;
    status?: ApartmentStatus;
  };

  const data: Prisma.ApartmentUpdateInput = {};
  if (number !== undefined) data.number = String(number).trim();
  if (floor !== undefined) data.floor = Number(floor);
  if (status !== undefined) data.status = status;

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

### Step 4: Create `server/src/routes/apartments.routes.ts`

```typescript
import { Router } from 'express';
import { list, create, getById, update } from '../controllers/apartments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();

router.use(authMiddleware);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', getById);
router.put('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);

export default router;
```

### Step 5: Mount routes in `server/src/app.ts`

Replace the current app.ts with:

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import apartmentsRoutes from './routes/apartments.routes';
import tenantsRoutes from './routes/tenants.routes';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/apartments', apartmentsRoutes);
app.use('/api/v1/tenants', tenantsRoutes);

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
```

Note: `tenantsRoutes` import will fail until Task 2 creates that file. Create a stub `server/src/routes/tenants.routes.ts` now so the app compiles:

```typescript
import { Router } from 'express';
const router = Router();
export default router;
```

### Step 6: Run apartments tests

```bash
cd "D:/Hotel Apartment Management System/server" && npx vitest run tests/apartments.test.ts
```

Expected: PASS (9 tests)

### Step 7: Run full test suite

```bash
cd "D:/Hotel Apartment Management System/server" && npx vitest run
```

Expected: 19 tests passing (10 existing + 9 new apartments)

### Step 8: Commit

```bash
cd "D:/Hotel Apartment Management System" && git add server/src/ server/tests/apartments.test.ts
git commit -m "feat: apartments API (list, create, detail, update) with integration tests"
```

---

## Task 2: Tenants API (Server)

**Files:**
- Create: `server/src/controllers/tenants.controller.ts`
- Modify: `server/src/routes/tenants.routes.ts` (replace stub from Task 1)
- Create: `server/tests/tenants.test.ts`

### Step 1: Write failing tenants tests

Create `server/tests/tenants.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminCookie: string;
let tenant1Id: number;

beforeAll(async () => {
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@test.com',
      password: await hashPassword('password123'),
      role: 'ADMIN',
    },
  });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.com', password: 'password123' });
  adminCookie = loginRes.headers['set-cookie'][0];
});

afterAll(async () => {
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/v1/tenants', () => {
  it('creates a tenant', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Cookie', adminCookie)
      .send({ fullName: 'Ali Hassan', phone: '+971501234567', idNumber: 'A12345678' });
    expect(res.status).toBe(201);
    expect(res.body.fullName).toBe('Ali Hassan');
    expect(res.body.idNumber).toBe('A12345678');
    tenant1Id = res.body.id;
  });

  it('returns 409 on duplicate idNumber', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Cookie', adminCookie)
      .send({ fullName: 'Ali Duplicate', phone: '+971509999999', idNumber: 'A12345678' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('ID number already registered');
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Cookie', adminCookie)
      .send({ fullName: 'Incomplete' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .send({ fullName: 'Ghost', phone: '000', idNumber: 'GHOST01' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/tenants', () => {
  it('returns list of tenants', async () => {
    const res = await request(app)
      .get('/api/v1/tenants')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('searches by name', async () => {
    const res = await request(app)
      .get('/api/v1/tenants?search=Ali')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((t: { fullName: string }) => t.fullName.includes('Ali'))).toBe(true);
  });

  it('searches by idNumber', async () => {
    const res = await request(app)
      .get('/api/v1/tenants?search=A12345678')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((t: { idNumber: string }) => t.idNumber === 'A12345678')).toBe(true);
  });
});

describe('GET /api/v1/tenants/:id', () => {
  it('returns tenant detail with bookings', async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenant1Id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Ali Hassan');
    expect(res.body).toHaveProperty('bookings');
    expect(Array.isArray(res.body.bookings)).toBe(true);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/tenants/:id', () => {
  it('updates tenant phone', async () => {
    const res = await request(app)
      .put(`/api/v1/tenants/${tenant1Id}`)
      .set('Cookie', adminCookie)
      .send({ phone: '+971501111111' });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+971501111111');
  });
});
```

### Step 2: Run to confirm tests fail

```bash
cd "D:/Hotel Apartment Management System/server" && npx vitest run tests/tenants.test.ts
```

Expected: FAIL — stub router has no routes

### Step 3: Create `server/src/controllers/tenants.controller.ts`

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { Prisma } from '@prisma/client';

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

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, phone: true, idNumber: true, createdAt: true },
  });

  res.json(tenants);
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { fullName, phone, idNumber } = req.body as {
    fullName?: string;
    phone?: string;
    idNumber?: string;
  };

  if (!fullName || !phone || !idNumber) {
    res.status(400).json({ message: 'fullName, phone, and idNumber are required' });
    return;
  }

  try {
    const tenant = await prisma.tenant.create({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        idNumber: idNumber.trim(),
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

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { checkIn: 'desc' },
        include: {
          apartment: { select: { id: true, number: true, floor: true } },
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
  const { fullName, phone, idNumber } = req.body as {
    fullName?: string;
    phone?: string;
    idNumber?: string;
  };

  const data: Prisma.TenantUpdateInput = {};
  if (fullName !== undefined) data.fullName = fullName.trim();
  if (phone !== undefined) data.phone = phone.trim();
  if (idNumber !== undefined) data.idNumber = idNumber.trim();

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

### Step 4: Replace stub `server/src/routes/tenants.routes.ts`

```typescript
import { Router } from 'express';
import { list, create, getById, update } from '../controllers/tenants.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();

router.use(authMiddleware);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', getById);
router.put('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);

export default router;
```

### Step 5: Run tenants tests

```bash
cd "D:/Hotel Apartment Management System/server" && npx vitest run tests/tenants.test.ts
```

Expected: PASS (9 tests)

### Step 6: Run full test suite

```bash
cd "D:/Hotel Apartment Management System/server" && npx vitest run
```

Expected: 28 tests passing (10 auth + 9 apartments + 9 tenants)

### Step 7: Commit

```bash
cd "D:/Hotel Apartment Management System" && git add server/src/ server/tests/tenants.test.ts
git commit -m "feat: tenants API (list, create, detail, update) with integration tests"
```

---

## Task 3: i18n Additions + Shared Components + React Query Hooks

**Files:**
- Modify: `client/src/i18n/locales/en/translation.json`
- Modify: `client/src/i18n/locales/ar/translation.json`
- Create: `client/src/components/apartments/ApartmentStatusBadge.tsx`
- Create: `client/src/hooks/useApartments.ts`
- Create: `client/src/hooks/useTenants.ts`

### Step 1: Add keys to `client/src/i18n/locales/en/translation.json`

Add these sections to the existing JSON (merge into the root object):

```json
{
  "apartments": {
    "title": "Apartments",
    "addApartment": "Add Apartment",
    "editApartment": "Edit Apartment",
    "number": "Apartment No.",
    "floor": "Floor",
    "status": "Status",
    "currentTenant": "Current Tenant",
    "checkIn": "Check-in",
    "checkOut": "Check-out",
    "paymentStatus": "Payment Status",
    "maintenanceStatus": "Maintenance",
    "noCurrentBooking": "Vacant",
    "bookingHistory": "Booking History",
    "maintenanceHistory": "Maintenance History",
    "changeStatus": "Change Status",
    "dailyStatus": "Daily Status Report",
    "filterByStatus": "Filter by status",
    "allStatuses": "All Statuses"
  },
  "tenants": {
    "title": "Tenants",
    "addTenant": "Add Tenant",
    "editTenant": "Edit Tenant",
    "fullName": "Full Name",
    "phone": "Phone",
    "idNumber": "ID / Passport No.",
    "registeredOn": "Registered",
    "bookingHistory": "Booking History",
    "paymentHistory": "Payment History",
    "totalBookings": "Total Bookings",
    "noBookings": "No bookings yet"
  }
}
```

### Step 2: Add keys to `client/src/i18n/locales/ar/translation.json`

Add these sections:

```json
{
  "apartments": {
    "title": "الشقق",
    "addApartment": "إضافة شقة",
    "editApartment": "تعديل شقة",
    "number": "رقم الشقة",
    "floor": "الطابق",
    "status": "الحالة",
    "currentTenant": "المستأجر الحالي",
    "checkIn": "تاريخ الدخول",
    "checkOut": "تاريخ المغادرة",
    "paymentStatus": "حالة الدفع",
    "maintenanceStatus": "الصيانة",
    "noCurrentBooking": "شاغرة",
    "bookingHistory": "سجل الحجوزات",
    "maintenanceHistory": "سجل الصيانة",
    "changeStatus": "تغيير الحالة",
    "dailyStatus": "تقرير الحالة اليومي",
    "filterByStatus": "تصفية حسب الحالة",
    "allStatuses": "جميع الحالات"
  },
  "tenants": {
    "title": "المستأجرون",
    "addTenant": "إضافة مستأجر",
    "editTenant": "تعديل مستأجر",
    "fullName": "الاسم الكامل",
    "phone": "الهاتف",
    "idNumber": "رقم الهوية / الجواز",
    "registeredOn": "تاريخ التسجيل",
    "bookingHistory": "سجل الحجوزات",
    "paymentHistory": "سجل المدفوعات",
    "totalBookings": "إجمالي الحجوزات",
    "noBookings": "لا توجد حجوزات بعد"
  }
}
```

### Step 3: Create `client/src/components/apartments/ApartmentStatusBadge.tsx`

```tsx
import { useTranslation } from 'react-i18next';
import { ApartmentStatus } from '@hotel/shared';

const STATUS_STYLES: Record<ApartmentStatus, string> = {
  [ApartmentStatus.AVAILABLE]: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  [ApartmentStatus.OCCUPIED]: 'bg-amber-50 text-amber-800 border border-amber-200',
  [ApartmentStatus.MAINTENANCE]: 'bg-red-50 text-red-800 border border-red-200',
  [ApartmentStatus.RESERVED]: 'bg-orange-50 text-orange-800 border border-orange-200',
  [ApartmentStatus.CLEANING]: 'bg-blue-50 text-blue-800 border border-blue-200',
  [ApartmentStatus.PENDING_CHECKOUT]: 'bg-purple-50 text-purple-800 border border-purple-200',
};

interface Props {
  status: ApartmentStatus;
  size?: 'sm' | 'md';
}

export default function ApartmentStatusBadge({ status, size = 'sm' }: Props) {
  const { t } = useTranslation();
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${STATUS_STYLES[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}
```

### Step 4: Create `client/src/hooks/useApartments.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { ApartmentStatus } from '@hotel/shared';

export interface ApartmentListItem {
  id: number;
  number: string;
  floor: number;
  status: ApartmentStatus;
  currentBooking: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
    tenant: { id: number; fullName: string; phone: string };
    payments: { method: string; amount: string; status: string; paidAt: string | null }[];
  } | null;
  activeTicket: { id: number; status: string; priority: string } | null;
}

export interface ApartmentDetail extends ApartmentListItem {
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
}

export interface UpdateApartmentDto {
  number?: string;
  floor?: number;
  status?: ApartmentStatus;
}

export function useApartments(filters?: { status?: ApartmentStatus; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
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

### Step 5: Create `client/src/hooks/useTenants.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface TenantListItem {
  id: number;
  fullName: string;
  phone: string;
  idNumber: string;
  createdAt: string;
}

export interface TenantDetail extends TenantListItem {
  bookings: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
    apartment: { id: number; number: string; floor: number };
    payments: { id: number; method: string; amount: string; status: string; paidAt: string | null }[];
  }[];
}

export interface CreateTenantDto {
  fullName: string;
  phone: string;
  idNumber: string;
}

export interface UpdateTenantDto {
  fullName?: string;
  phone?: string;
  idNumber?: string;
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
    enabled: !!id,
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

### Step 6: Commit

```bash
cd "D:/Hotel Apartment Management System" && git add client/src/
git commit -m "feat: i18n apartment/tenant keys, status badge, React Query hooks"
```

---

## Task 4: Apartments List Page + Form Modal

**Files:**
- Create: `client/src/pages/apartments/ApartmentFormModal.tsx`
- Create: `client/src/pages/apartments/ApartmentsPage.tsx`

### Step 1: Create `client/src/pages/apartments/ApartmentFormModal.tsx`

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ApartmentStatus } from '@hotel/shared';
import {
  useCreateApartment,
  useUpdateApartment,
  ApartmentListItem,
} from '../../hooks/useApartments';

const schema = z.object({
  number: z.string().min(1, 'Required'),
  floor: z.coerce.number().int().min(0),
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
  const update = useUpdateApartment(apartment?.id ?? 0);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { number: '', floor: 1 },
  });

  useEffect(() => {
    if (apartment) reset({ number: apartment.number, floor: apartment.floor, status: apartment.status });
  }, [apartment, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEdit) {
        await update.mutateAsync(data);
        toast.success('Apartment updated');
      } else {
        await create.mutateAsync({ number: data.number, floor: data.floor });
        toast.success('Apartment created');
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Something went wrong');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-amber-900">
            {isEdit ? t('apartments.editApartment') : t('apartments.addApartment')}
          </h2>
          <button onClick={onClose} className="text-amber-700 hover:text-amber-900">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-amber-900 mb-1">
              {t('apartments.number')}
            </label>
            <input
              {...register('number')}
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 bg-[#fffbf5] focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {errors.number && <p className="text-red-500 text-xs mt-1">{errors.number.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-amber-900 mb-1">
              {t('apartments.floor')}
            </label>
            <input
              {...register('floor')}
              type="number"
              min={0}
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 bg-[#fffbf5] focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {errors.floor && <p className="text-red-500 text-xs mt-1">{errors.floor.message}</p>}
          </div>

          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-amber-900 mb-1">
                {t('apartments.status')}
              </label>
              <select
                {...register('status')}
                className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 bg-[#fffbf5] focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {Object.values(ApartmentStatus).map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-amber-200 text-amber-800 rounded-lg py-2 text-sm font-medium hover:bg-amber-50 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="flex-1 bg-[#b45309] text-white rounded-lg py-2 text-sm font-semibold hover:bg-[#92400e] transition disabled:opacity-60"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### Step 2: Create `client/src/pages/apartments/ApartmentsPage.tsx`

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApartmentStatus, Role } from '@hotel/shared';
import { useApartments, ApartmentListItem } from '../../hooks/useApartments';
import ApartmentStatusBadge from '../../components/apartments/ApartmentStatusBadge';
import ApartmentFormModal from './ApartmentFormModal';
import { useAuth } from '../../hooks/useAuth';

const STATUS_OPTIONS = ['', ...Object.values(ApartmentStatus)] as const;

export default function ApartmentsPage() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApartmentStatus | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ApartmentListItem | null>(null);

  const { data: apartments = [], isLoading } = useApartments({
    search: search || undefined,
    status: statusFilter || undefined,
  });

  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-amber-900">{t('apartments.title')}</h1>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-[#b45309] text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-[#92400e] transition"
          >
            <Plus size={14} />
            {t('apartments.addApartment')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="pl-8 pr-3 py-1.5 border border-amber-200 rounded-lg text-xs text-amber-900 bg-[#fffbf5] focus:outline-none focus:ring-2 focus:ring-amber-300 w-44"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ApartmentStatus | '')}
          className="border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-amber-900 bg-[#fffbf5] focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          <option value="">{t('apartments.allStatuses')}</option>
          {Object.values(ApartmentStatus).map((s) => (
            <option key={s} value={s}>{t(`status.${s}`)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-amber-700 text-sm">{t('common.loading')}</p>
      ) : apartments.length === 0 ? (
        <p className="text-amber-600 text-sm">{t('common.noData')}</p>
      ) : (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-amber-100">
              <tr className="text-xs text-amber-700 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">{t('apartments.number')}</th>
                <th className="text-left px-4 py-3">{t('apartments.floor')}</th>
                <th className="text-left px-4 py-3">{t('apartments.status')}</th>
                <th className="text-left px-4 py-3">{t('apartments.currentTenant')}</th>
                <th className="text-left px-4 py-3">{t('apartments.checkIn')}</th>
                <th className="text-left px-4 py-3">{t('apartments.checkOut')}</th>
                <th className="text-left px-4 py-3">{t('apartments.maintenanceStatus')}</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {apartments.map((apt) => (
                <tr key={apt.id} className="border-b border-amber-50 hover:bg-amber-50/40 transition">
                  <td className="px-4 py-3">
                    <Link to={`/apartments/${apt.id}`} className="font-semibold text-amber-900 hover:underline">
                      {apt.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-amber-700">{apt.floor}</td>
                  <td className="px-4 py-3">
                    <ApartmentStatusBadge status={apt.status} />
                  </td>
                  <td className="px-4 py-3 text-amber-800">
                    {apt.currentBooking?.tenant.fullName ?? (
                      <span className="text-amber-400 italic">{t('apartments.noCurrentBooking')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-amber-700 text-xs">
                    {apt.currentBooking ? new Date(apt.currentBooking.checkIn).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-amber-700 text-xs">
                    {apt.currentBooking ? new Date(apt.currentBooking.checkOut).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {apt.activeTicket ? (
                      <span className="text-xs text-red-600 font-medium">{apt.activeTicket.status}</span>
                    ) : (
                      <span className="text-xs text-emerald-600">—</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setEditTarget(apt); setShowModal(true); }}
                        className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                      >
                        {t('common.edit')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ApartmentFormModal
          apartment={editTarget}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
```

### Step 3: Commit

```bash
cd "D:/Hotel Apartment Management System" && git add client/src/pages/apartments/
git commit -m "feat: apartments list page with filter, search, and add/edit modal"
```

---

## Task 5: Apartment Detail Page

**Files:**
- Create: `client/src/pages/apartments/ApartmentDetailPage.tsx`

### Step 1: Create `client/src/pages/apartments/ApartmentDetailPage.tsx`

```tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ApartmentStatus, Role } from '@hotel/shared';
import { useApartment, useUpdateApartment } from '../../hooks/useApartments';
import ApartmentStatusBadge from '../../components/apartments/ApartmentStatusBadge';
import ApartmentFormModal from './ApartmentFormModal';
import { useAuth } from '../../hooks/useAuth';

export default function ApartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const aptId = Number(id);
  const { data: user } = useAuth();
  const { data: apartment, isLoading } = useApartment(aptId);
  const updateApt = useUpdateApartment(aptId);
  const [showEdit, setShowEdit] = useState(false);

  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  const handleStatusChange = async (status: ApartmentStatus) => {
    try {
      await updateApt.mutateAsync({ status });
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  if (isLoading) return <p className="p-4 text-amber-700">{t('common.loading')}</p>;
  if (!apartment) return <p className="p-4 text-red-600">Apartment not found</p>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/apartments" className="text-amber-700 hover:text-amber-900">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-base font-bold text-amber-900">
            {t('apartments.number')} {apartment.number}
          </h1>
          <ApartmentStatusBadge status={apartment.status} size="md" />
        </div>
        {canEdit && (
          <button
            onClick={() => setShowEdit(true)}
            className="text-xs text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-50 transition"
          >
            {t('common.edit')}
          </button>
        )}
      </div>

      {/* Status change buttons */}
      {canEdit && (
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-900 mb-3">{t('apartments.changeStatus')}</p>
          <div className="flex gap-2 flex-wrap">
            {Object.values(ApartmentStatus).map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={apartment.status === s || updateApt.isPending}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition disabled:opacity-40 ${
                  apartment.status === s
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                }`}
              >
                {t(`status.${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current Booking */}
      <div className="bg-white border border-amber-200 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-3">
          {t('apartments.currentTenant')}
        </h2>
        {apartment.currentBooking ? (
          <div className="space-y-2 text-sm text-amber-800">
            <div className="flex justify-between">
              <span className="text-amber-600">{t('tenants.fullName')}</span>
              <Link to={`/tenants/${apartment.currentBooking.tenant.id}`} className="font-semibold hover:underline">
                {apartment.currentBooking.tenant.fullName}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-600">{t('apartments.checkIn')}</span>
              <span>{new Date(apartment.currentBooking.checkIn).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-600">{t('apartments.checkOut')}</span>
              <span>{new Date(apartment.currentBooking.checkOut).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-600">{t('apartments.paymentStatus')}</span>
              <span className="font-semibold">
                {apartment.currentBooking.payments.every((p) => p.status === 'PAID')
                  ? <span className="text-emerald-700">{t('status.PAID')}</span>
                  : <span className="text-orange-600">{t('status.PENDING')}</span>}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-amber-400 text-sm italic">{t('apartments.noCurrentBooking')}</p>
        )}
      </div>

      {/* Booking History */}
      {apartment.bookings.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-3">
            {t('apartments.bookingHistory')}
          </h2>
          <div className="space-y-2">
            {apartment.bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-xs text-amber-700 border-b border-amber-50 pb-2 last:border-0">
                <Link to={`/tenants/${b.tenant.id}`} className="font-medium hover:underline">{b.tenant.fullName}</Link>
                <span>{new Date(b.checkIn).toLocaleDateString()} → {new Date(b.checkOut).toLocaleDateString()}</span>
                <span className="font-semibold text-amber-900">AED {Number(b.totalAmount).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance History */}
      {apartment.tickets.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Wrench size={12} />
            {t('apartments.maintenanceHistory')}
          </h2>
          <div className="space-y-2">
            {apartment.tickets.map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between text-xs border-b border-amber-50 pb-2 last:border-0">
                <span className="text-amber-800 flex-1">{ticket.description}</span>
                <span className={`font-medium ml-4 ${ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS' ? 'text-red-600' : 'text-emerald-600'}`}>
                  {t(`status.${ticket.status}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showEdit && (
        <ApartmentFormModal
          apartment={apartment}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
```

### Step 2: Commit

```bash
cd "D:/Hotel Apartment Management System" && git add client/src/pages/apartments/ApartmentDetailPage.tsx
git commit -m "feat: apartment detail page with booking, payment status, and maintenance history"
```

---

## Task 6: Tenants List Page + Form Modal

**Files:**
- Create: `client/src/pages/tenants/TenantFormModal.tsx`
- Create: `client/src/pages/tenants/TenantsPage.tsx`

### Step 1: Create `client/src/pages/tenants/TenantFormModal.tsx`

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useCreateTenant, useUpdateTenant, TenantListItem } from '../../hooks/useTenants';

const schema = z.object({
  fullName: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  idNumber: z.string().min(3, 'Required'),
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
  const update = useUpdateTenant(tenant?.id ?? 0);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', idNumber: '' },
  });

  useEffect(() => {
    if (tenant) reset({ fullName: tenant.fullName, phone: tenant.phone, idNumber: tenant.idNumber });
  }, [tenant, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEdit) {
        await update.mutateAsync(data);
        toast.success('Tenant updated');
      } else {
        await create.mutateAsync(data);
        toast.success('Tenant created');
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Something went wrong');
    }
  };

  const fields: { name: keyof FormValues; labelKey: string; type?: string }[] = [
    { name: 'fullName', labelKey: 'tenants.fullName' },
    { name: 'phone', labelKey: 'tenants.phone', type: 'tel' },
    { name: 'idNumber', labelKey: 'tenants.idNumber' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-amber-900">
            {isEdit ? t('tenants.editTenant') : t('tenants.addTenant')}
          </h2>
          <button onClick={onClose} className="text-amber-700 hover:text-amber-900">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {fields.map(({ name, labelKey, type = 'text' }) => (
            <div key={name}>
              <label className="block text-xs font-semibold text-amber-900 mb-1">{t(labelKey)}</label>
              <input
                {...register(name)}
                type={type}
                className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 bg-[#fffbf5] focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message}</p>}
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-amber-200 text-amber-800 rounded-lg py-2 text-sm font-medium hover:bg-amber-50 transition">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className="flex-1 bg-[#b45309] text-white rounded-lg py-2 text-sm font-semibold hover:bg-[#92400e] transition disabled:opacity-60">
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### Step 2: Create `client/src/pages/tenants/TenantsPage.tsx`

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useTenants, TenantListItem } from '../../hooks/useTenants';
import TenantFormModal from './TenantFormModal';
import { useAuth } from '../../hooks/useAuth';

export default function TenantsPage() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantListItem | null>(null);

  const { data: tenants = [], isLoading } = useTenants(search || undefined);
  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-amber-900">{t('tenants.title')}</h1>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-[#b45309] text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-[#92400e] transition"
          >
            <Plus size={14} />
            {t('tenants.addTenant')}
          </button>
        )}
      </div>

      <div className="relative w-64">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')}
          className="pl-8 pr-3 py-1.5 border border-amber-200 rounded-lg text-xs text-amber-900 bg-[#fffbf5] focus:outline-none focus:ring-2 focus:ring-amber-300 w-full"
        />
      </div>

      {isLoading ? (
        <p className="text-amber-700 text-sm">{t('common.loading')}</p>
      ) : tenants.length === 0 ? (
        <p className="text-amber-600 text-sm">{t('common.noData')}</p>
      ) : (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-amber-100">
              <tr className="text-xs text-amber-700 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">{t('tenants.fullName')}</th>
                <th className="text-left px-4 py-3">{t('tenants.phone')}</th>
                <th className="text-left px-4 py-3">{t('tenants.idNumber')}</th>
                <th className="text-left px-4 py-3">{t('tenants.registeredOn')}</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-amber-50 hover:bg-amber-50/40 transition">
                  <td className="px-4 py-3">
                    <Link to={`/tenants/${tenant.id}`} className="font-semibold text-amber-900 hover:underline">
                      {tenant.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-amber-700">{tenant.phone}</td>
                  <td className="px-4 py-3 text-amber-700 font-mono text-xs">{tenant.idNumber}</td>
                  <td className="px-4 py-3 text-amber-600 text-xs">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setEditTarget(tenant); setShowModal(true); }}
                        className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                      >
                        {t('common.edit')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <TenantFormModal tenant={editTarget} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
```

### Step 3: Commit

```bash
cd "D:/Hotel Apartment Management System" && git add client/src/pages/tenants/
git commit -m "feat: tenants list page with search and add/edit modal"
```

---

## Task 7: Tenant Detail Page

**Files:**
- Create: `client/src/pages/tenants/TenantDetailPage.tsx`

### Step 1: Create `client/src/pages/tenants/TenantDetailPage.tsx`

```tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useTenant } from '../../hooks/useTenants';
import TenantFormModal from './TenantFormModal';
import { useAuth } from '../../hooks/useAuth';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const tenantId = Number(id);
  const { data: user } = useAuth();
  const { data: tenant, isLoading } = useTenant(tenantId);
  const [showEdit, setShowEdit] = useState(false);

  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  if (isLoading) return <p className="p-4 text-amber-700">{t('common.loading')}</p>;
  if (!tenant) return <p className="p-4 text-red-600">Tenant not found</p>;

  const totalPaid = tenant.bookings.flatMap((b) => b.payments)
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/tenants" className="text-amber-700 hover:text-amber-900">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-base font-bold text-amber-900 flex-1">{tenant.fullName}</h1>
        {canEdit && (
          <button
            onClick={() => setShowEdit(true)}
            className="text-xs text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-50 transition"
          >
            {t('common.edit')}
          </button>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-white border border-amber-200 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-amber-600 mb-0.5">{t('tenants.fullName')}</p>
          <p className="font-semibold text-amber-900">{tenant.fullName}</p>
        </div>
        <div>
          <p className="text-xs text-amber-600 mb-0.5">{t('tenants.phone')}</p>
          <p className="text-amber-800">{tenant.phone}</p>
        </div>
        <div>
          <p className="text-xs text-amber-600 mb-0.5">{t('tenants.idNumber')}</p>
          <p className="text-amber-800 font-mono text-xs">{tenant.idNumber}</p>
        </div>
        <div>
          <p className="text-xs text-amber-600 mb-0.5">{t('tenants.registeredOn')}</p>
          <p className="text-amber-700 text-xs">{new Date(tenant.createdAt).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-xs text-amber-600 mb-0.5">{t('tenants.totalBookings')}</p>
          <p className="font-bold text-amber-900">{tenant.bookings.length}</p>
        </div>
        <div>
          <p className="text-xs text-amber-600 mb-0.5">{t('dashboard.todayRevenue')}</p>
          <p className="font-bold text-emerald-700">AED {totalPaid.toLocaleString()}</p>
        </div>
      </div>

      {/* Booking History */}
      <div className="bg-white border border-amber-200 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-3">
          {t('tenants.bookingHistory')}
        </h2>
        {tenant.bookings.length === 0 ? (
          <p className="text-amber-400 text-sm italic">{t('tenants.noBookings')}</p>
        ) : (
          <div className="space-y-3">
            {tenant.bookings.map((booking) => {
              const paidAmount = booking.payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount), 0);
              const isFullyPaid = paidAmount >= Number(booking.totalAmount);
              return (
                <div key={booking.id} className="border border-amber-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Link to={`/apartments/${booking.apartment.id}`} className="font-semibold text-amber-900 text-sm hover:underline">
                      {t('apartments.number')} {booking.apartment.number}
                    </Link>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isFullyPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                      {isFullyPaid ? t('status.PAID') : t('status.PENDING')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-amber-700">
                    <div>
                      <span className="text-amber-500">{t('apartments.checkIn')}: </span>
                      {new Date(booking.checkIn).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="text-amber-500">{t('apartments.checkOut')}: </span>
                      {new Date(booking.checkOut).toLocaleDateString()}
                    </div>
                    <div className="text-right font-semibold text-amber-900">
                      AED {Number(booking.totalAmount).toLocaleString()}
                    </div>
                  </div>
                  {booking.payments.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-amber-50">
                      <p className="text-xs text-amber-500 mb-1">{t('tenants.paymentHistory')}</p>
                      <div className="space-y-1">
                        {booking.payments.map((p) => (
                          <div key={p.id} className="flex justify-between text-xs text-amber-700">
                            <span>{p.method}</span>
                            <span className={p.status === 'PAID' ? 'text-emerald-600 font-medium' : 'text-orange-600'}>
                              AED {Number(p.amount).toLocaleString()} · {t(`status.${p.status}`)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showEdit && (
        <TenantFormModal tenant={tenant} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}
```

### Step 2: Commit

```bash
cd "D:/Hotel Apartment Management System" && git add client/src/pages/tenants/TenantDetailPage.tsx
git commit -m "feat: tenant detail page with booking history and payment breakdown"
```

---

## Task 8: Wire Up Routes in App.tsx

**Files:**
- Modify: `client/src/App.tsx`

### Step 1: Replace placeholder routes in `client/src/App.tsx`

Replace the entire file:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Role } from '@hotel/shared';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import ApartmentsPage from './pages/apartments/ApartmentsPage';
import ApartmentDetailPage from './pages/apartments/ApartmentDetailPage';
import TenantsPage from './pages/tenants/TenantsPage';
import TenantDetailPage from './pages/tenants/TenantDetailPage';

const ALL_STAFF = [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE, Role.FINANCE];
const ADMIN_RECEPTIONIST = [Role.ADMIN, Role.RECEPTIONIST];
const ADMIN_FINANCE = [Role.ADMIN, Role.FINANCE];
const TICKETS_ROLES = [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute allowedRoles={ALL_STAFF}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                <div className="text-amber-900 font-semibold">Dashboard — coming in Phase 5</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="apartments"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <ApartmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="apartments/:id"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <ApartmentDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tenants"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <TenantsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tenants/:id"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <TenantDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="payments/*"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                <div className="text-amber-900 font-semibold">Payments — coming in Phase 3</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="tickets/*"
            element={
              <ProtectedRoute allowedRoles={TICKETS_ROLES}>
                <div className="text-amber-900 font-semibold">Tickets — coming in Phase 4</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                <div className="text-amber-900 font-semibold">Reports — coming in Phase 5</div>
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Step 2: Verify TypeScript compiles

```bash
cd "D:/Hotel Apartment Management System/client" && npx tsc --noEmit
```

Expected: Zero errors.

### Step 3: Run full server test suite one last time

```bash
cd "D:/Hotel Apartment Management System/server" && npx vitest run
```

Expected: 28 tests passing.

### Step 4: Final commit

```bash
cd "D:/Hotel Apartment Management System" && git add client/src/App.tsx
git commit -m "feat: wire up apartments and tenants routes — Phase 2 complete"
```

---

## Summary

After Phase 2 you have:

**Server (28 tests passing):**
- `GET/POST /api/v1/apartments` — list with status filter + search, create with duplicate check
- `GET/PUT /api/v1/apartments/:id` — detail with current booking + ticket history, update
- `GET/POST /api/v1/tenants` — searchable list (name/phone/ID), create with duplicate check
- `GET/PUT /api/v1/tenants/:id` — detail with full booking + payment history, update

**Client:**
- `/apartments` — Daily Status list (number, status, tenant, check-in, check-out, payment, maintenance)
- `/apartments/:id` — Detail with status change buttons, current booking, booking history, maintenance log
- `/tenants` — Searchable list
- `/tenants/:id` — Detail with total paid, full booking history, payment breakdown per booking
- Bilingual (EN/AR) throughout

**Next:** `2026-05-12-phase-3-payments-receipts.md`
