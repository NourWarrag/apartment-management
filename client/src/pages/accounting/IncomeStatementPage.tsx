import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TableScroller from '../../components/ui/TableScroller';
import { statementsApi } from '../../lib/api/accounting-phase3';
import api from '../../lib/axios';

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export default function IncomeStatementPage() {
  const { t } = useTranslation();
  const init = currentMonthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
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
    queryKey: ['accounting', 'income-statement', { from, to, buildingId }],
    queryFn: () => statementsApi.incomeStatement({ from, to, buildingId: buildingId === '' ? undefined : buildingId }),
  });

  const csvUrl = `/api/v1/accounting/reports/income-statement.csv?from=${from}&to=${to}${buildingId ? `&buildingId=${buildingId}` : ''}`;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.income.title', 'Income Statement')}</h1>
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
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
        <>
          <section className="mb-6">
            <h2 className="font-bold mb-2">Income</h2>
            <TableScroller minWidth={720}>
              <table className="w-full text-sm bg-surface-container-low rounded">
                <thead className="text-on-surface-variant">
                  <tr><th className="px-2 py-1 text-left">Code</th><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {data.income.rows.map((r) => (
                    <tr key={r.accountId} className="border-t border-outline-variant">
                      <td className="px-2 py-1 font-mono">{r.code}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1 text-right">{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Total Income</td><td className="px-2 py-1 text-right">{data.income.total}</td></tr></tfoot>
              </table>
            </TableScroller>
          </section>

          <section className="mb-6">
            <h2 className="font-bold mb-2">Expenses</h2>
            <TableScroller minWidth={720}>
              <table className="w-full text-sm bg-surface-container-low rounded">
                <thead className="text-on-surface-variant">
                  <tr><th className="px-2 py-1 text-left">Code</th><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {data.expenses.rows.map((r) => (
                    <tr key={r.accountId} className="border-t border-outline-variant">
                      <td className="px-2 py-1 font-mono">{r.code}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1 text-right">{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Total Expenses</td><td className="px-2 py-1 text-right">{data.expenses.total}</td></tr></tfoot>
              </table>
            </TableScroller>
          </section>

          <div className={`text-right text-lg font-bold border-t-2 border-on-surface pt-3 ${Number(data.netIncome) >= 0 ? 'text-primary' : 'text-error'}`}>
            Net Income: <span className="font-mono">{data.netIncome}</span>
          </div>
        </>
      )}
    </div>
  );
}
