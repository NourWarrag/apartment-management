# Bookings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `/bookings` page with server-side filtered, paginated list of all bookings, accessible from the sidebar.

**Architecture:** New `GET /bookings` list endpoint with Prisma-level filtering (search, status, building, date range, pagination). A `useBookingsList` hook queries it. `BookingsPage` mirrors the ApartmentsPage pattern: 4 stat cards + filter bar + table with row-click-to-invoice. No new modals — row click opens the existing `BookingInvoiceModal`.

**Tech Stack:** Express/Prisma (server), React + TanStack Query + Tailwind MD3 tokens (client), Vitest (tests)

---

## File Map

| Action | File |
|---|---|
| Modify | `server/src/controllers/bookings.controller.ts` — add `list` export |
| Modify | `server/src/routes/bookings.routes.ts` — add `GET /` route |
| Modify | `server/src/controllers/bookings.controller.test.ts` — add list tests |
| Modify | `client/src/hooks/useBookings.ts` — add types + `useBookingsList` |
| Create | `client/src/pages/bookings/BookingsPage.tsx` |
| Modify | `client/src/App.tsx` — add `/bookings` route |
| Modify | `client/src/components/layout/Sidebar.tsx` — add nav item |

---

### Task 1: Server — `GET /bookings` list endpoint + tests

