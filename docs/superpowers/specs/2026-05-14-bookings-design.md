# Bookings — New Reservation Design Spec

## Goal

Add a "New Reservation" flow that lets ADMIN and RECEPTIONIST staff create a booking (tenant + apartment + dates + initial payment) from two entry points: clicking an available apartment on ApartmentsPage, or pressing "New Booking" on TenantDetailPage. No new pages — a single reusable modal handles both trigger points.

## Architecture

One new server endpoint (`POST /api/v1/bookings`) runs booking creation, initial payment recording, and apartment status update atomically in a Prisma transaction. The client adds a `useCreateBooking` hook and a `BookingFormModal` component that accepts optional `prefilledApartmentId` and `prefilledTenantId` props. Two existing pages (ApartmentsPage, TenantDetailPage) wire in the trigger.

## Tech Stack

- **Server:** Express + Prisma (transaction), TypeScript
- **Client:** React Query, react-hook-form + zod, Tailwind MD3 tokens, Material Symbols Outlined

---

## Server

### Endpoint

```
POST /api/v1/bookings   → create   (ADMIN | RECEPTIONIST)
```

### File: `server/src/controllers/bookings.controller.ts`

#### `create` handler

Body:
```json
{
  "apartmentId": 1,
  "tenantId": 2,
  "checkIn": "2026-06-01",
  "checkOut": "2026-09-01",
  "totalAmount": 15000,
  "payment": {
    "method": "CASH",
    "amount": 5000,
    "referenceNumber": null
  }
}
```

Validation (all return 400 unless noted):
- `apartmentId`, `tenantId`, `checkIn`, `checkOut`, `totalAmount` required
- `payment.method` required, must be `CASH | CARD | INSTALLMENT`
- `payment.amount` required, must be > 0
- `checkIn` must be a valid date; `checkOut` must be after `checkIn`
- `totalAmount` must be > 0
- Apartment must exist → 404 if not
- Tenant must exist → 404 if not
- Apartment `status` must be `AVAILABLE` → 409 with `{ message: 'Apartment is not available' }` if not

On success, runs a Prisma transaction:
1. Create `Booking` record with `apartmentId`, `tenantId`, `checkIn`, `checkOut`, `totalAmount`
2. Create `Payment` record with `bookingId`, `method`, `amount`, `status: 'PAID'`, `referenceNumber` (null if not provided), `paidAt: new Date()`
3. Update `Apartment.status`:
   - `checkIn <= today` → `OCCUPIED`
   - `checkIn > today` → `RESERVED`

Returns 201 with:
```json
{
  "id": 1,
  "checkIn": "2026-06-01T00:00:00Z",
  "checkOut": "2026-09-01T00:00:00Z",
  "totalAmount": "15000.00",
  "apartment": { "id": 1, "number": "402", "floor": 4 },
  "tenant": { "id": 2, "fullName": "Sara Ali", "phone": "0501234567" },
  "payments": [{ "id": 1, "method": "CASH", "amount": "5000.00", "status": "PAID" }]
}
```

### File: `server/src/routes/bookings.routes.ts`

```typescript
import { Router } from 'express';
import { create } from '../controllers/bookings.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
export default router;
```

### Registration: `server/src/app.ts`

Add after existing routes:
```typescript
import bookingsRoutes from './routes/bookings.routes';
app.use('/api/v1/bookings', bookingsRoutes);
```

---

## Client

### File: `client/src/hooks/useBookings.ts`

```typescript
export interface CreateBookingDto {
  apartmentId: number;
  tenantId: number;
  checkIn: string;       // ISO date string e.g. "2026-06-01"
  checkOut: string;
  totalAmount: number;
  payment: {
    method: 'CASH' | 'CARD' | 'INSTALLMENT';
    amount: number;
    referenceNumber?: string;
  };
}

export function useCreateBooking()
  // POST /bookings
  // On success: invalidates ['apartments'] and ['tenants']
```

