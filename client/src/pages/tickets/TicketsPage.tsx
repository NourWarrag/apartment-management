import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTickets, useTicketStats } from '../../hooks/useTickets';
import type { TicketItem } from '../../hooks/useTickets';
import { Role } from '@hotel/shared';
import TicketCard from './TicketCard';
import TicketDetailPanel from './TicketDetailPanel';
import NewTicketModal from './NewTicketModal';

function ticketNumber(id: number): string {
  return `MNT-${String(id).padStart(4, '0')}`;
}

const PRIORITY_BADGE: Record<TicketItem['priority'], string> = {
  HIGH: 'bg-primary text-on-primary',
  MEDIUM: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  LOW: 'bg-surface-container-high text-on-surface-variant',
};

const STATUS_BADGE: Record<TicketItem['status'], string> = {
  OPEN: 'bg-error/10 text-error',
  IN_PROGRESS: 'bg-secondary/10 text-secondary',
  COMPLETED: 'bg-on-tertiary-container/10 text-on-tertiary-container',
};

const STATUS_LABEL: Record<TicketItem['status'], string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface KanbanColumnProps {
  label: string;
  dotColor: string;
  tickets: TicketItem[];
  activeTicketId: number | null;
  onTicketClick: (ticket: TicketItem) => void;
}

function KanbanColumn({ label, dotColor, tickets, activeTicketId, onTicketClick }: KanbanColumnProps) {
  return (
    <div className="bg-surface-container rounded-2xl p-3 flex flex-col gap-2 min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-1 mb-1 flex-shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <span className="text-sm font-bold text-on-surface">{label}</span>
        <span className="ml-auto text-xs font-bold text-on-surface-variant bg-surface-container-high rounded-full px-2 py-0.5">
          {tickets.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {tickets.map(t => (
          <TicketCard
            key={t.id}
            ticket={t}
            isActive={activeTicketId === t.id}
            onClick={() => onTicketClick(t)}
          />
        ))}
        {tickets.length === 0 && (
          <p className="text-xs text-on-surface-variant text-center py-6">No tickets</p>
        )}
      </div>
    </div>
  );
}

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
        {/* Type filter */}
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

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className={`grid gap-4 flex-1 min-h-0 ${activeTicketFresh ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <KanbanColumn
            label="Open"
            dotColor="bg-error"
            tickets={openTickets}
            activeTicketId={activeTicketFresh?.id ?? null}
            onTicketClick={handleKanbanTicketClick}
          />
          <KanbanColumn
            label="In Progress"
            dotColor="bg-secondary"
            tickets={inProgressTickets}
            activeTicketId={activeTicketFresh?.id ?? null}
            onTicketClick={handleKanbanTicketClick}
          />
          <KanbanColumn
            label="Completed"
            dotColor="bg-on-tertiary-container"
            tickets={completedTickets}
            activeTicketId={activeTicketFresh?.id ?? null}
            onTicketClick={handleKanbanTicketClick}
          />
          {activeTicketFresh && (
            <TicketDetailPanel
              key={activeTicketFresh.id}
              ticket={activeTicketFresh}
              onClose={() => setActiveTicket(null)}
              canEditAll={canEditAll}
            />
          )}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-high">
                {['Ticket #', 'Apartment', 'Description', 'Priority', 'Status', 'Assigned To', 'Created'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setListDetailTicket(t)}
                  className="border-b border-outline-variant hover:bg-surface-container cursor-pointer transition-colors last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      {ticketNumber(t.id)}
                      {t.type === 'CLEANING' && (
                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant" title="Cleaning">cleaning_services</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface font-bold">
                    <span className="flex items-center flex-wrap gap-0.5">
                      Apt. {t.apartment.number}
                      {t.apartment.deletedAt && (
                        <span className="ml-1 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          Deleted
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {t.description.length > 60 ? t.description.slice(0, 60) + '…' : t.description}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[t.priority]}`}>
                      {t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{t.assignedTo?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant text-sm">
                    No tickets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4 flex-shrink-0">
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
