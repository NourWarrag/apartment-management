# BRD — Broker Module + Booking CRs

**Date:** 2026-05-17
**Status:** Approved for decomposition into per-item implementation specs
**Scope:** 1 new module (Broker) + 5 Change Requests on existing booking/checkout flows

This document captures the agreed requirements and high-level design for the broker module and five related Change Requests. It is the umbrella BRD; each numbered item below will get its own implementation spec under `docs/superpowers/specs/` when picked up for build, following the same per-phase pattern used for the accounting module.

---

## Build sequence

Approved sequence (small wins first):

1. **CR-5** — `+ New Booking` button on Bookings page
2. **CR-1** — Inline quick-add tenant in booking modal
3. **CR-3** — Booking total → line items
4. **Broker module** — Broker entity, payouts, accounting integration
5. **CR-2** — Broker pickers on Tenant and Apartment pages
6. **CR-4** — Checkout validation checklist + admin override

Dependency map:

```
Broker module ──┬──► CR-2
                └──► CR-4 (commission-confirmed check)

CR-3 ─────────────► CR-4 (per-line "fully paid" check)

CR-1, CR-5 ── independent
```

---

## CR-5 — "+ New Booking" button on Bookings page

**Problem:** `BookingsPage.tsx` has no entry point to create a booking. Today bookings can only be created from the apartments page.

**Requirement:** Add a primary `+ New Booking` button in the page header. It opens the existing `BookingFormModal` with no prefills. The modal already filters apartments to `AVAILABLE` only, so "display available apartments only" is already satisfied by the existing form.

**Scope:** Frontend-only. One component edit. No schema change.

**Acceptance:**
- Bookings page header shows `+ New Booking` button (primary style) for roles `ADMIN`, `SUPER_ADMIN`, `BUILDING_ADMIN`, `RECEPTIONIST`.
- Clicking opens `BookingFormModal` with empty state.
- On successful create, the bookings list refreshes and the new booking is visible.

---

## CR-1 — Inline quick-add tenant in booking modal

**Problem:** Creating a booking requires the tenant to already exist. If a walk-in tenant is being checked in, staff has to navigate to the Tenants page, create the tenant, then return to start the booking.

**Requirement:** In `BookingFormModal`, place a `+` icon button next to the Tenant `<select>`. Clicking opens a small `QuickAddTenantModal` collecting only:

- `fullName` (required)
- `phone` (required)
- `idNumber` (required)

Defaults applied on save: `kycStatus = PENDING`, `tier = NEW`. Full tenant edit (KYC, notes, tier) is done later from the Tenants page — quick-add is intentionally minimal to keep the booking flow fast.

**Backend:** Uses the existing `POST /tenants` endpoint. No new endpoint.

**Acceptance:**
- After creating a tenant via quick-add, the new tenant is auto-selected in the booking form's Tenant dropdown.
- `idNumber` uniqueness (DB-enforced `@unique`) surfaces a 409 as an inline error on the quick-add modal.
- Quick-add is permitted for any role that can create a booking.

---

## CR-3 — Booking total → line items

**Problem:** Today `Booking.totalAmount` is a single Decimal. Invoices show only the total. Revenue posts to a single `RENTAL_REVENUE` account regardless of what the money was for.

**Requirement:** Decompose the booking total into discrete line items: Rent, Service charge, Parking, Cleaning fee, Discount. VAT is computed from the existing `taxCode` field, on a *configurable* set of taxable lines. Discount is treated as **contra-revenue** (separate GL account, debit side) to preserve gross-revenue visibility in reports.

### Schema changes

Add the following columns to the `Booking` model. All Decimal(10, 2).

| Column            | Default | Required | Notes                                  |
|-------------------|---------|----------|----------------------------------------|
| `rentAmount`      | —       | Yes      | Must be > 0                            |
| `serviceCharge`   | 0       | No       |                                        |
| `parkingFee`      | 0       | No       |                                        |
| `cleaningFee`     | 0       | No       |                                        |
| `discountAmount`  | 0       | No       | Subtracted from taxable subtotal       |

`totalAmount` stays. It is now **always recomputed server-side** on create/update:

