# CR-5: "+ New Booking" Button on Bookings Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a primary "+ New Booking" button to `BookingsPage` that opens the existing `BookingFormModal`, and fix a pre-existing bug where creating a booking does not refresh the bookings list.

**Architecture:** Frontend-only change. No new components, no schema change, no backend change. Reuses existing `BookingFormModal` (which already filters apartments to `AVAILABLE`). The fix to `useCreateBooking` is small but necessary — without it, the new booking won't appear in the table after the modal closes (today this is masked because bookings can only be created from the apartments page where `['apartments']` invalidation is enough).

**Tech Stack:** React 18, TypeScript, TanStack Query v5, Tailwind. Project uses `@hotel/shared` for `Role` enum. The client has **no test framework** (no vitest/jest) — verification for this task is TypeScript compile + manual browser check.

**Source spec:** `docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md` § "CR-5".

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `client/src/hooks/useBookings.ts` | Modify | Add `['bookings']` to `useCreateBooking` `onSuccess` invalidation list |
| `client/src/pages/bookings/BookingsPage.tsx` | Modify | Add modal-open state, role-gated "+ New Booking" button in header, mount `BookingFormModal` |

Both files exist. No new files.

---

## RBAC decision required before implementation

The BRD says the button is visible to `ADMIN`, `SUPER_ADMIN`, `BUILDING_ADMIN`, `RECEPTIONIST`. The existing `ApartmentsPage` only gates booking creation by `ADMIN || RECEPTIONIST` (line 100). This plan follows the **BRD** (wider role list), because:

- `SUPER_ADMIN` should be at least as permissive as `ADMIN` everywhere — likely an oversight in the existing apartments code, not an intentional restriction.
- `BUILDING_ADMIN` exists to manage their building day-to-day; preventing them from booking would block their job.

If after implementation it turns out `BUILDING_ADMIN` should not create bookings (a server-side `403`), the server is the source of truth — the button will just produce a toast error. Tighten the client gate at that point.

---

## Task 1: Fix `useCreateBooking` to invalidate the bookings list

This is a pre-existing bug, independent of CR-5, but blocks CR-5's acceptance criterion ("on successful create, the bookings list refreshes"). Ship as its own commit so it has a clean history if reverted.

**Files:**
- Modify: `client/src/hooks/useBookings.ts:97-106`

- [ ] **Step 1: Read the current implementation**

Run: open `client/src/hooks/useBookings.ts` and locate `useCreateBooking` (lines 97-106).

Current code:

```ts
export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookingDto) => api.post('/bookings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}
```

Note: no `['bookings']` invalidation. The `useBookingsList` hook (line 87-95) keys its query as `['bookings', params]`, so invalidating the prefix `['bookings']` will refetch all bookings-list variants.

- [ ] **Step 2: Add the missing invalidation**

Replace the `onSuccess` block. New code:

```ts
export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookingDto) => api.post('/bookings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}
```

