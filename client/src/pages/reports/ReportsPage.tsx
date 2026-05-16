import { useState } from 'react';
import DateRangePicker, { DateRange } from '../../components/reports/DateRangePicker';
import { exportToCsv } from '../../lib/exportCsv';
import { useReportsRevenue } from '../../hooks/useReportsRevenue';
import { useReportsOccupancy } from '../../hooks/useReportsOccupancy';
import { useReportsOutstanding } from '../../hooks/useReportsOutstanding';
import { useReportsMaintenance } from '../../hooks/useReportsMaintenance';
import { useReportsBuildings, BuildingReportRow } from '../../hooks/useReportsBuildings';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';

type TabId = 'revenue' | 'occupancy' | 'outstanding' | 'maintenance' | 'buildings';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'buildings', label: 'Buildings' },
];

function formatAed(n: number) {
  return `AED ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPct(n: number) {
  return `${n}%`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function LoadingState() {
  return <div className="text-on-surface-variant text-sm p-8 text-center">Loading…</div>;
}

function ErrorState() {
  return <div className="text-error text-sm p-8 text-center">Failed to load report data.</div>;
}

function ExportBar({ onCsv }: { onCsv: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-2 print:hidden">
      <button
        onClick={onCsv}
        className="text-xs px-3 py-1.5 border border-outline-variant rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
      >
        Download CSV
      </button>
      <button
        onClick={() => window.print()}
        className="text-xs px-3 py-1.5 border border-outline-variant rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
      >
        Print / Save PDF
      </button>
    </div>
  );
}

// ─── Tab content components ──────────────────────────────────────────────────

function RevenueTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading, isError } = useReportsRevenue(startDate, endDate);
  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState />;

  return (
    <div className="space-y-4">
      <ExportBar
        onCsv={() =>
          exportToCsv(
            data.byMonth.map((r) => ({ Month: r.month, 'Amount (AED)': r.amount })),
            'revenue-by-month.csv'
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm">
          <div className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-primary">{formatAed(data.totalRevenue)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Table>
          <TableHead headers={['Payment Method', 'Count', 'Amount']} />
          <TableBody>
            {data.byMethod.map((r) => (
              <TableRow key={r.method}>
                <TableCell variant="text">{r.method}</TableCell>
                <TableCell variant="text" align="right" className="tabular-nums">{r.count}</TableCell>
                <TableCell variant="text" align="right" className="tabular-nums">{formatAed(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Table>
          <TableHead headers={['Month', 'Amount']} />
          <TableBody>
            {data.byMonth.map((r) => (
              <TableRow key={r.month}>
                <TableCell variant="text">{r.month}</TableCell>
                <TableCell variant="text" align="right" className="tabular-nums">{formatAed(r.amount)}</TableCell>
              </TableRow>
            ))}
            {data.byMonth.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} variant="muted" align="center" className="py-6">
                  No data for selected period
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function OccupancyTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading, isError } = useReportsOccupancy(startDate, endDate);
  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState />;

  function rateColor(rate: number) {
    if (rate >= 80) return 'text-on-tertiary-container';
    if (rate >= 60) return 'text-secondary';
    return 'text-error';
  }

  return (
    <div className="space-y-4">
      <ExportBar
        onCsv={() =>
          exportToCsv(
            data.map((r) => ({ Month: r.month, Occupied: r.occupied, Total: r.total, 'Rate (%)': r.rate })),
            'occupancy.csv'
          )
        }
      />
      <Table>
        <TableHead headers={['Month', 'Occupied Apts', 'Total Apts', 'Rate']} />
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.month}>
              <TableCell variant="text">{r.month}</TableCell>
              <TableCell variant="text" align="right" className="tabular-nums">{r.occupied}</TableCell>
              <TableCell variant="text" align="right" className="tabular-nums">{r.total}</TableCell>
              <TableCell align="right" className={`tabular-nums font-bold ${rateColor(r.rate)}`}>{formatPct(r.rate)}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} variant="muted" align="center" className="py-6">No data</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function OutstandingTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading, isError } = useReportsOutstanding(startDate, endDate);
  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState />;

  return (
    <div className="space-y-4">
      <ExportBar
        onCsv={() =>
          exportToCsv(
            data.map((r) => ({
              Tenant: r.tenantName,
              Apartment: r.apartmentNumber,
              'Pending (AED)': r.pendingAmount,
              'Oldest Due': r.oldestDue,
            })),
            'outstanding-balances.csv'
          )
        }
      />
      <Table>
        <TableHead headers={['Tenant', 'Apartment', 'Pending Amount', 'Oldest Due']} />
        <TableBody>
          {data.map((r) => (
            <TableRow key={`${r.tenantName}-${r.apartmentNumber}`}>
              <TableCell variant="text">{r.tenantName}</TableCell>
              <TableCell variant="text">{r.apartmentNumber}</TableCell>
              <TableCell align="right" className="tabular-nums text-error font-medium">{formatAed(r.pendingAmount)}</TableCell>
              <TableCell variant="text" align="right" className="tabular-nums">{formatDate(r.oldestDue)}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} variant="muted" align="center" className="py-6">No outstanding balances</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function MaintenanceTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading, isError } = useReportsMaintenance(startDate, endDate);
  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState />;

  return (
    <div className="space-y-4">
      <ExportBar
        onCsv={() =>
          exportToCsv(
            [
              ...data.byStatus.map((r) => ({ Category: 'Status', Key: r.status, Count: r.count })),
              ...data.byType.map((r) => ({ Category: 'Type', Key: r.type, Count: r.count })),
            ],
            'maintenance-summary.csv'
          )
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Table>
          <TableHead headers={['Status', 'Count']} />
          <TableBody>
            {data.byStatus.map((r) => (
              <TableRow key={r.status}>
                <TableCell variant="text">{r.status}</TableCell>
                <TableCell variant="text" align="right" className="tabular-nums">{r.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Table>
          <TableHead headers={['Type', 'Count']} />
          <TableBody>
            {data.byType.map((r) => (
              <TableRow key={r.type}>
                <TableCell variant="text">{r.type}</TableCell>
                <TableCell variant="text" align="right" className="tabular-nums">{r.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function BuildingsTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data = [], isLoading, isError } = useReportsBuildings(startDate, endDate);
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  const rows = data.filter((r) => r.buildingId !== null);
  const global = data.find((r) => r.buildingId === null);

  function renderRow(r: BuildingReportRow, isGlobal = false) {
    const rowCls = isGlobal ? 'bg-surface-container font-bold border-t-2 border-outline-variant' : '';
    return (
      <TableRow key={r.buildingId ?? 'global'} className={rowCls}>
        <TableCell variant="text">
          {r.buildingCode && (
            <Badge variant="tag" tone="secondary" className="mr-2">{r.buildingCode}</Badge>
          )}
          {r.buildingName}
        </TableCell>
        <TableCell variant="text" align="right" className="tabular-nums">{r.totalApartments}</TableCell>
        <TableCell variant="text" align="right" className="tabular-nums">{r.occupied}</TableCell>
        <TableCell variant="text" align="right" className="tabular-nums">{Math.round(r.occupancyRate * 100)}%</TableCell>
        <TableCell variant="text" align="right" className="tabular-nums">{formatAed(r.monthlyRevenue)}</TableCell>
        <TableCell variant="text" align="right" className="tabular-nums">{r.openTickets}</TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-4">
      <ExportBar
        onCsv={() =>
          exportToCsv(
            data.map((r) => ({
              Building: r.buildingName,
              'Total Apts': r.totalApartments,
              Occupied: r.occupied,
              'Occupancy %': Math.round(r.occupancyRate * 100),
              'Revenue (AED)': r.monthlyRevenue,
              'Open Tickets': r.openTickets,
            })),
            'buildings-summary.csv'
          )
        }
      />
      <Table>
        <TableHead headers={['Building', 'Total Apts', 'Occupied', 'Occupancy', 'Revenue', 'Open Tickets']} />
        <TableBody>
          {rows.map((r) => renderRow(r))}
          {global && renderRow(global, true)}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<TabId>('revenue');
  const [range, setRange] = useState<DateRange>({ startDate: '', endDate: '' });

  const sd = range.startDate || undefined;
  const ed = range.endDate || undefined;

  return (
    <div className="space-y-widget-gap">
      <div className="print:hidden">
        <h2 className="text-display-lg text-primary">Reports</h2>
        <p className="text-on-surface-variant text-body-base mt-1">Financial and operational summaries.</p>
      </div>

      <div className="print:hidden">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-outline-variant print:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Print-only title */}
      <div className="hidden print:block text-lg font-bold text-on-surface mb-2">
        {TABS.find((t) => t.id === tab)?.label} Report
        {sd && ed ? ` — ${sd} to ${ed}` : ''}
      </div>

      {/* Tab content */}
      {tab === 'revenue' && <RevenueTab startDate={sd} endDate={ed} />}
      {tab === 'occupancy' && <OccupancyTab startDate={sd} endDate={ed} />}
      {tab === 'outstanding' && <OutstandingTab startDate={sd} endDate={ed} />}
      {tab === 'maintenance' && <MaintenanceTab startDate={sd} endDate={ed} />}
      {tab === 'buildings' && <BuildingsTab startDate={sd} endDate={ed} />}
    </div>
  );
}
