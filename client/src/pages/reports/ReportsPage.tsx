import { useReportsBuildings, BuildingReportRow } from '../../hooks/useReportsBuildings';

function formatAed(n: number) {
  return `AED ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export default function ReportsPage() {
  const { data = [], isLoading, isError } = useReportsBuildings();

  const rows = data.filter(r => r.buildingId !== null);
  const global = data.find(r => r.buildingId === null);

  const thCls = 'px-4 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-wider text-left';
  const tdCls = 'px-4 py-3 text-sm text-on-surface';
  const tdNum = 'px-4 py-3 text-sm text-on-surface text-right';

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
        <td className={tdNum}>{formatPct(r.occupancyRate)}</td>
        <td className={tdNum}>{formatAed(r.monthlyRevenue)}</td>
        <td className={tdNum}>{r.openTickets}</td>
      </tr>
    );
  }

  return (
    <div className="space-y-widget-gap">
      <div>
        <h2 className="text-display-lg text-primary">Reports</h2>
        <p className="text-on-surface-variant text-body-base mt-1">Per-building performance summary.</p>
      </div>

      {isLoading ? (
        <div className="text-on-surface-variant text-sm p-8 text-center">Loading…</div>
      ) : isError ? (
        <div className="text-error text-sm p-8 text-center">Failed to load report data.</div>
      ) : (
        <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className={thCls}>Building</th>
                  <th className={thCls + ' text-right'}>Total Apts</th>
                  <th className={thCls + ' text-right'}>Occupied</th>
                  <th className={thCls + ' text-right'}>Occupancy</th>
                  <th className={thCls + ' text-right'}>Monthly Revenue</th>
                  <th className={thCls + ' text-right'}>Open Tickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map(r => renderRow(r))}
                {global && renderRow(global, true)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
