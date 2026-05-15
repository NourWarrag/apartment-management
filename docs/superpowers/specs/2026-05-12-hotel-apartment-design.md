# Hotel Apartment Management System — Design Spec

**Date:** 2026-05-12  
**Status:** Approved  
**Stack:** React + Vite · Node.js + Express · PostgreSQL · Prisma ORM

---

## 1. Project Overview

A web-based Hotel Apartment Management System to manage apartment occupancy, tenant records, payments (cash/card/installment), maintenance tickets, and revenue reporting. Designed for internal staff use only — no public-facing portal.

**Currency:** AED  
**Languages:** English and Arabic (bilingual, with RTL support)  
**Deployment:** Portable — runs on local server or cloud (no environment-specific dependencies)

---

## 2. Architecture

### Monorepo Structure

```
/hotel-admin
  /client          ← React + Vite + Tailwind CSS
  /server          ← Express + Prisma + PostgreSQL
  /shared          ← Shared TypeScript types (DTOs, enums)
```

### Server Structure

```
/server
  /routes          ← One file per module (apartments, tenants, payments, tickets, reports, auth)
  /controllers     ← Business logic per route
  /middleware      ← auth.middleware.ts, role.middleware.ts
  /prisma          ← schema.prisma + migrations
```

### Client Structure

```
/client/src
  /pages           ← One folder per module
  /components      ← Shared UI components (Button, Table, Modal, Badge, StatCard)
  /hooks           ← React Query hooks per module
  /store           ← Zustand slices (UI state only — sidebar collapse, locale)
  /i18n            ← en/translation.json + ar/translation.json
  /lib             ← axios instance, React Query client setup
```

### Request Flow

```
React page → React Query hook → Axios → Express route → Controller → Prisma → PostgreSQL
```

### Auth Flow

Login → JWT issued → stored in `httpOnly` cookie → `auth.middleware` validates on every protected route → `role.middleware` enforces per-role access.

---

## 3. Data Models

```prisma
model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  password  String   // bcrypt hashed
  role      Role
  createdAt DateTime @default(now())
  tickets   MaintenanceTicket[]
}

model Apartment {
  id       Int             @id @default(autoincrement())
  number   String          @unique
  floor    Int
  status   ApartmentStatus
  bookings Booking[]
  tickets  MaintenanceTicket[]
}

model Tenant {
  id        Int       @id @default(autoincrement())
  fullName  String
  phone     String
  idNumber  String    @unique
  bookings  Booking[]
  createdAt DateTime  @default(now())
}

model Booking {
  id          Int       @id @default(autoincrement())
  apartmentId Int
  tenantId    Int
  checkIn     DateTime
  checkOut    DateTime
  totalAmount Decimal
  apartment   Apartment @relation(fields: [apartmentId], references: [id])
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  payments    Payment[]
  createdAt   DateTime  @default(now())
}

model Payment {
  id              Int           @id @default(autoincrement())
  bookingId       Int
  method          PaymentMethod
  amount          Decimal
  status          PaymentStatus
  referenceNumber String?       // card payments only
  paidAt          DateTime?
  booking         Booking       @relation(fields: [bookingId], references: [id])
  createdAt       DateTime      @default(now())
}

model MaintenanceTicket {
  id           Int          @id @default(autoincrement())
  apartmentId  Int
  description  String
  priority     Priority
  status       TicketStatus
  assignedToId Int?
  notes        String?
  apartment    Apartment    @relation(fields: [apartmentId], references: [id])
  assignedTo   User?        @relation(fields: [assignedToId], references: [id])
  createdAt    DateTime     @default(now())
  resolvedAt   DateTime?
}

enum Role               { ADMIN RECEPTIONIST MAINTENANCE FINANCE }
enum ApartmentStatus    { AVAILABLE OCCUPIED MAINTENANCE RESERVED CLEANING PENDING_CHECKOUT }
enum PaymentMethod      { CASH CARD INSTALLMENT }
enum PaymentStatus      { PAID PENDING FAILED }
enum Priority           { LOW MEDIUM HIGH }
enum TicketStatus       { OPEN IN_PROGRESS COMPLETED CLOSED }
```

---

## 4. User Roles & Access Control

| Role | Access |
|---|---|
| ADMIN | All modules + user management |
| RECEPTIONIST | Dashboard, Apartments, Tenants, Payments |
| MAINTENANCE | Tickets (own assigned tickets only) |
| FINANCE | Payments (read-only), Reports |

- JWT stored in `httpOnly` cookie (XSS protection — not localStorage)
- React Router protected routes via `<ProtectedRoute allowedRoles={[...]} />`
- Server middleware validates JWT and role on every API call
- Login page (`/login`) is the only public route
- Role-based redirect after login: Admin/Receptionist → Dashboard · Maintenance → Tickets · Finance → Reports

---

## 5. Modules & Pages

### Dashboard (`/dashboard`)
- Stat cards: Total Apartments, Occupied, Available, Today's Revenue (AED), Pending Installments, Open Tickets
- Weekly Revenue bar chart (7-day, Recharts)
- Occupancy donut chart (Recharts)
- Recent payments table (last 10 entries)
- Apartment status mini-grid (color-coded by status)

### Apartment Monitoring (`/apartments`, `/apartments/:id`)
- Filterable list by status; search by apartment number
- Detail view: current booking, payment status, maintenance history, status change
- Add/edit apartment form (number, floor, status)

