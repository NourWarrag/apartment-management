# Wave 3B — File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file attachment support (upload, list, delete) to Apartments, Tenants, Bookings, and Maintenance Tickets, with a pluggable local/S3 storage backend.

**Architecture:** One polymorphic `Attachment` table (`entityType + entityId`). A `StorageProvider` interface with a `LocalStorageProvider` default (files served at `/files/*`). A single `makeAttachmentHandlers(entityType)` factory produces the three Express handlers; entity-scoped routes in each existing route file call them. A reusable `AttachmentPanel` React component wires into four existing detail pages.

**Tech Stack:** Express + Prisma + multer (server), React Query + Axios FormData (client), Tailwind MD3 tokens (UI)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `shared/index.ts` | Add `AttachmentEntity` enum |
| Modify | `server/prisma/schema.prisma` | Add `AttachmentEntity` enum + `Attachment` model + `uploadedAttachments` on User |
| Create | `server/prisma/migrations/20260515200000_wave3b_attachments/migration.sql` | DB migration |
| Modify | `server/.env` | Add `STORAGE_TYPE=local`, `STORAGE_PATH=./uploads` |
| Create | `server/src/lib/storage.ts` | `StorageProvider` interface + `LocalStorageProvider` + `getStorage()` |
| Create | `server/src/middleware/upload.middleware.ts` | multer config with type/size validation |
| Create | `server/src/controllers/attachments.controller.ts` | `makeAttachmentHandlers(entityType)` factory |
| Modify | `server/src/routes/apartments.routes.ts` | Add 3 attachment routes |
| Modify | `server/src/routes/tenants.routes.ts` | Add 3 attachment routes |
| Modify | `server/src/routes/bookings.routes.ts` | Add 3 attachment routes |
| Modify | `server/src/routes/tickets.routes.ts` | Add 3 attachment routes |
| Modify | `server/src/app.ts` | Add `/files` static file serving |
| Create | `server/src/controllers/attachments.controller.test.ts` | Integration tests |
| Create | `client/src/hooks/useAttachments.ts` | React Query hooks for list/upload/delete |
| Create | `client/src/components/AttachmentPanel.tsx` | Reusable upload/list/delete UI |
| Modify | `client/src/pages/apartments/ApartmentDetailPage.tsx` | Add AttachmentPanel (apartment + booking) |
| Modify | `client/src/pages/tenants/TenantDetailPage.tsx` | Add AttachmentPanel |
| Modify | `client/src/pages/tickets/TicketDetailPanel.tsx` | Add AttachmentPanel |

---

### Task 1: Schema + Migration + Shared Enum + Dependencies

**Files:**
- Modify: `shared/index.ts`
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260515200000_wave3b_attachments/migration.sql`
- Modify: `server/.env`

**Context:** `shared/index.ts` already exports string enums (Role, ApartmentStatus, etc.) — follow that exact pattern. The User model has many named `@relation` directives; you must add `uploadedAttachments` with name `"AttachmentUploadedBy"` or Prisma will error. `multer` is not yet installed — install it first. The Prisma extended client in `server/src/lib/prisma.ts` auto-handles `createdBy`/`updatedBy` for some models — `Attachment` does not need those columns (keep it simple).

- [ ] **Step 1: Install multer**

```bash
cd server
npm install multer
npm install --save-dev @types/multer
```

Expected: `added 2 packages` (or similar).

- [ ] **Step 2: Add `AttachmentEntity` to `shared/index.ts`**

Open `shared/index.ts`. After the `DepositStatus` enum, add:

```typescript
export enum AttachmentEntity {
  APARTMENT = 'APARTMENT',
  TENANT = 'TENANT',
  BOOKING = 'BOOKING',
  TICKET = 'TICKET',
}
```

- [ ] **Step 3: Add enum + model to `server/prisma/schema.prisma`**

**3a.** Find the User model. After the last existing back-relation line (the `assignedBuilding` relation line), add:

```prisma
  uploadedAttachments Attachment[] @relation("AttachmentUploadedBy")
```

**3b.** At the very bottom of `schema.prisma`, after the `DepositStatus` enum, add:

```prisma
enum AttachmentEntity {
  APARTMENT
  TENANT
  BOOKING
  TICKET
}

