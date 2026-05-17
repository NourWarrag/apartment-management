# Responsive Design — Small-Laptop Floor

**Status:** Design approved 2026-05-17. Awaiting plan.

**Goal:** Make every page render without clipping or horizontal overflow at viewport widths from 1024px (small laptop) to 2560px (4K monitor). The system today assumes wide desktops and breaks at narrower laptop widths.

**Non-goal:** Phone or tablet support. Anything below 1024px is unsupported. We don't audit it, don't test it, and don't intentionally break it.

---

## 1. Breakpoints and target

- **Supported viewport range:** 1024px → 2560px
- **Floor:** 1024px (small laptop)
- **Tailwind breakpoints used (defaults, no overrides):**
  - `lg` = 1024px
  - `xl` = 1280px
  - `2xl` = 1536px
- **Reference content widths** with the existing 280px sidebar + `p-container-padding` (2rem × 2 = 64px) on `<main>`:

| Viewport | Content area |
|---|---|
| 1024px | 680px |
| 1280px | 936px |
| 1536px | 1192px |
| 1920px | 1576px |

**The 680px floor is the design target.** Every page must look right at that width.

---

## 2. New primitive — `<TableScroller>`

**File:** `client/src/components/ui/TableScroller.tsx`

A single small wrapper component. ~20 lines.

