# Wave 2 — Staff Management + Settings Design Spec

## Goal

Add a User/Staff Management admin page (full CRUD, role assignment, deactivate/reactivate) and a Settings page (system-wide company settings + per-user preferences). Introduce two new roles: `SUPER_ADMIN` (above ADMIN, can manage admins) and `BUILDING_ADMIN` (scoped to one building, auto-filtered across the entire app).

## Architecture

**User management:** Extend the existing `users.controller.ts` with full CRUD endpoints. Deactivation reuses the existing `deletedAt` soft-delete field from Wave 1 — a user with `deletedAt` set is blocked from receiving a new JWT token. Reactivation writes directly via `prismaBase` to bypass the soft-delete extension.

**Settings:** A singleton `SystemSettings` row (id=1) stores company-wide config. The controller upserts on first access so no manual seed is needed. Personal preferences (language) remain in `localStorage`.

**Role scoping:** `BUILDING_ADMIN` users have `assignedBuildingId` set on their User record. The auth middleware attaches this to every request, and all list endpoints override any `?buildingId=` query param with the user's assigned building, ensuring they can never see other buildings' data.

---

## Schema Changes

### Modified model: `User`

Add one nullable field:

```prisma
assignedBuildingId Int?
assignedBuilding   Building? @relation("UserAssignedBuilding", fields: [assignedBuildingId], references: [id], onDelete: SetNull)
```

Only populated for `BUILDING_ADMIN` users. All other roles have `null`.

Add back-relation on `Building`:

```prisma
assignedUsers User[] @relation("UserAssignedBuilding")
```

### New model: `SystemSettings`

```prisma
model SystemSettings {
  id          Int    @id @default(autoincrement())
  companyName String @default("My Property")
  currency    String @default("AED")
  timezone    String @default("Asia/Dubai")
  phone       String @default("")
  email       String @default("")
  address     String @default("")
}
```

### Modified enum: `Role` (in `shared/`)

Add two values:

```typescript
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  BUILDING_ADMIN = 'BUILDING_ADMIN',
  RECEPTIONIST = 'RECEPTIONIST',
  MAINTENANCE = 'MAINTENANCE',
  FINANCE = 'FINANCE',
}
```

### Migration strategy

Single migration:
1. Add `SUPER_ADMIN` and `BUILDING_ADMIN` to the `Role` enum in Postgres
2. Add `assignedBuildingId` nullable column to `User` with FK to `Building`
3. Create `SystemSettings` table

No data backfill needed — existing users remain unchanged, `assignedBuildingId` is nullable.

---

## Permission Hierarchy

```
SUPER_ADMIN > ADMIN > BUILDING_ADMIN / RECEPTIONIST / FINANCE / MAINTENANCE
```

**Rules:**
- `requireRole(Role.ADMIN)` also passes `SUPER_ADMIN` automatically — update `role.middleware.ts` to treat SUPER_ADMIN as passing any role check.
- Creating or editing a user with role `ADMIN` requires `SUPER_ADMIN`.
- `ADMIN` can create/edit/deactivate users with roles: `BUILDING_ADMIN`, `RECEPTIONIST`, `MAINTENANCE`, `FINANCE`.
- An admin cannot deactivate their own account.

---

## API

### Extended: `GET /api/v1/users`

Auth: ADMIN, SUPER_ADMIN

Returns all users including deactivated (with `deletedAt`). Query param `?includeDeactivated=true` is always implied — the admin page needs to show all.

User response shape (never includes `passwordHash`):
```json
{
  "id": 1,
  "name": "Alice",
  "email": "alice@hotel.com",
  "role": "ADMIN",
  "assignedBuildingId": null,
  "assignedBuilding": null,
  "createdAt": "...",
  "deletedAt": null
}
```

For `BUILDING_ADMIN` users, `assignedBuilding: { id, name, code }` is included.

### New endpoints: `/api/v1/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | ADMIN, SUPER_ADMIN | List all users (incl. deactivated) |
| GET | `/:id` | ADMIN, SUPER_ADMIN | Get single user |
| POST | `/` | ADMIN, SUPER_ADMIN | Create user |
| PATCH | `/:id` | ADMIN, SUPER_ADMIN | Update name, email, role, assignedBuildingId |
| POST | `/:id/deactivate` | ADMIN, SUPER_ADMIN | Set deletedAt = now() |
| POST | `/:id/reactivate` | ADMIN, SUPER_ADMIN | Set deletedAt = null |

