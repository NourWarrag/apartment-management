import { useMemo, useState } from 'react';
import type { Account } from '../../../lib/api/accounting';

type Props = {
  accounts: Account[];
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
};

export default function AccountPicker({ accounts, value, onChange, disabled }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const active = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    if (!needle) return active;
    return active.filter(
      (a) => a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle),
    );
  }, [active, q]);

  const selected = accounts.find((a) => a.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-2 py-1 border border-outline-variant rounded text-sm bg-surface disabled:bg-surface-container-low"
      >
        {selected ? `${selected.code} – ${selected.name}` : <span className="text-on-surface-variant">Select account</span>}
      </button>
      {open && !disabled && (
        <div className="absolute z-10 mt-1 w-72 max-h-72 overflow-auto bg-surface border border-outline-variant rounded shadow">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full px-2 py-1 border-b border-outline-variant text-sm bg-surface"
          />
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onChange(a.id);
                setOpen(false);
                setQ('');
              }}
              className="block w-full text-left px-2 py-1 text-sm hover:bg-surface-container-high"
            >
              <span className="font-mono">{a.code}</span> – {a.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-sm text-on-surface-variant">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
