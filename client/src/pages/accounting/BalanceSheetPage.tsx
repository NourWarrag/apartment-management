import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TableScroller from '../../components/ui/TableScroller';
import { statementsApi, type BalanceSheetSection } from '../../lib/api/accounting-phase3';
import api from '../../lib/axios';

export default function BalanceSheetPage() {
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
    queryKey: ['accounting', 'balance-sheet', { asOf, buildingId }],
    queryFn: () => statementsApi.balanceSheet({ asOf, buildingId: buildingId === '' ? undefined : buildingId }),
  });

  const csvUrl = `/api/v1/accounting/reports/balance-sheet.csv?asOf=${asOf}${buildingId ? `&buildingId=${buildingId}` : ''}`;

  const SectionTable = ({ section }: { section: BalanceSheetSection }) => (
    <TableScroller minWidth={720}>
      <table className="w-full text-sm bg-surface-container-low rounded">
        <thead className="text-on-surface-variant">
          <tr><th className="px-2 py-1 text-left">Code</th><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-right">Balance</th></tr>
        </thead>
        <tbody>
          {section.rows.map((r) => (
            <tr key={r.accountId} className="border-t border-outline-variant">
              <td className="px-2 py-1 font-mono">{r.code}</td>
              <td className="px-2 py-1">{r.name}</td>
              <td className="px-2 py-1 text-right">{r.balance}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Total</td><td className="px-2 py-1 text-right">{section.total}</td></tr></tfoot>
      </table>
    </TableScroller>
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.balance.title', 'Balance Sheet')}</h1>
      {data && !data.isBalanced && (
        <div className="mb-4 p-3 bg-error-container text-error rounded">
          ⚠ Out of balance — Assets ({data.assets.total}) ≠ Liabilities + Equity + Current Year Earnings ({data.totalLiabilitiesAndEquity}). Investigate.
        </div>
      )}
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        {showBuildingFilter && (
          <label>Building
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : '')} className="border border-outline-variant rounded px-2 py-1 ml-1">
              <option value="">All</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>
      </div>
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section><h2 className="font-bold mb-2">Assets</h2><SectionTable section={data.assets} /></section>
          <div>
            <section className="mb-4"><h2 className="font-bold mb-2">Liabilities</h2><SectionTable section={data.liabilities} /></section>
            <section><h2 className="font-bold mb-2">Equity</h2>
              <SectionTable section={data.equity} />
              <div className="mt-2 px-2 py-1 bg-surface-container-high text-sm flex justify-between">
                <span>Current Year Earnings</span><span className="font-mono">{data.currentYearIncome}</span>
              </div>
              <div className="mt-2 px-2 py-1 font-bold border-t-2 border-on-surface text-sm flex justify-between">
                <span>Total L + E + Current</span><span className="font-mono">{data.totalLiabilitiesAndEquity}</span>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
