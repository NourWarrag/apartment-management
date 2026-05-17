import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TableScroller from '../../components/ui/TableScroller';
import { bankAccountsApi, reconciliationsApi } from '../../lib/api/accounting-phase4';
import { accountsApi } from '../../lib/api/accounting';

export default function BankingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['accounting', 'bank-accounts'],
    queryFn: bankAccountsApi.list,
  });
  const { data: recs = [] } = useQuery({
    queryKey: ['accounting', 'reconciliations'],
    queryFn: () => reconciliationsApi.list(),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: accountsApi.list,
  });

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [err, setErr] = useState<string | null>(null);

  const linkedIds = new Set(bankAccounts.map((b) => b.accountId));
  const availableAssets = accounts.filter((a) => a.type === 'ASSET' && a.isActive && !linkedIds.has(a.id));

  const createMut = useMutation({
    mutationFn: () => bankAccountsApi.create({ name, accountId: Number(accountId) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting', 'bank-accounts'] });
      setShowNew(false);
      setName('');
      setAccountId('');
      setErr(null);
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed'),
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.banking.title', 'Bank Reconciliation')}</h1>

      <section className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-bold">Bank Accounts</h2>
          <button onClick={() => setShowNew(true)} className="px-3 py-2 rounded bg-primary text-on-primary text-sm">
            + New Bank Account
          </button>
        </div>
        {bankAccounts.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No bank accounts yet. Add one to start reconciling.</p>
        ) : (
          <TableScroller minWidth={720}>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr>
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">GL Account</th>
                  <th className="px-2 py-1 text-right">Statements</th>
                  <th className="px-2 py-1 text-right">Reconciliations</th>
                </tr>
              </thead>
              <tbody>
                {bankAccounts.map((b) => (
                  <tr key={b.id} className="border-t border-outline-variant">
                    <td className="px-2 py-1">
                      <Link to={`/accounting/banking/${b.id}`} className="text-primary">{b.name}</Link>
                    </td>
                    <td className="px-2 py-1">{b.account.code} – {b.account.name}</td>
                    <td className="px-2 py-1 text-right">{b._count.statements}</td>
                    <td className="px-2 py-1 text-right">{b._count.reconciliations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-2">Reconciliations</h2>
        {recs.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No reconciliations yet.</p>
        ) : (
          <TableScroller minWidth={720}>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr>
                  <th className="px-2 py-1 text-left">Bank Account</th>
                  <th className="px-2 py-1 text-left">End Date</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className="border-t border-outline-variant">
                    <td className="px-2 py-1">{r.bankAccount.name}</td>
                    <td className="px-2 py-1">{r.endDate.slice(0, 10)}</td>
                    <td className="px-2 py-1">{r.status}</td>
                    <td className="px-2 py-1 text-right">
                      <Link to={`/accounting/banking/reconciliations/${r.id}`} className="text-primary text-xs">
                        {r.status === 'OPEN' ? 'Continue →' : 'View report →'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
        )}
      </section>

      {showNew && (
        <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
          <div className="bg-surface rounded-lg shadow-xl w-[420px] p-6">
            <h2 className="text-lg font-bold mb-4">New Bank Account</h2>
            {err && <div className="text-error text-sm mb-2">{err}</div>}
            <label className="block text-sm mb-2">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-outline-variant rounded px-2 py-1 mt-1"
              />
            </label>
            <label className="block text-sm mb-4">
              Linked GL Account
              <select
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
                className="w-full border border-outline-variant rounded px-2 py-1 mt-1"
              >
                <option value="">— pick an ASSET account —</option>
                {availableAssets.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNew(false)}
                className="px-3 py-1 rounded border border-outline-variant text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => createMut.mutate()}
                disabled={!name || !accountId}
                className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
