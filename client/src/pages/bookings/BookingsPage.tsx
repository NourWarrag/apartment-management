import { useState } from 'react';
import { useBookingsList, BookingListItem } from '../../hooks/useBookings';
import BookingInvoiceModal from '../../components/BookingInvoiceModal';
import { useBuildings } from '../../hooks/useBuildings';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';
import TablePagination from '../../components/ui/TablePagination';
import Badge from '../../components/ui/Badge';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import BookingFormModal from './BookingFormModal';

const PAGE_SIZE = 20;

const DEPOSIT_BADGE: Record<string, { label: string; classes: string }> = {
  NONE: { label: 'No Deposit', classes: 'bg-surface-container text-on-surface-variant' },
  HELD: { label: 'Held', classes: 'bg-amber-100 text-amber-800' },
  RELEASED: { label: 'Released', classes: 'bg-green-100 text-green-800' },
  FORFEITED: { label: 'Forfeited', classes: 'bg-red-100 text-red-800' },
};

function deriveStatus(b: BookingListItem): 'ACTIVE' | 'UPCOMING' | 'CHECKED_OUT' {
  if (b.checkedOutAt) return 'CHECKED_OUT';
  if (new Date(b.checkIn) > new Date()) return 'UPCOMING';
  return 'ACTIVE';
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: 'Active', classes: 'bg-green-100 text-green-800' },
  UPCOMING: { label: 'Upcoming', classes: 'bg-blue-100 text-blue-800' },
  CHECKED_OUT: { label: 'Checked Out', classes: 'bg-surface-container text-on-surface-variant' },
};

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAed(str: string) {
  return `AED ${Number(str).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function BookingsPage() {
  // Filter state (pending — not yet applied)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'UPCOMING' | 'CHECKED_OUT' | ''>('');
  const [buildingIdFilter, setBuildingIdFilter] = useState<string>('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  // Applied state (sent to API)
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStatus, setAppliedStatus] = useState<'ACTIVE' | 'UPCOMING' | 'CHECKED_OUT' | ''>('');
  const [appliedBuildingId, setAppliedBuildingId] = useState<number | undefined>(undefined);
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [page, setPage] = useState(1);

  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const { data: user } = useAuth();
  const canCreateBooking =
    user?.role === Role.SUPER_ADMIN ||
    user?.role === Role.ADMIN ||
    user?.role === Role.BUILDING_ADMIN ||
    user?.role === Role.RECEPTIONIST;

  // Buildings list for the dropdown
  const { data: buildings } = useBuildings();

  const sharedParams = {
    search: appliedSearch || undefined,
    buildingId: appliedBuildingId,
    from: appliedFrom || undefined,
    to: appliedTo || undefined,
  };

  const { data, isLoading } = useBookingsList({
    ...sharedParams,
    status: appliedStatus || undefined,
    page,
    limit: PAGE_SIZE,
  });

  // Stats queries — same filters but explicit status, limit=1 each
  const { data: totalStats } = useBookingsList({ ...sharedParams, limit: 1 });
  const { data: activeStats } = useBookingsList({ ...sharedParams, status: 'ACTIVE', limit: 1 });
  const { data: upcomingStats } = useBookingsList({ ...sharedParams, status: 'UPCOMING', limit: 1 });
  const { data: checkedOutStats } = useBookingsList({ ...sharedParams, status: 'CHECKED_OUT', limit: 1 });

  function applyFilters() {
    setAppliedSearch(search);
    setAppliedStatus(statusFilter);
    setAppliedBuildingId(buildingIdFilter ? parseInt(buildingIdFilter) : undefined);
    setAppliedFrom(fromFilter);
    setAppliedTo(toFilter);
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setBuildingIdFilter('');
    setFromFilter('');
    setToFilter('');
    setAppliedSearch('');
    setAppliedStatus('');
    setAppliedBuildingId(undefined);
    setAppliedFrom('');
    setAppliedTo('');
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Bookings</h1>
          <p className="text-sm text-on-surface-variant mt-1">All bookings across your properties</p>
        </div>
        {canCreateBooking && (
          <button
            onClick={() => setNewBookingOpen(true)}
            className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Booking
          </button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: totalStats?.total ?? '—', icon: 'calendar_month', color: 'text-primary' },
          { label: 'Active', value: activeStats?.total ?? '—', icon: 'home', color: 'text-green-600' },
          { label: 'Upcoming', value: upcomingStats?.total ?? '—', icon: 'schedule', color: 'text-blue-600' },
          { label: 'Checked Out', value: checkedOutStats?.total ?? '—', icon: 'logout', color: 'text-on-surface-variant' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4 border border-outline-variant">
            <span className={`material-symbols-outlined text-3xl ${color}`}>{icon}</span>
            <div>
              <p className="text-2xl font-bold text-on-surface">{value}</p>
              <p className="text-xs text-on-surface-variant">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search tenant or apartment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            className="col-span-1 sm:col-span-2 lg:col-span-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="CHECKED_OUT">Checked Out</option>
          </select>

          {/* Building */}
          <select
            value={buildingIdFilter}
            onChange={(e) => setBuildingIdFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Buildings</option>
            {buildings?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* From date */}
          <input
            type="date"
            value={fromFilter}
            onChange={(e) => setFromFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {/* To date */}
          <input
            type="date"
            value={toFilter}
            onChange={(e) => setToFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {/* Apply + Clear */}
          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={clearFilters}
              className="px-3 py-2 border border-outline-variant text-on-surface-variant rounded-lg text-sm hover:bg-surface-container transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <TableContainer
        isLoading={isLoading}
        isEmpty={!isLoading && (data?.data.length ?? 0) === 0}
        emptyMessage="No bookings found."
      >
        <Table
          footer={
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={data?.total ?? 0}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              variant="prev-next"
            />
          }
        >
          <TableHead headers={['Tenant', 'Apartment', 'Building', 'Check-in', 'Check-out', 'Total', 'Deposit', 'Status']} />
          <TableBody>
            {data?.data.map((booking) => {
              const status = deriveStatus(booking);
              const statusBadge = STATUS_BADGE[status];
              const depositBadge = DEPOSIT_BADGE[booking.depositStatus];
              return (
                <TableRow key={booking.id} onClick={() => setSelectedBookingId(booking.id)}>
                  <TableCell variant="strong">{booking.tenant.fullName}</TableCell>
                  <TableCell variant="text">{booking.apartment.number}</TableCell>
                  <TableCell variant="muted">{booking.apartment.building.name}</TableCell>
                  <TableCell variant="muted">{formatDate(booking.checkIn)}</TableCell>
                  <TableCell variant="muted">{formatDate(booking.checkOut)}</TableCell>
                  <TableCell align="right" className="font-mono text-on-surface">{formatAed(booking.totalAmount)}</TableCell>
                  <TableCell>
                    <Badge className={depositBadge.classes}>{depositBadge.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusBadge.classes}>{statusBadge.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Invoice modal */}
      {selectedBookingId !== null && (
        <BookingInvoiceModal
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
        />
      )}

      {/* New booking modal */}
      <BookingFormModal
        open={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
      />
    </div>
  );
}
