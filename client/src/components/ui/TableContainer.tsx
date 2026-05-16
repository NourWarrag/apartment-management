import { ReactNode } from 'react';

interface TableContainerProps {
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  isError?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  errorMessage?: string;
}

export default function TableContainer({
  children,
  isLoading = false,
  isEmpty = false,
  isError = false,
  loadingMessage = 'Loading…',
  emptyMessage = 'No data',
  errorMessage = 'Failed to load. Please refresh.',
}: TableContainerProps) {
  if (isError) {
    return <div className="text-error text-sm p-8 text-center">{errorMessage}</div>;
  }
  if (isLoading) {
    return <div className="text-on-surface-variant text-sm p-8 text-center">{loadingMessage}</div>;
  }
  if (isEmpty) {
    return <div className="text-on-surface-variant text-sm p-8 text-center">{emptyMessage}</div>;
  }
  return <>{children}</>;
}
