interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  variant?: 'numeric' | 'prev-next';
  itemLabel?: string;
  className?: string;
}

export default function TablePagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  variant = 'prev-next',
  itemLabel,
  className = '',
}: TablePaginationProps) {
  if (total === 0) return null;

  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);
  const labelSuffix = itemLabel ? ` ${itemLabel}` : '';

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-t border-outline-variant ${className}`.trim()}>
      <p className="text-on-surface-variant text-sm">
        Showing {startRow}–{endRow} of {total}{labelSuffix}
      </p>
      {totalPages > 1 && (
        variant === 'numeric' ? (
          <NumericControls page={page} totalPages={totalPages} onPageChange={onPageChange} />
        ) : (
          <PrevNextControls page={page} totalPages={totalPages} onPageChange={onPageChange} />
        )
      )}
    </div>
  );
}

interface ControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function PrevNextControls({ page, totalPages, onPageChange }: ControlsProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 rounded-lg border border-outline-variant text-sm text-on-surface disabled:opacity-40 hover:bg-surface-container transition-colors"
      >
        Previous
      </button>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-outline-variant text-sm text-on-surface disabled:opacity-40 hover:bg-surface-container transition-colors"
      >
        Next
      </button>
    </div>
  );
}

function NumericControls({ page, totalPages, onPageChange }: ControlsProps) {
  const windowSize = 5;
  const half = Math.floor(windowSize / 2);
  const start = Math.max(1, Math.min(page - half, totalPages - windowSize + 1));
  const end = Math.min(totalPages, start + windowSize - 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant hover:bg-surface transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
      </button>
      {pages.map((pageNum) => (
        <button
          key={pageNum}
          onClick={() => onPageChange(pageNum)}
          className={`w-8 h-8 flex items-center justify-center rounded text-sm font-bold transition-colors ${
            page === pageNum
              ? 'bg-primary text-on-primary'
              : 'border border-outline-variant hover:bg-surface'
          }`}
        >
          {pageNum}
        </button>
      ))}
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant hover:bg-surface transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
      </button>
    </div>
  );
}
