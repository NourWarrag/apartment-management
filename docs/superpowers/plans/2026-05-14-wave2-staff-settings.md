# Wave 2 — Staff Management + Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add User/Staff Management (full CRUD + deactivate/reactivate), introduce SUPER_ADMIN and BUILDING_ADMIN roles with per-building scoping, and add a Settings page (company-wide DB settings + per-user localStorage preferences).

**Architecture:** Extend the existing soft-delete pattern (`deletedAt`) to control user account access. Embed `assignedBuildingId` in the JWT so BUILDING_ADMIN scoping is zero-cost per request. A singleton `SystemSettings` row (id=1) is upserted on first GET. BUILDING_ADMIN users have their `buildingId` forced on all list endpoints and validated on write endpoints via an `assertBuildingAccess` helper.

**Tech Stack:** Prisma 5 (existing), Express, TypeScript, React Query, React, Tailwind/MD3 design tokens

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `shared/index.ts` | Add SUPER_ADMIN, BUILDING_ADMIN to Role enum; add assignedBuildingId to AuthUser |
| Modify | `server/prisma/schema.prisma` | Add SUPER_ADMIN/BUILDING_ADMIN to Role enum; add User.assignedBuildingId; add SystemSettings model |
| Create | `server/prisma/migrations/20260515000000_wave2_staff_settings/migration.sql` | Enum values + new column + new table |
| Modify | `server/src/lib/jwt.ts` | Type the payload to include assignedBuildingId |
| Modify | `server/src/middleware/auth.middleware.ts` | Include assignedBuildingId in req.user; update AuthRequest |
| Modify | `server/src/middleware/role.middleware.ts` | SUPER_ADMIN bypasses all role checks |
| Modify | `server/src/controllers/auth.controller.ts` | Deactivation check on login; include assignedBuildingId in JWT |
| Create | `server/src/lib/assertBuildingAccess.ts` | Helper: throws 403 if BUILDING_ADMIN writes to wrong building |
| Modify | `server/src/controllers/apartments.controller.ts` | Call assertBuildingAccess on create/update |
| Modify | `server/src/controllers/tickets.controller.ts` | Call assertBuildingAccess on create |
| Modify | `server/src/controllers/users.controller.ts` | Full CRUD + deactivate/reactivate |
| Create | `server/src/routes/users.routes.ts` | All user management routes |
| Create | `server/src/controllers/settings.controller.ts` | GET + PATCH SystemSettings |
| Create | `server/src/routes/settings.routes.ts` | Settings routes |
| Modify | `server/src/app.ts` | Register users + settings routes |
| Create | `server/src/controllers/users.controller.test.ts` | Integration tests for user management + settings |
| Modify | `client/src/components/layout/BuildingSelector.tsx` | Hide for BUILDING_ADMIN |
| Modify | `client/src/App.tsx` | Add SUPER_ADMIN/BUILDING_ADMIN to role arrays; add /users and /settings routes |
| Modify | `client/src/hooks/useAuth.ts` | AuthUser now includes assignedBuildingId |
| Create | `client/src/hooks/useUsers.ts` | useUsers query hook |
| Create | `client/src/hooks/useUsersMutations.ts` | useCreateUser, useUpdateUser, useDeactivateUser, useReactivateUser |
| Create | `client/src/hooks/useSettings.ts` | useSettings, useUpdateSettings |
| Create | `client/src/pages/users/UserFormModal.tsx` | Create/edit user modal |
| Create | `client/src/pages/users/UsersPage.tsx` | Users admin table |
| Create | `client/src/pages/settings/SettingsPage.tsx` | System settings + user preferences |
| Modify | `client/src/components/layout/Sidebar.tsx` | Add Users nav item; fix Settings to NavLink |
| Modify | `client/src/i18n/locales/en/translation.json` | Add nav.users, nav.settings |
| Modify | `client/src/i18n/locales/ar/translation.json` | Add nav.users, nav.settings |

---

### Task 1: Schema + Shared Types

**Files:**
- Modify: `shared/index.ts`
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260515000000_wave2_staff_settings/migration.sql`

- [ ] **Step 1: Update shared Role enum and AuthUser**

Replace the Role enum and AuthUser interface in `shared/index.ts`:

```typescript
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  BUILDING_ADMIN = 'BUILDING_ADMIN',
  RECEPTIONIST = 'RECEPTIONIST',
  MAINTENANCE = 'MAINTENANCE',
  FINANCE = 'FINANCE',
}

// ... all other enums unchanged ...

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  assignedBuildingId: number | null;
}
```

- [ ] **Step 2: Update Prisma schema**

In `server/prisma/schema.prisma`:

1. Find the `enum Role` block (currently at line 194) and replace it:

```prisma
enum Role {
  SUPER_ADMIN
  ADMIN
  BUILDING_ADMIN
  RECEPTIONIST
  MAINTENANCE
  FINANCE
}
```

2. In the `User` model, add `assignedBuildingId` field and back-relation after the existing fields (before the closing brace):

```prisma
  assignedBuildingId Int?
  assignedBuilding   Building? @relation("UserAssignedBuilding", fields: [assignedBuildingId], references: [id], onDelete: SetNull)
```

3. In the `Building` model, add the back-relation:

```prisma
  assignedUsers User[] @relation("UserAssignedBuilding")
