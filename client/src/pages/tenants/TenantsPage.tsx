import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KycStatus, TenantTier, Role } from '@hotel/shared';
import { useTenants, TenantListItem, useTenant } from '../../hooks/useTenants';
import TenantFormModal from './TenantFormModal';
import { useAuth } from '../../hooks/useAuth';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';
import Badge from '../../components/ui/Badge';

const KYC_BADGE_COLORS: Record<KycStatus, string> = {
  [KycStatus.VERIFIED]: 'bg-green-100 text-green-800',
  [KycStatus.PENDING]: 'bg-amber-100 text-amber-800',
  [KycStatus.ACTION_REQUIRED]: 'bg-red-100 text-red-800',
};

const KYC_BADGE_LABELS: Record<KycStatus, string> = {
  [KycStatus.VERIFIED]: 'Verified',
  [KycStatus.PENDING]: 'Pending',
  [KycStatus.ACTION_REQUIRED]: 'Action Req.',
};

function KycBadge({ status }: { status: KycStatus }) {
  return <Badge className={KYC_BADGE_COLORS[status]}>{KYC_BADGE_LABELS[status]}</Badge>;
}

function TierSubtitle({ tier }: { tier: TenantTier }) {
  const labelMap: Record<TenantTier, string> = {
    [TenantTier.NEW]: 'New Tenant',
    [TenantTier.SILVER]: 'Silver Tier Resident',
    [TenantTier.GOLD]: 'Gold Tier Resident',
    [TenantTier.PLATINUM]: 'Platinum Tier Resident',
  };
  return <div className="text-[11px] text-on-surface-variant">{labelMap[tier]}</div>;
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatTenureSince(dateStr: string): string {
  const start = new Date(dateStr);
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} Mos`;
  if (months === 0) return `${years} ${years === 1 ? 'Year' : 'Years'}`;
  return `${years} ${years === 1 ? 'Year' : 'Years'}, ${months} Mos`;
}

function DrillDownPanel({
  tenantId,
  onClose,
  onEdit,
  canEdit,
}: {
  tenantId: number;
  onClose: () => void;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const { data: tenant, isLoading } = useTenant(tenantId);

  if (isLoading) {
    return (
      <div className="w-full xl:w-[400px] flex items-center justify-center p-12 bg-surface-container-low rounded-xl border border-outline-variant">
        <span className="text-on-surface-variant text-body-sm">Loading...</span>
      </div>
    );
  }
  if (!tenant) return null;

  const now = new Date();
  const activeLease = tenant.bookings.find(
    (b) => new Date(b.checkIn) <= now && new Date(b.checkOut) >= now
  );

  return (
    <aside className="w-full xl:w-[400px] flex flex-col gap-6">
      {/* Profile Summary Card */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6 shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div className="flex flex-col items-center text-center w-full">
            <div className="relative mb-4">
              <div className="w-24 h-24 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-2xl text-primary border-4 border-white shadow-md">
                {initials(tenant.fullName)}
              </div>
              <span className={`absolute bottom-1 right-1 w-6 h-6 border-4 border-white rounded-full ${activeLease ? 'bg-green-500' : 'bg-outline-variant'}`} />
            </div>
            <h3 className="text-headline-md text-primary">{tenant.fullName}</h3>
            <p className="text-body-sm text-on-surface-variant">
              Tenant since {new Date(tenant.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors shrink-0">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-surface rounded-lg p-3 border border-outline-variant">
            <span className="text-label-caps font-bold text-on-surface-variant uppercase block mb-1">Total Stay</span>
            <span className="text-table-data text-primary font-medium">{formatTenureSince(tenant.createdAt)}</span>
          </div>
          <div className="bg-surface rounded-lg p-3 border border-outline-variant">
            <span className="text-label-caps font-bold text-on-surface-variant uppercase block mb-1">Status</span>
            <span className="text-table-data text-primary font-medium">{activeLease ? 'Active' : 'Inactive'}</span>
          </div>
        </div>

        {/* Tenancy History */}
        <div className="border-t border-outline-variant pt-6">
          <h4 className="text-label-caps font-bold text-on-surface-variant uppercase mb-4 tracking-widest">Tenancy History</h4>
          {tenant.bookings.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant italic">No booking history.</p>
          ) : (
            <div className="space-y-4">
              {tenant.bookings.map((booking, idx) => {
                const isCurrent = new Date(booking.checkIn) <= now && new Date(booking.checkOut) >= now;
                return (
                  <div key={booking.id} className="flex gap-4 relative">
                    <div className={`w-2 rounded-full mt-1 shrink-0 ${isCurrent ? 'bg-primary' : 'bg-outline-variant'}`} style={{ minHeight: idx === tenant.bookings.length - 1 ? '1rem' : '100%' }} />
                    <div>
                      <div className="text-table-data text-primary font-medium">Unit {booking.apartment.number}</div>
                      <div className="text-[11px] text-on-surface-variant">
                        {new Date(booking.checkIn).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                        {' — '}
                        {isCurrent ? 'Present' : new Date(booking.checkOut).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                      </div>
                      <div className="text-[12px] mt-1 font-medium text-on-surface-variant">
                        {booking.apartment.type ? booking.apartment.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 flex gap-3">
          {canEdit && (
            <button
              onClick={onEdit}
              className="flex-1 border border-outline text-primary text-body-sm font-bold py-2.5 rounded-lg hover:bg-surface-container transition-colors"
            >
              Edit Tenant
            </button>
          )}
          <button className="flex-1 bg-primary text-on-primary text-body-sm font-bold py-2.5 rounded-lg hover:opacity-90 transition-opacity">
            Contact
          </button>
        </div>
      </div>

      {/* Operational Notes */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4">
        <h4 className="text-label-caps font-bold text-on-surface-variant uppercase mb-3">Operational Notes</h4>
        <div className="bg-surface-container-low p-3 rounded-lg text-body-sm text-on-surface-variant italic border border-dashed border-outline-variant">
          {tenant.notes
            ? `"${tenant.notes}"`
            : 'No operational notes on file.'}
        </div>
      </div>
    </aside>
  );
}

export default function TenantsPage() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<TenantListItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantListItem | null>(null);

  const { data: tenants = [], isLoading } = useTenants(search || undefined);
  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  const handleRowClick = (tenant: TenantListItem) => {
    setSelectedTenant((prev) => (prev?.id === tenant.id ? null : tenant));
  };

  const handleEdit = (tenant: TenantListItem) => {
    setEditTarget(tenant);
    setShowModal(true);
  };

  return (
    <div className="flex gap-widget-gap flex-col xl:flex-row">
      {/* Left: Registry */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-display-lg text-primary">Tenant Registry</h2>
            <p className="text-body-base text-on-surface-variant mt-1">
              Manage {tenants.length} active residents across all property tiers.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-xl flex items-center gap-2 text-body-base font-bold shadow-lg shadow-primary/10 hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined">person_add</span>
              Register New Tenant
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants, unit numbers, or IDs..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-full py-2 pl-10 pr-4 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Table */}
        <TableContainer
          isLoading={isLoading}
          isEmpty={!isLoading && tenants.length === 0}
          loadingMessage={t('common.loading')}
          emptyMessage={t('common.noData')}
        >
          <Table>
            <TableHead headers={['Full Name', 'Phone & ID', 'Active Apartment', 'Rental Period', 'KYC Status', '']} />
            <TableBody>
              {tenants.map((tenant) => {
                const isSelected = selectedTenant?.id === tenant.id;
                return (
                  <TableRow
                    key={tenant.id}
                    onClick={() => handleRowClick(tenant)}
                    className={`group border-l-4 ${
                      isSelected
                        ? 'bg-surface-container border-l-primary'
                        : 'border-l-transparent'
                    }`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-primary text-xs shrink-0 border border-outline-variant">
                          {initials(tenant.fullName)}
                        </div>
                        <div>
                          <div className="text-sm text-primary font-medium">{tenant.fullName}</div>
                          <TierSubtitle tier={tenant.tier} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell variant="text">
                      <div>{tenant.phone}</div>
                      <div className="text-[11px] text-on-surface-variant font-normal">ID: {tenant.idNumber}</div>
                    </TableCell>
                    <TableCell>
                      {tenant.currentBooking ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary text-white rounded-lg text-xs font-bold">
                          <span className="material-symbols-outlined text-[14px]">apartment</span>
                          {tenant.currentBooking.apartment.number}
                        </div>
                      ) : (
                        <span className="text-on-surface-variant/50 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell variant="text">
                      {tenant.currentBooking ? (
                        <>
                          <div>{new Date(tenant.currentBooking.checkIn).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div className="text-[11px] text-on-surface-variant font-normal">
                            to {new Date(tenant.currentBooking.checkOut).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </>
                      ) : (
                        <span className="text-on-surface-variant/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <KycBadge status={tenant.kycStatus} />
                    </TableCell>
                    <TableCell align="right">
                      <span className="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">
                        chevron_right
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {/* Right: Drill-down Panel */}
      {selectedTenant && (
        <DrillDownPanel
          tenantId={selectedTenant.id}
          onClose={() => setSelectedTenant(null)}
          onEdit={() => handleEdit(selectedTenant)}
          canEdit={canEdit}
        />
      )}

      {showModal && (
        <TenantFormModal
          tenant={editTarget}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