```
taxableSubtotal = sum of (component × isTaxable)  − discountAmount
vatAmount       = taxableSubtotal × taxCode.ratePct / 100
totalAmount     = rentAmount + serviceCharge + parkingFee + cleaningFee
                  − discountAmount + vatAmount
```

If a client request includes `totalAmount`, the server **ignores it** and uses the computed value.

Add four booleans to `SystemSettings` controlling VAT applicability per component (all default `true`):

- `rentTaxable`
- `serviceChargeTaxable`
- `parkingTaxable`
- `cleaningTaxable`

Admins can toggle from the existing settings page. Discount is always applied to the taxable subtotal.

### Migration

For each existing `Booking` row: set `rentAmount = totalAmount`, all other new columns = 0. Single SQL `UPDATE` in the Prisma migration.

### UX — `BookingFormModal`

Replace the single Total Amount input with a line-item table. All cells are editable inputs except Subtotal / VAT / Total, which are read-only computed values that live-update via `useWatch`. Server is authoritative on submit.

```
Rent              [____]   required
Service charge    [____]   optional, default 0
Parking           [____]   optional, default 0
Cleaning fee      [____]   optional, default 0
Discount          [____]   optional, default 0   (subtracted)
──────────────────────────────────
Subtotal                   (computed)
VAT (X%)                   (auto, from taxCode + SystemSettings flags)
Total                      (computed, read-only, bold)
```

### Invoice — `BookingInvoiceModal`

Update to list each line item as its own row. VAT remains a separate row. Discount appears as a negative row.

### Accounting impact

Today, revenue posting writes a single line to the account mapped by `RENTAL_REVENUE`. After CR-3, revenue posts split into multiple credit lines, one per non-zero component, plus a discount contra-revenue debit line.

Four new `AccountMapping` keys:

- `SERVICE_CHARGE_REVENUE`
- `PARKING_REVENUE`
- `CLEANING_REVENUE`
- `DISCOUNT_CONTRA_REVENUE` *(debit side, contra-revenue account)*

`RENTAL_REVENUE` stays. Until an admin explicitly maps the new keys in settings, they fall back to `RENTAL_REVENUE` so existing behaviour is preserved.

### Test coverage

- Server: total math correctness with/without VAT, with/without discount, with each `*Taxable` flag toggled. Client-supplied `totalAmount` is ignored. Migration backfill is idempotent.
- Posting: revenue JE has the correct number of lines, sum of credits − debits == `totalAmount − vatAmount` (VAT posts separately), discount contra-revenue line debits the right account.
- Client: form math live-updates; submit sends components only.

---

## Broker module

**Problem:** The business uses external referral agents who earn commission on bookings they bring. No system today tracks brokers, commission owed, or payouts.

**Goal:** First-class broker entity modelled as **Broker (company) → Agent (person)**. Brokers carry a default commission rate; agents can optionally override it. Bookings reference both the broker company and the specific agent. Batch payouts are paid to the company (with per-agent attribution in settlement lines) and integrated into the existing accounting module (respecting cash vs accrual mode).

### Schema

Four new models, four new columns on `Booking`, three new enums.

