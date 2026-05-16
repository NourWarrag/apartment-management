import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { KycStatus, TenantTier } from '@hotel/shared';
import { useCreateTenant, useUpdateTenant } from '../../hooks/useTenants';
import type { TenantListItem } from '../../hooks/useTenants';

const schema = z.object({
  fullName: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  idNumber: z.string().min(3, 'Required'),
  kycStatus: z.nativeEnum(KycStatus).optional(),
  tier: z.nativeEnum(TenantTier).optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type TenantFormInput = Pick<TenantListItem, 'id' | 'fullName' | 'phone' | 'idNumber' | 'kycStatus' | 'tier' | 'notes'>;

interface Props {
  tenant?: TenantFormInput | null;
  onClose: () => void;
}

export default function TenantFormModal({ tenant, onClose }: Props) {
  const { t } = useTranslation();
  const isEdit = !!tenant;
  const create = useCreateTenant();
  const update = useUpdateTenant(tenant?.id ?? -1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      phone: '',
      idNumber: '',
      kycStatus: KycStatus.PENDING,
      tier: TenantTier.NEW,
      notes: '',
    },
  });

  useEffect(() => {
    if (tenant) {
      reset({
        fullName: tenant.fullName,
        phone: tenant.phone,
        idNumber: tenant.idNumber,
        kycStatus: tenant.kycStatus,
        tier: tenant.tier,
        notes: tenant.notes ?? '',
      });
    }
  }, [tenant, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEdit) {
        await update.mutateAsync(data);
      } else {
        await create.mutateAsync(data);
      }
      toast.success(isEdit ? t('common.savedSuccessfully', 'Saved successfully') : t('common.createdSuccessfully', 'Created successfully'));
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
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">
            {isEdit ? t('tenants.editTenant') : t('tenants.addTenant')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>{t('tenants.fullName')}</label>
            <input {...register('fullName')} className={inputCls} />
            {errors.fullName && <p className="text-error text-xs mt-1">{errors.fullName.message}</p>}
          </div>
          <div>
            <label className={labelCls}>{t('tenants.phone')}</label>
            <input {...register('phone')} type="tel" className={inputCls} />
            {errors.phone && <p className="text-error text-xs mt-1">{errors.phone.message}</p>}
          </div>
          <div>
            <label className={labelCls}>{t('tenants.idNumber')}</label>
            <input {...register('idNumber')} className={inputCls} />
            {errors.idNumber && <p className="text-error text-xs mt-1">{errors.idNumber.message}</p>}
          </div>
          <div>
            <label className={labelCls}>{t('tenants.kycStatus')}</label>
            <select {...register('kycStatus')} className={inputCls}>
              {Object.values(KycStatus).map((k) => (
                <option key={k} value={k}>{t(`kycStatus.${k}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('tenants.tier')}</label>
            <select {...register('tier')} className={inputCls}>
              {Object.values(TenantTier).map((tr) => (
                <option key={tr} value={tr}>{t(`tenantTier.${tr}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('tenants.notes')}</label>
            <textarea {...register('notes')} rows={3} className={inputCls + ' resize-none'} placeholder={t('tenants.notesPlaceholder', 'Optional operational notes...')} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
