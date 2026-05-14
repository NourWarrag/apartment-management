import { useInstallmentPlans } from '../../hooks/usePayments';
import type { InstallmentPlan } from '../../hooks/usePayments';

function formatAed(amount: string): string {
  return `AED ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

function PlanCard({ plan }: { plan: InstallmentPlan }) {
  const paidNum = Number(plan.paidAmount);
  const totalNum = Number(plan.totalAmount);
  const percent = totalNum > 0 ? Math.min(100, (paidNum / totalNum) * 100) : 0;

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-on-surface text-body-base">{plan.tenantName}</span>
        <span className="bg-on-surface text-surface text-xs font-bold px-2 py-0.5 rounded-full">
          Apt {plan.apartmentNumber}
        </span>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        {formatDate(plan.checkIn)} – {formatDate(plan.checkOut)}
      </p>
      <div className="w-full bg-surface-container-high rounded-full h-2">
        <div
          className="bg-primary rounded-full h-2 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-body-sm text-on-surface-variant">
        {formatAed(plan.paidAmount)} paid of {formatAed(plan.totalAmount)}
      </p>
    </div>
  );
}

export default function InstallmentTracker() {
  const { data: plans, isLoading } = useInstallmentPlans();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">
          Installment Plans
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-container-low border border-outline-variant rounded-xl p-4 animate-pulse h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-label-caps font-bold text-on-surface-variant uppercase tracking-wider">
          Installment Plans
        </h3>
        {plans && plans.length > 0 && (
          <span className="bg-primary text-on-primary text-xs font-bold px-2 py-0.5 rounded-full">
            {plans.length}
          </span>
        )}
      </div>
      {!plans || plans.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">No active installment plans.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.bookingId} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