```prisma
model Broker {
  id                     Int             @id @default(autoincrement())
  name                   String                                       // company name
  phone                  String
  email                  String?
  taxRegistrationNumber  String?                                      // TRN if registered for VAT
  address                String?
  notes                  String?
  status                 BrokerStatus    @default(ACTIVE)
  commissionType         CommissionType  @default(PERCENT)
  defaultCommissionValue Decimal         @db.Decimal(10, 2)           // PERCENT: 5.00 = 5%. FLAT: 500.00 = AED 500.

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  createdBy   Int?
  updatedBy   Int?
  deletedBy   Int?

  agents     BrokerAgent[]
  bookings   Booking[]
  payouts    BrokerPayout[]
  // standard audit relations to User
}

model BrokerAgent {
  id                     Int                 @id @default(autoincrement())
  brokerId               Int
  fullName               String
  phone                  String
  email                  String?
  idNumber               String?
  notes                  String?
  status                 BrokerAgentStatus   @default(ACTIVE)
  // Optional override of the broker's default rate. NULL = use broker's default.
  commissionType         CommissionType?
  commissionValueOverride Decimal?           @db.Decimal(10, 2)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  createdBy   Int?
  updatedBy   Int?
  deletedBy   Int?

  broker     Broker     @relation(fields: [brokerId], references: [id], onDelete: Restrict)
  bookings   Booking[]
  tenants    Tenant[]   // tenants who have this agent set as default

  @@index([brokerId, status])
}

model BrokerPayout {
  id              Int           @id @default(autoincrement())
  brokerId        Int                                              // payout is to the COMPANY
  periodStart     DateTime
  periodEnd       DateTime
  totalAmount     Decimal       @db.Decimal(10, 2)
  method          PaymentMethod
  referenceNumber String?
  paidAt          DateTime
  notes           String?
  postedEntryId   Int?

  broker          Broker         @relation(fields: [brokerId], references: [id], onDelete: Restrict)
  postedEntry     JournalEntry?  @relation("BrokerPayoutPostedEntry", fields: [postedEntryId], references: [id], onDelete: SetNull)
  settlements     BrokerPayoutSettlement[]

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  createdBy   Int?
  updatedBy   Int?
}

model BrokerPayoutSettlement {
  id          Int          @id @default(autoincrement())
  payoutId    Int
  bookingId   Int          @unique           // a booking's commission can only be settled once
  agentId     Int?                           // attribution snapshot; nullable for resilience if agent later deleted
  amount      Decimal      @db.Decimal(10, 2)

  payout      BrokerPayout  @relation(fields: [payoutId], references: [id], onDelete: Cascade)
  booking     Booking       @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  agent       BrokerAgent?  @relation(fields: [agentId], references: [id], onDelete: SetNull)

  @@index([payoutId])
  @@index([agentId])
}

// Booking additions
model Booking {
  // ... existing fields ...
  brokerId                  Int?              // company (denormalised)
  agentId                   Int?              // specific person who referred this booking
  commissionType            CommissionType?
  commissionAmount          Decimal?       @db.Decimal(10, 2)
  commissionAccrualEntryId  Int?

  broker                    Broker?        @relation(fields: [brokerId], references: [id], onDelete: SetNull)
  agent                     BrokerAgent?   @relation(fields: [agentId], references: [id], onDelete: SetNull)
  commissionAccrualEntry    JournalEntry?  @relation("BookingCommissionAccrual", fields: [commissionAccrualEntryId], references: [id], onDelete: SetNull)
  brokerSettlement          BrokerPayoutSettlement?
}

enum BrokerStatus       { ACTIVE INACTIVE }
enum BrokerAgentStatus  { ACTIVE INACTIVE }
enum CommissionType     { PERCENT FLAT }
```

### Booking invariants (server-enforced)

- If `agentId IS NOT NULL` then `brokerId` MUST equal `agent.brokerId`. Enforced on every create/update; mismatched payload returns 422.
- `agentId` may be NULL while `brokerId` is set (rare — e.g. company-level referral with no named contact), but `brokerId` MUST be set whenever `agentId` is set.
- Both NULL means no broker on this booking.

### Commission lifecycle

| State        | Condition                                                                       |
|--------------|---------------------------------------------------------------------------------|
| `NONE`       | `brokerId IS NULL` AND `agentId IS NULL` (no referral on this booking)          |
| `OWED`       | `commissionAmount` set, accrual posted (ACCRUAL mode) OR cash-mode pre-payout, no settlement row |
| `PAID`       | A `BrokerPayoutSettlement` row exists for this booking                          |
| `CANCELLED`  | (Future) booking voided, commission accrual reversed                            |

### Commission auto-computation

When a booking is created with an agent, the server resolves the effective rate in this order:

1. If `agent.commissionType` AND `agent.commissionValueOverride` are both set → use the agent's override.
2. Otherwise → use the broker company's `commissionType` + `defaultCommissionValue`.

Then it pre-fills `commissionType` and `commissionAmount` on the booking:

- `PERCENT`: `commissionAmount = round(totalAmount × effectiveValue / 100, 2)`
- `FLAT`: `commissionAmount = effectiveValue`

If the booking has `brokerId` set but no `agentId`, the broker's default is used directly.

