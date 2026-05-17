import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/axios';
import { accountsApi, journalApi } from '../../lib/api/accounting';
import { reversalApi } from '../../lib/api/accounting-phase3';
import JournalLinesTable, { type LineDraft } from './components/JournalLinesTable';

export default function JournalEntryEditorPage() {
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const nav = useNavigate();
  const { t } = useTranslation();

  const { data: accounts = [] } = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: accountsApi.list });
  const { data: buildings = [] } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => (await api.get('/buildings')).data as { id: number; name: string }[],
  });
  const { data: existing } = useQuery({
    queryKey: ['accounting', 'je', editingId],
    queryFn: () => journalApi.get(editingId!),
    enabled: !!editingId,
  });

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([
    { accountId: null, buildingId: null, debit: '', credit: '', description: '' },
    { accountId: null, buildingId: null, debit: '', credit: '', description: '' },
  ]);
  const [err, setErr] = useState<string | null>(null);
  const [showReverseConfirm, setShowReverseConfirm] = useState(false);
  const [reverseErr, setReverseErr] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setDate(existing.date.slice(0, 10));
      setMemo(existing.memo ?? '');
      setBuildingId(existing.buildingId);
      setLines(
        existing.lines.map((l) => ({
          accountId: l.accountId,
          buildingId: l.buildingId,
          debit: Number(l.debit) > 0 ? String(l.debit) : '',
          credit: Number(l.credit) > 0 ? String(l.credit) : '',
          description: l.description ?? '',
        })),
      );
    }
  }, [existing]);

  const readOnly = existing?.status === 'POSTED';

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of lines) { d += Number(l.debit) || 0; c += Number(l.credit) || 0; }
    return { d, c, balanced: d === c };
  }, [lines]);

  const canPost =
    lines.length >= 2 &&
    lines.every((l) => l.accountId !== null && (Number(l.debit) > 0) !== (Number(l.credit) > 0)) &&
    totals.balanced;

  function buildPayload() {
    return {
      date,
      memo: memo || undefined,
      buildingId: buildingId ?? null,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        buildingId: l.buildingId,
        debit: l.debit || '0',
        credit: l.credit || '0',
        description: l.description || undefined,
      })),
    };
  }

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (editingId) return journalApi.updateDraft(editingId, payload);
      return journalApi.createDraft(payload);
    },
    onSuccess: (entry) => nav(`/accounting/journal-entries/${entry.id}/edit`),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Failed to save'),
  });

  const post = useMutation({
    mutationFn: async () => {
      if (editingId) {
        await journalApi.updateDraft(editingId, buildPayload());
        return journalApi.post(editingId);
      }
      return journalApi.createAndPost(buildPayload());
    },
    onSuccess: (entry) => nav(`/accounting/journal-entries/${entry.id}`),
    onError: (e: any) => {
      const body = e?.response?.data;
      setErr(body?.message ?? 'Failed to post');
    },
  });

  const reverseMut = useMutation({
    mutationFn: () => reversalApi.reverseEntry(editingId!),
    onSuccess: (newEntry: any) => nav(`/accounting/journal-entries/${newEntry.id}`),
    onError: (e: any) => setReverseErr(e?.response?.data?.message ?? 'Failed to reverse'),
  });

  function handlePostClick() {
    if (!window.confirm(t('accounting.je.confirmPost', 'Posting is permanent. To correct a posted entry later, you\'ll create a reversing entry. Continue?'))) return;
    post.mutate();
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        {editingId ? (readOnly ? t('accounting.je.detail', 'Journal Entry') : t('accounting.je.edit', 'Edit Journal Entry')) : t('accounting.je.new', 'New Journal Entry')}
      </h1>
      {err && <div className="text-error mb-2">{err}</div>}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <label className="text-sm">
          Date
          <input type="date" disabled={readOnly} value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" />
        </label>
        <label className="text-sm">
          Building
          <select disabled={readOnly} value={buildingId ?? ''} onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : null)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
            <option value="">— none —</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <div className="text-sm">
          Status<br />
          <span className="inline-block mt-1 px-2 py-0.5 rounded bg-tertiary-fixed text-on-surface text-xs">
            {existing?.status ?? 'DRAFT'}
          </span>
        </div>
      </div>

      <label className="block text-sm mb-4">
        Memo
        <input disabled={readOnly} value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" />
      </label>

      <JournalLinesTable
        accounts={accounts}
        buildings={buildings}
        lines={lines}
        onChange={setLines}
        readOnly={readOnly}
      />

      {!readOnly && (
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => nav('/accounting/journal-entries')} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button onClick={() => saveDraft.mutate()} className="px-3 py-1 rounded border border-primary text-primary text-sm">Save as Draft</button>
          <button onClick={handlePostClick} disabled={!canPost} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
            Save & Post
          </button>
        </div>
      )}
      {readOnly && (
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => nav('/accounting/journal-entries')} className="px-3 py-1 rounded border border-outline-variant text-sm">Back</button>
          {existing && existing.source !== 'PAYMENT_AUTO' && (
            <button onClick={() => setShowReverseConfirm(true)} className="px-3 py-1 rounded bg-error text-on-primary text-sm">
              Reverse this entry
            </button>
          )}
        </div>
      )}
      {showReverseConfirm && (
        <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
          <div className="bg-surface rounded-lg shadow-xl w-[480px] p-6">
            <h2 className="text-lg font-bold mb-4">Reverse Journal Entry</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              This will post a balancing entry dated today. The original remains in the ledger for audit. Continue?
            </p>
            {reverseErr && <div className="text-error text-sm mb-2">{reverseErr}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowReverseConfirm(false)} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
              <button onClick={() => reverseMut.mutate()} disabled={reverseMut.isPending} className="px-3 py-1 rounded bg-error text-on-primary text-sm disabled:opacity-50">
                {reverseMut.isPending ? 'Reversing…' : 'Reverse'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
