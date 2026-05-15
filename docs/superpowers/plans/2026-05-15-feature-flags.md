# Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vendor-controlled feature flag system that gates modules (Bookings, Payments, Tickets, Staff, Reports, Multi-Building) on/off via environment variables, enforced at both server and client.

**Architecture:** A `FeatureFlag` enum is added to the shared package. The server reads env vars at request time via `isFeatureEnabled(flag)`, exposes them via `GET /api/v1/config` (public), and guards route groups with `requireFeature(flag)` middleware. The client fetches config once with `useFeatureFlags()`, hides gated nav items in Sidebar, and skips registering disabled routes in App.tsx. All flags default to `false` (disabled) when the env var is absent.

**Tech Stack:** Prisma/PostgreSQL, Express/TypeScript, React + TanStack Query + Tailwind MD3, Vitest

---

## File Map

| Action | File |
|---|---|
| Modify | `shared/index.ts` — add `FeatureFlag` enum |
| Create | `server/src/features.ts` — `isFeatureEnabled` function |
| Create | `server/src/middleware/requireFeature.ts` — Express middleware |
| Create | `server/src/routes/config.routes.ts` — `GET /config` handler |
| Modify | `server/src/app.ts` — register config route + add requireFeature to gated routes |
| Modify | `server/src/routes/users.routes.ts` — gate `GET /maintenance-staff` with STAFF flag |
| Modify | `server/src/routes/buildings.routes.ts` — gate POST/PATCH with MULTI_BUILDING flag |
| Modify | `server/src/controllers/users.controller.ts` — silently ignore staffStatus when STAFF=false |
| Create | `server/src/features.test.ts` — integration tests |
| Create | `client/src/hooks/useFeatureFlags.ts` — React Query hook |
| Modify | `client/src/components/layout/Sidebar.tsx` — hide gated nav items |
| Modify | `client/src/App.tsx` — skip registering disabled routes |
| Modify | `client/src/pages/users/UsersPage.tsx` — hide Staff tab when STAFF=false |
| Modify | `client/src/pages/apartments/ApartmentsPage.tsx` — hide Staff widget when STAFF=false |

---

### Task 1: Shared enum + server infrastructure

**Files:**
- Modify: `shared/index.ts`
- Create: `server/src/features.ts`
- Create: `server/src/middleware/requireFeature.ts`
- Create: `server/src/routes/config.routes.ts`
- Modify: `server/src/app.ts`
- Create: `server/src/features.test.ts`

- [ ] **Step 1: Write failing test for GET /config**

Create `server/src/features.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from './app';
import { signToken } from './lib/jwt';
import { Role } from '@hotel/shared';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminToken: string;

beforeAll(async () => {
  const admin = await testPrisma.user.create({
    data: {
      name: 'Flag Test Admin',
      email: `flag-admin-${Date.now()}@test.com`,
      password: 'x',
      role: 'ADMIN',
    },
  });
  adminToken = signToken({ id: admin.id, role: admin.role, assignedBuildingId: null });
});

afterAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'flag-%'`;
  await testPrisma.$disconnect();
});