Staff may override `commissionAmount` on the booking form. Override does **not** change `commissionType` semantics — it's a final-amount edit.

### Accounting integration

Behaviour depends on `SystemSettings.accountingMode`:

**ACCRUAL mode:**
- Booking creation with broker → post **accrual JE** automatically:
  - Dr `BROKER_COMMISSION_EXPENSE` (mapped account)
  - Cr `BROKERS_PAYABLE` (mapped account)
- Stored on `Booking.commissionAccrualEntryId`.
- Payout creation → post **settlement JE**:
  - Dr `BROKERS_PAYABLE`
  - Cr Cash/Bank (resolved from payout method via existing mapping)
- Stored on `BrokerPayout.postedEntryId`.

**CASH mode:**
- Booking creation does **not** post any accrual.
- Payout creation posts a single JE:
  - Dr `BROKER_COMMISSION_EXPENSE`
  - Cr Cash/Bank

Two new `AccountMapping` keys are required and must be seeded in the broker migration with sensible chart-of-accounts defaults:

- `BROKER_COMMISSION_EXPENSE` (Expense)
- `BROKERS_PAYABLE` (Liability)

Admin can remap from the existing settings/mapping UI.

### Soft-delete rules

A `Broker` (company) cannot be soft-deleted while:

- Any active agent under this company is still `ACTIVE`, OR
- Any active booking references this broker AND has commission `OWED`, OR
- Any non-reversed payout exists.

Recommended path: deactivate all agents → settle/reverse all owed commission → then soft-delete the company.

A `BrokerAgent` cannot be soft-deleted while any active booking references it with commission `OWED`. Otherwise, soft-deleting an agent sets `Booking.agentId = NULL` via `onDelete: SetNull` (historical bookings keep `brokerId` so the company link survives — this is the reason for the denormalised `brokerId` on Booking). Settlement attribution (`BrokerPayoutSettlement.agentId`) also becomes NULL but the company-level payout total is preserved.

A `Booking` cannot be soft-deleted while its `commissionAccrualEntryId` is set and no settlement exists (commission is `OWED`). The 409 error message instructs the user to first reverse the accrual via the existing reversal flow, or settle via payout.

### Backend — routes

```
# Brokers (companies)
GET    /brokers                              list + filters (search, status, sortBy)
POST   /brokers                              create
GET    /brokers/:id                          detail + agent count + bookings summary + commission owed
PATCH  /brokers/:id                          update
DELETE /brokers/:id                          soft delete (blocked per rules above)

# Agents (nested under broker)
GET    /brokers/:brokerId/agents             list agents for a broker
POST   /brokers/:brokerId/agents             create agent under this broker
GET    /agents/:id                           agent detail + their bookings + commission attributed
PATCH  /agents/:id                           update (incl. status, rate override)
DELETE /agents/:id                           soft delete (blocked per rules above)

# Search / picker support (cross-company)
GET    /agents?search=...                    flat agent search across companies, grouped in response by broker
                                              (for the booking-form selector)

# Payouts (per broker company)
GET    /broker-payouts                       list, filter by broker / period
POST   /broker-payouts                       create — body: { brokerId, bookingIds[], method, ref, paidAt, notes }
                                              server: validates every booking.brokerId === brokerId,
                                              computes totalAmount from each booking's commissionAmount,
                                              snapshots each booking's agentId onto the settlement row,
                                              creates BrokerPayout + BrokerPayoutSettlement rows in a transaction,
                                              posts settlement JE
GET    /broker-payouts/:id                   detail incl. per-agent attribution subtotals
POST   /broker-payouts/:id/reverse           (admin) reverse — voids GL entry,
                                              deletes settlement rows, reverts bookings to OWED
```

### Frontend

- New top-level page: `BrokersPage.tsx` — list of broker **companies** with search/filter, summary stats (Active brokers, Total agents, Total Owed, Paid YTD).
- `BrokerDetailPage.tsx` — broker company info, tabs for:
  - **Agents** — list of agents under this company with status + rate override; `+ Add Agent` action.
  - **Bookings** — all bookings referencing this broker, with commission status and which agent earned it.
  - **Payouts** — list of past payouts to this company, with `Create Payout` action.
