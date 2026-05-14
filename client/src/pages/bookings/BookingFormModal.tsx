import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateBooking } from '../../hooks/useBookings';
import { useApartments } from '../../hooks/useApartments';
import { useTenants } from '../../hooks/useTenants';
import { ApartmentStatus } from '@hotel/shared';

const schema = z.object({
  apartmentId: z.coerce.number().min(1, 'Apartment is required'),
  tenantId: z.coerce.number().min(1, 'Tenant is required'),
  checkIn: z.string().min(1, 'Check-in date is required'),
  checkOut: z.string().min(1, 'Check-out date is required'),
  totalAmount: z.coerce.number().min(0.01, 'Total amount must be greater than 0'),
  paymentMethod: z.enum(['CASH', 'CARD', 'INSTALLMENT']),
  paymentAmount: z.coerce.number().min(0.01, 'Payment amount must be greater than 0'),
  referenceNumber: z.string().optional(),
}).refine(
  (d) => !d.checkIn || !d.checkOut || new Date(d.checkOut) > new Date(d.checkIn),
  { message: 'Check-out must be after check-in', path: ['checkOut'] }
);

type FormValues = z.infer<typeof schema>;

interface BookingFormModalProps {
  open: boolean;
  onClose: () => void;
  prefilledApartmentId?: number;
  prefilledTenantId?: number;
}

export default function BookingFormModal({
  open,
  onClose,
  prefilledApartmentId,
  prefilledTenantId,
}: BookingFormModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const createBooking = useCreateBooking();
  const { data: apartments = [] } = useApartments({ status: ApartmentStatus.AVAILABLE });
  const { data: tenants = [] } = useTenants();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      apartmentId: prefilledApartmentId ?? ('' as unknown as number),
      tenantId: prefilledTenantId ?? ('' as unknown as number),
      paymentMethod: 'CASH',
    },
  });

  const paymentMethod = watch('paymentMethod');

  if (!open) return null;

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      await createBooking.mutateAsync({
        apartmentId: values.apartmentId,
        tenantId: values.tenantId,
        checkIn: values.checkIn,
        checkOut: values.checkOut,
        totalAmount: values.totalAmount,
        payment: {
          method: values.paymentMethod,
          amount: values.paymentAmount,
          referenceNumber: values.referenceNumber?.trim() || undefined,
        },
      });
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setApiError(msg ?? 'Something went wrong. Please try again.');
    }
  };

  const inputCls =
    'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-lg p-6 border border-outline-variant max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">New Reservation</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Apartment */}
          <div>
            <label className={labelCls}>Apartment (Available)</label>
            <select
              {...register('apartmentId')}
              disabled={!!prefilledApartmentId}
              className={inputCls + (prefilledApartmentId ? ' opacity-60 cursor-not-allowed' : '')}
            >
              <option value="">Select apartment…</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  Apt. {a.number} — Floor {a.floor}
                </option>
              ))}
              {prefilledApartmentId && !apartments.find((a) => a.id === prefilledApartmentId) && (
                <option value={prefilledApartmentId}>Apt. #{prefilledApartmentId}</option>
              )}
            </select>
            {errors.apartmentId && (
              <p className="text-red-600 text-xs mt-1">{errors.apartmentId.message}</p>
            )}
          </div>

          {/* Tenant */}
          <div>
            <label className={labelCls}>Tenant</label>
            <select
              {...register('tenantId')}
              disabled={!!prefilledTenantId}
              className={inputCls + (prefilledTenantId ? ' opacity-60 cursor-not-allowed' : '')}
            >
              <option value="">Select tenant…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} — {t.phone}
                </option>
              ))}
            </select>
            {errors.tenantId && (
              <p className="text-red-600 text-xs mt-1">{errors.tenantId.message}</p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Check-in</label>
              <input {...register('checkIn')} type="date" className={inputCls} />
              {errors.checkIn && (
                <p className="text-red-600 text-xs mt-1">{errors.checkIn.message}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Check-out</label>
              <input {...register('checkOut')} type="date" className={inputCls} />
              {errors.checkOut && (
                <p className="text-red-600 text-xs mt-1">{errors.checkOut.message}</p>
              )}
            </div>
          </div>

          {/* Total Amount */}
          <div>
            <label className={labelCls}>Total Amount (AED)</label>
            <input
              {...register('totalAmount')}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={inputCls}
            />
            {errors.totalAmount && (
              <p className="text-red-600 text-xs mt-1">{errors.totalAmount.message}</p>
            )}
          </div>

          {/* Payment */}
          <div className="border-t border-outline-variant pt-4">
            <p className="text-sm font-bold text-on-surface mb-3">Initial Payment</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Payment Method</label>
                <select {...register('paymentMethod')} className={inputCls}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="INSTALLMENT">Installment</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Amount Paid Now (AED)</label>
                <input
                  {...register('paymentAmount')}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  className={inputCls}
                />
                {errors.paymentAmount && (
                  <p className="text-red-600 text-xs mt-1">{errors.paymentAmount.message}</p>
                )}
              </div>
              {paymentMethod === 'CARD' && (
                <div>
                  <label className={labelCls}>
                    Reference Number{' '}
                    <span className="font-normal text-on-surface-variant">(optional)</span>
                  </label>
                  <input
                    {...register('referenceNumber')}
                    placeholder="TXN-XXXX"
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          </div>

          {apiError && <p className="text-red-600 text-sm">{apiError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="px-4 py-2 rounded-lg border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isSubmitting ? 'Creating…' : 'Create Reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
