# Feature Flags Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Goal

Add a vendor-controlled feature flag system that gates modules on/off via environment variables. Users and Auth are always on. Every other module can be independently disabled at deployment time.

---

## Architecture

No new database models. Two additions: a shared `FeatureFlag` enum and a `featureFlags` registry read from env vars at server startup. The server exposes `GET /api/v1/config` (public, no auth) returning the enabled state of each flag. The client fetches this once on load and uses it to hide nav items and skip registering routes for disabled modules.

Env vars default to `false` — modules must be explicitly enabled. A fresh deployment has only Users + Auth until the operator sets the vars.

---

## Shared

### `FeatureFlag` enum (add to `shared/index.ts`)

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

---

## Server

### Env vars

All default to `false` if absent or any value other than `'true'`:

```
FEATURE_BOOKINGS=true
FEATURE_PAYMENTS=true
FEATURE_TICKETS=true
FEATURE_STAFF=true
FEATURE_REPORTS=true
FEATURE_MULTI_BUILDING=true
```

### Feature registry (`server/src/features.ts`)

Reads `process.env` at call time (not at module load) so tests can set/unset env vars without module resets:

```typescript
import { FeatureFlag } from '@hotel/shared';

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return process.env[`FEATURE_${flag}`] === 'true';
}
```

### `requireFeature` middleware (`server/src/middleware/requireFeature.ts`)

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

### `GET /api/v1/config` (new public endpoint)

**Auth:** None required.

**Response:**
```json
{
  "features": {
    "BOOKINGS": true,
    "PAYMENTS": false,
    "TICKETS": true,
    "STAFF": true,
    "REPORTS": false,
    "MULTI_BUILDING": false
  }
}
```

Add to `server/src/routes/config.routes.ts` (new file) and register in the main router before auth middleware.

### Route guards (modify `server/src/routes/index.ts`)

Insert `requireFeature` before each gateable route group:

```typescript
router.use('/bookings',  requireFeature(FeatureFlag.BOOKINGS),       bookingsRouter);
router.use('/payments',  requireFeature(FeatureFlag.PAYMENTS),       paymentsRouter);
router.use('/tickets',   requireFeature(FeatureFlag.TICKETS),        ticketsRouter);
router.use('/reports',   requireFeature(FeatureFlag.REPORTS),        reportsRouter);
router.use('/buildings', buildingsRouter); // partially gated — see below
```

**STAFF flag scope:** The `/users` route is always on. Within `users.controller.ts`:
- `GET /users/maintenance-staff` → guarded by `requireFeature(FeatureFlag.STAFF)` at the route level
- `PATCH /users/:id` staffStatus field → if `FEATURE_STAFF=false`, the staffStatus field is silently ignored (not a 403 — updating other user fields must still work)

**MULTI_BUILDING flag scope:** The `/buildings` route stays registered (existing building data must remain accessible). Only `POST /buildings` and `PATCH /buildings/:id` are guarded by `requireFeature(FeatureFlag.MULTI_BUILDING)` → 403 if disabled.

---

## Client

### `useFeatureFlags` hook (`client/src/hooks/useFeatureFlags.ts`)

