# Payments — Sub-phase 3B Design Spec

## Goal

Build the Payments page: a flat list of all payment transactions (filterable by method/status/search), the ability to record new payments against a booking (from the Payments page with booking search, or from the Apartments page pre-filled), mark pending payments as paid, and view an on-screen printable receipt per payment.

## Architecture

Three new server endpoints under `/api/v1/payments`: GET list (all roles), POST create (ADMIN/RECEPTIONIST), PATCH /:id mark-paid (ADMIN/RECEPTIONIST). No schema changes — the existing `Payment` model supports everything. The client adds a `usePayments` hook, a `PaymentsPage`, a reusable `PaymentFormModal` (accepts optional `bookingId` prop), and a `ReceiptModal`. The Apartments page gains a "Record Payment" button that opens `PaymentFormModal` with the booking pre-filled.

## Tech Stack

- **Server:** Express + Prisma (existing pattern), TypeScript
- **Client:** React Query, React Router, Tailwind CSS MD3 tokens (existing design system)

---

## Server

### File: `server/src/routes/payments.routes.ts`

```
GET  /api/v1/payments       → list       (authMiddleware, all roles)
POST /api/v1/payments       → create     (authMiddleware, ADMIN | RECEPTIONIST)
PATCH /api/v1/payments/:id  → markPaid   (authMiddleware, ADMIN | RECEPTIONIST)
```

### File: `server/src/controllers/payments.controller.ts`

#### `list` handler

Query params: `status` (PAID | PENDING | FAILED), `method` (CASH | CARD | INSTALLMENT), `search` (tenant name or apartment number, case-insensitive), `page` (default 1), `pageSize` (default 20).

Runs two queries in parallel:
1. `prisma.payment.count({ where })` — total for pagination
2. `prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { booking: { include: { tenant: { select: { id, fullName, phone } }, apartment: { select: { id, number, floor } } } } } })`

Where-clause construction:
- `status` filter: `{ status }`
- `method` filter: `{ method }`
- `search` filter: `{ OR: [ { booking: { tenant: { fullName: { contains: search, mode: 'insensitive' } } } }, { booking: { apartment: { number: { contains: search } } } } ] }`
- Filters are combined with AND

Response shape:
```json
{
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "data": [
    {
      "id": 1,
      "method": "CARD",
      "amount": "5000.00",
      "status": "PAID",
      "referenceNumber": "TXN-001",
      "paidAt": "2026-05-13T08:00:00Z",
      "createdAt": "2026-05-13T08:00:00Z",
      "booking": {
        "id": 3,
        "checkIn": "2026-03-14T00:00:00Z",
        "checkOut": "2026-06-12T00:00:00Z",
        "tenant": { "id": 1, "fullName": "Ahmed Al-Rashidi", "phone": "+971501234567" },
        "apartment": { "id": 1, "number": "101", "floor": 1 }
      }
    }
  ]
}
```

#### `create` handler

Body: `{ bookingId: number, method: 'CASH' | 'CARD' | 'INSTALLMENT', amount: number, referenceNumber?: string }`

Validation:
- `bookingId`, `method`, `amount` are required; return 400 if missing
- `amount` must be > 0; return 400 if not
- `method` must be a valid PaymentMethod enum value; return 400 if not
- Verify booking exists: `prisma.booking.findUnique({ where: { id: bookingId } })`; return 404 if not found

Creation logic:
- If `method` is CASH or CARD: create with `status: 'PAID'`, `paidAt: new Date()`
- If `method` is INSTALLMENT: create with `status: 'PENDING'`, `paidAt: null`
- `referenceNumber` stored as-is (trimmed), null if not provided

Returns 201 with the created payment (same shape as a single item from the list, with booking context included via include).

#### `markPaid` handler

Param: `id` (payment id)

- Parse and validate `id` is a positive integer; return 400 if not
- Find payment: `prisma.payment.findUnique({ where: { id } })`; return 404 if not found
- If `payment.status === 'PAID'`: return 409 `{ message: 'Payment is already marked as paid' }`
- Update: `prisma.payment.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } })`
- Returns 200 with updated payment (same shape as create response, with booking context)