- `BrokerFormModal.tsx` — create/edit broker company.
- `BrokerAgentFormModal.tsx` — create/edit agent (always opened in the context of a specific broker; the broker FK is pre-set and not user-editable).
- `BrokerPayoutModal.tsx` — select unsettled bookings for this broker company (across all its agents); computes total, captures method/ref/paidAt/notes; displays per-agent attribution subtotal as the user selects bookings.
- `<BrokerAgentSelector />` reusable component — used in `BookingFormModal` and on tenant/apartment pages. Hierarchical: search across all active agents, grouped by broker company in the dropdown. On selection, both `brokerId` and `agentId` are populated. Also supports `+ New broker` (opens `BrokerFormModal`) and `+ New agent under <company>` (opens `BrokerAgentFormModal` pre-filled with the selected company).
- Sidebar nav entry: **Brokers** (between Tenants and Bookings). No separate "Agents" nav — agents are always navigated to via their parent broker.

### RBAC

- `ADMIN`, `SUPER_ADMIN`, `FINANCE`: full broker + agent + payout management.
- `BUILDING_ADMIN`, `RECEPTIONIST`: read-only on brokers and agents, can select a broker/agent when creating a booking. Cannot create payouts.

### Test coverage

- Server: broker + agent CRUD; agent must belong to the broker via FK; soft-delete blocks (company while agents active, agent while OWED commission, booking while OWED); commission auto-computation resolves agent override before broker default for both PERCENT and FLAT; booking invariant rejects `agent.brokerId !== booking.brokerId`; accrual JE posted with right accounts in ACCRUAL mode and *not* posted in CASH mode; payout JE balances; payout reversal restores OWED; settlement uniqueness enforced; settlement `agentId` snapshot survives later agent deletion (becomes NULL but payout total intact).
- Client: broker list rendering; broker-detail tabs (agents/bookings/payouts) load correctly; agent form modal pre-fills broker FK from URL context; payout modal selection math + per-agent attribution display; `<BrokerAgentSelector />` populates both broker and agent on selection and honours hierarchy in the dropdown.

---

## CR-2 — Broker pickers on Tenant and Apartment pages

**Problem:** Once the broker module exists, staff need easy ways to (a) attach a default broker to a tenant for repeat referrals, and (b) reach the broker module from contextual pages.

### Tenant page

Add an optional `defaultAgentId Int?` FK on the `Tenant` model (specific agent, not just a company — picking a company without a person tells you very little, and the company is derivable from the agent).

- Nullable. Most tenants will have no default.
- When a booking is started for a tenant with a `defaultAgentId`, `BookingFormModal` pre-fills both the broker company and the agent in `<BrokerAgentSelector />` (still overrideable).
- `onDelete: SetNull`: if the agent is soft-deleted later, the tenant default silently becomes null — no orphan refs.
- UI: new "Default agent" row in the tenant info panel showing the agent + their company (or "None"), with a `Change` button opening the reusable `<BrokerAgentSelector />`.
- Tenants list page: add a "Default broker" column (sortable, optional) — shows the company name for compactness.

### Apartment page

No FK on `Apartment`. Broker is a per-booking referral relationship, not an apartment attribute.

The apartment page gets the same `<BrokerAgentSelector />` widget in its actions area for **convenience only**: selecting an agent navigates to that agent's detail page; selecting just a company (no agent) navigates to the company; `+ New broker` opens the broker form. Nothing is persisted on the apartment.

> **Design divergence flagged:** if the business needs a broker that *represents the apartment owner* (different concept from a booking referrer), that would require a separate `ownerAgentId` on `Apartment` and is out of scope for this BRD.

### Shared component — `<BrokerAgentSelector />`

The same component is used in `BookingFormModal`, on the Tenant page, and on the Apartment page. Modes:

- **Pick existing** — searchable dropdown listing active agents grouped under their broker company.
- **+ New agent under existing broker** — opens `BrokerAgentFormModal` pre-filled with the chosen company.
- **+ New broker** — opens `BrokerFormModal`; on save the new broker becomes selected (no agent yet) and the user can immediately add an agent under it.