**Files:**
- Modify: `server/src/controllers/bookings.controller.ts`
- Modify: `server/src/routes/bookings.routes.ts`
- Modify: `server/src/controllers/bookings.controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `server/src/controllers/bookings.controller.test.ts`. Add this describe block at the bottom of the file (after the existing `GET /api/v1/bookings/:id` describe block):

```typescript
describe('GET /api/v1/bookings (list)', () => {
  let adminToken: string;
  let building: { id: number };
  let apartment: { id: number };
  let tenant: { id: number };
  let booking: { id: number };

  beforeAll(async () => {
    const user = await testPrisma.user.create({
      data: {
        name: 'List Admin',
        email: `list-admin-${Date.now()}@test.com`,
        password: 'x',
        role: 'ADMIN',
      },
    });
    adminToken = signToken({ id: user.id, email: user.email, role: user.role });

    building = await testPrisma.building.create({
      data: { name: 'List Tower', code: `LIST-${Date.now()}`, address: '1 List St' },
    });
    apartment = await testPrisma.apartment.create({
      data: { number: 'LST-001', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: building.id },
    });
    tenant = await testPrisma.tenant.create({
      data: { fullName: 'List Tenant', phone: `0510${Date.now().toString().slice(-6)}`, idNumber: `LT-${Date.now()}` },
    });
    booking = await testPrisma.booking.create({
      data: {
        apartmentId: apartment.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-01-01'),
        checkOut: new Date('2026-02-01'),
        totalAmount: 3000,
        createdBy: user.id,
      },
    });
  });

  afterAll(async () => {
    await testPrisma.booking.deleteMany({ where: { apartmentId: apartment.id } });
    await testPrisma.apartment.delete({ where: { id: apartment.id } });
    await testPrisma.tenant.update({ where: { id: tenant.id }, data: { deletedAt: new Date() } });
    await testPrisma.building.delete({ where: { id: building.id } });
  });

  it('returns paginated list with correct shape', async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 20);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find((b: any) => b.id === booking.id);
    expect(found).toBeDefined();
    expect(found.tenant).toMatchObject({ fullName: 'List Tenant' });
    expect(found.apartment).toMatchObject({ number: 'LST-001' });
    expect(found.apartment.building).toMatchObject({ name: 'List Tower' });
  });

  it('returns only ACTIVE bookings when status=ACTIVE', async () => {
    // booking.checkIn is 2026-01-01 which is in the past → ACTIVE (checkIn ≤ now, checkedOutAt null)
    const res = await request(app)
      .get('/api/v1/bookings?status=ACTIVE')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find((b: any) => b.id === booking.id);
    expect(found).toBeDefined();
    // All returned bookings must have checkIn ≤ now and no checkedOutAt
    res.body.data.forEach((b: any) => {
      expect(new Date(b.checkIn).getTime()).toBeLessThanOrEqual(Date.now());
      expect(b.checkedOutAt).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/controllers/bookings.controller.test.ts --reporter=verbose 2>&1 | grep -E "✓|✗|FAIL|list" | head -20
```

Expected: both new tests FAIL (route not found → 404).

- [ ] **Step 3: Add the `list` handler to the controller**

Open `server/src/controllers/bookings.controller.ts`. Add this function at the bottom of the file (after `getById`):

```typescript
export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const pageRaw = parseInt((req.query.page as string) ?? '1');
    const limitRaw = parseInt((req.query.limit as string) ?? '20');
    const page = isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 20 : Math.min(limitRaw, 100);

    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const buildingId = req.query.buildingId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    if (from && isNaN(new Date(from).getTime())) {
      res.status(400).json({ message: 'Invalid date format' });
      return;
    }
    if (to && isNaN(new Date(to).getTime())) {
      res.status(400).json({ message: 'Invalid date format' });
      return;
    }

    const now = new Date();
    const bid = buildingId ? parseInt(buildingId) : NaN;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      where.OR = [
        { tenant: { fullName: { contains: search, mode: 'insensitive' } } },
        { apartment: { number: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (!isNaN(bid)) {
      where.apartment = { buildingId: bid };
    }
    if (from) where.checkIn = { ...(where.checkIn ?? {}), gte: new Date(from) };
    if (to) where.checkIn = { ...(where.checkIn ?? {}), lte: new Date(to) };

    if (status === 'ACTIVE') {
      where.checkIn = { ...(where.checkIn ?? {}), lte: now };
      where.checkedOutAt = null;
    } else if (status === 'UPCOMING') {
      where.checkIn = { ...(where.checkIn ?? {}), gt: now };
      where.checkedOutAt = null;
    } else if (status === 'CHECKED_OUT') {
      where.checkedOutAt = { not: null };
    }

    const [total, data] = await prisma.$transaction([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        select: {
          id: true,
          checkIn: true,
          checkOut: true,
          totalAmount: true,
          depositStatus: true,
          checkedOutAt: true,
          createdAt: true,
          tenant: { select: { id: true, fullName: true, phone: true } },
          apartment: {
            select: {
              id: true,
              number: true,
              floor: true,
              type: true,
              building: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ data, total, page, limit });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 4: Register the route**

Open `server/src/routes/bookings.routes.ts`. Add the import and route. The file currently starts with:

```typescript
import { create, collectDeposit, checkout, getById } from '../controllers/bookings.controller';
```

Change it to:

```typescript
import { create, collectDeposit, checkout, getById, list } from '../controllers/bookings.controller';
```

Then add the route **before** the `router.post('/')` line (it must come before `/:id` routes to avoid route conflicts):

```typescript
router.get('/', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), list);
```

The full routes file should now look like:

```typescript
import { Router } from 'express';
import { create, collectDeposit, checkout, getById, list } from '../controllers/bookings.controller';
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadFile } from '../middleware/upload.middleware';
import { Role, AttachmentEntity } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.get('/', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), getById);
router.patch('/:id/deposit', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), collectDeposit);
router.patch('/:id/checkout', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), checkout);

const att = makeAttachmentHandlers(AttachmentEntity.BOOKING);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), uploadFile, att.upload);
router.get('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.remove);

export default router;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/controllers/bookings.controller.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: all tests in the file pass (24 existing + 2 new = 26 total).

- [ ] **Step 6: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add server/src/controllers/bookings.controller.ts server/src/routes/bookings.routes.ts server/src/controllers/bookings.controller.test.ts
git commit -m "feat: add GET /bookings list endpoint with filtering and pagination"
```

---

### Task 2: Client — `useBookingsList` hook + types

**Files:**
- Modify: `client/src/hooks/useBookings.ts`

- [ ] **Step 1: Add types and hook**

Open `client/src/hooks/useBookings.ts`. Add the following after the existing `BookingDetail` interface and before the `useCreateBooking` function:

```typescript
export interface BookingsListParams {
  search?: string;
  status?: 'ACTIVE' | 'UPCOMING' | 'CHECKED_OUT';
  buildingId?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface BookingListItem {
  id: number;
  checkIn: string;
  checkOut: string;
  totalAmount: string;
  depositStatus: 'NONE' | 'HELD' | 'RELEASED' | 'FORFEITED';
  checkedOutAt: string | null;
  createdAt: string;
  tenant: { id: number; fullName: string; phone: string };
  apartment: {
    id: number;
    number: string;
    floor: number;
    type: string;
    building: { id: number; name: string };
  };
}

export interface BookingsListResponse {
  data: BookingListItem[];
  total: number;
  page: number;
  limit: number;
}

export function useBookingsList(params: BookingsListParams = {}) {
  return useQuery({
    queryKey: ['bookings', params],
    queryFn: async () => {
      const res = await api.get('/bookings', { params });
      return res.data as BookingsListResponse;
    },
  });
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "D:/Hotel Apartment Management System/client"
npx tsc --noEmit 2>&1 | grep "useBookings" | head -10
```

Expected: no errors on `useBookings.ts`.

- [ ] **Step 3: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add client/src/hooks/useBookings.ts
git commit -m "feat: add useBookingsList hook and BookingListItem types"
```

---

### Task 3: Client — `BookingsPage` component

**Files:**
- Create: `client/src/pages/bookings/BookingsPage.tsx`

**Before starting:** Read `client/src/hooks/useBuildings.ts` (or `client/src/hooks/useBuilding.ts`) to find the hook that returns a list of buildings for the dropdown. Also check `client/src/pages/apartments/ApartmentsPage.tsx` around line 100–150 to understand how the building context and filter bar are implemented.

- [ ] **Step 1: Find the buildings list hook**

Before writing the component, read `client/src/hooks/useBuildings.ts` to find the hook that returns a list of buildings (it likely exports `useBuildings()` returning `{ id, name, code }[]`). Note the exact function name and return type — you'll import it in the component.

If no `useBuildings` hook exists, use this inline query in the component instead:
```typescript
import { useQuery } from '@tanstack/react-query';
const { data: buildings } = useQuery({
  queryKey: ['buildings'],
  queryFn: async () => (await api.get('/buildings')).data as { id: number; name: string }[],
});
```

- [ ] **Step 2: Create the file**

Create `client/src/pages/bookings/BookingsPage.tsx` with this full content (replace the `useBuildings` import/usage with whatever you found in Step 1):

```typescript
import { useState } from 'react';
import { useBookingsList, BookingListItem } from '../../hooks/useBookings';
import BookingInvoiceModal from '../../components/BookingInvoiceModal';
import { useAuth } from '../../hooks/useAuth';
import { Role } from '@hotel/shared';
// Import useBuildings (or equivalent) from the hook you found in Step 1

const PAGE_SIZE = 20;

const DEPOSIT_BADGE: Record<string, { label: string; classes: string }> = {
  NONE: { label: 'No Deposit', classes: 'bg-surface-container text-on-surface-variant' },
  HELD: { label: 'Held', classes: 'bg-amber-100 text-amber-800' },
  RELEASED: { label: 'Released', classes: 'bg-green-100 text-green-800' },
  FORFEITED: { label: 'Forfeited', classes: 'bg-red-100 text-red-800' },
};

function deriveStatus(b: BookingListItem): 'ACTIVE' | 'UPCOMING' | 'CHECKED_OUT' {
  if (b.checkedOutAt) return 'CHECKED_OUT';
  if (new Date(b.checkIn) > new Date()) return 'UPCOMING';
  return 'ACTIVE';
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: 'Active', classes: 'bg-green-100 text-green-800' },
  UPCOMING: { label: 'Upcoming', classes: 'bg-blue-100 text-blue-800' },
  CHECKED_OUT: { label: 'Checked Out', classes: 'bg-surface-container text-on-surface-variant' },
};

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAed(str: string) {
  return `AED ${Number(str).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function BookingsPage() {
  const { data: user } = useAuth();
  const canViewBuildings =
    user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;

  // Filter state (pending — not yet applied)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'UPCOMING' | 'CHECKED_OUT' | ''>('');
  const [buildingIdFilter, setBuildingIdFilter] = useState<string>('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  // Applied state (sent to API)
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStatus, setAppliedStatus] = useState<'ACTIVE' | 'UPCOMING' | 'CHECKED_OUT' | ''>('');
  const [appliedBuildingId, setAppliedBuildingId] = useState<number | undefined>(undefined);
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [page, setPage] = useState(1);

  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  // Buildings list for the dropdown (use the hook from Step 1)
  const { data: buildings } = useBuildings(); // replace with actual hook name if different

  const sharedParams = {
    search: appliedSearch || undefined,
    buildingId: appliedBuildingId,
    from: appliedFrom || undefined,
    to: appliedTo || undefined,
  };

  const { data, isLoading } = useBookingsList({
    ...sharedParams,
    status: appliedStatus || undefined,
    page,
    limit: PAGE_SIZE,
  });

  // Stats queries — same filters but no status, limit=1 each
  const { data: totalStats } = useBookingsList({ ...sharedParams, limit: 1 });
  const { data: activeStats } = useBookingsList({ ...sharedParams, status: 'ACTIVE', limit: 1 });
  const { data: upcomingStats } = useBookingsList({ ...sharedParams, status: 'UPCOMING', limit: 1 });
  const { data: checkedOutStats } = useBookingsList({ ...sharedParams, status: 'CHECKED_OUT', limit: 1 });

  function applyFilters() {
    setAppliedSearch(search);
    setAppliedStatus(statusFilter);
    setAppliedBuildingId(buildingIdFilter ? parseInt(buildingIdFilter) : undefined);
    setAppliedFrom(fromFilter);
    setAppliedTo(toFilter);
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setBuildingIdFilter('');
    setFromFilter('');
    setToFilter('');
    setAppliedSearch('');
    setAppliedStatus('');
    setAppliedBuildingId(undefined);
    setAppliedFrom('');
    setAppliedTo('');
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const startRow = data && data.data.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endRow = data ? (page - 1) * PAGE_SIZE + data.data.length : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Bookings</h1>
        <p className="text-sm text-on-surface-variant mt-1">All bookings across your properties</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: totalStats?.total ?? '—', icon: 'calendar_month', color: 'text-primary' },
          { label: 'Active', value: activeStats?.total ?? '—', icon: 'home', color: 'text-green-600' },
          { label: 'Upcoming', value: upcomingStats?.total ?? '—', icon: 'schedule', color: 'text-blue-600' },
          { label: 'Checked Out', value: checkedOutStats?.total ?? '—', icon: 'logout', color: 'text-on-surface-variant' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4 border border-outline-variant">
            <span className={`material-symbols-outlined text-3xl ${color}`}>{icon}</span>
            <div>
              <p className="text-2xl font-bold text-on-surface">{value}</p>
              <p className="text-xs text-on-surface-variant">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search tenant or apartment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            className="col-span-1 sm:col-span-2 lg:col-span-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="CHECKED_OUT">Checked Out</option>
          </select>

          {/* Building */}
          <select
            value={buildingIdFilter}
            onChange={(e) => setBuildingIdFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Buildings</option>
            {buildings?.map((b: { id: number; name: string }) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* From date */}
          <input
            type="date"
            value={fromFilter}
            onChange={(e) => setFromFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {/* To date */}
          <input
            type="date"
            value={toFilter}
            onChange={(e) => setToFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {/* Apply + Clear */}
          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={clearFilters}
              className="px-3 py-2 border border-outline-variant text-on-surface-variant rounded-lg text-sm hover:bg-surface-container transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-low rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container">
                <th className="text-left px-4 py-3 font-semibold text-on-surface-variant">Tenant</th>
                <th className="text-left px-4 py-3 font-semibold text-on-surface-variant">Apartment</th>
                <th className="text-left px-4 py-3 font-semibold text-on-surface-variant">Building</th>
                <th className="text-left px-4 py-3 font-semibold text-on-surface-variant">Check-in</th>
                <th className="text-left px-4 py-3 font-semibold text-on-surface-variant">Check-out</th>
                <th className="text-right px-4 py-3 font-semibold text-on-surface-variant">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-on-surface-variant">Deposit</th>
                <th className="text-left px-4 py-3 font-semibold text-on-surface-variant">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-on-surface-variant">
                    <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                  </td>
                </tr>
              )}
              {!isLoading && data?.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-on-surface-variant">
                    No bookings found.
                  </td>
                </tr>
              )}
              {!isLoading && data?.data.map((booking) => {
                const status = deriveStatus(booking);
                const statusBadge = STATUS_BADGE[status];
                const depositBadge = DEPOSIT_BADGE[booking.depositStatus];
                return (
                  <tr
                    key={booking.id}
                    onClick={() => setSelectedBookingId(booking.id)}
                    className="border-b border-outline-variant hover:bg-surface-container cursor-pointer transition-colors last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-on-surface">{booking.tenant.fullName}</td>
                    <td className="px-4 py-3 text-on-surface">{booking.apartment.number}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{booking.apartment.building.name}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{formatDate(booking.checkIn)}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{formatDate(booking.checkOut)}</td>
                    <td className="px-4 py-3 text-right font-mono text-on-surface">{formatAed(booking.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${depositBadge.classes}`}>
                        {depositBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.classes}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant">
            <p className="text-sm text-on-surface-variant">
              Showing {startRow}–{endRow} of {data.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-outline-variant text-sm text-on-surface disabled:opacity-40 hover:bg-surface-container transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-outline-variant text-sm text-on-surface disabled:opacity-40 hover:bg-surface-container transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice modal */}
      {selectedBookingId !== null && (
        <BookingInvoiceModal
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "D:/Hotel Apartment Management System/client"
npx tsc --noEmit 2>&1 | grep "BookingsPage" | head -10
```

Expected: no errors on `BookingsPage.tsx`.

- [ ] **Step 4: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add client/src/pages/bookings/BookingsPage.tsx
git commit -m "feat: add BookingsPage with stats, filters, table, and invoice modal"
```

---

### Task 4: Wire into router and sidebar

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add route to App.tsx**

Open `client/src/App.tsx`. Add the import at the top with the other page imports:

```typescript
import BookingsPage from './pages/bookings/BookingsPage';
```

Then add this route inside the nested `<Route>` block (after the apartments routes, before tenants):

```tsx
<Route
  path="bookings"
  element={
    <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
      <BookingsPage />
    </ProtectedRoute>
  }
/>
```

`ADMIN_RECEPTIONIST` is already defined in `App.tsx` as `[Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST]` — use that constant, don't redefine it.

- [ ] **Step 2: Add nav item to Sidebar**

Open `client/src/components/layout/Sidebar.tsx`. In the `NAV_ITEMS` array, add this entry after the apartments entry:

```typescript
{ to: '/bookings', icon: 'calendar_month', key: 'bookings', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
```

The `NAV_ITEMS` array after the change:

```typescript
const NAV_ITEMS = [
  { to: '/dashboard', icon: 'dashboard', key: 'dashboard', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: 'apartment', key: 'apartments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/bookings', icon: 'calendar_month', key: 'bookings', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/tenants', icon: 'groups', key: 'tenants', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/buildings', icon: 'business', key: 'buildings', roles: [Role.SUPER_ADMIN, Role.ADMIN] },
  { to: '/payments', icon: 'payments', key: 'payments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/tickets', icon: 'build', key: 'tickets', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE] },
  { to: '/reports', icon: 'assessment', key: 'reports', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE] },
  { to: '/users', icon: 'group', key: 'users', roles: [Role.SUPER_ADMIN, Role.ADMIN] },
];
```

- [ ] **Step 3: TypeScript check**

```bash
cd "D:/Hotel Apartment Management System/client"
npx tsc --noEmit 2>&1 | grep -E "App\.tsx|Sidebar" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add client/src/App.tsx client/src/components/layout/Sidebar.tsx
git commit -m "feat: wire BookingsPage into router and add Bookings sidebar nav item"
```