```typescript
import { useQuery } from '@tanstack/react-query';
import { FeatureFlag } from '@hotel/shared';
import api from '../lib/api';

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

On error: flags default to all `false` (safe fail — only users/auth work).

### Sidebar (`client/src/components/layout/Sidebar.tsx`)

Each gateable nav item gets an optional `feature` field:

```typescript
{ to: '/bookings',  icon: 'calendar_month',    label: 'Bookings',  feature: FeatureFlag.BOOKINGS,       roles: [...] }
{ to: '/payments',  icon: 'payments',           label: 'Payments',  feature: FeatureFlag.PAYMENTS,       roles: [...] }
{ to: '/tickets',   icon: 'build',              label: 'Tickets',   feature: FeatureFlag.TICKETS,        roles: [...] }
{ to: '/reports',   icon: 'bar_chart',          label: 'Reports',   feature: FeatureFlag.REPORTS,        roles: [...] }
{ to: '/buildings', icon: 'apartment',          label: 'Buildings', feature: FeatureFlag.MULTI_BUILDING, roles: [...] }
```

Items with a `feature` set are only rendered when `flags[item.feature] === true`. Items without a `feature` field (Dashboard, Users, Apartments, Tenants) are always rendered.

### Router (`client/src/App.tsx`)

Disabled module routes are not registered. A catch-all redirects unknown routes to `/`. Navigating directly to `/payments` when payments is off hits the catch-all.

Implementation: call `useFeatureFlags()` at the root, pass flags into the route tree. Only register a route when its flag is `true`.

### STAFF flag in client

- **UsersPage:** Staff tab only rendered when `flags.STAFF === true`
- **ApartmentsPage:** Staff Distribution widget and "Dispatch New Task" button only rendered when `flags.STAFF === true`

### Loading state

`useFeatureFlags()` is called at the app root. While loading, the sidebar renders nothing (consistent with current auth loading state). The config fetch is fast (no DB query).

---

## API

### New: `GET /api/v1/config`

**Auth:** None  
**Response:** `{ features: Record<FeatureFlag, boolean> }`  
**Error handling:** No errors possible — returns registry values directly.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Env var missing or not `'true'` | Flag treated as `false` (module disabled) |
| `GET /config` fails on client | All flags default to `false`; app loads with users/auth only |
| Request to disabled module route | `403 { message: 'Module not enabled' }` |
| `PATCH /users/:id` with staffStatus when STAFF=false | staffStatus field silently ignored; other fields update normally |
| `POST /buildings` when MULTI_BUILDING=false | `403 { message: 'Module not enabled' }` |
| `FEATURE_STAFF=true` but `FEATURE_TICKETS=false` | Staff tab visible; "Dispatch New Task" button hidden (ticket creation requires TICKETS flag) |

---

## Files

| Action | File |
|---|---|
| Modify | `shared/index.ts` — add `FeatureFlag` enum |
| Create | `server/src/features.ts` — feature registry |
| Create | `server/src/middleware/requireFeature.ts` — middleware |
| Create | `server/src/routes/config.routes.ts` — config endpoint |
| Modify | `server/src/routes/index.ts` — wire requireFeature + config route |
| Modify | `server/src/routes/users.routes.ts` — gate maintenance-staff route |
| Modify | `server/src/controllers/users.controller.ts` — ignore staffStatus when STAFF=false |
| Create | `client/src/hooks/useFeatureFlags.ts` — hook |
| Modify | `client/src/components/layout/Sidebar.tsx` — conditional nav items |
| Modify | `client/src/App.tsx` — conditional route registration |
| Modify | `client/src/pages/users/UsersPage.tsx` — hide Staff tab when STAFF=false |
| Modify | `client/src/pages/apartments/ApartmentsPage.tsx` — hide Staff widget when STAFF=false |

---

## Testing

### Server integration tests

1. `GET /config` returns correct shape with all flags present
2. `GET /bookings` with `FEATURE_BOOKINGS=false` → 403 `"Module not enabled"`
3. `POST /buildings` with `FEATURE_MULTI_BUILDING=false` → 403
4. `GET /users/maintenance-staff` with `FEATURE_STAFF=false` → 403
5. `PATCH /users/:id` with `staffStatus` when `FEATURE_STAFF=false` → 200, staffStatus unchanged

Tests set env vars directly (`process.env.FEATURE_X = 'false'`) before the relevant test and restore after (`delete process.env.FEATURE_X`). Because `isFeatureEnabled` reads `process.env` at call time, no module resets are needed.

### Manual checklist

- [ ] All flags `false` by default: fresh `.env` with no FEATURE_ vars shows only Dashboard, Apartments, Tenants, Users
- [ ] Setting `FEATURE_TICKETS=true` makes Tickets nav item appear and routes work
- [ ] Direct URL to disabled module redirects to `/`
- [ ] `POST /buildings` blocked when `FEATURE_MULTI_BUILDING=false`
- [ ] Staff tab hidden in UsersPage when `FEATURE_STAFF=false`
- [ ] Staff widget hidden in ApartmentsPage when `FEATURE_STAFF=false`
- [ ] Adding a new module requires: one env var + one `FeatureFlag` entry + one `requireFeature` call + one Sidebar item
