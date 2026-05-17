import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { accountsApi } from '../../lib/api/accounting';
import { taxCodesApi } from '../../lib/api/accounting-phase2';
import { expenseApi } from '../../lib/api/accounting-phase3';
import api from '../../lib/axios';

type Props = { onClose: () => void };

export default function ExpenseFormModal({ onClose }: Props) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [taxCodeId, setTaxCodeId] = useState<number | null>(null);
  const [payFromAccountId, setPayFromAccountId] = useState<number | ''>('');
  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: accountsApi.list });
  const { data: taxCodes = [] } = useQuery({ queryKey: ['accounting', 'tax-codes'], queryFn: taxCodesApi.list });
  const { data: buildings = [] } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => (await api.get('/buildings')).data as { id: number; name: string }[],
  });

  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE' && a.isActive);
  const payFromAccounts = accounts.filter((a) => (a.type === 'ASSET' || a.type === 'LIABILITY') && a.isActive);

  const mut = useMutation({
    mutationFn: () => expenseApi.create({
      date, memo: memo || undefined, buildingId,
      expenseAccountId: Number(expenseAccountId), amount,
      payFromAccountId: Number(payFromAccountId),
      taxCodeId,
    }),
    onSuccess: (entry: any) => nav(`/accounting/journal-entries/${entry.id}`),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to save'),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    mut.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <form onSubmit={submit} className="bg-surface rounded-lg shadow-xl w-full max-w-[90vw] lg:max-w-[480px] p-6">
        <h2 className="text-lg font-bold mb-4">{t('accounting.expense.title', 'Add Expense')}</h2>
        {err && <div className="text-error text-sm mb-2">{err}</div>}
        <label className="block text-sm mb-2">Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required /></label>
        <label className="block text-sm mb-2">Memo <input value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" /></label>
        <label className="block text-sm mb-2">Expense account
          <select value={expenseAccountId} onChange={(e) => setExpenseAccountId(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required>
            <option value="">— select —</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
        </label>
        <label className="block text-sm mb-2">Amount (gross)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required />
        </label>
        <label className="block text-sm mb-2">Tax code
          <select value={taxCodeId ?? ''} onChange={(e) => setTaxCodeId(e.target.value ? Number(e.target.value) : null)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
            <option value="">— None —</option>
            {taxCodes.filter((tc) => tc.isActive).map((tc) => <option key={tc.id} value={tc.id}>{tc.code} ({tc.ratePct}%)</option>)}
          </select>
        </label>
        <label className="block text-sm mb-2">Pay from
          <select value={payFromAccountId} onChange={(e) => setPayFromAccountId(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required>
            <option value="">— select —</option>
            {payFromAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
        </label>
        {buildings.length > 0 && (
          <label className="block text-sm mb-4">Building (optional)
            <select value={buildingId ?? ''} onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : null)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
              <option value="">— none —</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button type="submit" disabled={mut.isPending} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </form>
    </div>
  );
}