model Attachment {
  id          Int              @id @default(autoincrement())
  entityType  AttachmentEntity
  entityId    Int
  filename    String
  storagePath String
  mimeType    String
  size        Int
  uploadedBy  Int
  uploader    User             @relation("AttachmentUploadedBy", fields: [uploadedBy], references: [id])
  createdAt   DateTime         @default(now())

  @@index([entityType, entityId])
}
```

- [ ] **Step 4: Create the migration file**

Create directory `server/prisma/migrations/20260515200000_wave3b_attachments/` and create `migration.sql` inside:

```sql
-- Add AttachmentEntity enum
CREATE TYPE "AttachmentEntity" AS ENUM ('APARTMENT', 'TENANT', 'BOOKING', 'TICKET');

-- Create Attachment table
CREATE TABLE "Attachment" (
  "id" SERIAL NOT NULL,
  "entityType" "AttachmentEntity" NOT NULL,
  "entityId" INTEGER NOT NULL,
  "filename" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "uploadedBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- Foreign key to User
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedBy_fkey"
  FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index for entity lookups
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");
```

- [ ] **Step 5: Add storage env vars to `server/.env`**

Append to the end of `server/.env`:

```
STORAGE_TYPE=local
STORAGE_PATH=./uploads
```

- [ ] **Step 6: Apply migration to dev and test databases**

```bash
cd server
npx prisma migrate deploy
TEST_DATABASE_URL="postgresql://hotel:hotel123@localhost:5433/hotel_test" DATABASE_URL="postgresql://hotel:hotel123@localhost:5433/hotel_test" npx prisma migrate deploy
```

Expected: `All migrations have been successfully applied.`

- [ ] **Step 7: Regenerate Prisma client**

```bash
cd server && npx prisma generate
```

If you get `EPERM` on Windows (dev server locking the DLL), delete `server/node_modules/.prisma/client/query_engine-windows.dll.node` then retry.

Expected: `Generated Prisma Client`

- [ ] **Step 8: Commit**

```bash
git add shared/index.ts server/prisma/schema.prisma server/prisma/migrations/ server/.env
git commit -m "feat: add AttachmentEntity enum, Attachment model, and schema migration"
```

---

### Task 2: Storage Abstraction

**Files:**
- Create: `server/src/lib/storage.ts`

**Context:** Uses multer memory storage — `req.file.buffer` contains the raw bytes. Local files are written to `STORAGE_PATH` (defaults to `./uploads`). The `storagePath` is a relative key like `APARTMENT/5/uuid-lease.pdf`. Files are served at `/files/<storagePath>` via an Express static route added in Task 4. The `uuid` package is already installed. Use `fs.mkdirSync(..., { recursive: true })` to create nested directories safely on Windows.

- [ ] **Step 1: Create `server/src/lib/storage.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StorageProvider {
  save(file: Express.Multer.File, storagePath: string): Promise<void>;
  delete(storagePath: string): Promise<void>;
  url(storagePath: string): string;
}

class LocalStorageProvider implements StorageProvider {
  constructor(private basePath: string) {}

  async save(file: Express.Multer.File, storagePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storagePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.buffer);
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storagePath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  url(storagePath: string): string {
    return `/files/${storagePath}`;
  }
}

class S3StorageProvider implements StorageProvider {
  async save(_file: Express.Multer.File, _storagePath: string): Promise<void> {
    throw new Error('S3 storage not yet configured. Install @aws-sdk/client-s3 and implement.');
  }
  async delete(_storagePath: string): Promise<void> {
    throw new Error('S3 storage not yet configured.');
  }
  url(_storagePath: string): string {
    throw new Error('S3 storage not yet configured.');
  }
}

export function buildStoragePath(entityType: string, entityId: number, originalName: string): string {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `${entityType}/${entityId}/${uuidv4()}-${base}${ext}`;
}

let _storage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!_storage) {
    _storage = process.env.STORAGE_TYPE === 's3'
      ? new S3StorageProvider()
      : new LocalStorageProvider(path.resolve(process.env.STORAGE_PATH ?? './uploads'));
  }
  return _storage;
}

export function _resetStorage(): void {
  _storage = null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/storage.ts
git commit -m "feat: add StorageProvider interface and LocalStorageProvider"
```

---

### Task 3: Upload Middleware + Attachments Controller

**Files:**
- Create: `server/src/middleware/upload.middleware.ts`
- Create: `server/src/controllers/attachments.controller.ts`

**Context:** The upload middleware wraps multer in a function that catches multer errors synchronously and converts them to JSON 400 responses — this is the standard pattern for using multer without Express's `next(err)` flow. The controller uses a factory `makeAttachmentHandlers(entityType)` that closes over the entity type. Entity existence is checked via a per-entity async function (type-safe, avoids `prisma as any`). The `AuthRequest` type is imported from `auth.middleware` — it extends `Request` with `user: { id, role, assignedBuildingId }`.

- [ ] **Step 1: Create `server/src/middleware/upload.middleware.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const _multer = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_TYPE'));
    }
  },
}).single('file');

