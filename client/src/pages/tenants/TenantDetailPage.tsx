import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useTenant } from '../../hooks/useTenants';
import TenantFormModal from './TenantFormModal';
import { useAuth } from '../../hooks/useAuth';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const tenantId = Number(id);
  const { data: user } = useAuth();
  const { data: tenant, isLoading } = useTenant(tenantId);
  const [showEdit, setShowEdit] = useState(false);

  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined text-on-surface-variant animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }
  if (!tenant) {
    return <p className="p-4 text-on-error-container bg-error-container rounded-lg">Tenant not found</p>;
  }

  const totalPaid = tenant.bookings.flatMap((b) => b.payments)
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-widget-gap">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/tenants" className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight text-primary flex-1">{tenant.fullName}</h2>
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

      {/* Info card */}
      <div className="bg-surface border border-outline-variant rounded-xl p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-on-surface-variant mb-1">{t('tenants.fullName')}</p>
            <p className="font-semibold text-on-surface">{tenant.fullName}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant mb-1">{t('tenants.phone')}</p>
            <p className="text-on-surface">{tenant.phone}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant mb-1">{t('tenants.idNumber')}</p>
            <p className="font-mono text-xs text-on-surface">{tenant.idNumber}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant mb-1">{t('tenants.registeredOn')}</p>
            <p className="text-on-surface">{new Date(tenant.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant mb-1">{t('tenants.totalBookings')}</p>
            <p className="text-2xl font-bold text-primary">{tenant.bookings.length}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-green-700">AED {totalPaid.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Booking history */}
      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant bg-surface-container-low">
          <h3 className="text-sm font-bold text-primary">{t('tenants.bookingHistory')}</h3>
        </div>
        {tenant.bookings.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant text-sm italic">{t('tenants.noBookings')}</div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {tenant.bookings.map((booking) => {
              const paidAmount = booking.payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount), 0);
              const isFullyPaid = paidAmount >= Number(booking.totalAmount);
              return (
                <div key={booking.id} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Link to={`/apartments/${booking.apartment.id}`} className="flex items-center gap-2 font-semibold text-primary hover:underline text-sm">
                      <span className="material-symbols-outlined text-[16px]">apartment</span>
                      {t('apartments.number')} {booking.apartment.number}
                    </Link>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isFullyPaid ? 'bg-green-100 text-green-800' : 'bg-tertiary-fixed text-on-tertiary-fixed-variant'}`}>
                      {isFullyPaid ? t('status.PAID') : t('status.PENDING')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-on-surface-variant mb-3">
                    <div>
                      <span className="font-medium">{t('apartments.checkIn')}: </span>
                      {new Date(booking.checkIn).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="font-medium">{t('apartments.checkOut')}: </span>
                      {new Date(booking.checkOut).toLocaleDateString()}
                    </div>
                    <div className="text-right font-bold text-on-surface">
                      AED {Number(booking.totalAmount).toLocaleString()}
                    </div>
                  </div>
                  {booking.payments.length > 0 && (
                    <div className="bg-surface-container-low rounded-lg p-3">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">{t('tenants.paymentHistory')}</p>
                      <div className="space-y-1">
                        {booking.payments.map((p) => (
                          <div key={p.id} className="flex justify-between text-xs text-on-surface-variant">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">
                                {p.method === 'CASH' ? 'payments' : p.method === 'CARD' ? 'credit_card' : 'receipt_long'}
                              </span>
                              {p.method}
                            </span>
                            <span className={p.status === 'PAID' ? 'text-green-700 font-semibold' : 'text-on-tertiary-container'}>
                              AED {Number(p.amount).toLocaleString()} · {t(`status.${p.status}`)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showEdit && (
        <TenantFormModal tenant={tenant} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}
