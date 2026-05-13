# Dashboard (Sub-phase 3A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dashboard page with six clickable stat widgets (including today's revenue by payment method) and a live activity feed auto-refreshing every 30 seconds.

**Architecture:** Two new server endpoints (`GET /api/v1/dashboard/stats` and `GET /api/v1/dashboard/activity`) fetched in parallel by React Query hooks. The client renders a stat grid and activity feed panel; clicking a stat widget navigates to the corresponding filtered list page.

**Tech Stack:** Express + Prisma (server), React Query + React Router + Tailwind CSS MD3 tokens (client), Vitest + Supertest (server tests)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `server/src/controllers/dashboard.controller.ts` | Stats and activity query handlers |
| Create | `server/src/routes/dashboard.routes.ts` | Route registration with authMiddleware |
| Modify | `server/src/app.ts` | Register dashboard routes |
| Create | `server/src/controllers/dashboard.controller.test.ts` | Integration tests for both endpoints |
| Create | `client/src/hooks/useDashboard.ts` | React Query hooks for stats and activity |
| Create | `client/src/pages/dashboard/StatWidget.tsx` | Reusable clickable stat card |
| Create | `client/src/pages/dashboard/DashboardPage.tsx` | Page layout: stat grid + activity feed |
| Modify | `client/src/App.tsx` | Replace placeholder with DashboardPage |
| Modify | `client/src/pages/apartments/ApartmentsPage.tsx` | Read initial `status` filter from URL search params |

---

### Task 1: Server — Dashboard Controller and Routes

**Files:**
- Create: `server/src/controllers/dashboard.controller.ts`
- Create: `server/src/routes/dashboard.routes.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Create the dashboard controller**

Create `server/src/controllers/dashboard.controller.ts`:

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function stats(_req: AuthRequest, res: Response): Promise<void> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const [aptGroups, revenueGroups, pendingInstallments, openTickets] = await Promise.all([
    prisma.apartment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.groupBy({
      by: ['method'],
      where: { status: 'PAID', paidAt: { gte: startOfToday, lt: startOfTomorrow } },
      _sum: { amount: true },
    }),
    prisma.payment.count({ where: { method: 'INSTALLMENT', status: 'PENDING' } }),
    prisma.maintenanceTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  ]);

  const aptCounts = { total: 0, occupied: 0, available: 0, maintenance: 0 };
  for (const g of aptGroups) {
    aptCounts.total += g._count._all;
    if (g.status === 'OCCUPIED') aptCounts.occupied = g._count._all;
    if (g.status === 'AVAILABLE') aptCounts.available = g._count._all;
    if (g.status === 'MAINTENANCE') aptCounts.maintenance = g._count._all;
  }

  const rev = { cash: 0, card: 0, installment: 0 };
  for (const g of revenueGroups) {
    const amount = Number(g._sum.amount ?? 0);
    if (g.method === 'CASH') rev.cash = amount;
    if (g.method === 'CARD') rev.card = amount;
    if (g.method === 'INSTALLMENT') rev.installment = amount;
  }
  const revenueTotal = rev.cash + rev.card + rev.installment;

  res.json({
    apartments: aptCounts,
    revenue: { total: revenueTotal, cash: rev.cash, card: rev.card, installment: rev.installment },
    pendingInstallments,
    openTickets,
  });
}

export async function activity(_req: AuthRequest, res: Response): Promise<void> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const [checkIns, checkOuts, payments, tickets] = await Promise.all([
    prisma.booking.findMany({
      where: { checkIn: { gte: startOfToday, lt: startOfTomorrow } },
      include: { tenant: { select: { fullName: true } }, apartment: { select: { number: true } } },
      take: 20,
    }),
    prisma.booking.findMany({
      where: { checkOut: { gte: startOfToday, lt: startOfTomorrow } },
      include: { tenant: { select: { fullName: true } }, apartment: { select: { number: true } } },
      take: 20,
    }),
    prisma.payment.findMany({
      where: { status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      take: 20,
      include: { booking: { include: { tenant: { select: { fullName: true } } } } },
    }),
    prisma.maintenanceTicket.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { apartment: { select: { number: true } } },
    }),
  ]);

  type Event = { type: string; label: string; timestamp: Date };
  const events: Event[] = [];

  for (const b of checkIns) {
    events.push({ type: 'CHECK_IN', label: `${b.tenant.fullName} checked in to apt ${b.apartment.number}`, timestamp: b.checkIn });
  }
  for (const b of checkOuts) {
    events.push({ type: 'CHECK_OUT', label: `${b.tenant.fullName} checked out of apt ${b.apartment.number}`, timestamp: b.checkOut });
  }
  for (const p of payments) {
    if (p.paidAt) {
      events.push({ type: 'PAYMENT', label: `Payment of AED ${Number(p.amount).toFixed(0)} received from ${p.booking.tenant.fullName}`, timestamp: p.paidAt });
    }
  }
  for (const t of tickets) {
    const desc = t.description.length > 60 ? t.description.slice(0, 57) + '...' : t.description;
    events.push({ type: 'TICKET', label: `Ticket opened for apt ${t.apartment.number}: ${desc}`, timestamp: t.createdAt });
  }

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const top20 = events.slice(0, 20).map((e) => ({ ...e, timestamp: e.timestamp.toISOString() }));

  res.json({ events: top20 });
}
```

