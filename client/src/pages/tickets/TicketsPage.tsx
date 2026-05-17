import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTickets, useTicketStats } from '../../hooks/useTickets';
import type { TicketItem } from '../../hooks/useTickets';
import { Role } from '@hotel/shared';
import TicketDetailPanel from './TicketDetailPanel';
import NewTicketModal from './NewTicketModal';
import TicketsKanbanView from './TicketsKanbanView';
import TicketsListView from './TicketsListView';

type ViewMode = 'kanban' | 'list';

export default function TicketsPage() {
  const { data: user } = useAuth();
  const canCreate = user?.role === Role.ADMIN || user?.role === Role.RECEPTIONIST;
  const canEditAll = canCreate;

  const [view, setView] = useState<ViewMode>('kanban');
  const [activeTicket, setActiveTicket] = useState<TicketItem | null>(null);
  const [listDetailTicket, setListDetailTicket] = useState<TicketItem | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'MAINTENANCE' | 'CLEANING' | ''>('');

  const { data, isLoading, isError } = useTickets({ type: typeFilter || undefined });
  const { data: statsData } = useTicketStats();

  const tickets = data?.data ?? [];
  const openTickets = tickets.filter(t => t.status === 'OPEN');
  const inProgressTickets = tickets.filter(t => t.status === 'IN_PROGRESS');
  const completedTickets = tickets.filter(t => t.status === 'COMPLETED');

  // Keep active ticket fresh from latest query data
  const activeTicketFresh = activeTicket
    ? (tickets.find(t => t.id === activeTicket.id) ?? activeTicket)
    : null;

  function handleKanbanTicketClick(ticket: TicketItem) {
    setActiveTicket(prev => (prev?.id === ticket.id ? null : ticket));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
      </div>
    );
  }

  if (isError) {
    return <div className="p-6 text-error text-sm">Failed to load tickets. Please refresh.</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Maintenance Tickets</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Track and manage maintenance requests</p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate && (
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Ticket
            </button>
          )}
          <div className="flex rounded-xl border border-outline-variant overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              title="Kanban view"
              className={`p-2.5 transition-colors ${view === 'kanban' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}
            >
              <span className="material-symbols-outlined text-[18px]">view_kanban</span>
            </button>
            <button
              onClick={() => setView('list')}
              title="List view"
              className={`p-2.5 transition-colors ${view === 'list' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}
            >
              <span className="material-symbols-outlined text-[18px]">list</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex gap-1 bg-surface-container rounded-lg p-0.5">
          {([['', 'All'], ['MAINTENANCE', 'Maintenance'], ['CLEANING', 'Cleaning']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val as typeof typeFilter)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                typeFilter === val
                  ? 'bg-surface text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'kanban' && (
        <TicketsKanbanView
          openTickets={openTickets}
          inProgressTickets={inProgressTickets}
          completedTickets={completedTickets}
          activeTicket={activeTicketFresh}
          onTicketClick={handleKanbanTicketClick}
          onCloseDetail={() => setActiveTicket(null)}
          canEditAll={canEditAll}
        />
      )}

      {view === 'list' && (
        <TicketsListView tickets={tickets} onRowClick={setListDetailTicket} />
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 flex-shrink-0">
        <div className="bg-surface-container rounded-2xl border border-outline-variant p-4">
          <p className="text-xs font-bold text-on-surface-variant mb-1">Open Tickets</p>
          <p className="text-2xl font-bold text-error">{statsData?.open ?? '—'}</p>
        </div>
        <div className="bg-surface-container rounded-2xl border border-outline-variant p-4">
          <p className="text-xs font-bold text-on-surface-variant mb-1">In Progress</p>
          <p className="text-2xl font-bold text-secondary">{statsData?.inProgress ?? '—'}</p>
        </div>
        <div className="bg-surface-container rounded-2xl border border-outline-variant p-4">
          <p className="text-xs font-bold text-on-surface-variant mb-1">Resolved (24h)</p>
          <p className="text-2xl font-bold text-on-tertiary-container">{statsData?.resolved24h ?? '—'}</p>
        </div>
        <div className="bg-surface-container rounded-2xl border border-outline-variant p-4">
          <p className="text-xs font-bold text-on-surface-variant mb-1">Avg Resolution Time</p>
          <p className="text-2xl font-bold text-on-surface">
            {statsData?.avgResolutionHours != null ? `${statsData.avgResolutionHours} hrs` : '—'}
          </p>
        </div>
      </div>

      {/* List-view detail modal */}
      {listDetailTicket && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <TicketDetailPanel
              key={listDetailTicket.id}
              ticket={listDetailTicket}
              onClose={() => setListDetailTicket(null)}
              canEditAll={canEditAll}
            />
          </div>
        </div>
      )}

      {canCreate && <NewTicketModal open={showNewModal} onClose={() => setShowNewModal(false)} />}
    </div>
  );
}
