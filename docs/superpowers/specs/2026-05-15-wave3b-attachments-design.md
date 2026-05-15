# Wave 3B — File Attachments Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Goal

Add file attachment support to Apartments, Tenants, Bookings, and Maintenance Tickets. Staff can upload PDFs, images (JPG, PNG), and DOCX documents (max 10 MB each), view them, and delete them. Storage is pluggable: local disk by default, S3-compatible on demand.

---

## Architecture

One `Attachment` model with a polymorphic entity reference (`entityType + entityId`). Routes are entity-scoped (`POST /apartments/:id/attachments`) and map to a single shared controller. A `StorageProvider` interface abstracts local vs. S3 storage, selected via `STORAGE_TYPE` in `.env`.

---

## Schema

### New enum: `AttachmentEntity`

```prisma
enum AttachmentEntity {
  APARTMENT
  TENANT
  BOOKING
  TICKET
}
```

### New model: `Attachment`

```prisma
model Attachment {
  id          Int              @id @default(autoincrement())
  entityType  AttachmentEntity
  entityId    Int
  filename    String           // sanitized display name (original filename)
  storagePath String           // internal key: relative path (local) or S3 object key
  mimeType    String
  size        Int              // bytes
  uploadedBy  Int
  uploader    User             @relation(fields: [uploadedBy], references: [id])
  createdAt   DateTime         @default(now())
}
```

### Migration strategy

Single migration: add `AttachmentEntity` enum and `Attachment` table. No backfill needed.

---

## Storage Abstraction

### Interface: `server/src/lib/storage.ts`

```typescript
export interface StorageProvider {
  save(file: Express.Multer.File, storagePath: string): Promise<string>;
  delete(storagePath: string): Promise<void>;
  url(storagePath: string): string;
}
```

### Local implementation

- Saves to `${STORAGE_PATH}/<storagePath>` (defaults to `./uploads`)
- `storagePath` format: `<entityType>/<entityId>/<uuid>-<sanitizedFilename>`
- Files served at `GET /files/*` via `express.static(STORAGE_PATH)`
- `url()` returns `/files/<storagePath>`

### S3 implementation

- Uses `@aws-sdk/client-s3`
- Reads `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` from `.env`
- `url()` returns `https://<S3_ENDPOINT>/<S3_BUCKET>/<storagePath>`

### Selection

`STORAGE_TYPE=local|s3` in `.env`. Defaults to `local`. Storage instance created once at startup in `server/src/lib/storage.ts` and exported as a singleton.

---

## API

### Multer middleware

Configured in `server/src/middleware/upload.middleware.ts`:
- Memory storage (file passed to `StorageProvider.save()`)
- Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Max size: 10 MB
- Single file per request, field name: `file`

### Shared controller: `server/src/controllers/attachments.controller.ts`

Three exports — `upload`, `list`, `remove`. Entity type is injected at route registration time via a factory function:

```typescript
export function makeAttachmentHandlers(entityType: AttachmentEntity) {
  return { upload, list, remove };
}
```

**`upload` guards:**
- Entity must exist (404)
- File required (400 if multer received nothing)
- Multer rejects wrong type/size before controller runs (400)

**`list` response:**
```json
[
  {
    "id": 1,
    "filename": "lease.pdf",
    "mimeType": "application/pdf",
    "size": 204800,
    "url": "/files/TENANT/5/uuid-lease.pdf",
    "uploadedBy": { "id": 2, "name": "Nour" },
    "createdAt": "2026-05-15T10:00:00.000Z"
  }
]
```

**`remove` guards:**
- Attachment must exist and belong to that entity (404)
- Calls `StorageProvider.delete()` then removes DB record

### Routes

Registered in each existing route file (e.g. `apartments.routes.ts`) using `makeAttachmentHandlers`:

