import { ReactNode } from 'react';

interface TableScrollerProps {
  children: ReactNode;
  minWidth?: number;
  className?: string;
}

export default function TableScroller({ children, minWidth = 720, className = '' }: TableScrollerProps) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest ${className}`}>
      <div style={{ minWidth: `${minWidth}px` }}>
        {children}
      </div>
    </div>
  );
}
