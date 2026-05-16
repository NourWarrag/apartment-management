import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { accountsApi, type Account } from '../../lib/api/accounting';
import type { AccountType } from '@hotel/shared';
import AccountFormModal from './AccountFormModal';

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as any;

export default function AccountsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: accountsApi.list,
  });

  const [editing, setEditing] = useState<Account | null>(null);
  const [showNew, setShowNew] = useState(false);

  const createMut = useMutation({
    mutationFn: (d: any) => accountsApi.create(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'accounts'] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => accountsApi.update(id, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'accounts'] }),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => accountsApi.setActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'accounts'] }),
  });
  const seedMut = useMutation({
    mutationFn: () => accountsApi.seedStarter(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'accounts'] }),
  });

  if (isLoading) return <div className="p-6 text-on-surface-variant">{t('common.loading', 'Loading…')}</div>;

  if (accounts.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-on-surface-variant mb-4">{t('accounting.accounts.empty', 'No accounts yet. Start with the standard chart.')}</p>
        <button onClick={() => seedMut.mutate()} className="px-4 py-2 rounded bg-primary text-on-primary">
          {t('accounting.accounts.seed', 'Add starter chart')}
        </button>
      </div>
    );
  }

  const byType: Record<string, Account[]> = {};
  for (const a of accounts) (byType[a.type] = byType[a.type] ?? []).push(a);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-on-surface">{t('accounting.accounts.title', 'Chart of Accounts')}</h1>
        <button onClick={() => setShowNew(true)} className="px-3 py-2 rounded bg-primary text-on-primary text-sm">
          + {t('accounting.accounts.new', 'New Account')}
        </button>
      </div>
      {TYPE_ORDER.map((type) =>
        byType[type] ? (
          <div key={type} className="mb-6">
            <h2 className="font-bold text-on-surface mb-2">{type}</h2>
            <table className="w-full text-sm bg-surface-container-low rounded">
              <thead className="text-on-surface-variant">
                <tr>
                  <th className="px-2 py-1 text-left">Code</th>
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">Parent</th>
                  <th className="px-2 py-1 text-left">Active</th>
                  <th className="px-2 py-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {byType[type].sort((a, b) => a.code.localeCompare(b.code)).map((a) => {
                  const parent = a.parentId ? accounts.find((p) => p.id === a.parentId) : null;
                  return (
                    <tr key={a.id} className="border-t border-outline-variant">
                      <td className="px-2 py-1 font-mono">{a.code}</td>
                      <td className="px-2 py-1">{a.name}</td>
                      <td className="px-2 py-1">{parent ? `${parent.code} – ${parent.name}` : '—'}</td>
                      <td className="px-2 py-1">
                        <button
                          onClick={() => toggleMut.mutate({ id: a.id, active: !a.isActive })}
                          className={`px-2 py-0.5 rounded text-xs ${a.isActive ? 'bg-secondary-container text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}
                        >
                          {a.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button onClick={() => setEditing(a)} className="text-primary">Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null,
      )}

      {showNew && (
        <AccountFormModal
          accounts={accounts}
          hasActivity={false}
          onSubmit={(d) => createMut.mutateAsync(d).then(() => {})}
          onClose={() => setShowNew(false)}
        />
      )}
      {editing && (
        <AccountFormModal
          initial={editing}
          accounts={accounts}
          hasActivity={true}
          onSubmit={(d) => updateMut.mutateAsync({ id: editing.id, d }).then(() => {})}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
