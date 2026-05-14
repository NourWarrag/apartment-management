# Wave 3A — Checkout + Security Deposit Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Goal

Add a checkout flow (OCCUPIED → CLEANING → AVAILABLE) and security deposit tracking (collect at booking creation or separately, partially or fully release/forfeit at checkout).

## Architecture

Deposit fields live directly on the `Booking` model — no separate table. Five nullable columns + a new `DepositStatus` enum cover the full lifecycle. Checkout is a PATCH endpoint that atomically sets `checkedOutAt`, deposit disposition, and apartment status. Mark-ready is a second PATCH endpoint that moves the apartment from CLEANING to AVAILABLE.

---

## Schema Changes

### Modified model: `Booking`

Add five fields:

```prisma
depositAmount       Decimal?      @db.Decimal(10, 2)
depositStatus       DepositStatus @default(NONE)
depositRefundAmount Decimal?      @db.Decimal(10, 2)
depositCollectedAt  DateTime?
checkedOutAt        DateTime?
```

### New enum: `DepositStatus`

```prisma
enum DepositStatus {
  NONE
  HELD
  RELEASED
  FORFEITED
}
```

### Migration strategy

Single migration:
1. Add `DepositStatus` enum to Postgres
2. Add 5 nullable columns to `Booking` (`depositStatus` defaults to `NONE`, rest default to null)

No backfill needed — all existing bookings get `NONE` / null naturally.

---

## Apartment Status Transitions

```
OCCUPIED  →  [checkout action]  →  CLEANING
CLEANING  →  [mark-ready action]  →  AVAILABLE
```

- Checkout: receptionist or building admin
- Mark-ready: receptionist or building admin

---

## API

### Modified: `POST /bookings`

Accept optional `deposit` object in request body:

```json
{
  "apartmentId": 1,
  "tenantId": 2,
  "checkIn": "2026-06-01",
  "checkOut": "2026-07-01",
  "totalAmount": 5000,
  "payment": { "method": "CASH", "amount": 5000 },
  "deposit": { "amount": 1000 }
}
```

If `deposit.amount` is provided and > 0:
- Sets `depositAmount`, `depositStatus = HELD`, `depositCollectedAt = now()`

### New: `PATCH /bookings/:id/deposit`

Auth: ADMIN, RECEPTIONIST, BUILDING_ADMIN

Collect a deposit on an existing booking that has none.

Request body:
```json
{ "amount": 1000 }
```

Guards:
- Booking must exist and not be checked out (409 if `checkedOutAt` is set)
- Booking must have `depositStatus = NONE` (409 if already held)
- `amount` must be a positive number

Sets: `depositAmount`, `depositStatus = HELD`, `depositCollectedAt = now()`

### New: `PATCH /bookings/:id/checkout`

Auth: ADMIN, RECEPTIONIST, BUILDING_ADMIN

Request body:
```json
{ "depositRefundAmount": 500 }
```

Guards:
- Booking must exist (404)
- Booking must not already be checked out (409)
- Apartment must be OCCUPIED (400)
- If `depositStatus = HELD`: `depositRefundAmount` is required, must be 0 ≤ refund ≤ depositAmount

Logic:
- If `depositStatus = NONE`: deposit fields unchanged
- If `depositStatus = HELD` and `depositRefundAmount === depositAmount`: set `depositStatus = RELEASED`
- If `depositStatus = HELD` and `depositRefundAmount < depositAmount`: set `depositStatus = FORFEITED`

Always (in a single transaction):
- Set `checkedOutAt = now()`
- Set `depositRefundAmount` (if deposit held)
- Set apartment `status = CLEANING`

Response: updated booking with deposit fields.

### New: `PATCH /apartments/:id/mark-ready`

Auth: ADMIN, RECEPTIONIST, BUILDING_ADMIN

No request body.

Guards:
- Apartment must exist (404)
- Apartment must have status `CLEANING` (400)

