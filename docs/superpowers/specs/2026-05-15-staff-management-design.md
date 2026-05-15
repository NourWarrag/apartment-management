# Staff Management Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Goal

Add a Staff tab to the Users page showing MAINTENANCE staff with live status, replace the hardcoded ApartmentsPage widget with real data, and extend the ticket system with a CLEANING type so receptionists can dispatch cleaning tasks to staff.

---

## Architecture

Two small schema additions (no new models): `StaffStatus` enum on `User` and `TicketType` enum on `MaintenanceTicket`. Existing ticket infrastructure (routes, controller, assignment, TicketsPage) is reused for cleaning tasks — only a `type` field and filter are added. The ApartmentsPage widget is wired to the existing `GET /users/maintenance-staff` endpoint (extended to include `staffStatus`).

---

## Schema

### Add to `User` model

```prisma
enum StaffStatus {
  ACTIVE
  ON_CALL
  OFF_DUTY
}

// On User model:
staffStatus StaffStatus @default(OFF_DUTY)
```

### Add to `MaintenanceTicket` model

```prisma
enum TicketType {
  MAINTENANCE
  CLEANING
}

// On MaintenanceTicket model:
type TicketType @default(MAINTENANCE)
```

**Migration:** Single migration adding both enums and both columns. Existing users get `OFF_DUTY` by default. Existing tickets get `MAINTENANCE` by default. No backfill needed.

---

## API

### Modified: `GET /users/maintenance-staff`

Add `staffStatus` to the select:

```json
[{ "id": 1, "name": "Ahmed", "staffStatus": "ACTIVE" }]
```

Auth: ADMIN, RECEPTIONIST, BUILDING_ADMIN (unchanged)

### Modified: `PATCH /users/:id`

Add `staffStatus` to allowed update fields (ADMIN/SUPER_ADMIN only, unchanged auth).

Validation: `staffStatus` must be one of `ACTIVE | ON_CALL | OFF_DUTY` → 400 `"Invalid staff status"` if not.

### Modified: `GET /tickets`

Add optional `type` query param: `MAINTENANCE | CLEANING`. If omitted, returns all types.

### Modified: `POST /tickets`

Accept optional `type` field (default: `MAINTENANCE`). Validation: must be `MAINTENANCE` or `CLEANING` → 400 `"Invalid ticket type"` if not.

### Modified: `PATCH /tickets/:id`

Allow `type` field update for ADMIN/RECEPTIONIST. MAINTENANCE staff cannot change `type` (field ignored if passed by MAINTENANCE role).

---

## Error Handling

| Scenario | Response |
|---|---|
| `PATCH /users/:id` with invalid `staffStatus` | 400 `"Invalid staff status"` |
| `POST /tickets` with invalid `type` | 400 `"Invalid ticket type"` |
| MAINTENANCE staff passes `type` in PATCH | Field silently ignored |
| `assignedToId` on cleaning ticket points to non-MAINTENANCE user | 400 `"Assigned user must have MAINTENANCE role"` (existing behaviour, unchanged) |

---

## Client

### Files

| Action | File |
|---|---|
| Modify | `server/prisma/schema.prisma` |
| Modify | `server/src/controllers/users.controller.ts` |
| Modify | `server/src/controllers/tickets.controller.ts` |
| Modify | `server/src/controllers/users.controller.test.ts` |
| Modify | `server/src/controllers/tickets.controller.test.ts` |
| Modify | `client/src/pages/users/UsersPage.tsx` — add Staff tab |
| Modify | `client/src/pages/apartments/ApartmentsPage.tsx` — replace hardcoded widget |
| Modify | `client/src/pages/tickets/TicketsPage.tsx` — add type filter |
| Modify | `client/src/pages/tickets/NewTicketModal.tsx` — add type field |

### Users page — Staff tab

Add a "Staff" tab alongside the existing user list, filtered to MAINTENANCE role users.

Columns: Name | Email | Building | Status (badge)

Status badges:
- `ACTIVE` → green
- `ON_CALL` → amber
- `OFF_DUTY` → grey

Each row has an inline status dropdown (ADMIN only) that calls `PATCH /users/:id` with the new `staffStatus`. On success: toast + optimistic update via query invalidation.

### ApartmentsPage widget

Replace the 3 hardcoded entries with real data from `GET /users/maintenance-staff`.

- Each entry: staff name + `staffStatus` badge (same colour scheme as Staff tab)
- "Dispatch New Task" button opens `NewTicketModal` pre-set to `type = CLEANING`
- If no MAINTENANCE staff exist: show "No staff on record."

### TicketsPage

Add a Type filter: **All | Maintenance | Cleaning** (tab or dropdown, consistent with existing filter style).

Cleaning tickets distinguished by a broom icon (`cleaning_services` Material Symbol) in the ticket card/row.

### NewTicketModal

Add a **Type** field: radio or select — Maintenance (default) / Cleaning.

Visible to ADMIN and RECEPTIONIST only (MAINTENANCE staff cannot set type).

---

## Testing

### Server integration tests

1. `GET /users/maintenance-staff` — response includes `staffStatus` field on each user
2. `PATCH /users/:id` with `{ staffStatus: 'ON_CALL' }` → 200, user has updated status
3. `PATCH /users/:id` with invalid `staffStatus` → 400 `"Invalid staff status"`
4. `POST /tickets` with `{ type: 'CLEANING', ... }` → ticket created with `type = CLEANING`
5. `GET /tickets?type=CLEANING` → returns only cleaning tickets
6. `POST /tickets` with invalid `type` → 400 `"Invalid ticket type"`

### Manual checklist

- [ ] Staff tab in Users page shows only MAINTENANCE users with status badges
- [ ] Status dropdown updates live (ADMIN only; hidden for other roles)
- [ ] ApartmentsPage widget shows real staff names and statuses
- [ ] "Dispatch New Task" opens ticket modal pre-set to Cleaning type
- [ ] TicketsPage type filter correctly shows only Maintenance or Cleaning tickets
- [ ] New ticket modal lets receptionist/admin choose type; defaults to Maintenance
- [ ] Cleaning tickets show broom icon to distinguish from maintenance tickets
- [ ] Cleaning tickets are visible to assigned MAINTENANCE staff on their TicketsPage
- [ ] MAINTENANCE staff cannot change ticket type
