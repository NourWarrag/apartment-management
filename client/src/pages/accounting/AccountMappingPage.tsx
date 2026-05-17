import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { mappingApi } from '../../lib/api/accounting-phase2';
import { accountsApi } from '../../lib/api/accounting';
import type { MappingKey } from '@hotel/shared';
import AccountPicker from './components/AccountPicker';
import TaxCodesPanel from './TaxCodesPanel';

const KEY_LABELS: Record<string, string> = {
  CASH_METHOD: 'Cash payments',
  CARD_METHOD: 'Card payments',
  INSTALLMENT_METHOD: 'Installment payments',
  AR_DEFAULT: 'Accounts Receivable',
  REVENUE_DEFAULT: 'Revenue (default)',
  DEPOSIT_LIABILITY: 'Security Deposits Held',
  DEPOSIT_FORFEIT_INCOME: 'Forfeited Deposit Income',
  VAT_PAYABLE: 'VAT Payable',
};

export default function AccountMappingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['accounting', 'mapping'], queryFn: mappingApi.list });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: accountsApi.list });
  const [editing, setEditing] = useState<MappingKey | null>(null);

  const setMut = useMutation({
    mutationFn: ({ key, accountId }: { key: MappingKey; accountId: number }) => mappingApi.set(key, accountId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting', 'mapping'] }); setEditing(null); },
  });

  if (isLoading) return <div className="p-6 text-on-surface-variant">{t('common.loading', 'Loading…')}</div>;
  const unmapped = rows.filter((r) => r.accountId === null).map((r) => r.key);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('accounting.mapping.title', 'Account Mapping')}</h1>
      {unmapped.length > 0 && (
        <div className="mb-4 p-3 bg-error-container text-error rounded">
          ⚠ Mapping incomplete — auto-posting is disabled until you map: {unmapped.join(', ')}
        </div>
      )}
      <table className="w-full text-sm bg-surface-container-low rounded">
        <thead className="text-on-surface-variant">
          <tr><th className="px-2 py-1 text-left">Mapping</th><th className="px-2 py-1 text-left">Currently maps to</th><th className="px-2 py-1 text-right">Action</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-outline-variant">
              <td className="px-2 py-1">{KEY_LABELS[r.key] ?? r.key}</td>
              <td className="px-2 py-1">
                {r.account ? <span><span className="font-mono">{r.account.code}</span> – {r.account.name}</span> : <span className="text-error">— unmapped —</span>}
              </td>
              <td className="px-2 py-1 text-right">
                <button onClick={() => setEditing(r.key)} className="text-primary text-sm">Change</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
          <div className="bg-surface rounded-lg shadow-xl w-[420px] p-6">
            <h2 className="text-lg font-bold mb-4">Map {KEY_LABELS[editing] ?? editing}</h2>
            <AccountPicker
              accounts={accounts}
              value={rows.find((r) => r.key === editing)?.accountId ?? null}
              onChange={(id) => id && setMut.mutate({ key: editing, accountId: id })}
            />
            <div className="mt-4 flex justify-end">
              <button onClick={() => setEditing(null)} className="px-3 py-1 rounded border border-outline-variant text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      <TaxCodesPanel />
    </div>
  );
}
