import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useCreateTenant, useUpdateTenant, TenantListItem } from '../../hooks/useTenants';

const schema = z.object({
  fullName: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  idNumber: z.string().min(3, 'Required'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  tenant?: TenantListItem | null;
  onClose: () => void;
}

export default function TenantFormModal({ tenant, onClose }: Props) {
  const { t } = useTranslation();
  const isEdit = !!tenant;
  const create = useCreateTenant();
  const update = useUpdateTenant(tenant?.id ?? -1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', idNumber: '' },
  });

  useEffect(() => {
    if (tenant) reset({ fullName: tenant.fullName, phone: tenant.phone, idNumber: tenant.idNumber });
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

  const fields: { name: keyof FormValues; labelKey: string; type?: string }[] = [
    { name: 'fullName', labelKey: 'tenants.fullName' },
    { name: 'phone', labelKey: 'tenants.phone', type: 'tel' },
    { name: 'idNumber', labelKey: 'tenants.idNumber' },
  ];

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
          {fields.map(({ name, labelKey, type = 'text' }) => (
            <div key={name}>
              <label className="block text-sm font-semibold text-on-surface mb-1.5">{t(labelKey)}</label>
              <input
                {...register(name)}
                type={type}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {errors[name] && <p className="text-error text-xs mt-1">{errors[name]?.message}</p>}
            </div>
          ))}

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
