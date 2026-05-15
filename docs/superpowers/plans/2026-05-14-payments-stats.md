# Payments Stats + Installment Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four KPI stat cards and an Installment Tracker section to PaymentsPage, backed by two new server endpoints (`/payments/stats` and `/payments/installment-plans`).

**Architecture:** Two new handlers (`stats`, `installmentPlans`) are added to the existing `payments.controller.ts`, new routes are registered before `/:id` in `payments.routes.ts`, two new React Query hooks and types are appended to `usePayments.ts`, a standalone `InstallmentTracker` component is created, and `PaymentsPage.tsx` is updated to render the cards and tracker.

**Tech Stack:** Express + Prisma (groupBy + aggregate), TypeScript, React Query, Tailwind MD3 tokens, Material Symbols Outlined

---

## File Map

| Action | File |
|--------|------|
| Modify | `server/src/controllers/payments.controller.ts` |
| Modify | `server/src/routes/payments.routes.ts` |
| Modify | `server/src/controllers/payments.controller.test.ts` |
| Modify | `client/src/hooks/usePayments.ts` |
| Create | `client/src/pages/payments/InstallmentTracker.tsx` |
| Modify | `client/src/pages/payments/PaymentsPage.tsx` |

---

### Task 1: Server — `stats` and `installmentPlans` handlers + routes

**Files:**
- Modify: `server/src/controllers/payments.controller.ts`
- Modify: `server/src/routes/payments.routes.ts`

- [ ] **Step 1: Add `stats` and `installmentPlans` to the controller**

Append both exports to the bottom of `server/src/controllers/payments.controller.ts` (after `markPaid`). The import line at the top already has `PaymentMethod` and `PaymentStatus` — no changes needed there.

```typescript
export async function stats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [monthlyResult, pendingResult, allPaidResult] = await Promise.all([
      prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID, paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: PaymentStatus.PENDING },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID },
        _sum: { amount: true },
      }),
    ]);

    const monthlyRevenue = Number(monthlyResult._sum.amount ?? 0);
    const outstandingBalance = Number(pendingResult._sum.amount ?? 0);
    const allPaid = Number(allPaidResult._sum.amount ?? 0);

    const collectionRate =
      allPaid + outstandingBalance === 0
        ? 100.0
        : Math.round((allPaid / (allPaid + outstandingBalance)) * 1000) / 10;

    const installmentGroups = await prisma.payment.groupBy({
      by: ['bookingId'],
      where: { method: PaymentMethod.INSTALLMENT, status: PaymentStatus.PAID },
      _sum: { amount: true },
    });

    let activePlans = 0;
    if (installmentGroups.length > 0) {
      const bookingIds = installmentGroups.map((g) => g.bookingId);
      const bookings = await prisma.booking.findMany({
        where: { id: { in: bookingIds } },
        select: { id: true, totalAmount: true },
      });
      const totalMap = new Map(bookings.map((b) => [b.id, Number(b.totalAmount)]));
      for (const g of installmentGroups) {
        const paidSum = Number(g._sum.amount ?? 0);
        if (paidSum < (totalMap.get(g.bookingId) ?? 0)) activePlans++;
      }
    }

    res.json({ monthlyRevenue, outstandingBalance, activePlans, collectionRate });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function installmentPlans(req: AuthRequest, res: Response): Promise<void> {
  try {
    const groups = await prisma.payment.groupBy({
      by: ['bookingId'],
      where: { method: PaymentMethod.INSTALLMENT, status: PaymentStatus.PAID },
      _sum: { amount: true },
    });

    if (groups.length === 0) {
      res.json([]);
      return;
    }

    const bookingIds = groups.map((g) => g.bookingId);
    const bookings = await prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      include: {
        tenant: { select: { fullName: true } },
        apartment: { select: { number: true } },
      },
    });

    const paidMap = new Map(groups.map((g) => [g.bookingId, Number(g._sum.amount ?? 0)]));

    const active = bookings
      .filter((b) => (paidMap.get(b.id) ?? 0) < Number(b.totalAmount))
      .map((b) => ({
        bookingId: b.id,
        tenantName: b.tenant.fullName,
        apartmentNumber: b.apartment.number,
        totalAmount: String(b.totalAmount),
        paidAmount: String(paidMap.get(b.id) ?? 0),
        checkIn: b.checkIn.toISOString(),
        checkOut: b.checkOut.toISOString(),
      }))
      .sort(
        (a, b) =>
          Number(a.paidAmount) / Number(a.totalAmount) -
          Number(b.paidAmount) / Number(b.totalAmount),
      );

    res.json(active);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Register routes before `/:id`**

Replace `server/src/routes/payments.routes.ts` content entirely:

```typescript
import { Router } from 'express';
import { list, create, markPaid, stats, installmentPlans } from '../controllers/payments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();

