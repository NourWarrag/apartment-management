import { useTranslation } from 'react-i18next';
import { ApartmentStatus } from '@hotel/shared';

const STATUS_STYLES: Record<ApartmentStatus, string> = {
  [ApartmentStatus.AVAILABLE]: 'bg-green-100 text-green-800',
  [ApartmentStatus.OCCUPIED]: 'bg-secondary-container text-on-secondary-fixed',
  [ApartmentStatus.MAINTENANCE]: 'bg-error-container text-on-error-container',
  [ApartmentStatus.RESERVED]: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  [ApartmentStatus.CLEANING]: 'bg-primary-fixed text-primary-container',
  [ApartmentStatus.PENDING_CHECKOUT]: 'bg-surface-container-highest text-on-surface-variant',
};

interface Props {
  status: ApartmentStatus;
  size?: 'sm' | 'md';
}

export default function ApartmentStatusBadge({ status, size = 'sm' }: Props) {
  const { t } = useTranslation();
  const sizeClass = size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-sm px-3 py-1.5';
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${sizeClass} ${STATUS_STYLES[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}
