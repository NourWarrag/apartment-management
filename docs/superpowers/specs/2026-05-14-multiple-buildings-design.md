# Multiple Buildings — Design Spec

## Goal

Add a `Building` model so apartments (and all downstream data — bookings, payments, tickets) can be scoped per building. A building selector in the top nav filters the whole app. Reports show a per-building summary table alongside global totals.

## Architecture

A thin optional filter: existing list endpoints accept an optional `?buildingId=X` query param; when omitted they return all buildings unchanged. A React `BuildingContext` stores the selected building (persisted to `localStorage`) and every data-fetching hook appends `buildingId` to its query params automatically. The React Query cache key includes `buildingId`, so switching buildings triggers a fresh fetch with no extra logic.

---

## Schema Changes

### New model: `Building`

```prisma
model Building {
  id        Int        @id @default(autoincrement())
  name      String
  code      String     @unique
  address   String
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  createdBy Int?
  updatedBy Int?
  creator   User?      @relation("BuildingCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updater   User?      @relation("BuildingUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  apartments Apartment[]
}
```

Add back-relations on `User`:
```prisma
createdBuildings Building[] @relation("BuildingCreatedBy")
updatedBuildings Building[] @relation("BuildingUpdatedBy")
```

### Modified model: `Apartment`

- Add `buildingId Int` (required after migration)
- Add `building Building @relation(fields: [buildingId], references: [id], onDelete: Restrict)`
- Drop `@unique` on `number`
- Add `@@unique([buildingId, number])` — apartment numbers are unique per building, not globally

### Migration strategy

The migration SQL:
1. Creates the `Building` table
2. Inserts one default row: `name = 'Main Building'`, `code = 'MB'`, `address = ''`
3. Adds `buildingId` column to `Apartment` with a default of the new building's `id`
4. Removes the old `@unique` on `number` and adds the compound unique

This is a two-step Prisma migration: add column as nullable with default, then set NOT NULL. Zero data loss, zero manual work.

---

## API

### New resource: `/api/v1/buildings`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Any authenticated | List all buildings |
| POST | `/` | ADMIN | Create building |
| GET | `/:id` | Any authenticated | Get building by id |
| PATCH | `/:id` | ADMIN | Update building |
| DELETE | `/:id` | ADMIN | Hard-delete (only if no apartments assigned) |

Building object shape:
```json
{ "id": 1, "name": "Tower A", "code": "TA", "address": "123 Marina St" }
```

Delete guard: if building has any apartments (including soft-deleted), return `409 Conflict` with `"Cannot delete a building that has apartments"`.

### Modified endpoints — optional `?buildingId=X` filter

All filtering is done server-side by joining through `apartment.buildingId`. When `buildingId` is absent the endpoint behaves exactly as today.

| Endpoint | Filter added via |
|---|---|
| `GET /api/v1/apartments` | `where: { buildingId }` |
| `GET /api/v1/payments` | `where: { booking: { apartment: { buildingId } } }` |
| `GET /api/v1/tickets` | `where: { apartment: { buildingId } }` |
| `GET /api/v1/dashboard/stats` | all counts scoped to `buildingId` |
| `GET /api/v1/dashboard/activity` | events filtered to `buildingId` |
| `GET /api/v1/dashboard/revenue-trend` | payments filtered to `buildingId` |

`buildingId` param is parsed as an integer; non-numeric values return `400`.

### Apartment include — add building

The apartment list and detail responses include:
```typescript
building: { select: { id: true, name: true, code: true } }
```

### New endpoint: `GET /api/v1/reports/buildings`

Auth: ADMIN, FINANCE

Returns an array of per-building stats plus a global totals row:

```json
[
  {
    "buildingId": 1,
    "buildingName": "Tower A",
    "buildingCode": "TA",
    "totalApartments": 24,
    "occupied": 18,
    "occupancyRate": 0.75,
    "monthlyRevenue": 54000,
    "openTickets": 3
  },
  ...
  {
    "buildingId": null,
    "buildingName": "All Buildings",
    "buildingCode": null,
    "totalApartments": 60,
    "occupied": 45,
    "occupancyRate": 0.75,
    "monthlyRevenue": 135000,
    "openTickets": 8
  }
]
```

Server computes this with parallel Prisma queries grouped by buildingId.

---

## Client

### `BuildingContext` (`client/src/context/BuildingContext.tsx`)

