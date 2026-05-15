import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { DepositStatus } from '@hotel/shared';
import { useCheckout } from '../../hooks/useBookings';
import type { BookingOnApartment } from '../../hooks/useApartments';

interface Props {
  booking: BookingOnApartment;
  onClose: () => void;
}

export default function CheckoutModal({ booking, onClose }: Props) {
  const hasDeposit = booking.depositStatus === DepositStatus.HELD;
  const depositAmt = Number(booking.depositAmount ?? 0);

  const schema = z.object({
    depositRefundAmount: hasDeposit
      ? z.coerce
          .number()
          .min(0, 'Must be 0 or more')
          .max(depositAmt, `Cannot exceed deposit of ${depositAmt}`)
      : z.coerce.number().optional(),
  });

  type FormValues = z.infer<typeof schema>;

  const checkout = useCheckout(booking.id);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { depositRefundAmount: hasDeposit ? depositAmt : undefined },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await checkout.mutateAsync(hasDeposit ? data.depositRefundAmount : undefined);
      toast.success('Checkout complete — apartment is now in cleaning');
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Checkout failed');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">Checkout</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-2 mb-6 text-sm text-on-surface-variant">
          <p><span className="font-semibold text-on-surface">Tenant:</span> {booking.tenant.fullName}</p>
          <p>
            <span className="font-semibold text-on-surface">Stay:</span>{' '}
            {new Date(booking.checkIn).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' — '}
            {new Date(booking.checkOut).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <p><span className="font-semibold text-on-surface">Total:</span> AED {Number(booking.totalAmount).toLocaleString()}</p>
          {hasDeposit && (
            <p><span className="font-semibold text-on-surface">Security Deposit:</span> AED {depositAmt.toLocaleString()}</p>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {hasDeposit && (
            <div>
              <label className={labelCls}>Deposit Refund Amount (AED)</label>
              <input
                {...register('depositRefundAmount')}
                type="number"
                min={0}
                max={depositAmt}
                step="0.01"
                className={inputCls}
              />
              {errors.depositRefundAmount && (
                <p className="text-error text-xs mt-1">{errors.depositRefundAmount.message}</p>
              )}
              <p className="text-xs text-on-surface-variant mt-1">
                Full deposit = full release. Any lower amount = forfeited (kept for damages).
              </p>
            </div>
          )}

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
              disabled={checkout.isPending}
              className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {checkout.isPending ? 'Processing…' : 'Confirm Checkout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