describe('GET /api/v1/config', () => {
  it('returns all feature flags as booleans (no auth required)', async () => {
    const res = await request(app).get('/api/v1/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features');
    const flags = res.body.features;
    for (const key of ['BOOKINGS', 'PAYMENTS', 'TICKETS', 'STAFF', 'REPORTS', 'MULTI_BUILDING']) {
      expect(flags).toHaveProperty(key);
      expect(typeof flags[key]).toBe('boolean');
    }
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/features.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: FAIL — 404 (route does not exist yet).

- [ ] **Step 3: Add FeatureFlag enum to shared/index.ts**

Open `shared/index.ts`. Add after the `TicketType` enum (after line 67):

```typescript
export enum FeatureFlag {
  BOOKINGS = 'BOOKINGS',
  PAYMENTS = 'PAYMENTS',
  TICKETS = 'TICKETS',
  STAFF = 'STAFF',
  REPORTS = 'REPORTS',
  MULTI_BUILDING = 'MULTI_BUILDING',
}
```

- [ ] **Step 4: Create server/src/features.ts**

```typescript
import { FeatureFlag } from '@hotel/shared';

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return process.env[`FEATURE_${flag}`] === 'true';
}
```

- [ ] **Step 5: Create server/src/middleware/requireFeature.ts**

```typescript
import { RequestHandler } from 'express';
import { FeatureFlag } from '@hotel/shared';
import { isFeatureEnabled } from '../features';

export function requireFeature(flag: FeatureFlag): RequestHandler {
  return (_req, res, next) => {
    if (!isFeatureEnabled(flag)) {
      res.status(403).json({ message: 'Module not enabled' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 6: Create server/src/routes/config.routes.ts**

```typescript
import { Router } from 'express';
import { FeatureFlag } from '@hotel/shared';
import { isFeatureEnabled } from '../features';

const router = Router();

router.get('/', (_req, res) => {
  const features = Object.values(FeatureFlag).reduce(
    (acc, flag) => { acc[flag] = isFeatureEnabled(flag); return acc; },
    {} as Record<FeatureFlag, boolean>
  );
  res.json({ features });
});

export default router;
```

- [ ] **Step 7: Register config route in server/src/app.ts**

Open `server/src/app.ts`. Add the import at the top with the other route imports:

```typescript
import configRoutes from './routes/config.routes';
```

Register it **before** all other `app.use('/api/v1/...')` calls (it's public — no auth):

```typescript
app.use('/api/v1/config', configRoutes);
```

Add it as the first `app.use('/api/v1/...')` line, before `app.use('/api/v1/auth', authRoutes)`.

- [ ] **Step 8: Run test to confirm it passes**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/features.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: PASS — `GET /api/v1/config` returns 200 with all 6 flags.

- [ ] **Step 9: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add shared/index.ts server/src/features.ts server/src/middleware/requireFeature.ts server/src/routes/config.routes.ts server/src/app.ts server/src/features.test.ts
git commit -m "feat: add FeatureFlag enum, isFeatureEnabled, requireFeature middleware, and GET /config endpoint"
```

---

### Task 2: Server route guards + staffStatus silent-ignore

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/routes/users.routes.ts`
- Modify: `server/src/routes/buildings.routes.ts`
- Modify: `server/src/controllers/users.controller.ts`
- Modify: `server/src/features.test.ts`

- [ ] **Step 1: Write failing tests**

Open `server/src/features.test.ts`. Add this `describe` block at the bottom:

```typescript
describe('Route feature gates', () => {
  it('GET /bookings returns 403 when FEATURE_BOOKINGS=false', async () => {
    process.env.FEATURE_BOOKINGS = 'false';
    try {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Cookie', `token=${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Module not enabled');
    } finally {
      delete process.env.FEATURE_BOOKINGS;
    }
  });

  it('POST /buildings returns 403 when FEATURE_MULTI_BUILDING=false', async () => {
    process.env.FEATURE_MULTI_BUILDING = 'false';
    try {
      const res = await request(app)
        .post('/api/v1/buildings')
        .set('Cookie', `token=${adminToken}`)
        .send({ name: 'Test Building', code: 'TST', address: '1 Test St' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Module not enabled');
    } finally {
      delete process.env.FEATURE_MULTI_BUILDING;
    }
  });

  it('GET /users/maintenance-staff returns 403 when FEATURE_STAFF=false', async () => {
    process.env.FEATURE_STAFF = 'false';
    try {
      const res = await request(app)
        .get('/api/v1/users/maintenance-staff')
        .set('Cookie', `token=${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Module not enabled');
    } finally {
      delete process.env.FEATURE_STAFF;
    }
  });

  it('PATCH /users/:id staffStatus is silently ignored when FEATURE_STAFF=false', async () => {
    const maintUser = await testPrisma.user.create({
      data: {
        name: 'Flag Maint',
        email: `flag-maint-${Date.now()}@test.com`,
        password: 'x',
        role: 'MAINTENANCE',
        staffStatus: 'ACTIVE',
      },
    });

    process.env.FEATURE_STAFF = 'false';
    try {
      const res = await request(app)
        .patch(`/api/v1/users/${maintUser.id}`)
        .set('Cookie', `token=${adminToken}`)
        .send({ name: 'Flag Updated', staffStatus: 'ON_CALL' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Flag Updated');
      expect(res.body.staffStatus).toBe('ACTIVE'); // unchanged
    } finally {
      delete process.env.FEATURE_STAFF;
      await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'flag-maint-%'`;
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/features.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 4 new tests fail (routes not gated yet).

- [ ] **Step 3: Add requireFeature guards in server/src/app.ts**

Open `server/src/app.ts`. Add the import:

```typescript
import { requireFeature } from './middleware/requireFeature';
import { FeatureFlag } from '@hotel/shared';
```

Then update the gated route registrations (leave auth, apartments, tenants, dashboard, users, settings untouched):

```typescript
app.use('/api/v1/bookings',  requireFeature(FeatureFlag.BOOKINGS),  bookingsRoutes);
app.use('/api/v1/payments',  requireFeature(FeatureFlag.PAYMENTS),  paymentsRoutes);
app.use('/api/v1/tickets',   requireFeature(FeatureFlag.TICKETS),   ticketsRoutes);
app.use('/api/v1/reports',   requireFeature(FeatureFlag.REPORTS),   reportsRoutes);
```

The `/api/v1/buildings` route stays unguarded here — buildings GET routes must remain accessible (existing data). The POST/PATCH guard goes inside `buildings.routes.ts` (Step 5).

- [ ] **Step 4: Gate GET /users/maintenance-staff in server/src/routes/users.routes.ts**

Open `server/src/routes/users.routes.ts`. Add the import:

```typescript
import { requireFeature } from '../middleware/requireFeature';
import { FeatureFlag } from '@hotel/shared';
```

Update the maintenance-staff route to include the feature guard **after** auth but **before** the role check:

```typescript
router.get(
  '/maintenance-staff',
  requireFeature(FeatureFlag.STAFF),
  requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN),
  maintenanceStaff
);
```

- [ ] **Step 5: Gate POST/PATCH /buildings in server/src/routes/buildings.routes.ts**

Open `server/src/routes/buildings.routes.ts`. Add the import:

```typescript
import { requireFeature } from '../middleware/requireFeature';
import { FeatureFlag } from '@hotel/shared';
```

Update POST and PATCH routes to include the feature guard:

```typescript
router.post('/',    requireFeature(FeatureFlag.MULTI_BUILDING), requireRole(Role.ADMIN), create);
router.patch('/:id', requireFeature(FeatureFlag.MULTI_BUILDING), requireRole(Role.ADMIN), update);
router.delete('/:id', requireRole(Role.ADMIN), remove);
```

GET routes (`/` and `/:id`) remain unguarded — existing building data stays accessible.

- [ ] **Step 6: Silently ignore staffStatus in users.controller.ts when STAFF=false**

Open `server/src/controllers/users.controller.ts`. Add imports at the top (with the other imports from `@hotel/shared`):

```typescript
import { isFeatureEnabled } from '../features';
import { FeatureFlag } from '@hotel/shared';
```

In the `update` function, find the destructuring line:

```typescript
const { name, email, role, assignedBuildingId, staffStatus } = req.body as {
```

Replace it with:

```typescript
const { name, email, role, assignedBuildingId } = req.body as {
  name?: string;
  email?: string;
  role?: string;
  assignedBuildingId?: number | null;
};
const staffStatus = isFeatureEnabled(FeatureFlag.STAFF)
  ? (req.body.staffStatus as string | undefined)
  : undefined;
```

No other changes to the `update` function are needed — all subsequent `staffStatus` checks already guard on `staffStatus !== undefined`, so they naturally skip when it's `undefined`.

- [ ] **Step 7: Run tests to confirm all pass**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/features.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: all 5 tests pass (1 config + 4 route gates).

- [ ] **Step 8: Run full test suite to confirm no regressions**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: same pass/fail counts as before (6 pre-existing failures in payments.controller.test.ts are known; all other tests pass).

- [ ] **Step 9: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add server/src/app.ts server/src/routes/users.routes.ts server/src/routes/buildings.routes.ts server/src/controllers/users.controller.ts server/src/features.test.ts
git commit -m "feat: gate Bookings, Payments, Tickets, Reports, Staff, and Multi-Building routes with feature flags"
```

---

### Task 3: Client — feature flags hook + Sidebar + App + STAFF flag in pages

**Files:**
- Create: `client/src/hooks/useFeatureFlags.ts`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/users/UsersPage.tsx`
- Modify: `client/src/pages/apartments/ApartmentsPage.tsx`

**Before starting:** Read `client/src/hooks/useAuth.ts` to see how it imports `api` — the axios instance is at `client/src/lib/axios.ts` and exported as `default`.

- [ ] **Step 1: Create client/src/hooks/useFeatureFlags.ts**

```typescript
import { useQuery } from '@tanstack/react-query';
import { FeatureFlag } from '@hotel/shared';
import api from '../lib/axios';

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await api.get('/config');
      return res.data.features as Record<FeatureFlag, boolean>;
    },
    staleTime: Infinity,
  });
}
```

- [ ] **Step 2: Update Sidebar.tsx**

Open `client/src/components/layout/Sidebar.tsx`. Replace the entire file with:

```tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role, FeatureFlag } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';

const NAV_ITEMS: {
  to: string;
  icon: string;
  key: string;
  roles: Role[];
  feature?: FeatureFlag;
}[] = [
  { to: '/dashboard', icon: 'dashboard', key: 'dashboard', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: 'apartment', key: 'apartments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/bookings', icon: 'calendar_month', key: 'bookings', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST], feature: FeatureFlag.BOOKINGS },
  { to: '/tenants', icon: 'groups', key: 'tenants', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/buildings', icon: 'business', key: 'buildings', roles: [Role.SUPER_ADMIN, Role.ADMIN], feature: FeatureFlag.MULTI_BUILDING },
  { to: '/payments', icon: 'payments', key: 'payments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE], feature: FeatureFlag.PAYMENTS },
  { to: '/tickets', icon: 'build', key: 'tickets', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE], feature: FeatureFlag.TICKETS },
  { to: '/reports', icon: 'assessment', key: 'reports', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE], feature: FeatureFlag.REPORTS },
  { to: '/users', icon: 'group', key: 'users', roles: [Role.SUPER_ADMIN, Role.ADMIN] },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
    isActive
      ? 'text-primary font-bold ltr:border-r-4 rtl:border-l-4 border-primary bg-secondary-container/30'
      : 'text-on-surface-variant hover:bg-surface-container-high'
  }`;

export default function Sidebar() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const { data: flags = {} as Record<FeatureFlag, boolean> } = useFeatureFlags();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!user || !item.roles.includes(user.role as Role)) return false;
    if (item.feature && !flags[item.feature]) return false;
    return true;
  });

  return (
    <aside className="fixed h-full w-[280px] ltr:left-0 rtl:right-0 top-0 ltr:border-r rtl:border-l border-outline-variant bg-surface flex flex-col py-6 px-4 z-20">
      {/* Logo */}
      <div className="mb-10 px-2 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-lg shrink-0">
          <span className="material-symbols-outlined text-on-primary text-xl">apartment</span>
        </div>
        <div>
          <h1 className="text-base font-bold text-primary leading-tight">LuxStay Admin</h1>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            {t('brand.subtitle', 'Property Management')}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {visibleItems.map(({ to, icon, key }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <span className="material-symbols-outlined text-[22px]">{icon}</span>
            <span className="text-sm">{t(`nav.${key}`, key.charAt(0).toUpperCase() + key.slice(1))}</span>
          </NavLink>
        ))}
      </nav>

      {/* Settings link — all roles */}
      <div className="pt-6 border-t border-outline-variant space-y-1">
        <NavLink to="/settings" className={navLinkClass}>
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-sm">{t('nav.settings', 'Settings')}</span>
        </NavLink>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Update App.tsx**

Open `client/src/App.tsx`. Replace the entire file with:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Role, FeatureFlag } from '@hotel/shared';
import { useFeatureFlags } from './hooks/useFeatureFlags';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import BookingsPage from './pages/bookings/BookingsPage';
import ApartmentsPage from './pages/apartments/ApartmentsPage';
import ApartmentDetailPage from './pages/apartments/ApartmentDetailPage';
import TenantsPage from './pages/tenants/TenantsPage';
import TenantDetailPage from './pages/tenants/TenantDetailPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import PaymentsPage from './pages/payments/PaymentsPage';
import TicketsPage from './pages/tickets/TicketsPage';
import BuildingsPage from './pages/buildings/BuildingsPage';
import ReportsPage from './pages/reports/ReportsPage';
import UsersPage from './pages/users/UsersPage';
import SettingsPage from './pages/settings/SettingsPage';

const ALL_STAFF = [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE, Role.FINANCE];
const ADMIN_ONLY = [Role.SUPER_ADMIN, Role.ADMIN];
const ADMIN_RECEPTIONIST = [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST];
const ADMIN_FINANCE = [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE];
const TICKETS_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE];

export default function App() {
  const { data: flags, isLoading } = useFeatureFlags();

  if (isLoading) return null;

  const f = flags ?? ({} as Record<FeatureFlag, boolean>);

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
                <DashboardPage />
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
            path="users"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute allowedRoles={ALL_STAFF}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Feature-gated routes — only registered when flag is enabled */}
          {f[FeatureFlag.BOOKINGS] && (
            <Route
              path="bookings"
              element={
                <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                  <BookingsPage />
                </ProtectedRoute>
              }
            />
          )}
          {f[FeatureFlag.PAYMENTS] && (
            <Route
              path="payments"
              element={
                <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                  <PaymentsPage />
                </ProtectedRoute>
              }
            />
          )}
          {f[FeatureFlag.TICKETS] && (
            <Route
              path="tickets"
              element={
                <ProtectedRoute allowedRoles={TICKETS_ROLES}>
                  <TicketsPage />
                </ProtectedRoute>
              }
            />
          )}
          {f[FeatureFlag.REPORTS] && (
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
          )}
          {f[FeatureFlag.MULTI_BUILDING] && (
            <Route
              path="buildings"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                  <BuildingsPage />
                </ProtectedRoute>
              }
            />
          )}
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Hide Staff tab in UsersPage.tsx when STAFF=false**

Open `client/src/pages/users/UsersPage.tsx`. Add the import alongside existing imports:

```typescript
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { FeatureFlag } from '@hotel/shared';
```

Inside the `UsersPage` component, add this line after the existing hook calls (after `const isAdmin = ...`):

```typescript
const { data: flags = {} as Record<FeatureFlag, boolean> } = useFeatureFlags();
const staffEnabled = flags[FeatureFlag.STAFF] ?? false;
```

Then find the tabs section. Currently it renders both `'all'` and `'staff'` tabs:

```tsx
{(['all', 'staff'] as Tab[]).map((tabKey) => (
```

Change to only include `'staff'` when the flag is enabled. Replace the `(['all', 'staff'] as Tab[])` array with:

```tsx
{((['all', ...(staffEnabled ? ['staff'] : [])] as Tab[])).map((tabKey) => (
```

Also find where `visibleUsers` is defined:

```typescript
const visibleUsers = tab === 'staff'
  ? users.filter(u => u.role === Role.MAINTENANCE)
  : users;
```

Add a safety reset in case the tab is 'staff' but the flag got disabled (edge case):

```typescript
const visibleUsers = (tab === 'staff' && staffEnabled)
  ? users.filter(u => u.role === Role.MAINTENANCE)
  : users;
```

And in the `{tab === 'staff' ? (...) : (...)}` cell that renders the status dropdown, wrap it:

```tsx
{(tab === 'staff' && staffEnabled) ? (
  // ... existing staff status dropdown/badge
) : (
  // ... existing deactivated/active badge
)}
```

- [ ] **Step 5: Hide Staff widget in ApartmentsPage.tsx when STAFF=false**

Open `client/src/pages/apartments/ApartmentsPage.tsx`. Add the import:

```typescript
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { FeatureFlag } from '@hotel/shared';
```

Inside the `ApartmentsPage` component, add after existing hook calls:

```typescript
const { data: flags = {} as Record<FeatureFlag, boolean> } = useFeatureFlags();
const staffEnabled = flags[FeatureFlag.STAFF] ?? false;
```

Find the Staff Distribution section (around line 514 — look for `{/* Staff Distribution */}`). Wrap the entire staff distribution `<div>` in a conditional:

```tsx
{staffEnabled && (
  <div className="w-full lg:w-[400px] bg-primary-container ...">
    {/* ... existing staff distribution content ... */}
  </div>
)}
```

Find the `{dispatchOpen && <NewTicketModal ...>}` block and wrap it the same way (it only makes sense when staff is enabled):

```tsx
{staffEnabled && dispatchOpen && (
  <NewTicketModal
    open={dispatchOpen}
    onClose={() => setDispatchOpen(false)}
    defaultType="CLEANING"
  />
)}
```

- [ ] **Step 6: TypeScript check**

```bash
cd "D:/Hotel Apartment Management System/client"
npx tsc --noEmit 2>&1 | grep -v "LoginPage" | head -20
```

Expected: zero errors in the changed files. (One pre-existing error in `LoginPage.tsx` — not related to this task, can be ignored.)

Fix any errors that appear before proceeding.

- [ ] **Step 7: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add client/src/hooks/useFeatureFlags.ts client/src/components/layout/Sidebar.tsx client/src/App.tsx client/src/pages/users/UsersPage.tsx client/src/pages/apartments/ApartmentsPage.tsx
git commit -m "feat: wire feature flags to client — Sidebar, routes, Staff tab, Staff widget"
```
