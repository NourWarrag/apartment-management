# Manual Test Plan — Hotel Apartment Management System

## Overview

End-to-end manual test cases organized by feature area. Use this to verify a build before release, or as the basis for QA scripts.

## Conventions

- **TC ID** format: `<AREA>-<NNN>` (e.g. `AUTH-001`)
- **Role required**: minimum role to execute the test. If a role's restrictions are the subject, that's stated.
- **Result**: ☐ Pass · ☐ Fail · ☐ Blocked — fill during execution
- **Prereq**: state to set up before the test
- **Steps + Expected** describe the action and the observable outcome

## Roles in the system

| Role | Description |
|---|---|
| `SUPER_ADMIN` | All permissions; only role that can create `ADMIN` or another `SUPER_ADMIN` |
| `ADMIN` | Full operational access except creating ADMIN/SUPER_ADMIN users |
| `BUILDING_ADMIN` | Scoped to one building; can perform admin actions within that scope |
| `RECEPTIONIST` | Create bookings, record payments, manage tenants, checkout |
| `FINANCE` | Read-only on operational data, full access to payments and reports |
| `MAINTENANCE` | Read tickets assigned to self; update status/notes on own tickets only |

## Test data setup

Before running the suite, seed:
- 1 SUPER_ADMIN user (`super@test.com` / `password123`)
- 1 ADMIN user (`admin@test.com` / `password123`)
- 1 RECEPTIONIST (`reception@test.com`)
- 1 FINANCE (`finance@test.com`)
- 1 MAINTENANCE (`maint1@test.com`) plus one more (`maint2@test.com`) to test cross-ownership
- 2 buildings (e.g. `MAIN` and `TOWER`)
- ~10 apartments split across both buildings, all statuses represented
- 3-5 tenants, mix of `VERIFIED` / `PENDING` / `ACTION_REQUIRED` KYC
- 2-3 active bookings, 1 upcoming, 1 checked-out
- A few payments in `PAID` and `PENDING` states

---

## 1. Authentication & Session — AUTH

### AUTH-001 — Login with valid credentials
- Role: any
- Steps:
  1. Open `/login`
  2. Enter valid email + password
  3. Submit
- Expected: Redirect to `/dashboard`; user name + role visible in header

### AUTH-002 — Login with wrong password
- Steps:
  1. Open `/login`
  2. Enter valid email + wrong password
  3. Submit
- Expected: Error message "Invalid credentials" or similar; stays on `/login`

### AUTH-003 — Login with unknown email
- Steps: Same as above with non-existent email
- Expected: Same generic error (do not leak which field was wrong)

### AUTH-004 — Deactivated account cannot login
- Prereq: A user that has been deactivated by an admin
- Expected: Error "Account deactivated" (or 401); no redirect

### AUTH-005 — Session persistence on refresh
- Prereq: Logged in
- Steps:
  1. Refresh the browser
- Expected: User remains logged in; same page reloads

### AUTH-006 — Logout clears session
- Steps:
  1. Click user menu → Logout
  2. Try to navigate to `/dashboard`
- Expected: Redirected to `/login`

### AUTH-007 — Unauthenticated direct URL access redirects to login
- Prereq: Not logged in (incognito / fresh session)
- Steps: Navigate to `/apartments` directly
- Expected: Redirect to `/login`

### AUTH-008 — Language toggle (English ↔ Arabic)
- Steps: Click `EN | عر` toggle in header
- Expected: UI labels switch language; layout switches RTL/LTR appropriately

---

## 2. Buildings — BLD

### BLD-001 — List buildings (Admin)
- Role: `ADMIN` or `SUPER_ADMIN`
- Steps: Navigate to `/buildings`
- Expected: Table shows all buildings; columns Name / Code / Address / Actions; edit + delete icons visible

### BLD-002 — Create building
- Role: `ADMIN`
- Steps:
  1. Click "Add Building"
  2. Fill in name, unique code, address
  3. Save
- Expected: Modal closes; new building appears in list; toast success

### BLD-003 — Create building with duplicate code
- Steps: Try to create a building with an existing code
- Expected: 409 error message "Code already exists" (or similar); modal stays open

### BLD-004 — Edit building name
- Steps: Click edit icon on a row, change name, save
- Expected: Updated name appears in the list immediately

### BLD-005 — Delete empty building
- Prereq: Building with no apartments
- Steps: Click delete icon, confirm
- Expected: Building disappears from list

### BLD-006 — Cannot delete building with apartments
- Prereq: Building with at least one apartment
- Steps: Click delete icon
- Expected: Error banner "Cannot delete a building that has apartments"

### BLD-007 — Building selector dropdown in header
- Role: ADMIN (multi-building)
- Steps: Open building selector in top bar
- Expected: Shows "All Buildings" + each building "Name (CODE)"; selection affects subsequent list pages

---

## 3. Apartments — APT

### APT-001 — List apartments (default view)
- Steps: Navigate to `/apartments`
- Expected: Stats cards (occupancy %, available, pending checkout, in maintenance) above the table; table shows up to 10 rows per page; pagination visible if total > 10

### APT-002 — Filter by floor
- Steps: Select a floor in the floor dropdown, click Apply
- Expected: Only apartments on that floor visible

### APT-003 — Filter by type
- Steps: Select type (STUDIO / 1-BEDROOM / etc.), Apply
- Expected: Filtered correctly; combined with floor filter is multiplicative (AND)