router.use(authMiddleware);

// Static routes first — must come before /:id to avoid param collision
router.get('/stats', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE), stats);
router.get('/installment-plans', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE), installmentPlans);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.patch('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), markPaid);

export default router;
```

- [ ] **Step 3: Build the server to confirm no TypeScript errors**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/payments.controller.ts server/src/routes/payments.routes.ts
git commit -m "feat: add payments stats and installment-plans endpoints"
```

---

### Task 2: Server integration tests for `/stats` and `/installment-plans`

**Files:**
- Modify: `server/src/controllers/payments.controller.test.ts`

The existing file already has a global seed: 1 PAID CARD payment (amount 5000, `paidAt` = now), 1 PENDING INSTALLMENT payment (amount 3000), booking with `totalAmount` 10000.

- [ ] **Step 1: Add `stats` tests at the bottom of `payments.controller.test.ts`**

Append to the end of the file:

```typescript
describe('GET /api/v1/payments/stats', () => {
  // Global seed: 1 PAID CARD (5000, paidAt=now), 1 PENDING INSTALLMENT (3000)
  // Expected: monthlyRevenue=5000, outstandingBalance=3000, activePlans=0, collectionRate=62.5

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/payments/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 for MAINTENANCE role', async () => {
    const maintenanceCookie = `token=${signToken({ id: 9, role: 'MAINTENANCE' })}`;
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', maintenanceCookie);
    expect(res.status).toBe(403);
  });

  it('monthlyRevenue includes only PAID payments within the current month', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    // Seed has 1 PAID CARD payment of 5000 with paidAt=now (current month)
    expect(res.body.monthlyRevenue).toBe(5000);
  });

  it('outstandingBalance counts only PENDING payments', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    // Seed has 1 PENDING INSTALLMENT of 3000
    expect(res.body.outstandingBalance).toBe(3000);
  });

  it('activePlans is 0 when no PAID installment payments exist', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    // Seed installment payment is PENDING, not PAID
    expect(res.body.activePlans).toBe(0);
  });

  it('activePlans counts bookings with partial paid installment sum', async () => {
    // Create a PAID INSTALLMENT payment for the seed booking (totalAmount=10000, paidSum will be 4000 < 10000)
    const partial = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 4000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/stats')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.activePlans).toBeGreaterThanOrEqual(1);
    } finally {
      await testPrisma.payment.delete({ where: { id: partial.id } });
    }
  });

  it('collectionRate = 100.0 when no pending payments exist', async () => {
    // Temporarily remove all payments, create one PAID payment, verify rate = 100.0
    const allPayments = await testPrisma.payment.findMany();
    await testPrisma.payment.deleteMany();
    const sole = await testPrisma.payment.create({
      data: { bookingId, method: 'CASH', amount: 2000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/stats')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.collectionRate).toBe(100.0);
    } finally {
      await testPrisma.payment.delete({ where: { id: sole.id } });
      // Restore original payments (recreate without ids)
      for (const p of allPayments) {
        await testPrisma.payment.create({
          data: {
            bookingId: p.bookingId,
            method: p.method,
            amount: p.amount,
            status: p.status,
            referenceNumber: p.referenceNumber,
            paidAt: p.paidAt,
          },
        });
      }
    }
  });
});

describe('GET /api/v1/payments/installment-plans', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/payments/installment-plans');
    expect(res.status).toBe(401);
  });

  it('returns empty array when no PAID installment payments exist', async () => {
    // Global seed installment payment is PENDING — so no PAID installment payments
    const res = await request(app)
      .get('/api/v1/payments/installment-plans')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns active plans (paidAmount < totalAmount)', async () => {
    // Create a PAID INSTALLMENT payment — booking totalAmount=10000, paid=4000 → active
    const partial = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 4000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/installment-plans')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const plan = res.body[0];
      expect(plan).toHaveProperty('bookingId');
      expect(plan).toHaveProperty('tenantName');
      expect(plan).toHaveProperty('apartmentNumber');
      expect(plan).toHaveProperty('totalAmount');
      expect(plan).toHaveProperty('paidAmount');
      expect(plan).toHaveProperty('checkIn');
      expect(plan).toHaveProperty('checkOut');
      expect(Number(plan.paidAmount)).toBeLessThan(Number(plan.totalAmount));
    } finally {
      await testPrisma.payment.delete({ where: { id: partial.id } });
    }
  });

  it('excludes fully paid installment bookings', async () => {
    // Pay the full totalAmount (10000) via INSTALLMENT — should not appear in results
    const full = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 10000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/installment-plans')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      const plan = res.body.find((p: { bookingId: number }) => p.bookingId === bookingId);
      expect(plan).toBeUndefined();
    } finally {
      await testPrisma.payment.delete({ where: { id: full.id } });
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they pass (or fail for the right reason)**

```bash
cd server && npx vitest run src/controllers/payments.controller.test.ts
```

Expected: all tests pass (if DB is reachable) or all fail with `PrismaClientInitializationError` (pre-existing env constraint — acceptable).

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/payments.controller.test.ts
git commit -m "test: add integration tests for payments stats and installment-plans endpoints"
```

---

### Task 3: Client hooks + `InstallmentTracker` component

**Files:**
- Modify: `client/src/hooks/usePayments.ts`
- Create: `client/src/pages/payments/InstallmentTracker.tsx`

- [ ] **Step 1: Add types and hooks to `usePayments.ts`**

Append to the bottom of `client/src/hooks/usePayments.ts`:

```typescript
export interface PaymentStats {
  monthlyRevenue: number;
  outstandingBalance: number;
  activePlans: number;
  collectionRate: number;
}

export interface InstallmentPlan {
  bookingId: number;
  tenantName: string;
  apartmentNumber: string;
  totalAmount: string;
  paidAmount: string;
  checkIn: string;
  checkOut: string;
}

export function usePaymentStats() {
  return useQuery<PaymentStats>({
    queryKey: ['payments', 'stats'],
    queryFn: async () => {
      const res = await api.get('/payments/stats');
      return res.data;
    },
  });
}

export function useInstallmentPlans() {
  return useQuery<InstallmentPlan[]>({
    queryKey: ['payments', 'installment-plans'],
    queryFn: async () => {
      const res = await api.get('/payments/installment-plans');
      return res.data;
    },
  });
}
```

- [ ] **Step 2: Create `InstallmentTracker.tsx`**

Create `client/src/pages/payments/InstallmentTracker.tsx`:

```tsx
import { useInstallmentPlans } from '../../hooks/usePayments';
import type { InstallmentPlan } from '../../hooks/usePayments';

function formatAed(amount: string): string {
  return `AED ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

function PlanCard({ plan }: { plan: InstallmentPlan }) {
  const paidNum = Number(plan.paidAmount);
  const totalNum = Number(plan.totalAmount);
  const percent = totalNum > 0 ? Math.min(100, (paidNum / totalNum) * 100) : 0;

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-on-surface text-body-base">{plan.tenantName}</span>
        <span className="bg-on-surface text-surface text-xs font-bold px-2 py-0.5 rounded-full">
          Apt {plan.apartmentNumber}
        </span>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        {formatDate(plan.checkIn)} – {formatDate(plan.checkOut)}
      </p>
      <div className="w-full bg-surface-container-high rounded-full h-2">
        <div
          className="bg-primary rounded-full h-2 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-body-sm text-on-surface-variant">
        {formatAed(plan.paidAmount)} paid of {formatAed(plan.totalAmount)}
      </p>
    </div>
  );
}