```

4. Add the `SystemSettings` model at the end of the schema (before or after the Role enum):

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

- [ ] **Step 3: Create migration SQL**

Create directory `server/prisma/migrations/20260515000000_wave2_staff_settings/` and write `migration.sql`:

```sql
-- Add new enum values to Role
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "Role" ADD VALUE 'BUILDING_ADMIN';

-- Add assignedBuildingId to User
ALTER TABLE "User" ADD COLUMN "assignedBuildingId" INTEGER;
ALTER TABLE "User" ADD CONSTRAINT "User_assignedBuildingId_fkey"
  FOREIGN KEY ("assignedBuildingId") REFERENCES "Building"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Create SystemSettings table
CREATE TABLE "SystemSettings" (
  "id"          SERIAL PRIMARY KEY,
  "companyName" TEXT NOT NULL DEFAULT 'My Property',
  "currency"    TEXT NOT NULL DEFAULT 'AED',
  "timezone"    TEXT NOT NULL DEFAULT 'Asia/Dubai',
  "phone"       TEXT NOT NULL DEFAULT '',
  "email"       TEXT NOT NULL DEFAULT '',
  "address"     TEXT NOT NULL DEFAULT ''
);
```

- [ ] **Step 4: Apply migration**

```bash
cd server
npx prisma migrate resolve --applied 20260515000000_wave2_staff_settings
npx prisma generate
```

If `migrate resolve` fails (fresh env), run:
```bash
npx prisma migrate dev --name wave2_staff_settings
```
Then manually edit the generated SQL to match the SQL in Step 3 before applying.

Expected: Prisma client regenerated with `SystemSettings` model and updated `Role` enum.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
cd ../client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add shared/index.ts server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add SUPER_ADMIN/BUILDING_ADMIN roles, assignedBuildingId on User, SystemSettings model"
```

---

### Task 2: Auth, JWT, and Middleware

**Files:**
- Modify: `server/src/lib/jwt.ts`
- Modify: `server/src/middleware/auth.middleware.ts`
- Modify: `server/src/middleware/role.middleware.ts`
- Modify: `server/src/controllers/auth.controller.ts`
- Create: `server/src/lib/assertBuildingAccess.ts`
- Modify: `server/src/controllers/apartments.controller.ts` (create + update functions)
- Modify: `server/src/controllers/tickets.controller.ts` (create function)

- [ ] **Step 1: Type the JWT payload**

Replace `server/src/lib/jwt.ts`:

```typescript
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET ?? 'dev-secret';
const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';

export interface TokenPayload {
  id: number;
  role: string;
  assignedBuildingId: number | null;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, secret) as jwt.JwtPayload;
}
```

- [ ] **Step 2: Update AuthRequest to include assignedBuildingId**

Replace `server/src/middleware/auth.middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { Role } from '@hotel/shared';
import { requestContext } from '../lib/requestContext';

export interface AuthRequest extends Request {
  user?: { id: number; role: Role; assignedBuildingId: number | null };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.id as number,
      role: payload.role as Role,
      assignedBuildingId: (payload.assignedBuildingId as number | null) ?? null,
    };
    (req as Request & { log?: { setBindings: (b: object) => void } }).log?.setBindings({
      userId: payload.id as number,
    });
    requestContext.run({ userId: payload.id as number }, () => next());
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 3: Update role middleware to pass SUPER_ADMIN on all checks**

Replace `server/src/middleware/role.middleware.ts`:

```typescript
import { Response, NextFunction } from 'express';
import { Role } from '@hotel/shared';
import { AuthRequest } from './auth.middleware';

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    // SUPER_ADMIN passes every role check
    if (req.user.role === Role.SUPER_ADMIN || roles.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ message: 'Forbidden' });
  };
}
```

- [ ] **Step 4: Update auth.controller.ts — deactivation check + assignedBuildingId in JWT**

Replace `server/src/controllers/auth.controller.ts`:

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { comparePassword } from '../lib/password';
import { signToken } from '../lib/jwt';

const DUMMY_HASH = '$2a$10$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxxxxx';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function login(req: AuthRequest, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatch = await comparePassword(password, user?.password ?? DUMMY_HASH);

  if (!user || !passwordMatch) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  if (user.deletedAt !== null) {
    res.status(401).json({ message: 'Account deactivated' });
    return;
  }

  const token = signToken({ id: user.id, role: user.role, assignedBuildingId: user.assignedBuildingId });
  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      assignedBuildingId: user.assignedBuildingId,
    },
  });
}

export function logout(_req: AuthRequest, res: Response): void {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, role: true, assignedBuildingId: true },
  });
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json(user);
}
```

- [ ] **Step 5: Create assertBuildingAccess helper**

Create `server/src/lib/assertBuildingAccess.ts`:

```typescript
import { Response } from 'express';
import { Role } from '@hotel/shared';
import { AuthRequest } from '../middleware/auth.middleware';

export function assertBuildingAccess(req: AuthRequest, res: Response, buildingId: number): boolean {
  if (
    req.user?.role === Role.BUILDING_ADMIN &&
    req.user.assignedBuildingId !== buildingId
  ) {
    res.status(403).json({ message: 'Forbidden: building access denied' });
    return false;
  }
  return true;
}
```

Returns `true` if access is allowed (caller should return early if `false`).

- [ ] **Step 6: Apply assertBuildingAccess in apartments controller**

In `server/src/controllers/apartments.controller.ts`, add the import at the top:

