import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { bankAccountsApi, reconciliationsApi } from '../../lib/api/accounting-phase4';

type Props = {
  bankAccountId?: number;            // if provided, locked
  onCreated: (reconciliationId: number) => void;
  onClose: () => void;
};

function defaultEndDate(): string {
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  return lastMonth.toISOString().slice(0, 10);
}

export default function NewReconciliationModal({ bankAccountId: lockedBankAccountId, onCreated, onClose }: Props) {
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['accounting', 'bank-accounts'],
    queryFn: bankAccountsApi.list,
    enabled: !lockedBankAccountId,
  });
  const [bankAccountId, setBankAccountId] = useState<number | ''>(lockedBankAccountId ?? '');
  const [endDate, setEndDate] = useState<string>(defaultEndDate());
  const [statementBalance, setStatementBalance] = useState<string>('0');
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => reconciliationsApi.create({
      bankAccountId: Number(bankAccountId),
      endDate,
      statementBalance,
    }),
    onSuccess: (r) => onCreated(r.id),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Create failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-[90vw] lg:max-w-[420px] p-6">
        <h2 className="text-lg font-bold mb-4">New Reconciliation</h2>
        {err && <div className="text-error text-sm mb-2">{err}</div>}
        {!lockedBankAccountId && (
          <label className="block text-sm mb-2">Bank account
            <select value={bankAccountId} onChange={(e) => setBankAccountId(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
              <option value="">— select —</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm mb-2">End date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" />
        </label>
        <label className="block text-sm mb-4">Statement balance
          <input value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} inputMode="decimal" className="w-full border border-outline-variant rounded px-2 py-1 mt-1" />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!bankAccountId || mut.isPending} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
            {mut.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
