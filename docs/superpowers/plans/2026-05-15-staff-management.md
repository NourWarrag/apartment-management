# Staff Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Staff tab to UsersPage showing MAINTENANCE staff with live status, replace the hardcoded ApartmentsPage widget with real API data, and extend the ticket system with a CLEANING type for dispatching cleaning tasks.

**Architecture:** Two schema additions (StaffStatus enum on User, TicketType enum on MaintenanceTicket) with no new models or routes. Existing ticket infrastructure (controller, routes, TicketsPage) handles cleaning tasks via a `type` filter. The ApartmentsPage widget is wired to the existing `GET /users/maintenance-staff` endpoint, extended to return `staffStatus`.

**Tech Stack:** Prisma/PostgreSQL, Express/TypeScript, React + TanStack Query + Tailwind MD3, Vitest

---

## File Map

| Action | File |
|---|---|
| Modify | `server/prisma/schema.prisma` — add StaffStatus enum + field on User, TicketType enum + field on MaintenanceTicket |
| Modify | `packages/shared/src/index.ts` — export StaffStatus, TicketType enums |
| Modify | `server/src/controllers/users.controller.ts` — staffStatus in maintenanceStaff select + update |
| Modify | `server/src/controllers/tickets.controller.ts` — type in create/list/update |
| Modify | `server/src/controllers/users.controller.test.ts` — tests for staffStatus |
| Modify | `server/src/controllers/tickets.controller.test.ts` — tests for type field |
| Modify | `client/src/hooks/useTickets.ts` — update MaintenanceStaff type to include staffStatus |
| Modify | `client/src/pages/users/UsersPage.tsx` — add Staff tab |
| Modify | `client/src/pages/apartments/ApartmentsPage.tsx` — replace hardcoded widget |
| Modify | `client/src/pages/tickets/NewTicketModal.tsx` — add type field + defaultType prop |
| Modify | `client/src/pages/tickets/TicketsPage.tsx` — add type filter |

---

### Task 1: Schema + shared enums

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Update schema.prisma**

Open `server/prisma/schema.prisma`. Add the two new enums and fields.

**Add these two enums** anywhere with the other enums (after `DepositStatus` is fine):

```prisma
enum StaffStatus {
  ACTIVE
  ON_CALL
  OFF_DUTY
}

enum TicketType {
  MAINTENANCE
  CLEANING
}
```

**Add `staffStatus` to the `User` model** (after the `role` field):

```prisma
staffStatus StaffStatus @default(OFF_DUTY)
```

**Add `type` to the `MaintenanceTicket` model** (after the `status` field):

```prisma
type TicketType @default(MAINTENANCE)
```

- [ ] **Step 2: Add enums to shared package**

Open `packages/shared/src/index.ts`. Find where the other enums are exported and add:

```typescript
export enum StaffStatus {
  ACTIVE = 'ACTIVE',
  ON_CALL = 'ON_CALL',
  OFF_DUTY = 'OFF_DUTY',
}

export enum TicketType {
  MAINTENANCE = 'MAINTENANCE',
  CLEANING = 'CLEANING',
}
```

- [ ] **Step 3: Run migration**

```bash
cd "D:/Hotel Apartment Management System/server"
npx prisma migrate dev --name add-staff-status-ticket-type
```

Expected: migration created and applied, no errors.

- [ ] **Step 4: Regenerate Prisma client**

```bash
cd "D:/Hotel Apartment Management System/server"
npx prisma generate
```

Expected: client generated successfully.

