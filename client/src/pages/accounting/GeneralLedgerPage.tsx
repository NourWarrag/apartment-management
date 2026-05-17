import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { accountsApi, reportsApi } from '../../lib/api/accounting';
import TableScroller from '../../components/ui/TableScroller';
import api from '../../lib/axios';

export default function GeneralLedgerPage() {
  const { t } = useTranslation();
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [buildingId, setBuildingId] = useState<number | ''>('');

  const { data: accounts = [] } = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: accountsApi.list });
  const { data: buildings = [] } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => (await api.get('/buildings')).data as { id: number; name: string }[],
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data as { booksMode: string },
  });
  const showBuildingFilter = settings?.booksMode === 'PER_BUILDING';

  const { data: gl = [] } = useQuery({
    queryKey: ['accounting', 'gl', { accountIds, dateFrom, dateTo, buildingId }],
    queryFn: () =>
      accountIds.length === 0
        ? Promise.resolve([])
        : reportsApi.generalLedger({
            accountIds,
            dateFrom,
            dateTo,
            buildingId: buildingId === '' ? undefined : buildingId,
          }),
    enabled: accountIds.length > 0,
  });

  const csvUrl =
    accountIds.length === 0
      ? null
      : `/api/v1/accounting/reports/general-ledger.csv?accountIds=${accountIds.join(',')}&dateFrom=${dateFrom}&dateTo=${dateTo}${buildingId ? `&buildingId=${buildingId}` : ''}`;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.gl.title', 'General Ledger')}</h1>
      <div className="mb-4 flex flex-wrap gap-3 items-end text-sm">
        <label>
          Accounts
          <select
            multiple
            value={accountIds.map(String)}
            onChange={(e) => setAccountIds(Array.from(e.target.selectedOptions, (o) => Number(o.value)))}
            className="border border-outline-variant rounded px-2 py-1 ml-1 min-w-[200px] h-32"
          >
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
        </label>
        <label>From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <label>To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        {showBuildingFilter && (
          <label>Building
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : '')} className="border border-outline-variant rounded px-2 py-1 ml-1">
              <option value="">All</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        {csvUrl && <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>}
      </div>

      {accountIds.length === 0 && <div className="text-on-surface-variant">Select one or more accounts to view the ledger.</div>}

      {gl.map((acc) => (
        <div key={acc.accountId} className="mb-8">
          <h2 className="font-bold mb-2">{acc.accountCode} – {acc.accountName}</h2>
          <TableScroller minWidth={1000}>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr>
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Entry #</th>
                  <th className="px-2 py-1 text-left">Memo</th>
                  <th className="px-2 py-1 text-right">Debit</th>
                  <th className="px-2 py-1 text-right">Credit</th>
                  <th className="px-2 py-1 text-right">Running</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-surface-container-high">
                  <td colSpan={5} className="px-2 py-1 text-right">Opening balance</td>
                  <td className="px-2 py-1 text-right font-medium">{acc.openingBalance}</td>
                </tr>
                {acc.lines.map((l, i) => (
                  <tr key={i} className="border-t border-outline-variant">
                    <td className="px-2 py-1">{l.date.slice(0, 10)}</td>
                    <td className="px-2 py-1 font-mono">
                      <Link to={`/accounting/journal-entries/${l.entryId}`} className="text-primary">{l.entryNumber}</Link>
                    </td>
                    <td className="px-2 py-1">{l.memo ?? '—'}</td>
                    <td className="px-2 py-1 text-right">{l.debit}</td>
                    <td className="px-2 py-1 text-right">{l.credit}</td>
                    <td className="px-2 py-1 text-right">{l.runningBalance}</td>
                  </tr>
                ))}
                <tr className="bg-surface-container-high">
                  <td colSpan={5} className="px-2 py-1 text-right font-bold">Closing balance</td>
                  <td className="px-2 py-1 text-right font-bold">{acc.closingBalance}</td>
                </tr>
              </tbody>
            </table>
          </TableScroller>
        </div>
      ))}
    </div>
  );
}
