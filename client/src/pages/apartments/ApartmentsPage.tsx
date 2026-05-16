import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ApartmentStatus, ApartmentType, Role, FeatureFlag } from '@hotel/shared';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useApartments, ApartmentListItem } from '../../hooks/useApartments';
import type { BookingOnApartment } from '../../hooks/useApartments';
import { useMarkReady } from '../../hooks/useApartments';
import ApartmentStatusBadge from '../../components/apartments/ApartmentStatusBadge';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';
import TablePagination from '../../components/ui/TablePagination';
import Badge from '../../components/ui/Badge';
import IconButton from '../../components/ui/IconButton';
import ApartmentFormModal from './ApartmentFormModal';
import PaymentFormModal from '../payments/PaymentFormModal';
import BookingFormModal from '../bookings/BookingFormModal';
import CheckoutModal from './CheckoutModal';
import { useAuth } from '../../hooks/useAuth';
import { useBuilding } from '../../context/BuildingContext';
import { useMaintenanceStaff } from '../../hooks/useTickets';
import NewTicketModal from '../tickets/NewTicketModal';

const PAGE_SIZE = 10;

function getPaymentLabel(apt: ApartmentListItem): { icon: string; label: string; color: string } | null {
  if (!apt.currentBooking || apt.currentBooking.payments.length === 0) return null;
  const payments = apt.currentBooking.payments;
  const allPaid = payments.every((p) => p.status === 'PAID');
  if (allPaid) return { icon: 'check_circle', label: 'Paid', color: 'text-green-600' };
  const anyFailed = payments.some((p) => p.status === 'FAILED');
  if (anyFailed) return { icon: 'error', label: 'Overdue', color: 'text-error' };
  if (apt.status === ApartmentStatus.RESERVED) return { icon: 'pending', label: 'Deposit', color: 'text-amber-600' };
  return { icon: 'pending', label: 'Pending', color: 'text-amber-600' };
}

function formatTransitionDate(dateStr: string): { month: string; day: string } {
  const d = new Date(dateStr);
  return {
    month: d.toLocaleString('en', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  };
}

function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d >= now && d <= cutoff;
}

function MarkReadyButton({ apartmentId }: { apartmentId: number }) {
  const markReady = useMarkReady(apartmentId);

  const handleClick = async () => {
    try {
      await markReady.mutateAsync();
      toast.success('Apartment marked as available');
    } catch {
      toast.error('Failed to mark apartment as ready');
    }
  };

  return (
    <IconButton
      icon="done_all"
      tone="success"
      title="Mark ready (cleaning done)"
      onClick={handleClick}
      disabled={markReady.isPending}
    />
  );
}

