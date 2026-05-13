# Dashboard — Sub-phase 3A Design Spec

## Goal

Build the Dashboard page: six clickable stat widgets (with revenue broken down by payment method) and a live activity feed showing the last 20 events across check-ins, check-outs, payments, and tickets — auto-refreshing every 30 seconds.

## Architecture

Two new server endpoints under `/api/v1/dashboard`:
- `GET /api/v1/dashboard/stats` — aggregated counts and today's revenue breakdown
- `GET /api/v1/dashboard/activity` — last 20 events merged from four tables, sorted newest-first

Both are fetched in parallel by the client on page load. Activity uses React Query's `refetchInterval: 30000`. Independent failure — if activity fails, stats still render.

## Tech Stack

- **Server:** Express + Prisma (existing pattern), TypeScript
- **Client:** React Query (`useQuery`), React Router `useNavigate`, Tailwind CSS / MD3 tokens (existing design system)

---

## Server

### File: `server/src/routes/dashboard.routes.ts`

Registers two GET handlers. Both require `authMiddleware` (all roles allowed).

```
GET /api/v1/dashboard/stats    → dashboardController.stats
GET /api/v1/dashboard/activity → dashboardController.activity
```

### File: `server/src/controllers/dashboard.controller.ts`

#### `stats` handler

Runs these Prisma queries in parallel via `Promise.all`:

1. **Apartment counts** — `prisma.apartment.groupBy({ by: ['status'], _count: true })`  
   Derive: `total` (sum all), `occupied` (OCCUPIED), `available` (AVAILABLE), `maintenance` (MAINTENANCE)

2. **Today's revenue** — `prisma.payment.groupBy({ by: ['method'], where: { status: 'PAID', paidAt: { gte: startOfToday, lt: startOfTomorrow } }, _sum: { amount: true } })`  
   Returns per-method sums for CASH, CARD, INSTALLMENT. Missing methods return 0.

3. **Pending installments** — `prisma.payment.count({ where: { method: 'INSTALLMENT', status: 'PENDING' } })`

4. **Open tickets** — `prisma.maintenanceTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } })`

Response shape:
```json
{
  "apartments": { "total": 12, "occupied": 6, "available": 3, "maintenance": 1 },
  "revenue": { "total": 5000.00, "cash": 1000.00, "card": 3000.00, "installment": 1000.00 },
  "pendingInstallments": 4,
  "openTickets": 2
}
```

#### `activity` handler

Runs four Prisma queries in parallel:

1. **Check-ins today** — `prisma.booking.findMany({ where: { checkIn: { gte: startOfToday, lt: startOfTomorrow } }, include: { tenant: true, apartment: true }, take: 20 })`  
   Map to: `{ type: 'CHECK_IN', label: '<name> checked in to apt <number>', timestamp: checkIn }`

2. **Check-outs today** — same pattern with `checkOut`  
   Map to: `{ type: 'CHECK_OUT', label: '<name> checked out of apt <number>', timestamp: checkOut }`

3. **Recent payments** — `prisma.payment.findMany({ where: { status: 'PAID' }, orderBy: { paidAt: 'desc' }, take: 20, include: { booking: { include: { tenant: true } } } })`  
   Map to: `{ type: 'PAYMENT', label: 'Payment of AED <amount> received from <name>', timestamp: paidAt }`

4. **Recent tickets** — `prisma.maintenanceTicket.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { apartment: true } })`  
   Map to: `{ type: 'TICKET', label: 'Ticket opened for apt <number>: <description truncated to 60 chars>', timestamp: createdAt }`

Merge all four arrays, sort by `timestamp` descending, slice to 20.

Response shape:
```json
{
  "events": [
    { "type": "CHECK_IN", "label": "Ahmed Al-Rashidi checked in to apt 101", "timestamp": "2026-05-13T08:00:00Z" },
    { "type": "PAYMENT",  "label": "Payment of AED 5000 received from Fatima Al-Zahra", "timestamp": "2026-05-13T07:30:00Z" }
  ]
}
```

### Registration: `server/src/app.ts`

