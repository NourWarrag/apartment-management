import { useTranslation } from 'react-i18next';
import { ApartmentStatus } from '@hotel/shared';

const STATUS_STYLES: Record<ApartmentStatus, string> = {
  [ApartmentStatus.AVAILABLE]: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  [ApartmentStatus.OCCUPIED]: 'bg-amber-50 text-amber-800 border border-amber-200',
  [ApartmentStatus.MAINTENANCE]: 'bg-red-50 text-red-800 border border-red-200',
  [ApartmentStatus.RESERVED]: 'bg-orange-50 text-orange-800 border border-orange-200',
  [ApartmentStatus.CLEANING]: 'bg-blue-50 text-blue-800 border border-blue-200',
  [ApartmentStatus.PENDING_CHECKOUT]: 'bg-purple-50 text-purple-800 border border-purple-200',
};

interface Props {
  status: ApartmentStatus;
  size?: 'sm' | 'md';
}

export default function ApartmentStatusBadge({ status, size = 'sm' }: Props) {
  const { t } = useTranslation();
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${STATUS_STYLES[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}
