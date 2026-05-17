# Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page in the client render without horizontal overflow at viewport widths from 1024px (small laptop) to 2560px (4K). Introduce a single new `<TableScroller>` primitive, two layout fixes, then sweep every page that has wide tables, fixed grids ≥3 cols, or a side-by-side workspace.

**Architecture:** One new component (`TableScroller`) + an update to the existing `Table` component so both raw `<table>` and the wrapped `Table` component get horizontal scroll. `AppLayout` gets a single `min-w-0` that is the keystone — without it, table scroll containers cannot actually contain overflow. Per-page Tailwind class additions follow a small set of mechanical rules (responsive `xl:`/`lg:` variants).

**Tech Stack:** React 18, TypeScript 5, Tailwind 3 (default breakpoints), Vite. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-17-responsive-design.md`

**Pre-state:**
- Sidebar reorganization + scroll already merged (`feat/accounting-phase-4` ancestry). The sidebar is fixed 280px and scrolls internally — this plan keeps that behavior.
- `client/tailwind.config.ts` uses default breakpoints (`lg=1024`, `xl=1280`, `2xl=1536`). No custom breakpoints.
- `client/src/components/ui/` exists and is the established home for shared UI primitives.
- Two existing components use raw `<table>`: `client/src/components/ui/Table.tsx` and `client/src/components/BookingInvoiceModal.tsx`. 17 pages use raw `<table>` as well.

---

## File map

**Created:**
- `client/src/components/ui/TableScroller.tsx` — wrapper that gives any child horizontal scroll within its container, with a configurable minimum content width.

**Modified — layout (always-loaded chrome):**
- `client/src/components/ui/Table.tsx` — internal change so consumers of the `Table` component automatically get horizontal scroll. Adds a `minWidth` prop.
- `client/src/components/layout/AppLayout.tsx` — add `min-w-0` to the inner flex column.
- `client/src/components/layout/TopBar.tsx` — `px-8` → `px-6`; search `w-80` → `w-64 xl:w-80`.

**Modified — pages (wrap raw `<table>` in `TableScroller`):**
- `client/src/pages/accounting/AccountsPage.tsx`
- `client/src/pages/accounting/JournalEntriesPage.tsx`
- `client/src/pages/accounting/GeneralLedgerPage.tsx`
- `client/src/pages/accounting/TrialBalancePage.tsx`
- `client/src/pages/accounting/AccountMappingPage.tsx`
- `client/src/pages/accounting/VatReturnPage.tsx`
- `client/src/pages/accounting/IncomeStatementPage.tsx`
- `client/src/pages/accounting/BalanceSheetPage.tsx`
- `client/src/pages/accounting/CashFlowPage.tsx`
- `client/src/pages/accounting/FiscalPeriodsPage.tsx`
- `client/src/pages/accounting/TaxCodesPanel.tsx`
- `client/src/pages/accounting/BankingPage.tsx`
- `client/src/pages/accounting/BankAccountDetailPage.tsx`
- `client/src/pages/accounting/CsvImportWizard.tsx`
- `client/src/pages/accounting/ReconciliationPage.tsx`
- `client/src/pages/accounting/components/JournalLinesTable.tsx`
- `client/src/pages/tickets/TicketsListView.tsx`
- `client/src/components/BookingInvoiceModal.tsx`

**Modified — pages (other):**
- `client/src/pages/accounting/ReconciliationPage.tsx` — stack-to-side-by-side breakpoint: `lg:grid-cols-2` → `xl:grid-cols-2` (one line; same file as above).
- `client/src/pages/tickets/TicketsPage.tsx` — stat row `grid-cols-4` → `grid-cols-2 xl:grid-cols-4`.
- `client/src/pages/accounting/JournalEntryEditorPage.tsx` — meta row `grid-cols-3` → `grid-cols-1 lg:grid-cols-3`.

**Modified — modal max-width fallback** (15 files; one-line class addition each):
- `client/src/pages/users/UserFormModal.tsx`
- `client/src/pages/tickets/NewTicketModal.tsx`
- `client/src/pages/apartments/ApartmentFormModal.tsx`
- `client/src/pages/apartments/CheckoutModal.tsx`
- `client/src/pages/apartments/CollectDepositModal.tsx`
- `client/src/pages/bookings/BookingFormModal.tsx`
- `client/src/pages/tenants/TenantFormModal.tsx`
- `client/src/pages/buildings/BuildingFormModal.tsx`
- `client/src/pages/payments/PaymentFormModal.tsx`
- `client/src/pages/payments/ReceiptModal.tsx`
- `client/src/pages/accounting/AccountFormModal.tsx`
- `client/src/pages/accounting/ExpenseFormModal.tsx`
- `client/src/pages/accounting/BackfillModal.tsx`
- `client/src/pages/accounting/ReversePaymentDialog.tsx`
- `client/src/pages/accounting/NewReconciliationModal.tsx`

**Not touched** (already responsive or out of scope):
- `client/src/components/layout/Sidebar.tsx` — done in prior commit.
- `client/src/components/layout/BuildingSelector.tsx` — native `<select>`.
- `client/src/pages/auth/LoginPage.tsx` — own centered layout, not in AppLayout.
- `client/src/pages/dashboard/DashboardPage.tsx` — grids already use `grid-cols-1 sm:grid-cols-3`.
- `client/src/pages/apartments/ApartmentsPage.tsx`, `BookingsPage.tsx`, `PaymentsPage.tsx`, `BalanceSheetPage.tsx`, `ApartmentDetailPage.tsx`, `TenantDetailPage.tsx`, `InstallmentTracker.tsx`, `ReportsPage.tsx` — grids already responsive at our floor.

---

## Task A: Foundation (4 commits)

### Task A1: Create `TableScroller`

**Files:**
- Create: `client/src/components/ui/TableScroller.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { ReactNode } from 'react';

