# Business Requirements Document (BRD)
# Hotel Apartment Management System

**Version:** 2.2 — Updated 2026-05-17 — Accounting module Phase 2 (auto-posting, VAT, deposits, reversal, backfill)

---

## 1. Project Overview

A web-based Hotel Apartment Management System for managing apartment operations, occupancy monitoring, tenant management, payment collection, maintenance requests, and financial reporting. The system is role-based and supports multiple buildings.

**Tech stack:** React 18 + TypeScript (client), Node.js + Express + Prisma + PostgreSQL (server), JWT authentication.

---

## 2. Business Objectives

- Monitor hotel apartment occupancy and tenant details in real time
- Manage bookings, check-ins, and check-outs with security deposit tracking
- Collect and track payments across multiple methods (cash, card, bank transfer, installment)
- Manage maintenance tickets from creation through resolution
- Generate revenue, occupancy, outstanding balance, and maintenance reports
- Support multi-building operations with per-building access control
- Provide role-based access to restrict functionality by staff type

---

## 3. Scope

### In Scope

- Apartment management (CRUD, status, floor/building assignment)
- Tenant/customer management with identification and contact records
- Booking management (check-in/check-out, security deposits, booking status lifecycle)
- Payment management (cash, card, bank transfer, installment plans, pending balances)
- PDF receipt and booking invoice generation (in-browser)
- File attachments on apartments, tenants, bookings, and maintenance tickets
- Maintenance ticket system with priority, type, assignment, and status tracking
- Reporting suite: Revenue, Occupancy, Outstanding Balances, Maintenance, Buildings — with date range filtering, CSV export, and print-to-PDF
- Dashboard with live stats and revenue trend chart
- Multi-building support with building-level access control
- User/staff management with role assignment
- Feature flag system for enabling/disabling modules per environment
- Audit timestamps (createdAt, updatedAt) and soft deletes on key entities

### Out of Scope

- Online tenant self-service portal
- External payment gateway integration
- Payroll or HR management
- Inventory management
- Email delivery of reports
- Scheduled/automated report generation

---

## 4. Functional Requirements

### 4.1 Dashboard

- Summary cards: Total Apartments, Occupied, Available, Pending Installments, Open Maintenance Tickets
- Revenue trend chart (7-day and 30-day views)
- Recent activity feed

### 4.2 Apartment Management

- Add, edit, and soft-delete apartments
- Fields: number, floor, building, type, area, rent amount, status, description
- Status values: Available, Occupied, Under Maintenance, Reserved, Cleaning In Progress, Pending Checkout
- File attachments (photos, documents) per apartment
- Per-building filtering

### 4.3 Tenant Management

- Register tenant details: full name, phone, email, ID/passport number, nationality
- View tenant booking and payment history
- File attachments per tenant

### 4.4 Booking Management

- Create bookings linking a tenant to an apartment for a date range
- Track check-in and check-out dates
- Security deposit recording and release on checkout
- Booking status lifecycle: ACTIVE → CHECKED_OUT / CANCELLED
- File attachments and PDF invoice generation per booking

### 4.5 Payment Management

- Record payments against bookings: CASH, CARD, BANK_TRANSFER, INSTALLMENT
- Installment plan support: create multiple scheduled payments per booking
- Track payment status: PENDING, PAID, OVERDUE, CANCELLED
- Outstanding balance calculation per tenant
- PDF receipt generation per payment
- Payment history with filtering by date, method, and status

### 4.6 Maintenance Ticket System

- Create tickets linked to an apartment with description, priority, and type
- Ticket types: MAINTENANCE, CLEANING, INSPECTION, REPAIR, OTHER
- Priority levels: LOW, MEDIUM, HIGH, URGENT
- Status lifecycle: OPEN → IN_PROGRESS → COMPLETED → CLOSED
- Assign tickets to maintenance staff; staff can update status/notes on their own tickets
- Kanban and list view; metrics (open count, avg resolution time)
- File attachments per ticket

### 4.7 Reporting

All reports support optional date range filtering (start/end date) and CSV download. Print-to-PDF via browser print.

- **Revenue:** Total revenue, breakdown by payment method, breakdown by month
- **Occupancy:** Monthly occupied vs. total apartments with occupancy rate (color-coded)
- **Outstanding Balances:** Pending payments grouped by tenant, sorted by amount
- **Maintenance:** Ticket counts by status and by type
- **Buildings:** Per-building summary — apartments, occupancy, monthly revenue, open tickets

### 4.8 Multi-Building Support

- Buildings management (add/edit/delete buildings)
- Apartments, bookings, and tickets are scoped to buildings
- Per-building access control for RECEPTIONIST role
- Building selector in top navigation filters visible data

### 4.9 User & Staff Management

- CRUD for system users
- Role assignment: ADMIN, RECEPTIONIST, FINANCE, MAINTENANCE
- Staff status tracking for maintenance personnel
- Ticket assignment limited to MAINTENANCE-role users

