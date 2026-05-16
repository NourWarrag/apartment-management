import { ReactNode } from 'react';

interface TableProps {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Table({ children, footer, className = '' }: TableProps) {
  return (
    <div className={`bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm ${className}`}>
      <table className="w-full text-left border-collapse">{children}</table>
      {footer}
    </div>
  );
}

interface TableHeadProps {
  headers: ReactNode[];
}

export function TableHead({ headers }: TableHeadProps) {
  return (
    <thead>
      <tr className="bg-surface-container-low border-b border-outline-variant">
        {headers.map((h, i) => (
          <th key={i} className="px-4 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-wider">{h}</th>
        ))}
      </tr>
    </thead>
  );
}

interface TableBodyProps {
  children: ReactNode;
}

export function TableBody({ children }: TableBodyProps) {
  return <tbody className="divide-y divide-outline-variant/30">{children}</tbody>;
}

interface TableRowProps {
  children: ReactNode;
  onClick?: () => void;
  muted?: boolean;
  className?: string;
}

export function TableRow({ children, onClick, muted, className = '' }: TableRowProps) {
  const cls = [
    'hover:bg-surface-container-low transition-colors',
    onClick ? 'cursor-pointer' : '',
    muted ? 'opacity-50' : '',
    className,
  ].filter(Boolean).join(' ');
  return <tr className={cls} onClick={onClick}>{children}</tr>;
}

type TableCellVariant = 'text' | 'strong' | 'muted';
type TableCellAlign = 'left' | 'right' | 'center';

const VARIANT_CLS: Record<TableCellVariant, string> = {
  text: 'text-sm text-on-surface',
  strong: 'text-sm font-bold text-on-surface',
  muted: 'text-sm text-on-surface-variant',
};

const ALIGN_CLS: Record<TableCellAlign, string> = {
  left: '',
  right: 'text-right',
  center: 'text-center',
};

interface TableCellProps {
  children: ReactNode;
  variant?: TableCellVariant;
  align?: TableCellAlign;
  colSpan?: number;
  className?: string;
}

export function TableCell({ children, variant, align = 'left', colSpan, className = '' }: TableCellProps) {
  const variantCls = variant ? VARIANT_CLS[variant] : '';
  return (
    <td colSpan={colSpan} className={`px-4 py-3 ${variantCls} ${ALIGN_CLS[align]} ${className}`.trim()}>
      {children}
    </td>
  );
}
