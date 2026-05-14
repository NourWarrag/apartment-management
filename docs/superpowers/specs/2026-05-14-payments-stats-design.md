# Payments Stats + Installment Tracking — Design Spec

## Goal

Add two missing sections to PaymentsPage: (1) four KPI stat cards above the filter bar showing financial summary metrics, and (2) an Installment Tracker below the payments table showing active installment plans with progress bars.

## Architecture

Two new server endpoints (`GET /payments/stats` and `GET /payments/installment-plans`) added to the existing payments controller. The client adds `usePaymentStats()` and `useInstallmentPlans()` to `usePayments.ts`, four stat cards in `PaymentsPage.tsx`, and a new `InstallmentTracker` component rendered below the table.

## Tech Stack

- **Server:** Express + Prisma, TypeScript
- **Client:** React Query, Tailwind MD3 tokens, Material Symbols Outlined

---

## Server

### Endpoints

```
GET /payments/stats              → ADMIN | RECEPTIONIST | FINANCE
GET /payments/installment-plans  → ADMIN | RECEPTIONIST | FINANCE
```

### File: `server/src/controllers/payments.controller.ts`

#### `stats` handler

No query params.

**Computations:**
- `monthlyRevenue`: `SUM(amount)` where `status = PAID` and `paidAt` is within the current calendar month (first day of month 00:00:00 UTC to now)
- `outstandingBalance`: `SUM(amount)` where `status = PENDING`
- `activePlans`: count of distinct `bookingId`s where `method = INSTALLMENT` and `status = PAID`, filtered to bookings where the sum of INSTALLMENT payments is less than `booking.totalAmount`. Use Prisma `groupBy` on `bookingId` with `_sum: { amount: true }`, then join with booking `totalAmount` and filter client-side (in JS, not SQL) for `paidSum < totalAmount`.
- `collectionRate`: `paid / (paid + pending) * 100`, rounded to one decimal. If `paid + pending = 0`, return `100.0`.

**Response (200):**
```json
{
  "monthlyRevenue": 42000,
  "outstandingBalance": 5120,
  "activePlans": 3,
  "collectionRate": 89.2
}
```

#### `installmentPlans` handler

No query params.

**Logic:**
1. `groupBy` payments on `bookingId` where `method = INSTALLMENT` and `status = PAID`, summing `amount` → map of `bookingId → paidAmount`.
2. Fetch all bookings whose IDs appear in that map, including `tenant { fullName }` and `apartment { number }`.
3. Filter to bookings where `paidAmount < booking.totalAmount` (active plans only).
4. Sort by `paidAmount / totalAmount` ascending (least progress first).
5. Return array.

**Response (200):**
```json
[
  {
    "bookingId": 1,
    "tenantName": "Ahmed Al-Rashidi",
    "apartmentNumber": "101",
    "totalAmount": "15000.00",
    "paidAmount": "5000.00",
    "checkIn": "2026-03-14T00:00:00.000Z",
    "checkOut": "2026-06-12T00:00:00.000Z"
  }
]
```

### File: `server/src/routes/payments.routes.ts`

Add before the existing routes (so `/stats` and `/installment-plans` don't get matched as `/:id`):
```typescript
router.get('/stats', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE), stats);
router.get('/installment-plans', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE), installmentPlans);
```

---

## Client

### File: `client/src/hooks/usePayments.ts`

Add:

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

### File: `client/src/pages/payments/InstallmentTracker.tsx` (new file)

Props: none (fetches its own data).

Renders a section below the payments table:
- Section heading: "Installment Plans" with count badge
- If no active plans: "No active installment plans." empty state
- For each plan, a card containing:
  - Top row: tenant name (bold) + apartment number pill (dark, like tenant page)
  - Date range: `checkIn → checkOut` formatted as "Mar 14, 2026 – Jun 12, 2026"
  - Progress bar: `w-full bg-surface-container-high rounded-full h-2` container, inner `bg-primary rounded-full` with `style={{ width: \`${percent}%\` }}`
  - Below bar: `AED X,XXX paid of AED Y,YYY` (formatted with `toLocaleString()`)
- Cards laid out in a responsive grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

### File: `client/src/pages/payments/PaymentsPage.tsx`

- Import `usePaymentStats` and `InstallmentTracker`
- Add 4 stat cards in a `grid grid-cols-4 gap-4` row above the filter bar:
  | Card | Value | Icon |
  |---|---|---|
  | Monthly Revenue | `AED X,XXX` | `payments` |
  | Outstanding Balance | `AED X,XXX` | `pending_actions` |
  | Active Plans | count | `schedule` |
  | Collection Rate | `X.X%` | `percent` |
- Stat card style: same `bg-surface-container-low border border-outline-variant rounded-xl p-4` pattern used on dashboard — uppercase label, large number, icon top-left
- Mount `<InstallmentTracker />` after the closing tag of the payments table card, before the closing page `</div>`

---

## Error Handling

| Scenario | Server | Client |
|---|---|---|
| No payments exist | Returns zeros / empty array | Cards show 0, tracker shows empty state |
| Unauthenticated | 401 | Axios interceptor → /login |
| MAINTENANCE role | 403 | Cards not rendered (role check in component) |
| Server error | 500 | Cards show "—" |

---

## Testing

### Server integration tests (`server/src/controllers/payments.controller.test.ts`)

Add to existing payments test file (or create if missing):

**Stats:**
1. `GET /payments/stats` — 401 without auth
2. `GET /payments/stats` — 403 for MAINTENANCE role
3. `GET /payments/stats` — returns correct monthlyRevenue (only PAID, only this month)
4. `GET /payments/stats` — outstandingBalance counts only PENDING
5. `GET /payments/stats` — collectionRate = 100.0 when no payments exist

**Installment Plans:**
6. `GET /payments/installment-plans` — 401 without auth
7. `GET /payments/installment-plans` — returns only active plans (paidAmount < totalAmount)
8. `GET /payments/installment-plans` — fully paid plans not included

### Manual test checklist

- [ ] 4 KPI cards appear above filter bar with real data
- [ ] Monthly Revenue only counts current month's PAID payments
- [ ] Collection Rate shows "100.0%" when all payments are paid
- [ ] Installment Tracker appears below table
- [ ] Progress bar width reflects paidAmount / totalAmount correctly
- [ ] Fully paid installment bookings do not appear in tracker
- [ ] MAINTENANCE role sees neither cards nor tracker (403 on endpoint, hidden in UI)
