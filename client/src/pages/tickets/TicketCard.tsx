import type { TicketItem } from '../../hooks/useTickets';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ticketNumber(id: number): string {
  return `MNT-${String(id).padStart(4, '0')}`;
}

const PRIORITY_BADGE: Record<TicketItem['priority'], string> = {
  HIGH: 'bg-primary text-on-primary',
  MEDIUM: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  LOW: 'bg-surface-container-high text-on-surface-variant',
};

interface TicketCardProps {
  ticket: TicketItem;
  isActive: boolean;
  onClick: () => void;
}

export default function TicketCard({ ticket, isActive, onClick }: TicketCardProps) {
  const initials = ticket.assignedTo
    ? ticket.assignedTo.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl bg-surface-container-low transition-all ${
        isActive
          ? 'border-2 border-primary ring-4 ring-primary/5'
          : 'border border-outline-variant hover:bg-surface-container'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-on-surface-variant font-mono">{ticketNumber(ticket.id)}</span>
          {ticket.type === 'CLEANING' && (
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant" title="Cleaning">cleaning_services</span>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[ticket.priority]}`}>
          {ticket.priority.charAt(0) + ticket.priority.slice(1).toLowerCase()}
        </span>
      </div>
      <p className="text-sm font-bold text-on-surface mb-1">
        {ticket.description.length > 60 ? ticket.description.slice(0, 60) + '…' : ticket.description}
      </p>
      <p className="text-xs text-on-surface-variant mb-2">Apt. {ticket.apartment.number}</p>
      <div className="flex items-center justify-between">
        {initials ? (
          <span className="w-6 h-6 rounded-full bg-secondary text-on-secondary text-[10px] font-bold flex items-center justify-center">
            {initials}
          </span>
        ) : (
          <span className="w-6 h-6 rounded-full border border-outline-variant" />
        )}
        <span className="text-[11px] text-on-surface-variant">{timeAgo(ticket.createdAt)}</span>
      </div>
    </button>
  );
}
