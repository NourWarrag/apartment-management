import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { CommissionType, BrokerStatus } from '@hotel/shared';
import { useCreateBroker, useUpdateBroker, Broker } from '../../hooks/useBrokers';

const schema = z.object({
  name: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  email: z.string().email().optional().or(z.literal('')),
  taxRegistrationNumber: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(BrokerStatus).optional(),
  commissionType: z.nativeEnum(CommissionType),
  defaultCommissionValue: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  broker?: Broker | null;
  onClose: () => void;
  onSaved?: (broker: Broker) => void;
}

export default function BrokerFormModal({ broker, onClose, onSaved }: Props) {
  const isEdit = !!broker;
  const create = useCreateBroker();
  const update = useUpdateBroker(broker?.id ?? -1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      taxRegistrationNumber: '',
      address: '',
      notes: '',
      commissionType: CommissionType.PERCENT,
      defaultCommissionValue: 0,
    },
  });

  useEffect(() => {
    if (broker) {
      reset({
        name: broker.name,
        phone: broker.phone,
        email: broker.email ?? '',
        taxRegistrationNumber: broker.taxRegistrationNumber ?? '',
        address: broker.address ?? '',
        notes: broker.notes ?? '',
        status: broker.status,
        commissionType: broker.commissionType,
        defaultCommissionValue: Number(broker.defaultCommissionValue),
      });
    }
  }, [broker, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      const payload = {
        ...data,
        email: data.email || undefined,
        taxRegistrationNumber: data.taxRegistrationNumber || undefined,
        address: data.address || undefined,
        notes: data.notes || undefined,
      };
      const res = isEdit
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      toast.success(isEdit ? 'Saved' : 'Broker created');
      onSaved?.(res.data as Broker);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Something went wrong');
    }
  };

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-[90vw] lg:max-w-md p-6 border border-outline-variant max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">{isEdit ? 'Edit broker' : 'New broker'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors" type="button">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Company name</label>
            <input {...register('name')} className={inputCls} autoFocus />
            {errors.name && <p className="text-error text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input {...register('phone')} type="tel" className={inputCls} />
            {errors.phone && <p className="text-error text-xs mt-1">{errors.phone.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Email <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <input {...register('email')} type="email" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tax Registration Number <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <input {...register('taxRegistrationNumber')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Address <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <input {...register('address')} className={inputCls} />
          </div>

          <div className="border-t border-outline-variant pt-4">
            <p className="text-sm font-bold text-on-surface mb-3">Default commission</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Type</label>
                <select {...register('commissionType')} className={inputCls}>
                  <option value="PERCENT">Percent</option>
                  <option value="FLAT">Flat (AED)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Value</label>
                <input {...register('defaultCommissionValue')} type="number" min="0" step="0.01" className={inputCls} />
              </div>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls}>Status</label>
              <select {...register('status')} className={inputCls}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Notes <span className="font-normal text-on-surface-variant">(optional)</span></label>
            <textarea {...register('notes')} rows={3} className={inputCls + ' resize-none'} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