### APT-004 — Filter by status
- Steps: Select status (Available / Occupied / etc.), Apply
- Expected: Filtered correctly

### APT-005 — Search by apartment number
- Steps: Type a unit number in search, press Enter
- Expected: Matching apartments only

### APT-006 — Clear filters
- Steps: After applying filters, change filters back to "All" and Apply
- Expected: Full unfiltered list returns

### APT-007 — Create apartment
- Role: `ADMIN` / `RECEPTIONIST`
- Steps: Click "Add Apartment", fill number/floor/type/status/buildingId, save
- Expected: Modal closes, apartment appears in list

### APT-008 — Edit apartment via row "more" menu
- Steps: Click ⋮ on a row, edit, save
- Expected: Updated values reflected; modal closes

### APT-009 — Status workflow: Available → Reserved → Occupied
- Steps: From detail page, change status to Reserved, then Occupied
- Expected: Each change reflected; "Status updated" toast

### APT-010 — Pending Checkout → Cleaning → Available via "Mark Ready"
- Prereq: Apartment in `CLEANING` state with checkout completed
- Steps: Click "Mark ready (cleaning done)" icon (done_all)
- Expected: Status flips to `AVAILABLE`; success toast

### APT-011 — Building badge visible when "All Buildings" selected
- Prereq: Multi-building setup, "All Buildings" selected in header
- Steps: View apartments page
- Expected: Each row shows the building code as a small tag next to the apartment number

### APT-012 — Building badge HIDDEN when single building selected
- Prereq: Select a specific building in header
- Steps: View apartments page
- Expected: No building badge per row (all are the same building)

### APT-013 — Click apartment number opens detail page
- Steps: Click an apartment number link in the table
- Expected: Navigate to `/apartments/<id>`; full detail page renders

### APT-014 — Detail page shows current tenant card if occupied
- Prereq: Apartment is `OCCUPIED` with a booking
- Steps: Open detail page
- Expected: Avatar, name, phone, check-in, check-out, payment status visible

### APT-015 — Detail page shows "no current booking" if vacant
- Prereq: Vacant apartment
- Expected: Empty-state with bed icon and "No current booking"

### APT-016 — Booking history section
- Prereq: Apartment has past bookings
- Expected: List of prior tenants with date ranges and total amounts; tenant names link to tenant page

### APT-017 — Maintenance history section
- Prereq: Apartment has past tickets
- Expected: List of tickets with description, resolved date (if any), status badge

### APT-018 — Quick action: Record payment from row
- Role: `ADMIN` / `RECEPTIONIST`
- Prereq: Row has currentBooking
- Steps: Hover row → click payments icon
- Expected: PaymentFormModal opens with apartment + tenant prefilled

### APT-019 — Quick action: New reservation
- Prereq: Row status is `AVAILABLE`
- Steps: Click add_home icon
- Expected: BookingFormModal opens with apartment prefilled

### APT-020 — Quick action: Checkout
- Role: `ADMIN` / `RECEPTIONIST` / `BUILDING_ADMIN`
- Prereq: Row status is `OCCUPIED` with currentBooking
- Steps: Click logout icon (amber)
- Expected: CheckoutModal opens

### APT-021 — Daily report export button
- Steps: Click "Daily Apartment Status Report"
- Expected: CSV download initiated (or whatever the spec is)

---

## 4. Tenants — TEN

### TEN-001 — List tenants
- Steps: Navigate to `/tenants`
- Expected: Table with avatar, name+tier, phone+ID, active apartment, rental period, KYC status

### TEN-002 — Search tenants
- Steps: Type in search box (name, phone, ID, or unit)
- Expected: Filtered results live-update (debounced)

### TEN-003 — Clear search via X icon
- Steps: After typing, click the X
- Expected: Search clears, all tenants shown

### TEN-004 — Click row opens drill-down panel
- Steps: Click any row
- Expected: Side panel slides in on right (or below on mobile) showing profile card + tenancy history + notes

### TEN-005 — Clicking same row again closes panel
- Steps: Click the active row a second time
- Expected: Panel closes; row deselects

### TEN-006 — Selected row visual highlight
- Steps: Open a tenant
- Expected: Row has left-border accent + subtle background tint

### TEN-007 — Create tenant
- Role: `ADMIN` / `RECEPTIONIST`
- Steps: Click "Register New Tenant", fill fullName, phone, ID number, kycStatus, tier, save
- Expected: New tenant appears in list

### TEN-008 — Create tenant with duplicate ID number
- Steps: Try to register with an existing idNumber
- Expected: 409 error "ID number already registered"

### TEN-009 — Edit tenant from drill-down panel
- Steps: Open detail panel → click "Edit Tenant"
- Expected: Modal opens with prefilled values; save persists; panel data refreshes

### TEN-010 — KYC badge colors per status
- Expected: `VERIFIED` green pill; `PENDING` amber pill; `ACTION_REQUIRED` red pill labeled "Action Req."

### TEN-011 — Active Apartment pill links/visible
- Prereq: Tenant has currentBooking
- Expected: Dark navy pill with apartment icon + number; "—" if no current booking

### TEN-012 — Tenancy history shows current vs past bookings
- Expected: Active lease has solid dot indicator + "Present" instead of checkout date

### TEN-013 — Operational notes display
- Prereq: Tenant has notes field set
- Expected: Notes appear in italic in the operational notes card; placeholder text if empty

---

## 5. Bookings — BKG