```typescript
import { assertBuildingAccess } from '../lib/assertBuildingAccess';
```

In the `create` function, after validating `buildingId` exists, add:

```typescript
if (!assertBuildingAccess(req, res, buildingId)) return;
```

In the `update` function, after fetching the existing apartment and resolving the `buildingId` to update, add:

```typescript
const targetBuildingId = body.buildingId ?? existing.buildingId;
if (!assertBuildingAccess(req, res, targetBuildingId)) return;
```

- [ ] **Step 7: Apply assertBuildingAccess in tickets controller**

In `server/src/controllers/tickets.controller.ts`, add the import:

```typescript
import { assertBuildingAccess } from '../lib/assertBuildingAccess';
```

In the `create` function, after resolving the apartment, add (using the apartment's buildingId):

```typescript
const apt = await prisma.apartment.findUnique({ where: { id: apartmentId }, select: { buildingId: true } });
if (!apt) { res.status(404).json({ message: 'Apartment not found' }); return; }
if (!assertBuildingAccess(req, res, apt.buildingId)) return;
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add server/src/lib/jwt.ts server/src/middleware/auth.middleware.ts server/src/middleware/role.middleware.ts server/src/controllers/auth.controller.ts server/src/lib/assertBuildingAccess.ts server/src/controllers/apartments.controller.ts server/src/controllers/tickets.controller.ts
git commit -m "feat: typed JWT payload with assignedBuildingId, SUPER_ADMIN role bypass, deactivation login block, assertBuildingAccess helper"
```

---

### Task 3: Users API

**Files:**
- Modify: `server/src/controllers/users.controller.ts`
- Create: `server/src/routes/users.routes.ts`

- [ ] **Step 1: Write the full users controller**

Replace `server/src/controllers/users.controller.ts`:

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { Role } from '@hotel/shared';
import { hashPassword } from '../lib/password';
import { Prisma } from '@prisma/client';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  assignedBuildingId: true,
  assignedBuilding: { select: { id: true, name: true, code: true } },
  createdAt: true,
  deletedAt: true,
} as const;

export async function maintenanceStaff(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'MAINTENANCE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function list(_req: AuthRequest, res: Response): Promise<void> {
  const users = await prisma.user.findManyWithDeleted({
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  const user = await prisma.user.findUniqueWithDeleted({ where: { id }, select: userSelect });
  if (!user) { res.status(404).json({ message: 'User not found' }); return; }
  res.json(user);
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { name, email, password, role, assignedBuildingId } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    assignedBuildingId?: number | null;
  };

  if (!name?.trim() || !email?.trim() || !password || !role) {
    res.status(400).json({ message: 'name, email, password, and role are required' });
    return;
  }

  const validRoles = Object.values(Role) as string[];
  if (!validRoles.includes(role)) {
    res.status(400).json({ message: 'Invalid role' });
    return;
  }

  if (role === Role.ADMIN && req.user?.role !== Role.SUPER_ADMIN) {
    res.status(403).json({ message: 'Only SUPER_ADMIN can create ADMIN users' });
    return;
  }

  if (role === Role.SUPER_ADMIN && req.user?.role !== Role.SUPER_ADMIN) {
    res.status(403).json({ message: 'Only SUPER_ADMIN can create SUPER_ADMIN users' });
    return;
  }

  if (role === Role.BUILDING_ADMIN && !assignedBuildingId) {
    res.status(400).json({ message: 'assignedBuildingId required for BUILDING_ADMIN' });
    return;
  }

  if (role !== Role.BUILDING_ADMIN && assignedBuildingId) {
    res.status(400).json({ message: 'assignedBuildingId only allowed for BUILDING_ADMIN' });
    return;
  }

  const hashedPassword = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role: role as Role,
        assignedBuildingId: assignedBuildingId ?? null,
      },
      select: userSelect,
    });
    res.status(201).json(user);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }
    throw err;
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }

  const { name, email, role, assignedBuildingId } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    assignedBuildingId?: number | null;
  };

  if (!name && !email && !role && assignedBuildingId === undefined) {
    res.status(400).json({ message: 'At least one field required' });
    return;
  }

  if (role) {
    const validRoles = Object.values(Role) as string[];
    if (!validRoles.includes(role)) {
      res.status(400).json({ message: 'Invalid role' });
      return;
    }
    if (role === Role.ADMIN && req.user?.role !== Role.SUPER_ADMIN) {
      res.status(403).json({ message: 'Only SUPER_ADMIN can assign ADMIN role' });
      return;
    }
  }

  const existing = await prisma.user.findUniqueWithDeleted({ where: { id } });
  if (!existing) { res.status(404).json({ message: 'User not found' }); return; }

  const effectiveRole = (role as Role | undefined) ?? existing.role;
  if (effectiveRole === Role.BUILDING_ADMIN) {
    const effectiveBuildingId = assignedBuildingId !== undefined ? assignedBuildingId : existing.assignedBuildingId;
    if (!effectiveBuildingId) {
      res.status(400).json({ message: 'assignedBuildingId required for BUILDING_ADMIN' });
      return;
    }
  }

  const data: Record<string, unknown> = {};
  if (name) data.name = name.trim();
  if (email) data.email = email.trim().toLowerCase();
  if (role) data.role = role;
  if (assignedBuildingId !== undefined) data.assignedBuildingId = assignedBuildingId;
  if (role && role !== Role.BUILDING_ADMIN) data.assignedBuildingId = null;

  try {
    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    res.json(user);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }
    throw err;
  }
}