On any selection that includes an agent, both `brokerId` and `agentId` are written to the consuming form's state. The component never lets the consumer end up with a mismatched (broker, agent) pair.

### Test coverage

- Server: setting / clearing `defaultAgentId` on a tenant; deleted agent references gracefully become null via `onDelete: SetNull`; booking-form pre-fill resolves both `brokerId` and `agentId` from the tenant default.
- Client: tenant page picker round-trip; booking modal pre-fills broker + agent from tenant default; selector never produces a mismatched (broker, agent) pair; clearing override still saves the booking.

---

## CR-4 — Checkout validation checklist + admin override

**Problem:** Checkout today only validates the deposit refund. Bookings can be checked out while still owing money, with open maintenance tickets, or with unconfirmed commission, leaving the books in an unclear state.

### Readiness endpoint

```
GET /bookings/:id/checkout-readiness
→ {
    fullyPaid:          { ok: boolean, owed: Decimal, paid: Decimal },
    depositDecided:     { ok: boolean },
    noOpenTickets:      { ok: boolean, openCount: number },
    commissionConfirmed:{ ok: boolean, status: 'NONE'|'OWED'|'PAID' }
  }
```

Logic per item:

- **fullyPaid:** `SUM(Payment.amount WHERE status = PAID AND bookingId = :id) == Booking.totalAmount`. After CR-3 this naturally covers all line items + VAT.
- **depositDecided:** `depositStatus != HELD`, OR `HELD` with the checkout form's `depositRefundAmount` field filled in this submission.
- **noOpenTickets:** `COUNT(MaintenanceTicket WHERE apartmentId = booking.apartmentId AND status IN (OPEN, IN_PROGRESS)) == 0`.
- **commissionConfirmed:** `brokerId IS NULL`, OR `commissionAmount IS NOT NULL`.

### UI — `CheckoutModal`

Above the existing deposit refund input, render a 4-row checklist with green-check / red-x per item. Each row is clickable, deep-linking to the place the issue is fixed (payments page filtered to this booking, tickets list filtered to this apartment, etc.).

`Confirm Checkout` is disabled if any item is red.

### Override flow

Approved policy: **explicit override only**.

Beneath the disabled button, an `ADMIN` / `SUPER_ADMIN` user sees a `Force checkout (admin)` link. Clicking reveals a required `reason` textarea (min 10 chars). On submit:

- Server re-checks role (defence in depth).
- Checkout proceeds.
- An `AuditLog` row is written with `action: 'FORCE_CHECKOUT'`, `metadata: { reason, failedChecks: [...] }`.
- Booking detail and audit log surface the override permanently.

`RECEPTIONIST` and `BUILDING_ADMIN` never see the override option and must resolve failing items first.

### Test coverage

- Server: readiness endpoint returns correct booleans across permutations (fully paid no broker; partly paid with broker; open ticket; broker without commission); force checkout requires admin + reason; force checkout writes audit log with reason and failed-checks list.
- Client: checklist renders correctly; disabled button respects readiness; override section only appears for admin roles.

---

## Open questions / future scope

Items deliberately **not** in scope for this BRD; flagged here so they don't leak into implementation specs:

- **Owner agent on apartment** (different from booking referrer) — separate future scope.
- **Multi-broker per booking with split commission** — explicitly chosen against (one broker, one agent per booking).
- **Multi-company agent** — an agent belongs to exactly one broker company. Moving an agent between companies is a delete + recreate.
- **Tiered commission rates** (e.g. higher % above N bookings) — not in v1; modelled later via rate updates.
- **Per-agent payouts** — payouts are to the company; per-agent visibility is via `BrokerPayoutSettlement.agentId` attribution, not separate payout records.
- **Commission reversal on booking cancellation/void flow** — accrual reversal mechanism exists per accounting phase 2; explicit "cancel booking" UX is a separate CR.
- **Calendar/availability view on bookings page** — considered for CR-5, rejected as too large.

---

## Next steps

1. Each numbered item above will get its own implementation spec under `docs/superpowers/specs/`, then a plan under `docs/superpowers/plans/`, then implementation.
2. Recommended first pick-up: **CR-5** — smallest, no dependencies, validates the BRD-to-spec flow on a tiny item before tackling broker module.