export default function InstallmentTracker() {
  const { data: plans, isLoading } = useInstallmentPlans();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">
          Installment Plans
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-container-low border border-outline-variant rounded-xl p-4 animate-pulse h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">
          Installment Plans
        </h3>
        {plans && plans.length > 0 && (
          <span className="bg-primary text-on-primary text-xs font-bold px-2 py-0.5 rounded-full">
            {plans.length}
          </span>
        )}
      </div>
      {!plans || plans.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">No active installment plans.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.bookingId} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/usePayments.ts client/src/pages/payments/InstallmentTracker.tsx
git commit -m "feat: add usePaymentStats, useInstallmentPlans hooks and InstallmentTracker component"
```

---

### Task 4: Update `PaymentsPage.tsx` with KPI cards and tracker

**Files:**
- Modify: `client/src/pages/payments/PaymentsPage.tsx`

- [ ] **Step 1: Add imports at the top of `PaymentsPage.tsx`**

The existing import line for `usePayments`:
```typescript
import { usePayments, useMarkPaid } from '../../hooks/usePayments';
import type { PaymentListItem } from '../../hooks/usePayments';
```

Replace with:
```typescript
import { usePayments, useMarkPaid, usePaymentStats } from '../../hooks/usePayments';
import type { PaymentListItem } from '../../hooks/usePayments';
import InstallmentTracker from './InstallmentTracker';
import StatWidget from '../dashboard/StatWidget';
```

- [ ] **Step 2: Call `usePaymentStats` inside the component**

Inside `PaymentsPage`, after the existing hook calls (`const markPaid = useMarkPaid();`), add:

```typescript
const { data: statsData, isLoading: statsLoading } = usePaymentStats();
```

- [ ] **Step 3: Add the 4 KPI stat cards between the header and filter bar**

The existing JSX has this order: `{/* Header */}` → `{/* Filter Bar */}`.

Insert this block between them (between the closing `</div>` of the header and the opening `<div>` of the filter bar):

```tsx
{/* KPI Cards */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-widget-gap">
  <StatWidget
    icon="payments"
    label="Monthly Revenue"
    value={statsData ? `AED ${statsData.monthlyRevenue.toLocaleString('en-US')}` : '—'}
    loading={statsLoading}
  />
  <StatWidget
    icon="pending_actions"
    label="Outstanding Balance"
    value={statsData ? `AED ${statsData.outstandingBalance.toLocaleString('en-US')}` : '—'}
    loading={statsLoading}
  />
  <StatWidget
    icon="schedule"
    label="Active Plans"
    value={statsData?.activePlans ?? '—'}
    loading={statsLoading}
  />
  <StatWidget
    icon="percent"
    label="Collection Rate"
    value={statsData ? `${statsData.collectionRate.toFixed(1)}%` : '—'}
    loading={statsLoading}
  />
</div>
```

- [ ] **Step 4: Mount `<InstallmentTracker />` at the bottom of the page**

The existing JSX ends with the modals before the closing `</div>`. Add `<InstallmentTracker />` after the table card's closing `</div>` and before the modals:

Find the existing block:
```tsx
      {showForm && (
        <PaymentFormModal open={showForm} onClose={() => setShowForm(false)} />
      )}
```

Insert `<InstallmentTracker />` directly above that block:
```tsx
      <InstallmentTracker />

      {showForm && (
        <PaymentFormModal open={showForm} onClose={() => setShowForm(false)} />
      )}
```

- [ ] **Step 5: TypeScript check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/payments/PaymentsPage.tsx
git commit -m "feat: add payment KPI stat cards and installment tracker to PaymentsPage"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| `GET /payments/stats` handler | Task 1 |
| `GET /payments/installment-plans` handler | Task 1 |
| Routes registered before `/:id` | Task 1 |
| 401/403 tests, monthlyRevenue/outstandingBalance/collectionRate/activePlans tests | Task 2 |
| `usePaymentStats()` and `useInstallmentPlans()` hooks + types | Task 3 |
| `InstallmentTracker.tsx` with progress bars, date range, AED amounts | Task 3 |
| 4 KPI stat cards above filter bar | Task 4 |
| `<InstallmentTracker />` below table | Task 4 |

**Placeholder scan:** No TBD, TODO, or vague steps. All steps contain complete code.

**Type consistency:**
- `InstallmentPlan.totalAmount` and `paidAmount` are `string` throughout (server returns `String(b.totalAmount)`, hook types them as `string`, component converts with `Number(...)`) — consistent.
- `PaymentStats` fields are all `number` — server returns numbers, hook types them as `number` — consistent.
- `usePaymentStats` and `useInstallmentPlans` match their import in `PaymentsPage.tsx` — consistent.
