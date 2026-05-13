import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardStats, useDashboardActivity } from '../../hooks/useDashboard';
import type { ActivityEvent } from '../../hooks/useDashboard';
import StatWidget from './StatWidget';

function formatAed(amount: number): string {
  return `AED ${amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

const EVENT_ICON: Record<ActivityEvent['type'], string> = {
  CHECK_IN: 'login',
  CHECK_OUT: 'logout',
  PAYMENT: 'payments',
  TICKET: 'build',
};

const EVENT_COLOR: Record<ActivityEvent['type'], string> = {
  CHECK_IN: 'text-blue-500',
  CHECK_OUT: 'text-amber-500',
  PAYMENT: 'text-green-500',
  TICKET: 'text-red-500',
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useDashboardStats();
  const { data: activityData, isLoading: activityLoading, isError: activityError } = useDashboardActivity();

  return (
    <div className="space-y-widget-gap">
      {/* Page Header */}
      <div>
        <h1 className="text-headline-md font-bold text-on-surface">{t('nav.dashboard', 'Dashboard')}</h1>
      </div>

      {/* Stat Widgets */}
      {statsError ? (
        <div className="text-error text-body-base">Failed to load stats. Please refresh.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-widget-gap">
          <StatWidget
            icon="apartment"
            label="Total Apartments"
            value={stats?.apartments.total ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/apartments')}
          />
          <StatWidget
            icon="meeting_room"
            label="Occupied"
            value={stats?.apartments.occupied ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/apartments?status=OCCUPIED')}
          />
          <StatWidget
            icon="check_circle"
            label="Available"
            value={stats?.apartments.available ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/apartments?status=AVAILABLE')}
          />
          <StatWidget
            icon="payments"
            label="Today's Revenue"
            value={stats ? formatAed(stats.revenue.total) : '—'}
            loading={statsLoading}
            subRows={stats ? [
              { label: 'Cash', value: formatAed(stats.revenue.cash) },
              { label: 'Card', value: formatAed(stats.revenue.card) },
              { label: 'Installment', value: formatAed(stats.revenue.installment) },
            ] : undefined}
            onClick={() => navigate('/payments')}
          />
          <StatWidget
            icon="schedule"
            label="Pending Installments"
            value={stats?.pendingInstallments ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/payments?status=PENDING&method=INSTALLMENT')}
          />
          <StatWidget
            icon="build"
            label="Open Tickets"
            value={stats?.openTickets ?? '—'}
            loading={statsLoading}
            onClick={() => navigate('/tickets?status=OPEN')}
          />
        </div>
      )}

      {/* Activity Feed */}
      <div className="bg-surface-container rounded-xl p-6">
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">Recent Activity</h2>

        {activityError && (
          <p className="text-error text-body-base">Failed to load activity.</p>
        )}

        {activityLoading && !activityError && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-5 h-5 rounded-full bg-on-surface/10 shrink-0" />
                <div className="flex-1 h-4 bg-on-surface/10 rounded" />
                <div className="w-16 h-3 bg-on-surface/10 rounded" />
              </div>
            ))}
          </div>
        )}

        {!activityLoading && !activityError && activityData?.events.length === 0 && (
          <p className="text-on-surface-variant text-body-base">No recent activity.</p>
        )}

        {!activityLoading && !activityError && activityData && activityData.events.length > 0 && (
          <ul className="space-y-3">
            {activityData.events.map((event, i) => (
              <li key={`${event.type}-${event.timestamp}-${i}`} className="flex items-start gap-3">
                <span className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${EVENT_COLOR[event.type]}`}>
                  {EVENT_ICON[event.type]}
                </span>
                <span className="flex-1 text-body-base text-on-surface">{event.label}</span>
                <span className="text-body-sm text-on-surface-variant whitespace-nowrap">{relativeTime(event.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
