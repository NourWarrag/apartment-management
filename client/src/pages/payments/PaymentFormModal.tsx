import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreatePayment } from '../../hooks/usePayments';
import { useApartments } from '../../hooks/useApartments';
import { ApartmentStatus } from '@hotel/shared';

const schema = z.object({
  method: z.enum(['CASH', 'CARD', 'INSTALLMENT']),
  amount: z.coerce.number().min(0.01, 'Amount must be at least 0.01'),
  referenceNumber: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface BookingSummary {
  tenantName: string;
  apartmentNumber: string;
  checkIn: string;
  checkOut: string;
}

interface PaymentFormModalProps {
  open: boolean;
  onClose: () => void;
  bookingId?: number;
  bookingSummary?: BookingSummary;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PaymentFormModal({ open, onClose, bookingId: prefilledBookingId, bookingSummary }: PaymentFormModalProps) {
  const [selectedBookingId, setSelectedBookingId] = useState<number | undefined>(prefilledBookingId);
  const [selectedAptId, setSelectedAptId] = useState<number | ''>('');
  const [apiError, setApiError] = useState<string | null>(null);

  const createPayment = useCreatePayment();

  // Mode B: fetch occupied apartments for booking search
  const { data: apartments = [] } = useApartments(
    { status: ApartmentStatus.OCCUPIED },
    { enabled: !prefilledBookingId }
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { method: 'CASH', amount: '' as unknown as number, referenceNumber: '' },
  });

  const method = watch('method');

  const handleAptChange = (aptId: number | '') => {
    setSelectedAptId(aptId);
    if (aptId === '') {
      setSelectedBookingId(undefined);
      return;
    }
    const apt = apartments.find((a) => a.id === aptId);
    setSelectedBookingId(apt?.currentBooking?.id);
  };

  const onSubmit = async (data: FormValues) => {
    const bookingId = selectedBookingId ?? prefilledBookingId;
    if (!bookingId) {
      setApiError('Please select an apartment with an active booking.');
      return;
    }
    setApiError(null);
    try {
      await createPayment.mutateAsync({
        bookingId,
        method: data.method,
        amount: data.amount,
        referenceNumber: data.referenceNumber?.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setApiError(msg ?? 'Something went wrong. Please try again.');
    }
  };

  if (!open) return null;

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  // Find selected apt for Mode B display
  const selectedApt = apartments.find((a) => a.id === selectedAptId);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">Record Payment</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Mode A: pre-filled booking summary */}
        {prefilledBookingId && (
          bookingSummary ? (
            <div className="mb-5 p-3 bg-surface-container rounded-lg border border-outline-variant">
              <p className="text-sm font-bold text-on-surface">{bookingSummary.tenantName}</p>
              <p className="text-xs text-on-surface-variant">Apt {bookingSummary.apartmentNumber}</p>
              <p className="text-xs text-on-surface-variant">
                {formatDate(bookingSummary.checkIn)} — {formatDate(bookingSummary.checkOut)}
              </p>
            </div>
          ) : (
            <div className="mb-5 p-3 bg-surface-container rounded-lg border border-outline-variant">
              <p className="text-xs text-on-surface-variant">Booking #{prefilledBookingId}</p>
            </div>
          )
        )}

        {/* Mode B: apartment search */}
        {!prefilledBookingId && (
          <div className="mb-5">
            <label className={labelCls}>Apartment (Occupied)</label>
            <select
              value={selectedAptId}
              onChange={(e) => handleAptChange(e.target.value === '' ? '' : Number(e.target.value))}
              className={inputCls}
            >
              <option value="">Select apartment…</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  Apt {a.number} — {a.currentBooking?.tenant.fullName ?? 'No active booking'}
                </option>
              ))}
            </select>
            {selectedApt?.currentBooking && (
              <div className="mt-2 p-3 bg-surface-container rounded-lg border border-outline-variant">
                <p className="text-sm font-bold text-on-surface">{selectedApt.currentBooking.tenant.fullName}</p>
                <p className="text-xs text-on-surface-variant">
                  {formatDate(selectedApt.currentBooking.checkIn)} — {formatDate(selectedApt.currentBooking.checkOut)}
                </p>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Payment Method</label>
            <select {...register('method')} className={inputCls}>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="INSTALLMENT">Installment</option>
            </select>
            {errors.method && <p className="text-red-600 text-xs mt-1">{errors.method.message}</p>}
          </div>

          <div>
            <label className={labelCls}>Amount (AED)</label>
            <input
              {...register('amount')}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={inputCls}
            />
            {errors.amount && <p className="text-red-600 text-xs mt-1">{errors.amount.message}</p>}
          </div>

          {method === 'CARD' && (
            <div>
              <label className={labelCls}>Reference Number <span className="font-normal text-on-surface-variant">(optional)</span></label>
              <input {...register('referenceNumber')} placeholder="TXN-XXXX" className={inputCls} />
            </div>
          )}

          {apiError && (
            <p className="text-red-600 text-sm">{apiError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
