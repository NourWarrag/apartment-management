# Audit Columns + Soft Delete — Design Spec

## Goal

Add `createdBy`/`updatedBy` audit columns to all six models and soft delete (`deletedAt`/`deletedBy`) to `User`, `Tenant`, and `Apartment`. Deleted records remain visible in related views with a "Deleted" badge.

## Architecture

A `AsyncLocalStorage` store holds the authenticated user ID for each request lifetime. A Prisma middleware reads from that store to auto-inject `createdBy` and `updatedBy` on every `create` and `update` operation — no controller changes needed. A second Prisma middleware intercepts `delete` operations on `User`, `Tenant`, and `Apartment` to perform a soft delete instead, and prepends `deletedAt: null` to all `findMany`/`findUnique` queries on those three models.

---

## Schema Changes

### All models (`User`, `Apartment`, `Tenant`, `Booking`, `Payment`, `MaintenanceTicket`)

Add:
```prisma
updatedAt   DateTime  @updatedAt
createdBy   Int?
updatedBy   Int?
creator     User?     @relation("CreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
updater     User?     @relation("UpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
```

> `updatedAt` uses Prisma's `@updatedAt` — automatically set on every update.
> `createdBy`/`updatedBy` are nullable FKs so records created before this migration (or by system processes) don't fail.

### Soft-delete models only (`User`, `Tenant`, `Apartment`)

Add:
```prisma
deletedAt   DateTime?
deletedBy   Int?
deleter     User?     @relation("DeletedBy", fields: [deletedBy], references: [id], onDelete: SetNull)
```

### `User` model — self-referential relations

The `User` model references itself for `creator`, `updater`, `deleter`. Prisma handles self-relations with explicit `name` parameters — use `"CreatedByUser"`, `"UpdatedByUser"`, `"DeletedByUser"` to avoid collision with `MaintenanceTicket.assignedTo`.

---

## Server Implementation

### File: `server/src/lib/requestContext.ts` (new)

```typescript
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<{ userId: number | null }>();

export function getContextUserId(): number | null {
  return requestContext.getStore()?.userId ?? null;
}
```

### File: `server/src/middleware/auth.middleware.ts` (modify)

After verifying the JWT and setting `req.user`, wrap the next call in `requestContext.run`:

```typescript
requestContext.run({ userId: payload.id }, () => next());
```

### File: `server/src/lib/prisma.ts` (modify)

Add two Prisma middlewares after `new PrismaClient()`:

**Middleware 1 — auto-inject audit fields:**
```typescript
prisma.$use(async (params, next) => {
  const userId = getContextUserId();
  if (params.action === 'create' && params.args.data) {
    params.args.data.createdBy = userId;
    params.args.data.updatedBy = userId;
  }
  if (params.action === 'update' && params.args.data) {
    params.args.data.updatedBy = userId;
  }
  if (params.action === 'createMany' && params.args.data) {
    params.args.data = params.args.data.map((d: Record<string, unknown>) => ({
      ...d, createdBy: userId, updatedBy: userId,
    }));
  }
  return next(params);
});
```

**Middleware 2 — soft delete on User/Tenant/Apartment:**

```typescript
const SOFT_DELETE_MODELS = ['User', 'Tenant', 'Apartment'];

prisma.$use(async (params, next) => {
  if (!SOFT_DELETE_MODELS.includes(params.model ?? '')) return next(params);

  if (params.action === 'delete') {
    params.action = 'update';
    params.args.data = {
      deletedAt: new Date(),
      deletedBy: getContextUserId(),
    };
    return next(params);
  }

  if (params.action === 'deleteMany') {
    params.action = 'updateMany';
    params.args.data = {
      deletedAt: new Date(),
      deletedBy: getContextUserId(),
    };
    return next(params);
  }

  // Filter out soft-deleted records from all reads.
  // findUnique cannot have arbitrary where fields, so convert it to findFirst.
  if (params.action === 'findUnique' || params.action === 'findFirst') {
    if (params.action === 'findUnique') params.action = 'findFirst';
    params.args.where = { ...params.args.where, deletedAt: null };
  }
  if (['findMany', 'count', 'aggregate'].includes(params.action)) {
    params.args.where = { ...params.args.where, deletedAt: null };
  }

  return next(params);
});
```

---

## Client — "Deleted" Badge

Anywhere a tenant name or apartment number is rendered from a joined record, check for `deletedAt`. If non-null, render a small badge beside it.

### Badge component (inline, no new file needed)

```tsx
{record.deletedAt && (
  <span className="ml-1 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
    Deleted
  </span>
)}
```

### Affected pages

- `PaymentsPage.tsx` — tenant name and apartment number columns
- `TicketsPage.tsx` / `TicketDetailPanel.tsx` — apartment number
- Booking-related displays — tenant name, apartment number

### API shape change

The server must include `deletedAt` in the select/include for `tenant` and `apartment` on Payment and Ticket endpoints so the client can conditionally render the badge:

```typescript
tenant: { select: { id: true, fullName: true, phone: true, deletedAt: true } }
apartment: { select: { id: true, number: true, floor: true, deletedAt: true } }
```

---

## Migration Strategy

1. Add columns as nullable (no default required — existing rows get `NULL`).
2. Run `prisma migrate dev` — zero downtime, all nulls are valid.
3. No backfill needed: audit columns reflect future edits only.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No authenticated user (public route) | `createdBy`/`updatedBy` = `null` — valid, no error |
| Soft-delete of already-deleted record | `deletedAt` gets overwritten with new timestamp — idempotent |
| Query for soft-deleted record by ID | Returns `null` (filtered out) — caller gets 404 |

---

## Testing

### Server integration tests

1. `POST /apartments` — created record has `createdBy` = authenticated user ID
2. `PATCH /apartments/:id` — updated record has `updatedBy` updated, `createdBy` unchanged
3. `DELETE /tenants/:id` — sets `deletedAt` / `deletedBy`, record not returned by `GET /tenants`
4. `DELETE /tenants/:id` twice — idempotent, no error
5. `GET /tenants` — soft-deleted tenant not in results
6. `GET /payments` — payment for soft-deleted tenant still returned, tenant object includes `deletedAt`

### Manual checklist

- [ ] Payment row for deleted tenant shows "Deleted" badge beside tenant name
- [ ] Ticket for deleted apartment shows "Deleted" badge beside apartment number
- [ ] Deleted apartment does not appear in apartment list
- [ ] Deleted tenant does not appear in tenant list
