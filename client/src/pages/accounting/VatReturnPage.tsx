import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { vatReturnApi } from '../../lib/api/accounting-phase2';

function previousMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export default function VatReturnPage() {
  const { t } = useTranslation();
  const init = previousMonthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data } = useQuery({
    queryKey: ['accounting', 'vat-return', { from, to }],
    queryFn: () => vatReturnApi.get({ from, to }),
  });

  const csvUrl = `/api/v1/accounting/reports/vat-return.csv?from=${from}&to=${to}`;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.vat.title', 'VAT Return')}</h1>
      <div className="mb-4 flex gap-3 items-end text-sm">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-outline-variant rounded px-2 py-1 ml-1" /></label>
        <a href={csvUrl} className="ml-auto px-3 py-1 border border-primary text-primary rounded">Export CSV</a>
      </div>
      {data && (
        <>
          <section className="mb-6">
            <h2 className="font-bold mb-2">Output VAT (tax collected)</h2>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr><th className="px-2 py-1 text-left">Tax Code</th><th className="px-2 py-1 text-right">Net</th><th className="px-2 py-1 text-right">VAT</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`out-${r.taxCodeId}`} className="border-t border-outline-variant">
                    <td className="px-2 py-1">{r.code} ({r.ratePct}%){r.isExempt ? ' — exempt' : ''}</td>
                    <td className="px-2 py-1 text-right">{r.output.net}</td>
                    <td className="px-2 py-1 text-right">{r.output.vat}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Output VAT</td><td className="px-2 py-1 text-right">{data.outputVatTotal}</td></tr></tfoot>
            </table>
          </section>

          <section className="mb-6">
            <h2 className="font-bold mb-2">Input VAT (tax paid)</h2>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr><th className="px-2 py-1 text-left">Tax Code</th><th className="px-2 py-1 text-right">Net</th><th className="px-2 py-1 text-right">VAT</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`in-${r.taxCodeId}`} className="border-t border-outline-variant">
                    <td className="px-2 py-1">{r.code} ({r.ratePct}%)</td>
                    <td className="px-2 py-1 text-right">{r.input.net}</td>
                    <td className="px-2 py-1 text-right">{r.input.vat}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t border-on-surface"><td colSpan={2} className="px-2 py-1 text-right">Input VAT</td><td className="px-2 py-1 text-right">{data.inputVatTotal}</td></tr></tfoot>
            </table>
          </section>

          <div className="text-right text-lg font-bold border-t-2 border-on-surface pt-3">
            Net VAT Due: <span className="font-mono">{data.netVatDue}</span>
          </div>
        </>
      )}
    </div>
  );
}
