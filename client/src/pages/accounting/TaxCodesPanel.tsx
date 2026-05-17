import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import TableScroller from '../../components/ui/TableScroller';
import { taxCodesApi, type TaxCode } from '../../lib/api/accounting-phase2';
import { accountsApi } from '../../lib/api/accounting';

export default function TaxCodesPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: taxCodes = [] } = useQuery({ queryKey: ['accounting', 'tax-codes'], queryFn: taxCodesApi.list });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: accountsApi.list });
  const [showNew, setShowNew] = useState(false);

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => taxCodesApi.update(id, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'tax-codes'] }),
  });
  const createMut = useMutation({
    mutationFn: (d: any) => taxCodesApi.create(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'tax-codes'] }),
  });

  return (
    <section className="mt-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-bold">{t('accounting.taxCodes.title', 'Tax Codes')}</h2>
        <button onClick={() => setShowNew(true)} className="px-3 py-1 rounded bg-primary text-on-primary text-sm">
          + {t('accounting.taxCodes.new', 'New')}
        </button>
      </div>
      <TableScroller minWidth={720}>
        <table className="w-full text-sm bg-surface-container-low rounded">
          <thead className="text-on-surface-variant">
            <tr><th className="px-2 py-1 text-left">Code</th><th className="px-2 py-1 text-left">Name</th>
                <th className="px-2 py-1 text-right">Rate %</th><th className="px-2 py-1 text-left">Account</th>
                <th className="px-2 py-1 text-center">Default</th><th className="px-2 py-1 text-center">Active</th></tr>
          </thead>
          <tbody>
            {taxCodes.map((tc) => {
              const acc = accounts.find((a) => a.id === tc.accountId);
              return (
                <tr key={tc.id} className="border-t border-outline-variant">
                  <td className="px-2 py-1 font-mono">{tc.code}</td>
                  <td className="px-2 py-1">{tc.name}</td>
                  <td className="px-2 py-1 text-right">{tc.ratePct}</td>
                  <td className="px-2 py-1">{acc ? `${acc.code} – ${acc.name}` : '?'}</td>
                  <td className="px-2 py-1 text-center">
                    <input type="radio" name="default-tc" checked={tc.isDefault}
                      onChange={() => updateMut.mutate({ id: tc.id, d: { isDefault: true } })} />
                  </td>
                  <td className="px-2 py-1 text-center">
                    {tc.isActive ? <span className="text-primary">Yes</span> : <span className="text-on-surface-variant">No</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroller>
      {showNew && <NewTaxCodeModal accounts={accounts} onSubmit={(d) => createMut.mutateAsync(d).then(() => setShowNew(false))} onClose={() => setShowNew(false)} />}
    </section>
  );
}

type NewTaxCodeModalProps = {
  accounts: import('../../lib/api/accounting').Account[];
  onSubmit: (d: { code: string; name: string; ratePct: number; accountId: number; isDefault: boolean; isExempt: boolean }) => Promise<void>;
  onClose: () => void;
};

function NewTaxCodeModal({ accounts, onSubmit, onClose }: NewTaxCodeModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [ratePct, setRatePct] = useState('5');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [isDefault, setIsDefault] = useState(false);
  const [isExempt, setIsExempt] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await onSubmit({ code, name, ratePct: Number(ratePct), accountId: Number(accountId), isDefault, isExempt });
    } catch (e: any) { setErr(e?.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <form onSubmit={submit} className="bg-surface rounded-lg shadow-xl w-[420px] p-6">
        <h2 className="text-lg font-bold mb-4">New Tax Code</h2>
        {err && <div className="text-error text-sm mb-2">{err}</div>}
        <label className="block text-sm mb-2">Code <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required /></label>
        <label className="block text-sm mb-2">Name <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required /></label>
        <label className="block text-sm mb-2">Rate % <input type="number" step="0.01" value={ratePct} onChange={(e) => setRatePct(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required /></label>
        <label className="block text-sm mb-2">VAT Payable Account
          <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required>
            <option value="">— select —</option>
            {accounts.filter((a: any) => a.type === 'LIABILITY').map((a: any) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
        </label>
        <label className="block text-sm mb-2"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="ltr:mr-2 rtl:ml-2" />Set as default</label>
        <label className="block text-sm mb-4"><input type="checkbox" checked={isExempt} onChange={(e) => setIsExempt(e.target.checked)} className="ltr:mr-2 rtl:ml-2" />Exempt (vs zero-rated)</label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-primary text-on-primary text-sm">Create</button>
        </div>
      </form>
    </div>
  );
}