interface TableScrollerProps {
  children: ReactNode;
  minWidth?: number;
  className?: string;
}

export default function TableScroller({ children, minWidth = 720, className = '' }: TableScrollerProps) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest ${className}`}>
      <div style={{ minWidth: `${minWidth}px` }}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from `client/`:
```
npx tsc --noEmit
```

Expected: zero NEW errors. The pre-existing `LoginPage.tsx` Role-enum error stays the only error.

- [ ] **Step 3: Commit**

```
git add client/src/components/ui/TableScroller.tsx
git commit -m "feat(client): TableScroller primitive for responsive tables"
```

---

### Task A2: Update existing `Table` component

**Files:**
- Modify: `client/src/components/ui/Table.tsx`

The existing `Table` component is used by some pages (e.g., reconciliation report rows). Currently it has `overflow-hidden` on its outer div, which would clip wide tables. Update it to wrap an inner `min-width` container with horizontal scroll, mirroring `TableScroller`.

- [ ] **Step 1: Replace the `Table` function**

Open `client/src/components/ui/Table.tsx`. Replace the `Table` function (lines 9-16) with:

```tsx
interface TableProps {
  children: ReactNode;
  footer?: ReactNode;
  minWidth?: number;
  className?: string;
}

export function Table({ children, footer, minWidth = 720, className = '' }: TableProps) {
  return (
    <div className={`bg-white border border-outline-variant rounded-xl shadow-sm overflow-x-auto ${className}`}>
      <div style={{ minWidth: `${minWidth}px` }}>
        <table className="w-full text-left border-collapse">{children}</table>
        {footer}
      </div>
    </div>
  );
}
```

Changes:
- Added `minWidth?: number` prop (default 720)
- Replaced `overflow-hidden` with `overflow-x-auto` on the outer div
- Wrapped `<table>` and `footer` in an inner `<div>` with `min-width` style

- [ ] **Step 2: Typecheck**

Run from `client/`:
```
npx tsc --noEmit
```

Expected: zero NEW errors.

- [ ] **Step 3: Commit**

```
git add client/src/components/ui/Table.tsx
git commit -m "feat(client): Table component gains horizontal scroll + minWidth"
```

---

### Task A3: AppLayout `min-w-0` fix

**Files:**
- Modify: `client/src/components/layout/AppLayout.tsx`

This is the keystone fix. Without `min-w-0` on the inner flex column, any child that overflows pushes the column wider than the viewport, defeating every `overflow-x-auto` we add inside pages.

- [ ] **Step 1: Edit the file**

Open `client/src/components/layout/AppLayout.tsx`. Find the inner `<div>` (line 9):

```tsx
<div className="ltr:ml-[280px] rtl:mr-[280px] flex flex-col min-h-screen">
```

Change to:

```tsx
<div className="ltr:ml-[280px] rtl:mr-[280px] flex flex-col min-h-screen min-w-0">
```

(Add `min-w-0` to the end of the className.)

- [ ] **Step 2: Typecheck**

```
cd client && npx tsc --noEmit
```

Expected: zero NEW errors.

- [ ] **Step 3: Commit**

```
git add client/src/components/layout/AppLayout.tsx
git commit -m "fix(client): AppLayout main column min-w-0 so in-page scroll works"
```

---

### Task A4: TopBar responsive padding + search width

**Files:**
- Modify: `client/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Edit padding**

