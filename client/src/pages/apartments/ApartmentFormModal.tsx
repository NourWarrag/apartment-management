import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ApartmentStatus } from '@hotel/shared';
import {
  useCreateApartment,
  useUpdateApartment,
  ApartmentListItem,
} from '../../hooks/useApartments';

const schema = z.object({
  number: z.string().min(1, 'Required'),
  floor: z.coerce.number().int().min(0),
  status: z.nativeEnum(ApartmentStatus).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  apartment?: ApartmentListItem | null;
  onClose: () => void;
}

export default function ApartmentFormModal({ apartment, onClose }: Props) {
  const { t } = useTranslation();
  const isEdit = !!apartment;
  const create = useCreateApartment();
  const update = useUpdateApartment(apartment?.id ?? -1);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { number: '', floor: 0 },
  });

  useEffect(() => {
    if (apartment) reset({ number: apartment.number, floor: apartment.floor, status: apartment.status });
  }, [apartment, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEdit) {
        await update.mutateAsync(data);
      } else {
        await create.mutateAsync({ number: data.number, floor: data.floor });
      }
      toast.success(isEdit ? t('common.savedSuccessfully', 'Saved successfully') : t('common.createdSuccessfully', 'Created successfully'));
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Something went wrong');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">
            {isEdit ? t('apartments.editApartment') : t('apartments.addApartment')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">
              {t('apartments.number')}
            </label>
            <input
              {...register('number')}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.number && <p className="text-error text-xs mt-1">{errors.number.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">
              {t('apartments.floor')}
            </label>
            <input
              {...register('floor')}
              type="number"
              min={0}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.floor && <p className="text-error text-xs mt-1">{errors.floor.message}</p>}
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm font-semibold text-on-surface mb-1.5">
                {t('apartments.status')}
              </label>
              <select
                {...register('status')}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {Object.values(ApartmentStatus).map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
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
