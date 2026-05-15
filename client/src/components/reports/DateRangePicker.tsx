import { useState } from 'react';

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PRESETS: Array<{ label: string; apply: () => DateRange }> = [
  {
    label: 'Last 30 days',
    apply: () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 30);
      return { startDate: toISO(start), endDate: toISO(end) };
    },
  },
  {
    label: 'Last 3 months',
    apply: () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 90);
      return { startDate: toISO(start), endDate: toISO(end) };
    },
  },
  {
    label: 'This year',
    apply: () => {
      const end = new Date();
      const start = new Date(end.getFullYear(), 0, 1);
      return { startDate: toISO(start), endDate: toISO(end) };
    },
  },
  {
    label: 'All time',
    apply: () => ({ startDate: '', endDate: '' }),
  },
];

export default function DateRangePicker({ value, onChange }: Props) {
  const [activePreset, setActivePreset] = useState<string | null>('All time');

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setActivePreset(preset.label);
    onChange(preset.apply());
  }

  function handleStartChange(v: string) {
    setActivePreset(null);
    onChange({ ...value, startDate: v });
  }

  function handleEndChange(v: string) {
    setActivePreset(null);
    onChange({ ...value, endDate: v });
  }

  const btnBase = 'px-3 py-1.5 text-xs rounded-full border transition-colors';
  const btnActive = 'bg-primary text-on-primary border-primary';
  const btnInactive = 'border-outline-variant text-on-surface-variant hover:bg-surface-container';

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => applyPreset(p)}
          className={`${btnBase} ${activePreset === p.label ? btnActive : btnInactive}`}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <input
          type="date"
          value={value.startDate}
          onChange={(e) => handleStartChange(e.target.value)}
          className="text-xs border border-outline-variant rounded px-2 py-1 text-on-surface bg-surface"
        />
        <span className="text-on-surface-variant text-xs">–</span>
        <input
          type="date"
          value={value.endDate}
          onChange={(e) => handleEndChange(e.target.value)}
          className="text-xs border border-outline-variant rounded px-2 py-1 text-on-surface bg-surface"
        />
      </div>
    </div>
  );
}
