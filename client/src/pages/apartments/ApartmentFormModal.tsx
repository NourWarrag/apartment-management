import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ApartmentStatus, ApartmentType } from '@hotel/shared';
import { useCreateApartment, useUpdateApartment } from '../../hooks/useApartments';
import type { ApartmentListItem } from '../../hooks/useApartments';
import { useBuilding } from '../../context/BuildingContext';
import { useBuildings } from '../../hooks/useBuildings';

const schema = z.object({
  number: z.string().min(1, 'Required'),
  floor: z.coerce.number().int().min(0),
  type: z.nativeEnum(ApartmentType).optional(),
  status: z.nativeEnum(ApartmentStatus).optional(),
  buildingId: z.coerce.number().int().positive('Building is required').optional(),
});

type FormValues = z.infer<typeof schema>;

type ApartmentFormInput = Pick<ApartmentListItem, 'id' | 'number' | 'floor' | 'type' | 'status'>;

interface Props {
  apartment?: ApartmentFormInput | null;
  onClose: () => void;
}

export default function ApartmentFormModal({ apartment, onClose }: Props) {
  const { t } = useTranslation();
  const isEdit = !!apartment;
  const create = useCreateApartment();
  const update = useUpdateApartment(apartment?.id ?? -1);
  const { selectedBuilding } = useBuilding();
  const { data: buildings = [] } = useBuildings();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { number: '', floor: 0, type: ApartmentType.STUDIO },
  });

  useEffect(() => {
    if (apartment) {
      reset({
        number: apartment.number,
        floor: apartment.floor,
        type: apartment.type,
        status: apartment.status,
      });
    }
  }, [apartment, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEdit) {
        await update.mutateAsync(data);
      } else {
        const buildingId = selectedBuilding !== 'all'
          ? selectedBuilding.id
          : data.buildingId;
        if (!buildingId) {
          toast.error('Please select a building');
          return;
        }
        await create.mutateAsync({ number: data.number, floor: data.floor, type: data.type, buildingId });
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
            {isEdit ? t('apartments.editApartment') : t('apartments.addApartment')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {!isEdit && selectedBuilding === 'all' && (
            <div>
              <label className={labelCls}>Building</label>
              <select {...register('buildingId')} className={inputCls}>
                <option value="">Select building...</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {errors.buildingId && <p className="text-error text-xs mt-1">{errors.buildingId.message}</p>}
            </div>
          )}
          {!isEdit && selectedBuilding !== 'all' && (
            <div>
              <label className={labelCls}>Building</label>
              <p className="text-sm text-on-surface-variant px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg">{selectedBuilding.name}</p>
            </div>
          )}
          <div>
            <label className={labelCls}>{t('apartments.number')}</label>
            <input {...register('number')} className={inputCls} />
            {errors.number && <p className="text-error text-xs mt-1">{errors.number.message}</p>}
          </div>

          <div>
            <label className={labelCls}>{t('apartments.floor')}</label>
            <input {...register('floor')} type="number" min={0} className={inputCls} />
            {errors.floor && <p className="text-error text-xs mt-1">{errors.floor.message}</p>}
          </div>

          <div>
            <label className={labelCls}>{t('apartments.type')}</label>
            <select {...register('type')} className={inputCls}>
              {Object.values(ApartmentType).map((tp) => (
                <option key={tp} value={tp}>{t(`apartmentType.${tp}`)}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls}>{t('apartments.status')}</label>
              <select {...register('status')} className={inputCls}>
                {Object.values(ApartmentStatus).map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </div>
          )}

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