### BKG-001 — List bookings
- Steps: Navigate to `/bookings`
- Expected: Stats cards (Total, Active, Upcoming, Checked Out) above table; pagination (Previous / Next + count)

### BKG-002 — Status derivation visible
- Expected: Each row shows derived status badge: Active (green), Upcoming (blue), Checked Out (gray)

### BKG-003 — Deposit status badge
- Expected: NONE (gray "No Deposit"), HELD (amber), RELEASED (green), FORFEITED (red)

### BKG-004 — Filter by status
- Steps: Select "Active" in status dropdown, click Apply
- Expected: Only active bookings shown; counts in stats cards unchanged (they reflect all)

### BKG-005 — Filter by building
- Steps: Select a building, Apply
- Expected: Only bookings in that building

### BKG-006 — Filter by date range (from + to)
- Steps: Pick from + to dates, Apply
- Expected: Only bookings overlapping that range

### BKG-007 — Search by tenant or apartment
- Steps: Type in search box, press Enter or click Apply
- Expected: Matching bookings only

### BKG-008 — Clear filters
- Steps: Click Clear
- Expected: All filter inputs reset; full list returns

### BKG-009 — Pagination (prev/next)
- Prereq: > 20 bookings
- Steps: Click Next, then Previous
- Expected: Page changes; "Showing X-Y of Z" updates

### BKG-010 — Row click opens invoice modal
- Steps: Click any booking row
- Expected: BookingInvoiceModal opens with the booking details

### BKG-011 — Create booking from apartment quick action
- Role: `ADMIN` / `RECEPTIONIST`
- Prereq: Available apartment
- Steps: From apartments page, click add_home on an available unit, fill tenant/dates/amount, save
- Expected: Booking created; apartment status flips to `RESERVED` or `OCCUPIED` (depending on check-in date)

### BKG-012 — Booking with conflicting dates is rejected
- Steps: Try to create a booking for an apartment that already has a booking in the same date range
- Expected: Validation error

### BKG-013 — Total amount formatted
- Expected: Currency displays as `AED 5,000.00` (using en-US locale)

---

## 6. Payments — PAY

### PAY-001 — List payments
- Steps: Navigate to `/payments`
- Expected: 4 stat widgets (Monthly Revenue, Outstanding, Active Plans, Collection Rate); table with Date / Apt / Tenant / Method / Amount / Status / Actions; numeric pagination

### PAY-002 — Filter by method
- Steps: Method dropdown → CASH / CARD / INSTALLMENT, Apply
- Expected: Filtered list

### PAY-003 — Filter by status
- Steps: Status dropdown → PAID / PENDING / FAILED, Apply
- Expected: Filtered list

### PAY-004 — Search by tenant or apartment
- Steps: Type in search, Apply (or Enter)
- Expected: Matching payments only

### PAY-005 — Numeric pagination with window
- Prereq: > 100 payments (5+ pages)
- Steps: Click page 3
- Expected: Window scrolls; current page highlighted in primary

### PAY-006 — View receipt
- Steps: Click receipt icon (📃) on a payment row
- Expected: ReceiptModal opens with payment details

### PAY-007 — Mark payment as paid
- Role: `ADMIN` / `RECEPTIONIST`
- Prereq: Pending payment
- Steps: Click check-circle icon (green)
- Expected: Status flips to PAID; toast confirms

### PAY-008 — Mark-paid is disabled during request
- Steps: Click mark-paid; before response, observe button
- Expected: Button shows disabled state (opacity-50)

### PAY-009 — Record payment from header CTA
- Role: `ADMIN` / `RECEPTIONIST`
- Steps: Click "Record Payment" → form opens unbound to specific booking
- Expected: Form requires selection; submits and creates new payment

### PAY-010 — Status badges render correctly
- Expected: PAID green, PENDING amber, FAILED red

### PAY-011 — Deleted apartment shown with red "Deleted" tag
- Prereq: Payment for a booking whose apartment was soft-deleted
- Expected: Apartment cell shows the number + a red `Deleted` uppercase tag

### PAY-012 — Deleted tenant shown with red "Deleted" tag
- Same as above for tenants

### PAY-013 — InstallmentTracker panel below table
- Expected: Shows active installment plans (empty state acceptable if none)

### PAY-014 — Finance role cannot record payment
- Role: `FINANCE`
- Expected: "Record Payment" button not visible; receipt + view actions ARE visible

---

## 7. Maintenance Tickets — TKT

### TKT-001 — Open tickets page (Kanban default)
- Steps: Navigate to `/tickets`
- Expected: Default Kanban view with 3 columns (Open, In Progress, Completed); metrics row at bottom

### TKT-002 — Toggle to list view
- Steps: Click list icon in view toggle
- Expected: Switches to table view; primary highlight moves to list button

### TKT-003 — Filter by type
- Steps: Click Maintenance or Cleaning chip
- Expected: Only tickets of that type visible in current view

### TKT-004 — Create new ticket
- Role: `ADMIN` / `RECEPTIONIST`
- Steps: Click "New Ticket", fill apartment, description, priority, optional assignedToId, optional type, save
- Expected: Ticket appears in Open column

### TKT-005 — Cleaning ticket type
- Steps: Create a ticket with type=CLEANING
- Expected: Ticket shows cleaning_services icon next to number in list view

### TKT-006 — Click ticket card in Kanban opens detail panel
- Steps: Click a card in the Open column
- Expected: Detail panel slides in as 4th column; grid switches from 3-col to 4-col

