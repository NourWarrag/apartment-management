import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { bankAccountsApi, bankStatementsApi, reconciliationsApi } from '../../lib/api/accounting-phase4';
import CsvImportWizard from './CsvImportWizard';

export default function BankAccountDetailPage() {
  const { id } = useParams();
  const baId = Number(id);
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<'statements' | 'reconciliations' | 'mapping'>('statements');
  const [showImport, setShowImport] = useState(false);
  const [forceMapStep, setForceMapStep] = useState(false);
  const [showNewRec, setShowNewRec] = useState(false);

  const { data: bankAccount } = useQuery({
    queryKey: ['accounting', 'bank-account', baId],
    queryFn: async () => {
      const all = await bankAccountsApi.list();
      return all.find((b) => b.id === baId) ?? null;
    },
  });

  const { data: statements = [] } = useQuery({
    queryKey: ['accounting', 'bank-statements', baId],
    queryFn: () => bankStatementsApi.list(baId),
  });

  const { data: recs = [] } = useQuery({
    queryKey: ['accounting', 'reconciliations', baId],
    queryFn: () => reconciliationsApi.list({ bankAccountId: baId }),
  });

  const deleteMut = useMutation({
    mutationFn: (statementId: number) => bankStatementsApi.delete(statementId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'bank-statements', baId] }),
  });

  if (!bankAccount) return <div className="p-6 text-on-surface-variant">{t('common.loading', 'Loading…')}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">{bankAccount.name}</h1>
      <p className="text-sm text-on-surface-variant mb-4">{bankAccount.account.code} – {bankAccount.account.name}</p>

      <div className="flex gap-3 border-b border-outline-variant mb-4 text-sm">
        {(['statements', 'reconciliations', 'mapping'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 ${tab === k ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}>
            {k === 'statements' ? 'Statements' : k === 'reconciliations' ? 'Reconciliations' : 'CSV Mapping'}
          </button>
        ))}
      </div>

      {tab === 'statements' && (
        <section>
          <div className="flex justify-end mb-2">
            <button onClick={() => { setForceMapStep(false); setShowImport(true); }} className="px-3 py-2 rounded bg-primary text-on-primary text-sm">
              + Import statement
            </button>
          </div>
          {statements.length === 0 ? (
            <p className="text-on-surface-variant text-sm">No statements imported yet.</p>
          ) : (
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr><th className="px-2 py-1 text-left">Filename</th><th className="px-2 py-1 text-left">Imported</th><th className="px-2 py-1 text-right">Lines</th><th /></tr>
              </thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id} className="border-t border-outline-variant">
                    <td className="px-2 py-1">{s.filename}</td>
                    <td className="px-2 py-1">{s.importedAt.slice(0, 10)}</td>
                    <td className="px-2 py-1 text-right">{s._count.lines}</td>
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => deleteMut.mutate(s.id)} className="text-error text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'reconciliations' && (
        <section>
          <div className="flex justify-end mb-2">
            <button onClick={() => setShowNewRec(true)} className="px-3 py-2 rounded bg-primary text-on-primary text-sm">
              + New Reconciliation
            </button>
          </div>
          {recs.length === 0 ? (
            <p className="text-on-surface-variant text-sm">No reconciliations yet.</p>
          ) : (
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr><th className="px-2 py-1 text-left">End Date</th><th className="px-2 py-1 text-left">Status</th><th className="px-2 py-1 text-right">Statement Balance</th><th /></tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className="border-t border-outline-variant">
                    <td className="px-2 py-1">{r.endDate.slice(0, 10)}</td>
                    <td className="px-2 py-1">{r.status}</td>
                    <td className="px-2 py-1 text-right">{r.statementBalance}</td>
                    <td className="px-2 py-1 text-right">
                      <Link to={`/accounting/banking/reconciliations/${r.id}`} className="text-primary text-xs">
                        {r.status === 'OPEN' ? 'Continue →' : 'View →'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'mapping' && (
        <section>
          <div className="bg-surface-container-low rounded p-4 text-sm space-y-1">
            <div><span className="text-on-surface-variant">Date column:</span> {bankAccount.csvDateColumn ?? '—'}</div>
            <div><span className="text-on-surface-variant">Amount column:</span> {bankAccount.csvAmountColumn ?? '—'}</div>
            <div><span className="text-on-surface-variant">Description column:</span> {bankAccount.csvDescriptionColumn ?? '—'}</div>
            <div><span className="text-on-surface-variant">Reference column:</span> {bankAccount.csvReferenceColumn ?? '—'}</div>
            <div><span className="text-on-surface-variant">Has header:</span> {bankAccount.csvHasHeader ? 'Yes' : 'No'}</div>
            <div><span className="text-on-surface-variant">Date format:</span> {bankAccount.csvDateFormat ?? '—'}</div>
          </div>
          <button onClick={() => { setForceMapStep(true); setShowImport(true); }} className="mt-3 px-3 py-2 rounded border border-primary text-primary text-sm">
            Edit mapping
          </button>
        </section>
      )}

      {showImport && (
        <CsvImportWizard
          bankAccount={bankAccount}
          forceMapStep={forceMapStep}
          onImported={() => {
            setShowImport(false);
            qc.invalidateQueries({ queryKey: ['accounting', 'bank-statements', baId] });
            qc.invalidateQueries({ queryKey: ['accounting', 'bank-account', baId] });
            setTab('statements');
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {showNewRec && <NewRecModal bankAccountId={baId} onClose={() => setShowNewRec(false)} onCreated={(id) => nav(`/accounting/banking/reconciliations/${id}`)} />}
    </div>
  );
}

function NewRecModal({ bankAccountId, onClose, onCreated }: { bankAccountId: number; onClose: () => void; onCreated: (id: number) => void }) {
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  const [endDate, setEndDate] = useState(lastMonth.toISOString().slice(0, 10));
  const [statementBalance, setStatementBalance] = useState('0');
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => reconciliationsApi.create({ bankAccountId, endDate, statementBalance }),
    onSuccess: (r) => onCreated(r.id),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Create failed'),
  });
  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <div className="bg-surface rounded-lg shadow-xl w-[420px] p-6">
        <h2 className="text-lg font-bold mb-4">New Reconciliation</h2>
        {err && <div className="text-error text-sm mb-2">{err}</div>}
        <label className="block text-sm mb-2">End date <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" /></label>
        <label className="block text-sm mb-4">Statement balance <input value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} inputMode="decimal" className="w-full border border-outline-variant rounded px-2 py-1 mt-1" /></label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  );
}
