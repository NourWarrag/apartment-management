import { JEStatus } from '@hotel/shared';

export default function JournalEntryStatusPill({ status }: { status: JEStatus }) {
  const cls =
    status === 'POSTED'
      ? 'bg-secondary-container text-primary'
      : 'bg-tertiary-fixed text-on-surface';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
