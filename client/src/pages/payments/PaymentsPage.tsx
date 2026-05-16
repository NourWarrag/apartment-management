import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePayments, useMarkPaid, usePaymentStats } from '../../hooks/usePayments';
import type { PaymentListItem } from '../../hooks/usePayments';
import InstallmentTracker from './InstallmentTracker';
import StatWidget from '../dashboard/StatWidget';
import { Role } from '@hotel/shared';
import PaymentFormModal from './PaymentFormModal';
import ReceiptModal from './ReceiptModal';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';
import TablePagination from '../../components/ui/TablePagination';
import Badge from '../../components/ui/Badge';
import IconButton from '../../components/ui/IconButton';

const PAGE_SIZE = 20;

const STATUS_COLORS: Record<PaymentListItem['status'], string> = {
  PAID: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  FAILED: 'bg-red-100 text-red-800',
};

function formatAed(amount: string): string {
  return `AED ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PaymentsPage() {
  const { data: user } = useAuth();
  const canWrite = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedMethod, setAppliedMethod] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<PaymentListItem | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);

  const { data, isLoading, isError } = usePayments({
    status: appliedStatus || undefined,
    method: appliedMethod || undefined,
    search: appliedSearch || undefined,
    page,
  });

  const markPaid = useMarkPaid();
  const { data: statsData, isLoading: statsLoading } = usePaymentStats();

  const applyFilters = () => {
    setAppliedSearch(search);
    setAppliedMethod(methodFilter);
    setAppliedStatus(statusFilter);
    setPage(1);
  };

  const handleMarkPaid = async (id: number) => {
    setMarkingPaidId(id);
    setMarkPaidError(null);
    try {
      await markPaid.mutateAsync(id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMarkPaidError(msg ?? 'Failed to mark payment as paid. Please try again.');
    } finally {
      setMarkingPaidId(null);
    }
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const payments = data?.data ?? [];

  return (
    <div className="space-y-widget-gap">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-widget-gap">
        <div>
          <h2 className="text-display-lg text-primary">Payment Management</h2>
          <p className="text-on-surface-variant text-body-base mt-1">Track and record all payment transactions.</p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded font-bold text-body-sm hover:opacity-90 transition-opacity self-start md:self-auto"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Record Payment
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-widget-gap">
        <StatWidget
          icon="payments"
          label="Monthly Revenue"
          value={statsData ? `AED ${statsData.monthlyRevenue.toLocaleString('en-US')}` : '—'}
          loading={statsLoading}
        />
        <StatWidget
          icon="pending_actions"
          label="Outstanding Balance"
          value={statsData ? `AED ${statsData.outstandingBalance.toLocaleString('en-US')}` : '—'}
          loading={statsLoading}
        />
        <StatWidget
          icon="schedule"
          label="Active Plans"
          value={statsData?.activePlans ?? '—'}
          loading={statsLoading}
        />
        <StatWidget
          icon="percent"
          label="Collection Rate"
          value={statsData ? `${statsData.collectionRate.toFixed(1)}%` : '—'}
          loading={statsLoading}
        />
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-outline-variant p-4 rounded-xl flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">METHOD</label>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="INSTALLMENT">Installment</option>
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">STATUS</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="Search tenant or apt..."
            className="bg-surface-container-low border-none rounded py-2 px-3 text-body-base focus:ring-2 focus:ring-primary/20 outline-none w-48"
          />
          <button
            onClick={applyFilters}
            className="bg-primary text-on-primary h-[40px] px-6 rounded font-bold text-body-sm hover:opacity-90 transition-opacity"
          >
            Apply
          </button>
        </div>
      </div>

      {markPaidError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {markPaidError}
        </div>
      )}

      {/* Table */}
      <TableContainer
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && payments.length === 0}
        emptyMessage="No payments found."
        errorMessage="Failed to load payments. Please refresh."
      >
        <Table
          footer={
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              variant="numeric"
              itemLabel="payments"
              className="bg-surface-container-low"
            />
          }
        >
          <TableHead headers={['Date', 'Apt.', 'Tenant', 'Method', 'Amount', 'Status', 'Actions']} />
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell variant="muted">{formatDate(p.paidAt ?? p.createdAt)}</TableCell>
                <TableCell variant="strong">
                  <span className="flex items-center flex-wrap gap-0.5">
                    {p.booking.apartment.number}
                    {p.booking.apartment.deletedAt && (
                      <Badge variant="tag" className="ml-1 bg-red-100 text-red-700">Deleted</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell variant="text">
                  <span className="flex items-center flex-wrap gap-0.5">
                    {p.booking.tenant.fullName}
                    {p.booking.tenant.deletedAt && (
                      <Badge variant="tag" className="ml-1 bg-red-100 text-red-700">Deleted</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell variant="muted">
                  {p.method.charAt(0) + p.method.slice(1).toLowerCase()}
                </TableCell>
                <TableCell variant="strong">{formatAed(p.amount)}</TableCell>
                <TableCell>
                  <Badge className={STATUS_COLORS[p.status]}>
                    {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell align="right">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton icon="receipt" title="View receipt" onClick={() => setReceiptTarget(p)} />
                    {canWrite && p.status === 'PENDING' && (
                      <IconButton
                        icon="check_circle"
                        tone="success"
                        title="Mark as paid"
                        onClick={() => handleMarkPaid(p.id)}
                        disabled={markingPaidId === p.id}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <InstallmentTracker />

      {showForm && (
        <PaymentFormModal open={showForm} onClose={() => setShowForm(false)} />
      )}
      {receiptTarget && (
        <ReceiptModal payment={receiptTarget} onClose={() => setReceiptTarget(null)} />
      )}
    </div>
  );
}
