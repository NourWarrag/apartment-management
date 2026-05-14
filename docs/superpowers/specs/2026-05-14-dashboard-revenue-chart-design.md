# Dashboard Revenue Chart — Design Spec

## Goal

Replace the flat "Today's Revenue" card on the Dashboard with a full-width area chart showing daily revenue trend, toggling between a 7-day and 30-day window.

## Architecture

One new server endpoint (`GET /dashboard/revenue-trend?days=7|30`) queries paid payments grouped by calendar day and fills in zero-revenue days. The client adds `useRevenueTrend(days)` to the existing `useDashboard.ts` hook and a new `RevenueChart` component that owns the toggle state. `DashboardPage.tsx` is updated to render `RevenueChart` in place of the existing flat revenue card.

## Tech Stack

- **Server:** Express + Prisma `groupBy`, TypeScript
- **Client:** React Query, Recharts `AreaChart` + `ResponsiveContainer`, Tailwind MD3 tokens

---

## Server

### Endpoint

```
GET /dashboard/revenue-trend?days=7|30   → ADMIN | RECEPTIONIST | FINANCE
```

### File: `server/src/controllers/dashboard.controller.ts`

Add `revenueTrend` handler:

**Query param:** `days` — must be `"7"` or `"30"`. Defaults to `"7"` if omitted. Returns 400 for any other value.

**Logic:**
1. Compute `startDate` = today minus (days − 1) days, time set to midnight UTC (date-string comparison, consistent with existing controller pattern).
2. Prisma `groupBy` on `Payment` where `status = PAID` and `paidAt >= startDate`, grouped by `paidAt` date, summing `amount`.
3. Build a map from date-string → revenue sum. Then iterate over each day from `startDate` to today, filling missing days with `0`.
4. Return array of `{ date: "YYYY-MM-DD", revenue: number }` ordered ascending by date (oldest → newest).

**Response (200):**
```json
[
  { "date": "2026-05-08", "revenue": 0 },
  { "date": "2026-05-09", "revenue": 15000 },
  { "date": "2026-05-10", "revenue": 5000 },
  ...
]
```

**Note on Prisma groupBy + date:** Prisma `groupBy` on a `DateTime` field groups by the exact timestamp, not by calendar date. Use a raw query or iterate over results and normalize `paidAt` to `YYYY-MM-DD` string (`.toISOString().split('T')[0]`) before aggregating into a map.

### File: `server/src/routes/dashboard.routes.ts`

Add:
```typescript
router.get('/revenue-trend', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE), revenueTrend);
```

---

## Client

### File: `client/src/hooks/useDashboard.ts`

Add:
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
  });
}
```

### File: `client/src/pages/dashboard/RevenueChart.tsx` (new file)

Props: none (owns toggle state internally).

- Local state: `const [days, setDays] = useState<7 | 30>(7)`
- Fetches `useRevenueTrend(days)`
- Renders a card with:
  - Header row: label "Revenue Trend" on left, toggle buttons "7D" / "30D" on right (active button uses `bg-primary text-on-primary`, inactive uses `bg-surface-container text-on-surface-variant`)
  - Recharts `ResponsiveContainer` (height 200px) containing an `AreaChart`:
    - `XAxis` dataKey `date` — formatted to show `MMM D` (e.g. "May 8")
    - `YAxis` — formatted as `AED X` for tick values, hidden tick line
    - `Tooltip` — shows `date` and `AED <revenue>` formatted with comma separator
    - `Area` — `type="monotone"`, `dataKey="revenue"`, fill using `var(--color-primary)` at 15% opacity, stroke `var(--color-primary)`
  - Loading state: skeleton placeholder div (same height as chart)
  - Empty/zero state: chart still renders (flat line at 0 is valid)

### File: `client/src/pages/dashboard/DashboardPage.tsx`

- Import `RevenueChart`
- Remove the existing "Today's Revenue" stat card (the one with Cash/Card/Installment breakdown) from the second row
- Replace it with `<RevenueChart />` in a `grid-cols-3` second row, taking `col-span-1` alongside Pending Installments and Open Tickets

**Revised second row layout:**
```
| RevenueChart (col-span-1) | Pending Installments | Open Tickets |
```

---

## Error Handling

| Scenario | Server | Client |
|---|---|---|
| Invalid `days` param | 400 `{ message }` | Query won't fire (value is typed 7\|30) |
| No payments in range | 200 with all-zero array | Renders flat line chart |
| Server error | 500 | Card shows "—" placeholder |

---

## Testing

### Server integration test (`server/src/controllers/dashboard.controller.test.ts`)

Add to existing dashboard test file (or create if missing):

1. `GET /dashboard/revenue-trend` — 401 without auth
2. `GET /dashboard/revenue-trend?days=7` — returns 7 entries (one per day), zeros for days with no payments
3. `GET /dashboard/revenue-trend?days=30` — returns 30 entries
4. `GET /dashboard/revenue-trend?days=invalid` — returns 400
5. `GET /dashboard/revenue-trend?days=7` — sums only PAID payments (not PENDING)

### Manual test checklist

- [ ] Chart renders on Dashboard with 7-day data by default
- [ ] Toggle to 30D fetches new data and re-renders
- [ ] Days with no payments show as 0 (not missing bars)
- [ ] Tooltip shows correct date and AED amount
- [ ] Pending Installments and Open Tickets cards still visible alongside chart