### TKT-007 — Click same card again closes panel
- Expected: Panel closes; grid returns to 3-col

### TKT-008 — List view row click opens detail modal
- Steps: From list view, click a row
- Expected: Modal overlay opens with detail panel inside

### TKT-009 — Priority badge colors
- Expected: HIGH primary; MEDIUM tertiary-fixed (amber-ish); LOW surface-container-high (gray)

### TKT-010 — Status badge colors
- Expected: OPEN error-container; IN_PROGRESS secondary-container; COMPLETED tertiary-container

### TKT-011 — MAINTENANCE role can only see assigned tickets
- Role: `MAINTENANCE` (user1)
- Prereq: Some tickets assigned to user1, some to user2
- Expected: Only user1's tickets visible; user2's are not

### TKT-012 — MAINTENANCE role can update status + notes on own
- Role: `MAINTENANCE`
- Steps: Open own ticket, change status to IN_PROGRESS, add notes, save
- Expected: 200 success; values persist

### TKT-013 — MAINTENANCE cannot update priority/assignedToId/apartmentId
- Steps: Try to send priority change via API
- Expected: 403 "MAINTENANCE staff can only update status and notes"

### TKT-014 — MAINTENANCE cannot change ticket type (silently ignored)
- Steps: Send type=MAINTENANCE for a CLEANING ticket
- Expected: Update succeeds (200); type remains CLEANING (not changed)

### TKT-015 — MAINTENANCE updating someone else's ticket → 403
- Role: `MAINTENANCE` (user2)
- Steps: Try to update a ticket assigned to user1
- Expected: 403

### TKT-016 — Setting COMPLETED records resolvedAt
- Role: `ADMIN`
- Steps: Set status to COMPLETED
- Expected: `resolvedAt` timestamp populates in detail panel

### TKT-017 — Reverting from COMPLETED clears resolvedAt
- Steps: Set back to OPEN or IN_PROGRESS
- Expected: `resolvedAt` becomes null

### TKT-018 — Invalid status returns 400
- Steps: Send `status: 'INVALID'` via API
- Expected: 400 with valid-values list

### TKT-019 — assignedToId must reference a MAINTENANCE user
- Role: `ADMIN`
- Steps: Try to assign a ticket to an ADMIN user's id
- Expected: 400 "assignedToId must refer to a MAINTENANCE user"

### TKT-020 — Stats reflect current data
- Expected: Open count, In Progress count, Resolved (24h) count, Avg Resolution Time match the underlying tickets

### TKT-021 — Empty Kanban column shows placeholder
- Prereq: No tickets in a status
- Expected: "No tickets" text in that column

### TKT-022 — Empty list view shows empty state row
- Prereq: No tickets at all (after filter)
- Expected: Full-width row "No tickets found"

---

## 8. Users — USR

### USR-001 — List users (All Users tab)
- Role: `ADMIN`
- Steps: Navigate to `/users`, ensure "All Users" tab active
- Expected: Table of all users; role badge per row; deactivated users have opacity-50

### USR-002 — Staff tab (feature-flagged)
- Prereq: STAFF feature flag enabled
- Steps: Click Staff tab
- Expected: Only MAINTENANCE users visible; Status column now shows staffStatus

### USR-003 — Staff tab hidden when feature disabled
- Prereq: STAFF flag off
- Expected: Only "All Users" tab visible

### USR-004 — Create user (ADMIN role)
- Role: `ADMIN`
- Steps: Click Add User, fill name/email/role=RECEPTIONIST/password, save
- Expected: User created; appears in list

### USR-005 — ADMIN cannot create ADMIN role user
- Role: `ADMIN`
- Steps: Try role=ADMIN
- Expected: 403 "Only SUPER_ADMIN can assign ADMIN role"

### USR-006 — SUPER_ADMIN can create ADMIN
- Role: `SUPER_ADMIN`
- Expected: Allowed

### USR-007 — Create user with duplicate email
- Expected: 409 "Email already in use"

### USR-008 — Create BUILDING_ADMIN requires assignedBuildingId
- Role: `ADMIN`
- Steps: Try to create BUILDING_ADMIN without selecting a building
- Expected: 400 mentioning `assignedBuildingId`

### USR-009 — Edit user
- Steps: Click Edit, change name, save
- Expected: Updated; toast or visual confirmation

### USR-010 — Deactivate user
- Role: `ADMIN`
- Steps: Click Deactivate on a non-self row
- Expected: Row shows opacity-50; user can no longer login

### USR-011 — Cannot deactivate self
- Role: `ADMIN`
- Steps: Try to deactivate own row
- Expected: Deactivate button is disabled with tooltip "Cannot deactivate your own account"; click attempts have no effect

### USR-012 — Reactivate user
- Prereq: Deactivated user
- Steps: Click Reactivate
- Expected: Opacity returns to 100%; user can login again

### USR-013 — Update staffStatus from list (admin only)
- Role: `ADMIN`
- Prereq: STAFF flag on; MAINTENANCE user in Staff tab
- Steps: Change select dropdown from OFF_DUTY → ACTIVE
- Expected: Toast "Status updated"; value persists

### USR-014 — Non-admin in Staff tab sees status as badge (not select)
- Role: `MAINTENANCE`
- Expected: Staff status shown as a colored badge, no dropdown

### USR-015 — Invalid staffStatus rejected
- Steps: Send `staffStatus: 'BOGUS'` via API
- Expected: 400 "Invalid staff status"