export function uploadFile(req: Request, res: Response, next: NextFunction): void {
  _multer(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'File too large. Maximum size is 10 MB' });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_TYPE') {
      res.status(400).json({ message: 'Invalid file type. Allowed: PDF, JPG, PNG, DOCX' });
      return;
    }
    next(err);
  });
}
```

- [ ] **Step 2: Create `server/src/controllers/attachments.controller.ts`**

```typescript
import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { getStorage, buildStoragePath } from '../lib/storage';
import { AttachmentEntity } from '@hotel/shared';

type EntityChecker = (id: number) => Promise<boolean>;

const ENTITY_EXISTS: Record<AttachmentEntity, EntityChecker> = {
  [AttachmentEntity.APARTMENT]: (id) =>
    prisma.apartment.findUnique({ where: { id } }).then(Boolean),
  [AttachmentEntity.TENANT]: (id) =>
    prisma.tenant.findUnique({ where: { id } }).then(Boolean),
  [AttachmentEntity.BOOKING]: (id) =>
    prisma.booking.findUnique({ where: { id } }).then(Boolean),
  [AttachmentEntity.TICKET]: (id) =>
    prisma.maintenanceTicket.findUnique({ where: { id } }).then(Boolean),
};

const ENTITY_LABEL: Record<AttachmentEntity, string> = {
  [AttachmentEntity.APARTMENT]: 'Apartment',
  [AttachmentEntity.TENANT]: 'Tenant',
  [AttachmentEntity.BOOKING]: 'Booking',
  [AttachmentEntity.TICKET]: 'Ticket',
};

export function makeAttachmentHandlers(entityType: AttachmentEntity) {
  async function upload(req: AuthRequest, res: Response): Promise<void> {
    try {
      const entityId = Number(req.params.id);
      if (!entityId || entityId <= 0) {
        res.status(400).json({ message: 'Invalid ID' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ message: 'File is required' });
        return;
      }
      const exists = await ENTITY_EXISTS[entityType](entityId);
      if (!exists) {
        res.status(404).json({ message: `${ENTITY_LABEL[entityType]} not found` });
        return;
      }

      const storage = getStorage();
      const storagePath = buildStoragePath(entityType, entityId, req.file.originalname);
      await storage.save(req.file, storagePath);

      const attachment = await prisma.attachment.create({
        data: {
          entityType,
          entityId,
          filename: req.file.originalname,
          storagePath,
          mimeType: req.file.mimetype,
          size: req.file.size,
          uploadedBy: req.user!.id,
        },
      });

      res.status(201).json({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url: storage.url(storagePath),
        createdAt: attachment.createdAt,
      });
    } catch {
      res.status(500).json({ message: 'Failed to save file' });
    }
  }

  async function list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const entityId = Number(req.params.id);
      if (!entityId || entityId <= 0) {
        res.status(400).json({ message: 'Invalid ID' });
        return;
      }

      const attachments = await prisma.attachment.findMany({
        where: { entityType, entityId },
        include: { uploader: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const storage = getStorage();
      res.json(
        attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          url: storage.url(a.storagePath),
          uploadedBy: a.uploader,
          createdAt: a.createdAt,
        }))
      );
    } catch {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async function remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const entityId = Number(req.params.id);
      const attId = Number(req.params.attId);
      if (!entityId || entityId <= 0 || !attId || attId <= 0) {
        res.status(400).json({ message: 'Invalid ID' });
        return;
      }

      const attachment = await prisma.attachment.findFirst({
        where: { id: attId, entityType, entityId },
      });
      if (!attachment) {
        res.status(404).json({ message: 'Attachment not found' });
        return;
      }

      const storage = getStorage();
      await storage.delete(attachment.storagePath);
      await prisma.attachment.delete({ where: { id: attId } });

      res.status(204).end();
    } catch {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  return { upload, list, remove };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/upload.middleware.ts server/src/controllers/attachments.controller.ts
git commit -m "feat: add upload middleware and attachment controller factory"
```

---

### Task 4: Route Registration + Static File Serving

**Files:**
- Modify: `server/src/routes/apartments.routes.ts`
- Modify: `server/src/routes/tenants.routes.ts`
- Modify: `server/src/routes/bookings.routes.ts`
- Modify: `server/src/routes/tickets.routes.ts`
- Modify: `server/src/app.ts`

**Context:** Each route file gets 3 new routes. The `uploadFile` middleware runs before the `upload` handler — multer errors are caught inside it and returned as JSON before the controller runs. `GET /:id/attachments` does not require a role guard (same access as `GET /:id`). The attachment routes must be registered before the `/:id` param routes to avoid Express treating `attachments` as a param value — in practice Express matches the specific string first, but order still matters for clarity. In `app.ts`, `express.static` is added to serve local uploaded files; it runs before the error handler.

- [ ] **Step 1: Replace `server/src/routes/apartments.routes.ts`**

```typescript
import { Router } from 'express';
import { list, create, getById, update, remove, markReady } from '../controllers/apartments.controller';
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadFile } from '../middleware/upload.middleware';
import { Role, AttachmentEntity } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

