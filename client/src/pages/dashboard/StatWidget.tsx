interface SubRow {
  label: string;
  value: string | number;
}

interface StatWidgetProps {
  icon: string;
  label: string;
  value: string | number;
  subRows?: SubRow[];
  onClick?: () => void;
  loading?: boolean;
}

export default function StatWidget({ icon, label, value, subRows, onClick, loading }: StatWidgetProps) {
  const Tag = onClick ? 'button' : 'div';

  if (loading) {
    return (
      <div className="bg-surface-container rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-on-surface/10 rounded w-1/2 mb-3" />
        <div className="h-8 bg-on-surface/10 rounded w-1/3 mb-2" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 bg-on-surface/10 rounded w-2/3 mt-2" />
        ))}
      </div>
    );
  }

  return (
    <Tag
      className={[
        'bg-surface-container rounded-xl p-6 text-start w-full',
        onClick ? 'hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary transition-colors cursor-pointer' : '',
      ].join(' ')}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
        <span className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-display-lg font-bold text-on-surface mt-1">{value}</div>
      {subRows && subRows.length > 0 && (
        <div className="mt-3 space-y-stack-tight border-t border-outline-variant pt-3">
          {subRows.map((row) => (
            <div key={row.label} className="flex justify-between text-body-sm text-on-surface-variant">
              <span>{row.label}</span>
              <span className="font-medium text-on-surface">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </Tag>
  );
}