**Create validation:**
- `name`, `email`, `password`, `role` required
- Email unique (409 if taken)
- `assignedBuildingId` required when `role === BUILDING_ADMIN`, forbidden otherwise
- Creating role `ADMIN` requires caller to be `SUPER_ADMIN`
- Password hashed with bcrypt before storing

**Update validation:**
- At least one field required
- Changing role to `ADMIN` requires caller to be `SUPER_ADMIN`
- Changing to/from `BUILDING_ADMIN` validates `assignedBuildingId` accordingly

**Deactivate guard:** Cannot deactivate your own account (403).

### New resource: `/api/v1/settings`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Any authenticated | Fetch system settings (upserts defaults on first call) |
| PATCH | `/` | ADMIN, SUPER_ADMIN | Update one or more fields |

PATCH accepts any subset of: `companyName`, `currency`, `timezone`, `phone`, `email`, `address`. Unknown fields ignored.

---

## Auth Middleware Changes

### BUILDING_ADMIN auto-scoping

After verifying the JWT, if `payload.role === BUILDING_ADMIN`:
1. Fetch the user record to get `assignedBuildingId`
2. Attach `req.user.assignedBuildingId` to the request
3. All list endpoints check: if `req.user.role === BUILDING_ADMIN`, force `buildingId = req.user.assignedBuildingId` (overrides any `?buildingId=` query param)

To avoid an extra DB query on every request, embed `assignedBuildingId` in the JWT payload at login time. Update `auth.controller.ts` (`login`) to include it in `signToken`.

### JWT payload — include assignedBuildingId

Update `signToken` (in `server/src/lib/jwt.ts`) to accept and embed `assignedBuildingId: number | null` in the token payload. Update `AuthRequest` in `auth.middleware.ts` so `req.user` includes `assignedBuildingId: number | null`. This avoids a DB lookup on every request for BUILDING_ADMIN scoping.

In `auth.controller.ts` `login`, fetch `assignedBuildingId` from the user record and pass it to `signToken`.

### BUILDING_ADMIN write scoping

For write endpoints (create/update apartment, create ticket, etc.), if `req.user.role === BUILDING_ADMIN` and the request body contains a `buildingId` that differs from `req.user.assignedBuildingId`, return `403 Forbidden`. This prevents BUILDING_ADMIN users from writing to buildings they don't manage. Implement as a helper `assertBuildingAccess(req, buildingId)` called in the relevant controllers.

### Login — block deactivated users

In `auth.controller.ts` `login`, after finding the user by email, check `user.deletedAt !== null` → return `401 Unauthorized` with message `"Account deactivated"`.

---

## Client

### `useUsers` hook (`client/src/hooks/useUsers.ts`)

```typescript
export interface UserListItem {
  id: number;
  name: string;
  email: string;
  role: Role;
  assignedBuildingId: number | null;
  assignedBuilding: { id: number; name: string; code: string } | null;
  createdAt: string;
  deletedAt: string | null;
}

export function useUsers() {
  return useQuery<UserListItem[]>({
    queryKey: ['users'],
    queryFn: async () => { const res = await api.get('/users'); return res.data; },
    staleTime: 2 * 60 * 1000,
  });
}
```

### `useUsersMutations` hook (`client/src/hooks/useUsersMutations.ts`)

Exports: `useCreateUser`, `useUpdateUser(id)`, `useDeactivateUser`, `useReactivateUser` — each invalidates `['users']` on success.

### `UserFormModal` (`client/src/pages/users/UserFormModal.tsx`)

- **Create mode**: name, email, password, role select, building select (appears only when role = BUILDING_ADMIN)
- **Edit mode**: name, email, role select, building select (if BUILDING_ADMIN) — no password field
- Role options shown depend on caller's role: SUPER_ADMIN sees all 6; ADMIN sees BUILDING_ADMIN, RECEPTIONIST, MAINTENANCE, FINANCE (not SUPER_ADMIN or ADMIN)

### `UsersPage` (`client/src/pages/users/UsersPage.tsx`)