export default function ApartmentsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const initialStatus = (searchParams.get('status') as ApartmentStatus | null) ?? '';
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<ApartmentType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ApartmentStatus | ''>(initialStatus);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedFloor, setAppliedFloor] = useState<string>('');
  const [appliedType, setAppliedType] = useState<ApartmentType | ''>('');
  const [appliedStatus, setAppliedStatus] = useState<ApartmentStatus | ''>(initialStatus);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ApartmentListItem | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<{
    bookingId: number;
    summary: { tenantName: string; apartmentNumber: string; checkIn: string; checkOut: string };
  } | null>(null);

  const [bookingAptId, setBookingAptId] = useState<number | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<BookingOnApartment | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;
  const canCheckout =
    user?.role === Role.ADMIN ||
    user?.role === Role.RECEPTIONIST ||
    user?.role === Role.BUILDING_ADMIN;
  const { selectedBuilding } = useBuilding();
  const showBuildingBadge = selectedBuilding === 'all';
  const { data: flags } = useFeatureFlags();
  const staffEnabled = flags?.[FeatureFlag.STAFF] ?? false;
  const { data: staffList = [] } = useMaintenanceStaff({ enabled: staffEnabled });

  // Load all apartments (unfiltered) for stats
  const { data: allApartments = [] } = useApartments();

  // Load filtered apartments for table
  const { data: filtered = [], isLoading } = useApartments({
    search: appliedSearch || undefined,
    type: appliedType || undefined,
    status: appliedStatus || undefined,
  });

  // Client-side floor filter (not in API yet)
  const tableData = useMemo(() => {
    if (!appliedFloor) return filtered;
    return filtered.filter((a) => String(a.floor) === appliedFloor);
  }, [filtered, appliedFloor]);

  // Stats (always from unfiltered data)
  const stats = useMemo(() => {
    const total = allApartments.length;
    const available = allApartments.filter((a) => a.status === ApartmentStatus.AVAILABLE).length;
    const occupied = allApartments.filter((a) => a.status === ApartmentStatus.OCCUPIED).length;
    const maintenance = allApartments.filter((a) => a.status === ApartmentStatus.MAINTENANCE).length;
    const pendingCheckout = allApartments.filter((a) => a.status === ApartmentStatus.PENDING_CHECKOUT).length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100 * 10) / 10 : 0;
    return { total, available, occupied, maintenance, pendingCheckout, occupancyRate };
  }, [allApartments]);

  // Upcoming transitions
  const upcomingTransitions = useMemo(() => {
    const checkOuts = allApartments
      .filter((a) => a.currentBooking && isWithinDays(a.currentBooking.checkOut, 7))
      .map((a) => ({
        type: 'checkout' as const,
        unit: a.number,
        tenant: a.currentBooking!.tenant.fullName,
        date: a.currentBooking!.checkOut,
      }));
    const checkIns = allApartments
      .filter((a) => a.upcomingBooking && isWithinDays(a.upcomingBooking.checkIn, 7))
      .map((a) => ({
        type: 'checkin' as const,
        unit: a.number,
        tenant: a.upcomingBooking!.tenant.fullName,
        date: a.upcomingBooking!.checkIn,
      }));
    return [...checkOuts, ...checkIns]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [allApartments]);

  // Unique floors for filter
  const floors = useMemo(() => {
    const set = new Set(allApartments.map((a) => a.floor));
    return Array.from(set).sort((a, b) => a - b);
  }, [allApartments]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(tableData.length / PAGE_SIZE));
  const paged = tableData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const applyFilters = () => {
    setAppliedSearch(search);
    setAppliedFloor(floorFilter);
    setAppliedType(typeFilter);
    setAppliedStatus(statusFilter);
    setPage(1);
  };

  return (
    <div className="space-y-widget-gap">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-widget-gap">
        <div>
          <h2 className="text-display-lg text-primary">Apartment Monitoring</h2>
          <p className="text-on-surface-variant text-body-base mt-1">Real-time status tracking for LuxStay properties.</p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          {canEdit && (
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded font-bold text-body-sm hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              Add Apartment
            </button>
          )}
          <button className="flex items-center gap-2 bg-surface-container-high text-primary px-4 py-2.5 rounded font-bold text-body-sm hover:bg-surface-container-highest transition-colors">
            <span className="material-symbols-outlined text-[20px]">cloud_download</span>
            Daily Apartment Status Report
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-outline-variant p-4 rounded-xl flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">FLOOR</label>
          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="">All Floors</option>
            {floors.map((f) => (
              <option key={f} value={String(f)}>Floor {f}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">APARTMENT TYPE</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ApartmentType | '')}
            className="w-full bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="">{t('apartments.allTypes', 'All Types')}</option>
            {Object.values(ApartmentType).map((tp) => (
              <option key={tp} value={tp}>{t(`apartmentType.${tp}`)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">STATUS</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApartmentStatus | '')}
            className="w-full bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="">{t('apartments.allStatuses')}</option>
            {Object.values(ApartmentStatus).map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="Search unit..."
            className="bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none w-40"
          />
          <button
            onClick={applyFilters}
            className="bg-primary text-on-primary h-[40px] px-6 rounded font-bold text-body-sm hover:opacity-90 transition-opacity"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-widget-gap">
        {/* Occupancy Rate */}
        <div className="bg-white border border-outline-variant p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">meeting_room</span>
            <span className="text-xs font-bold text-on-secondary-container bg-secondary-container px-2 py-0.5 rounded-full">
              Total {stats.total}
            </span>
          </div>
          <p className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">OCCUPANCY RATE</p>
          <h3 className="text-display-lg mt-1">{stats.occupancyRate}%</h3>
          <div className="w-full bg-surface-container mt-3 h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${stats.occupancyRate}%` }} />
          </div>
        </div>

        {/* Available Now */}
        <div className="bg-white border border-outline-variant border-l-4 border-l-green-500 p-5 rounded-xl">
          <p className="text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">AVAILABLE NOW</p>
          <h3 className="text-display-lg">{stats.available}</h3>
          <p className="text-xs text-green-600 font-bold flex items-center gap-1 mt-2">
            <span className="material-symbols-outlined text-[14px]">trending_up</span> Ready for Check-in
          </p>
        </div>

        {/* Pending Check-Out */}
        <div className="bg-white border border-outline-variant border-l-4 border-l-amber-500 p-5 rounded-xl">
          <p className="text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">PENDING CHECK-OUT</p>
          <h3 className="text-display-lg">{stats.pendingCheckout}</h3>
          <p className="text-xs text-amber-600 font-bold flex items-center gap-1 mt-2">
            <span className="material-symbols-outlined text-[14px]">schedule</span> Next 24 Hours
          </p>
        </div>

        {/* In Maintenance */}
        <div className="bg-white border border-outline-variant border-l-4 border-l-red-500 p-5 rounded-xl">
          <p className="text-label-caps font-bold text-on-surface-variant mb-1 uppercase tracking-wider">IN MAINTENANCE</p>
          <h3 className="text-display-lg">{String(stats.maintenance).padStart(2, '0')}</h3>
          <p className="text-xs text-red-600 font-bold flex items-center gap-1 mt-2">
            <span className="material-symbols-outlined text-[14px]">warning</span> Urgent Repairs
          </p>
        </div>
      </div>

      {/* Data Table */}
      <TableContainer
        isLoading={isLoading}
        isEmpty={!isLoading && tableData.length === 0}
        loadingMessage={t('common.loading')}
        emptyMessage={t('common.noData')}
      >
        <Table
          footer={
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={tableData.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              variant="numeric"
              itemLabel="units"
              className="bg-surface-container-low"
            />
          }
        >
          <TableHead headers={['Apt. No', 'Type', 'Status', 'Tenant Name', 'Check-in / Out', 'Payment', 'Maintenance', 'Actions']} />
          <TableBody>
            {paged.map((apt) => {
              const payment = getPaymentLabel(apt);
              return (
                <TableRow key={apt.id} className="group">
                  <TableCell variant="strong">
                    <span className="inline-flex items-center gap-1">
                      <Link to={`/apartments/${apt.id}`} className="text-primary hover:underline">
                        {apt.number}
                      </Link>
                      {showBuildingBadge && apt.building && (
                        <Badge variant="tag" tone="secondary" className="ml-1">{apt.building.code}</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell variant="text">{t(`apartmentType.${apt.type}`)}</TableCell>
                  <TableCell>
                    <ApartmentStatusBadge status={apt.status} />
                  </TableCell>
                  <TableCell variant="text">
                    {apt.currentBooking ? (
                      apt.currentBooking.tenant.fullName
                    ) : (
                      <span className="text-on-surface-variant italic">Vacant</span>
                    )}
                  </TableCell>
                  <TableCell variant="muted">
                    {apt.currentBooking ? (
                      `${new Date(apt.currentBooking.checkIn).toLocaleDateString('en', { month: 'short', day: 'numeric' })} - ${new Date(apt.currentBooking.checkOut).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {payment ? (
                      <span className={`flex items-center gap-1 font-bold text-sm ${payment.color}`}>
                        <span className="material-symbols-outlined text-[16px]">{payment.icon}</span>
                        {payment.label}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant/50">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {apt.activeTicket ? (
                      <span className="text-red-600 flex items-center gap-1 font-bold text-sm">
                        <span className="material-symbols-outlined text-[16px]">build</span>
                        {apt.activeTicket.status}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant/50">—</span>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <>
                          {apt.currentBooking && (
                            <IconButton
                              icon="payments"
                              tone="success"
                              title="Record payment"
                              onClick={() =>
                                setPaymentTarget({
                                  bookingId: apt.currentBooking!.id,
                                  summary: {
                                    tenantName: apt.currentBooking!.tenant.fullName,
                                    apartmentNumber: apt.number,
                                    checkIn: apt.currentBooking!.checkIn,
                                    checkOut: apt.currentBooking!.checkOut,
                                  },
                                })
                              }
                            />
                          )}
                          {apt.status === ApartmentStatus.AVAILABLE && (
                            <IconButton
                              icon="add_home"
                              tone="primary"
                              title="New reservation"
                              onClick={() => setBookingAptId(apt.id)}
                            />
                          )}
                          <IconButton
                            icon="more_vert"
                            title="More actions"
                            onClick={() => { setEditTarget(apt); setShowModal(true); }}
                          />
                        </>
                      )}
                      {apt.status === ApartmentStatus.OCCUPIED && apt.currentBooking && canCheckout && (
                        <IconButton
                          icon="logout"
                          tone="warning"
                          title="Checkout"
                          onClick={() => setCheckoutTarget(apt.currentBooking!)}
                        />
                      )}
                      {apt.status === ApartmentStatus.CLEANING && canCheckout && (
                        <MarkReadyButton apartmentId={apt.id} />
                      )}
                      {!canEdit && apt.status === ApartmentStatus.AVAILABLE && (
                        <button className="text-primary font-bold hover:underline text-body-sm">Check In</button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Bottom Panels */}
      <div className="flex flex-col lg:flex-row gap-widget-gap">
        {/* Upcoming Transitions */}
        <div className="flex-1 bg-white border border-outline-variant p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-headline-md font-bold">Upcoming Transitions</h4>
            <button className="text-primary text-body-sm font-bold">View Calendar</button>
          </div>
          {upcomingTransitions.length === 0 ? (
            <p className="text-on-surface-variant text-body-sm italic">No upcoming transitions in the next 7 days.</p>
          ) : (
            <div className="space-y-4">
              {upcomingTransitions.map((tr, i) => {
                const { month, day } = formatTransitionDate(tr.date);
                const isCheckout = tr.type === 'checkout';
                return (
                  <div key={i} className="flex items-center gap-4 p-3 bg-surface-container-low rounded-lg">
                    <div className={`w-12 h-12 rounded flex flex-col items-center justify-center font-bold ${isCheckout ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                      <span className="text-[10px] leading-none">{month}</span>
                      <span className="text-lg leading-tight">{day}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-body-base">{isCheckout ? 'Check-out' : 'Check-in'}: Unit {tr.unit}</p>
                      <p className="text-body-sm text-on-surface-variant">Tenant: {tr.tenant}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${isCheckout ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                      {isCheckout ? 'PENDING' : 'CONFIRMED'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Staff Distribution */}
        {staffEnabled && (
          <div className="w-full lg:w-[400px] bg-primary-container text-on-primary-container p-6 rounded-xl relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="text-headline-md font-bold text-white mb-2">Staff Distribution</h4>
              <p className="text-on-primary-container/80 text-body-sm mb-6">Current housekeeping and maintenance teams on site.</p>
              <div className="space-y-4">
                {staffList.length === 0 && (
                  <p className="text-white/60 text-body-sm">No staff on record.</p>
                )}
                {staffList.map((staff) => {
                  const statusColor =
                    staff.staffStatus === 'ACTIVE' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                    staff.staffStatus === 'ON_CALL' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                    'bg-white/10 text-white/50 border-white/20';
                  const statusLabel =
                    staff.staffStatus === 'ACTIVE' ? 'ACTIVE' :
                    staff.staffStatus === 'ON_CALL' ? 'ON CALL' : 'OFF DUTY';
                  return (
                    <div key={staff.id} className="flex justify-between items-center">
                      <span className="text-body-sm text-white">{staff.name}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
              {canEdit && (
                <button
                  onClick={() => setDispatchOpen(true)}
                  className="w-full mt-8 border border-white/20 hover:bg-white/10 py-2.5 rounded font-bold text-body-sm transition-colors text-white"
                >
                  Dispatch New Task
                </button>
              )}
            </div>
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
          </div>
        )}
      </div>

      {showModal && (
        <ApartmentFormModal
          apartment={editTarget}
          onClose={() => setShowModal(false)}
        />
      )}
      {paymentTarget && (
        <PaymentFormModal
          open={!!paymentTarget}
          onClose={() => setPaymentTarget(null)}
          bookingId={paymentTarget.bookingId}
          bookingSummary={paymentTarget.summary}
        />
      )}
      {canEdit && bookingAptId !== null && (
        <BookingFormModal
          open={true}
          onClose={() => setBookingAptId(null)}
          prefilledApartmentId={bookingAptId}
        />
      )}
      {checkoutTarget && (
        <CheckoutModal
          booking={checkoutTarget}
          onClose={() => setCheckoutTarget(null)}
        />
      )}
      {staffEnabled && dispatchOpen && (
        <NewTicketModal
          open={dispatchOpen}
          onClose={() => setDispatchOpen(false)}
          defaultType="CLEANING"
        />
      )}
    </div>
  );
}