const att = makeAttachmentHandlers(AttachmentEntity.APARTMENT);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', getById);
router.put('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);
router.patch('/:id/mark-ready', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), markReady);
router.patch('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);
router.delete('/:id', requireRole(Role.ADMIN), remove);

router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), uploadFile, att.upload);
router.get('/:id/attachments', att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.remove);

export default router;
```

- [ ] **Step 2: Add attachment routes to `server/src/routes/tenants.routes.ts`**

Read the current file first. Add these imports at the top (after existing imports):

```typescript
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { uploadFile } from '../middleware/upload.middleware';
import { AttachmentEntity } from '@hotel/shared';
```

Add before `export default router;`:

```typescript
const att = makeAttachmentHandlers(AttachmentEntity.TENANT);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), uploadFile, att.upload);
router.get('/:id/attachments', att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.remove);
```

- [ ] **Step 3: Add attachment routes to `server/src/routes/bookings.routes.ts`**

Read the current file first. Add these imports at the top (after existing imports):

```typescript
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { uploadFile } from '../middleware/upload.middleware';
import { AttachmentEntity } from '@hotel/shared';
```

Add before `export default router;`:

```typescript
const att = makeAttachmentHandlers(AttachmentEntity.BOOKING);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), uploadFile, att.upload);
router.get('/:id/attachments', att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.remove);
```

- [ ] **Step 4: Add attachment routes to `server/src/routes/tickets.routes.ts`**

Read the current file first. Add these imports at the top (after existing imports):

```typescript
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { uploadFile } from '../middleware/upload.middleware';
import { AttachmentEntity } from '@hotel/shared';
```

Add before `export default router;`:

```typescript
const att = makeAttachmentHandlers(AttachmentEntity.TICKET);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE), uploadFile, att.upload);
router.get('/:id/attachments', att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE), att.remove);
```

- [ ] **Step 5: Add static file serving to `server/src/app.ts`**

Add `path` to the imports at the top:

```typescript
import path from 'path';
```

Add this line **before** `app.use(errorHandler);`:

```typescript
app.use('/files', express.static(path.resolve(process.env.STORAGE_PATH ?? './uploads')));
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/apartments.routes.ts server/src/routes/tenants.routes.ts \
        server/src/routes/bookings.routes.ts server/src/routes/tickets.routes.ts \
        server/src/app.ts
git commit -m "feat: register attachment routes and add static file serving"
```

---

### Task 5: Integration Tests

**Files:**
- Create: `server/src/controllers/attachments.controller.test.ts`

**Context:** Tests use `testPrisma` (bare PrismaClient against `TEST_DATABASE_URL`) for setup/teardown. Auth via cookie `token=${signToken({id, role, assignedBuildingId: null})}`. For file upload, supertest uses `.attach('file', buffer, { filename, contentType })`. The `STORAGE_PATH` env var must be set to a writable test directory before the storage singleton is initialized — set it at the top of the file and call `_resetStorage()` before tests run so the singleton picks up the test path. Clean up the test uploads directory in `afterAll`.

- [ ] **Step 1: Create `server/src/controllers/attachments.controller.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import app from '../app';
import db from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { Role } from '@hotel/shared';
import { _resetStorage } from '../lib/storage';

