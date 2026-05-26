import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useCreateBooking } from '../../hooks/useBookings';
import { useApartments } from '../../hooks/useApartments';
import { useTenants } from '../../hooks/useTenants';
import type { TenantListItem } from '../../hooks/useTenants';
import QuickAddTenantModal from './QuickAddTenantModal';
import BrokerAgentSelector, { BrokerAgentSelection } from '../../components/BrokerAgentSelector';
import { ApartmentStatus, FeatureFlag } from '@hotel/shared';
import { taxCodesApi } from '../../lib/api/accounting-phase2';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';

const schema = z.object({
  apartmentId: z.coerce.number().min(1, 'Apartment is required'),
  tenantId: z.coerce.number().min(1, 'Tenant is required'),
  checkIn: z.string().min(1, 'Check-in date is required'),
  checkOut: z.string().min(1, 'Check-out date is required'),
  rentAmount: z.coerce.number().min(0.01, 'Rent must be greater than 0'),
  serviceCharge: z.coerce.number().min(0).default(0),
  parkingFee: z.coerce.number().min(0).default(0),
  cleaningFee: z.coerce.number().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(['CASH', 'CARD', 'INSTALLMENT']),
  paymentAmount: z.coerce.number().min(0.01, 'Payment amount must be greater than 0'),
  referenceNumber: z.string().optional(),
  depositAmount: z.coerce.number().min(0).optional(),
}).refine(
  (d) => !d.checkIn || !d.checkOut || new Date(d.checkOut) > new Date(d.checkIn),
  { message: 'Check-out must be after check-in', path: ['checkOut'] },
);

type FormValues = z.infer<typeof schema>;

interface BookingFormModalProps {
  open: boolean;
  onClose: () => void;
  prefilledApartmentId?: number;
  prefilledTenantId?: number;
}

function BookingTotalsPreview(props: {
  rentAmount?: number;
  serviceCharge?: number;
  parkingFee?: number;
  cleaningFee?: number;
  discountAmount?: number;
}) {
  const n = (v: number | undefined) => Number(v ?? 0) || 0;
  const subtotal = n(props.rentAmount) + n(props.serviceCharge) + n(props.parkingFee) + n(props.cleaningFee);
  const total = subtotal - n(props.discountAmount);
  return (
    <div className="grid grid-cols-[1fr_8rem] gap-3 pt-2 mt-2 border-t border-outline-variant">
      <span className="text-sm text-on-surface-variant">Subtotal</span>
      <span className="text-right font-mono text-sm text-on-surface">AED {subtotal.toFixed(2)}</span>
      <span className="text-sm font-bold text-on-surface">Total (excl. VAT)</span>
      <span className="text-right font-mono text-sm font-bold text-on-surface">AED {total.toFixed(2)}</span>
    </div>
  );
}