- [ ] **Step 5: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add server/prisma/schema.prisma server/prisma/migrations packages/shared/src/index.ts
git commit -m "feat: add StaffStatus enum to User and TicketType enum to MaintenanceTicket"
```

---

### Task 2: Server — extend users controller + tests

**Files:**
- Modify: `server/src/controllers/users.controller.ts`
- Modify: `server/src/controllers/users.controller.test.ts`

- [ ] **Step 1: Write failing tests**

Open `server/src/controllers/users.controller.test.ts`. Read the file to understand the test structure (token setup, beforeAll pattern). Add this describe block at the bottom of the file:

```typescript
describe('Staff status', () => {
  let maintenanceUser: { id: number };
  let adminToken: string;

  beforeAll(async () => {
    const admin = await testPrisma.user.create({
      data: {
        name: 'Staff Admin',
        email: `staff-admin-${Date.now()}@test.com`,
        password: 'x',
        role: 'ADMIN',
      },
    });
    adminToken = `token=${signToken({ id: admin.id, role: admin.role, assignedBuildingId: null })}`;

    maintenanceUser = await testPrisma.user.create({
      data: {
        name: 'Staff Worker',
        email: `staff-worker-${Date.now()}@test.com`,
        password: 'x',
        role: 'MAINTENANCE',
        staffStatus: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'staff-%'`;
  });

  it('GET /users/maintenance-staff includes staffStatus', async () => {
    const res = await request(app)
      .get('/api/v1/users/maintenance-staff')
      .set('Cookie', adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((u: any) => u.id === maintenanceUser.id);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('staffStatus', 'ACTIVE');
  });

  it('PATCH /users/:id updates staffStatus', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${maintenanceUser.id}`)
      .set('Cookie', adminToken)
      .send({ staffStatus: 'ON_CALL' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('staffStatus', 'ON_CALL');
  });

  it('PATCH /users/:id with invalid staffStatus returns 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${maintenanceUser.id}`)
      .set('Cookie', adminToken)
      .send({ staffStatus: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid staff status');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/controllers/users.controller.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: the 3 new tests fail.

- [ ] **Step 3: Update the users controller**

Open `server/src/controllers/users.controller.ts`.

**3a — Add `StaffStatus` to the import from `@hotel/shared`:**

```typescript
import { Role, StaffStatus } from '@hotel/shared';
```

**3b — Add `staffStatus` to `userSelect`:**

```typescript
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  staffStatus: true,
  assignedBuildingId: true,
  assignedBuilding: { select: { id: true, name: true, code: true } },
  createdAt: true,
  deletedAt: true,
} as const;
```

**3c — Update `maintenanceStaff` select to include `staffStatus`:**

```typescript
export async function maintenanceStaff(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'MAINTENANCE' },
      select: { id: true, name: true, staffStatus: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

**3d — Add `staffStatus` handling to the `update` function.**

Find the `update` function. After the line `const { name, email, role, assignedBuildingId } = req.body as {`, update the destructuring and type annotation to include `staffStatus`:

```typescript
const { name, email, role, assignedBuildingId, staffStatus } = req.body as {
  name?: string;
  email?: string;
  role?: string;
  assignedBuildingId?: number | null;
  staffStatus?: string;
};
```

Update the "at least one field required" guard to include `staffStatus`:

```typescript
if (!name && !email && !role && assignedBuildingId === undefined && staffStatus === undefined) {
  res.status(400).json({ message: 'At least one field required' });
  return;
}
```

Add staffStatus validation **before** the existing role validation block:

```typescript
const VALID_STAFF_STATUSES = Object.values(StaffStatus) as string[];
if (staffStatus !== undefined && !VALID_STAFF_STATUSES.includes(staffStatus)) {
  res.status(400).json({ message: 'Invalid staff status' });
  return;
}
```

Add `staffStatus` to the `data` object that's built at the end of the function (find the block where `if (name) data.name = ...` etc. is built and add):

```typescript
if (staffStatus !== undefined) data.staffStatus = staffStatus;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/controllers/users.controller.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: all tests pass including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add server/src/controllers/users.controller.ts server/src/controllers/users.controller.test.ts
git commit -m "feat: add staffStatus to maintenance-staff endpoint and user update"
```

---

### Task 3: Server — extend tickets controller + tests

**Files:**
- Modify: `server/src/controllers/tickets.controller.ts`
- Modify: `server/src/controllers/tickets.controller.test.ts`

- [ ] **Step 1: Write failing tests**

Open `server/src/controllers/tickets.controller.test.ts`. Read the file to understand the test structure. Add this describe block at the bottom:

```typescript
describe('TicketType — CLEANING tickets', () => {
  let adminToken: string;
  let apartment: { id: number };
  let building: { id: number };
  let createdTicketId: number;

  beforeAll(async () => {
    const admin = await testPrisma.user.create({
      data: {
        name: 'Type Admin',
        email: `type-admin-${Date.now()}@test.com`,
        password: 'x',
        role: 'ADMIN',
      },
    });
    adminToken = signToken({ id: admin.id, role: admin.role, assignedBuildingId: null });

    building = await testPrisma.building.create({
      data: { name: 'Type Building', code: `TYPE-${Date.now()}`, address: '1 Type St' },
    });
    apartment = await testPrisma.apartment.create({
      data: { number: 'TYP-001', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: building.id },
    });
  });

  afterAll(async () => {
    if (createdTicketId) {
      await testPrisma.maintenanceTicket.deleteMany({ where: { id: createdTicketId } });
    }
    await testPrisma.apartment.delete({ where: { id: apartment.id } });
    await testPrisma.building.delete({ where: { id: building.id } });
    await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'type-admin-%'`;
  });

  it('POST /tickets with type CLEANING creates a cleaning ticket', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Cookie', `token=${adminToken}`)
      .send({
        apartmentId: apartment.id,
        description: 'Clean room after checkout',
        priority: 'LOW',
        type: 'CLEANING',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('type', 'CLEANING');
    createdTicketId = res.body.id;
  });

  it('GET /tickets?type=CLEANING returns only cleaning tickets', async () => {
    const res = await request(app)
      .get('/api/v1/tickets?type=CLEANING')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach((t: any) => {
      expect(t.type).toBe('CLEANING');
    });
  });

  it('POST /tickets with invalid type returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Cookie', `token=${adminToken}`)
      .send({
        apartmentId: apartment.id,
        description: 'Test',
        priority: 'LOW',
        type: 'INVALID',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid ticket type');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/controllers/tickets.controller.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: the 3 new tests fail.

- [ ] **Step 3: Update the tickets controller**

Open `server/src/controllers/tickets.controller.ts`.

**3a — Add `TicketType` to the import from `@hotel/shared`:**

```typescript
import { Priority, Role, TicketStatus, TicketType } from '@hotel/shared';
```

**3b — Add `VALID_TICKET_TYPES` constant** after `VALID_NON_CLOSED_STATUSES`:

```typescript
const VALID_TICKET_TYPES = Object.values(TicketType);
```

**3c — Add `type` to the `ticketInclude` select:**

```typescript
const ticketInclude = {
  apartment: { select: { id: true, number: true, floor: true, deletedAt: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;
```

Note: `type` is a scalar field on MaintenanceTicket so it's returned automatically in `findMany`/`findUnique` with `include` — no change to `ticketInclude` needed. Scalar fields are always returned; `include` only applies to relations.

**3d — Add `type` filter to `list`:**

In the `list` function, after the existing `buildingId` filter block, add:

```typescript
const typeParam = req.query.type as string | undefined;
if (typeParam !== undefined) {
  if (!VALID_TICKET_TYPES.includes(typeParam as TicketType)) {
    res.status(400).json({ message: 'Invalid ticket type' });
    return;
  }
  where.type = typeParam as TicketType;
}
```

**3e — Add `type` to `create`:**

In the `create` function, update the destructuring to include `type`:

```typescript
const { apartmentId, description, priority, assignedToId, type } = req.body as {
  apartmentId?: number;
  description?: string;
  priority?: string;
  assignedToId?: number;
  type?: string;
};
```

Add type validation **before** the `prisma.maintenanceTicket.create` call:

```typescript
if (type !== undefined && !VALID_TICKET_TYPES.includes(type as TicketType)) {
  res.status(400).json({ message: 'Invalid ticket type' });
  return;
}
```

Add `type` to the `create` data object:

```typescript
const ticket = await prisma.maintenanceTicket.create({
  data: {
    apartmentId: Number(apartmentId),
    description: description.trim(),
    priority: priority as Priority,
    assignedToId: assignedToId ? Number(assignedToId) : null,
    type: type ? (type as TicketType) : TicketType.MAINTENANCE,
  },
  include: ticketInclude,
});
```

**3f — Add `type` to `update` (ADMIN/RECEPTIONIST only):**

In the `update` function, update the destructuring to include `type`:

```typescript
const { status, notes, priority, assignedToId, apartmentId, type } = req.body as {
  status?: string;
  notes?: string;
  priority?: string;
  assignedToId?: number | null;
  apartmentId?: number;
  type?: string;
};
```

Add to the MAINTENANCE field restriction check (silently ignore `type` for MAINTENANCE — do NOT add `type` to the rejection condition, just exclude it from `data` for MAINTENANCE):

In the block `if (!isMaintenance)` where `data.priority`, `data.assignedToId`, `data.apartmentId` are set, also add:

```typescript
if (type !== undefined) {
  if (!VALID_TICKET_TYPES.includes(type as TicketType)) {
    res.status(400).json({ message: 'Invalid ticket type' });
    return;
  }
  data.type = type as TicketType;
}
```

The `data` type declaration at the top of update needs `type` added:

```typescript
const data: {
  status?: TicketStatus;
  resolvedAt?: Date | null;
  notes?: string | null;
  priority?: Priority;
  assignedToId?: number | null;
  apartmentId?: number;
  type?: TicketType;
} = {};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "D:/Hotel Apartment Management System/server"
npx vitest run src/controllers/tickets.controller.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: all tests pass including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add server/src/controllers/tickets.controller.ts server/src/controllers/tickets.controller.test.ts
git commit -m "feat: add TicketType field to tickets (create, list filter, update)"
```

---

### Task 4: Client — Staff tab in UsersPage + ApartmentsPage widget

**Files:**
- Modify: `client/src/hooks/useTickets.ts` — update MaintenanceStaff type
- Modify: `client/src/pages/users/UsersPage.tsx` — add Staff tab
- Modify: `client/src/pages/apartments/ApartmentsPage.tsx` — replace hardcoded widget

**Before starting:** Read `client/src/hooks/useTickets.ts` to find the `useMaintenanceStaff` hook and its return type — you need to add `staffStatus` to it.

- [ ] **Step 1: Update useMaintenanceStaff type in useTickets.ts**

Find the `useMaintenanceStaff` hook in `client/src/hooks/useTickets.ts`. It returns staff with `{ id, name }`. Update the return type interface to include `staffStatus`:

```typescript
export interface MaintenanceStaffMember {
  id: number;
  name: string;
  staffStatus: 'ACTIVE' | 'ON_CALL' | 'OFF_DUTY';
}
```

Update the hook's return type annotation if it has one (e.g., `as MaintenanceStaffMember[]`). If the type is inferred, the component will pick it up automatically once the API returns the field.

- [ ] **Step 2: Add Staff tab to UsersPage**

Open `client/src/pages/users/UsersPage.tsx`. Replace the entire file with this content:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useUsers, UserListItem } from '../../hooks/useUsers';
import { useDeactivateUser, useReactivateUser, useUpdateUser } from '../../hooks/useUsersMutations';
import { useAuth } from '../../hooks/useAuth';
import UserFormModal from './UserFormModal';
import toast from 'react-hot-toast';

const ROLE_BADGE: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'bg-purple-100 text-purple-700',
  [Role.ADMIN]: 'bg-primary/10 text-primary',
  [Role.BUILDING_ADMIN]: 'bg-secondary/10 text-secondary',
  [Role.RECEPTIONIST]: 'bg-amber-100 text-amber-700',
  [Role.FINANCE]: 'bg-green-100 text-green-700',
  [Role.MAINTENANCE]: 'bg-orange-100 text-orange-700',
};

const STAFF_STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_CALL: 'bg-amber-100 text-amber-700',
  OFF_DUTY: 'bg-surface-container text-on-surface-variant',
};

const STAFF_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  ON_CALL: 'On Call',
  OFF_DUTY: 'Off Duty',
};

type Tab = 'all' | 'staff';

export default function UsersPage() {
  const { t } = useTranslation();
  const { data: currentUser } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const updateUser = useUpdateUser();
  const [modalUser, setModalUser] = useState<UserListItem | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('all');
  const isAdmin = currentUser?.role === Role.ADMIN || currentUser?.role === Role.SUPER_ADMIN;

  const visibleUsers = tab === 'staff'
    ? users.filter(u => u.role === Role.MAINTENANCE)
    : users;

  if (isLoading) {
    return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>;
  }

  function handleStatusChange(userId: number, staffStatus: string) {
    updateUser.mutate(
      { id: userId, staffStatus },
      {
        onSuccess: () => toast.success('Status updated'),
        onError: () => toast.error('Failed to update status'),
      }
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Users</h1>
        <button
          onClick={() => setModalUser(null)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add User
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-surface-container rounded-xl p-1 w-fit">
        {(['all', 'staff'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t === 'all' ? 'All Users' : 'Staff'}
          </button>
        ))}
      </div>

      <div className="bg-surface-container rounded-2xl overflow-hidden border border-outline-variant">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant">
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Name</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Email</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Role</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Building</th>
              {tab === 'staff' && (
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Status</th>
              )}
              {tab === 'all' && (
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Status</th>
              )}
              <th className="text-right px-4 py-3 text-on-surface-variant font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => {
              const isDeactivated = !!user.deletedAt;
              const isSelf = user.id === currentUser?.id;
              return (
                <tr
                  key={user.id}
                  className={`border-b border-outline-variant last:border-0 ${isDeactivated ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-on-surface">{user.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[user.role]}`}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {user.assignedBuilding ? `${user.assignedBuilding.name} (${user.assignedBuilding.code})` : '—'}
                  </td>
                  {tab === 'staff' ? (
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select
                          value={(user as any).staffStatus ?? 'OFF_DUTY'}
                          onChange={(e) => handleStatusChange(user.id, e.target.value)}
                          className="px-2 py-1 rounded-lg border border-outline-variant bg-surface text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="ON_CALL">On Call</option>
                          <option value="OFF_DUTY">Off Duty</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STAFF_STATUS_BADGE[(user as any).staffStatus ?? 'OFF_DUTY']}`}>
                          {STAFF_STATUS_LABEL[(user as any).staffStatus ?? 'OFF_DUTY']}
                        </span>
                      )}
                    </td>
                  ) : (
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${isDeactivated ? 'text-error' : 'text-tertiary'}`}>
                        {isDeactivated ? 'Deactivated' : 'Active'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right space-x-2">
                    {!isDeactivated && (
                      <button
                        onClick={() => setModalUser(user)}
                        className="text-xs px-3 py-1 rounded-lg border border-outline hover:bg-surface-container-high transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {isDeactivated ? (
                      <button
                        onClick={() => reactivate.mutate(user.id)}
                        className="text-xs px-3 py-1 rounded-lg bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition-colors"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        disabled={isSelf}
                        title={isSelf ? 'Cannot deactivate your own account' : undefined}
                        onClick={() => !isSelf && deactivate.mutate(user.id)}
                        className="text-xs px-3 py-1 rounded-lg bg-error/10 text-error hover:bg-error/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-on-surface-variant">
                  {tab === 'staff' ? 'No maintenance staff found.' : 'No users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalUser !== undefined && (
        <UserFormModal user={modalUser} onClose={() => setModalUser(undefined)} />
      )}
    </div>
  );
}
```

**Note:** This uses `useUpdateUser` from `useUsersMutations`. Before saving, read `client/src/hooks/useUsersMutations.ts` to check if `useUpdateUser` exists. If it does not exist, add it:

```typescript
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; [key: string]: unknown }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

- [ ] **Step 3: Replace hardcoded ApartmentsPage widget**

Open `client/src/pages/apartments/ApartmentsPage.tsx`. 

**3a** — Add these two imports near the top (with other hook imports):

```typescript
import { useMaintenanceStaff } from '../../hooks/useTickets';
```

**3b** — Add state for the dispatch modal near the other modal states (around line 70–80):

```typescript
const [dispatchOpen, setDispatchOpen] = useState(false);
```

**3c** — Add the `useMaintenanceStaff` call near the other hook calls:

```typescript
const { data: staffList = [] } = useMaintenanceStaff();
```

**3d** — Find the hardcoded Staff Distribution section (around line 520–545) and replace it entirely with:

```tsx
{/* Staff Distribution */}
<div className="w-full lg:w-[400px] bg-primary-container text-on-primary-container p-6 rounded-xl relative overflow-hidden">
  <div className="relative z-10">
    <h4 className="text-headline-md font-bold text-white mb-2">Staff Distribution</h4>
    <p className="text-on-primary-container/80 text-body-sm mb-6">Current housekeeping and maintenance teams on site.</p>
    <div className="space-y-4">
      {staffList.length === 0 && (
        <p className="text-white/60 text-body-sm">No staff on record.</p>
      )}
      {staffList.map((staff) => {
        const statusColor =
          staff.staffStatus === 'ACTIVE' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
          staff.staffStatus === 'ON_CALL' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
          'bg-white/10 text-white/50 border-white/20';
        const statusLabel =
          staff.staffStatus === 'ACTIVE' ? 'ACTIVE' :
          staff.staffStatus === 'ON_CALL' ? 'ON CALL' : 'OFF DUTY';
        return (
          <div key={staff.id} className="flex justify-between items-center">
            <span className="text-body-sm text-white">{staff.name}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        );
      })}
    </div>
    {canEdit && (
      <button
        onClick={() => setDispatchOpen(true)}
        className="w-full mt-8 border border-white/20 hover:bg-white/10 py-2.5 rounded font-bold text-body-sm transition-colors text-white"
      >
        Dispatch New Task
      </button>
    )}
  </div>
  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
</div>
```

**3e** — Find where the existing modals are rendered at the bottom of the JSX (where `<ApartmentFormModal>`, `<PaymentFormModal>` etc. are). Add the NewTicketModal there:

```tsx
{dispatchOpen && (
  <NewTicketModal
    open={dispatchOpen}
    onClose={() => setDispatchOpen(false)}
    defaultType="CLEANING"
  />
)}
```

Make sure `NewTicketModal` is imported at the top of the file. Check if it's already imported; if not, add:

```typescript
import NewTicketModal from '../tickets/NewTicketModal';
```

- [ ] **Step 4: TypeScript check**

```bash
cd "D:/Hotel Apartment Management System/client"
npx tsc --noEmit 2>&1 | grep -E "UsersPage|ApartmentsPage|useTickets" | head -20
```

Fix any errors in these files. The `(user as any).staffStatus` cast is intentional — the `UserListItem` type from `useUsers.ts` may not include `staffStatus` yet. If TypeScript complains, add `staffStatus?: string` to the `UserListItem` interface in `client/src/hooks/useUsers.ts`.

- [ ] **Step 5: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add client/src/hooks/useTickets.ts client/src/hooks/useUsersMutations.ts client/src/pages/users/UsersPage.tsx client/src/pages/apartments/ApartmentsPage.tsx
git commit -m "feat: Staff tab in UsersPage and live staff widget in ApartmentsPage"
```

---

### Task 5: Client — NewTicketModal type field + TicketsPage type filter

**Files:**
- Modify: `client/src/pages/tickets/NewTicketModal.tsx`
- Modify: `client/src/pages/tickets/TicketsPage.tsx`
- Modify: `client/src/hooks/useTickets.ts` — add `type` to TicketItem and useTickets params

**Before starting:** Read `client/src/hooks/useTickets.ts` in full to understand the `useTickets` hook params and `TicketItem` type. You'll need to add `type` to both.

- [ ] **Step 1: Update TicketItem type and useTickets hook**

In `client/src/hooks/useTickets.ts`:

**1a** — Add `type` to `TicketItem` interface:

```typescript
type: 'MAINTENANCE' | 'CLEANING';
```

**1b** — Add `type` to the params of `useTickets` (find the params interface or object and add):

```typescript
type?: 'MAINTENANCE' | 'CLEANING';
```

**1c** — Pass `type` to the API call params in `useTickets` (find where `api.get('/tickets', { params: ... })` is called and include `type` in the params object).

**1d** — Add `type` to `useCreateTicket` mutation payload type:

Find the type for the mutation payload (the object passed to `api.post('/tickets', data)`) and add:

```typescript
type?: 'MAINTENANCE' | 'CLEANING';
```

- [ ] **Step 2: Update NewTicketModal**

Open `client/src/pages/tickets/NewTicketModal.tsx`. Replace the full file with:

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTicket, useMaintenanceStaff } from '../../hooks/useTickets';
import { useApartments } from '../../hooks/useApartments';

const schema = z.object({
  apartmentId: z.coerce.number().min(1, 'Apartment is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  type: z.enum(['MAINTENANCE', 'CLEANING']).default('MAINTENANCE'),
  assignedToId: z.preprocess(
    v => (v === '' || v === undefined || v === null) ? undefined : Number(v),
    z.number().optional()
  ),
});

type FormValues = z.infer<typeof schema>;

interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: 'MAINTENANCE' | 'CLEANING';
}

export default function NewTicketModal({ open, onClose, defaultType = 'MAINTENANCE' }: NewTicketModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const createTicket = useCreateTicket();
  const { data: apartments = [] } = useApartments();
  const { data: staff = [] } = useMaintenanceStaff();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', type: defaultType },
  });

  if (!open) return null;

  function onSubmit(values: FormValues) {
    setApiError(null);
    createTicket.mutate(
      {
        apartmentId: values.apartmentId,
        description: values.description,
        priority: values.priority,
        type: values.type,
        assignedToId: values.assignedToId || undefined,
      },
      {
        onSuccess: () => { reset(); onClose(); },
        onError: (err: any) => setApiError(err.response?.data?.message ?? 'Failed to create ticket'),
      }
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md border border-outline-variant overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-on-surface">New Ticket</h2>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Type</label>
              <select
                {...register('type')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
              >
                <option value="MAINTENANCE">Maintenance</option>
                <option value="CLEANING">Cleaning</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Apartment</label>
              <select
                {...register('apartmentId')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
              >
                <option value="">Select apartment…</option>
                {apartments.map(a => (
                  <option key={a.id} value={a.id}>Apt. {a.number} — Floor {a.floor}</option>
                ))}
              </select>
              {errors.apartmentId && <p className="text-xs text-error mt-1">{errors.apartmentId.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Description</label>
              <textarea
                {...register('description')}
                rows={3}
                placeholder="Describe the issue…"
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface resize-none placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {errors.description && <p className="text-xs text-error mt-1">{errors.description.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Priority</label>
              <select
                {...register('priority')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Assign To (optional)</label>
              <select
                {...register('assignedToId')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
              >
                <option value="">Unassigned</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {apiError && <p className="text-sm text-error">{apiError}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-outline-variant text-sm font-bold text-on-surface hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTicket.isPending}
                className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {createTicket.isPending ? 'Creating…' : 'Create Ticket'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add type filter to TicketsPage**

Open `client/src/pages/tickets/TicketsPage.tsx`. Read the full file first to understand the filter state pattern.

**3a** — Add a `typeFilter` state near the other filter states:

```typescript
const [typeFilter, setTypeFilter] = useState<'MAINTENANCE' | 'CLEANING' | ''>('');
```

**3b** — Pass `type` to `useTickets`:

Find where `useTickets` is called (something like `useTickets({ status, priority, buildingId })`). Add `type: typeFilter || undefined` to the params.

**3c** — Add type filter buttons in the filter bar. Find where the status/priority filters are rendered (look for the filter row with buttons or selects) and add alongside them:

```tsx
{/* Type filter */}
<div className="flex gap-1 bg-surface-container rounded-lg p-0.5">
  {([['', 'All'], ['MAINTENANCE', 'Maintenance'], ['CLEANING', 'Cleaning']] as const).map(([val, label]) => (
    <button
      key={val}
      onClick={() => setTypeFilter(val as typeof typeFilter)}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        typeFilter === val
          ? 'bg-surface text-on-surface shadow-sm'
          : 'text-on-surface-variant hover:text-on-surface'
      }`}
    >
      {label}
    </button>
  ))}
</div>
```

**3d** — Show cleaning icon on ticket cards. In the list view rows or kanban cards where ticket info is displayed, add a broom icon for CLEANING tickets:

```tsx
{ticket.type === 'CLEANING' && (
  <span className="material-symbols-outlined text-[14px] text-on-surface-variant" title="Cleaning">cleaning_services</span>
)}
```

Place this icon next to the ticket number or in the ticket header area — follow the existing layout.

- [ ] **Step 4: TypeScript check**

```bash
cd "D:/Hotel Apartment Management System/client"
npx tsc --noEmit 2>&1 | grep -E "TicketsPage|NewTicketModal|useTickets" | head -20
```

Fix any errors. The most likely issue is that `useTickets` params type needs `type?` added.

- [ ] **Step 5: Commit**

```bash
cd "D:/Hotel Apartment Management System"
git add client/src/hooks/useTickets.ts client/src/pages/tickets/NewTicketModal.tsx client/src/pages/tickets/TicketsPage.tsx
git commit -m "feat: add type field to NewTicketModal and type filter to TicketsPage"
```