### USR-016 — staffStatus only on MAINTENANCE role
- Steps: Try to set staffStatus on an ADMIN user
- Expected: 400 "Staff status can only be set on MAINTENANCE role users"

### USR-017 — Role badge colors render
- Expected: SUPER_ADMIN purple, ADMIN primary, BUILDING_ADMIN secondary, RECEPTIONIST amber, FINANCE green, MAINTENANCE orange — all with visible filled backgrounds

---

## 9. Reports — RPT

### RPT-001 — Open Reports page
- Role: `ADMIN` / `FINANCE`
- Steps: Navigate to `/reports`
- Expected: Date range picker at top; tab bar with Revenue / Occupancy / Outstanding / Maintenance / Buildings; default is Revenue

### RPT-002 — Date range filter (quick chips)
- Steps: Click "Last 30 days", "Last 3 months", "This year", "All time"
- Expected: Date inputs update; tab content refetches

### RPT-003 — Custom date range
- Steps: Pick custom From + To dates
- Expected: All tabs refetch with the custom range

### RPT-004 — Revenue tab
- Steps: Click Revenue tab
- Expected: Total Revenue card; "Payment Method" table; "Month" table; export CSV button works

### RPT-005 — Occupancy tab
- Expected: Table with Month, Occupied, Total, Rate; rate text color is green (≥80), secondary (60-79), error (<60)

### RPT-006 — Outstanding tab
- Expected: Table with Tenant, Apartment, Pending Amount (red), Oldest Due

### RPT-007 — Maintenance tab
- Expected: Two side-by-side tables: by Status, by Type

### RPT-008 — Buildings tab
- Expected: Table per building; a bold "All Buildings" summary row at the bottom with `border-t-2`

### RPT-009 — Building code badges visible in Buildings tab
- Expected: Each building row has a small uppercase code tag next to its name (filled secondary-container background)

### RPT-010 — Export CSV (each tab)
- Steps: Click "Download CSV" in each tab
- Expected: CSV file downloads with expected columns and rows

### RPT-011 — Print / Save PDF
- Steps: Click "Print / Save PDF"
- Expected: Browser print dialog; layout hides nav/toggles, shows a print-only title row

### RPT-012 — Empty state per tab
- Prereq: Date range with no data
- Expected: Tables show "No data" or equivalent inside the table (headers remain visible)

---

## 10. Dashboard — DSH

### DSH-001 — Dashboard loads on login
- Steps: After login
- Expected: Stat cards (Total / Occupied / Available apartments, Pending Installments, Open Tickets); Revenue Trend chart; Recent Activity list

### DSH-002 — Revenue trend 7D / 30D toggle
- Steps: Click 7D and 30D
- Expected: Chart redraws with appropriate range; selected button highlighted

### DSH-003 — Click "Available" stat → /apartments?status=AVAILABLE
- Steps: Click the Available card
- Expected: Navigates to apartments page with status filter prefilled

### DSH-004 — Recent activity list
- Expected: Latest events with icon + description + relative time ("just now", "10 minutes ago")

### DSH-005 — Stats reflect current data
- Cross-check totals against direct counts in apartments/payments/tickets pages

---

## 11. Settings — STG

### STG-001 — View settings (defaults)
- Role: `ADMIN`
- Prereq: Fresh install or first access
- Steps: Navigate to `/settings`
- Expected: Defaults shown (companyName: "My Property", currency: "AED")

### STG-002 — Update company name
- Steps: Change companyName, save
- Expected: Toast success; GET reflects updated value

### STG-003 — Currency change
- Steps: Change currency, save
- Expected: Updated; AED-formatted amounts elsewhere DON'T retroactively change format (out of scope)

---

## 12. Multi-Building scoping — MBA

### MBA-001 — "All Buildings" view
- Prereq: 2+ buildings exist; logged in as ADMIN
- Steps: Select "All Buildings" in header dropdown
- Expected: Apartments, bookings, payments pages show items across all buildings

### MBA-002 — Single building scope
- Steps: Select one building
- Expected: Apartments / bookings / payments are filtered to that building

### MBA-003 — BUILDING_ADMIN scope cannot see other buildings
- Role: `BUILDING_ADMIN` assigned to building X
- Expected: Header dropdown locks to X (or only X is selectable); cross-building data not visible

### MBA-004 — Building badge appears across all-buildings views
- Prereq: All Buildings selected
- Expected: Apartments / Payments / Bookings rows show the building code tag

---

## 13. Attachments — ATT

### ATT-001 — Upload attachment to apartment
- Role: `ADMIN`
- Steps: On apartment detail page, attach a file (PDF/image)
- Expected: File appears in list; success toast

### ATT-002 — Upload attachment to booking
- Steps: On apartment detail, scroll to "Booking Attachments", attach file
- Expected: File listed under the booking section

### ATT-003 — Download/view attachment
- Steps: Click attachment row
- Expected: File opens in browser or downloads

### ATT-004 — Delete attachment
- Steps: Click delete icon on a row
- Expected: File removed from list

### ATT-005 — Disallowed file type rejected
- Steps: Try to upload an `.exe` (or whatever the restricted types are)
- Expected: Validation error; file not uploaded

### ATT-006 — Oversize file rejected
- Steps: Upload a file exceeding limit
- Expected: Validation error