`['bookings']` is added first (the new caller's primary concern). The other two stay so existing call sites on ApartmentsPage continue to work unchanged.

- [ ] **Step 3: TypeScript check passes**

Run from repo root:
```
npm --prefix client run build
```
Expected: build completes with no errors. (The project doesn't have a standalone typecheck script; `vite build` runs `tsc` first per the `build` script in `client/package.json`.)

- [ ] **Step 4: Commit the fix**

```bash
git add client/src/hooks/useBookings.ts
git commit -m "fix(bookings): invalidate ['bookings'] after createBooking

The useCreateBooking mutation invalidated apartments and tenants but
not bookings. The bug was masked because the only existing caller is
on ApartmentsPage, where the apartments invalidation is enough. CR-5
adds a caller on BookingsPage that needs the list to refresh.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add "+ New Booking" button and modal mount on `BookingsPage`

**Files:**
- Modify: `client/src/pages/bookings/BookingsPage.tsx`

- [ ] **Step 1: Add the imports**

At the top of `BookingsPage.tsx`, the current imports (lines 1-8):

```ts
import { useState } from 'react';
import { useBookingsList, BookingListItem } from '../../hooks/useBookings';
import BookingInvoiceModal from '../../components/BookingInvoiceModal';
import { useBuildings } from '../../hooks/useBuildings';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';
import TablePagination from '../../components/ui/TablePagination';
import Badge from '../../components/ui/Badge';
```

Add three more imports immediately after the existing block:

```ts
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import BookingFormModal from './BookingFormModal';
```

- [ ] **Step 2: Add state + role gate in the `BookingsPage` function body**

Locate the body of `BookingsPage` (starts at line 39). Inside it, the existing state declarations end at line 55:

```ts
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
```

Immediately after that line, add:

```ts
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const { data: user } = useAuth();
  const canCreateBooking =
    user?.role === Role.SUPER_ADMIN ||
    user?.role === Role.ADMIN ||
    user?.role === Role.BUILDING_ADMIN ||
    user?.role === Role.RECEPTIONIST;
```

- [ ] **Step 3: Replace the page header to include the button**

Locate the current page header (lines 107-111):

```tsx
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Bookings</h1>
        <p className="text-sm text-on-surface-variant mt-1">All bookings across your properties</p>
      </div>
```

Replace with:

```tsx
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Bookings</h1>
          <p className="text-sm text-on-surface-variant mt-1">All bookings across your properties</p>
        </div>
        {canCreateBooking && (
          <button
            onClick={() => setNewBookingOpen(true)}
            className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Booking
          </button>
        )}
      </div>
```

The `shrink-0` keeps the button from squashing on narrow viewports; `items-start` keeps the title's subtitle from getting vertically centered against a short button.

- [ ] **Step 4: Mount the modal at the bottom of the returned JSX**

Locate the existing invoice modal mount near the bottom of the JSX (lines 247-253):

```tsx
      {/* Invoice modal */}
      {selectedBookingId !== null && (
        <BookingInvoiceModal
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
        />
      )}
```

Immediately after the closing `)}` of that block (before the final `</div>` that closes the page wrapper), add:

```tsx
      {/* New booking modal */}
      <BookingFormModal
        open={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
      />
```

`BookingFormModal` already returns `null` when `open` is false, so it is safe to keep mounted unconditionally — this matches its API at `client/src/pages/bookings/BookingFormModal.tsx:62`.

- [ ] **Step 5: TypeScript check passes**

Run from repo root:
```
npm --prefix client run build
```
Expected: build completes with no errors.

- [ ] **Step 6: Manual browser verification — golden path**

Start the dev server (if not running):
```
npm --prefix client run dev
```

In a browser:

1. Log in as a user with role `ADMIN` (or `RECEPTIONIST`).
2. Navigate to `/bookings`.
3. Expected: `+ New Booking` button visible in the top-right of the page header.
4. Click the button.
5. Expected: `BookingFormModal` opens with empty fields. The Apartment dropdown lists only `AVAILABLE` apartments (this is existing behaviour of the modal — confirm one apartment is visible to verify the wiring).
6. Fill in apartment, tenant, check-in (today), check-out (tomorrow), total amount (e.g. `1000`), payment method `CASH`, payment amount `1000`.
7. Click "Create Reservation".
8. Expected: modal closes, a new row appears at the **top** of the bookings table for the tenant + apartment you selected. The `Total` stat card increments by 1.

If step 8 fails (modal closes but no new row), the `useCreateBooking` invalidation fix from Task 1 was not applied.

- [ ] **Step 7: Manual browser verification — RBAC**

Repeat the visibility check for each non-permitted role:

1. Log in as a `MAINTENANCE` user.
2. Navigate to `/bookings`.
3. Expected: page renders normally, but `+ New Booking` button is **absent**.
4. Log out, log in as `FINANCE`.
5. Repeat — expected: button absent.

If the project does not have seed users for `MAINTENANCE` and `FINANCE`, temporarily change a test user's role via the Users page (as `SUPER_ADMIN`) to verify, then revert. Note this verification step in the commit message but do not commit the role change itself.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/bookings/BookingsPage.tsx
git commit -m "feat(bookings): + New Booking button on bookings page (CR-5)

Adds a primary action button in the BookingsPage header that opens
the existing BookingFormModal with no prefills. Visible to roles
ADMIN, SUPER_ADMIN, BUILDING_ADMIN, RECEPTIONIST per the BRD. The
modal already filters apartments to AVAILABLE only.

Manually verified golden path (open → fill → submit → row appears)
and RBAC (button hidden for MAINTENANCE and FINANCE roles). Client
has no automated test framework; no test added.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Acceptance check (BRD § CR-5)

After the two commits:

- [x] Bookings page header shows `+ New Booking` button (primary style) for roles `ADMIN`, `SUPER_ADMIN`, `BUILDING_ADMIN`, `RECEPTIONIST` — verified in Task 2 Step 6 / Step 7.
- [x] Clicking opens `BookingFormModal` with empty state — verified in Task 2 Step 6.
- [x] On successful create, the bookings list refreshes and the new booking is visible — fixed in Task 1, verified in Task 2 Step 6.

---

## Notes for the implementer

- **Don't add features beyond what's listed.** No calendar view, no availability strip, no inline filtering changes. Those were considered for CR-5 and rejected in the BRD's "Open Questions" section.
- **Don't add a frontend test framework.** That's a separate, deliberate decision and not in scope.
- **If `npm --prefix client run build` fails for unrelated reasons** (a TypeScript regression on an unrelated file), stop and report — don't fix it as part of this change (Rule 3 — surgical changes).
- **The fix in Task 1 is a separate commit.** Don't squash; the bug existed independently of CR-5 and may be cherry-picked elsewhere.
