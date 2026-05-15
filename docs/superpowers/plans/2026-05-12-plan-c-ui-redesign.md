# Plan C: UI Redesign — Apartments & Tenants Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild ApartmentsPage and TenantsPage to match the reference designs in `designs/apartment.html` and `designs/tenant.html` exactly — including stat widgets, redesigned table columns, filters, pagination, upcoming transitions panel, and the tenant drill-down panel.

**Architecture:** All data is already available via existing hooks (`useApartments`, `useTenants`, `useTenant`). Stats and pagination are computed client-side from the loaded array. The tenant drill-down panel uses `useTenant(id)` to load full detail when a row is selected. No new API endpoints are needed.

**Tech Stack:** React 18 + Tailwind CSS v3 + @tanstack/react-query, react-i18next, Material Symbols Outlined icons, MD3 CSS token classes

**Depends on:** Plan A must be complete first (provides `type`, `kycStatus`, `tier`, `upcomingBooking` fields).

---

## Context for all tasks

- Design references: `designs/apartment.html`, `designs/tenant.html`
- MD3 token classes: `text-primary`, `bg-surface-container`, `border-outline-variant`, etc. — all defined in `client/src/index.css` and mapped in `client/tailwind.config.ts`
- Icons: `<span className="material-symbols-outlined">icon_name</span>` — NOT Lucide
- Font size tokens used in designs (`text-display-lg`, `text-headline-md`, etc.) must be added to `tailwind.config.ts` before using them in pages
- Color tokens NOT in tailwind config (like `green-500`, `amber-500`, `red-500`) are standard Tailwind colors and work as-is
- The `useApartments` hook returns `ApartmentListItem[]` with `type`, `upcomingBooking` (added in Plan A)
- The `useTenants` hook returns `TenantListItem[]` with `kycStatus`, `tier`, `currentBooking` (added in Plan A)

---

## Task 1: Add Font Size Tokens to Tailwind Config

**Files:**
- Modify: `client/tailwind.config.ts`

The design uses custom font size scale (`text-display-lg`, `text-headline-md`, `text-body-base`, etc.) that must be added to the Tailwind config to generate the utility classes.

- [ ] **Step 1: Update tailwind.config.ts**

