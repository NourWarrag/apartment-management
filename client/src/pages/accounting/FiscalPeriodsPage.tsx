import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TableScroller from '../../components/ui/TableScroller';
import { periodsApi, yearCloseApi, type FiscalPeriod } from '../../lib/api/accounting-phase3';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function FiscalPeriodsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [closingYear, setClosingYear] = useState<number | null>(null);
  const [closeResult, setCloseResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: periods = [] } = useQuery({ queryKey: ['accounting', 'periods'], queryFn: () => periodsApi.list() });

  const lockMut = useMutation({
    mutationFn: ({ y, m }: { y: number; m: number }) => periodsApi.lock(y, m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'periods'] }),
  });
  const unlockMut = useMutation({
    mutationFn: ({ y, m }: { y: number; m: number }) => periodsApi.unlock(y, m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'periods'] }),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to unlock'),
  });
  const closeMut = useMutation({
    mutationFn: (y: number) => yearCloseApi.close(y),
    onSuccess: (r) => { setCloseResult(r); setClosingYear(null); qc.invalidateQueries({ queryKey: ['accounting', 'periods'] }); },
    onError: (e: any) => { setErr(e?.response?.data?.message ?? 'Close failed'); setClosingYear(null); },
  });

  // Group periods by year
  const years = Array.from(new Set(periods.map((p) => p.year))).sort();
  const byYearMonth = new Map<string, FiscalPeriod>(periods.map((p) => [`${p.year}-${p.month}`, p]));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.periods.title', 'Fiscal Periods')}</h1>
      {err && <div className="mb-4 p-3 bg-error-container text-error rounded">{err}</div>}
      {closeResult && (
        <div className="mb-4 p-3 bg-secondary-container text-primary rounded">
          Year closed. Closing entry: <span className="font-mono">{closeResult.entryNumber}</span>
        </div>
      )}

      {years.length === 0 ? (
        <div className="text-on-surface-variant">No fiscal periods yet. Periods are created automatically when journal entries are posted.</div>
      ) : (
        <TableScroller minWidth={800}>
          <table className="text-sm">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left">Year</th>
                {MONTHS.map((m) => <th key={m} className="px-2 py-1 text-center">{m}</th>)}
                <th className="px-2 py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const dec = byYearMonth.get(`${y}-12`);
                const closed = dec?.closingEntryId !== null && dec?.closingEntryId !== undefined;
                return (
                  <tr key={y} className="border-t border-outline-variant">
                    <td className="px-2 py-1 font-bold">{y}</td>
                    {MONTHS.map((_, idx) => {
                      const p = byYearMonth.get(`${y}-${idx + 1}`);
                      const status = p?.status ?? 'OPEN';
                      return (
                        <td key={idx} className="px-2 py-1 text-center">
                          <button
                            disabled={closed}
                            onClick={() => {
                              if (status === 'OPEN') lockMut.mutate({ y, m: idx + 1 });
                              else unlockMut.mutate({ y, m: idx + 1 });
                            }}
                            className={`px-2 py-0.5 rounded text-xs ${status === 'LOCKED' ? 'bg-surface-container-high text-on-surface-variant' : 'bg-secondary-container text-primary'} disabled:opacity-50`}
                            title={status}
                          >
                            {status === 'LOCKED' ? '🔒' : '○'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right">
                      {!closed ? (
                        <button
                          onClick={() => { if (window.confirm(`Close fiscal year ${y}? This locks all 12 months and posts the closing JE to Retained Earnings.`)) { setClosingYear(y); closeMut.mutate(y); } }}
                          disabled={closingYear === y}
                          className="px-2 py-1 rounded bg-primary text-on-primary text-xs disabled:opacity-50"
                        >
                          {closingYear === y ? 'Closing…' : `Close ${y}`}
                        </button>
                      ) : (
                        <span className="text-xs text-on-surface-variant">Closed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroller>
      )}
    </div>
  );
}
