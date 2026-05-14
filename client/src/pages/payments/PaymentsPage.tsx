import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePayments, useMarkPaid, usePaymentStats } from '../../hooks/usePayments';
import type { PaymentListItem } from '../../hooks/usePayments';
import InstallmentTracker from './InstallmentTracker';
import StatWidget from '../dashboard/StatWidget';
import { Role } from '@hotel/shared';
import PaymentFormModal from './PaymentFormModal';
import ReceiptModal from './ReceiptModal';

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: PaymentListItem['status'] }) {
  const colorMap: Record<PaymentListItem['status'], string> = {
    PAID: 'bg-green-100 text-green-800',
    PENDING: 'bg-amber-100 text-amber-800',
    FAILED: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${colorMap[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

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

  const thCls = 'px-4 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-wider';

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
      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-on-surface-variant text-body-sm">Loading…</div>
          ) : isError ? (
            <div className="p-8 text-center text-red-600 text-body-sm">Failed to load payments. Please refresh.</div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant text-body-sm">No payments found.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className={thCls}>DATE</th>
                  <th className={thCls}>APT.</th>
                  <th className={thCls}>TENANT</th>
                  <th className={thCls}>METHOD</th>
                  <th className={thCls}>AMOUNT</th>
                  <th className={thCls}>STATUS</th>
                  <th className={thCls + ' text-right'}>ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-sm text-on-surface-variant">
                      {formatDate(p.paidAt ?? p.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-on-surface">
                      {p.booking.apartment.number}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface">
                      {p.booking.tenant.fullName}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">
                      {p.method.charAt(0) + p.method.slice(1).toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-on-surface">
                      {formatAed(p.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setReceiptTarget(p)}
                          className="p-1 hover:bg-surface-container rounded-full"
                          title="View receipt"
                        >
                          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">receipt</span>
                        </button>
                        {canWrite && p.status === 'PENDING' && (
                          <button
                            onClick={() => handleMarkPaid(p.id)}
                            disabled={markingPaidId === p.id}
                            className="p-1 hover:bg-surface-container rounded-full disabled:opacity-50"
                            title="Mark as paid"
                          >
                            <span className="material-symbols-outlined text-[20px] text-green-600">check_circle</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="bg-surface-container-low px-4 py-3 border-t border-outline-variant flex items-center justify-between">
            <p className="text-on-surface-variant text-body-sm">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} payments
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
                      className={`w-8 h-8 flex items-center justify-center rounded text-sm font-bold transition-colors ${
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