Table columns: Name, Email, Role (colored badge), Building (shown only for BUILDING_ADMIN rows), Status (Active / Deactivated), Actions.

- Deactivated rows: muted text, "Reactivate" button instead of "Deactivate"
- Own row: Deactivate button disabled with tooltip "Cannot deactivate your own account"
- Add User button (top right)

Role badge colors:
- `SUPER_ADMIN` — purple
- `ADMIN` — primary (blue)
- `BUILDING_ADMIN` — secondary (teal)
- `RECEPTIONIST` — amber
- `FINANCE` — green
- `MAINTENANCE` — orange

### `useSettings` + `useSettingsMutation` (`client/src/hooks/`)

```typescript
export interface SystemSettings {
  companyName: string;
  currency: string;
  timezone: string;
  phone: string;
  email: string;
  address: string;
}
```

`useSettings()` — `queryKey: ['settings']`, `staleTime: 30 minutes`.
`useUpdateSettings()` — PATCH, invalidates `['settings']` on success.

### `SettingsPage` (`client/src/pages/settings/SettingsPage.tsx`)

Two sections:

**System Settings** (ADMIN/SUPER_ADMIN editable, read-only for others):
- Fields: Company Name, Currency (select: AED, USD, EUR, GBP), Timezone (select of common zones), Phone, Email, Address
- Inline edit pattern: each field shows a pencil icon on hover; clicking opens an inline input with Save/Cancel. Non-admin users see plain text.

**User Preferences** (all users, localStorage):
- Language toggle (EN / AR) — same toggle already in the app, surfaced here as a proper control

### Sidebar + Routes

- **Users** nav item: icon `group`, ADMIN and SUPER_ADMIN only, after Buildings
- **Settings** nav item: icon `settings`, all authenticated users, replaces current `href="#"` placeholder
- `App.tsx`: `/users` route (ADMIN + SUPER_ADMIN), `/settings` route (all authenticated)
- Add i18n keys: `nav.users`, `nav.settings` in `en/translation.json` and `ar/translation.json`

### BuildingSelector visibility

In `BuildingSelector.tsx`, add: if `user.role === Role.BUILDING_ADMIN`, return null (selector hidden — they're locked to their building).

---

## Error Handling

| Scenario | Response |
|---|---|
| Login with deactivated account | 401 `"Account deactivated"` |
| Create user with duplicate email | 409 `"Email already in use"` |
| Create BUILDING_ADMIN without assignedBuildingId | 400 `"assignedBuildingId required for BUILDING_ADMIN"` |
| Non-SUPER_ADMIN tries to create ADMIN | 403 `"Only SUPER_ADMIN can create ADMIN users"` |
| Admin tries to deactivate self | 403 `"Cannot deactivate your own account"` |
| BUILDING_ADMIN accesses data outside their building | Silently filtered (auto-scope overrides param) |
| PATCH /settings with unknown fields | Fields ignored silently |

---

## Testing

### Server integration tests

1. `POST /users` — creates user, returns 201 with correct shape (no passwordHash)
2. `POST /users` with duplicate email → 409
3. `POST /users` with role ADMIN by non-SUPER_ADMIN → 403
4. `POST /users/:id/deactivate` → 200; subsequent login → 401
5. `POST /users/:id/reactivate` → 200; subsequent login → 200
6. Admin deactivates self → 403
7. `GET /settings` on fresh DB → returns defaults
8. `PATCH /settings` → updates fields, GET returns updated values
9. BUILDING_ADMIN login includes `assignedBuildingId` in JWT
10. BUILDING_ADMIN request to `GET /apartments` ignores `?buildingId=` param and returns only their building

### Manual checklist

- [ ] UsersPage lists all users including deactivated (muted rows)
- [ ] Create BUILDING_ADMIN shows building select
- [ ] Deactivated user cannot log in ("Account deactivated" error)
- [ ] Reactivated user can log in again
- [ ] BUILDING_ADMIN sees only their building's data everywhere
- [ ] BuildingSelector hidden for BUILDING_ADMIN
- [ ] Settings page shows company info fields, inline edit works for ADMIN
- [ ] Language toggle in Settings saves preference
- [ ] Settings fields read-only for non-ADMIN roles
