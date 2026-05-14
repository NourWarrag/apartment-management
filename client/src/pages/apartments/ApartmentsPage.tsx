import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApartmentStatus, ApartmentType, Role } from '@hotel/shared';
import { useApartments, ApartmentListItem } from '../../hooks/useApartments';
import ApartmentStatusBadge from '../../components/apartments/ApartmentStatusBadge';
import ApartmentFormModal from './ApartmentFormModal';
import PaymentFormModal from '../payments/PaymentFormModal';
import BookingFormModal from '../bookings/BookingFormModal';
import { useAuth } from '../../hooks/useAuth';

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
  const canEdit = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

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

  const thCls = 'px-table-cell-padding-x py-table-cell-padding-y text-label-caps font-bold text-on-surface-variant uppercase tracking-wider';

  return (
    <div className="space-y-widget-gap">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-widget-gap">
        <div>
          <h2 className="text-display-lg text-primary">Apartment Monitoring</h2>
          <p className="text-on-surface-variant text-body-base mt-1">Real-time status tracking for LuxStay properties.</p>
        </div>
        <button className="flex items-center gap-2 bg-surface-container-high text-primary px-4 py-2.5 rounded font-bold text-body-sm hover:bg-surface-container-highest transition-colors self-start md:self-auto">
          <span className="material-symbols-outlined text-[20px]">cloud_download</span>
          Daily Apartment Status Report
        </button>
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
      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-on-surface-variant text-body-sm">{t('common.loading')}</div>
          ) : tableData.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant text-body-sm">{t('common.noData')}</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className={thCls}>APT. NO</th>
                  <th className={thCls}>TYPE</th>
                  <th className={thCls}>STATUS</th>
                  <th className={thCls}>TENANT NAME</th>
                  <th className={thCls}>CHECK-IN / OUT</th>
                  <th className={thCls}>PAYMENT</th>
                  <th className={thCls}>MAINTENANCE</th>
                  <th className={thCls + ' text-right'}>ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {paged.map((apt) => {
                  const payment = getPaymentLabel(apt);
                  return (
                    <tr key={apt.id} className="hover:bg-surface-container-low transition-colors group">
                      <td className="px-table-cell-padding-x py-table-cell-padding-y font-bold text-table-data">
                        <Link to={`/apartments/${apt.id}`} className="text-primary hover:underline">
                          {apt.number}
                        </Link>
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data text-on-surface">
                        {t(`apartmentType.${apt.type}`)}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y">
                        <ApartmentStatusBadge status={apt.status} />
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data text-on-surface">
                        {apt.currentBooking ? (
                          apt.currentBooking.tenant.fullName
                        ) : (
                          <span className="text-on-surface-variant italic">Vacant</span>
                        )}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data text-on-surface-variant">
                        {apt.currentBooking ? (
                          `${new Date(apt.currentBooking.checkIn).toLocaleDateString('en', { month: 'short', day: 'numeric' })} - ${new Date(apt.currentBooking.checkOut).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
                        ) : '—'}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data">
                        {payment ? (
                          <span className={`flex items-center gap-1 font-bold ${payment.color}`}>
                            <span className="material-symbols-outlined text-[16px]">{payment.icon}</span>
                            {payment.label}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/50">—</span>
                        )}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-table-data">
                        {apt.activeTicket ? (
                          <span className="text-red-600 flex items-center gap-1 font-bold">
                            <span className="material-symbols-outlined text-[16px]">build</span>
                            {apt.activeTicket.status}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/50">—</span>
                        )}
                      </td>
                      <td className="px-table-cell-padding-x py-table-cell-padding-y text-right">
                        {canEdit ? (
                          <div className="flex items-center justify-end gap-1">
                            {apt.currentBooking && (
                              <button
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
                                className="p-1 hover:bg-surface-container rounded-full"
                                title="Record payment"
                              >
                                <span className="material-symbols-outlined text-[20px] text-green-600">payments</span>
                              </button>
                            )}
                            {apt.status === ApartmentStatus.AVAILABLE && (
                              <button
                                onClick={() => setBookingAptId(apt.id)}
                                className="p-1 hover:bg-surface-container rounded-full"
                                title="New reservation"
                              >
                                <span className="material-symbols-outlined text-[20px] text-primary">add_home</span>
                              </button>
                            )}
                            <button
                              onClick={() => { setEditTarget(apt); setShowModal(true); }}
                              className="p-1 hover:bg-surface-container rounded-full"
                            >
                              <span className="material-symbols-outlined text-[20px]">more_vert</span>
                            </button>
                          </div>
                        ) : (
                          apt.status === ApartmentStatus.AVAILABLE && (
                            <button className="text-primary font-bold hover:underline text-body-sm">Check In</button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {tableData.length > 0 && (
          <div className="bg-surface-container-low px-container-padding py-3 border-t border-outline-variant flex items-center justify-between">
            <p className="text-on-surface-variant text-body-sm">
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, tableData.length)} of {tableData.length} units
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant hover:bg-surface transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                {(() => {
                  const windowSize = 5;
                  const half = Math.floor(windowSize / 2);
                  const start = Math.max(1, Math.min(page - half, totalPages - windowSize + 1));
                  const end = Math.min(totalPages, start + windowSize - 1);
                  return Array.from({ length: end - start + 1 }, (_, i) => start + i).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 flex items-center justify-center rounded text-body-sm font-bold transition-colors ${
                        page === pageNum
                          ? 'bg-primary text-on-primary'
                          : 'border border-outline-variant hover:bg-surface'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ));
                })()}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant hover:bg-surface transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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
        <div className="w-full lg:w-[400px] bg-primary-container text-on-primary-container p-6 rounded-xl relative overflow-hidden">
          <div className="relative z-10">
            <h4 className="text-headline-md font-bold text-white mb-2">Staff Distribution</h4>
            <p className="text-on-primary-container/80 text-body-sm mb-6">Current housekeeping and maintenance teams on site.</p>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-body-sm text-white">Housekeeping (Team A)</span>
                <span className="bg-green-500/20 text-green-400 text-[11px] font-bold px-2 py-0.5 rounded border border-green-500/30">ACTIVE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-body-sm text-white">Maintenance (Emergency)</span>
                <span className="bg-red-500/20 text-red-400 text-[11px] font-bold px-2 py-0.5 rounded border border-red-500/30">ON-CALL</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-body-sm text-white">Front Desk Night Shift</span>
                <span className="bg-white/10 text-white/50 text-[11px] font-bold px-2 py-0.5 rounded border border-white/20">SCHEDULED</span>
              </div>
            </div>
            <button className="w-full mt-8 border border-white/20 hover:bg-white/10 py-2.5 rounded font-bold text-body-sm transition-colors text-white">
              Dispatch New Task
            </button>
          </div>
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
        </div>
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
    </div>
  );
}
