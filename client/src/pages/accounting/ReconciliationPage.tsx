import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TableScroller from '../../components/ui/TableScroller';
import { reconciliationsApi } from '../../lib/api/accounting-phase4';
import { accountsApi } from '../../lib/api/accounting';
import { useAuth } from '../../hooks/useAuth';
import { Role } from '@hotel/shared';

export default function ReconciliationPage() {
  const { id } = useParams();
  const recId = Number(id);
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;

  const { data: rec, refetch } = useQuery({
    queryKey: ['accounting', 'reconciliation', recId],
    queryFn: () => reconciliationsApi.get(recId),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: accountsApi.list,
  });

  const [selectedBankLineId, setSelectedBankLineId] = useState<number | null>(null);
  const [selectedJournalLineIds, setSelectedJournalLineIds] = useState<Set<number>>(new Set());
  const [showAdjustment, setShowAdjustment] = useState<number | null>(null); // bankLineId
  const [adjustmentAccount, setAdjustmentAccount] = useState<number | ''>('');
  const [adjustmentMemo, setAdjustmentMemo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const isClosed = rec?.status === 'CLOSED';

  // Compute live difference
  const computed = useMemo(() => {
    if (!rec) return { glBalance: 0, outstandingDeposits: 0, outstandingWithdrawals: 0, expectedBalance: 0, diff: 0 };
    let glBalance = 0;
    let outstandingDeposits = 0;
    let outstandingWithdrawals = 0;
    for (const l of rec.journalLines) {
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      glBalance += debit - credit;
      if (l.reconciliationMatches.length === 0) {
        outstandingDeposits += debit;
        outstandingWithdrawals += credit;
      }
    }
    const stmtBalance = Number(rec.statementBalance);
    const expectedBalance = stmtBalance + outstandingDeposits - outstandingWithdrawals;
    const diff = glBalance - expectedBalance;
    return { glBalance, outstandingDeposits, outstandingWithdrawals, expectedBalance, diff };
  }, [rec]);

  const autoMatchMut = useMutation({
    mutationFn: () => reconciliationsApi.autoMatch(recId),
    onSuccess: () => refetch(),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Auto-match failed'),
  });
  const manualMatchMut = useMutation({
    mutationFn: () => reconciliationsApi.manualMatch(recId, {
      bankStatementLineId: selectedBankLineId!,
      journalLineIds: Array.from(selectedJournalLineIds),
    }),
    onSuccess: () => { refetch(); setSelectedBankLineId(null); setSelectedJournalLineIds(new Set()); setErr(null); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Match failed'),
  });
  const unmatchMut = useMutation({
    mutationFn: (bankLineId: number) => reconciliationsApi.unmatch(recId, bankLineId),
    onSuccess: () => refetch(),
  });
  const adjustmentMut = useMutation({
    mutationFn: () => reconciliationsApi.adjustment(recId, {
      bankStatementLineId: showAdjustment!,
      offsetAccountId: Number(adjustmentAccount),
      memo: adjustmentMemo || undefined,
    }),
    onSuccess: () => {
      refetch();
      setShowAdjustment(null);
      setAdjustmentAccount('');
      setAdjustmentMemo('');
      setErr(null);
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Adjustment failed'),
  });
  const closeMut = useMutation({
    mutationFn: () => reconciliationsApi.close(recId),
    onSuccess: () => refetch(),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Close failed'),
  });
  const reopenMut = useMutation({
    mutationFn: () => reconciliationsApi.reopen(recId),
    onSuccess: () => refetch(),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Reopen failed'),
  });

  if (!rec) return <div className="p-6 text-on-surface-variant">{t('common.loading', 'Loading…')}</div>;

  const matchableJournalLineIds = new Set(
    rec.journalLines.filter((l) => l.reconciliationMatches.length === 0).map((l) => l.id),
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-2xl font-bold">Reconciliation — {rec.bankAccount.name}</h1>
          <p className="text-sm text-on-surface-variant">
            Through {rec.endDate.slice(0, 10)} · Statement balance {rec.statementBalance}
          </p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${isClosed ? 'bg-surface-container-high text-on-surface-variant' : 'bg-secondary-container text-primary'}`}>
          {rec.status}
        </span>
      </div>

      <div className="mb-4 p-3 bg-surface-container-low rounded text-sm flex gap-6">
        <div>GL Balance: <span className="font-mono">{computed.glBalance.toFixed(2)}</span></div>
        <div>Expected: <span className="font-mono">{computed.expectedBalance.toFixed(2)}</span></div>
        <div className={Math.abs(computed.diff) < 0.005 ? 'text-primary' : 'text-error'}>
          Difference: <span className="font-mono">{computed.diff.toFixed(2)}</span>
        </div>
      </div>

      {err && <div className="mb-3 p-2 bg-error-container text-error rounded text-sm">{err}</div>}

      <div className="mb-4 flex gap-2">
        {!isClosed && (
          <>
            <button onClick={() => autoMatchMut.mutate()} disabled={autoMatchMut.isPending} className="px-3 py-1 rounded border border-primary text-primary text-sm disabled:opacity-50">
              {autoMatchMut.isPending ? 'Matching…' : 'Run auto-match'}
            </button>
            <button
              onClick={() => closeMut.mutate()}
              disabled={Math.abs(computed.diff) >= 0.005 || closeMut.isPending}
              className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50"
            >
              {closeMut.isPending ? 'Closing…' : 'Close reconciliation'}
            </button>
          </>
        )}
        {isClosed && isAdmin && (
          <button onClick={() => reopenMut.mutate()} disabled={reopenMut.isPending} className="px-3 py-1 rounded border border-error text-error text-sm disabled:opacity-50">
            Reopen
          </button>
        )}
        <a
          href={`/api/v1/accounting/reconciliations/${recId}/report.csv`}
          className="ml-auto px-3 py-1 border border-outline-variant rounded text-sm"
        >
          Export CSV
        </a>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Bank lines */}
        <section>
          <h2 className="font-bold mb-2">Bank statement lines</h2>
          {rec.bankLines.length === 0 ? (
            <p className="text-on-surface-variant text-sm">No bank lines through {rec.endDate.slice(0, 10)}.</p>
          ) : (
            <TableScroller minWidth={720}>
              <table className="w-full text-sm bg-surface-container-low rounded">
                <thead className="text-on-surface-variant">
                  <tr><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Description</th><th className="px-2 py-1 text-right">Amount</th><th /></tr>
                </thead>
                <tbody>
                  {rec.bankLines.map((l) => {
                    const matched = l.matches.length > 0;
                    const selected = selectedBankLineId === l.id;
                    return (
                      <tr key={l.id} className={`border-t border-outline-variant ${selected ? 'bg-secondary-container/40' : ''}`}>
                        <td className="px-2 py-1">{l.date.slice(0, 10)}</td>
                        <td className="px-2 py-1">{l.description}</td>
                        <td className="px-2 py-1 text-right font-mono">{l.amount}</td>
                        <td className="px-2 py-1 text-right">
                          {matched ? (
                            !isClosed && <button onClick={() => unmatchMut.mutate(l.id)} className="text-error text-xs">Unmatch</button>
                          ) : !isClosed ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => { setSelectedBankLineId(l.id); setSelectedJournalLineIds(new Set()); }} className="text-primary text-xs">
                                {selected ? 'Selected' : 'Select'}
                              </button>
                              <button onClick={() => setShowAdjustment(l.id)} className="text-on-surface-variant text-xs">+ Adj</button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroller>
          )}
        </section>

        {/* Journal lines */}
        <section>
          <h2 className="font-bold mb-2">GL lines on {rec.bankAccount.account.code} – {rec.bankAccount.account.name}</h2>
          {rec.journalLines.length === 0 ? (
            <p className="text-on-surface-variant text-sm">No GL lines through {rec.endDate.slice(0, 10)}.</p>
          ) : (
            <TableScroller minWidth={720}>
              <table className="w-full text-sm bg-surface-container-low rounded">
                <thead className="text-on-surface-variant">
                  <tr><th /><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Entry</th><th className="px-2 py-1 text-right">Debit</th><th className="px-2 py-1 text-right">Credit</th></tr>
                </thead>
                <tbody>
                  {rec.journalLines.map((l) => {
                    const matched = l.reconciliationMatches.length > 0;
                    const selectable = !isClosed && selectedBankLineId !== null && matchableJournalLineIds.has(l.id);
                    const isSelected = selectedJournalLineIds.has(l.id);
                    return (
                      <tr key={l.id} className={`border-t border-outline-variant ${matched ? 'opacity-60' : ''} ${isSelected ? 'bg-secondary-container/40' : ''}`}>
                        <td className="px-2 py-1 w-6">
                          {selectable && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const next = new Set(selectedJournalLineIds);
                                if (e.target.checked) next.add(l.id); else next.delete(l.id);
                                setSelectedJournalLineIds(next);
                              }}
                            />
                          )}
                          {matched && <span title="Matched" className="text-primary text-xs">&#10003;</span>}
                        </td>
                        <td className="px-2 py-1">{l.journalEntry.date.slice(0, 10)}</td>
                        <td className="px-2 py-1 font-mono text-xs">{l.journalEntry.entryNumber}</td>
                        <td className="px-2 py-1 text-right font-mono">{Number(l.debit) > 0 ? l.debit : ''}</td>
                        <td className="px-2 py-1 text-right font-mono">{Number(l.credit) > 0 ? l.credit : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroller>
          )}
          {!isClosed && selectedBankLineId !== null && selectedJournalLineIds.size > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => manualMatchMut.mutate()}
                disabled={manualMatchMut.isPending}
                className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50"
              >
                Match {selectedJournalLineIds.size} line{selectedJournalLineIds.size === 1 ? '' : 's'}
              </button>
            </div>
          )}
        </section>
      </div>

      {showAdjustment !== null && (
        <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
          <div className="bg-surface rounded-lg shadow-xl w-[480px] p-6">
            <h2 className="text-lg font-bold mb-4">Add Adjustment</h2>
            <p className="text-sm text-on-surface-variant mb-3">Posts a journal entry to account for an unmatched bank line.</p>
            <label className="block text-sm mb-2">Offset account
              <select value={adjustmentAccount} onChange={(e) => setAdjustmentAccount(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
                <option value="">— pick an account —</option>
                {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name} ({a.type})</option>)}
              </select>
            </label>
            <label className="block text-sm mb-4">Memo
              <input value={adjustmentMemo} onChange={(e) => setAdjustmentMemo(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowAdjustment(null); setAdjustmentAccount(''); setAdjustmentMemo(''); }} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
              <button onClick={() => adjustmentMut.mutate()} disabled={!adjustmentAccount || adjustmentMut.isPending} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
                {adjustmentMut.isPending ? 'Posting…' : 'Post & match'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
