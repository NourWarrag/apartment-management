import type { TicketItem } from '../../hooks/useTickets';
import TicketCard from './TicketCard';
import TicketDetailPanel from './TicketDetailPanel';

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

interface TicketsKanbanViewProps {
  openTickets: TicketItem[];
  inProgressTickets: TicketItem[];
  completedTickets: TicketItem[];
  activeTicket: TicketItem | null;
  onTicketClick: (ticket: TicketItem) => void;
  onCloseDetail: () => void;
  canEditAll: boolean;
}

export default function TicketsKanbanView({
  openTickets,
  inProgressTickets,
  completedTickets,
  activeTicket,
  onTicketClick,
  onCloseDetail,
  canEditAll,
}: TicketsKanbanViewProps) {
  return (
    <div className={`grid gap-4 flex-1 min-h-0 ${activeTicket ? 'grid-cols-4' : 'grid-cols-3'}`}>
      <KanbanColumn
        label="Open"
        dotColor="bg-error"
        tickets={openTickets}
        activeTicketId={activeTicket?.id ?? null}
        onTicketClick={onTicketClick}
      />
      <KanbanColumn
        label="In Progress"
        dotColor="bg-secondary"
        tickets={inProgressTickets}
        activeTicketId={activeTicket?.id ?? null}
        onTicketClick={onTicketClick}
      />
      <KanbanColumn
        label="Completed"
        dotColor="bg-on-tertiary-container"
        tickets={completedTickets}
        activeTicketId={activeTicket?.id ?? null}
        onTicketClick={onTicketClick}
      />
      {activeTicket && (
        <TicketDetailPanel
          key={activeTicket.id}
          ticket={activeTicket}
          onClose={onCloseDetail}
          canEditAll={canEditAll}
        />
      )}
    </div>
  );
}