### 4.10 Accounting Module (Phase 1)

- Chart of Accounts: CRUD with five account types (Asset, Liability, Equity, Income, Expense), optional self-referential parent for hierarchy. Accounts with journal activity cannot be deleted — they are deactivated instead.
- Manual journal entries with DRAFT and POSTED states. Posted entries are immutable; corrections require a reversing entry (workflow shipped in a later phase).
- Balance invariant: every posted entry must have ≥2 lines where `Σ debits = Σ credits` to the cent. Enforced by `PostingService` and a Postgres CHECK constraint on `JournalLine`.
- Journal entry numbers are monotonic (`JE-000001`); gaps from rolled-back transactions are expected and never reused.
- Building tag at both entry-header and line level; line-level wins at read time.
- General Ledger view per account with opening/closing balances and running balance. CSV export.
- Trial Balance grouped by account type with grand totals and an imbalance alarm banner. CSV export.
- `booksMode` setting (`CONSOLIDATED` default, `PER_BUILDING`) toggles report defaults; does not change data shape.

Auto-posting from operations, VAT, financial statements, period locking, and bank reconciliation are scoped to Phases 2–4.

### 4.11 Accounting Module (Phase 2)

- **Auto-posting** of Payments and Bookings to the GL via PostingService. Trigger semantics are configurable via the `accountingMode` setting:
  - **CASH (default):** A Payment becoming PAID posts a JE (Cash/Bank debit, Revenue net credit, VAT credit if applicable).
  - **ACCRUAL:** Booking creation posts AR/Revenue/VAT. A Payment becoming PAID clears AR.
- **VAT (tax-inclusive)** with banker's rounding. Each Booking carries a `taxCodeId` defaulting to the system default. Tax codes seeded: `VAT_STANDARD` (5%, default), `VAT_ZERO`, `VAT_EXEMPT`.
- **Account mapping** in a dedicated `AccountMapping` table: 8 keys (CASH_METHOD, CARD_METHOD, INSTALLMENT_METHOD, AR_DEFAULT, REVENUE_DEFAULT, DEPOSIT_LIABILITY, DEPOSIT_FORFEIT_INCOME, VAT_PAYABLE). Editable via Account Mapping page.
- **Deposit lifecycle** auto-posted on transitions: NONE→HELD (collect), HELD→RELEASED (full refund), HELD→FORFEITED (partial or zero refund — splits cash refund and forfeit income).
- **Payment reversal**: a `REVERSED` PaymentStatus + a balancing JE referencing the original.
- **Backfill tool** to retroactively post historical Payments and Bookings.
- **VAT return report** grouping output and input VAT by tax code over a period; CSV export.

Posting calls participate in the parent transaction so operational write and GL entry are atomic. Period close and reversal of manual JEs are scoped to Phase 3.

---

## 5. User Roles

| Role | Access |
|------|--------|
| **ADMIN** | Full system access — all modules, user management, reports, configuration |
| **RECEPTIONIST** | Apartments, tenants, bookings, payments, maintenance tickets (own building) |
| **FINANCE** | Payments, reports (read-only financial view) |
| **MAINTENANCE** | View and update own assigned maintenance tickets only |

**Accounting module access:** ADMIN, SUPER_ADMIN, and FINANCE have full access to the Accounting module (Chart of Accounts, journal entries, general ledger, trial balance). All other roles have no access.

---

## 6. Feature Flags

Modules can be enabled/disabled per environment via server-side feature flags (`FEATURE_<NAME>=true` env var):

| Flag | Module |
|------|--------|
| `FEATURE_BOOKINGS` | Bookings page and API |
| `FEATURE_PAYMENTS` | Payments page and API |
| `FEATURE_TICKETS` | Maintenance tickets page and API |
| `FEATURE_STAFF` | Staff management UI |
| `FEATURE_REPORTS` | Reports page and API |
| `FEATURE_MULTI_BUILDING` | Buildings management and per-building filtering |
| `FEATURE_ACCOUNTING` | Accounting module (Phase 1) — Chart of Accounts, journal entries, general ledger, trial balance |

---

## 7. Non-Functional Requirements

- **Authentication:** JWT-based, 7-day expiry
- **Authorization:** Role-based access control enforced on all API routes
- **Security:** Parameterized queries via Prisma (no SQL injection), input validation on all endpoints
- **Performance:** Aggregate queries used for reports; no pagination required on report views
- **Availability:** Stateless server suitable for 24/7 operation
- **Audit:** createdAt/updatedAt timestamps on all entities; soft delete (deletedAt) on apartments
- **Internationalisation:** English and Arabic UI (RTL layout support via Tailwind)

---

## 8. Success Criteria

- All apartments visible and filterable in real time
- Payments accurately tracked with outstanding balance visibility
- Maintenance tickets managed end-to-end with staff assignment
- Financial and occupancy reports generated on demand with date filtering
- Role-based access enforced — each role sees only what it should
