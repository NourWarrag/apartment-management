# Bookings Page Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Goal

Add a standalone Bookings page accessible from the sidebar, giving receptionists and admins a unified view of all bookings across the system with filtering, search, and pagination.

---

## Architecture

New `GET /bookings` list endpoint with server-side filtering and pagination. A `useBookingsList` hook queries it. `BookingsPage` mirrors the ApartmentsPage pattern (stats bar + filter bar + table). Row click opens the existing `BookingInvoiceModal` — no new modal needed.

---

## API

### New: `GET /bookings`

Auth: ADMIN, RECEPTIONIST, BUILDING_ADMIN

**Query params:**

| Param | Type | Description |
|---|---|---|
| `search` | string | Case-insensitive match on tenant full name or apartment number |
| `status` | `ACTIVE` \| `UPCOMING` \| `CHECKED_OUT` | Derived server-side (see below) |
| `buildingId` | number | Filter by building |
| `from` | date string (YYYY-MM-DD) | checkIn ≥ from |
| `to` | date string (YYYY-MM-DD) | checkIn ≤ to |
| `page` | number | Default 1, clamped ≥ 1 |
| `limit` | number | Default 20, max 100 |

**Status derivation (server-side, based on current time):**
- `UPCOMING`: `checkIn > now` AND `checkedOutAt IS NULL`
- `ACTIVE`: `checkIn ≤ now` AND `checkedOutAt IS NULL`
- `CHECKED_OUT`: `checkedOutAt IS NOT NULL`

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "checkIn": "2026-06-01T00:00:00.000Z",
      "checkOut": "2026-07-01T00:00:00.000Z",
      "totalAmount": "5000",
      "depositStatus": "HELD",
      "checkedOutAt": null,
      "createdAt": "2026-05-01T09:00:00.000Z",
      "tenant": { "id": 2, "fullName": "Nour W", "phone": "0501234567" },
      "apartment": {
        "id": 1,
        "number": "101",
        "floor": 1,
        "type": "STUDIO",
        "building": { "id": 1, "name": "Al Noor Tower" }
      }
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

**Error handling:**

| Scenario | Response |
|---|---|
| Invalid `from`/`to` date format | 400 `"Invalid date format"` |
| Invalid/missing `page` or `limit` | Silently clamped (page ≥ 1, limit max 100) |
| Invalid `buildingId` | Empty results (not 404) |
| No results | `{ data: [], total: 0, page: 1, limit: 20 }` |

---

## Client

### Files

| Action | File |
|---|---|
| Modify | `server/src/controllers/bookings.controller.ts` |
| Modify | `server/src/routes/bookings.routes.ts` |
| Modify | `client/src/hooks/useBookings.ts` |
| Create | `client/src/pages/bookings/BookingsPage.tsx` |
| Modify | `client/src/App.tsx` |
| Modify | `client/src/components/layout/Sidebar.tsx` |

### Sidebar

Add nav item between Apartments and Tenants:
```typescript
{ to: '/bookings', icon: 'calendar_month', label: 'Bookings', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN] }
```

### Route

Add `/bookings` → `BookingsPage` in `App.tsx`, same pattern as other pages.

### Hook: `useBookingsList`

Add to `client/src/hooks/useBookings.ts`:

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

export function useBookingsList(params: BookingsListParams) {
  return useQuery({
    queryKey: ['bookings', params],
    queryFn: async () => {
      const res = await api.get('/bookings', { params });
      return res.data as BookingsListResponse;
    },
  });
}
```

### BookingsPage layout

**Stats bar (4 cards)** — all reflect current filters (search, buildingId, from, to — but not the status filter):
- Total Bookings
- Active
- Upcoming
- Checked Out

Implementation: four `useBookingsList` calls sharing the current non-status filter params, each with `limit: 1` and a different `status` value (plus one with no status for Total). The `total` field from each response gives the count. React Query deduplicates concurrent calls with matching query keys.

**Filter bar:**
- Search input (debounced, 300ms) — placeholder "Search tenant or apartment…"
- Status dropdown: All / Active / Upcoming / Checked Out
- Building dropdown: All Buildings / [building names] — uses existing buildings data
- From date input / To date input

**Table columns:**

| Column | Value |
|---|---|
| Tenant | fullName |
| Apartment | number (e.g. "101") |
| Building | building.name |
| Check-in | formatted date |
| Check-out | formatted date |
| Total (AED) | formatted number |
| Deposit | badge: NONE / HELD / RELEASED / FORFEITED |
| Status | badge: Active (green) / Upcoming (blue) / Checked Out (grey) |

Row click → opens `BookingInvoiceModal` with `bookingId={row.id}`.

**Pagination:** 20 per page, server-side. Previous / Next buttons + "Showing X–Y of Z" label. Reset to page 1 when any filter changes.

---

## Testing

### Server integration tests

1. `GET /bookings` — returns paginated list with correct shape (tenant, apartment, building nested), respects `limit` and `page`
2. `GET /bookings?status=ACTIVE` — returns only bookings where checkIn ≤ now and checkedOutAt is null

### Manual checklist

- [ ] Bookings nav item appears for ADMIN, RECEPTIONIST, BUILDING_ADMIN; hidden for MAINTENANCE, FINANCE
- [ ] Stats cards reflect current filter state
- [ ] Search by tenant name returns matching bookings
- [ ] Search by apartment number returns matching bookings
- [ ] Status filter correctly shows only ACTIVE / UPCOMING / CHECKED_OUT bookings
- [ ] Building filter works in multi-building setup
- [ ] Date range (from/to) filters correctly by checkIn date
- [ ] Row click opens BookingInvoiceModal with correct booking data
- [ ] Pagination: next/prev works, total count is correct
- [ ] Page resets to 1 when any filter changes
