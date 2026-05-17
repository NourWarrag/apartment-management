import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import type { PaymentListItem } from '../../hooks/usePayments';

interface ReceiptModalProps {
  payment: PaymentListItem;
  onClose: () => void;
}

function formatAed(amount: string): string {
  return `AED ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

function receiptNumber(id: number): string {
  return `#PAY-${String(id).padStart(6, '0')}`;
}

const METHOD_LABEL: Record<PaymentListItem['method'], string> = {
  CASH: 'Cash',
  CARD: 'Card',
  INSTALLMENT: 'Installment',
};

const STATUS_LABEL: Record<PaymentListItem['status'], string> = {
  PAID: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
  REVERSED: 'Reversed',
};

export default function ReceiptModal({ payment, onClose }: ReceiptModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: `Receipt-PAY-${payment.id.toString().padStart(6, '0')}`,
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:hidden">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[90vw] lg:max-w-sm border border-outline-variant overflow-hidden">
        {/* Receipt content — this section prints */}
        <div id="receipt-content" ref={contentRef} className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-primary">LuxStay</h2>
            <p className="text-xs text-on-surface-variant">Payment Receipt</p>
          </div>

          <div className="border-t border-b border-outline-variant py-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Receipt No.</span>
              <span className="font-bold text-on-surface">{receiptNumber(payment.id)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Date</span>
              <span className="text-on-surface">{formatDate(payment.paidAt ?? payment.createdAt)}</span>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Apartment</span>
              <span className="text-on-surface font-bold">{payment.booking.apartment.number} — Floor {payment.booking.apartment.floor}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Tenant</span>
              <span className="text-on-surface">{payment.booking.tenant.fullName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Phone</span>
              <span className="text-on-surface">{payment.booking.tenant.phone}</span>
            </div>
          </div>

          <div className="space-y-2 mb-4 border-t border-outline-variant pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Method</span>
              <span className="text-on-surface">{METHOD_LABEL[payment.method]}</span>
            </div>
            {payment.referenceNumber && (
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Reference</span>
                <span className="text-on-surface font-mono">{payment.referenceNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Status</span>
              <span className="font-bold text-on-surface">{STATUS_LABEL[payment.status]}</span>
            </div>
          </div>

          <div className="bg-surface-container rounded-lg p-4 flex justify-between items-center">
            <span className="text-xs font-bold text-on-surface-variant">TOTAL AMOUNT</span>
            <span className="text-xl font-bold text-primary">{formatAed(payment.amount)}</span>
          </div>
        </div>

        {/* Actions — hidden during print */}
        <div className="print:hidden flex gap-3 px-6 pb-6">
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
      </div>
    </div>
  );
}