Sets: `apartment.status = AVAILABLE`

---

## Client

### `ApartmentsPage`

Two new action buttons on apartment rows (in addition to existing actions):

- **OCCUPIED rows**: "Checkout" button — opens `CheckoutModal`
- **CLEANING rows**: "Mark Ready" button — calls `useMarkReady` directly with a confirmation toast (no modal)

### `CheckoutModal` (`client/src/pages/apartments/CheckoutModal.tsx`)

Props: `{ booking: BookingForCheckout; apartmentId: number; onClose: () => void }`

Displays:
- Tenant name
- Check-in / check-out dates
- Total booking amount

If `depositStatus === HELD`:
- Input: "Deposit Refund Amount" (0 to `depositAmount`), pre-filled with `depositAmount` (full release)

If `depositStatus === NONE`:
- No deposit section — just a confirm button

On submit: calls `useCheckout(bookingId)`, closes modal, invalidates `['apartments']`.

### Booking Creation (existing modal)

Add an optional **"Security Deposit"** amount field to the existing booking creation form. If filled with a value > 0, include `deposit: { amount }` in the POST body.

### Apartment Detail Page

If the current booking has `depositStatus === NONE`, show a **"Collect Deposit"** button. Opens a simple modal with an amount input → calls `useCollectDeposit(bookingId)`.

### Hooks

Add to `client/src/hooks/useBookingMutations.ts` (new file):

```typescript
export function useCollectDeposit(bookingId: number) { ... }  // PATCH /bookings/:id/deposit
export function useCheckout(bookingId: number) { ... }        // PATCH /bookings/:id/checkout
```

Add to `client/src/hooks/useApartments.ts` (existing):

```typescript
export function useMarkReady(apartmentId: number) { ... }     // PATCH /apartments/:id/mark-ready
```

All mutations invalidate `['apartments']` on success.

---

## Error Handling

| Scenario | Response |
|---|---|
| Checkout on already checked-out booking | 409 `"Booking already checked out"` |
| Checkout when apartment is not OCCUPIED | 400 `"Apartment is not in OCCUPIED status"` |
| Deposit collection on checked-out booking | 409 `"Cannot collect deposit on a checked-out booking"` |
| Deposit collection when already held | 409 `"Deposit already collected"` |
| Checkout with deposit held but no refundAmount | 400 `"depositRefundAmount is required when deposit is held"` |
| Checkout with refundAmount > depositAmount | 400 `"Refund amount cannot exceed deposit amount"` |
| Mark-ready on non-CLEANING apartment | 400 `"Apartment is not in CLEANING status"` |

---

## Testing

### Server integration tests

1. `POST /bookings` with deposit → booking has depositStatus HELD, depositAmount set
2. `PATCH /bookings/:id/deposit` on existing booking → depositStatus HELD
3. `PATCH /bookings/:id/deposit` when already held → 409
4. `PATCH /bookings/:id/checkout` (full release) → checkedOutAt set, depositStatus RELEASED, apartment CLEANING
5. `PATCH /bookings/:id/checkout` (partial/no refund) → depositStatus FORFEITED
6. `PATCH /bookings/:id/checkout` on already-checked-out booking → 409
7. `PATCH /apartments/:id/mark-ready` → apartment AVAILABLE
8. `PATCH /apartments/:id/mark-ready` on non-CLEANING apartment → 400

### Manual checklist

- [ ] Checkout button appears only on OCCUPIED apartment rows
- [ ] Mark Ready button appears only on CLEANING rows
- [ ] CheckoutModal shows deposit fields only when deposit is HELD
- [ ] Refund amount pre-fills to full deposit amount
- [ ] After checkout, apartment row shows CLEANING status
- [ ] After mark-ready, apartment row shows AVAILABLE
- [ ] Deposit field appears in booking creation form (optional)
- [ ] Collecting deposit separately works from apartment detail page
- [ ] Cannot checkout same booking twice