export async function deactivate(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  if (req.user?.id === id) {
    res.status(403).json({ message: 'Cannot deactivate your own account' });
    return;
  }
  const existing = await prisma.user.findUniqueWithDeleted({ where: { id } });
  if (!existing) { res.status(404).json({ message: 'User not found' }); return; }
  await prisma.user.delete({ where: { id } });
  res.json({ message: 'User deactivated' });
}

export async function reactivate(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  const existing = await prisma.user.findUniqueWithDeleted({ where: { id } });
  if (!existing) { res.status(404).json({ message: 'User not found' }); return; }
  // Use prismaBase to bypass soft-delete extension
  await (prisma as unknown as { $extends: never } & { user: { update: (args: unknown) => Promise<unknown> } }).$extends;
  // Direct update bypassing soft-delete:
  const { PrismaClient } = await import('@prisma/client');
  const prismaBase = new PrismaClient();
  await prismaBase.user.update({ where: { id }, data: { deletedAt: null } });
  await prismaBase.$disconnect();
  res.json({ message: 'User reactivated' });
}
```

> **Note on reactivate:** The existing Prisma extension intercepts all `update` calls on soft-deleted rows. To bypass this, create a fresh `PrismaClient` instance (without the extension) for the `reactivate` operation. This is the same pattern used in the audit-soft-delete plan.

- [ ] **Step 2: Fix reactivate to use prismaBase cleanly**

The reactivate function above has a draft bypass. Replace the `reactivate` function body with the clean version:

```typescript
export async function reactivate(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  const existing = await prisma.user.findUniqueWithDeleted({ where: { id } });
  if (!existing) { res.status(404).json({ message: 'User not found' }); return; }
  // Use a bare PrismaClient to bypass the soft-delete extension
  const { PrismaClient } = await import('@prisma/client');
  const prismaBase = new PrismaClient();
  try {
    await prismaBase.user.update({ where: { id }, data: { deletedAt: null } });
  } finally {
    await prismaBase.$disconnect();
  }
  res.json({ message: 'User reactivated' });
}
```

- [ ] **Step 3: Create users routes**

Create `server/src/routes/users.routes.ts`:

```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';
import {
  list,
  getById,
  create,
  update,
  deactivate,
  reactivate,
  maintenanceStaff,
} from '../controllers/users.controller';

const router = Router();

router.use(authMiddleware);

router.get('/maintenance-staff', maintenanceStaff);
router.get('/', requireRole(Role.ADMIN, Role.SUPER_ADMIN), list);
router.get('/:id', requireRole(Role.ADMIN, Role.SUPER_ADMIN), getById);
router.post('/', requireRole(Role.ADMIN, Role.SUPER_ADMIN), create);
router.patch('/:id', requireRole(Role.ADMIN, Role.SUPER_ADMIN), update);
router.post('/:id/deactivate', requireRole(Role.ADMIN, Role.SUPER_ADMIN), deactivate);
router.post('/:id/reactivate', requireRole(Role.ADMIN, Role.SUPER_ADMIN), reactivate);

export default router;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/users.controller.ts server/src/routes/users.routes.ts
git commit -m "feat: users CRUD + deactivate/reactivate endpoints with role guards"
```

---

### Task 4: Settings API

**Files:**
- Create: `server/src/controllers/settings.controller.ts`
- Create: `server/src/routes/settings.routes.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Create settings controller**

Create `server/src/controllers/settings.controller.ts`:

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const ALLOWED_FIELDS = new Set(['companyName', 'currency', 'timezone', 'phone', 'email', 'address']);

export async function getSettings(_req: AuthRequest, res: Response): Promise<void> {
  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  res.json(settings);
}

export async function updateSettings(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(key) && typeof body[key] === 'string') {
      data[key] = body[key];
    }
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ message: 'No valid fields provided' });
    return;
  }
  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  res.json(settings);
}
```

- [ ] **Step 2: Create settings routes**

Create `server/src/routes/settings.routes.ts`:

```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';
import { getSettings, updateSettings } from '../controllers/settings.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getSettings);
router.patch('/', requireRole(Role.ADMIN, Role.SUPER_ADMIN), updateSettings);

export default router;
```

- [ ] **Step 3: Register routes in app.ts**

In `server/src/app.ts`, add the imports and route registrations:

```typescript
import usersRoutes from './routes/users.routes';
import settingsRoutes from './routes/settings.routes';
```

And add after the existing routes (before `errorHandler`):

```typescript
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/settings', settingsRoutes);
```

(The users route may already be registered from a prior commit — check first and only add what's missing.)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/settings.controller.ts server/src/routes/settings.routes.ts server/src/app.ts
git commit -m "feat: SystemSettings GET + PATCH endpoints with upsert-on-first-access"
```

---

### Task 5: Server Integration Tests

**Files:**
- Create: `server/src/controllers/users.controller.test.ts` (covers users + settings)

- [ ] **Step 1: Write integration tests**