Open `client/src/components/layout/TopBar.tsx`. Find the `<header>` element (line 30):

```tsx
<header className="flex justify-between items-center h-16 px-8 bg-surface border-b border-outline-variant sticky top-0 z-10">
```

Change `px-8` to `px-6`:

```tsx
<header className="flex justify-between items-center h-16 px-6 bg-surface border-b border-outline-variant sticky top-0 z-10">
```

- [ ] **Step 2: Edit search width**

In the same file, find the search wrapper `<div>` (line 32):

```tsx
<div className="flex items-center bg-surface-container-low px-4 py-1.5 rounded-full border border-outline-variant w-80">
```

Change `w-80` to `w-64 xl:w-80`:

```tsx
<div className="flex items-center bg-surface-container-low px-4 py-1.5 rounded-full border border-outline-variant w-64 xl:w-80">
```

- [ ] **Step 3: Typecheck**

```
cd client && npx tsc --noEmit
```

Expected: zero NEW errors.

- [ ] **Step 4: Commit**

```
git add client/src/components/layout/TopBar.tsx
git commit -m "feat(client): TopBar shrinks padding and search below xl"
```

---

## Task B: Wrap raw `<table>` in `TableScroller`

This is a single mechanical sweep across 18 files. Each file: import `TableScroller`, then wrap every `<table>...</table>` block. Pick `minWidth` per the table's column count.

**Files and recommended `minWidth`:**

| File | `minWidth` | Why |
|---|---|---|
| `accounting/AccountsPage.tsx` | 720 | Code, name, type, balance |
| `accounting/JournalEntriesPage.tsx` | 900 | Entry #, date, memo, status, debit, credit, source |
| `accounting/GeneralLedgerPage.tsx` | 1000 | Date, entry#, account, memo, debit, credit, running balance |
| `accounting/TrialBalancePage.tsx` | 800 | Code, name, debit, credit |
| `accounting/AccountMappingPage.tsx` | 720 | Key, account, actions |
| `accounting/VatReturnPage.tsx` | 900 | Tax code, period, taxable, vat output, vat input |
| `accounting/IncomeStatementPage.tsx` | 720 | Account, amount |
| `accounting/BalanceSheetPage.tsx` | 720 | Account, amount |
| `accounting/CashFlowPage.tsx` | 720 | Section, account, amount |
| `accounting/FiscalPeriodsPage.tsx` | 800 | Year, month, status, locked-by, locked-at |
| `accounting/TaxCodesPanel.tsx` | 720 | Code, name, rate, actions |
| `accounting/BankingPage.tsx` | 720 | Name, GL account, mapping status |
| `accounting/BankAccountDetailPage.tsx` | 900 | Date, description, ref, amount, status (statements tab); date, statementBalance, status (reconciliations tab) |
| `accounting/CsvImportWizard.tsx` | 720 | Preview rows |
| `accounting/ReconciliationPage.tsx` | 720 | Two narrow tables in the workspace, each side gets its own scroller |
| `accounting/components/JournalLinesTable.tsx` | 800 | Account, debit, credit, tax code |
| `tickets/TicketsListView.tsx` | 900 | Ticket#, title, status, priority, assignee, created |
| `components/BookingInvoiceModal.tsx` | 720 | Description, amount (line items) |