Replace `client/tailwind.config.ts` entirely:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['30px', { lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-base': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'table-data': ['13px', { lineHeight: '16px', fontWeight: '500' }],
        'status-pill': ['12px', { lineHeight: '16px', fontWeight: '600' }],
        'label-caps': ['11px', { lineHeight: '12px', letterSpacing: '0.05em', fontWeight: '700' }],
      },
      colors: {
        primary: 'var(--color-primary)',
        'on-primary': 'var(--color-on-primary)',
        'primary-container': 'var(--color-primary-container)',
        'on-primary-container': 'var(--color-on-primary-container)',
        'primary-fixed': 'var(--color-primary-fixed)',
        'primary-fixed-dim': 'var(--color-primary-fixed-dim)',
        secondary: 'var(--color-secondary)',
        'on-secondary': 'var(--color-on-secondary)',
        'secondary-container': 'var(--color-secondary-container)',
        'on-secondary-container': 'var(--color-on-secondary-container)',
        'secondary-fixed': 'var(--color-secondary-fixed)',
        'secondary-fixed-dim': 'var(--color-secondary-fixed-dim)',
        'on-secondary-fixed': 'var(--color-on-secondary-fixed)',
        'on-secondary-fixed-variant': 'var(--color-on-secondary-fixed-variant)',
        tertiary: 'var(--color-tertiary)',
        'on-tertiary': 'var(--color-on-tertiary)',
        'tertiary-container': 'var(--color-tertiary-container)',
        'on-tertiary-container': 'var(--color-on-tertiary-container)',
        'tertiary-fixed': 'var(--color-tertiary-fixed)',
        'tertiary-fixed-dim': 'var(--color-tertiary-fixed-dim)',
        'on-tertiary-fixed': 'var(--color-on-tertiary-fixed)',
        'on-tertiary-fixed-variant': 'var(--color-on-tertiary-fixed-variant)',
        error: 'var(--color-error)',
        'on-error': 'var(--color-on-error)',
        'error-container': 'var(--color-error-container)',
        'on-error-container': 'var(--color-on-error-container)',
        background: 'var(--color-background)',
        'on-background': 'var(--color-on-background)',
        surface: 'var(--color-surface)',
        'on-surface': 'var(--color-on-surface)',
        'surface-variant': 'var(--color-surface-variant)',
        'on-surface-variant': 'var(--color-on-surface-variant)',
        outline: 'var(--color-outline)',
        'outline-variant': 'var(--color-outline-variant)',
        'inverse-surface': 'var(--color-inverse-surface)',
        'inverse-on-surface': 'var(--color-inverse-on-surface)',
        'inverse-primary': 'var(--color-inverse-primary)',
        'surface-tint': 'var(--color-surface-tint)',
        'surface-dim': 'var(--color-surface-dim)',
        'surface-bright': 'var(--color-surface-bright)',
        'surface-container-lowest': 'var(--color-surface-container-lowest)',
        'surface-container-low': 'var(--color-surface-container-low)',
        'surface-container': 'var(--color-surface-container)',
        'surface-container-high': 'var(--color-surface-container-high)',
        'surface-container-highest': 'var(--color-surface-container-highest)',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        '2xl': '0.75rem',
        full: '9999px',
      },
      spacing: {
        'container-padding': '2rem',
        'widget-gap': '1.5rem',
        'stack-base': '1rem',
        'stack-tight': '0.5rem',
        'table-cell-padding-y': '0.75rem',
        'table-cell-padding-x': '1rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: Verify build still works**

```bash
cd client
npm run build 2>&1 | head -20
```

Expected: Build succeeds (or only pre-existing warnings).

- [ ] **Step 3: Commit**

```bash
git add client/tailwind.config.ts
git commit -m "feat: add design system font scale and table spacing tokens to Tailwind config"
```

---

## Task 2: Rebuild ApartmentsPage

**Files:**
- Modify: `client/src/pages/apartments/ApartmentsPage.tsx`

Reference: `designs/apartment.html` (lines 192–482)

The page layout from the design:
1. **Page header** — "Apartment Monitoring" title + "Daily Apartment Status Report" download button
2. **Filter bar** — Floor select, Apartment Type select, Status select, Apply button
3. **4 stat widgets** — Occupancy Rate (with progress bar), Available Now (green left border), Pending Check-Out (amber left border), In Maintenance (red left border)
4. **Data table** — columns: APT. NO | TYPE | STATUS | TENANT NAME | CHECK-IN / OUT | PAYMENT | MAINTENANCE | ACTIONS
5. **Pagination** — showing X to Y of Z units, prev/next + page number buttons
6. **Bottom panels** — Upcoming Transitions (flex-1) + Staff Distribution (fixed 400px, navy bg)

**Payment column logic** (computed from `currentBooking.payments`):
- No current booking → `—`
- All payments PAID → green `check_circle` + "Paid"
- Any payment FAILED → red `error` + "Overdue"
- Any payment PENDING + apartment RESERVED → amber `pending` + "Deposit"
- Any payment PENDING + apartment OCCUPIED → amber `pending` + "Pending"

**Upcoming Transitions** (computed from apartments data):
- Check-outs: apartments where `currentBooking.checkOut` is within 7 days from now
- Check-ins: apartments where `upcomingBooking.checkIn` is within 7 days from now
- Sorted by date ascending, show first 5

- [ ] **Step 1: Replace ApartmentsPage.tsx entirely**

```tsx
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApartmentStatus, ApartmentType, Role } from '@hotel/shared';
import { useApartments, ApartmentListItem } from '../../hooks/useApartments';
import ApartmentStatusBadge from '../../components/apartments/ApartmentStatusBadge';
import ApartmentFormModal from './ApartmentFormModal';
import { useAuth } from '../../hooks/useAuth';

const PAGE_SIZE = 10;

function getPaymentLabel(apt: ApartmentListItem): { icon: string; label: string; color: string } | null {
  if (!apt.currentBooking || apt.currentBooking.payments.length === 0) return null;
  const payments = apt.currentBooking.payments;
  const allPaid = payments.every((p) => p.status === 'PAID');
  if (allPaid) return { icon: 'check_circle', label: 'Paid', color: 'text-green-600' };
  const anyFailed = payments.some((p) => p.status === 'FAILED');
  if (anyFailed) return { icon: 'error', label: 'Overdue', color: 'text-error' };
  if (apt.status === ApartmentStatus.RESERVED) return { icon: 'pending', label: 'Deposit', color: 'text-amber-600' };
  return { icon: 'pending', label: 'Pending', color: 'text-amber-600' };
}

function formatTransitionDate(dateStr: string): { month: string; day: string } {
  const d = new Date(dateStr);
  return {
    month: d.toLocaleString('en', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  };
}

function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d >= now && d <= cutoff;
}

export default function ApartmentsPage() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<ApartmentType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ApartmentStatus | ''>('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedFloor, setAppliedFloor] = useState<string>('');
  const [appliedType, setAppliedType] = useState<ApartmentType | ''>('');
  const [appliedStatus, setAppliedStatus] = useState<ApartmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ApartmentListItem | null>(null);

  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  // Load all apartments (unfiltered) for stats
  const { data: allApartments = [] } = useApartments();

  // Load filtered apartments for table
  const { data: filtered = [], isLoading } = useApartments({
    search: appliedSearch || undefined,
    type: appliedType || undefined,
    status: appliedStatus || undefined,
  });

  // Client-side floor filter (not in API yet)
  const tableData = useMemo(() => {
    if (!appliedFloor) return filtered;
    return filtered.filter((a) => String(a.floor) === appliedFloor);
  }, [filtered, appliedFloor]);

  // Stats (always from unfiltered data)
  const stats = useMemo(() => {
    const total = allApartments.length;
    const available = allApartments.filter((a) => a.status === ApartmentStatus.AVAILABLE).length;
    const occupied = allApartments.filter((a) => a.status === ApartmentStatus.OCCUPIED).length;
    const maintenance = allApartments.filter((a) => a.status === ApartmentStatus.MAINTENANCE).length;
    const pendingCheckout = allApartments.filter((a) => a.status === ApartmentStatus.PENDING_CHECKOUT).length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100 * 10) / 10 : 0;
    return { total, available, occupied, maintenance, pendingCheckout, occupancyRate };
  }, [allApartments]);

  // Upcoming transitions
  const upcomingTransitions = useMemo(() => {
    const checkOuts = allApartments
      .filter((a) => a.currentBooking && isWithinDays(a.currentBooking.checkOut, 7))
      .map((a) => ({
        type: 'checkout' as const,
        unit: a.number,
        tenant: a.currentBooking!.tenant.fullName,
        date: a.currentBooking!.checkOut,
      }));
    const checkIns = allApartments
      .filter((a) => a.upcomingBooking && isWithinDays(a.upcomingBooking.checkIn, 7))
      .map((a) => ({
        type: 'checkin' as const,
        unit: a.number,
        tenant: a.upcomingBooking!.tenant.fullName,
        date: a.upcomingBooking!.checkIn,
      }));
    return [...checkOuts, ...checkIns]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [allApartments]);

  // Unique floors for filter
  const floors = useMemo(() => {
    const set = new Set(allApartments.map((a) => a.floor));
    return Array.from(set).sort((a, b) => a - b);
  }, [allApartments]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(tableData.length / PAGE_SIZE));
  const paged = tableData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const applyFilters = () => {
    setAppliedSearch(search);
    setAppliedFloor(floorFilter);
    setAppliedType(typeFilter);
    setAppliedStatus(statusFilter);
    setPage(1);
  };

  const thCls = 'px-table-cell-padding-x py-table-cell-padding-y text-label-caps font-bold text-on-surface-variant uppercase tracking-wider';

  return (
    <div className="space-y-widget-gap">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-widget-gap">
        <div>
          <h2 className="text-display-lg text-primary">Apartment Monitoring</h2>
          <p className="text-on-surface-variant text-body-base mt-1">Real-time status tracking for LuxStay properties.</p>
        </div>
        <button className="flex items-center gap-2 bg-surface-container-high text-primary px-4 py-2.5 rounded font-bold text-body-sm hover:bg-surface-container-highest transition-colors self-start md:self-auto">
          <span className="material-symbols-outlined text-[20px]">cloud_download</span>
          Daily Apartment Status Report
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-outline-variant p-4 rounded-xl flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">FLOOR</label>
          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="">All Floors</option>
            {floors.map((f) => (
              <option key={f} value={String(f)}>Floor {f}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">APARTMENT TYPE</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ApartmentType | '')}
            className="w-full bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="">{t('apartments.allTypes', 'All Types')}</option>
            {Object.values(ApartmentType).map((tp) => (
              <option key={tp} value={tp}>{t(`apartmentType.${tp}`)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">STATUS</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApartmentStatus | '')}
            className="w-full bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="">{t('apartments.allStatuses')}</option>
            {Object.values(ApartmentStatus).map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="Search unit..."
            className="bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none w-40"
          />
          <button
            onClick={applyFilters}
            className="bg-primary text-on-primary h-[40px] px-6 rounded font-bold text-body-sm hover:opacity-90 transition-opacity"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-widget-gap">
        {/* Occupancy Rate */}
        <div className="bg-white border border-outline-variant p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">meeting_room</span>
            <span className="text-xs font-bold text-on-secondary-container bg-secondary-container px-2 py-0.5 rounded-full">
              Total {stats.total}
            </span>
          </div>
          <p className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">OCCUPANCY RATE</p>
          <h3 className="text-display-lg mt-1">{stats.occupancyRate}%</h3>
          <div className="w-full bg-surface-container mt-3 h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${stats.occupancyRate}%` }} />
          </div>
        </div>

        {/* Available Now */}
        <div className="bg-white border border-outline-variant border-l-4 border-l-green-500 p-5 rounded-xl">
          <p className="text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">AVAILABLE NOW</p>
          <h3 className="text-display-lg">{stats.available}</h3>
          <p className="text-xs text-green-600 font-bold flex items-center gap-1 mt-2">
            <span className="material-symbols-outlined text-[14px]">trending_up</span> Ready for Check-in
          </p>
        </div>

        {/* Pending Check-Out */}
        <div className="bg-white border border-outline-variant border-l-4 border-l-amber-500 p-5 rounded-xl">
          <p className="text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">PENDING CHECK-OUT</p>
          <h3 className="text-display-lg">{stats.pendingCheckout}</h3>
          <p className="text-xs text-amber-600 font-bold flex items-center gap-1 mt-2">
            <span className="material-symbols-outlined text-[14px]">schedule</span> Next 24 Hours
          </p>
        </div>

        {/* In Maintenance */}
        <div className="bg-white border border-outline-variant border-l-4 border-l-red-500 p-5 rounded-xl">
          <p className="text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">IN MAINTENANCE</p>
          <h3 className="text-display-lg">{String(stats.maintenance).padStart(2, '0')}</h3>
          <p className="text-xs text-red-600 font-bold flex items-center gap-1 mt-2">
            <span className="material-symbols-outlined text-[14px]">warning</span> Urgent Repairs
          </p>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-on-surface-variant text-body-sm">{t('common.loading')}</div>
          ) : tableData.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant text-body-sm">{t('common.noData')}</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className={thCls}>APT. NO</th>
                  <th className={thCls}>TYPE</th>
                  <th className={thCls}>STATUS</th>
                  <th className={thCls}>TENANT NAME</th>
                  <th className={thCls}>CHECK-IN / OUT</th>
                  <th className={thCls}>PAYMENT</th>
                  <th className={thCls}>MAINTENANCE</th>
                  <th className={thCls + ' text-right'}>ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {paged.map((apt) => {
                  const payment = getPaymentLabel(apt);
                  return (
                    <tr key={apt.id} className="hover:bg-surface-container-low transition-colors group">
                      <td className="px-table-cell-padding-x py-table-cell-padding-y font-bold text-table-data">
                        <Link to={`/apartments/${apt.id}`} className="text-primary hover:underline">
                          {apt.number}
                        </Link>
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data text-on-surface">
                        {t(`apartmentType.${apt.type}`)}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y">
                        <ApartmentStatusBadge status={apt.status} />
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data text-on-surface">
                        {apt.currentBooking ? (
                          apt.currentBooking.tenant.fullName
                        ) : (
                          <span className="text-on-surface-variant italic">Vacant</span>
                        )}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data text-on-surface-variant">
                        {apt.currentBooking ? (
                          `${new Date(apt.currentBooking.checkIn).toLocaleDateString('en', { month: 'short', day: 'numeric' })} - ${new Date(apt.currentBooking.checkOut).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
                        ) : '—'}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data">
                        {payment ? (
                          <span className={`flex items-center gap-1 font-bold ${payment.color}`}>
                            <span className="material-symbols-outlined text-[16px]">{payment.icon}</span>
                            {payment.label}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/50">—</span>
                        )}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data">
                        {apt.activeTicket ? (
                          <span className="text-red-600 flex items-center gap-1 font-bold">
                            <span className="material-symbols-outlined text-[16px]">build</span>
                            {apt.activeTicket.status}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/50">—</span>
                        )}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-right">
                        {canEdit ? (
                          <button
                            onClick={() => { setEditTarget(apt); setShowModal(true); }}
                            className="p-1 hover:bg-surface-container rounded-full"
                          >
                            <span className="material-symbols-outlined text-[20px]">more_vert</span>
                          </button>
                        ) : (
                          apt.status === ApartmentStatus.AVAILABLE && (
                            <button className="text-primary font-bold hover:underline text-body-sm">Check In</button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {tableData.length > PAGE_SIZE && (
          <div className="bg-surface-container-low px-container-padding py-3 border-t border-outline-variant flex items-center justify-between">
            <p className="text-on-surface-variant text-body-sm">
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, tableData.length)} of {tableData.length} units
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant hover:bg-surface transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 flex items-center justify-center rounded text-body-sm font-bold transition-colors ${
                      page === pageNum
                        ? 'bg-primary text-on-primary'
                        : 'border border-outline-variant hover:bg-surface'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant hover:bg-surface transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Panels */}
      <div className="flex flex-col lg:flex-row gap-widget-gap">
        {/* Upcoming Transitions */}
        <div className="flex-1 bg-white border border-outline-variant p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-headline-md font-bold">Upcoming Transitions</h4>
            <button className="text-primary text-body-sm font-bold">View Calendar</button>
          </div>
          {upcomingTransitions.length === 0 ? (
            <p className="text-on-surface-variant text-body-sm italic">No upcoming transitions in the next 7 days.</p>
          ) : (
            <div className="space-y-4">
              {upcomingTransitions.map((tr, i) => {
                const { month, day } = formatTransitionDate(tr.date);
                const isCheckout = tr.type === 'checkout';
                return (
                  <div key={i} className="flex items-center gap-4 p-3 bg-surface-container-low rounded-lg">
                    <div className={`w-12 h-12 rounded flex flex-col items-center justify-center font-bold ${isCheckout ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                      <span className="text-[10px] leading-none">{month}</span>
                      <span className="text-lg leading-tight">{day}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-body-base">{isCheckout ? 'Check-out' : 'Check-in'}: Unit {tr.unit}</p>
                      <p className="text-body-sm text-on-surface-variant">Tenant: {tr.tenant}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${isCheckout ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                      {isCheckout ? 'PENDING' : 'CONFIRMED'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Staff Distribution */}
        <div className="w-full lg:w-[400px] bg-primary-container text-on-primary-container p-6 rounded-xl relative overflow-hidden">
          <div className="relative z-10">
            <h4 className="text-headline-md font-bold text-white mb-2">Staff Distribution</h4>
            <p className="text-on-primary-container/80 text-body-sm mb-6">Current housekeeping and maintenance teams on site.</p>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-body-sm text-white">Housekeeping (Team A)</span>
                <span className="bg-green-500/20 text-green-400 text-[11px] font-bold px-2 py-0.5 rounded border border-green-500/30">ACTIVE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-body-sm text-white">Maintenance (Emergency)</span>
                <span className="bg-red-500/20 text-red-400 text-[11px] font-bold px-2 py-0.5 rounded border border-red-500/30">ON-CALL</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-body-sm text-white">Front Desk Night Shift</span>
                <span className="bg-white/10 text-white/50 text-[11px] font-bold px-2 py-0.5 rounded border border-white/20">SCHEDULED</span>
              </div>
            </div>
            <button className="w-full mt-8 border border-white/20 hover:bg-white/10 py-2.5 rounded font-bold text-body-sm transition-colors text-white">
              Dispatch New Task
            </button>
          </div>
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
        </div>
      </div>

      {showModal && (
        <ApartmentFormModal
          apartment={editTarget}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/apartments/ApartmentsPage.tsx
git commit -m "feat: rebuild ApartmentsPage to match design — stats, type column, filters, pagination, transitions panel"
```

---

## Task 3: Rebuild TenantsPage

**Files:**
- Modify: `client/src/pages/tenants/TenantsPage.tsx`

Reference: `designs/tenant.html` (lines 179–388)

The page layout from the design:
- Two-column layout on wide screens (`flex-col xl:flex-row`)
- **Left** (`flex-1`): table with columns: Full Name (+ tier subtitle) | Phone & ID | Active Apartment | Rental Period | KYC Status | (chevron)
- **Right** (`w-[400px]`): Profile drill-down panel — shown when a row is selected; uses `useTenant(selectedId)` to load full detail
- Rows: clicking a row selects it (highlights with `bg-secondary-container/10 border-l-4 border-l-primary`)
- Selected row shows the drill-down panel

**KYC Status badge colors:**
- VERIFIED → `bg-green-100 text-green-800`
- PENDING → `bg-amber-100 text-amber-800`
- ACTION_REQUIRED → `bg-red-100 text-red-800`

**Active Apartment chip:**
- Has current booking → `bg-primary text-white` with apartment icon + unit number
- No current booking → `bg-secondary-container text-primary` (dimmer)

**Drill-down panel:**
- Profile: avatar initials circle (w-24 h-24), online status dot, name, "Tenant since [date]"
- Stats grid: Total Stay, Status (Active/Inactive)
- Tenancy History: vertical timeline of all bookings, most recent first, current one has `bg-primary` dot
- Buttons: View Documents, Contact (decorative — no action needed)
- Operational Notes: shows `tenant.notes` or placeholder italic text

- [ ] **Step 1: Replace TenantsPage.tsx entirely**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KycStatus, TenantTier, Role } from '@hotel/shared';
import { useTenants, TenantListItem, useTenant } from '../../hooks/useTenants';
import TenantFormModal from './TenantFormModal';
import { useAuth } from '../../hooks/useAuth';

function KycBadge({ status }: { status: KycStatus }) {
  const colorMap: Record<KycStatus, string> = {
    [KycStatus.VERIFIED]: 'bg-green-100 text-green-800',
    [KycStatus.PENDING]: 'bg-amber-100 text-amber-800',
    [KycStatus.ACTION_REQUIRED]: 'bg-red-100 text-red-800',
  };
  const labelMap: Record<KycStatus, string> = {
    [KycStatus.VERIFIED]: 'Verified',
    [KycStatus.PENDING]: 'Pending',
    [KycStatus.ACTION_REQUIRED]: 'Action Req.',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-status-pill font-bold ${colorMap[status]}`}>
      {labelMap[status]}
    </span>
  );
}

function TierSubtitle({ tier }: { tier: TenantTier }) {
  const labelMap: Record<TenantTier, string> = {
    [TenantTier.NEW]: 'New Tenant',
    [TenantTier.SILVER]: 'Silver Tier Resident',
    [TenantTier.GOLD]: 'Gold Tier Resident',
    [TenantTier.PLATINUM]: 'Platinum Tier Resident',
  };
  return <div className="text-[11px] text-on-surface-variant">{labelMap[tier]}</div>;
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatTenureSince(dateStr: string): string {
  const start = new Date(dateStr);
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} Mos`;
  if (months === 0) return `${years} ${years === 1 ? 'Year' : 'Years'}`;
  return `${years} ${years === 1 ? 'Year' : 'Years'}, ${months} Mos`;
}

function DrillDownPanel({
  tenantId,
  onClose,
  onEdit,
  canEdit,
}: {
  tenantId: number;
  onClose: () => void;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const { data: tenant, isLoading } = useTenant(tenantId);

  if (isLoading) {
    return (
      <div className="w-full xl:w-[400px] flex items-center justify-center p-12 bg-surface-container-low rounded-xl border border-outline-variant">
        <span className="text-on-surface-variant text-body-sm">Loading...</span>
      </div>
    );
  }
  if (!tenant) return null;

  const now = new Date();
  const activeLease = tenant.bookings.find(
    (b) => new Date(b.checkIn) <= now && new Date(b.checkOut) >= now
  );

  return (
    <aside className="w-full xl:w-[400px] flex flex-col gap-6">
      {/* Profile Summary Card */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6 shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div className="flex flex-col items-center text-center w-full">
            <div className="relative mb-4">
              <div className="w-24 h-24 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-2xl text-primary border-4 border-white shadow-md">
                {initials(tenant.fullName)}
              </div>
              <span className={`absolute bottom-1 right-1 w-6 h-6 border-4 border-white rounded-full ${activeLease ? 'bg-green-500' : 'bg-outline-variant'}`} />
            </div>
            <h3 className="text-headline-md text-primary">{tenant.fullName}</h3>
            <p className="text-body-sm text-on-surface-variant">
              Tenant since {new Date(tenant.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors shrink-0">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-surface rounded-lg p-3 border border-outline-variant">
            <span className="text-label-caps font-bold text-on-surface-variant uppercase block mb-1">Total Stay</span>
            <span className="text-table-data text-primary font-medium">{formatTenureSince(tenant.createdAt)}</span>
          </div>
          <div className="bg-surface rounded-lg p-3 border border-outline-variant">
            <span className="text-label-caps font-bold text-on-surface-variant uppercase block mb-1">Status</span>
            <span className="text-table-data text-primary font-medium">{activeLease ? 'Active' : 'Inactive'}</span>
          </div>
        </div>

        {/* Tenancy History */}
        <div className="border-t border-outline-variant pt-6">
          <h4 className="text-label-caps font-bold text-on-surface-variant uppercase mb-4 tracking-widest">Tenancy History</h4>
          {tenant.bookings.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant italic">No booking history.</p>
          ) : (
            <div className="space-y-4">
              {tenant.bookings.map((booking, idx) => {
                const isCurrent = new Date(booking.checkIn) <= now && new Date(booking.checkOut) >= now;
                return (
                  <div key={booking.id} className="flex gap-4 relative">
                    <div className={`w-2 rounded-full mt-1 shrink-0 ${isCurrent ? 'bg-primary' : 'bg-outline-variant'}`} style={{ minHeight: idx === tenant.bookings.length - 1 ? '1rem' : '100%' }} />
                    <div>
                      <div className="text-table-data text-primary font-medium">Unit {booking.apartment.number}</div>
                      <div className="text-[11px] text-on-surface-variant">
                        {new Date(booking.checkIn).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                        {' — '}
                        {isCurrent ? 'Present' : new Date(booking.checkOut).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                      </div>
                      <div className="text-[12px] mt-1 font-medium text-on-surface-variant">
                        {booking.apartment.type ? booking.apartment.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 flex gap-3">
          {canEdit && (
            <button
              onClick={onEdit}
              className="flex-1 border border-outline text-primary text-body-sm font-bold py-2.5 rounded-lg hover:bg-surface-container transition-colors"
            >
              Edit Tenant
            </button>
          )}
          <button className="flex-1 bg-primary text-on-primary text-body-sm font-bold py-2.5 rounded-lg hover:opacity-90 transition-opacity">
            Contact
          </button>
        </div>
      </div>

      {/* Operational Notes */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4">
        <h4 className="text-label-caps font-bold text-on-surface-variant uppercase mb-3">Operational Notes</h4>
        <div className="bg-surface-container-low p-3 rounded-lg text-body-sm text-on-surface-variant italic border border-dashed border-outline-variant">
          {tenant.notes
            ? `"${tenant.notes}"`
            : 'No operational notes on file.'}
        </div>
      </div>
    </aside>
  );
}

export default function TenantsPage() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<TenantListItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantListItem | null>(null);

  const { data: tenants = [], isLoading } = useTenants(search || undefined);
  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  const handleRowClick = (tenant: TenantListItem) => {
    setSelectedTenant((prev) => (prev?.id === tenant.id ? null : tenant));
  };

  const handleEdit = (tenant: TenantListItem) => {
    setEditTarget(tenant);
    setShowModal(true);
  };

  const thCls = 'px-table-cell-padding-x py-table-cell-padding-y text-label-caps font-bold text-on-surface-variant uppercase tracking-wider';

  return (
    <div className="flex gap-widget-gap flex-col xl:flex-row">
      {/* Left: Registry */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-display-lg text-primary">Tenant Registry</h2>
            <p className="text-body-base text-on-surface-variant mt-1">
              Manage {tenants.length} active residents across all property tiers.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-xl flex items-center gap-2 text-body-base font-bold shadow-lg shadow-primary/10 hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined">person_add</span>
              Register New Tenant
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants, unit numbers, or IDs..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-full py-2 pl-10 pr-4 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-on-surface-variant text-body-sm">{t('common.loading')}</div>
            ) : tenants.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant text-body-sm">{t('common.noData')}</div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-surface-container border-b border-outline-variant">
                  <tr>
                    <th className={thCls}>Full Name</th>
                    <th className={thCls}>Phone &amp; ID</th>
                    <th className={thCls}>Active Apartment</th>
                    <th className={thCls}>Rental Period</th>
                    <th className={thCls}>KYC Status</th>
                    <th className={thCls} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {tenants.map((tenant) => {
                    const isSelected = selectedTenant?.id === tenant.id;
                    return (
                      <tr
                        key={tenant.id}
                        onClick={() => handleRowClick(tenant)}
                        className={`hover:bg-surface-container-low transition-colors group cursor-pointer border-l-4 ${
                          isSelected
                            ? 'bg-secondary-container/10 border-l-primary'
                            : 'border-l-transparent'
                        }`}
                      >
                        <td className="px-table-cell-padding-x py-table-cell-padding-y">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-primary text-xs shrink-0 border border-outline-variant">
                              {initials(tenant.fullName)}
                            </div>
                            <div>
                              <div className="text-table-data text-primary font-medium">{tenant.fullName}</div>
                              <TierSubtitle tier={tenant.tier} />
                            </div>
                          </div>
                        </td>
                        <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data text-on-surface">
                          <div>{tenant.phone}</div>
                          <div className="text-[11px] text-on-surface-variant font-normal">ID: {tenant.idNumber}</div>
                        </td>
                        <td className="px-table-cell-padding-x py-table-cell-padding-y">
                          {tenant.currentBooking ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary text-white rounded-lg text-status-pill font-bold">
                              <span className="material-symbols-outlined text-[14px]">apartment</span>
                              {tenant.currentBooking.apartment.number}
                            </div>
                          ) : (
                            <span className="text-on-surface-variant/50 text-table-data">—</span>
                          )}
                        </td>
                        <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data text-on-surface">
                          {tenant.currentBooking ? (
                            <>
                              <div>{new Date(tenant.currentBooking.checkIn).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                              <div className="text-[11px] text-on-surface-variant font-normal">
                                to {new Date(tenant.currentBooking.checkOut).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            </>
                          ) : (
                            <span className="text-on-surface-variant/50">—</span>
                          )}
                        </td>
                        <td className="px-table-cell-padding-x py-table-cell-padding-y">
                          <KycBadge status={tenant.kycStatus} />
                        </td>
                        <td className="px-table-cell-padding-x py-table-cell-padding-y text-right">
                          <span className="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">
                            chevron_right
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Right: Drill-down Panel */}
      {selectedTenant && (
        <DrillDownPanel
          tenantId={selectedTenant.id}
          onClose={() => setSelectedTenant(null)}
          onEdit={() => handleEdit(selectedTenant)}
          canEdit={canEdit}
        />
      )}

      {showModal && (
        <TenantFormModal
          tenant={editTarget}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/tenants/TenantsPage.tsx
git commit -m "feat: rebuild TenantsPage to match design — KYC, tier, active apt, rental period, drill-down panel"
```

---

## Manual Verification Checklist

Start the dev server and verify both pages visually match the designs:

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Open `http://localhost:5173` and login, then check:

**Apartments page:**
- [ ] Page title is "Apartment Monitoring" in display-lg font
- [ ] Filter bar has Floor, Apartment Type, Status dropdowns + Apply button
- [ ] 4 stat widgets appear: Occupancy Rate (with progress bar), Available Now (green left border), Pending Check-Out (amber left border), In Maintenance (red left border)
- [ ] Table has 8 columns: APT. NO, TYPE, STATUS, TENANT NAME, CHECK-IN / OUT, PAYMENT, MAINTENANCE, ACTIONS
- [ ] TYPE column shows "Studio", "1-Bedroom", etc. (not enum keys)
- [ ] PAYMENT column shows Paid/Overdue/Deposit with colored icons
- [ ] Pagination appears when more than 10 rows
- [ ] Upcoming Transitions panel appears at the bottom
- [ ] Staff Distribution (navy) panel appears at the bottom right

**Tenants page:**
- [ ] Page title is "Tenant Registry" in display-lg font
- [ ] Table has 6 columns: Full Name, Phone & ID, Active Apartment, Rental Period, KYC Status, (chevron)
- [ ] Full Name cell shows tier subtitle below the name (e.g. "Silver Tier Resident")
- [ ] Active Apartment shows a navy chip with the unit number
- [ ] Rental Period shows two-line date range
- [ ] KYC Status shows colored pill badge (green/amber/red)
- [ ] Clicking a row opens the drill-down panel on the right
- [ ] Panel shows tenancy history timeline
- [ ] Panel shows Operational Notes
- [ ] Clicking another row switches the panel to the new tenant
- [ ] Clicking the selected row closes the panel
