import { useMemo } from 'react';
import AccountPicker from './AccountPicker';
import type { Account } from '../../../lib/api/accounting';

export type LineDraft = {
  accountId: number | null;
  buildingId: number | null;
  debit: string;
  credit: string;
  description: string;
};

type Props = {
  accounts: Account[];
  buildings: { id: number; name: string }[];
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  readOnly?: boolean;
};

function toNum(s: string): number {
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export default function JournalLinesTable({ accounts, buildings, lines, onChange, readOnly }: Props) {
  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of lines) { d += toNum(l.debit); c += toNum(l.credit); }
    return { d, c, diff: d - c };
  }, [lines]);

  function update(i: number, patch: Partial<LineDraft>) {
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function remove(i: number) {
    onChange(lines.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...lines, { accountId: null, buildingId: null, debit: '', credit: '', description: '' }]);
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead className="bg-surface-container-low text-on-surface-variant">
          <tr>
            <th className="px-2 py-1 text-left w-8">#</th>
            <th className="px-2 py-1 text-left">Account</th>
            <th className="px-2 py-1 text-left">Building</th>
            <th className="px-2 py-1 text-right w-28">Debit</th>
            <th className="px-2 py-1 text-right w-28">Credit</th>
            <th className="px-2 py-1 text-left">Description</th>
            {!readOnly && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-outline-variant">
              <td className="px-2 py-1">{i + 1}</td>
              <td className="px-2 py-1">
                <AccountPicker
                  accounts={accounts}
                  value={l.accountId}
                  onChange={(id) => update(i, { accountId: id })}
                  disabled={readOnly}
                />
              </td>
              <td className="px-2 py-1">
                <select
                  disabled={readOnly}
                  value={l.buildingId ?? ''}
                  onChange={(e) => update(i, { buildingId: e.target.value ? Number(e.target.value) : null })}
                  className="border border-outline-variant rounded px-1 py-1 text-sm bg-surface"
                >
                  <option value="">—</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </td>
              <td className="px-2 py-1 text-right">
                <input
                  disabled={readOnly}
                  inputMode="decimal"
                  value={l.debit}
                  onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                  className="w-24 border border-outline-variant rounded px-1 py-1 text-right text-sm bg-surface"
                />
              </td>
              <td className="px-2 py-1 text-right">
                <input
                  disabled={readOnly}
                  inputMode="decimal"
                  value={l.credit}
                  onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                  className="w-24 border border-outline-variant rounded px-1 py-1 text-right text-sm bg-surface"
                />
              </td>
              <td className="px-2 py-1">
                <input
                  disabled={readOnly}
                  value={l.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  className="w-full border border-outline-variant rounded px-1 py-1 text-sm bg-surface"
                />
              </td>
              {!readOnly && (
                <td>
                  <button onClick={() => remove(i)} aria-label="Remove" className="text-error px-1">
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-outline-variant font-medium">
            <td colSpan={3} className="px-2 py-2 text-right">Totals</td>
            <td className="px-2 py-2 text-right">{totals.d.toFixed(2)}</td>
            <td className="px-2 py-2 text-right">{totals.c.toFixed(2)}</td>
            <td colSpan={readOnly ? 1 : 2} className={`px-2 py-2 ${totals.diff === 0 ? 'text-primary' : 'text-error'}`}>
              {totals.diff === 0 ? '✓ Balanced' : `Diff: ${totals.diff.toFixed(2)}`}
            </td>
          </tr>
        </tfoot>
      </table>
      {!readOnly && (
        <button onClick={add} className="mt-2 text-sm text-primary flex items-center gap-1">
          <span className="material-symbols-outlined text-base">add</span>
          Add line
        </button>
      )}
    </div>
  );
}