export default function BookingFormModal({
  open,
  onClose,
  prefilledApartmentId,
  prefilledTenantId,
}: BookingFormModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [taxCodeId, setTaxCodeId] = useState<number | null>(null);
  const [brokerSelection, setBrokerSelection] = useState<BrokerAgentSelection>({ brokerId: null, agentId: null });
  const [commissionOverride, setCommissionOverride] = useState<string>('');
  const { data: flags } = useFeatureFlags();
  const accountingOn = !!flags?.[FeatureFlag.ACCOUNTING];
  const { data: taxCodes = [] } = useQuery({
    queryKey: ['accounting', 'tax-codes'],
    queryFn: taxCodesApi.list,
    enabled: accountingOn,
  });
  const createBooking = useCreateBooking();
  const { data: apartments = [] } = useApartments({ status: ApartmentStatus.AVAILABLE });
  const { data: tenants = [] } = useTenants();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
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
        rentAmount: values.rentAmount,
        serviceCharge: values.serviceCharge || undefined,
        parkingFee: values.parkingFee || undefined,
        cleaningFee: values.cleaningFee || undefined,
        discountAmount: values.discountAmount || undefined,
        ...(accountingOn && taxCodeId ? { taxCodeId } : {}),
        ...(brokerSelection.brokerId !== null ? { brokerId: brokerSelection.brokerId } : {}),
        ...(brokerSelection.agentId !== null ? { agentId: brokerSelection.agentId } : {}),
        ...(commissionOverride !== '' ? { commissionAmount: Number(commissionOverride) } : {}),
        payment: {
          method: values.paymentMethod,
          amount: values.paymentAmount,
          referenceNumber: values.referenceNumber?.trim() || undefined,
        },
        ...(values.depositAmount && values.depositAmount > 0
          ? { deposit: { amount: values.depositAmount } }
          : {}),
      });
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setApiError(msg ?? 'Something went wrong. Please try again.');
    }
  };

  const inputCls =
    'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-[90vw] lg:max-w-lg p-6 border border-outline-variant max-h-[90vh] overflow-y-auto">
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
            <div className="flex gap-2">
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
              {!prefilledTenantId && (
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(true)}
                  title="Add new tenant"
                  className="shrink-0 px-3 rounded-lg border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[20px]">person_add</span>
                </button>
              )}
            </div>
            {errors.tenantId && (
              <p className="text-red-600 text-xs mt-1">{errors.tenantId.message}</p>
            )}
          </div>

          {/* Referrer (optional) */}
          <div className="border-t border-outline-variant pt-4">
            <p className="text-sm font-bold text-on-surface mb-3">Referrer <span className="font-normal text-on-surface-variant">(optional)</span></p>
            <BrokerAgentSelector
              value={brokerSelection}
              onChange={setBrokerSelection}
            />
            {brokerSelection.brokerId && (
              <div className="mt-3">
                <label className={labelCls}>Commission override <span className="font-normal text-on-surface-variant">(optional)</span></label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Use computed default"
                  value={commissionOverride}
                  onChange={(e) => setCommissionOverride(e.target.value)}
                  className={inputCls}
                />
                <p className="text-xs text-on-surface-variant mt-1">Leave blank to compute from the agent/broker default rate.</p>
              </div>
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

          {/* Line items */}
          <div className="space-y-2 border-t border-outline-variant pt-4">
            <p className="text-sm font-bold text-on-surface mb-3">Charges</p>
            {[
              { name: 'rentAmount' as const, label: 'Rent', required: true },
              { name: 'serviceCharge' as const, label: 'Service charge' },
              { name: 'parkingFee' as const, label: 'Parking' },
              { name: 'cleaningFee' as const, label: 'Cleaning fee' },
              { name: 'discountAmount' as const, label: 'Discount (deducted)' },
            ].map(({ name, label, required }) => (
              <div key={name} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                <label className="text-sm text-on-surface">
                  {label}{required && ' *'}
                </label>
                <input
                  {...register(name)}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className={inputCls + ' text-right'}
                />
              </div>
            ))}
            {errors.rentAmount && (
              <p className="text-red-600 text-xs">{errors.rentAmount.message}</p>
            )}
            <BookingTotalsPreview
              rentAmount={watch('rentAmount')}
              serviceCharge={watch('serviceCharge')}
              parkingFee={watch('parkingFee')}
              cleaningFee={watch('cleaningFee')}
              discountAmount={watch('discountAmount')}
            />
          </div>

          {/* Tax Code */}
          {accountingOn && taxCodes.length > 0 && (
            <div>
              <label className={labelCls}>
                Tax code <span className="font-normal text-on-surface-variant">(defaults to system default)</span>
              </label>
              <select
                value={taxCodeId ?? ''}
                onChange={(e) => setTaxCodeId(e.target.value ? Number(e.target.value) : null)}
                className={inputCls}
              >
                <option value="">— system default —</option>
                {taxCodes.filter((tc) => tc.isActive).map((tc) => (
                  <option key={tc.id} value={tc.id}>{tc.code} ({tc.ratePct}%)</option>
                ))}
              </select>
            </div>
          )}

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

          {/* Security Deposit */}
          <div className="border-t border-outline-variant pt-4">
            <p className="text-sm font-bold text-on-surface mb-3">Security Deposit <span className="font-normal text-on-surface-variant">(optional)</span></p>
            <div>
              <label className={labelCls}>Deposit Amount (AED)</label>
              <input
                {...register('depositAmount')}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className={inputCls}
              />
              <p className="text-xs text-on-surface-variant mt-1">Leave empty if no deposit collected at check-in.</p>
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
    <QuickAddTenantModal
      open={quickAddOpen}
      onClose={() => setQuickAddOpen(false)}
      onCreated={(tenant: TenantListItem) => {
        setValue('tenantId', tenant.id, { shouldValidate: true });
      }}
    />
    </>
  );
}
