import { useState } from 'react';
import DateRangePicker, { DateRange } from '../../components/reports/DateRangePicker';
import { exportToCsv } from '../../lib/exportCsv';
import { useReportsRevenue } from '../../hooks/useReportsRevenue';
import { useReportsOccupancy } from '../../hooks/useReportsOccupancy';
import { useReportsOutstanding } from '../../hooks/useReportsOutstanding';
import { useReportsMaintenance } from '../../hooks/useReportsMaintenance';
import { useReportsBuildings, BuildingReportRow } from '../../hooks/useReportsBuildings';

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

const thCls = 'px-4 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-wider text-left';
const tdCls = 'px-4 py-3 text-sm text-on-surface';
const tdNum = 'px-4 py-3 text-sm text-on-surface text-right tabular-nums';

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
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
        <TableShell>
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant">
              <th className={thCls}>Payment Method</th>
              <th className={thCls + ' text-right'}>Count</th>
              <th className={thCls + ' text-right'}>Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {data.byMethod.map((r) => (
              <tr key={r.method} className="hover:bg-surface-container-low transition-colors">
                <td className={tdCls}>{r.method}</td>
                <td className={tdNum}>{r.count}</td>
                <td className={tdNum}>{formatAed(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>

        <TableShell>
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant">
              <th className={thCls}>Month</th>
              <th className={thCls + ' text-right'}>Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {data.byMonth.map((r) => (
              <tr key={r.month} className="hover:bg-surface-container-low transition-colors">
                <td className={tdCls}>{r.month}</td>
                <td className={tdNum}>{formatAed(r.amount)}</td>
              </tr>
            ))}
            {data.byMonth.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-sm text-on-surface-variant text-center">
                  No data for selected period
                </td>
              </tr>
            )}
          </tbody>
        </TableShell>
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
      <TableShell>
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant">
            <th className={thCls}>Month</th>
            <th className={thCls + ' text-right'}>Occupied Apts</th>
            <th className={thCls + ' text-right'}>Total Apts</th>
            <th className={thCls + ' text-right'}>Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {data.map((r) => (
            <tr key={r.month} className="hover:bg-surface-container-low transition-colors">
              <td className={tdCls}>{r.month}</td>
              <td className={tdNum}>{r.occupied}</td>
              <td className={tdNum}>{r.total}</td>
              <td className={`${tdNum} font-bold ${rateColor(r.rate)}`}>{formatPct(r.rate)}</td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-sm text-on-surface-variant text-center">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </TableShell>
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
      <TableShell>
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant">
            <th className={thCls}>Tenant</th>
            <th className={thCls}>Apartment</th>
            <th className={thCls + ' text-right'}>Pending Amount</th>
            <th className={thCls + ' text-right'}>Oldest Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {data.map((r) => (
            <tr key={`${r.tenantName}-${r.apartmentNumber}`} className="hover:bg-surface-container-low transition-colors">
              <td className={tdCls}>{r.tenantName}</td>
              <td className={tdCls}>{r.apartmentNumber}</td>
              <td className={`${tdNum} text-error font-medium`}>{formatAed(r.pendingAmount)}</td>
              <td className={tdNum}>{formatDate(r.oldestDue)}</td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-sm text-on-surface-variant text-center">
                No outstanding balances
              </td>
            </tr>
          )}
        </tbody>
      </TableShell>
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
        <TableShell>
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant">
              <th className={thCls}>Status</th>
              <th className={thCls + ' text-right'}>Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {data.byStatus.map((r) => (
              <tr key={r.status} className="hover:bg-surface-container-low transition-colors">
                <td className={tdCls}>{r.status}</td>
                <td className={tdNum}>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        <TableShell>
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant">
              <th className={thCls}>Type</th>
              <th className={thCls + ' text-right'}>Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {data.byType.map((r) => (
              <tr key={r.type} className="hover:bg-surface-container-low transition-colors">
                <td className={tdCls}>{r.type}</td>
                <td className={tdNum}>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
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
    const rowCls = isGlobal
      ? 'bg-surface-container font-bold border-t-2 border-outline-variant'
      : 'hover:bg-surface-container-low transition-colors';
    return (
      <tr key={r.buildingId ?? 'global'} className={rowCls}>
        <td className={tdCls}>
          {r.buildingCode && (
            <span className="text-[10px] font-bold bg-secondary/10 text-secondary px-1.5 py-0.5 rounded uppercase tracking-wide mr-2">
              {r.buildingCode}
            </span>
          )}
          {r.buildingName}
        </td>
        <td className={tdNum}>{r.totalApartments}</td>
        <td className={tdNum}>{r.occupied}</td>
        <td className={tdNum}>{Math.round(r.occupancyRate * 100)}%</td>
        <td className={tdNum}>{formatAed(r.monthlyRevenue)}</td>
        <td className={tdNum}>{r.openTickets}</td>
      </tr>
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
      <TableShell>
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant">
            <th className={thCls}>Building</th>
            <th className={thCls + ' text-right'}>Total Apts</th>
            <th className={thCls + ' text-right'}>Occupied</th>
            <th className={thCls + ' text-right'}>Occupancy</th>
            <th className={thCls + ' text-right'}>Revenue</th>
            <th className={thCls + ' text-right'}>Open Tickets</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {rows.map((r) => renderRow(r))}
          {global && renderRow(global, true)}
        </tbody>
      </TableShell>
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
