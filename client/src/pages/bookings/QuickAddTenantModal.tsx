import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useCreateTenant } from '../../hooks/useTenants';
import type { TenantListItem } from '../../hooks/useTenants';

const schema = z.object({
  fullName: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  idNumber: z.string().min(3, 'Required'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (tenant: TenantListItem) => void;
}

export default function QuickAddTenantModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const create = useCreateTenant();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', idNumber: '' },
  });

  if (!open) return null;

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await create.mutateAsync(values);
      onCreated(res.data as TenantListItem);
      reset();
      onClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (status === 409) {
        setError('idNumber', {
          type: 'server',
          message: msg ?? 'ID number already in use',
        });
        return;
      }
      setError('root', {
        type: 'server',
        message: msg ?? 'Something went wrong. Please try again.',
      });
    }
  };

  const inputCls =
    'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-[90vw] lg:max-w-sm p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">
            {t('tenants.quickAdd', 'Quick add tenant')}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>{t('tenants.fullName')}</label>
            <input {...register('fullName')} className={inputCls} autoFocus />
            {errors.fullName && (
              <p className="text-error text-xs mt-1">{errors.fullName.message}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>{t('tenants.phone')}</label>
            <input {...register('phone')} type="tel" className={inputCls} />
            {errors.phone && (
              <p className="text-error text-xs mt-1">{errors.phone.message}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>{t('tenants.idNumber')}</label>
            <input {...register('idNumber')} className={inputCls} />
            {errors.idNumber && (
              <p className="text-error text-xs mt-1">{errors.idNumber.message}</p>
            )}
          </div>

          {errors.root && (
            <p className="text-error text-sm">{errors.root.message}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
