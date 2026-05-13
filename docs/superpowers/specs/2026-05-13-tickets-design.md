# Maintenance Tickets — Sub-phase 3C Design Spec

## Goal

Build the Maintenance Tickets page: a Kanban board (3 columns: Open, In Progress, Completed) with a 4th right-panel column that appears when a ticket is selected, a toggle to switch to a flat list view, a "New Ticket" modal (ADMIN/RECEPTIONIST only), and a metrics row below the board. MAINTENANCE staff can update status and notes on their own assigned tickets. CLOSED tickets are hidden from all views.

## Architecture

Four server endpoints under `/api/v1/tickets` plus one under `/api/v1/users`. The client adds `useTickets`, `useCreateTicket`, `useUpdateTicket` hooks; a `TicketsPage` (Kanban + list toggle), `TicketCard`, `TicketDetailPanel` (4th grid column), and `NewTicketModal`.

## Tech Stack

- **Server:** Express + Prisma (existing pattern), TypeScript
- **Client:** React Query, React Router, Tailwind MD3 tokens, Material Symbols Outlined

---

## Server

### Endpoints

```
GET  /api/v1/tickets           → list       (authMiddleware, all roles)
POST /api/v1/tickets           → create     (ADMIN | RECEPTIONIST)
PATCH /api/v1/tickets/:id      → update     (ADMIN | RECEPTIONIST | MAINTENANCE own)
GET  /api/v1/tickets/stats     → stats      (authMiddleware, all roles)
GET  /api/v1/users/maintenance-staff → list MAINTENANCE users (ADMIN | RECEPTIONIST)
```

### File: `server/src/controllers/tickets.controller.ts`

#### `list` handler

Query params: `status` (OPEN | IN_PROGRESS | COMPLETED), `priority` (LOW | MEDIUM | HIGH).

- Always excludes `status: 'CLOSED'` from results (append to where clause regardless of filter)
- MAINTENANCE role: additionally filters `assignedToId === req.user.id`
- ADMIN/RECEPTIONIST: no additional scoping

Runs two queries in parallel:
1. `prisma.maintenanceTicket.count({ where })`
2. `prisma.maintenanceTicket.findMany({ where, orderBy: { createdAt: 'desc' }, include: { apartment: { select: { id, number, floor } }, assignedTo: { select: { id, name } } } })`

Note: User model has `name` field — confirm spelling against schema before implementing.

Response shape:
```json
{
  "data": [
    {
      "id": 1,
      "description": "Water leak in bathroom",
      "priority": "HIGH",
      "status": "OPEN",
      "notes": null,
      "createdAt": "2026-05-13T08:00:00Z",
      "resolvedAt": null,
      "apartment": { "id": 1, "number": "402", "floor": 4 },
      "assignedTo": { "id": 3, "name": "Alex Rivera" }
    }
  ]
}
```

Ticket number displayed in UI: `MNT-{id.toString().padStart(4, '0')}`.

#### `create` handler

Body: `{ apartmentId: number, description: string, priority: 'LOW' | 'MEDIUM' | 'HIGH', assignedToId?: number }`

Validation:
- `apartmentId`, `description`, `priority` required — 400 if missing
- `description` must be non-empty string — 400 if blank
- `priority` must be valid enum value — 400 if not
- Apartment must exist — 404 if not
- If `assignedToId` provided, user must exist and have `role: MAINTENANCE` — 400 if not

Returns 201 with created ticket (same include shape as list).

#### `update` handler

Param: `id` (ticket id)

Role-based field restriction:
- **MAINTENANCE:** can only update `status` and `notes` on tickets where `assignedToId === req.user.id`. Returns 403 if ticket belongs to someone else, or if they attempt to update `priority`, `assignedToId`, or `apartmentId`.
- **ADMIN/RECEPTIONIST:** can update any field on any ticket.

Status transition logic:
- `COMPLETED` status: automatically set `resolvedAt: new Date()`
- `OPEN` or `IN_PROGRESS` status: clear `resolvedAt: null`

Returns 200 with updated ticket (same include shape as list). Returns 404 if ticket not found.

#### `stats` handler

No query params. Returns aggregate stats across all non-CLOSED tickets (role-scoped same as list):

```json
{
  "open": 3,
  "inProgress": 2,
  "completed": 1,
  "resolved24h": 5,
  "avgResolutionHours": 2.4
}
```

- `resolved24h`: count of COMPLETED tickets where `resolvedAt >= now - 24h`
- `avgResolutionHours`: average of `(resolvedAt - createdAt)` in hours, for all COMPLETED tickets with non-null `resolvedAt`. Returns `null` if no completed tickets.

