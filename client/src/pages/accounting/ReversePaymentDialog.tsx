import { useMutation } from '@tanstack/react-query';
import { accountingAdminApi } from '../../lib/api/accounting-phase2';

type Props = {
  paymentId: number;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ReversePaymentDialog({ paymentId, onClose, onSuccess }: Props) {
  const mut = useMutation({
    mutationFn: () => accountingAdminApi.reversePayment(paymentId),
    onSuccess: () => { onSuccess(); onClose(); },
  });
  const err = (mut.error as any)?.response?.data;

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <div className="bg-surface rounded-lg shadow-xl w-[480px] p-6">
        <h2 className="text-lg font-bold mb-4">Reverse Payment</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          This will post a balancing journal entry and mark the payment as REVERSED. The original entry remains in the ledger for audit. Continue?
        </p>
        {err && <div className="text-error text-sm mb-2">{err.code}: {err.message}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          <button disabled={mut.isPending} onClick={() => mut.mutate()} className="px-3 py-1 rounded bg-error text-on-primary text-sm disabled:opacity-50">
            {mut.isPending ? 'Reversing…' : 'Reverse'}
          </button>
        </div>
      </div>
    </div>
  );
}
