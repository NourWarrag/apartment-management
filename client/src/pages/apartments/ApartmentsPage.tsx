import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApartmentStatus, Role } from '@hotel/shared';
import { useApartments, ApartmentListItem } from '../../hooks/useApartments';
import ApartmentStatusBadge from '../../components/apartments/ApartmentStatusBadge';
import ApartmentFormModal from './ApartmentFormModal';
import { useAuth } from '../../hooks/useAuth';

export default function ApartmentsPage() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApartmentStatus | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ApartmentListItem | null>(null);

  const { data: apartments = [], isLoading } = useApartments({
    search: search || undefined,
    status: statusFilter || undefined,
  });

  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  return (
    <div className="space-y-widget-gap">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary">{t('apartments.title')}</h2>
          <p className="text-on-surface-variant text-sm mt-1">{t('apartments.dailyStatus')}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-lg font-semibold text-sm shadow hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {t('apartments.addApartment')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-4 flex gap-3 flex-wrap border-b border-outline-variant bg-surface-container-low">
          <div className="flex items-center bg-surface border border-outline-variant rounded-lg px-3 py-1.5 gap-2 w-64">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="bg-transparent border-none outline-none text-sm w-full text-on-surface placeholder:text-on-surface-variant/60"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApartmentStatus | '')}
            className="border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">{t('apartments.allStatuses')}</option>
            {Object.values(ApartmentStatus).map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="p-8 text-center text-on-surface-variant text-sm">{t('common.loading')}</div>
        ) : apartments.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant text-sm">{t('common.noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('apartments.number')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('apartments.floor')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('apartments.status')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('apartments.currentTenant')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('apartments.checkIn')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('apartments.checkOut')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('apartments.maintenanceStatus')}</th>
                  {canEdit && <th className="px-6 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {apartments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-surface-container-low transition-colors group">
                    <td className="px-6 py-3">
                      <Link to={`/apartments/${apt.id}`} className="font-semibold text-primary hover:underline text-sm">
                        {apt.number}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-sm text-on-surface-variant">{apt.floor}</td>
                    <td className="px-6 py-3">
                      <ApartmentStatusBadge status={apt.status} />
                    </td>
                    <td className="px-6 py-3 text-sm text-on-surface">
                      {apt.currentBooking ? (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold text-xs shrink-0">
                            {apt.currentBooking.tenant.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span>{apt.currentBooking.tenant.fullName}</span>
                        </div>
                      ) : (
                        <span className="text-on-surface-variant/60 italic text-xs">{t('apartments.noCurrentBooking')}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-on-surface-variant">
                      {apt.currentBooking ? new Date(apt.currentBooking.checkIn).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-on-surface-variant">
                      {apt.currentBooking ? new Date(apt.currentBooking.checkOut).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-3">
                      {apt.activeTicket ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-on-error-container">
                          <span className="material-symbols-outlined text-[14px]">warning</span>
                          {apt.activeTicket.status}
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => { setEditTarget(apt); setShowModal(true); }}
                          className="p-1 hover:bg-surface-container-highest rounded text-on-surface-variant transition-colors"
                          title={t('common.edit')}
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ApartmentFormModal
          apartment={editTarget}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