Run with `Promise.all` for parallelism.

#### `maintenance-staff` handler

File: `server/src/controllers/users.controller.ts` (new file, or add to existing if one exists)

Route: `GET /api/v1/users/maintenance-staff`
Role: ADMIN | RECEPTIONIST

Returns all users with `role: MAINTENANCE`:
```json
[{ "id": 3, "name": "Alex Rivera" }, ...]
```

### Registration: `server/src/app.ts`

```ts
import ticketsRoutes from './routes/tickets.routes';
import usersRoutes from './routes/users.routes';
app.use('/api/v1/tickets', ticketsRoutes);
app.use('/api/v1/users', usersRoutes);
```

Note: check whether a users route already exists before creating a new one.

---

## Client

### File: `client/src/hooks/useTickets.ts`

```ts
export interface TicketItem {
  id: number;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  apartment: { id: number; number: string; floor: number };
  assignedTo: { id: number; name: string } | null;
}

export interface TicketStats {
  open: number;
  inProgress: number;
  completed: number;
  resolved24h: number;
  avgResolutionHours: number | null;
}

export interface CreateTicketDto {
  apartmentId: number;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assignedToId?: number;
}

export interface UpdateTicketDto {
  status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  notes?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  assignedToId?: number | null;
}

export function useTickets(filters?: { status?: string; priority?: string })
  // GET /tickets, queryKey: ['tickets', filters]

export function useTicketStats()
  // GET /tickets/stats, queryKey: ['tickets', 'stats']

export function useMaintenanceStaff()
  // GET /users/maintenance-staff, queryKey: ['users', 'maintenance-staff']

export function useCreateTicket()
  // POST /tickets, invalidates ['tickets'] and ['tickets', 'stats']

export function useUpdateTicket()
  // PATCH /tickets/:id (mutate with { id, ...dto }), invalidates ['tickets'] and ['tickets', 'stats']
```

### File: `client/src/pages/tickets/TicketsPage.tsx`

Layout:
1. **Header** — "Maintenance Tickets" title + subtitle + "New Ticket" button (ADMIN/RECEPTIONIST only) + view toggle (kanban / list icons, top right)
2. **Kanban view** (default) — see below
3. **List view** — flat table, toggled
4. **Metrics row** — 4 stat tiles below the board (both views)

**Kanban layout:**
- `grid grid-cols-3` normally, transitions to `grid grid-cols-4` when `activeTicket` is set
- Three ticket columns + optional TicketDetailPanel column
- Each column: header with colored dot + label + count badge
- Column colors:
  - OPEN: `bg-error` dot
  - IN_PROGRESS: `bg-secondary` dot
  - COMPLETED: `bg-on-tertiary-container` dot
- `TicketCard` components rendered per column

**List view:**
- Table columns: Ticket #, Apartment, Description (truncated to 60 chars), Priority, Status, Assigned To, Created
- Same role scoping (MAINTENANCE only sees their own)
- Status badges match Kanban colors
- Click row → opens TicketDetailPanel (as a modal in list mode)

**Metrics row** (below board, always visible):
- 4 tiles in `grid-cols-4`: Open Tickets, In Progress, Resolved (24h), Avg Resolution Time
- Data from `useTicketStats()`
- Format avgResolutionHours: `2.4 hrs` or `—` if null

### File: `client/src/pages/tickets/TicketCard.tsx`

Props: `{ ticket: TicketItem; isActive: boolean; onClick: () => void }`

Displays:
- Top row: `MNT-{id.padStart(4,'0')}` (muted, 11px) + priority badge (right)
- Title: `ticket.description` truncated to ~60 chars, bold
- Apartment: `Apt. {number}` in muted text
- Bottom row: assignee initials avatar (or empty circle) + time-ago

**Priority badge colors:**
- HIGH: `bg-primary text-on-primary`
- MEDIUM: `bg-tertiary-fixed text-on-tertiary-fixed-variant`
- LOW: `bg-surface-container-high text-on-surface-variant`

(Design shows "Critical" but schema only has HIGH/MEDIUM/LOW — map HIGH→"High", MEDIUM→"Medium", LOW→"Low")

Active card: `border-2 border-primary ring-4 ring-primary/5`

### File: `client/src/pages/tickets/TicketDetailPanel.tsx`

Props: `{ ticket: TicketItem; onClose: () => void; canEditAll: boolean }`

`canEditAll` is true for ADMIN/RECEPTIONIST; false for MAINTENANCE (can only edit status/notes).