### File: `client/src/pages/bookings/BookingFormModal.tsx`

Props:
```typescript
interface BookingFormModalProps {
  open: boolean;
  onClose: () => void;
  prefilledApartmentId?: number;
  prefilledTenantId?: number;
}
```

Fields (all validated with zod):

| Field | Type | Notes |
|---|---|---|
| Apartment | select | Options from `useApartments({ status: ApartmentStatus.AVAILABLE })`. Disabled + pre-filled if `prefilledApartmentId` provided. |
| Tenant | select | Options from `useTenants()`. Disabled + pre-filled if `prefilledTenantId` provided. |
| Check-in | date input | Required |
| Check-out | date input | Required, must be after check-in |
| Total Amount | number input | Required, > 0, labelled "AED" |
| Payment Method | select | CASH / CARD / INSTALLMENT |
| Amount Paid Now | number input | Required, > 0 |
| Reference Number | text input | Only shown when method = CARD |

Submit: calls `useCreateBooking`. On success: close modal (lists refresh via query invalidation). On error: inline error below submit button.

### Modifications to existing files

#### `client/src/pages/apartments/ApartmentsPage.tsx`

- Import `BookingFormModal` and add state: `const [bookingAptId, setBookingAptId] = useState<number | null>(null)`
- On clicking an `AVAILABLE` apartment row (or a dedicated "Book" action button on that row), set `bookingAptId` to that apartment's id
- Render: `<BookingFormModal open={bookingAptId !== null} onClose={() => setBookingAptId(null)} prefilledApartmentId={bookingAptId ?? undefined} />`

#### `client/src/pages/tenants/TenantDetailPage.tsx`

- Import `BookingFormModal` and add state: `const [showBookingModal, setShowBookingModal] = useState(false)`
- Add "New Booking" button in the header (ADMIN/RECEPTIONIST only, use `useAuth()` for role check)
- Render: `<BookingFormModal open={showBookingModal} onClose={() => setShowBookingModal(false)} prefilledTenantId={tenant.id} />`

---

## Error Handling

| Scenario | Server response | Client behaviour |
|---|---|---|
| Missing required field | 400 `{ message }` | Inline error below submit |
| Invalid date range | 400 | Inline error |
| Apartment not found | 404 | Inline error |
| Tenant not found | 404 | Inline error |
| Apartment not AVAILABLE | 409 | Inline error |
| Unauthenticated | 401 | Axios interceptor → /login |
| MAINTENANCE / FINANCE role | 403 | Button hidden in UI (role check) |
| Prisma / unexpected | 500 | Inline error |

---

## Testing

### Server integration tests (`server/src/controllers/bookings.controller.test.ts`)

1. `POST /api/v1/bookings` — 401 without auth
2. `POST /api/v1/bookings` — 403 for MAINTENANCE and FINANCE roles
3. `POST /api/v1/bookings` — creates booking + payment, sets apartment to RESERVED when checkIn is future
4. `POST /api/v1/bookings` — sets apartment to OCCUPIED when checkIn is today
5. `POST /api/v1/bookings` — 409 when apartment is not AVAILABLE
6. `POST /api/v1/bookings` — 400 for missing required fields
7. `POST /api/v1/bookings` — 404 when apartment or tenant not found

### Manual test checklist

- [ ] From ApartmentsPage: clicking an available apartment opens modal pre-filled with that apartment (field disabled)
- [ ] From TenantDetailPage: "New Booking" button opens modal pre-filled with that tenant (field disabled)
- [ ] Future check-in → apartment status becomes RESERVED after submit
- [ ] Today check-in → apartment status becomes OCCUPIED after submit
- [ ] Partial payment amount accepted (less than total amount)
- [ ] Reference number field shown only for CARD method
- [ ] 409 error shown inline when apartment is not available
- [ ] ApartmentsPage and TenantDetailPage refresh after booking created
- [ ] "New Booking" button hidden from MAINTENANCE and FINANCE roles