### Task B (single commit per file)

For **each file** in the list above, follow these steps:

- [ ] **Step 1: Add the import**

Add to the imports at the top of the file:

```tsx
import TableScroller from '../../components/ui/TableScroller';
```

Adjust the relative path depth based on the file's location:
- For `client/src/pages/<area>/Foo.tsx` (one level deep) → `../../components/ui/TableScroller`
- For `client/src/pages/accounting/components/JournalLinesTable.tsx` (two levels deep) → `../../../components/ui/TableScroller`
- For `client/src/components/BookingInvoiceModal.tsx` (sibling) → `./ui/TableScroller`

- [ ] **Step 2: Wrap each `<table>` block**

For every `<table>...</table>` block in the file, wrap it in `<TableScroller minWidth={...}>`:

```tsx
{/* Before */}
<table className="w-full ...">
  <thead>...</thead>
  <tbody>...</tbody>
</table>

{/* After */}
<TableScroller minWidth={720}>
  <table className="w-full ...">
    <thead>...</thead>
    <tbody>...</tbody>
  </table>
</TableScroller>
```

If the existing code wraps the `<table>` in a `<div>` for border/rounded styling (e.g., `<div className="bg-surface border rounded-xl overflow-hidden">`), **remove that outer wrapper** — `TableScroller` provides equivalent styling. Keep any wrapper that is doing something else (e.g., adding margin, holding a header above the table).

If a table is inside a tab panel or conditional block, wrap each instance separately.

If a file has multiple tables (e.g., `BankAccountDetailPage.tsx` has different tables on different tabs), wrap each one. They can use different `minWidth` values if appropriate.

- [ ] **Step 3: Typecheck**

```
cd client && npx tsc --noEmit
```

Expected: zero NEW errors.

- [ ] **Step 4: Commit**

```
git add client/src/<modified file>
git commit -m "feat(client): wrap <FileBaseName> tables in TableScroller"
```

Replace `<FileBaseName>` with the file's logical name (e.g., "AccountsPage", "TicketsListView", "BookingInvoiceModal").

---

## Task C: Reconciliation workspace stacking

**Files:**
- Modify: `client/src/pages/accounting/ReconciliationPage.tsx`

The bank-lines and journal-lines panels currently sit side-by-side at `lg` (1024px). At our 680px content floor that's ~340px per side, too narrow. Move the side-by-side breakpoint to `xl` (1280px) so the workspace stacks vertically on smaller laptops.

- [ ] **Step 1: Edit the grid line**

Find line 159 in `client/src/pages/accounting/ReconciliationPage.tsx`:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
```

Change `lg:grid-cols-2` to `xl:grid-cols-2`:

```tsx
<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
```

- [ ] **Step 2: Typecheck**

```
cd client && npx tsc --noEmit
```

Expected: zero NEW errors.

- [ ] **Step 3: Commit**

```
git add client/src/pages/accounting/ReconciliationPage.tsx
git commit -m "feat(client): reconciliation workspace stacks below xl"
```

---

## Task D: Page-level grid responsiveness

Two pages use fixed `grid-cols-3` or `grid-cols-4` that don't fit at 680px content width.

### Task D1: TicketsPage stat row

**Files:**
- Modify: `client/src/pages/tickets/TicketsPage.tsx`

- [ ] **Step 1: Edit the grid line**

Find line 126 in `client/src/pages/tickets/TicketsPage.tsx`:

```tsx
<div className="grid grid-cols-4 gap-4 flex-shrink-0">
```

Change to:

```tsx
<div className="grid grid-cols-2 xl:grid-cols-4 gap-4 flex-shrink-0">
```

- [ ] **Step 2: Typecheck**

```
cd client && npx tsc --noEmit
```

Expected: zero NEW errors.

- [ ] **Step 3: Commit**

```
git add client/src/pages/tickets/TicketsPage.tsx
git commit -m "feat(client): tickets stat row responsive 2/4 cols"
```

### Task D2: JournalEntryEditor meta row

**Files:**
- Modify: `client/src/pages/accounting/JournalEntryEditorPage.tsx`

- [ ] **Step 1: Edit the grid line**

Find line 126:

```tsx
<div className="grid grid-cols-3 gap-3 mb-4">
```

Change to:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
```