Create `server/src/controllers/users.controller.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';
import db from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { Role } from '@hotel/shared';

let superAdminToken: string;
let adminToken: string;
let superAdminId: number;
let adminId: number;

beforeAll(async () => {
  // Create SUPER_ADMIN
  const superAdmin = await db.user.create({
    data: {
      name: 'Super Admin',
      email: 'superadmin@test.com',
      password: await hashPassword('password123'),
      role: Role.SUPER_ADMIN,
    },
  });
  superAdminId = superAdmin.id;
  superAdminToken = signToken({ id: superAdmin.id, role: superAdmin.role, assignedBuildingId: null });

  // Create ADMIN
  const admin = await db.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@test.com',
      password: await hashPassword('password123'),
      role: Role.ADMIN,
    },
  });
  adminId = admin.id;
  adminToken = signToken({ id: admin.id, role: admin.role, assignedBuildingId: null });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: '@test.com' } } });
  await db.systemSettings.deleteMany({});
  await db.$disconnect();
});

describe('POST /api/v1/users', () => {
  it('creates a user and returns 201 with correct shape (no passwordHash)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', `token=${superAdminToken}`)
      .send({ name: 'Jane', email: 'jane@test.com', password: 'pass1234', role: 'RECEPTIONIST' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('jane@test.com');
    expect(res.body.role).toBe('RECEPTIONIST');
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('returns 409 on duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', `token=${superAdminToken}`)
      .send({ name: 'Dup', email: 'jane@test.com', password: 'pass1234', role: 'RECEPTIONIST' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email already in use');
  });

  it('returns 403 when ADMIN tries to create ADMIN user', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', `token=${adminToken}`)
      .send({ name: 'Admin2', email: 'admin2@test.com', password: 'pass1234', role: 'ADMIN' });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('SUPER_ADMIN');
  });

  it('returns 400 for BUILDING_ADMIN without assignedBuildingId', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', `token=${superAdminToken}`)
      .send({ name: 'B Admin', email: 'badmin@test.com', password: 'pass1234', role: 'BUILDING_ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('assignedBuildingId');
  });
});

describe('POST /api/v1/users/:id/deactivate', () => {
  let targetId: number;

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        name: 'Target',
        email: 'target@test.com',
        password: await hashPassword('pass'),
        role: Role.RECEPTIONIST,
      },
    });
    targetId = user.id;
  });

  it('deactivates user (sets deletedAt)', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${targetId}/deactivate`)
      .set('Cookie', `token=${superAdminToken}`);
    expect(res.status).toBe(200);
    const updated = await db.user.findUniqueWithDeleted({ where: { id: targetId } });
    expect(updated?.deletedAt).not.toBeNull();
  });

  it('deactivated user cannot log in (401)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target@test.com', password: 'pass' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Account deactivated');
  });

  it('returns 403 when admin deactivates self', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${superAdminId}/deactivate`)
      .set('Cookie', `token=${superAdminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('own account');
  });
});

