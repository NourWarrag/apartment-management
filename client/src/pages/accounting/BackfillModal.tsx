import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { accountingAdminApi } from '../../lib/api/accounting-phase2';

type Props = { onClose: () => void };

export default function BackfillModal({ onClose }: Props) {
  const [fromDate, setFromDate] = useState('');
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: () => accountingAdminApi.backfill(fromDate || undefined),
    onSuccess: (r) => setResult(r),
  });

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <div className="bg-surface rounded-lg shadow-xl w-[480px] p-6">
        <h2 className="text-lg font-bold mb-4">Backfill auto-posting</h2>
        {!result ? (
          <>
            <p className="text-sm text-on-surface-variant mb-3">
              Walks historical Payments and Bookings and posts missing journal entries. Idempotent — already-posted rows are skipped.
            </p>
            <label className="block text-sm mb-4">
              From date (optional)
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
              <button disabled={mut.isPending} onClick={() => mut.mutate()} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
                {mut.isPending ? 'Running…' : 'Run Backfill'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm space-y-1 mb-4">
              <div>Processed: <b>{result.processed}</b></div>
              <div>Posted: <b>{result.posted}</b></div>
              <div>Skipped (already posted): <b>{result.skipped}</b></div>
              <div>Failed: <b>{result.failed.length}</b></div>
              {result.failed.length > 0 && (
                <ul className="mt-2 text-error text-xs">
                  {result.failed.map((f: any, i: number) => <li key={i}>{f.kind} #{f.id}: {f.code} — {f.message}</li>)}
                </ul>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-3 py-1 rounded bg-primary text-on-primary text-sm">Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
