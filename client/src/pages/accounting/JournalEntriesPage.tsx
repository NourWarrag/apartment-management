import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { journalApi } from '../../lib/api/accounting';
import TableScroller from '../../components/ui/TableScroller';
import JournalEntryStatusPill from './components/JournalEntryStatusPill';
import ExpenseFormModal from './ExpenseFormModal';

export default function JournalEntriesPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'' | 'DRAFT' | 'POSTED'>('');
  const [page, setPage] = useState(1);
  const [showExpense, setShowExpense] = useState(false);

  const { data } = useQuery({
    queryKey: ['accounting', 'je', { status, page }],
    queryFn: () => journalApi.list({ status: (status || undefined) as any, page }),
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{t('accounting.je.title', 'Journal Entries')}</h1>
        <div className="flex items-center gap-2">
          <Link to="/accounting/journal-entries/new" className="px-3 py-2 rounded bg-primary text-on-primary text-sm">
            + {t('accounting.je.new', 'New Entry')}
          </Link>
          <button onClick={() => setShowExpense(true)} className="ltr:ml-2 rtl:mr-2 px-3 py-2 rounded border border-primary text-primary text-sm">
            + {t('accounting.expense.title', 'Add Expense')}
          </button>
        </div>
      </div>
      <div className="mb-4">
        <select value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(1); }} className="border border-outline-variant rounded px-2 py-1 text-sm">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
        </select>
      </div>
      <TableScroller minWidth={900}>
        <table className="w-full text-sm bg-surface-container-low rounded">
          <thead className="text-on-surface-variant">
            <tr>
              <th className="px-2 py-1 text-left">Entry #</th>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Memo</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Building</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((e) => (
              <tr key={e.id} className="border-t border-outline-variant hover:bg-surface-container-high">
                <td className="px-2 py-1 font-mono">
                  <Link to={`/accounting/journal-entries/${e.id}${e.status === 'DRAFT' ? '/edit' : ''}`} className="text-primary">
                    {e.entryNumber}
                  </Link>
                </td>
                <td className="px-2 py-1">{e.date.slice(0, 10)}</td>
                <td className="px-2 py-1">{e.memo ?? '—'}</td>
                <td className="px-2 py-1"><JournalEntryStatusPill status={e.status} /></td>
                <td className="px-2 py-1">{e.building?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
      {data && data.total > data.pageSize && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 border border-outline-variant rounded disabled:opacity-50">Prev</button>
          <span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
          <button disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 border border-outline-variant rounded disabled:opacity-50">Next</button>
        </div>
      )}
      {showExpense && <ExpenseFormModal onClose={() => setShowExpense(false)} />}
    </div>
  );
}