const TEST_UPLOADS = path.resolve('./test-uploads-att');
process.env.STORAGE_PATH = TEST_UPLOADS;
process.env.STORAGE_TYPE = 'local';
_resetStorage();

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminToken: string;
let maintToken: string;
let buildingId: number;
let aptId: number;
let tenantId: number;
let ticketId: number;

const PDF_BUFFER = Buffer.from('%PDF-1.4 fake pdf content');

beforeAll(async () => {
  fs.mkdirSync(TEST_UPLOADS, { recursive: true });

  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%')`;
  await testPrisma.$executeRaw`DELETE FROM "MaintenanceTicket" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'ATT-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000099')`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000099'`;
  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'ATT-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email IN ('att_admin@test.com', 'att_maint@test.com')`;

  const building = await testPrisma.building.create({
    data: { name: 'Att Building', code: 'ATT-BLD', address: '1 Att St' },
  });
  buildingId = building.id;

  const admin = await testPrisma.user.create({
    data: {
      name: 'Att Admin',
      email: 'att_admin@test.com',
      password: await hashPassword('password123'),
      role: Role.ADMIN,
    },
  });
  adminToken = `token=${signToken({ id: admin.id, role: admin.role, assignedBuildingId: null })}`;

  const maint = await testPrisma.user.create({
    data: {
      name: 'Att Maint',
      email: 'att_maint@test.com',
      password: await hashPassword('password123'),
      role: Role.MAINTENANCE,
    },
  });
  maintToken = `token=${signToken({ id: maint.id, role: maint.role, assignedBuildingId: null })}`;

  const apt = await testPrisma.apartment.create({
    data: { number: 'ATT-001', floor: 1, buildingId },
  });
  aptId = apt.id;

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Att Tenant', phone: '0500000099', idNumber: 'ATT-ID-001' },
  });
  tenantId = tenant.id;

  const ticket = await testPrisma.maintenanceTicket.create({
    data: {
      apartmentId: aptId,
      description: 'Test ticket',
      priority: 'LOW',
      status: 'OPEN',
    },
  });
  ticketId = ticket.id;
});

afterAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%')`;
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000099')`;
  await testPrisma.$executeRaw`DELETE FROM "MaintenanceTicket" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'ATT-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000099'`;
  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'ATT-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email IN ('att_admin@test.com', 'att_maint@test.com')`;
  await testPrisma.$disconnect();
  await db.$disconnect();

  if (fs.existsSync(TEST_UPLOADS)) {
    fs.rmSync(TEST_UPLOADS, { recursive: true, force: true });
  }
});

describe('POST /api/v1/apartments/:id/attachments', () => {
  it('uploads a file and returns 201 with url', async () => {
    const res = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken)
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.filename).toBe('test.pdf');
    expect(res.body.mimeType).toBe('application/pdf');
    expect(res.body.size).toBe(PDF_BUFFER.length);
    expect(res.body.url).toMatch(/^\/files\/APARTMENT\//);
    expect(res.body.id).toBeTypeOf('number');

    const storagePath = res.body.url.replace('/files/', '');
    const fullPath = path.join(TEST_UPLOADS, storagePath);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it('returns 400 for invalid file type', async () => {
    const res = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken)
      .attach('file', Buffer.from('exe content'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid file type. Allowed: PDF, JPG, PNG, DOCX');
  });

  it('returns 404 when apartment does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/apartments/99999/attachments')
      .set('Cookie', adminToken)
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Apartment not found');
  });
});

