import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ApartmentStatus, Role } from '@hotel/shared';
import { useApartment, useUpdateApartment } from '../../hooks/useApartments';
import ApartmentStatusBadge from '../../components/apartments/ApartmentStatusBadge';
import ApartmentFormModal from './ApartmentFormModal';
import { useAuth } from '../../hooks/useAuth';

export default function ApartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const aptId = Number(id);
  const { data: user } = useAuth();
  const { data: apartment, isLoading } = useApartment(aptId);
  const updateApt = useUpdateApartment(aptId);
  const [showEdit, setShowEdit] = useState(false);

  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  const handleStatusChange = async (status: ApartmentStatus) => {
    try {
      await updateApt.mutateAsync({ status });
      toast.success(t('common.savedSuccessfully', 'Status updated'));
    } catch {
      toast.error('Failed to update status');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined text-on-surface-variant animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }
  if (!apartment) {
    return <p className="p-4 text-on-error-container bg-error-container rounded-lg">Apartment not found</p>;
  }

  return (
    <div className="space-y-widget-gap">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/apartments" className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <h2 className="text-3xl font-bold tracking-tight text-primary">
            {t('apartments.number')} {apartment.number}
          </h2>
          <ApartmentStatusBadge status={apartment.status} size="md" />
        </div>
        {canEdit && (
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-2 border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2 text-sm font-medium hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
            {t('common.edit')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-widget-gap">
        {/* Left: Info + Status change */}
        <div className="space-y-widget-gap">
          {/* Info card */}
          <div className="bg-surface border border-outline-variant rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">{t('apartments.floor')}</span>
                <span className="font-semibold text-on-surface">{apartment.floor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">{t('apartments.status')}</span>
                <ApartmentStatusBadge status={apartment.status} />
              </div>
            </div>
          </div>

          {/* Status change buttons */}
          {canEdit && (
            <div className="bg-surface border border-outline-variant rounded-xl p-5">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                {t('apartments.changeStatus')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.values(ApartmentStatus).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={apartment.status === s || updateApt.isPending}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-40 ${
                      apartment.status === s
                        ? 'bg-secondary-container border-secondary-container text-on-secondary-fixed font-bold'
                        : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {t(`status.${s}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Current booking */}
        <div className="lg:col-span-2 space-y-widget-gap">
          {/* Current booking card */}
          <div className="bg-surface border border-outline-variant rounded-xl p-5">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">
              {t('apartments.currentTenant')}
            </h3>
            {apartment.currentBooking ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-primary">
                    {apartment.currentBooking.tenant.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <Link to={`/tenants/${apartment.currentBooking.tenant.id}`} className="font-semibold text-primary hover:underline text-base">
                      {apartment.currentBooking.tenant.fullName}
                    </Link>
                    <p className="text-xs text-on-surface-variant">{apartment.currentBooking.tenant.phone}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-container-low rounded-lg p-3">
                    <p className="text-xs text-on-surface-variant mb-1">{t('apartments.checkIn')}</p>
                    <p className="font-semibold text-on-surface">{new Date(apartment.currentBooking.checkIn).toLocaleDateString()}</p>
                  </div>
                  <div className="bg-surface-container-low rounded-lg p-3">
                    <p className="text-xs text-on-surface-variant mb-1">{t('apartments.checkOut')}</p>
                    <p className="font-semibold text-on-surface">{new Date(apartment.currentBooking.checkOut).toLocaleDateString()}</p>
                  </div>
                  <div className="bg-surface-container-low rounded-lg p-3 col-span-2">
                    <p className="text-xs text-on-surface-variant mb-1">{t('apartments.paymentStatus')}</p>
                    <p className={`font-semibold ${apartment.currentBooking.payments.every((p) => p.status === 'PAID') ? 'text-green-700' : 'text-on-tertiary-container'}`}>
                      {apartment.currentBooking.payments.every((p) => p.status === 'PAID')
                        ? t('status.PAID')
                        : t('status.PENDING')}
                      {' — '}AED {Number(apartment.currentBooking.totalAmount).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-40">bed</span>
                <p className="text-sm italic">{t('apartments.noCurrentBooking')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Booking History */}
      {apartment.bookings.length > 0 && (
        <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant bg-surface-container-low">
            <h3 className="text-sm font-bold text-primary">{t('apartments.bookingHistory')}</h3>
          </div>
          <div className="divide-y divide-outline-variant">
            {apartment.bookings.map((b) => (
              <div key={b.id} className="px-5 py-3 flex items-center justify-between hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-primary text-xs shrink-0">
                    {b.tenant.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <Link to={`/tenants/${b.tenant.id}`} className="text-sm font-medium text-primary hover:underline">{b.tenant.fullName}</Link>
                </div>
                <span className="text-xs text-on-surface-variant">
                  {new Date(b.checkIn).toLocaleDateString()} → {new Date(b.checkOut).toLocaleDateString()}
                </span>
                <span className="text-sm font-semibold text-on-surface">AED {Number(b.totalAmount).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance History */}
      {apartment.tickets.length > 0 && (
        <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant bg-surface-container-low flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">build</span>
            <h3 className="text-sm font-bold text-primary">{t('apartments.maintenanceHistory')}</h3>
          </div>
          <div className="divide-y divide-outline-variant">
            {apartment.tickets.map((ticket) => (
              <div key={ticket.id} className="px-5 py-3 flex items-center justify-between hover:bg-surface-container-low transition-colors">
                <p className="text-sm text-on-surface flex-1 mr-4">{ticket.description}</p>
                <div className="flex items-center gap-2 shrink-0">
                  {ticket.resolvedAt && (
                    <span className="text-xs text-on-surface-variant">{new Date(ticket.resolvedAt).toLocaleDateString()}</span>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS'
                      ? 'bg-error-container text-on-error-container'
                      : 'bg-surface-container-highest text-on-surface-variant'
                  }`}>
                    {t(`status.${ticket.status}`)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showEdit && (
        <ApartmentFormModal
          apartment={apartment}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