Both `create` and `markPaid` wrap in try/catch returning 500 on Prisma errors.

### Registration: `server/src/app.ts`

Add:
```ts
import paymentsRoutes from './routes/payments.routes';
app.use('/api/v1/payments', paymentsRoutes);
```

---

## Client

### File: `client/src/hooks/usePayments.ts`

```ts
export interface PaymentListItem {
  id: number;
  method: 'CASH' | 'CARD' | 'INSTALLMENT';
  amount: string;
  status: 'PAID' | 'PENDING' | 'FAILED';
  referenceNumber: string | null;
  paidAt: string | null;
  createdAt: string;
  booking: {
    id: number;
    checkIn: string;
    checkOut: string;
    tenant: { id: number; fullName: string; phone: string };
    apartment: { id: number; number: string; floor: number };
  };
}

export interface PaymentsListResponse {
  total: number;
  page: number;
  pageSize: number;
  data: PaymentListItem[];
}

export interface CreatePaymentDto {
  bookingId: number;
  method: 'CASH' | 'CARD' | 'INSTALLMENT';
  amount: number;
  referenceNumber?: string;
}

export function usePayments(filters?: {
  status?: string;
  method?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): UseQueryResult<PaymentsListResponse>

export function useCreatePayment(): UseMutationResult<unknown, unknown, CreatePaymentDto>
  // POST /payments, invalidates ['payments']

export function useMarkPaid(): UseMutationResult<unknown, unknown, number>
  // PATCH /payments/:id (mutate called with payment id), invalidates ['payments']
```

### File: `client/src/pages/payments/PaymentsPage.tsx`

Layout:
1. **Page header** — "Payment Management" title + "Record Payment" button (opens `PaymentFormModal` with no pre-fill)
2. **Filter bar** — Method dropdown (All / Cash / Card / Installment), Status dropdown (All / Paid / Pending / Failed), Search input (tenant name or apt number) + Apply button
3. **Summary row** — three read-only counters derived from current filtered total: total results, total paid amount (not feasible from paginated data — omit; the dashboard handles revenue summaries)
4. **Table** — columns: Date, Apartment, Tenant, Method, Amount, Status, Actions
5. **Pagination** — same sliding window pattern as ApartmentsPage (PAGE_SIZE = 20)

Table row actions:
- All rows: eye icon → opens `ReceiptModal`
- PENDING rows only: check icon → calls `useMarkPaid`, shows loading state on that row

**Status badge colors:**
- PAID: green (`bg-green-100 text-green-800`)
- PENDING: amber (`bg-amber-100 text-amber-800`)
- FAILED: red (`bg-red-100 text-red-800`)

**Method badge:** plain text label (Cash / Card / Installment) in `text-on-surface-variant`

**Amount format:** `AED X,XXX.00` using `Number(amount).toLocaleString('en', { minimumFractionDigits: 2 })`

### File: `client/src/pages/payments/PaymentFormModal.tsx`

Props:
```ts
interface PaymentFormModalProps {
  open: boolean;
  onClose: () => void;
  bookingId?: number;           // if provided, skip booking search
  bookingSummary?: {            // displayed at top when bookingId is pre-filled
    tenantName: string;
    apartmentNumber: string;
    checkIn: string;
    checkOut: string;
  };
}
```

**Two modes:**

**Mode A — Pre-filled (bookingId provided):** Shows a read-only booking summary card at the top (tenant name, apartment number, stay dates). Jumps straight to the payment fields.

**Mode B — Booking search (no bookingId):** Shows a search input that calls `GET /api/v1/apartments?status=OCCUPIED` to find occupied apartments. User picks an apartment from the dropdown, which reveals the active booking details. Once an apartment is selected, same payment fields appear.

**Payment fields (both modes):**
- **Method** — select: Cash | Card | Installment (required)
- **Amount** — number input, min 1, step 0.01 (required)
- **Reference Number** — text input, shown only when Method = CARD (optional label)

**Submit behavior:**
- Calls `useCreatePayment()` with `{ bookingId, method, amount, referenceNumber }`
- On success: closes modal, invalidates payments list
- On error: shows inline error message below the submit button