describe('POST /api/v1/users/:id/reactivate', () => {
  it('reactivates user, subsequent login succeeds', async () => {
    // Find the deactivated target user
    const target = await db.user.findFirstWithDeleted({ where: { email: 'target@test.com' } });
    expect(target).not.toBeNull();

    const res = await request(app)
      .post(`/api/v1/users/${target!.id}/reactivate`)
      .set('Cookie', `token=${superAdminToken}`);
    expect(res.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target@test.com', password: 'pass' });
    expect(loginRes.status).toBe(200);
  });
});

describe('GET /api/v1/settings', () => {
  it('returns defaults on fresh DB (upsert on first call)', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe('My Property');
    expect(res.body.currency).toBe('AED');
    expect(res.body.timezone).toBe('Asia/Dubai');
  });

  it('PATCH updates fields, GET returns updated values', async () => {
    await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', `token=${adminToken}`)
      .send({ companyName: 'Test Corp', currency: 'USD' });

    const res = await request(app)
      .get('/api/v1/settings')
      .set('Cookie', `token=${adminToken}`);
    expect(res.body.companyName).toBe('Test Corp');
    expect(res.body.currency).toBe('USD');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd server && npm test -- --testPathPattern=users.controller.test
```

Expected: all tests pass. If `findManyWithDeleted` / `findUniqueWithDeleted` / `findFirstWithDeleted` are not available on `db` in test scope, the soft-delete extension must expose them — check the existing audit-soft-delete test for the correct method names used in tests.

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/users.controller.test.ts
git commit -m "test: user management + settings integration tests"
```

---

### Task 6: Client Role Updates

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout/BuildingSelector.tsx`

- [ ] **Step 1: Update App.tsx role arrays**

In `client/src/App.tsx`, update the role constant arrays to include the new roles:

```typescript
import { Role } from '@hotel/shared';

const ALL_STAFF = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.BUILDING_ADMIN,
  Role.RECEPTIONIST,
  Role.MAINTENANCE,
  Role.FINANCE,
];
const ADMIN_ONLY = [Role.SUPER_ADMIN, Role.ADMIN];
const ADMIN_RECEPTIONIST = [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST];
const ADMIN_FINANCE = [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE];
const TICKETS_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE];
```

Update the buildings route to use `ADMIN_ONLY`:

```typescript
<Route
  path="buildings"
  element={
    <ProtectedRoute allowedRoles={ADMIN_ONLY}>
      <BuildingsPage />
    </ProtectedRoute>
  }
/>
```

Add the `/users` and `/settings` routes (import the page components):

```typescript
import UsersPage from './pages/users/UsersPage';
import SettingsPage from './pages/settings/SettingsPage';
```

```typescript
<Route
  path="users"
  element={
    <ProtectedRoute allowedRoles={ADMIN_ONLY}>
      <UsersPage />
    </ProtectedRoute>
  }
/>
<Route
  path="settings"
  element={
    <ProtectedRoute allowedRoles={ALL_STAFF}>
      <SettingsPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 2: Hide BuildingSelector for BUILDING_ADMIN**

In `client/src/components/layout/BuildingSelector.tsx`, add the following early return. First import `useAuth` and `Role` if not already imported:

```typescript
import { useAuth } from '../../hooks/useAuth';
import { Role } from '@hotel/shared';
```

Then add at the top of the component function, before the `useBuildings()` call:

```typescript
const { data: currentUser } = useAuth();
if (currentUser?.role === Role.BUILDING_ADMIN) return null;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors (UsersPage and SettingsPage files don't exist yet — TypeScript may error on the imports; create empty placeholder components if needed, or skip tsc until Tasks 8 and 9 are done).

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/components/layout/BuildingSelector.tsx
git commit -m "feat: add SUPER_ADMIN/BUILDING_ADMIN to role arrays, hide BuildingSelector for BUILDING_ADMIN"
```

---

### Task 7: Client useUsers + useUsersMutations Hooks

**Files:**
- Create: `client/src/hooks/useUsers.ts`
- Create: `client/src/hooks/useUsersMutations.ts`

- [ ] **Step 1: Create useUsers hook**

Create `client/src/hooks/useUsers.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { Role } from '@hotel/shared';

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
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
    staleTime: 2 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Create useUsersMutations hook**

Create `client/src/hooks/useUsersMutations.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { Role } from '@hotel/shared';

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  role: Role;
  assignedBuildingId?: number | null;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: Role;
  assignedBuildingId?: number | null;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUserDto) => api.post('/users', dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateUserDto) => api.patch(`/users/${id}`, dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/users/${id}/deactivate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/users/${id}/reactivate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useUsers.ts client/src/hooks/useUsersMutations.ts
git commit -m "feat: useUsers and useUsersMutations hooks"
```

---

### Task 8: UsersPage + UserFormModal + Sidebar + Route

**Files:**
- Create: `client/src/pages/users/UserFormModal.tsx`
- Create: `client/src/pages/users/UsersPage.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/i18n/locales/en/translation.json`
- Modify: `client/src/i18n/locales/ar/translation.json`

- [ ] **Step 1: Create UserFormModal**

Create `client/src/pages/users/UserFormModal.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { UserListItem } from '../../hooks/useUsers';
import { useCreateUser, useUpdateUser, CreateUserDto, UpdateUserDto } from '../../hooks/useUsersMutations';
import { useAuth } from '../../hooks/useAuth';
import { useBuildings } from '../../hooks/useBuildings';

interface Props {
  user?: UserListItem | null;
  onClose: () => void;
}

const ROLE_OPTIONS_SUPER_ADMIN: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.BUILDING_ADMIN,
  Role.RECEPTIONIST,
  Role.MAINTENANCE,
  Role.FINANCE,
];

const ROLE_OPTIONS_ADMIN: Role[] = [
  Role.BUILDING_ADMIN,
  Role.RECEPTIONIST,
  Role.MAINTENANCE,
  Role.FINANCE,
];

export default function UserFormModal({ user, onClose }: Props) {
  const { t } = useTranslation();
  const { data: currentUser } = useAuth();
  const { data: buildings = [] } = useBuildings();
  const isEdit = !!user;

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? Role.RECEPTIONIST);
  const [assignedBuildingId, setAssignedBuildingId] = useState<number | ''>(
    user?.assignedBuildingId ?? ''
  );
  const [error, setError] = useState('');

  const createUser = useCreateUser();
  const updateUser = useUpdateUser(user?.id ?? 0);

  const roleOptions =
    currentUser?.role === Role.SUPER_ADMIN ? ROLE_OPTIONS_SUPER_ADMIN : ROLE_OPTIONS_ADMIN;

  useEffect(() => {
    if (role !== Role.BUILDING_ADMIN) setAssignedBuildingId('');
  }, [role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        const dto: UpdateUserDto = { name, email, role };
        if (role === Role.BUILDING_ADMIN) dto.assignedBuildingId = Number(assignedBuildingId) || null;
        else dto.assignedBuildingId = null;
        await updateUser.mutateAsync(dto);
      } else {
        const dto: CreateUserDto = {
          name,
          email,
          password,
          role,
          assignedBuildingId: role === Role.BUILDING_ADMIN ? (Number(assignedBuildingId) || null) : null,
        };
        await createUser.mutateAsync(dto);
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Something went wrong');
    }
  }

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-on-surface mb-4">
          {isEdit ? 'Edit User' : 'Add User'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-on-surface-variant">Name</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm text-on-surface-variant">Email</label>
            <input
              type="email"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {!isEdit && (
            <div>
              <label className="text-sm text-on-surface-variant">Password</label>
              <input
                type="password"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          )}
          <div>
            <label className="text-sm text-on-surface-variant">Role</label>
            <select
              className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          {role === Role.BUILDING_ADMIN && (
            <div>
              <label className="text-sm text-on-surface-variant">Building</label>
              <select
                className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={assignedBuildingId}
                onChange={(e) => setAssignedBuildingId(Number(e.target.value))}
                required
              >
                <option value="">Select building…</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-error text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create UsersPage**

Create `client/src/pages/users/UsersPage.tsx`:

```typescript
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useUsers, UserListItem } from '../../hooks/useUsers';
import { useDeactivateUser, useReactivateUser } from '../../hooks/useUsersMutations';
import { useAuth } from '../../hooks/useAuth';
import UserFormModal from './UserFormModal';

const ROLE_BADGE: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'bg-purple-100 text-purple-700',
  [Role.ADMIN]: 'bg-primary/10 text-primary',
  [Role.BUILDING_ADMIN]: 'bg-secondary/10 text-secondary',
  [Role.RECEPTIONIST]: 'bg-amber-100 text-amber-700',
  [Role.FINANCE]: 'bg-green-100 text-green-700',
  [Role.MAINTENANCE]: 'bg-orange-100 text-orange-700',
};

export default function UsersPage() {
  const { t } = useTranslation();
  const { data: currentUser } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const [modalUser, setModalUser] = useState<UserListItem | null | undefined>(undefined);
  // undefined = modal closed, null = create mode, UserListItem = edit mode

  if (isLoading) {
    return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>;
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

      <div className="bg-surface-container rounded-2xl overflow-hidden border border-outline-variant">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant">
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Name</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Email</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Role</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Building</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Status</th>
              <th className="text-right px-4 py-3 text-on-surface-variant font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
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
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${isDeactivated ? 'text-error' : 'text-tertiary'}`}>
                      {isDeactivated ? 'Deactivated' : 'Active'}
                    </span>
                  </td>
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

- [ ] **Step 3: Update Sidebar**

Replace `client/src/components/layout/Sidebar.tsx`:

```typescript
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'dashboard', key: 'dashboard', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: 'apartment', key: 'apartments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/tenants', icon: 'groups', key: 'tenants', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/buildings', icon: 'business', key: 'buildings', roles: [Role.SUPER_ADMIN, Role.ADMIN] },
  { to: '/payments', icon: 'payments', key: 'payments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/tickets', icon: 'build', key: 'tickets', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE] },
  { to: '/reports', icon: 'assessment', key: 'reports', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE] },
  { to: '/users', icon: 'group', key: 'users', roles: [Role.SUPER_ADMIN, Role.ADMIN] },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
    isActive
      ? 'text-primary font-bold ltr:border-r-4 rtl:border-l-4 border-primary bg-secondary-container/30'
      : 'text-on-surface-variant hover:bg-surface-container-high'
  }`;

export default function Sidebar() {
  const { t } = useTranslation();
  const { data: user } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role as Role)
  );

  return (
    <aside className="fixed h-full w-[280px] ltr:left-0 rtl:right-0 top-0 ltr:border-r rtl:border-l border-outline-variant bg-surface flex flex-col py-6 px-4 z-20">
      {/* Logo */}
      <div className="mb-10 px-2 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-lg shrink-0">
          <span className="material-symbols-outlined text-on-primary text-xl">apartment</span>
        </div>
        <div>
          <h1 className="text-base font-bold text-primary leading-tight">LuxStay Admin</h1>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            {t('brand.subtitle', 'Property Management')}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {visibleItems.map(({ to, icon, key }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <span className="material-symbols-outlined text-[22px]">{icon}</span>
            <span className="text-sm">{t(`nav.${key}`, key.charAt(0).toUpperCase() + key.slice(1))}</span>
          </NavLink>
        ))}
      </nav>

      {/* Settings link — all roles */}
      <div className="pt-6 border-t border-outline-variant space-y-1">
        <NavLink to="/settings" className={navLinkClass}>
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-sm">{t('nav.settings', 'Settings')}</span>
        </NavLink>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Add i18n keys**

In `client/src/i18n/locales/en/translation.json`, add to the `nav` object:

```json
"users": "Users",
"settings": "Settings"
```

In `client/src/i18n/locales/ar/translation.json`, add to the `nav` object:

```json
"users": "المستخدمون",
"settings": "الإعدادات"
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors (SettingsPage doesn't exist yet — add a placeholder if needed).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/users/ client/src/components/layout/Sidebar.tsx client/src/i18n/
git commit -m "feat: UsersPage, UserFormModal, Sidebar users nav + settings NavLink"
```

---

### Task 9: Settings Hooks + SettingsPage + Route

**Files:**
- Create: `client/src/hooks/useSettings.ts`
- Create: `client/src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1: Create useSettings hook**

Create `client/src/hooks/useSettings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface SystemSettings {
  id: number;
  companyName: string;
  currency: string;
  timezone: string;
  phone: string;
  email: string;
  address: string;
}

export function useSettings() {
  return useQuery<SystemSettings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Omit<SystemSettings, 'id'>>) =>
      api.patch('/settings', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}
```

- [ ] **Step 2: Create SettingsPage**

Create `client/src/pages/settings/SettingsPage.tsx`:

```typescript
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useSettings, useUpdateSettings, SystemSettings } from '../../hooks/useSettings';

type EditableField = keyof Omit<SystemSettings, 'id'>;

const CURRENCY_OPTIONS = ['AED', 'USD', 'EUR', 'GBP'];
const TIMEZONE_OPTIONS = [
  'Asia/Dubai',
  'Asia/Riyadh',
  'Africa/Cairo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Singapore',
];

const FIELD_LABELS: Record<EditableField, string> = {
  companyName: 'Company Name',
  currency: 'Currency',
  timezone: 'Timezone',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
};

interface InlineFieldProps {
  field: EditableField;
  value: string;
  canEdit: boolean;
  onSave: (field: EditableField, value: string) => Promise<void>;
}

function InlineField({ field, value, canEdit, onSave }: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const isSelect = field === 'currency' || field === 'timezone';
  const options = field === 'currency' ? CURRENCY_OPTIONS : TIMEZONE_OPTIONS;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(field, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-outline-variant last:border-0 group">
      <div className="flex-1">
        <p className="text-xs text-on-surface-variant mb-0.5">{FIELD_LABELS[field]}</p>
        {editing ? (
          isSelect ? (
            <select
              className="text-sm px-2 py-1 rounded border border-outline bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            >
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              className="text-sm px-2 py-1 rounded border border-outline bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary w-full max-w-xs"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          )
        ) : (
          <p className="text-sm text-on-surface">{value || '—'}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-2 ml-4 shrink-0">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1 rounded-lg bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(value); }}
                className="text-xs px-3 py-1 rounded-lg border border-outline text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => { setDraft(value); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-primary"
              title="Edit"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: currentUser } = useAuth();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const canEdit = currentUser?.role === Role.ADMIN || currentUser?.role === Role.SUPER_ADMIN;

  async function handleSave(field: EditableField, value: string) {
    await updateSettings.mutateAsync({ [field]: value });
  }

  function toggleLanguage() {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
  }

  if (isLoading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>;
  if (!settings) return null;

  const fields: EditableField[] = ['companyName', 'currency', 'timezone', 'phone', 'email', 'address'];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-on-surface">Settings</h1>

      {/* System Settings */}
      <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant">
        <h2 className="text-base font-semibold text-on-surface mb-4">System Settings</h2>
        {!canEdit && (
          <p className="text-xs text-on-surface-variant mb-4">
            Read-only. Contact your admin to make changes.
          </p>
        )}
        {fields.map((field) => (
          <InlineField
            key={field}
            field={field}
            value={settings[field]}
            canEdit={canEdit}
            onSave={handleSave}
          />
        ))}
      </div>

      {/* User Preferences */}
      <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant">
        <h2 className="text-base font-semibold text-on-surface mb-4">Preferences</h2>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-xs text-on-surface-variant mb-0.5">Language</p>
            <p className="text-sm text-on-surface">{i18n.language === 'ar' ? 'Arabic (عربي)' : 'English'}</p>
          </div>
          <button
            onClick={toggleLanguage}
            className="text-xs px-4 py-2 rounded-lg border border-outline text-on-surface hover:bg-surface-container-high transition-colors"
          >
            {i18n.language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
cd server && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useSettings.ts client/src/pages/settings/SettingsPage.tsx
git commit -m "feat: useSettings hook and SettingsPage with inline editing and language toggle"
```

---

## Spec Self-Review

**Spec coverage:**

- ✅ SUPER_ADMIN + BUILDING_ADMIN roles → Task 1 (shared enum + schema)
- ✅ assignedBuildingId on User → Task 1
- ✅ SystemSettings model → Task 1
- ✅ JWT includes assignedBuildingId → Task 2 (signToken payload)
- ✅ Login blocks deactivated users → Task 2 (auth.controller)
- ✅ AuthRequest includes assignedBuildingId → Task 2 (auth.middleware)
- ✅ requireRole passes SUPER_ADMIN → Task 2 (role.middleware)
- ✅ assertBuildingAccess helper → Task 2
- ✅ assertBuildingAccess applied to apartments create/update → Task 2
- ✅ assertBuildingAccess applied to tickets create → Task 2
- ✅ Users CRUD + deactivate/reactivate → Task 3
- ✅ BUILDING_ADMIN requires assignedBuildingId → Task 3 (create validation)
- ✅ ADMIN cannot create ADMIN/SUPER_ADMIN → Task 3
- ✅ Cannot deactivate own account → Task 3
- ✅ Reactivate bypasses soft-delete extension → Task 3 (fresh PrismaClient)
- ✅ Settings GET (upsert defaults) + PATCH → Task 4
- ✅ Integration tests (all 10 scenarios from spec) → Task 5
- ✅ BuildingSelector hidden for BUILDING_ADMIN → Task 6
- ✅ ALL_STAFF includes new roles → Task 6
- ✅ useUsers + useUsersMutations → Task 7
- ✅ UsersPage with role badges + deactivated row styling → Task 8
- ✅ UserFormModal (create/edit, role-scoped options, building select for BUILDING_ADMIN) → Task 8
- ✅ Sidebar Users nav item (ADMIN + SUPER_ADMIN only) → Task 8
- ✅ Settings NavLink in sidebar → Task 8
- ✅ i18n keys nav.users + nav.settings → Task 8
- ✅ useSettings + useUpdateSettings → Task 9
- ✅ SettingsPage inline edit pattern → Task 9
- ✅ SettingsPage read-only for non-ADMIN → Task 9
- ✅ Language toggle in Settings → Task 9

**Placeholder scan:** No TBDs or vague steps found.

**Type consistency:** `TokenPayload` defined in Task 2 (`jwt.ts`) is used consistently in `auth.controller.ts`. `UserListItem` defined in Task 7 is used in Task 8. `SystemSettings` defined in Task 9 matches `useSettings` interface.
