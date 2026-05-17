import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import TableScroller from './ui/TableScroller';
import { useBooking } from '../hooks/useBookings';

interface BookingInvoiceModalProps {
  bookingId: number;
  onClose: () => void;
}

function formatAed(amount: string): string {
  return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BookingInvoiceModal({ bookingId, onClose }: BookingInvoiceModalProps) {
  const { data: booking, isLoading } = useBooking(bookingId);
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: booking ? `Invoice-${bookingId}-${booking.tenant.fullName}` : `Invoice-${bookingId}`,
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-outline-variant overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center p-16">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
          </div>
        )}

        {!isLoading && booking && (
          <>
            {/* Invoice content — this section prints */}
            <div ref={contentRef} className="p-8">
              {/* Header row */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-xl font-bold text-primary">{booking.apartment.building.name}</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">Hotel Apartment Management</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-on-surface tracking-wide">INVOICE</p>
                  <p className="text-sm font-mono text-on-surface-variant">#INV-{bookingId}</p>
                </div>
              </div>

              {/* Tenant + Apartment info */}
              <div className="grid grid-cols-2 gap-6 mb-6 pb-6 border-b border-outline-variant">
                <div>
                  <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Tenant</p>
                  <p className="text-sm font-bold text-on-surface">{booking.tenant.fullName}</p>
                  <p className="text-sm text-on-surface-variant">{booking.tenant.phone}</p>
                  <p className="text-sm text-on-surface-variant">ID: {booking.tenant.idNumber}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Apartment</p>
                  <p className="text-sm font-bold text-on-surface">Unit {booking.apartment.number}</p>
                  <p className="text-sm text-on-surface-variant">Floor {booking.apartment.floor} · {booking.apartment.type}</p>
                  <p className="text-sm text-on-surface-variant">{booking.apartment.building.name}</p>
                </div>
              </div>

              {/* Dates + Amounts */}
              <div className="grid grid-cols-2 gap-6 mb-6 pb-6 border-b border-outline-variant">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Check-in</span>
                    <span className="text-on-surface font-medium">{formatDate(booking.checkIn)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Check-out</span>
                    <span className="text-on-surface font-medium">{formatDate(booking.checkOut)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Total Booking Amount</span>
                    <span className="text-on-surface font-bold">AED {formatAed(booking.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Deposit</span>
                    <span className="text-on-surface">
                      {booking.depositStatus === 'NONE' && 'No deposit collected'}
                      {booking.depositStatus === 'HELD' && booking.depositAmount && `AED ${formatAed(booking.depositAmount)} (Held)`}
                      {booking.depositStatus === 'RELEASED' && booking.depositAmount && `AED ${formatAed(booking.depositAmount)} (Released)`}
                      {booking.depositStatus === 'FORFEITED' && booking.depositAmount && `AED ${formatAed(booking.depositAmount)} (Forfeited)`}
                    </span>
                  </div>
                  {booking.depositStatus === 'RELEASED' && booking.depositRefundAmount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Refund</span>
                      <span className="text-on-surface">AED {formatAed(booking.depositRefundAmount)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Breakdown Table */}
              <div className="mb-6">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">Payment Breakdown</p>
                <TableScroller minWidth={720}>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant">
                        <th className="text-left py-2 pr-3 font-bold text-on-surface-variant text-xs">Date</th>
                        <th className="text-left py-2 pr-3 font-bold text-on-surface-variant text-xs">Method</th>
                        <th className="text-left py-2 pr-3 font-bold text-on-surface-variant text-xs">Reference</th>
                        <th className="text-right py-2 pr-3 font-bold text-on-surface-variant text-xs">Amount (AED)</th>
                        <th className="text-right py-2 font-bold text-on-surface-variant text-xs">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {booking.payments.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-on-surface-variant text-sm">
                            No payments recorded yet.
                          </td>
                        </tr>
                      ) : (
                        booking.payments.map((payment) => (
                          <tr key={payment.id} className="border-b border-outline-variant/50">
                            <td className="py-2 pr-3 text-on-surface">{formatDate(payment.paidAt)}</td>
                            <td className="py-2 pr-3 text-on-surface">{payment.method}</td>
                            <td className="py-2 pr-3 font-mono text-on-surface-variant">{payment.referenceNumber ?? '—'}</td>
                            <td className="py-2 pr-3 text-right text-on-surface">{formatAed(payment.amount)}</td>
                            <td className="py-2 text-right text-on-surface">{payment.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </TableScroller>

                {/* Footer totals */}
                {booking.payments.length > 0 && (() => {
                  const amountPaid = booking.payments
                    .filter((p) => p.status === 'PAID')
                    .reduce((sum, p) => sum + Number(p.amount), 0);
                  const outstanding = Number(booking.totalAmount) - amountPaid;
                  return (
                    <div className="mt-3 space-y-1 border-t border-outline-variant pt-3">
                      <div className="flex justify-end gap-8 text-sm">
                        <span className="text-on-surface-variant">Amount Paid:</span>
                        <span className="font-bold text-on-surface w-28 text-right">
                          AED {amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-end gap-8 text-sm">
                        <span className="text-on-surface-variant">Outstanding Balance:</span>
                        <span className="font-bold text-on-surface w-28 text-right">
                          AED {outstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Actions — hidden during print */}
            <div className="print:hidden flex gap-3 px-8 pb-6">
              <button
                onClick={() => handlePrint()}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-primary py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                Download PDF
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-outline-variant font-bold text-sm hover:bg-surface-container transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