### File: `client/src/pages/payments/ReceiptModal.tsx`

Props: `{ open: boolean; onClose: () => void; payment: PaymentListItem }`

Content:
- Header: "LuxStay — Payment Receipt"
- Receipt number: `#PAY-{payment.id.toString().padStart(6, '0')}`
- Date: formatted `paidAt` (or `createdAt` if paidAt is null)
- Apartment: number + floor
- Tenant: full name + phone
- Method: Cash / Card / Installment
- Reference: reference number (shown only if present)
- Amount: `AED X,XXX.00`
- Status badge
- "Print Receipt" button: calls `window.print()`
- The modal overlay, close button, and "Print Receipt" button itself use Tailwind `print:hidden` to hide on print. The receipt content uses `print:block` to ensure it prints correctly. No custom CSS required.

### Apartments page wiring

In `client/src/pages/apartments/ApartmentsPage.tsx`:
- Import `PaymentFormModal`
- Add state: `const [paymentTarget, setPaymentTarget] = useState<{ bookingId: number; summary: ... } | null>(null)`
- In the table row or drill-down panel, add a "Record Payment" icon button visible when `apt.currentBooking` exists and `canEdit` is true
- Clicking sets `paymentTarget` from the current booking
- Render `<PaymentFormModal open={!!paymentTarget} onClose={() => setPaymentTarget(null)} bookingId={paymentTarget?.bookingId} bookingSummary={paymentTarget?.summary} />`

### App.tsx wiring

Replace the `/payments/*` placeholder with:
```tsx
import PaymentsPage from './pages/payments/PaymentsPage';
// ...
<Route path="payments" element={<ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}><PaymentsPage /></ProtectedRoute>} />
```

---

## Error Handling

| Scenario | Server response | Client behaviour |
|----------|----------------|-----------------|
| Missing required field | 400 `{ message }` | Inline error in modal |
| Booking not found | 404 | Inline error in modal |
| Already paid | 409 | Inline error on mark-paid action |
| Prisma / unexpected | 500 | Inline error in modal or list |
| Unauthenticated | 401 | Axios interceptor redirects to /login |

---

## Testing

### Server integration tests (`server/src/controllers/payments.controller.test.ts`)

1. `GET /api/v1/payments` — returns 401 without auth
2. `GET /api/v1/payments` — returns `{ total, page, pageSize, data }` shape; data items have booking context
3. `GET /api/v1/payments?status=PAID` — all returned items have `status === 'PAID'`
4. `GET /api/v1/payments?method=CARD` — all returned items have `method === 'CARD'`
5. `POST /api/v1/payments` — returns 401 without auth; returns 403 for FINANCE role
6. `POST /api/v1/payments` — CASH payment: status is PAID, paidAt is set
7. `POST /api/v1/payments` — INSTALLMENT payment: status is PENDING, paidAt is null
8. `POST /api/v1/payments` — missing bookingId returns 400
9. `POST /api/v1/payments` — invalid bookingId returns 404
10. `PATCH /api/v1/payments/:id` — marks PENDING → PAID, sets paidAt
11. `PATCH /api/v1/payments/:id` — already PAID returns 409
12. `PATCH /api/v1/payments/:id` — non-existent id returns 404

### Manual test checklist

- [ ] Payments page loads with seeded data (7 payments visible)
- [ ] Filter by method (CARD) shows only card payments
- [ ] Filter by status (PENDING) shows pending payments
- [ ] Search by tenant name filters correctly
- [ ] "Record Payment" from Payments page opens modal with booking search
- [ ] Selecting an occupied apartment reveals its booking info
- [ ] Creating a CASH payment marks it PAID immediately
- [ ] Creating an INSTALLMENT payment marks it PENDING
- [ ] "Mark as Paid" button on a PENDING payment transitions it to PAID
- [ ] Receipt modal shows correct data and "Print Receipt" triggers browser print
- [ ] "Record Payment" from Apartments page opens modal with booking pre-filled
- [ ] FINANCE role cannot see "Record Payment" button (role guard)
- [ ] Pagination works at >20 results
