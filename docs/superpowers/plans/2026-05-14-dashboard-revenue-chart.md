# Dashboard Revenue Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable 7-day / 30-day revenue area chart to the Dashboard, replacing the flat "Today's Revenue" stat card.

**Architecture:** New `GET /dashboard/revenue-trend?days=7|30` endpoint aggregates paid payments by calendar day and fills zero-revenue days server-side. Client adds `useRevenueTrend(days)` to `useDashboard.ts` and a self-contained `RevenueChart` component (owns toggle state, uses Recharts AreaChart). `DashboardPage.tsx` swaps the revenue StatWidget for `<RevenueChart />`.

**Tech Stack:** Express + Prisma, TypeScript, React Query, Recharts v2, Tailwind MD3 CSS variables.

---

## File Map

**Modify (server):**
- `server/src/controllers/dashboard.controller.ts` — add `revenueTrend` export
- `server/src/routes/dashboard.routes.ts` — register `GET /revenue-trend`

**Modify (client):**
- `client/src/hooks/useDashboard.ts` — add `RevenueTrendPoint` interface + `useRevenueTrend` hook

**Create (client):**
- `client/src/pages/dashboard/RevenueChart.tsx` — area chart with 7D/30D toggle

**Modify (client):**
- `client/src/pages/dashboard/DashboardPage.tsx` — replace revenue StatWidget with `<RevenueChart />`

---

### Task 1: Server — `revenueTrend` handler + route registration

**Files:**
- Modify: `server/src/controllers/dashboard.controller.ts`
- Modify: `server/src/routes/dashboard.routes.ts`

- [ ] **Step 1: Add `revenueTrend` to `server/src/controllers/dashboard.controller.ts`**

Append this export at the bottom of the file (after the existing `activity` function):

```typescript
export async function revenueTrend(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { days: daysParam } = req.query as { days?: string };
    if (daysParam !== '7' && daysParam !== '30') {
      res.status(400).json({ message: 'days must be 7 or 30' });
      return;
    }
    const days = Number(daysParam);

    // Start date: (days - 1) days ago, midnight UTC
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(0, 0, 0, 0);

    const payments = await prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: startDate } },
      select: { paidAt: true, amount: true },
    });

    // Aggregate by UTC date string
    const revenueMap: Record<string, number> = {};
    for (const p of payments) {
      if (!p.paidAt) continue;
      const dateStr = p.paidAt.toISOString().split('T')[0];
      revenueMap[dateStr] = (revenueMap[dateStr] ?? 0) + Number(p.amount);
    }

    // Build result array oldest → newest, filling zeros
    const result: { date: string; revenue: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      result.push({ date: dateStr, revenue: revenueMap[dateStr] ?? 0 });
    }

    res.json(result);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Register the route in `server/src/routes/dashboard.routes.ts`**

Change the file to:

```typescript
import { Router } from 'express';
import { stats, activity, revenueTrend } from '../controllers/dashboard.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/stats', stats);
router.get('/activity', activity);
router.get('/revenue-trend', revenueTrend);

export default router;
```

- [ ] **Step 3: TypeScript check**

```bash
cd "D:\Hotel Apartment Management System\server" && npx tsc --noEmit
```

Expected: only the pre-existing `rootDir` warning about `@hotel/shared`. No new errors.

- [ ] **Step 4: Commit**

```bash
cd "D:\Hotel Apartment Management System" && git add server/src/controllers/dashboard.controller.ts server/src/routes/dashboard.routes.ts && git commit -m "feat: add revenue-trend endpoint to dashboard controller"
```

---

### Task 2: Server integration tests

**Files:**
- Create: `server/src/controllers/dashboard.controller.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminCookie: string;
let aptId: number;
let tenantId: number;
let bookingId: number;

