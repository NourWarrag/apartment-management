import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TableScroller from '../../components/ui/TableScroller';
import { statementsApi } from '../../lib/api/accounting-phase3';

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export default function CashFlowPage() {
  const { t } = useTranslation();
  const init = currentMonthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data } = useQuery({
    queryKey: ['accounting', 'cash-flow', { from, to }],
    queryFn: () => statementsApi.cashFlow({ from, to }),
  });

  const csvUrl = `/api/v1/accounting/reports/cash-flow.csv?from=${from}&to=${to}`;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.cashflow.title', 'Cash Flow Statement')}</h1>
      {data && !data.reconcilesToCash && (
        <div className="mb-4 p-3 bg-error-container text-error rounded">
          ⚠ Cash flow doesn't reconcile. Beginning ({data.beginningCash}) + Operations ({data.netCashFromOperations}) ≠ Ending ({data.endingCash}).
        </div>
      )}
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>
      </div>
      {data && (
        <div className="bg-surface-container-low rounded p-4 text-sm space-y-2">
          <div className="flex justify-between"><span>Net Income</span><span className="font-mono">{data.netIncome}</span></div>
          <div className="mt-3">
            <div className="font-bold mb-1">Working Capital Changes</div>
            {data.workingCapitalChanges.length === 0 ? (
              <div className="text-on-surface-variant text-xs">No working capital changes in period.</div>
            ) : (
              <TableScroller minWidth={720}>
                <table className="w-full text-xs">
                  <tbody>
                    {data.workingCapitalChanges.map((wc) => (
                      <tr key={wc.accountId} className="border-t border-outline-variant">
                        <td className="py-1 font-mono">{wc.code}</td>
                        <td className="py-1">{wc.name}</td>
                        <td className="py-1 text-right font-mono">{wc.change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroller>
            )}
          </div>
          <div className="flex justify-between font-bold pt-2 border-t border-outline-variant"><span>Net Cash from Operations</span><span className="font-mono">{data.netCashFromOperations}</span></div>
          <div className="flex justify-between pt-3 border-t border-outline-variant"><span>Beginning Cash</span><span className="font-mono">{data.beginningCash}</span></div>
          <div className="flex justify-between font-bold border-t-2 border-on-surface pt-2"><span>Ending Cash</span><span className="font-mono">{data.endingCash}</span></div>
        </div>
      )}
    </div>
  );
}
