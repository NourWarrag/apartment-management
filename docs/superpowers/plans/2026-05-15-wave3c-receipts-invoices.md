# Wave 3C — Receipts & Invoice Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download PDF" button to the existing payment receipt and a new booking-level invoice (summary + payment breakdown) downloadable as PDF from the apartment detail page.

**Architecture:** One new server endpoint (`GET /bookings/:id`) returns the full booking with tenant, apartment, and all payments. Client uses `react-to-print` v2 to trigger the browser print dialog (user saves as PDF). Two client deliverables: enhance `ReceiptModal.tsx` with a print ref + "Download PDF" button, and create `BookingInvoiceModal.tsx` with a two-section print-optimized layout.

**Tech Stack:** Express + Prisma (server), React + TypeScript + React Query + Tailwind MD3 + `react-to-print@^2` (client)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `server/src/controllers/bookings.controller.ts` | Add `getById` handler |
| Modify | `server/src/routes/bookings.routes.ts` | Register `GET /:id` |
| Modify | `server/src/controllers/bookings.controller.test.ts` | Add 2 tests for `getById` |
| Modify | `client/src/hooks/useBookings.ts` | Add `BookingDetail` type + `useBooking` hook |
| Modify | `client/src/pages/payments/ReceiptModal.tsx` | Wire `react-to-print`, add "Download PDF" button |
| Create | `client/src/components/BookingInvoiceModal.tsx` | Full invoice component with print support |
| Modify | `client/src/pages/apartments/ApartmentDetailPage.tsx` | Add "Download Invoice" button + modal state |

---

### Task 1: Server — `GET /bookings/:id` Endpoint + Tests

**Files:**
- Modify: `server/src/controllers/bookings.controller.ts`
- Modify: `server/src/routes/bookings.routes.ts`
- Modify: `server/src/controllers/bookings.controller.test.ts`

**Context:** The controller follows the same pattern as other handlers in this file: validate the param, query Prisma with `include`, return 404 if not found. The `payments` relation is ordered by `createdAt` ascending (not `paidAt` — payments may have `paidAt = null` if PENDING/FAILED). The route is added alongside the existing `POST /`, `PATCH /:id/deposit`, and `PATCH /:id/checkout` routes. Tests follow the exact setup pattern already in `bookings.controller.test.ts` — use `testPrisma` for seeding, `signToken` for auth cookies.

- [ ] **Step 1: Write the failing tests**

Open `server/src/controllers/bookings.controller.test.ts`. Add this `describe` block at the very end of the file (after all existing describe blocks, before the file ends):

```typescript
describe('GET /api/v1/bookings/:id', () => {
  let invoiceBookingId: number;

  beforeAll(async () => {
    // Clean up any prior runs
    await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number = 'INV-001'))`;
    await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number = 'INV-001')`;
    await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number = 'INV-001'`;

    const apt = await testPrisma.apartment.create({
      data: { number: 'INV-001', floor: 3, buildingId },
    });

    const futureIn = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const futureOut = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date(futureIn),
        checkOut: new Date(futureOut),
        totalAmount: 8000,
      },
    });
    invoiceBookingId = booking.id;

    await testPrisma.payment.create({
      data: {
        bookingId: booking.id,
        method: 'CASH',
        amount: 4000,
        status: 'PAID',
        paidAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" = ${invoiceBookingId}`;
    await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE id = ${invoiceBookingId}`;
    await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number = 'INV-001'`;
  });

  it('returns booking with tenant, apartment, building, and payments', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${invoiceBookingId}`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(invoiceBookingId);
    expect(res.body.totalAmount).toBeDefined();
    expect(res.body.tenant).toMatchObject({ fullName: 'Test Tenant', phone: '0500000001' });
    expect(res.body.apartment).toMatchObject({ number: 'INV-001', floor: 3 });
    expect(res.body.apartment.building).toMatchObject({ name: 'Test Building' });
    expect(Array.isArray(res.body.payments)).toBe(true);
    expect(res.body.payments.length).toBe(1);
    expect(res.body.payments[0]).toMatchObject({ method: 'CASH', status: 'PAID' });
  });

  it('returns 404 for unknown booking', async () => {
    const res = await request(app)
      .get('/api/v1/bookings/99999')
      .set('Cookie', adminToken);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Booking not found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run --reporter=verbose src/controllers/bookings.controller.test.ts 2>&1 | tail -20
```

Expected: The two new tests fail with `404` or route-not-found errors. Existing tests still pass.

- [ ] **Step 3: Add `getById` to `server/src/controllers/bookings.controller.ts`**

At the bottom of the file, after the last export, add:

```typescript
export async function getById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!id || id <= 0) {
      res.status(400).json({ message: 'Invalid booking ID' });
      return;
    }
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, fullName: true, phone: true, idNumber: true } },
        apartment: {
          select: {
            id: true,
            number: true,
            floor: true,
            type: true,
            building: { select: { name: true } },
          },
        },
        payments: {
          select: {
            id: true,
            method: true,
            amount: true,
            status: true,
            paidAt: true,
            referenceNumber: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }
    res.json(booking);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

- [ ] **Step 4: Register the route in `server/src/routes/bookings.routes.ts`**

Add `getById` to the import line at the top:

```typescript
import { create, collectDeposit, checkout, getById } from '../controllers/bookings.controller';
```

Add the route after `router.post('/', ...)` and before `router.patch('/:id/deposit', ...)`:

```typescript
router.get('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), getById);
```

The full routes file should now read:

```typescript
import { Router } from 'express';
import { create, collectDeposit, checkout, getById } from '../controllers/bookings.controller';
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadFile } from '../middleware/upload.middleware';
import { Role, AttachmentEntity } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), getById);
router.patch('/:id/deposit', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), collectDeposit);
router.patch('/:id/checkout', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), checkout);