```typescript
interface BuildingContextValue {
  selectedBuilding: { id: number; name: string; code: string } | 'all';
  setSelectedBuilding: (b: { id: number; name: string; code: string } | 'all') => void;
}
```

- Initialized from `localStorage` key `'selectedBuilding'` on mount
- Persists to `localStorage` on every change
- Wrapped around the app in `main.tsx` / `App.tsx`
- Exported as `useBuilding()` hook

### `useBuildings()` hook (`client/src/hooks/useBuildings.ts`)

Fetches `GET /api/v1/buildings`. `staleTime: 10 minutes` (buildings rarely change).

```typescript
export interface Building { id: number; name: string; code: string; address: string; }
```

### `BuildingSelector` component (`client/src/components/BuildingSelector.tsx`)

- Dropdown in the top nav bar
- Shows building `code` when a building is selected (compact), full name in the dropdown options
- Shows "All" when in global mode
- Populated by `useBuildings()`
- Calls `setSelectedBuilding` on change

### Hook changes — append `buildingId` to queries

Each hook reads `useBuilding()` and adds `buildingId` to its query params and React Query cache key:

- `useApartments()` → `?buildingId=X`
- `usePayments()` → `?buildingId=X`
- `useTickets()` → `?buildingId=X`
- `useDashboardStats()` → `?buildingId=X`
- `useDashboardActivity()` → `?buildingId=X`
- `useRevenueTrend(days)` → `?days=X&buildingId=Y`

Pattern for each:
```typescript
const { selectedBuilding } = useBuilding();
const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;
// Add to params: if (buildingId) params.set('buildingId', String(buildingId));
// Add to queryKey: ['apartments', { buildingId, ...otherFilters }]
```

### Building code badge on apartment rows/cards

When `selectedBuilding === 'all'`, apartment rows and cards show a small building code pill:
```tsx
{selectedBuilding === 'all' && (
  <span className="text-[10px] font-bold bg-secondary/10 text-secondary px-1.5 py-0.5 rounded uppercase tracking-wide">
    {apartment.building.code}
  </span>
)}
```

Hidden when scoped to a single building (redundant).

### Buildings admin page (`client/src/pages/buildings/BuildingsPage.tsx`)

ADMIN-only. Simple list of buildings with name, code, address. Add/Edit via inline modal (`BuildingFormModal.tsx`). Delete button (disabled if apartments exist — show tooltip "Remove all apartments first"). Linked from a "Buildings" nav item visible only to ADMIN.

### Reports page (`client/src/pages/reports/ReportsPage.tsx`)

Replaces the current placeholder. Shows the per-building summary table from `GET /api/v1/reports/buildings`. Always shows all buildings side-by-side regardless of the global selector (the selector is ignored on this page). Columns: Building, Apartments, Occupied, Occupancy %, Monthly Revenue, Open Tickets. Last row is the global total, visually emphasized (bold).

`useReportsBuildings()` hook fetches the endpoint. ADMIN and FINANCE roles only (same as current Reports nav item).

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `buildingId` param is non-numeric | `400 Bad Request` |
| `buildingId` refers to non-existent building | Empty results (no 404 — filter just matches nothing) |
| DELETE building with apartments | `409 Conflict` |
| `localStorage` value is stale (building deleted) | `BuildingContext` checks fetched buildings on mount; if stored `id` not found in results, resets to `'all'` and updates `localStorage` |

---

## Testing

### Server integration tests

1. `POST /buildings` — creates building, returns 201 with id/name/code/address
2. `GET /buildings` — returns all buildings
3. `DELETE /buildings/:id` with apartments → 409
4. `DELETE /buildings/:id` without apartments → 204, building soft-deleted
5. `GET /apartments?buildingId=1` — returns only apartments in building 1
6. `GET /dashboard/stats?buildingId=1` — totals match only building 1 apartments
7. `GET /reports/buildings` — returns one row per building plus global totals row

### Manual checklist

- [ ] BuildingSelector appears in top nav, populated with real building names
- [ ] Selecting a building filters Apartments, Payments, Tickets, Dashboard
- [ ] "All" resets to unfiltered view
- [ ] Switching buildings clears stale data (React Query cache invalidates by key)
- [ ] Building code badge appears on apartment rows in "All" mode, disappears in single-building mode
- [ ] Reports page shows per-building table regardless of selector
- [ ] BuildingsPage (ADMIN) allows create/edit/delete