| Method | Endpoint | Roles |
|---|---|---|
| `POST` | `/apartments/:id/attachments` | ADMIN, RECEPTIONIST |
| `GET` | `/apartments/:id/attachments` | ADMIN, RECEPTIONIST |
| `DELETE` | `/apartments/:id/attachments/:attId` | ADMIN, RECEPTIONIST |
| `POST` | `/tenants/:id/attachments` | ADMIN, RECEPTIONIST |
| `GET` | `/tenants/:id/attachments` | ADMIN, RECEPTIONIST |
| `DELETE` | `/tenants/:id/attachments/:attId` | ADMIN, RECEPTIONIST |
| `POST` | `/bookings/:id/attachments` | ADMIN, RECEPTIONIST |
| `GET` | `/bookings/:id/attachments` | ADMIN, RECEPTIONIST |
| `DELETE` | `/bookings/:id/attachments/:attId` | ADMIN, RECEPTIONIST |
| `POST` | `/tickets/:id/attachments` | ADMIN, RECEPTIONIST, MAINTENANCE |
| `GET` | `/tickets/:id/attachments` | ADMIN, RECEPTIONIST, MAINTENANCE |
| `DELETE` | `/tickets/:id/attachments/:attId` | ADMIN, RECEPTIONIST, MAINTENANCE |

---

## Error Handling

| Scenario | Response |
|---|---|
| Entity not found | 404 `"<Entity> not found"` |
| No file in request | 400 `"File is required"` |
| Invalid file type | 400 `"Invalid file type. Allowed: PDF, JPG, PNG, DOCX"` |
| File too large | 400 `"File too large. Maximum size is 10 MB"` |
| Attachment not found or wrong entity | 404 `"Attachment not found"` |
| Storage failure | 500 `"Failed to save file"` |

---

## Client

### Hook: `client/src/hooks/useAttachments.ts`

```typescript
export function useAttachments(entityType: string, entityId: number) { ... }
// GET /<entity>s/:id/attachments — returns AttachmentItem[]

export function useUploadAttachment(entityType: string, entityId: number) { ... }
// POST with FormData, invalidates ['attachments', entityType, entityId]

export function useDeleteAttachment(entityType: string, entityId: number) { ... }
// DELETE /:attId, invalidates ['attachments', entityType, entityId]
```

URL mapping: `APARTMENT` → `/apartments`, `TENANT` → `/tenants`, `BOOKING` → `/bookings`, `TICKET` → `/tickets`.

### Component: `client/src/components/AttachmentPanel.tsx`

Props: `{ entityType: 'APARTMENT' | 'TENANT' | 'BOOKING' | 'TICKET'; entityId: number; canEdit: boolean }`

Displays:
- List of attachments: file type icon (PDF/image/doc), filename, human-readable size, download link (opens `url` in new tab), delete button (if `canEdit`, with confirmation)
- Upload button (if `canEdit`): hidden `<input type="file">` triggered by a styled button, accepts `.pdf,.jpg,.jpeg,.png,.docx`, single file
- Upload in progress: button shows spinner/disabled state
- Toast on success and error

### Integration points

- `ApartmentDetailPage` — "Attachments" section at the bottom
- `TenantDetailPage` — "Attachments" section at the bottom
- `ApartmentDetailPage` (booking card) — "Attachments" section under current booking (entityType=BOOKING, entityId=currentBooking.id)
- `TicketDetailPanel` — "Attachments" section

---

## Testing

### Server integration tests

1. `POST /apartments/:id/attachments` — happy path: file stored, DB record created
2. `POST /apartments/:id/attachments` — wrong file type → 400
3. `POST /apartments/:id/attachments` — entity not found → 404
4. `GET /apartments/:id/attachments` — returns attachment list with url
5. `DELETE /apartments/:id/attachments/:attId` — removes file and DB record
6. `DELETE /apartments/:id/attachments/:attId` — wrong entity → 404
7. Same set for one other entity type (e.g. tickets) to verify shared controller works across entity types

### Manual checklist

- [ ] Upload button appears only for roles with edit access
- [ ] File type restriction enforced (try uploading .exe)
- [ ] File size restriction enforced (try uploading >10 MB)
- [ ] Uploaded file is downloadable via the returned URL
- [ ] Delete removes file from disk (local) and DB record
- [ ] AttachmentPanel appears correctly in all four detail views
- [ ] Ticket attachment upload works for MAINTENANCE role