- [ ] **Step 2: Create the dashboard router**

Create `server/src/routes/dashboard.routes.ts`:

```typescript
import { Router } from 'express';
import { stats, activity } from '../controllers/dashboard.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/stats', stats);
router.get('/activity', activity);

export default router;
```

- [ ] **Step 3: Register the dashboard router in app.ts**

Open `server/src/app.ts`. The current file is:

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

Replace with:

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import apartmentsRoutes from './routes/apartments.routes';
import tenantsRoutes from './routes/tenants.routes';
import dashboardRoutes from './routes/dashboard.routes';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/apartments', apartmentsRoutes);
app.use('/api/v1/tenants', tenantsRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
```

- [ ] **Step 4: Verify TypeScript compiles**

Run from the `server` directory:

```bash
cd server && npx tsc --noEmit
```

Expected: no errors. If you see errors about Prisma types (e.g., `maintenanceTicket` not found), run `npx prisma generate` first.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/dashboard.controller.ts server/src/routes/dashboard.routes.ts server/src/app.ts
git commit -m "feat: add dashboard stats and activity server endpoints"
```

---

### Task 2: Server — Integration Tests

**Files:**
- Create: `server/src/controllers/dashboard.controller.test.ts`

**Context:** The server uses Vitest (`npm test` in the `server` directory) and Supertest. The JWT is signed with `process.env.JWT_SECRET ?? 'dev-secret'` and delivered as a `token` cookie. Tests hit the real database (configured via `DATABASE_URL` in `.env`). The seeded database has 12 apartments, 7 tenants, and 7 bookings with payments.

- [ ] **Step 1: Create the test file**

Create `server/src/controllers/dashboard.controller.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import { signToken } from '../lib/jwt';

const adminCookie = `token=${signToken({ id: 1, role: 'ADMIN' })}`;

describe('GET /api/v1/dashboard/stats', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('returns the correct response shape', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      apartments: {
        total: expect.any(Number),
        occupied: expect.any(Number),
        available: expect.any(Number),
        maintenance: expect.any(Number),
      },
      revenue: {
        total: expect.any(Number),
        cash: expect.any(Number),
        card: expect.any(Number),
        installment: expect.any(Number),
      },
      pendingInstallments: expect.any(Number),
      openTickets: expect.any(Number),
    });
  });

  it('apartment total equals sum of all status counts', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Cookie', adminCookie);

    const { apartments } = res.body as {
      apartments: { total: number; occupied: number; available: number; maintenance: number };
    };
    expect(apartments.total).toBeGreaterThanOrEqual(
      apartments.occupied + apartments.available + apartments.maintenance
    );
  });

  it('revenue total equals sum of cash + card + installment', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Cookie', adminCookie);

    const { revenue } = res.body as {
      revenue: { total: number; cash: number; card: number; installment: number };
    };
    expect(revenue.total).toBeCloseTo(revenue.cash + revenue.card + revenue.installment, 2);
  });
});

describe('GET /api/v1/dashboard/activity', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/dashboard/activity');
    expect(res.status).toBe(401);
  });

  it('returns events array with correct shape', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/activity')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeLessThanOrEqual(20);
  });

  it('each event has type, label, and timestamp', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/activity')
      .set('Cookie', adminCookie);

    for (const event of res.body.events) {
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('label');
      expect(event).toHaveProperty('timestamp');
      expect(['CHECK_IN', 'CHECK_OUT', 'PAYMENT', 'TICKET']).toContain(event.type);
      expect(typeof event.label).toBe('string');
      expect(typeof event.timestamp).toBe('string');
    }
  });

  it('events are sorted newest-first', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/activity')
      .set('Cookie', adminCookie);

    const events = res.body.events as { timestamp: string }[];
    for (let i = 0; i < events.length - 1; i++) {
      expect(new Date(events[i].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(events[i + 1].timestamp).getTime()
      );
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run from the project root:

```bash
cd server && npm test
```

Expected output: all tests pass. If a test fails with a database connection error, ensure the server's `.env` file has a valid `DATABASE_URL` and the database is running.

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/dashboard.controller.test.ts
git commit -m "test: add integration tests for dashboard endpoints"
```

---

### Task 3: Client — useDashboard Hook

**Files:**
- Create: `client/src/hooks/useDashboard.ts`

**Context:** The axios instance at `client/src/lib/axios.ts` has `baseURL: '/api/v1'` and `withCredentials: true`. Follow the same pattern as `useApartments` in `client/src/hooks/useApartments.ts` — use `useQuery` from `@tanstack/react-query` and call `api.get(...)`.

- [ ] **Step 1: Create the hook file**

Create `client/src/hooks/useDashboard.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface DashboardStats {
  apartments: { total: number; occupied: number; available: number; maintenance: number };
  revenue: { total: number; cash: number; card: number; installment: number };
  pendingInstallments: number;
  openTickets: number;
}

export interface ActivityEvent {
  type: 'CHECK_IN' | 'CHECK_OUT' | 'PAYMENT' | 'TICKET';
  label: string;
  timestamp: string;
}

export interface DashboardActivity {
  events: ActivityEvent[];
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const res = await api.get('/dashboard/stats');
      return res.data;
    },
    retry: 1,
  });
}

export function useDashboardActivity() {
  return useQuery<DashboardActivity>({
    queryKey: ['dashboard', 'activity'],
    queryFn: async () => {
      const res = await api.get('/dashboard/activity');
      return res.data;
    },
    retry: 1,
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 2: Verify TypeScript**

Run from the `client` directory:

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useDashboard.ts
git commit -m "feat: add useDashboard React Query hooks"
```

---

### Task 4: Client — StatWidget Component

**Files:**
- Create: `client/src/pages/dashboard/StatWidget.tsx`

**Context:** The project uses Tailwind CSS with MD3 custom tokens. Key tokens: `text-on-surface`, `text-on-surface-variant`, `bg-surface-container`, `text-primary`, `rounded-xl`, spacing tokens (`p-container-padding`, `gap-widget-gap`, `space-y-stack-tight`), font tokens (`text-display-lg`, `text-body-sm`, `text-label-caps`). Material Symbols are loaded globally — render icons as `<span className="material-symbols-outlined">icon_name</span>`.

- [ ] **Step 1: Create the StatWidget component**

Create `client/src/pages/dashboard/StatWidget.tsx`:

```tsx
interface SubRow {
  label: string;
  value: string | number;
}

interface StatWidgetProps {
  icon: string;
  label: string;
  value: string | number;
  subRows?: SubRow[];
  onClick?: () => void;
  loading?: boolean;
}

export default function StatWidget({ icon, label, value, subRows, onClick, loading }: StatWidgetProps) {
  const Tag = onClick ? 'button' : 'div';

  if (loading) {
    return (
      <div className="bg-surface-container rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-on-surface/10 rounded w-1/2 mb-3" />
        <div className="h-8 bg-on-surface/10 rounded w-1/3 mb-2" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 bg-on-surface/10 rounded w-2/3 mt-2" />
        ))}
      </div>
    );
  }

  return (
    <Tag
      className={[
        'bg-surface-container rounded-xl p-6 text-start w-full',
        onClick ? 'hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary transition-colors cursor-pointer' : '',
      ].join(' ')}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
        <span className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-display-lg font-bold text-on-surface mt-1">{value}</div>
      {subRows && subRows.length > 0 && (
        <div className="mt-3 space-y-stack-tight border-t border-outline-variant pt-3">
          {subRows.map((row) => (
            <div key={row.label} className="flex justify-between text-body-sm text-on-surface-variant">
              <span>{row.label}</span>
              <span className="font-medium text-on-surface">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </Tag>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/dashboard/StatWidget.tsx
git commit -m "feat: add StatWidget component for dashboard"
```

---

### Task 5: Client — DashboardPage, App.tsx Wiring, and ApartmentsPage URL Params

**Files:**
- Create: `client/src/pages/dashboard/DashboardPage.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/apartments/ApartmentsPage.tsx`

**Context:**
- `useNavigate` and `useSearchParams` are from `react-router-dom`
- `ApartmentsPage` currently initialises `statusFilter` / `appliedStatus` from local `useState('')`. The Dashboard will navigate to `/apartments?status=OCCUPIED` etc., so ApartmentsPage needs to read the initial value from URL search params.
- The activity feed uses relative timestamps: events within the last hour show "X min ago", within 24 hours show "X hr ago", older show the date.

- [ ] **Step 1: Create DashboardPage**

Create `client/src/pages/dashboard/DashboardPage.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardStats, useDashboardActivity } from '../../hooks/useDashboard';
import type { ActivityEvent } from '../../hooks/useDashboard';
import StatWidget from './StatWidget';

function formatAed(amount: number): string {
  return `AED ${amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

const EVENT_ICON: Record<ActivityEvent['type'], string> = {
  CHECK_IN: 'login',
  CHECK_OUT: 'logout',
  PAYMENT: 'payments',
  TICKET: 'build',
};

const EVENT_COLOR: Record<ActivityEvent['type'], string> = {
  CHECK_IN: 'text-blue-500',
  CHECK_OUT: 'text-amber-500',
  PAYMENT: 'text-green-500',
  TICKET: 'text-red-500',
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useDashboardStats();
  const { data: activityData, isLoading: activityLoading, isError: activityError } = useDashboardActivity();

  return (
    <div className="space-y-widget-gap">
      {/* Page Header */}
      <div>
        <h1 className="text-headline-md font-bold text-on-surface">{t('nav.dashboard', 'Dashboard')}</h1>
      </div>

      {/* Stat Widgets */}
      {statsError ? (
        <div className="text-error text-body-base">Failed to load stats. Please refresh.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-widget-gap">
          <StatWidget
            icon="apartment"
            label="Total Apartments"
            value={stats?.apartments.total ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/apartments')}
          />
          <StatWidget
            icon="meeting_room"
            label="Occupied"
            value={stats?.apartments.occupied ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/apartments?status=OCCUPIED')}
          />
          <StatWidget
            icon="check_circle"
            label="Available"
            value={stats?.apartments.available ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/apartments?status=AVAILABLE')}
          />
          <StatWidget
            icon="payments"
            label="Today's Revenue"
            value={stats ? formatAed(stats.revenue.total) : '—'}
            loading={statsLoading}
            subRows={stats ? [
              { label: 'Cash', value: formatAed(stats.revenue.cash) },
              { label: 'Card', value: formatAed(stats.revenue.card) },
              { label: 'Installment', value: formatAed(stats.revenue.installment) },
            ] : undefined}
            onClick={() => navigate('/payments')}
          />
          <StatWidget
            icon="schedule"
            label="Pending Installments"
            value={stats?.pendingInstallments ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/payments?status=PENDING&method=INSTALLMENT')}
          />
          <StatWidget
            icon="build"
            label="Open Tickets"
            value={stats?.openTickets ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/tickets?status=OPEN')}
          />
        </div>
      )}

      {/* Activity Feed */}
      <div className="bg-surface-container rounded-xl p-6">
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">Recent Activity</h2>

        {activityError && (
          <p className="text-error text-body-base">Failed to load activity.</p>
        )}

        {activityLoading && !activityError && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-5 h-5 rounded-full bg-on-surface/10 shrink-0" />
                <div className="flex-1 h-4 bg-on-surface/10 rounded" />
                <div className="w-16 h-3 bg-on-surface/10 rounded" />
              </div>
            ))}
          </div>
        )}

        {!activityLoading && !activityError && activityData?.events.length === 0 && (
          <p className="text-on-surface-variant text-body-base">No recent activity.</p>
        )}

        {!activityLoading && !activityError && activityData && activityData.events.length > 0 && (
          <ul className="space-y-3">
            {activityData.events.map((event, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${EVENT_COLOR[event.type]}`}>
                  {EVENT_ICON[event.type]}
                </span>
                <span className="flex-1 text-body-base text-on-surface">{event.label}</span>
                <span className="text-body-sm text-on-surface-variant whitespace-nowrap">{relativeTime(event.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to use DashboardPage**

Open `client/src/App.tsx`. Replace the dashboard route's element from the placeholder to `<DashboardPage />`.

Add the import at the top (after the existing imports):

```tsx
import DashboardPage from './pages/dashboard/DashboardPage';
```

Replace the dashboard route element:

```tsx
// Before:
<Route
  path="dashboard"
  element={
    <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
      <div className="text-on-surface font-semibold p-4">Dashboard — coming in Phase 5</div>
    </ProtectedRoute>
  }
/>

// After:
<Route
  path="dashboard"
  element={
    <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
      <DashboardPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Update ApartmentsPage to read initial status from URL params**

Open `client/src/pages/apartments/ApartmentsPage.tsx`. Add `useSearchParams` to the react-router-dom import:

```tsx
// Before:
import { Link } from 'react-router-dom';

// After:
import { Link, useSearchParams } from 'react-router-dom';
```

Add `useSearchParams` inside the component (right after the `useTranslation` line), and initialise `statusFilter` and `appliedStatus` from URL params:

```tsx
// Add after:  const { t } = useTranslation();
const [searchParams] = useSearchParams();
const initialStatus = (searchParams.get('status') as ApartmentStatus | null) ?? '';
```

Then change the two `useState` initialisations for status from `''` to `initialStatus`:

```tsx
// Before:
const [statusFilter, setStatusFilter] = useState<ApartmentStatus | ''>('');
// ...
const [appliedStatus, setAppliedStatus] = useState<ApartmentStatus | ''>('');

// After:
const [statusFilter, setStatusFilter] = useState<ApartmentStatus | ''>(initialStatus);
// ...
const [appliedStatus, setAppliedStatus] = useState<ApartmentStatus | ''>(initialStatus);
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/dashboard/DashboardPage.tsx client/src/App.tsx client/src/pages/apartments/ApartmentsPage.tsx
git commit -m "feat: add Dashboard page with stat widgets and activity feed"
```

---

## Manual Test Checklist

After all tasks complete, verify in the browser (dev servers running):

- [ ] Navigating to `/` redirects to `/dashboard` and the Dashboard page renders
- [ ] All 6 stat widgets display with non-zero values from seeded data
- [ ] Today's Revenue widget shows three sub-rows (Cash / Card / Installment)
- [ ] Clicking "Occupied" navigates to `/apartments` with the status filter pre-set to OCCUPIED
- [ ] Clicking "Available" navigates to `/apartments` with the status filter pre-set to AVAILABLE
- [ ] Clicking "Today's Revenue" navigates to `/payments`
- [ ] Activity feed shows at least some events from seeded data
- [ ] Network tab shows `/api/v1/dashboard/activity` refetching every ~30 seconds
- [ ] When toggling language to Arabic (RTL), the grid and activity feed still render correctly (no clipping)
- [ ] Disconnecting the backend and reloading shows inline error states, not a blank page
