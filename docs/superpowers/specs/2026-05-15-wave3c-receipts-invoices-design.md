# Wave 3C — Receipts & Invoice Generation Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Goal

Enhance the existing payment receipt with a true PDF download button, and add a booking-level invoice that summarises the full booking (tenant, apartment, dates, deposit, all payments) with a one-click PDF download. No PDFs are stored — they can always be regenerated.

---

## Architecture

Two deliverables built on `react-to-print`:

1. **Payment Receipt (enhance existing)** — wire `react-to-print` into the existing `ReceiptModal.tsx`. The modal already has `print:hidden` CSS; this is a small addition.
2. **Booking Invoice (new)** — `BookingInvoiceModal.tsx` with summary + payment breakdown, triggered from `ApartmentDetailPage`. Backed by a new `GET /bookings/:id` endpoint.

No schema changes required — all data already exists.

---

## API

### New: `GET /bookings/:id`

Auth: ADMIN, RECEPTIONIST, BUILDING_ADMIN

Guards: booking must exist (404 `"Booking not found"`).

Response:
```json
{
  "id": 1,
  "checkIn": "2026-06-01T00:00:00.000Z",
  "checkOut": "2026-07-01T00:00:00.000Z",
  "totalAmount": 5000,
  "depositAmount": 1000,
  "depositStatus": "RELEASED",
  "depositRefundAmount": 1000,
  "checkedOutAt": null,
  "createdAt": "2026-06-01T09:00:00.000Z",
  "tenant": {
    "id": 2,
    "fullName": "Nour W",
    "phone": "0501234567",
    "idNumber": "ID-123"
  },
  "apartment": {
    "id": 1,
    "number": "101",
    "floor": 1,
    "type": "STUDIO",
    "building": { "name": "Al Noor Tower" }
  },
  "payments": [
    {
      "id": 1,
      "method": "CASH",
      "amount": 2500,
      "status": "PAID",
      "paidAt": "2026-06-01T10:00:00.000Z",
      "referenceNumber": null
    }
  ]
}
```

`payments` includes all statuses (PAID, PENDING, FAILED), ordered by `createdAt` ascending. Only PAID payments contribute to the amount-paid total; PENDING/FAILED rows appear in the table with their status shown.

---

## Client

### Dependency

```bash
cd client && npm install react-to-print
```

### Hook: `useBooking(bookingId)` — add to `client/src/hooks/useBookings.ts`

```typescript
export function useBooking(bookingId: number) {
  return useQuery({
    queryKey: ['booking', bookingId],
    queryFn: async () => {
      const res = await api.get(`/bookings/${bookingId}`);
      return res.data as BookingDetail;
    },
    enabled: bookingId > 0,
  });
}
```

`BookingDetail` type mirrors the response shape above.

### Payment Receipt enhancement: `ReceiptModal.tsx`

- Install `react-to-print`'s `useReactToPrint` hook
- Add a `ref` to the printable content div
- Replace (or augment) the existing print button with one wired to `useReactToPrint`
- Document title: `Receipt-PAY-{id.toString().padStart(6, '0')}`
- Button label: "Download PDF"
- No layout changes to the receipt itself

### New component: `client/src/components/BookingInvoiceModal.tsx`

Props: `{ bookingId: number; onClose: () => void }`

Fetches via `useBooking(bookingId)`. Shows a loading state while fetching.

**Print-optimized layout (two sections):**

**Section 1 — Header + Summary**
- Building name (top left), Invoice label + number `#INV-{bookingId}` (top right)
- Tenant: full name, phone, ID number
- Apartment: number, floor, type, building
- Check-in / Check-out dates
- Total booking amount (AED)
- Deposit: amount + status (NONE / HELD / RELEASED / FORFEITED) + refund amount if released

**Section 2 — Payment Breakdown table**

Columns: Date | Method | Reference | Amount (AED) | Status

Footer rows:
- Amount Paid: sum of PAID payments
- Outstanding Balance: totalAmount − amountPaid

If no payments: show "No payments recorded yet."

**PDF download button** (hidden on print): `useReactToPrint` with document title `Invoice-{bookingId}-{tenant.fullName}`

**Close button**: hidden on print, calls `onClose`

### Trigger point: `ApartmentDetailPage`

In the current booking section, add a "Download Invoice" button next to existing booking actions. Visible to roles that can see the booking (ADMIN, RECEPTIONIST, BUILDING_ADMIN). Clicking opens `BookingInvoiceModal` with `bookingId={apartment.currentBooking.id}`.

---

## Error Handling

| Scenario | Response |
|---|---|
| `GET /bookings/:id` — not found | 404 `"Booking not found"` |
| Invoice with no payments | Table shows "No payments recorded yet.", balance = totalAmount |
| `react-to-print` browser failure | Toast error `"Could not open print dialog"` |

---

## Testing

### Server integration test

1. `GET /bookings/:id` — returns booking with tenant, apartment, and payments array
2. `GET /bookings/:id` — booking not found → 404

### Manual checklist

- [ ] "Download PDF" on payment receipt opens print dialog with receipt pre-rendered
- [ ] PDF filename defaults to `Receipt-PAY-000001` (or similar)
- [ ] "Download Invoice" button appears on ApartmentDetailPage current booking section
- [ ] Invoice shows correct summary (amounts, dates, tenant, apartment)
- [ ] Invoice payment table lists all payments with correct totals
- [ ] Outstanding balance is correct (totalAmount − paidAmount)
- [ ] Invoice with no payments shows placeholder text and balance = totalAmount
- [ ] Print-only buttons are hidden in printed output
- [ ] Works for ADMIN, RECEPTIONIST, BUILDING_ADMIN roles