beforeAll(async () => {
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.apartment.deleteMany({ where: { number: 'DASH-RT-101' } });
  await testPrisma.tenant.deleteMany({ where: { idNumber: 'DASH-RT-ID-001' } });
  await testPrisma.user.deleteMany({ where: { email: 'admin-dash@test.com' } });

  const admin = await testPrisma.user.create({
    data: { name: 'Admin Dash', email: 'admin-dash@test.com', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN' })}`;

  const apt = await testPrisma.apartment.create({
    data: { number: 'DASH-RT-101', floor: 1, type: 'STUDIO', status: 'OCCUPIED' },
  });
  aptId = apt.id;

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Dash Test Tenant', phone: '0501234500', idNumber: 'DASH-RT-ID-001' },
  });
  tenantId = tenant.id;

  const booking = await testPrisma.booking.create({
    data: {
      apartmentId: aptId,
      tenantId,
      checkIn: new Date(),
      checkOut: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      totalAmount: 10000,
    },
  });
  bookingId = booking.id;

  // Create 2 PAID payments today and 1 PENDING (should not be counted)
  const today = new Date();
  await testPrisma.payment.createMany({
    data: [
      { bookingId, method: 'CASH', amount: 3000, status: 'PAID', paidAt: today },
      { bookingId, method: 'CARD', amount: 2000, status: 'PAID', paidAt: today },
      { bookingId, method: 'INSTALLMENT', amount: 1000, status: 'PENDING', paidAt: null },
    ],
  });
});

afterAll(async () => {
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.apartment.deleteMany({ where: { number: 'DASH-RT-101' } });
  await testPrisma.tenant.deleteMany({ where: { idNumber: 'DASH-RT-ID-001' } });
  await testPrisma.user.deleteMany({ where: { email: 'admin-dash@test.com' } });
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/dashboard/revenue-trend', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/dashboard/revenue-trend?days=7');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid days param', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=invalid')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('returns 400 when days param is missing', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('returns 7 entries for days=7', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=7')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toHaveProperty('date');
    expect(res.body[0]).toHaveProperty('revenue');
  });

  it('returns 30 entries for days=30', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=30')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(30);
  });

  it('sums only PAID payments (not PENDING) in todays entry', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=7')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntry = res.body.find((e: { date: string }) => e.date === todayStr);
    expect(todayEntry).toBeDefined();
    // 3000 + 2000 = 5000 (PENDING 1000 must be excluded)
    expect(todayEntry.revenue).toBe(5000);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd "D:\Hotel Apartment Management System\server" && npx vitest run src/controllers/dashboard.controller.test.ts
```

Expected: 5 tests pass. If DB is unreachable (`PrismaClientInitializationError`) that is a pre-existing environment issue — commit anyway. If any test fails due to wrong status codes, fix the controller (not the test) and re-run.

- [ ] **Step 3: Commit**

```bash
cd "D:\Hotel Apartment Management System" && git add server/src/controllers/dashboard.controller.test.ts && git commit -m "test: add dashboard revenue-trend integration tests"
```

---

### Task 3: Client — hook + RevenueChart component

**Files:**
- Modify: `client/src/hooks/useDashboard.ts`
- Create: `client/src/pages/dashboard/RevenueChart.tsx`

- [ ] **Step 1: Add `useRevenueTrend` to `client/src/hooks/useDashboard.ts`**

Append at the bottom of the file:

```typescript
export interface RevenueTrendPoint {
  date: string;    // "YYYY-MM-DD"
  revenue: number;
}

export function useRevenueTrend(days: 7 | 30) {
  return useQuery<RevenueTrendPoint[]>({
    queryKey: ['dashboard', 'revenue-trend', days],
    queryFn: async () => {
      const res = await api.get(`/dashboard/revenue-trend?days=${days}`);
      return res.data;
    },
    retry: 1,
  });
}
```

- [ ] **Step 2: Create `client/src/pages/dashboard/RevenueChart.tsx`**

```tsx
import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useRevenueTrend } from '../../hooks/useDashboard';

function formatAxisDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

function formatAed(value: number): string {
  return `AED ${value.toLocaleString('en')}`;
}

function formatYAxis(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return String(value);
}

export default function RevenueChart() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading } = useRevenueTrend(days);

  const chartData = (data ?? []).map((d) => ({
    date: formatAxisDate(d.date),
    revenue: d.revenue,
  }));

  return (
    <div className="bg-surface-container rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
          <span className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">
            Revenue Trend
          </span>
        </div>
        <div className="flex gap-1">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                days === d
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-[200px] bg-surface-container-high animate-pulse rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              formatter={(value: number) => [formatAed(value), 'Revenue']}
              contentStyle={{
                background: 'var(--color-surface-container-lowest)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-primary)"
              fill="url(#revenueGradient)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "D:\Hotel Apartment Management System\client" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "D:\Hotel Apartment Management System" && git add client/src/hooks/useDashboard.ts client/src/pages/dashboard/RevenueChart.tsx && git commit -m "feat: add useRevenueTrend hook and RevenueChart component"
```

---

### Task 4: DashboardPage — swap revenue StatWidget for RevenueChart

**Files:**
- Modify: `client/src/pages/dashboard/DashboardPage.tsx`

- [ ] **Step 1: Update `DashboardPage.tsx`**

The current second row has 3 StatWidgets: Today's Revenue, Pending Installments, Open Tickets. Remove the Today's Revenue widget and replace it with `<RevenueChart />`.

Replace the entire file content with:

```tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardStats, useDashboardActivity } from '../../hooks/useDashboard';
import type { ActivityEvent } from '../../hooks/useDashboard';
import StatWidget from './StatWidget';
import RevenueChart from './RevenueChart';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
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

      {/* Row 1: Apartment stat widgets */}
      {statsError ? (
        <div className="text-error text-body-base">Failed to load stats. Please refresh.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-widget-gap">
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
        </div>
      )}

      {/* Row 2: Revenue chart + 2 stat widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-widget-gap">
        <RevenueChart />
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
              <li key={`${event.type}-${event.timestamp}-${i}`} className="flex items-start gap-3">
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

- [ ] **Step 2: TypeScript check**

```bash
cd "D:\Hotel Apartment Management System\client" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "D:\Hotel Apartment Management System" && git add client/src/pages/dashboard/DashboardPage.tsx && git commit -m "feat: replace revenue StatWidget with RevenueChart on DashboardPage"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `GET /dashboard/revenue-trend?days=7|30` endpoint with 400 for invalid days
- ✅ Zero-fill for missing days
- ✅ Only PAID payments counted
- ✅ `useRevenueTrend(days)` hook with keyed cache
- ✅ RevenueChart with 7D/30D toggle buttons
- ✅ Recharts AreaChart with XAxis, YAxis, Tooltip, Area (CSS var stroke/fill)
- ✅ Loading skeleton
- ✅ DashboardPage: revenue StatWidget removed, RevenueChart in second row
- ✅ Pending Installments and Open Tickets remain alongside chart

**Type consistency:** `RevenueTrendPoint` defined in Task 3 Step 1, consumed in Task 3 Step 2. `useRevenueTrend` defined in Task 3, imported in Task 3 Step 2 and Task 4. ✅
