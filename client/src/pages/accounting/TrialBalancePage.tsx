import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../../lib/api/accounting';
import api from '../../lib/axios';

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;

export default function TrialBalancePage() {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [buildingId, setBuildingId] = useState<number | ''>('');

  const { data: buildings = [] } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => (await api.get('/buildings')).data as { id: number; name: string }[],
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data as { booksMode: string },
  });
  const showBuildingFilter = settings?.booksMode === 'PER_BUILDING';

  const { data } = useQuery({
    queryKey: ['accounting', 'tb', { asOf, buildingId }],
    queryFn: () => reportsApi.trialBalance({ asOf, buildingId: buildingId === '' ? undefined : buildingId }),
  });

  const grouped = useMemo(() => {
    const by: Record<string, any[]> = {};
    for (const r of data?.rows ?? []) (by[r.accountType] = by[r.accountType] ?? []).push(r);
    return by;
  }, [data]);

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const r of data?.rows ?? []) { d += Number(r.totalDebit); c += Number(r.totalCredit); }
    return { d, c, ok: Math.abs(d - c) < 0.005 };
  }, [data]);

  const csvUrl = `/api/v1/accounting/reports/trial-balance.csv?asOf=${asOf}${buildingId ? `&buildingId=${buildingId}` : ''}`;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.tb.title', 'Trial Balance')}</h1>
      {!totals.ok && data && (
        <div className="mb-4 p-3 bg-error-container text-error rounded">
          ⚠ Out of balance — total debits ({totals.d.toFixed(2)}) ≠ total credits ({totals.c.toFixed(2)}). Investigate immediately.
        </div>
      )}
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        {showBuildingFilter && (
          <label>Building
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : '')} className="border border-outline-variant rounded px-2 py-1 ml-1">
              <option value="">All (consolidated)</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>
      </div>
      <table className="w-full text-sm bg-surface-container-low rounded">
        <thead className="text-on-surface-variant">
          <tr>
            <th className="px-2 py-1 text-left">Code</th>
            <th className="px-2 py-1 text-left">Name</th>
            <th className="px-2 py-1 text-right">Debit</th>
            <th className="px-2 py-1 text-right">Credit</th>
            <th className="px-2 py-1 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {TYPE_ORDER.map((type) =>
            grouped[type]?.length ? (
              <>
                <tr key={`${type}-header`} className="bg-surface-container-high font-bold">
                  <td colSpan={5} className="px-2 py-1">{type}</td>
                </tr>
                {grouped[type].map((r: any) => (
                  <tr key={r.accountId} className="border-t border-outline-variant">
                    <td className="px-2 py-1 font-mono">{r.accountCode}</td>
                    <td className="px-2 py-1">{r.accountName}</td>
                    <td className="px-2 py-1 text-right">{r.totalDebit}</td>
                    <td className="px-2 py-1 text-right">{r.totalCredit}</td>
                    <td className="px-2 py-1 text-right">{r.netBalance}</td>
                  </tr>
                ))}
              </>
            ) : null,
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-on-surface font-bold">
            <td colSpan={2} className="px-2 py-2 text-right">Grand totals</td>
            <td className="px-2 py-2 text-right">{totals.d.toFixed(2)}</td>
            <td className="px-2 py-2 text-right">{totals.c.toFixed(2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