### ATT-007 — Read-only roles see attachments but no upload UI
- Role: `MAINTENANCE` or `FINANCE`
- Expected: Attachment list visible; no upload/delete buttons

---

## 14. Cross-cutting RBAC sanity — RBAC

For each role, the following routes/actions are gated. Spot-check 2-3 per role.

### RBAC-001 — RECEPTIONIST can record payments and create bookings
### RBAC-002 — RECEPTIONIST cannot manage users (Users page not visible OR returns 403)
### RBAC-003 — FINANCE can view payments + reports, cannot record payments or modify apartments
### RBAC-004 — MAINTENANCE sees only tickets page and their assigned tickets
### RBAC-005 — BUILDING_ADMIN can manage their building's data but not others'
### RBAC-006 — SUPER_ADMIN can do everything an ADMIN can plus assign ADMIN role
### RBAC-007 — Unauthenticated API calls return 401, NOT 403 (auth missing vs auth insufficient)

---

## 15. i18n — I18N

### I18N-001 — Switch to Arabic
- Steps: Click `EN | عر` toggle
- Expected: Static labels translate to Arabic; numerals remain Western Arabic digits (or per app convention)

### I18N-002 — RTL layout in Arabic
- Expected: Page direction flips to RTL; sidebar moves to right; text aligns right

### I18N-003 — Switch back to English
- Steps: Click toggle again
- Expected: Returns to English / LTR cleanly

### I18N-004 — Apartment status labels translated
- Prereq: Apartments page open
- Expected: "Available", "Occupied", etc. show in Arabic

### I18N-005 — Date formats follow locale
- Expected: Dates render with locale-appropriate format

---

## 16. Validation & error UX — VAL

### VAL-001 — Required field empty → inline error
- Steps: Submit any form with required field left blank
- Expected: Inline error message on the offending field; submit blocked

### VAL-002 — Server validation error → toast or inline
- Steps: Submit a form that passes client validation but fails server (e.g., duplicate code)
- Expected: User-friendly error visible (not a raw 500 stack)

### VAL-003 — Network failure during submit
- Steps: Disconnect, attempt save
- Expected: Toast or banner with "Failed to save" / "Please try again"

### VAL-004 — Loading state visible during submit
- Steps: Submit a form
- Expected: Submit button shows disabled state or spinner during in-flight request

### VAL-005 — Permission denied (403) is surfaced
- Steps: Trigger a 403 (e.g., MAINTENANCE attempting forbidden update)
- Expected: User-friendly message; not silent

---

## 17. Visual & UX smoke checks — UX

### UX-001 — All 7 list pages share table chrome
- Steps: Open Buildings, Users, Bookings, Payments, Apartments, Tenants, Reports
- Expected: Same white card with shadow, bold uppercase headers, divided rows, hover state

### UX-002 — Status / role / KYC badges render with filled backgrounds
- Spot-check across pages
- Expected: No "transparent badge" regression (i.e. text-only badges with no visible pill background)

### UX-003 — Icon buttons hover with subtle bg
- Spot-check edit/delete icons in Buildings page; payment/checkout icons in Apartments
- Expected: `surface-container` background appears on hover

### UX-004 — Forms have focus rings on inputs
- Tab through any form
- Expected: Visible focus ring on each input (primary color)

### UX-005 — Empty states across the app
- Spot-check Buildings (no buildings), Tickets (no tickets in column), Reports (empty range), Payments
- Expected: Each empty state has appropriate text; no broken layout

### UX-006 — Loading skeletons for stats
- Steps: Reload dashboard with throttled network
- Expected: Skeleton placeholder bars visible (gray, not transparent)

---

## 18. Regression smoke — REG

Quick pre-release checklist. Should take ~10 minutes.

- [ ] REG-001 — Login as ADMIN
- [ ] REG-002 — Create a building
- [ ] REG-003 — Create an apartment in that building
- [ ] REG-004 — Create a tenant
- [ ] REG-005 — Create a booking linking them
- [ ] REG-006 — Record a payment for that booking
- [ ] REG-007 — Mark payment as paid
- [ ] REG-008 — Create a maintenance ticket on the apartment
- [ ] REG-009 — Switch to Kanban; switch to List; back to Kanban
- [ ] REG-010 — Open detail panel; close detail panel
- [ ] REG-011 — Run all 5 Reports tabs; verify data renders
- [ ] REG-012 — Export one CSV
- [ ] REG-013 — Toggle to Arabic; verify Buildings page; toggle back
- [ ] REG-014 — Logout

If any of these fail, block the release.

---

## How to use this document

1. Copy this file into a tracking sheet (Notion, Linear, Sheets) or print for paper run-through.
2. Run tests in order per area; mark Pass / Fail / Blocked in the Result field.
3. For failures, file a bug with the TC ID, repro steps observed, expected vs actual, screenshot.
4. The Regression smoke (Section 18) is the minimum bar for any release.

## Maintenance

When new features ship, add test cases under the appropriate area before the feature is considered "done." When existing flows change, mark superseded TCs `[REMOVED]` rather than deleting — keeps the test history searchable.

## 19. Accounting Module (Phase 1)

