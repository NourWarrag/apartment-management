import { useState } from 'react';
import type { Account } from '../../lib/api/accounting';
import type { AccountType } from '@hotel/shared';

const TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as any;

type Props = {
  initial?: Account;
  accounts: Account[];
  hasActivity: boolean;
  onSubmit: (data: { code: string; name: string; type: AccountType; parentId: number | null; description: string }) => Promise<void>;
  onClose: () => void;
};

export default function AccountFormModal({ initial, accounts, hasActivity, onSubmit, onClose }: Props) {
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<AccountType>((initial?.type as AccountType) ?? ('ASSET' as AccountType));
  const [parentId, setParentId] = useState<number | null>(initial?.parentId ?? null);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [err, setErr] = useState<string | null>(null);

  const parentOptions = accounts.filter((a) => a.type === type && a.id !== initial?.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await onSubmit({ code, name, type, parentId, description });
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Failed to save');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-surface rounded-lg shadow-xl w-[420px] p-6">
        <h2 className="text-lg font-bold text-on-surface mb-4">{initial ? 'Edit Account' : 'New Account'}</h2>
        {err && <div className="text-error text-sm mb-2">{err}</div>}
        <label className="block text-sm mb-2">
          Code <input value={code} disabled={hasActivity && !!initial} onChange={(e) => setCode(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required />
        </label>
        <label className="block text-sm mb-2">
          Name <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" required />
        </label>
        <label className="block text-sm mb-2">
          Type
          <select value={type} disabled={hasActivity && !!initial} onChange={(e) => { setType(e.target.value as AccountType); setParentId(null); }} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block text-sm mb-2">
          Parent (optional, same type)
          <select value={parentId ?? ''} disabled={hasActivity && !!initial} onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
            <option value="">— none —</option>
            {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
          </select>
        </label>
        <label className="block text-sm mb-4">
          Description <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-primary text-on-primary text-sm">Save</button>
        </div>
      </form>
    </div>
  );
}