describe('GET /api/v1/apartments/:id/attachments', () => {
  it('returns attachment list with url and uploadedBy', async () => {
    const res = await request(app)
      .get(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const att = res.body[0];
    expect(att.filename).toBe('test.pdf');
    expect(att.url).toMatch(/^\/files\//);
    expect(att.uploadedBy).toMatchObject({ name: 'Att Admin' });
  });
});

describe('DELETE /api/v1/apartments/:id/attachments/:attId', () => {
  it('deletes the attachment and removes the file', async () => {
    const uploadRes = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken)
      .attach('file', PDF_BUFFER, { filename: 'to-delete.pdf', contentType: 'application/pdf' });

    const attId = uploadRes.body.id;
    const storagePath = uploadRes.body.url.replace('/files/', '');
    const fullPath = path.join(TEST_UPLOADS, storagePath);
    expect(fs.existsSync(fullPath)).toBe(true);

    const delRes = await request(app)
      .delete(`/api/v1/apartments/${aptId}/attachments/${attId}`)
      .set('Cookie', adminToken);

    expect(delRes.status).toBe(204);
    expect(fs.existsSync(fullPath)).toBe(false);
  });

  it('returns 404 when attachment belongs to different entity', async () => {
    const uploadRes = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken)
      .attach('file', PDF_BUFFER, { filename: 'wrong-entity.pdf', contentType: 'application/pdf' });

    const attId = uploadRes.body.id;

    const res = await request(app)
      .delete(`/api/v1/apartments/99999/attachments/${attId}`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Attachment not found');
  });
});

describe('Ticket attachments (MAINTENANCE role)', () => {
  it('MAINTENANCE can upload to their tickets', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set('Cookie', maintToken)
      .attach('file', PDF_BUFFER, { filename: 'damage.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/files\/TICKET\//);
  });

  it('MAINTENANCE cannot upload apartment attachments', async () => {
    const res = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', maintToken)
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests and verify they pass**

```bash
cd server && npx vitest run --reporter=verbose src/controllers/attachments.controller.test.ts
```

Expected: All tests pass (green). If you see EPERM errors on Windows for the test uploads directory, ensure the dev server is not locking the directory.

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/attachments.controller.test.ts
git commit -m "test: attachment upload, list, delete integration tests"
```

---

### Task 6: Client Hook

**Files:**
- Create: `client/src/hooks/useAttachments.ts`

**Context:** The URL mapping converts `AttachmentEntity` values to REST path segments. FormData with `Content-Type: multipart/form-data` must be set explicitly on the axios call or the boundary won't be included. Query key is `['attachments', entityType, entityId]` — all three parts so list invalidations are scoped per entity instance.

- [ ] **Step 1: Create `client/src/hooks/useAttachments.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

type EntityType = 'APARTMENT' | 'TENANT' | 'BOOKING' | 'TICKET';

const ENTITY_URL: Record<EntityType, string> = {
  APARTMENT: 'apartments',
  TENANT: 'tenants',
  BOOKING: 'bookings',
  TICKET: 'tickets',
};

export interface AttachmentItem {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy: { id: number; name: string };
  createdAt: string;
}

export function useAttachments(entityType: EntityType, entityId: number) {
  const base = ENTITY_URL[entityType];
  return useQuery<AttachmentItem[]>({
    queryKey: ['attachments', entityType, entityId],
    queryFn: async () => {
      const res = await api.get(`/${base}/${entityId}/attachments`);
      return res.data;
    },
    enabled: entityId > 0,
  });
}

export function useUploadAttachment(entityType: EntityType, entityId: number) {
  const queryClient = useQueryClient();
  const base = ENTITY_URL[entityType];
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post(`/${base}/${entityId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] }),
  });
}

export function useDeleteAttachment(entityType: EntityType, entityId: number) {
  const queryClient = useQueryClient();
  const base = ENTITY_URL[entityType];
  return useMutation({
    mutationFn: (attId: number) =>
      api.delete(`/${base}/${entityId}/attachments/${attId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] }),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useAttachments.ts
git commit -m "feat: add useAttachments, useUploadAttachment, useDeleteAttachment hooks"
```

---

### Task 7: AttachmentPanel Component

**Files:**
- Create: `client/src/components/AttachmentPanel.tsx`

**Context:** Follows the MD3 design system tokens used throughout the app (`text-on-surface`, `border-outline-variant`, `bg-surface-container-low`, etc.). Uses a hidden `<input type="file">` triggered by a styled button — this is the standard web pattern for custom file upload UIs. `window.confirm` is used for delete confirmation (no modal needed — it's a simple yes/no). The `fileIcon` helper maps MIME types to Material Symbols icon names; all other types fall back to `description`.

- [ ] **Step 1: Create `client/src/components/AttachmentPanel.tsx`**

```typescript
import { useRef } from 'react';
import toast from 'react-hot-toast';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '../hooks/useAttachments';
import type { AttachmentItem } from '../hooks/useAttachments';

type EntityType = 'APARTMENT' | 'TENANT' | 'BOOKING' | 'TICKET';

interface Props {
  entityType: EntityType;
  entityId: number;
  canEdit: boolean;
}

function fileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'picture_as_pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return 'description';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentPanel({ entityType, entityId, canEdit }: Props) {
  const { data: attachments = [], isLoading } = useAttachments(entityType, entityId);
  const upload = useUploadAttachment(entityType, entityId);
  const remove = useDeleteAttachment(entityType, entityId);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success('File uploaded');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Upload failed');
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDelete = async (att: AttachmentItem) => {
    if (!window.confirm(`Delete "${att.filename}"?`)) return;
    try {
      await remove.mutateAsync(att.id);
      toast.success('Attachment deleted');
    } catch {
      toast.error('Failed to delete attachment');
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-on-surface">Attachments</h3>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">upload</span>
              {upload.isPending ? 'Uploading…' : 'Upload file'}
            </button>
          </>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      )}

      {!isLoading && attachments.length === 0 && (
        <p className="text-sm text-on-surface-variant">No attachments yet.</p>
      )}

      <ul className="space-y-2">
        {attachments.map((att) => (
          <li
            key={att.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[22px] text-on-surface-variant flex-shrink-0">
              {fileIcon(att.mimeType)}
            </span>
            <div className="flex-1 min-w-0">
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline truncate block"
              >
                {att.filename}
              </a>
              <p className="text-xs text-on-surface-variant">
                {formatSize(att.size)} · {att.uploadedBy.name}
              </p>
            </div>
            {canEdit && (
              <button
                onClick={() => handleDelete(att)}
                disabled={remove.isPending}
                className="p-1 hover:bg-surface-container rounded-full text-on-surface-variant disabled:opacity-50 flex-shrink-0"
                title="Delete attachment"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AttachmentPanel.tsx
git commit -m "feat: add AttachmentPanel component"
```

---

### Task 8: Wire AttachmentPanel into Detail Pages

**Files:**
- Modify: `client/src/pages/apartments/ApartmentDetailPage.tsx`
- Modify: `client/src/pages/tenants/TenantDetailPage.tsx`
- Modify: `client/src/pages/tickets/TicketDetailPanel.tsx`

**Context:** `ApartmentDetailPage` gets two `AttachmentPanel` instances — one for the apartment itself, one for its current booking (only shown when `apartment.currentBooking` exists). `TenantDetailPage` gets one panel. `TicketDetailPanel` receives `canEditAll` for its edit permission. Make surgical changes only — don't restructure the file. Add the import at the top and the component at the end of each page's content section, just before the closing `</div>` of the main content wrapper.

- [ ] **Step 1: Add AttachmentPanel to `ApartmentDetailPage.tsx`**

Read the file first to find the exact closing structure.

Add to imports at the top:
```typescript
import AttachmentPanel from '../../components/AttachmentPanel';
```

Add just before the final `</div>` that closes the component return (before the `{showEdit && ...}` modal block is fine too — pick the last position inside the main content area):

```typescript
<AttachmentPanel entityType="APARTMENT" entityId={aptId} canEdit={canEdit} />

{apartment.currentBooking && (
  <div className="mt-6">
    <p className="text-sm font-bold text-on-surface mb-2">Booking Attachments</p>
    <AttachmentPanel
      entityType="BOOKING"
      entityId={apartment.currentBooking.id}
      canEdit={canEdit}
    />
  </div>
)}
```

- [ ] **Step 2: Add AttachmentPanel to `TenantDetailPage.tsx`**

Read the file first to find the correct location.

Add to imports at the top:
```typescript
import AttachmentPanel from '../../components/AttachmentPanel';
```

Add just before the final closing `</div>` of the component's return content:

```typescript
<AttachmentPanel entityType="TENANT" entityId={tenantId} canEdit={canEdit} />
```

- [ ] **Step 3: Add AttachmentPanel to `TicketDetailPanel.tsx`**

Read the file first to find the correct location and confirm the `canEditAll` prop name.

Add to imports at the top:
```typescript
import AttachmentPanel from '../../components/AttachmentPanel';
```

Add just before the action buttons section (before the `<div className="flex gap-3...">` that contains the Save Draft / Mark Resolved buttons, or inside the panel's scrollable content area):

```typescript
<AttachmentPanel entityType="TICKET" entityId={ticket.id} canEdit={canEditAll} />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: No errors (only pre-existing LoginPage error is acceptable).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/apartments/ApartmentDetailPage.tsx \
        client/src/pages/tenants/TenantDetailPage.tsx \
        client/src/pages/tickets/TicketDetailPanel.tsx
git commit -m "feat: add AttachmentPanel to apartment, tenant, and ticket detail pages"
```