**Prerequisites:** `FEATURE_ACCOUNTING=true` in `.env`. Log in as an ADMIN user. The starter chart has been seeded (run "Add starter chart" once on the Chart of Accounts page if needed).

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 19.1 | Sidebar gating — feature off | Set `FEATURE_ACCOUNTING=false`, restart, log in as ADMIN | The four Accounting items are not in the sidebar |
| 19.2 | Sidebar gating — role | Log in as RECEPTIONIST with the flag on | Accounting items are not in the sidebar |
| 19.3 | Sidebar visible — FINANCE | Log in as FINANCE with the flag on | All four accounting items appear |
| 19.4 | Empty state — seed starter chart | Visit Chart of Accounts with no accounts | "Add starter chart" button appears; clicking it seeds ~14 accounts |
| 19.5 | Create a new account | Click New Account, code 1099, name "Test", type ASSET, save | Row appears in ASSET group |
| 19.6 | Duplicate code rejection | Create another account with code 1099 | 409 response, modal shows error |
| 19.7 | Deactivate account | Toggle the active pill on the new account | Pill shows "Inactive" |
| 19.8 | Account picker hides inactive | Open Journal Entry editor, open account picker | The inactive account does not appear |
| 19.9 | Create draft JE | New Entry, two lines (Cash debit 100, Revenue credit 100), Save as Draft | DRAFT entry created; list shows it with DRAFT pill |
| 19.10 | Unbalanced post is rejected | Edit draft to debit 100/credit 90, click Save & Post | Save & Post button disabled OR server returns UNBALANCED with diff |
| 19.11 | Successful post | Balance the draft and Save & Post | Confirm dialog appears; on accept, entry number becomes `JE-NNNNNN`, status POSTED |
| 19.12 | Posted entry is read-only | Reopen the posted entry | All inputs disabled; no Save buttons |
| 19.13 | Cannot delete posted | Try DELETE via UI on a posted row | UI does not offer delete; manual API call returns 400 ALREADY_POSTED |
| 19.14 | Trial balance reflects only posted | View Trial Balance; create a new draft after | Draft does not change totals; grand totals equal |
| 19.15 | GL running balance | Add 3 posted entries to Cash; visit GL with Cash selected | Opening/closing rows present; running balance increments correctly per line |
| 19.16 | Books mode toggle | In Settings, switch to Per-building; visit TB | Building selector appears with default "All (consolidated)" |
| 19.17 | CSV export | Click Export CSV on Trial Balance | CSV downloads, opens cleanly in Excel, includes all rows |
| 19.18 | Arabic RTL | Switch UI to Arabic; visit JE editor | Line columns mirror correctly; account picker dropdown opens in RTL |
| 19.19 | Imbalance banner | Manually insert one unbalanced line via psql; refresh TB | Red banner at top of Trial Balance |

## 20. Accounting Module (Phase 2)

**Prerequisites:** Phase 1 complete and `FEATURE_ACCOUNTING=true`. Log in as ADMIN.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 20.1 | Run Setup from a clean Phase 1 state | Settings → Accounting → Run Setup | Creates 2 new accounts (2100, 4020), 3 tax codes, 8 mappings. unmappedKeys is empty. |
| 20.2 | Account Mapping page shows all 8 rows mapped | Visit `/accounting/mapping` | All rows show codes; no red banner. |
| 20.3 | Set custom mapping | Click Change on CASH_METHOD, pick a different Asset account, save | Mapping updates; banner clear. |
| 20.4 | Cash payment auto-posts | Create a CASH payment for 1050 on a booking tagged VAT_STANDARD | Payment row shows postedEntryId set. JE has 3 lines (Cash 1050 debit, Revenue 1000 credit, VAT Payable 50 credit). |
| 20.5 | Switch to ACCRUAL mode and create a Booking | Settings → Accrual basis; create new Booking 10500 | Booking has revenuePostedEntryId set; JE shows AR 10500 / Revenue 10000 / VAT 500. |
| 20.6 | Mark an installment PAID in ACCRUAL mode | Mark a PENDING installment as PAID | New JE: Cash debit, AR credit, no VAT (already recognized at booking). |
| 20.7 | Deposit collection auto-posts | Booking with depositAmount=500, status HELD | depositPostedEntryId set; JE Cash debit / Deposit Liability credit. |
| 20.8 | Checkout with full refund (RELEASED) | Checkout with depositRefundAmount === depositAmount | JE Deposit Liability debit / Cash credit. |
| 20.9 | Checkout with zero refund (FORFEITED) | Checkout with depositRefundAmount = 0 | JE Deposit Liability debit / Forfeit Income credit. |
| 20.10 | Checkout with partial refund (FORFEITED) | Checkout with depositRefundAmount = 200 (deposit was 500) | JE 3 lines: Deposit Liability 500 debit / Cash 200 credit / Forfeit Income 300 credit. |
| 20.11 | Reverse a paid payment | On a POSTED payment, click Reverse, confirm | Payment status REVERSED; new JE (reversal of JE-NNNNNN) with swapped lines. Outstanding balance updates. |
| 20.12 | Run Backfill | Settings → Run Backfill (no fromDate) | Summary shows processed > 0. Subsequent run shows processed = 0. |
| 20.13 | VAT Return for current period | Visit `/accounting/vat-return` | Output VAT totals match the sum of VAT_PAYABLE credits in the period. Net VAT Due = Output − Input. |
| 20.14 | Setup is admin-only | Log in as FINANCE; visit Settings → Run Setup | Button is hidden / 403 returned from API. |
| 20.15 | Backfill is admin-only | Log in as FINANCE | Same as above. |
| 20.16 | Posting failure rolls back the operation | Delete REVENUE_DEFAULT mapping; create a CASH+PAID payment | Payment creation returns 400 MAPPING_MISSING; no Payment row left in DB. |
| 20.17 | Arabic RTL | Switch to Arabic; visit mapping and VAT return pages | Layout mirrors correctly. |

