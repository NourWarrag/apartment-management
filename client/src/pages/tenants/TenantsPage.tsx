import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useTenants, TenantListItem } from '../../hooks/useTenants';
import TenantFormModal from './TenantFormModal';
import { useAuth } from '../../hooks/useAuth';

export default function TenantsPage() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantListItem | null>(null);

  const { data: tenants = [], isLoading } = useTenants(search || undefined);
  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  return (
    <div className="space-y-widget-gap">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary">{t('tenants.title')}</h2>
          <p className="text-on-surface-variant text-sm mt-1">{t('tenants.totalBookings')}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-lg font-semibold text-sm shadow hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            {t('tenants.addTenant')}
          </button>
        )}
      </div>

      {/* Search + Table */}
      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low">
          <div className="flex items-center bg-surface border border-outline-variant rounded-lg px-3 py-1.5 gap-2 w-72">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="bg-transparent border-none outline-none text-sm w-full text-on-surface placeholder:text-on-surface-variant/60"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-on-surface-variant text-sm">{t('common.loading')}</div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant text-sm">{t('common.noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('tenants.fullName')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('tenants.phone')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('tenants.idNumber')}</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{t('tenants.registeredOn')}</th>
                  {canEdit && <th className="px-6 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-primary text-xs shrink-0">
                          {tenant.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <Link to={`/tenants/${tenant.id}`} className="font-semibold text-primary hover:underline text-sm">
                          {tenant.fullName}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-on-surface-variant">{tenant.phone}</td>
                    <td className="px-6 py-3 text-sm font-mono text-on-surface-variant">{tenant.idNumber}</td>
                    <td className="px-6 py-3 text-sm text-on-surface-variant">{new Date(tenant.createdAt).toLocaleDateString()}</td>
                    {canEdit && (
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => { setEditTarget(tenant); setShowModal(true); }}
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
        <TenantFormModal tenant={editTarget} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
