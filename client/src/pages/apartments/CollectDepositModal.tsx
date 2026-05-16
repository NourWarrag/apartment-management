import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useCollectDeposit } from '../../hooks/useBookings';

interface Props {
  bookingId: number;
  tenantName: string;
  onClose: () => void;
}

const schema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
});

type FormValues = z.infer<typeof schema>;

export default function CollectDepositModal({ bookingId, tenantName, onClose }: Props) {
  const collectDeposit = useCollectDeposit(bookingId);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await collectDeposit.mutateAsync(data.amount);
      toast.success('Deposit collected');
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to collect deposit');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-sm p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">Collect Security Deposit</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <p className="text-sm text-on-surface-variant mb-4">Tenant: <span className="font-semibold text-on-surface">{tenantName}</span></p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Deposit Amount (AED)</label>
            <input
              {...register('amount')}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={inputCls}
            />
            {errors.amount && <p className="text-error text-xs mt-1">{errors.amount.message}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={collectDeposit.isPending}
              className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {collectDeposit.isPending ? 'Saving…' : 'Collect Deposit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