## 21. Accounting Module (Phase 3)

**Prerequisites:** Phase 1 + 2 active; `FEATURE_ACCOUNTING=true`; Setup has been run. Log in as ADMIN.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 21.1 | Income statement happy path | Visit `/accounting/income-statement` for the current month after Phase 2 setup + a few posted payments | Income section lists Rental Revenue; total > 0; Net Income > 0 |
| 21.2 | Income statement CSV export | Click Export CSV | Downloads a `.csv` opening cleanly in Excel |
| 21.3 | Balance sheet — balanced | Visit `/accounting/balance-sheet` as-of today | Assets total equals Liabilities + Equity + Current Year Earnings (no red banner) |
| 21.4 | Balance sheet — current year earnings | Compare CYE to the period-to-date net income from Income Statement | They match to the cent |
| 21.5 | Cash flow — reconciles | Visit `/accounting/cash-flow` for the current month | "Ending Cash" equals "Beginning Cash + Net Cash from Operations"; no red banner |
| 21.6 | Add Expense (with VAT) | From JE list, click "+ Add Expense"; pick Utilities Expense, amount 210, VAT_STANDARD, Pay From Cash | JE created with 3 lines (Expense 200 net debit, VAT 10 debit, Cash 210 credit) |
| 21.7 | Add Expense (no VAT) | Same form, tax code "None" | JE has 2 lines (Expense gross debit, Cash gross credit) |
| 21.8 | Add Expense from AP | Pay From = Accounts Payable | JE credits AP instead of Cash |
| 21.9 | Period lock blocks posting | Open Periods; lock current month; try to create any new JE dated today | 400 PERIOD_LOCKED |
| 21.10 | Period unlock restores posting | Unlock the month | New JE succeeds |
| 21.11 | Reverse a manual JE | On a POSTED manual JE detail page, click "Reverse this entry"; confirm | New JE posted dated today with swapped debit/credit; `reversesEntryId` matches original |
| 21.12 | Reverse blocked for PAYMENT_AUTO | Find a payment-auto JE; click Reverse | 400 CANNOT_REVERSE with hint pointing to the payment-specific endpoint |
| 21.13 | Year-end close happy path | Periods page → Close Year YYYY (the previous year if available) | Closing JE posted to Retained Earnings; all 12 months of that year show LOCKED 🔒 |
| 21.14 | Year-end close idempotency | Click Close Year again | 400 ALREADY_CLOSED |
| 21.15 | Year-end close with no activity | Try to close a year with no posted entries | 400 MIN_LINES |
| 21.16 | Statement after year-end close | Balance Sheet as-of Dec 31 of closed year | Retained Earnings absorbs the prior year's net income; Current Year Earnings = 0 if asOf is in the closed year |
| 21.17 | Arabic RTL | Switch to Arabic; visit all 4 new pages | Layout mirrors correctly |

## 22. Accounting Module (Phase 4) — Bank Reconciliation

**Prerequisites:** Phases 1–3 active; `FEATURE_ACCOUNTING=true`. Log in as ADMIN.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 22.1 | Create bank account | Banking page → + New Bank Account; name "Main Checking"; pick Bank (1020) | Created and visible in list |
| 22.2 | Configure CSV mapping | Bank account detail → CSV Mapping tab → Edit; pick columns for date/amount/description; date format DD/MM/YYYY | Mapping persists |
| 22.3 | Preview CSV import | Upload a sample CSV (5 rows) | First rows displayed; nothing persisted |
| 22.4 | Import CSV | Confirm import | Statement + lines persist; line count matches CSV |
| 22.5 | Malformed CSV | Upload a CSV with a bad date | 400 BANK_STATEMENT_INVALID with row number; nothing persisted |
| 22.6 | Start reconciliation | New reconciliation; endDate end-of-month; statementBalance from bank | OPEN reconciliation created |
| 22.7 | Auto-match | Run auto-match button | Exact-amount matches highlighted; count returned |
| 22.8 | Manual N-to-1 | Select 1 bank deposit + N journal lines summing to its amount; click Match | Match persists; lines show as matched |
| 22.9 | Manual match — wrong sum | Select journal lines summing to wrong amount | 400 UNBALANCED |
| 22.10 | Add bank-fee adjustment | Click unmatched bank fee line → Add adjustment → pick Bank Fees expense | JE posts; line matches |
| 22.11 | Adjustment for locked-period bank line | Lock previous month; import statement with bank fee dated in locked month; add adjustment | JE posts in current open period with warning shown |
| 22.12 | Close balanced reconciliation | Match everything; difference 0; Close | Status CLOSED; report snapshot populated |
| 22.13 | Close unbalanced rejected | Leave a bank line unmatched; Close | 400 RECONCILIATION_UNBALANCED with diff |
| 22.14 | Admin reopen | On closed rec, click Reopen | Status OPEN; matches preserved; snapshot cleared |
| 22.15 | Finance cannot reopen | Log in as FINANCE; try to reopen | 403 |
| 22.16 | Delete unmatched statement | Statements tab → Delete an unmatched statement | Succeeds |
| 22.17 | Delete matched statement blocked | Try to delete a statement with matched lines | 400 |
| 22.18 | Arabic RTL | Switch to Arabic; walk all 4 screens | Mirrors correctly |