Content:
- Header: "Ticket Details" + close button
- **Status section:** label "STATUS" + status dropdown button (shows current status, expands to valid next states only)
  - Valid transitions: OPEN → IN_PROGRESS, IN_PROGRESS → COMPLETED, IN_PROGRESS → OPEN
  - Completed tickets: no further transitions available (read-only badge)
- **Ticket info block:** `MNT-XXXX` + priority badge + description text
- **Assigned Staff** (ADMIN/RECEPTIONIST: dropdown to change; MAINTENANCE: read-only name card)
  - Staff card: avatar initial + name
- **Resolution Notes:** textarea (editable by ADMIN/RECEPTIONIST/assigned MAINTENANCE), placeholder "Describe the steps taken to resolve the issue..."
- **Action buttons:**
  - "Save Draft" — calls `useUpdateTicket` with `{ notes }` only, no status change
  - "Mark Resolved" — calls `useUpdateTicket` with `{ status: 'COMPLETED' }`. Hidden if already COMPLETED.

### File: `client/src/pages/tickets/NewTicketModal.tsx`

Props: `{ open: boolean; onClose: () => void }`

Fields:
- **Apartment** — select from all apartments (use existing `useApartments()` with no filter)
- **Description** — textarea, required
- **Priority** — select: Low / Medium / High, required
- **Assign To** — select from `useMaintenanceStaff()`, optional

Submit: calls `useCreateTicket()`. On success: close modal, list refreshes. On error: inline error below submit.

### App.tsx wiring

```tsx
import TicketsPage from './pages/tickets/TicketsPage';
// Replace /maintenance placeholder:
<Route path="maintenance" element={
  <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE]}>
    <TicketsPage />
  </ProtectedRoute>
} />
```

Note: FINANCE role has no access to tickets.

---

## Error Handling

| Scenario | Server response | Client behaviour |
|---|---|---|
| Missing required field | 400 `{ message }` | Inline error in modal |
| Invalid priority/status | 400 | Inline error |
| Apartment/user not found | 404 | Inline error |
| MAINTENANCE updates other's ticket | 403 | Inline error in panel |
| MAINTENANCE updates forbidden fields | 403 | Fields hidden in UI |
| Ticket not found | 404 | Inline error in panel |
| Unauthenticated | 401 | Axios interceptor → /login |
| Prisma / unexpected | 500 | Inline error |

---

## Testing

### Server integration tests (`server/src/controllers/tickets.controller.test.ts`)

1. `GET /api/v1/tickets` — returns 401 without auth
2. `GET /api/v1/tickets` — MAINTENANCE user only sees their assigned tickets (not others')
3. `GET /api/v1/tickets` — CLOSED tickets are excluded even without status filter
4. `GET /api/v1/tickets?status=OPEN` — all returned items have `status === 'OPEN'`
5. `POST /api/v1/tickets` — 403 for MAINTENANCE and FINANCE roles
6. `POST /api/v1/tickets` — creates ticket with correct fields + apartment/assignee in response
7. `POST /api/v1/tickets` — missing description returns 400
8. `PATCH /api/v1/tickets/:id` — MAINTENANCE can update status/notes on own ticket
9. `PATCH /api/v1/tickets/:id` — MAINTENANCE gets 403 updating another user's ticket
10. `PATCH /api/v1/tickets/:id` — ADMIN can update any ticket including assignedToId
11. `PATCH /api/v1/tickets/:id` — status COMPLETED sets resolvedAt; OPEN clears it
12. `PATCH /api/v1/tickets/:id` — 404 for non-existent ticket
13. `GET /api/v1/tickets/stats` — returns correct shape with open, inProgress, completed, resolved24h, avgResolutionHours
14. `GET /api/v1/users/maintenance-staff` — returns only MAINTENANCE role users; 403 for MAINTENANCE/FINANCE roles

### Manual test checklist

- [ ] Kanban loads with 3 columns; CLOSED tickets not shown
- [ ] Clicking a ticket card opens the detail panel as a 4th column
- [ ] Active ticket card has blue border + ring highlight
- [ ] Status dropdown only shows valid next transitions
- [ ] "Mark Resolved" sets status to COMPLETED and hides the button
- [ ] "Save Draft" saves notes without changing status
- [ ] MAINTENANCE user cannot see other staff's tickets
- [ ] MAINTENANCE user cannot see assignee dropdown (read-only)
- [ ] "New Ticket" button hidden from MAINTENANCE and FINANCE roles
- [ ] List view toggle shows flat table with same data
- [ ] Metrics row shows correct counts and avg resolution time
- [ ] NewTicketModal creates ticket and refreshes board