Add:
```ts
import dashboardRoutes from './routes/dashboard.routes';
app.use('/api/v1/dashboard', dashboardRoutes);
```

---

## Client

### File: `client/src/hooks/useDashboard.ts`

```ts
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

export function useDashboardStats(): UseQueryResult<DashboardStats>
export function useDashboardActivity(): UseQueryResult<{ events: ActivityEvent[] }>
  // refetchInterval: 30_000
```

Both call `api.get('/dashboard/...')` via the existing axios instance.

### File: `client/src/pages/dashboard/StatWidget.tsx`

Props:
```ts
interface StatWidgetProps {
  icon: string;           // Material Symbol name
  label: string;
  value: number | string;
  subRows?: { label: string; value: number | string }[];
  onClick?: () => void;
  loading?: boolean;
}
```

- Renders a card with icon, label, large value
- If `subRows` present, renders them as smaller rows below the value (used for revenue breakdown)
- If `onClick` present, card is a button with hover/focus styles
- If `loading`, renders skeleton placeholders

### File: `client/src/pages/dashboard/DashboardPage.tsx`

Layout (top to bottom):
1. **Page header** — "Dashboard" title
2. **Stat grid** — 3 columns on desktop, 2 on tablet, 1 on mobile (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
3. **Activity feed panel** — card with scrollable list of events

**Stat widgets (6 total):**

| Widget | Icon | Value | onClick destination |
|--------|------|-------|---------------------|
| Total Apartments | `apartment` | `apartments.total` | `/apartments` |
| Occupied | `meeting_room` | `apartments.occupied` | `/apartments?status=OCCUPIED` |
| Available | `check_circle` | `apartments.available` | `/apartments?status=AVAILABLE` |
| Today's Revenue | `payments` | `revenue.total` formatted as `AED X,XXX` | `/payments` |
| Pending Installments | `schedule` | `pendingInstallments` | `/payments?status=PENDING&method=INSTALLMENT` |
| Open Tickets | `build` | `openTickets` | `/tickets?status=OPEN` |

Today's Revenue widget also renders `subRows` for CASH / CARD / INSTALLMENT breakdown.

**Activity feed:**
- Each event row: colored icon by type (CHECK_IN=blue, CHECK_OUT=amber, PAYMENT=green, TICKET=red), label text, relative timestamp (`X min ago` / `X hr ago` / date if older)
- "No recent activity" empty state when list is empty
- Loading skeleton: 5 placeholder rows

**Error handling:**
- Stats error: show inline error message per failed section, not full-page crash
- Activity error: show error state inside the feed panel only

### Navigation wire-up

`/apartments?status=OCCUPIED` etc. — the ApartmentsPage already reads `status` from query params for its filter bar (or will need to on first load). Note: ApartmentsPage will need to read initial filter values from `useSearchParams` — this is a minor addition to ApartmentsPage, included in the Dashboard implementation task.

---

## Error Handling

- Both endpoints: catch Prisma errors, return `500 { error: 'Internal server error' }`
- Client: each React Query hook has `retry: 1`; error state is scoped to the widget/panel, not the page

## Testing

### Server integration tests (`server/src/controllers/dashboard.controller.test.ts`)

1. `GET /api/v1/dashboard/stats` — assert response shape matches schema; assert `apartments.total` equals count of seeded apartments; assert revenue sums are non-negative numbers
2. `GET /api/v1/dashboard/activity` — assert `events` is an array of ≤20 items; assert each event has `type`, `label`, `timestamp`; assert sorted newest-first (events[0].timestamp ≥ events[1].timestamp)
3. Both endpoints return 401 without auth cookie

### Manual test checklist

- [ ] All 6 stat widgets render with correct values from seeded data
- [ ] Revenue widget shows CASH / CARD / INSTALLMENT sub-rows
- [ ] Clicking each widget navigates to the correct route
- [ ] Activity feed shows events from seeded bookings/payments/tickets
- [ ] Activity feed auto-refreshes (verify via network tab, ~30s interval)
- [ ] Error state renders correctly when API is unreachable (disconnect network, hard-reload)
- [ ] Arabic RTL layout: grid and feed still render correctly when language toggled