```tsx
type Props = {
  children: React.ReactNode;
  minWidth?: number; // default 720
  className?: string;
};

export function TableScroller({ children, minWidth = 720, className = '' }: Props) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest ${className}`}>
      <div style={{ minWidth: `${minWidth}px` }}>
        {children}
      </div>
    </div>
  );
}
```

**Behavior:**
- Outer wrapper has `overflow-x-auto` — table scrolls horizontally inside its container, never expands the page
- Inner wrapper enforces `min-width` (default 720px) so columns don't compress below readability
- Standard MD3 surface styling matches existing table containers — `rounded-xl`, `border-outline-variant`, `bg-surface-container-lowest`
- Consumer passes the `<table>` (or other wide content) as children; consumer keeps responsibility for the table's own classes

**Usage rule:** every `<table>` element in pages goes inside `<TableScroller>`. For tables that need ~900px to be readable (most accounting reports with many money columns), bump `minWidth={900}` or `{1000}`.

**Explicitly not in this primitive:**
- No column hiding
- No automatic sticky headers
- No row → card transformation
- No fade-edge shadow (could be a follow-up)

---

## 3. Layout fixes

### AppLayout (`client/src/components/layout/AppLayout.tsx`)

Single change: add `min-w-0` to the inner flex column.

```tsx
<div className="ltr:ml-[280px] rtl:mr-[280px] flex flex-col min-h-screen min-w-0">
```

**Why:** Without `min-w-0`, flex children default to `min-content` width. An overflowing table or wide inline element inside `<main>` forces the parent column wider than the viewport, pushing chrome off-screen. With `min-w-0`, the column can shrink and `overflow-x-auto` inside pages actually contains overflow.

This is the single most important fix in the whole spec. Without it, no amount of in-page scrolling helps.

### TopBar (`client/src/components/layout/TopBar.tsx`)

Two changes:
1. `px-8` → `px-6` on the header (frees 8px each side)
2. Search input wrapper: `w-80` → `w-64 xl:w-80` (256px below 1280, 320px at xl and above)

Right-side controls (language toggle, notifications, user menu) keep all three visible — already tight; no change.

### Sidebar

Already done in prior commit (`feat(client): collapsible Accounting group in sidebar + nav scroll`). No further changes.

---

## 4. Per-page audit policy

### Tables (~25 occurrences)

- **Rule:** every `<table>` is wrapped in `<TableScroller>`
- **Default minWidth:** 720
- **Override to 900–1000 for:** accounting reports with many money columns — Trial Balance, General Ledger, Income Statement, Balance Sheet, Cash Flow, VAT Return, Journal Entries detail, Reconciliation report
- **No column hiding, no sticky headers** (per scope)

### Grid layouts (~30 occurrences of `grid-cols-N`)

| Pattern | Responsive variant |
|---|---|
| Stat-widget rows (Dashboard) | `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` |
| Two-column form rows in modals | `grid-cols-1 lg:grid-cols-2` |
| Page-level two-pane (e.g. Banking with two lists) | `grid-cols-1 xl:grid-cols-2` |
| Three-column page-level grids | `grid-cols-1 lg:grid-cols-2 xl:grid-cols-3` |

**General rule:** when `N ≥ 3`, drop to `N/2` (rounded down) below `xl`, drop to 1 below `lg`.

### Reconciliation workspace (`ReconciliationPage.tsx`)

The worst offender — currently fixed two-column at all widths.

- **Below xl (1280px):** stack vertically — bank lines panel on top, GL lines panel below
- **At xl and above:** keep current side-by-side layout
- **Difference banner:** stays at top of workspace (no behavior change)
- **Checkbox-based N-to-1 selection:** unchanged

### Modals

- Audit each modal's outer `max-w-*` cap. Add a `max-w-[90vw]` fallback so the modal never exceeds viewport
- Internal `grid-cols-2` form rows → `grid-cols-1 lg:grid-cols-2`
- Affected: BookingFormModal, ExpenseFormModal, PaymentFormModal, JournalEntryEditorPage, NewReconciliationModal, BuildingFormModal, ApartmentFormModal, TenantFormModal, UserFormModal, AccountFormModal, NewTicketModal, CollectDepositModal, CheckoutModal, BackfillModal, ReversePaymentDialog, ReceiptModal

### Specific page notes

- **DashboardPage:** StatWidget row needs the responsive grid variant; RevenueChart container needs `w-full` (verify)
- **BankAccountDetailPage:** uses tabs with `flex-wrap`; verify at 680px
- **CsvImportWizard:** 3-step modal; preview table needs `<TableScroller>`
- **LoginPage:** outside AppLayout, own centered layout — no work
- **BuildingSelector:** native `<select>` — no work

### Scope discipline

- No page redesigns
- No new sort/filter UIs
- No new column selections
- No new chart styles
- Only: responsive class additions + `<TableScroller>` wraps + the AppLayout + TopBar fixes above

---

## 5. Out of scope

Recorded explicitly to prevent scope creep:

- Viewports below 1024px (phones, small tablets)
- Sidebar drawer / off-canvas mode / hamburger toggle
- Sidebar icons-only collapsed mode
- Bottom-nav, touch gestures, mobile-first patterns
- Page redesigns or layout reorganization
- Column hiding strategies for tables
- Row → card transformations
- Sticky headers as a default behavior in `<TableScroller>` (per-table opt-in could be a follow-up)
- New RTL-aware responsive variants beyond what's already in the codebase (existing `ltr:` / `rtl:` pairs are preserved; new responsive variants we add will match LTR behavior)
- Dark-mode polish (`darkMode: 'class'` is configured but unused — separate concern)
- Performance work — code splitting, lazy loading, image responsiveness

## 6. Acceptance criteria

- Every page renders without horizontal overflow at 1024px viewport
- No table clips outside its container at 1024px
- Reconciliation workspace stacks below 1280px and goes side-by-side at 1280px and above
- Client typecheck remains clean (still only the pre-existing `LoginPage.tsx` `Record<Role, string>` error)
- Manual walk-through at 1024px → 1280px → 1536px shows no clipping, no overlapping text, no cut-off controls

## 7. Files expected to change

**New:**
- `client/src/components/ui/TableScroller.tsx`

**Modified (layout):**
- `client/src/components/layout/AppLayout.tsx`
- `client/src/components/layout/TopBar.tsx`

**Modified (pages with tables, grids, or modals)** — approximately 30-35 files. Exact list emerges from the audit phase of the implementation plan.

**Not modified:**
- `client/tailwind.config.ts` (default breakpoints sufficient)
- `client/src/components/layout/Sidebar.tsx` (already done)
- `client/src/components/layout/BuildingSelector.tsx`
- `client/src/pages/auth/LoginPage.tsx`