const att = makeAttachmentHandlers(AttachmentEntity.BOOKING);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), uploadFile, att.upload);
// booking attachments require role guard (no open GET /:id route on bookings)
router.get('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.remove);

export default router;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd server && npx vitest run --reporter=verbose src/controllers/bookings.controller.test.ts 2>&1 | tail -15
```

Expected: All tests pass including the 2 new ones.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/bookings.controller.ts server/src/routes/bookings.routes.ts server/src/controllers/bookings.controller.test.ts
git commit -m "feat: add GET /bookings/:id endpoint with tenant, apartment, and payments"
```

---

### Task 2: Client Dependency + `useBooking` Hook

**Files:**
- Modify: `client/src/hooks/useBookings.ts`

**Context:** `react-to-print` v2 is installed into the client package. The `useBookings.ts` file currently exports `CreateBookingDto`, `useCreateBooking`, `useCollectDeposit`, and `useCheckout`. Add `BookingDetail` and `BookingPayment` interfaces plus `useBooking`. Decimal fields from the API (totalAmount, depositAmount, amount) are serialized as strings by Prisma/JSON — type them as `string` on the client.

- [ ] **Step 1: Install `react-to-print`**

```bash
cd client && npm install react-to-print@^2
```

Expected: `added 1 package` or similar. No peer dependency errors.

- [ ] **Step 2: Add types and hook to `client/src/hooks/useBookings.ts`**

Add this import at the top of the file (after existing imports):

```typescript
import { useQuery } from '@tanstack/react-query';
```

The current file only imports `useMutation` and `useQueryClient`. Change that import line to:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
```

Then add the following at the top of the file, after the existing `CreateBookingDto` interface and before `useCreateBooking`:

```typescript
export interface BookingPayment {
  id: number;
  method: 'CASH' | 'CARD' | 'INSTALLMENT';
  amount: string;
  status: 'PAID' | 'PENDING' | 'FAILED';
  paidAt: string | null;
  referenceNumber: string | null;
}

export interface BookingDetail {
  id: number;
  checkIn: string;
  checkOut: string;
  totalAmount: string;
  depositAmount: string | null;
  depositStatus: 'NONE' | 'HELD' | 'RELEASED' | 'FORFEITED';
  depositRefundAmount: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  tenant: {
    id: number;
    fullName: string;
    phone: string;
    idNumber: string;
  };
  apartment: {
    id: number;
    number: string;
    floor: number;
    type: string;
    building: { name: string };
  };
  payments: BookingPayment[];
}

export function useBooking(bookingId: number) {
  return useQuery<BookingDetail>({
    queryKey: ['booking', bookingId],
    queryFn: async () => {
      const res = await api.get(`/bookings/${bookingId}`);
      return res.data;
    },
    enabled: bookingId > 0,
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit 2>&1 | grep -v LoginPage
```

Expected: No errors (pre-existing LoginPage error is acceptable).

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useBookings.ts client/package.json client/package-lock.json
git commit -m "feat: install react-to-print, add BookingDetail type and useBooking hook"
```

---

### Task 3: Enhance `ReceiptModal` with "Download PDF"

**Files:**
- Modify: `client/src/pages/payments/ReceiptModal.tsx`

**Context:** The existing `ReceiptModal.tsx` has a `<div id="receipt-content">` wrapping the printable area, and a `print:hidden` actions div below it. The current print button calls `window.print()` directly — replace it with `react-to-print`'s `useReactToPrint` which prints only the ref'd element (not the whole page). The printable div gets a `ref`. The modal overlay itself (`fixed inset-0 ...`) has `print:hidden` — this means the overlay is hidden during print, but the content inside `receipt-content` is still available because `useReactToPrint` copies the ref'd element into a hidden iframe before printing.

- [ ] **Step 1: Update `client/src/pages/payments/ReceiptModal.tsx`**

Replace the entire file with:

```typescript
import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import type { PaymentListItem } from '../../hooks/usePayments';

interface ReceiptModalProps {
  payment: PaymentListItem;
  onClose: () => void;
}

function formatAed(amount: string): string {
  return `AED ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

function receiptNumber(id: number): string {
  return `#PAY-${String(id).padStart(6, '0')}`;
}

const METHOD_LABEL: Record<PaymentListItem['method'], string> = {
  CASH: 'Cash',
  CARD: 'Card',
  INSTALLMENT: 'Installment',
};

const STATUS_LABEL: Record<PaymentListItem['status'], string> = {
  PAID: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
};

export default function ReceiptModal({ payment, onClose }: ReceiptModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Receipt-PAY-${String(payment.id).padStart(6, '0')}`,
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-outline-variant overflow-hidden">
        {/* Receipt content — printed by react-to-print */}
        <div ref={printRef} id="receipt-content" className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-primary">LuxStay</h2>
            <p className="text-xs text-on-surface-variant">Payment Receipt</p>
          </div>

          <div className="border-t border-b border-outline-variant py-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Receipt No.</span>
              <span className="font-bold text-on-surface">{receiptNumber(payment.id)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Date</span>
              <span className="text-on-surface">{formatDate(payment.paidAt ?? payment.createdAt)}</span>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Apartment</span>
              <span className="text-on-surface font-bold">{payment.booking.apartment.number} — Floor {payment.booking.apartment.floor}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Tenant</span>
              <span className="text-on-surface">{payment.booking.tenant.fullName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Phone</span>
              <span className="text-on-surface">{payment.booking.tenant.phone}</span>
            </div>
          </div>

          <div className="space-y-2 mb-4 border-t border-outline-variant pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Method</span>
              <span className="text-on-surface">{METHOD_LABEL[payment.method]}</span>
            </div>
            {payment.referenceNumber && (
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Reference</span>
                <span className="text-on-surface font-mono">{payment.referenceNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Status</span>
              <span className="font-bold text-on-surface">{STATUS_LABEL[payment.status]}</span>
            </div>
          </div>

          <div className="bg-surface-container rounded-lg p-4 flex justify-between items-center">
            <span className="text-xs font-bold text-on-surface-variant">TOTAL AMOUNT</span>
            <span className="text-xl font-bold text-primary">{formatAed(payment.amount)}</span>
          </div>
        </div>

        {/* Actions — not printed */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-primary py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Download PDF
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-outline-variant font-bold text-sm hover:bg-surface-container transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit 2>&1 | grep -v LoginPage
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/payments/ReceiptModal.tsx
git commit -m "feat: add Download PDF button to payment receipt via react-to-print"
```

---

### Task 4: `BookingInvoiceModal` Component

**Files:**
- Create: `client/src/components/BookingInvoiceModal.tsx`

**Context:** This component fetches booking data via `useBooking(bookingId)` and renders a two-section print-optimized layout. `react-to-print` prints the ref'd div into a hidden iframe — Tailwind classes will render correctly because the iframe inherits the document's stylesheets. The amount-paid total sums only payments with `status === 'PAID'`. Outstanding balance = `totalAmount - amountPaid`. All monetary values from the API are strings (Prisma Decimal serialization) — convert with `Number()` before arithmetic.

- [ ] **Step 1: Create `client/src/components/BookingInvoiceModal.tsx`**

```typescript
import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useBooking } from '../hooks/useBookings';

interface Props {
  bookingId: number;
  onClose: () => void;
}

function formatAed(amount: number): string {
  return `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  INSTALLMENT: 'Installment',
};

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
};

const DEPOSIT_LABEL: Record<string, string> = {
  NONE: 'None',
  HELD: 'Held',
  RELEASED: 'Released',
  FORFEITED: 'Forfeited',
};

export default function BookingInvoiceModal({ bookingId, onClose }: Props) {
  const { data: booking, isLoading } = useBooking(bookingId);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: booking
      ? `Invoice-${bookingId}-${booking.tenant.fullName.replace(/\s+/g, '-')}`
      : `Invoice-${bookingId}`,
  });

  const amountPaid = booking
    ? booking.payments
        .filter((p) => p.status === 'PAID')
        .reduce((sum, p) => sum + Number(p.amount), 0)
    : 0;

  const outstanding = booking ? Number(booking.totalAmount) - amountPaid : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-outline-variant overflow-hidden max-h-[90vh] flex flex-col">
        {/* Actions bar — not printed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low">
          <h2 className="text-base font-bold text-on-surface">Booking Invoice</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={isLoading || !booking}
              className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant font-bold text-sm hover:bg-surface-container transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Scrollable printable content */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="flex items-center justify-center h-48">
              <span className="material-symbols-outlined animate-spin text-on-surface-variant text-4xl">progress_activity</span>
            </div>
          )}

          {!isLoading && !booking && (
            <p className="p-6 text-on-error-container bg-error-container rounded-lg m-6">Booking not found.</p>
          )}

          {booking && (
            <div ref={printRef} className="p-8 space-y-8 bg-white">
              {/* Section 1: Header + Summary */}
              <div>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-primary">LuxStay</h1>
                    <p className="text-sm text-on-surface-variant">{booking.apartment.building.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-on-surface-variant uppercase tracking-wide">Invoice</p>
                    <p className="text-lg font-bold text-on-surface">#INV-{String(bookingId).padStart(6, '0')}</p>
                    <p className="text-xs text-on-surface-variant">{formatDate(booking.createdAt)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">Tenant</p>
                    <p className="text-sm font-semibold text-on-surface">{booking.tenant.fullName}</p>
                    <p className="text-sm text-on-surface-variant">{booking.tenant.phone}</p>
                    <p className="text-sm text-on-surface-variant">ID: {booking.tenant.idNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">Apartment</p>
                    <p className="text-sm font-semibold text-on-surface">Unit {booking.apartment.number} — Floor {booking.apartment.floor}</p>
                    <p className="text-sm text-on-surface-variant">{booking.apartment.type}</p>
                    <p className="text-sm text-on-surface-variant">{booking.apartment.building.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">Period</p>
                    <p className="text-sm text-on-surface">
                      {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">Total Amount</p>
                    <p className="text-sm font-bold text-on-surface">{formatAed(Number(booking.totalAmount))}</p>
                  </div>
                </div>

                {booking.depositStatus !== 'NONE' && (
                  <div className="bg-surface-container-low rounded-lg p-4">
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">Security Deposit</p>
                    <div className="flex gap-8 text-sm">
                      <span>Amount: <strong>{formatAed(Number(booking.depositAmount ?? 0))}</strong></span>
                      <span>Status: <strong>{DEPOSIT_LABEL[booking.depositStatus]}</strong></span>
                      {(booking.depositStatus === 'RELEASED' || booking.depositStatus === 'FORFEITED') && booking.depositRefundAmount !== null && (
                        <span>Refund: <strong>{formatAed(Number(booking.depositRefundAmount))}</strong></span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Payment Breakdown */}
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">Payment Breakdown</p>

                {booking.payments.length === 0 ? (
                  <p className="text-sm text-on-surface-variant italic">No payments recorded yet.</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-outline-variant">
                        <th className="text-left py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wide">Date</th>
                        <th className="text-left py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wide">Method</th>
                        <th className="text-left py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wide">Reference</th>
                        <th className="text-right py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wide">Amount</th>
                        <th className="text-right py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {booking.payments.map((p) => (
                        <tr key={p.id} className="border-b border-outline-variant">
                          <td className="py-2 text-on-surface">{p.paidAt ? formatDate(p.paidAt) : '—'}</td>
                          <td className="py-2 text-on-surface">{METHOD_LABEL[p.method] ?? p.method}</td>
                          <td className="py-2 text-on-surface-variant font-mono">{p.referenceNumber ?? '—'}</td>
                          <td className="py-2 text-right text-on-surface font-semibold">{formatAed(Number(p.amount))}</td>
                          <td className="py-2 text-right">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              p.status === 'PAID'
                                ? 'bg-surface-container-highest text-on-surface'
                                : 'bg-error-container text-on-error-container'
                            }`}>
                              {STATUS_LABEL[p.status] ?? p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-outline-variant">
                        <td colSpan={3} />
                        <td className="pt-3 text-right text-xs text-on-surface-variant uppercase tracking-wide">Amount Paid</td>
                        <td className="pt-3 text-right font-bold text-on-surface">{formatAed(amountPaid)}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} />
                        <td className="py-1 text-right text-xs text-on-surface-variant uppercase tracking-wide">Outstanding</td>
                        <td className={`py-1 text-right font-bold ${outstanding > 0 ? 'text-error' : 'text-on-surface'}`}>
                          {formatAed(outstanding)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit 2>&1 | grep -v LoginPage
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BookingInvoiceModal.tsx
git commit -m "feat: add BookingInvoiceModal with summary and payment breakdown"
```

---

### Task 5: Wire `BookingInvoiceModal` into `ApartmentDetailPage`

**Files:**
- Modify: `client/src/pages/apartments/ApartmentDetailPage.tsx`

**Context:** The file is 256 lines. The `currentBooking` section rendering the booking attachment panel is near the bottom (lines 228–237). The invoice button should appear in the same block as the booking attachments — it's the natural location for booking-level actions. The file already imports `CollectDepositModal` and `AttachmentPanel`; add `BookingInvoiceModal` the same way. Role guard: same roles as `CollectDepositModal` (`canEdit` — ADMIN + RECEPTIONIST). BUILDING_ADMIN can also view (`canView = user?.role === Role.BUILDING_ADMIN`), but to keep things simple, use `canEdit` for the button visibility since BUILDING_ADMIN may not need invoice access on this page.

Read the full file before editing to understand the exact structure.

- [ ] **Step 1: Add import**

In `client/src/pages/apartments/ApartmentDetailPage.tsx`, add after the existing import for `CollectDepositModal`:

```typescript
import BookingInvoiceModal from '../../components/BookingInvoiceModal';
```

- [ ] **Step 2: Add state**

After the existing `const [showCollectDeposit, setShowCollectDeposit] = useState(false);` line, add:

```typescript
const [showInvoice, setShowInvoice] = useState(false);
```

- [ ] **Step 3: Add "Download Invoice" button in the booking attachments block**

Find this block (around line 229):

```typescript
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

Replace it with:

```typescript
      {apartment.currentBooking && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-on-surface">Booking Attachments</p>
            {canEdit && (
              <button
                onClick={() => setShowInvoice(true)}
                className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                Download Invoice
              </button>
            )}
          </div>
          <AttachmentPanel
            entityType="BOOKING"
            entityId={apartment.currentBooking.id}
            canEdit={canEdit}
          />
        </div>
      )}
```

- [ ] **Step 4: Add modal at the bottom of the return**

Find the existing `{showCollectDeposit && apartment.currentBooking && (` block at the bottom of the return. After it, add:

```typescript
      {showInvoice && apartment.currentBooking && (
        <BookingInvoiceModal
          bookingId={apartment.currentBooking.id}
          onClose={() => setShowInvoice(false)}
        />
      )}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit 2>&1 | grep -v LoginPage
```

Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/apartments/ApartmentDetailPage.tsx
git commit -m "feat: add Download Invoice button to apartment detail booking section"
```