- [ ] **Step 2: Typecheck**

```
cd client && npx tsc --noEmit
```

Expected: zero NEW errors.

- [ ] **Step 3: Commit**

```
git add client/src/pages/accounting/JournalEntryEditorPage.tsx
git commit -m "feat(client): journal entry meta row stacks below lg"
```

---

## Task E: Modal max-width viewport fallback

Each modal's outer container has a `max-w-*` cap (e.g., `max-w-md`, `max-w-lg`). Add `max-w-[90vw]` so the modal never exceeds viewport width if a user resizes their browser narrow. At our 1024+ floor this is defense-in-depth — `max-w-md` (448px) already fits 1024px viewports — but the rule is cheap and correct.

**CSS-order caveat:** Tailwind's JIT-generated arbitrary classes like `max-w-[90vw]` are emitted AFTER named utilities like `max-w-md` in the compiled CSS, so a naive `max-w-[90vw] max-w-md` would let `max-w-[90vw]` win at 1024+ (regressing modal width to ~922px). Instead, gate the named cap behind `lg:` so it only applies above our floor:

```tsx
{/* Before */}  max-w-md
{/* After  */}  max-w-[90vw] lg:max-w-md
```

At ≥1024px, `lg:max-w-md` is emitted after `max-w-[90vw]` in Tailwind's media-query block and wins — modal renders at its original 448px. At <1024px (out of scope but defended), `max-w-[90vw]` wins — modal caps at 90% viewport.

The size class mapping per modal:

| Existing | New |
|---|---|
| `max-w-md` | `max-w-[90vw] lg:max-w-md` |
| `max-w-lg` | `max-w-[90vw] lg:max-w-lg` |
| `max-w-xl` | `max-w-[90vw] lg:max-w-xl` |
| `max-w-2xl` | `max-w-[90vw] lg:max-w-2xl` |
| `max-w-3xl` | `max-w-[90vw] lg:max-w-3xl` |

### Task E (single commit per file)

For **each file** in the modal list, follow these steps:

- [ ] **Step 1: Edit the outer modal container**

Open the file. Find the line containing the modal's `max-w-*` class (typically a `<div>` with `bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md ...` or similar). Identify the existing size class, then apply the transformation from the table above.

```tsx
{/* Before (e.g. PaymentFormModal) */}
<div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 border border-outline-variant">

{/* After */}
<div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-[90vw] lg:max-w-md p-6 border border-outline-variant">
```

Verify by visually checking the modal renders identically at 1024px viewport (no change). At narrower viewports (e.g., resize Chrome to 600px) the modal should now fit without overflow.

For files that have multiple modals (rare), apply to each.

- [ ] **Step 2: Typecheck**

```
cd client && npx tsc --noEmit
```

Expected: zero NEW errors.

- [ ] **Step 3: Commit**

```
git add client/src/<modified file>
git commit -m "feat(client): <ModalName> caps at 90vw below lg"
```

---

## Task F: Manual smoke + final commit

This task verifies the spec's acceptance criteria are met. No code changes unless a regression is found.

- [ ] **Step 1: Confirm dev servers are running**

Server: `http://localhost:3001/api/v1/config` returns 200 with `ACCOUNTING:true`.
Client: `http://localhost:5173` returns 200.

If not running, start them:
```
cd server && npm run dev   # background
cd client && npm run dev   # background
```

- [ ] **Step 2: Walk the app at 1024px viewport**

Open Chrome DevTools → Toggle device toolbar → Set responsive width to 1024px. Log in as ADMIN. Visit every page in the sidebar:

- Dashboard
- Apartments (list + detail)
- Bookings (list)
- Tenants (list + detail)
- Buildings
- Payments
- Tickets (kanban + list views)
- Reports
- Accounting → expand the group:
  - Accounts
  - Journal Entries (list + editor)
  - General Ledger
  - Trial Balance
  - Mapping
  - VAT Return
  - Income Statement
  - Balance Sheet
  - Cash Flow
  - Periods
  - Banking → bank account detail → reconciliation
- Users
- Settings

For each page, check:
- No horizontal scrollbar on the BODY (page-level overflow)
- Tables: horizontal scroll **inside** the table container, not on the page
- Header/TopBar: no clipping, search visible, user menu reachable
- Modals open and fit

Open one form modal on each affected page (Apartments, Bookings, Tenants, etc.) and verify it fits.

- [ ] **Step 3: Walk the app at 1280px**

Set viewport to 1280px. Spot-check:
- Reconciliation workspace switches to side-by-side
- TopBar search regains its `w-80` width

- [ ] **Step 4: Walk the app at 1536px**

Set viewport to 1536px. Spot-check that nothing looks unexpectedly stretched. Layouts should look identical to or wider than the 1280px state.

- [ ] **Step 5: Verify acceptance criteria**

From the spec:
- [ ] Every page renders without horizontal overflow at 1024px
- [ ] No table clips outside its container at 1024px
- [ ] Reconciliation stacks below 1280px and goes side-by-side at 1280px+
- [ ] Client typecheck unchanged (still only pre-existing `LoginPage.tsx` error)
- [ ] No clipping, no overlapping text, no cut-off controls at 1024/1280/1536

- [ ] **Step 6: Final commit (only if smoke surfaced fixes)**

If the walk-through found issues, fix them, then:

```
git add -p
git commit -m "fix(client): address issues found during responsive smoke test"
```

If nothing surfaced, skip this step.

---

## Done

After all tasks: working tree clean, dev servers happy, every page renders without horizontal page-level overflow from 1024px to 2560px.

Merge to master per the existing workflow (no-ff merge, keep feature branch locally).

---

## Self-review notes

**Spec coverage:**

- [x] Breakpoints & content widths (spec §1) — no code change; Tailwind defaults already match.
- [x] `<TableScroller>` primitive (spec §2) — Task A1.
- [x] Existing `Table` component gets scroll (implicit in spec §4 "every `<table>`") — Task A2.
- [x] AppLayout `min-w-0` (spec §3) — Task A3.
- [x] TopBar padding + search (spec §3) — Task A4.
- [x] Sidebar (spec §3) — already done in a previous commit.
- [x] Wrap every `<table>` in TableScroller (spec §4 Tables) — Task B (18 files).
- [x] Grid responsiveness (spec §4 Grid) — Task D (only 2 pages had truly fixed grids; the rest are already responsive).
- [x] Reconciliation workspace stacking (spec §4 Reconciliation) — Task C.
- [x] Modal max-width fallback (spec §4 Modals) — Task E (15 files).
- [x] Acceptance criteria verification (spec §6) — Task F.

**Placeholder scan:** Each step shows the exact code or class change. No "TBD", "implement similar to", or "add error handling" — every change is enumerated.

**Type consistency:**
- `TableScroller` props (`children`, `minWidth?: number`, `className?: string`) — defined in A1, used in B. ✓
- `Table` component `minWidth` prop — added in A2; existing consumers of `Table` get the default 720 silently. ✓
- All Tailwind class changes use the project's MD3 tokens (`surface-container-lowest`, `outline-variant`, etc.) — consistent with `client/src/index.css` token names. ✓

**Notes on what is deliberately omitted from the plan:**
- No new unit tests. `TableScroller` is a ~10-line passthrough; testing its Tailwind classes would be brittle. The spec's acceptance criteria is manual visual verification.
- Modal-internal `grid-cols-2` → `grid-cols-1 lg:grid-cols-2` (spec §4) is functionally a no-op at our 1024+ floor (we are always at the `lg+` state). Skipped.
- LoginPage, Sidebar, BuildingSelector, and most page grids are already responsive enough at 1024+ floor. Not modified.
