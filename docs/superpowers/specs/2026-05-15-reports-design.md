# Reports Phase Design Spec

## Goal

Expand the existing Reports page from a static buildings summary into a full reporting suite with revenue, occupancy, outstanding balances, and maintenance summaries — all filterable by date range, with CSV download and print-to-PDF export.

## Architecture

Server exposes five JSON endpoints under `/api/v1/reports/`, all gated to ADMIN and FINANCE roles and accepting optional `startDate`/`endDate` query params. The client fetches data on tab change and on date range change. CSV export runs client-side (JSON → Blob → download). PDF export uses `window.print()` with print-only CSS. No server-side rendering or third-party export libraries.

## API Endpoints

All endpoints: `GET /api/v1/reports/<resource>?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Both params optional. If omitted, no date filter is applied (all-time). Dates are interpreted as UTC day boundaries (startDate = 00:00:00 UTC, endDate = 23:59:59 UTC).

### `GET /reports/buildings`

Enhances the existing endpoint with optional date filtering on payment totals.

Response (unchanged shape):
```json
[{ "id": 1, "name": "...", "apartmentCount": 10, "occupiedCount": 7, "totalRevenue": 45000 }]
```

### `GET /reports/revenue`

```json
{
  "totalRevenue": 125000,
  "byMethod": [{ "method": "CASH", "amount": 80000, "count": 32 }],
  "byMonth": [{ "month": "2026-01", "amount": 15000 }]
}
```

Source: `Payment` table, `status = PAID`, filtered by `paidAt`.

### `GET /reports/occupancy`

```json
[{ "month": "2026-01", "occupied": 18, "total": 25, "rate": 72.0 }]
```

Logic: for each calendar month in range, count apartments that had an active booking (booking `startDate <= month end` AND `endDate >= month start`, status not CANCELLED).

### `GET /reports/outstanding`

```json
[{ "tenantName": "Alice", "apartmentNumber": "101", "pendingAmount": 3500, "oldestDue": "2026-03-01" }]
```

Source: `Payment` table, `status = PENDING`. Grouped by tenant. `oldestDue` = earliest `dueDate` among their pending payments. Date filter applies to `dueDate`.

### `GET /reports/maintenance`

```json
{
  "byStatus": [{ "status": "OPEN", "count": 5 }],
  "byType": [{ "type": "MAINTENANCE", "count": 8 }]
}
```

Source: `MaintenanceTicket`. Date filter applies to `createdAt`.

## Client UI

### ReportsPage structure

Single page with a sticky header containing:
- Page title "Reports"
- `DateRangePicker` component (presets + custom inputs)
- Export bar: "Download CSV" button + "Print / Save PDF" button

Five tabs below: **Revenue**, **Occupancy**, **Outstanding**, **Maintenance**, **Buildings**.

Active tab fetches its endpoint on mount and whenever the date range changes. Loading and error states shown inline per tab.

### DateRangePicker

Preset buttons: "Last 30 days", "Last 3 months", "This year", "All time" (clears both dates). Custom: two `<input type="date">` fields (Start / End). Selecting a preset updates both date inputs. Changing a date input deselects any active preset.

### Tab: Revenue

- Summary cards row: Total Revenue, top payment method, number of payments
- Table: Monthly breakdown — Month | Amount | (implicit count not shown, keeps table clean)
- Second table: By payment method — Method | Count | Amount

### Tab: Occupancy

- Table: Month | Occupied | Total | Rate %
- Rate cell color-coded: green ≥ 80%, yellow ≥ 60%, red < 60%

### Tab: Outstanding Balances

- Sortable table (client-side sort): Tenant | Apartment | Pending Amount | Oldest Due Date
- Default sort: Pending Amount descending

### Tab: Maintenance

- Two tables side by side (flex): By Status | By Type — each is Status/Type | Count

### Tab: Buildings

- Existing summary cards, now passing date range to the enhanced endpoint

### Export

**CSV:** `exportToCsv(rows: Record<string, unknown>[], filename: string)` utility in `client/src/lib/exportCsv.ts`. Derives headers from first row's keys. Converts to CSV string, wraps in `Blob('text/csv')`, creates temporary `<a>` and clicks it. Each tab provides its own `toCsvRows()` mapping function.

**PDF:** `window.print()`. Print CSS (`@media print`) hides sidebar, top nav, tab bar, export bar, and DateRangePicker. Only the active tab's table and a generated title remain visible.

## Error Handling

- All new controller functions use `try/catch (err) { next(err); }` pattern (consistent with existing controllers).
- Client shows an inline error message per tab if the fetch fails; does not crash the whole page.
- Export buttons are disabled while data is loading or if an error occurred.

## Testing

- Server: integration tests for each new endpoint covering: no-auth 401, finance-auth 200, date filtering (verify results change), empty range returns zeros/empty arrays.
- Client: no new unit tests (report tabs are thin data-display components); manual smoke test after implementation.

## Out of Scope

- Email delivery of reports
- Scheduled/automated report generation
- Per-building filtering beyond the Buildings tab
- Pagination (reports are aggregate summaries, not row lists)