### Tenant Management (`/tenants`, `/tenants/:id`)
- Searchable list (name, phone, ID number)
- Detail view: personal info, full booking history, payment history
- Add/edit tenant form

### Payment Management (`/payments`, `/payments/new`, `/payments/:id`)
- List filterable by method, status, date range
- New payment form: select booking → method → amount → generate receipt
- Printable AED receipt (bilingual header EN/AR, receipt number, tenant, apartment, period, method, total, PAID stamp) — generated via `window.print()` with a `@media print` CSS stylesheet; no external PDF library needed
- Installment tracker: installments are individual `Payment` records with `method: INSTALLMENT` — the receptionist creates one Payment record per installment; the tracker shows all installments for a booking with paid/pending status and outstanding balance (totalAmount minus sum of PAID installments)

### Maintenance Tickets (`/tickets`, `/tickets/new`, `/tickets/:id`)
- List filterable by status, priority, apartment
- New ticket form: apartment, description, priority
- Detail: status updates, assign to maintenance staff, add notes, close ticket
- Maintenance staff see only their assigned tickets

### Reports (`/reports`)
- **Daily Revenue tab:** Cash + Card + Installment totals, Total daily revenue, Outstanding balances, Occupied/Available counts, date picker, Export PDF
- **Monthly Revenue tab:** Month-over-month revenue chart
- **Payment Collection tab:** Payments grouped by method and status
- **Maintenance Activity tab:** Tickets by status, average resolution time
- **Occupancy tab:** Occupancy rate over time
- **Apartment Daily Status Report:** Full table (Apt No., Status, Tenant, Check-in, Check-out, Payment Status, Maintenance Status) — printable

---

## 6. Frontend Design

### Theme: Warm & Hospitality
- **Primary:** `#b45309` (amber-700) — buttons, active states, headings
- **Dark sidebar:** `#78350f` (amber-900)
- **Top bar:** `#92400e` (amber-800)
- **Background:** `#fffbf5` (warm off-white)
- **Success/Available:** `#065f46` (green-800) on `#ecfdf5`
- **Warning/Pending:** `#c2410c` (orange-700) on `#fff7ed`
- **Danger/Maintenance:** `#b91c1c` (red-700) on `#fef2f2`
- **Card borders:** `#fde68a` (amber-200)

### Layout: Top Bar + Collapsed Sidebar
- Top bar: logo/brand, language switcher (EN | عر), notification bell, user menu
- Left sidebar: icon-only (52px wide), expands to full labels on hover
- Main content area fills remaining space

### Icons
- Library: **Lucide React** — no emojis in UI

### Charts
- Library: **Recharts** — BarChart (weekly revenue), PieChart/RadialBar (occupancy donut)

### i18n / RTL
- Library: `react-i18next`
- Language toggle switches `<html lang>` and `dir` attribute (`ltr` ↔ `rtl`)
- Tailwind CSS `[dir="rtl"]` variant handles layout mirroring
- Sidebar icons stay centered in both directions

---

## 7. API Design

All endpoints are prefixed `/api/v1`. Auth required on all except `/api/v1/auth/login`.

| Method | Endpoint | Role |
|---|---|---|
| POST | `/auth/login` | Public |
| GET/POST | `/apartments` | Admin, Receptionist |
| GET/PUT | `/apartments/:id` | Admin, Receptionist |
| GET/POST | `/tenants` | Admin, Receptionist |
| GET/PUT | `/tenants/:id` | Admin, Receptionist |
| GET/POST | `/payments` | Admin, Receptionist, Finance (GET) |
| GET | `/payments/:id` | Admin, Receptionist, Finance |
| GET/POST | `/tickets` | Admin, Receptionist, Maintenance (filtered by role) |
| PUT | `/tickets/:id` | Admin, Receptionist, Maintenance |
| GET | `/reports/daily` | Admin, Finance |
| GET | `/reports/monthly` | Admin, Finance |
| GET | `/reports/payments` | Admin, Finance |
| GET | `/reports/maintenance` | Admin, Finance |
| GET | `/reports/occupancy` | Admin, Finance |
| GET/POST/PUT | `/users` | Admin only |

---

## 8. Error Handling & Validation

- **Forms:** `react-hook-form` + `zod` schemas (defined in `/shared`, reused on client and server)
- **API errors:** React Query `onError` → `react-hot-toast` notifications
- **Server error format:** `{ message: string, field?: string }` — field errors map to form inputs
- **HTTP status codes:** 400 validation · 401 unauthenticated · 403 forbidden · 404 not found · 500 server error

---

## 9. Audit & Logging

- All payment transactions logged with timestamp, amount, method, user who recorded it
- All ticket status changes logged with timestamp and user
- Prisma middleware used for audit log writes (non-blocking)
- `AuditLog` model: `{ id, entity (PAYMENT|TICKET), entityId, action, userId, metadata Json, createdAt }` — append-only, never updated or deleted

---

## 10. Non-Functional Requirements

- **Security:** `httpOnly` JWT cookies, bcrypt passwords, role middleware on all routes, parameterized queries via Prisma (no SQL injection)
- **Performance:** React Query caching reduces redundant API calls; paginated tables (25 rows default)
- **Availability:** Stateless server — deployable behind any reverse proxy (Nginx, Caddy)
- **Portability:** `.env`-driven config (DB URL, JWT secret, port) — works on local or cloud
