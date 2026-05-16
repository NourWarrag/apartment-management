import { useState } from 'react';
import type { TicketItem } from '../../hooks/useTickets';
import { useUpdateTicket, useMaintenanceStaff } from '../../hooks/useTickets';
import AttachmentPanel from '../../components/AttachmentPanel';

const VALID_TRANSITIONS: Record<TicketItem['status'], TicketItem['status'][]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'OPEN'],
  COMPLETED: [],
};

const STATUS_LABEL: Record<TicketItem['status'], string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

const PRIORITY_BADGE: Record<TicketItem['priority'], string> = {
  HIGH: 'bg-primary text-on-primary',
  MEDIUM: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  LOW: 'bg-surface-container-high text-on-surface-variant',
};

function ticketNumber(id: number): string {
  return `MNT-${String(id).padStart(4, '0')}`;
}

interface TicketDetailPanelProps {
  ticket: TicketItem;
  onClose: () => void;
  canEditAll: boolean;
}

export default function TicketDetailPanel({ ticket, onClose, canEditAll }: TicketDetailPanelProps) {
  const [notes, setNotes] = useState(ticket.notes ?? '');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const updateTicket = useUpdateTicket();
  const { data: staff = [] } = useMaintenanceStaff({ enabled: canEditAll });

  const transitions = VALID_TRANSITIONS[ticket.status];

  function mutate(dto: Parameters<typeof updateTicket.mutate>[0]) {
    setApiError(null);
    updateTicket.mutate(dto, {
      onError: (err: any) => setApiError(err.response?.data?.message ?? 'Update failed'),
    });
  }

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant p-4 flex flex-col gap-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-on-surface">Ticket Details</h3>
        <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Status */}
      <div>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Status</p>
        {ticket.status === 'COMPLETED' ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tertiary-container text-on-tertiary-container text-sm font-bold">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            Completed
          </span>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface hover:bg-surface-container transition-colors"
            >
              {STATUS_LABEL[ticket.status]}
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
            {showStatusMenu && transitions.length > 0 && (
              <div className="absolute top-full mt-1 left-0 bg-surface border border-outline-variant rounded-lg shadow-md z-10 min-w-36">
                {transitions.map(s => (
                  <button
                    key={s}
                    onClick={() => { setShowStatusMenu(false); mutate({ id: ticket.id, status: s }); }}
                    className="block w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container transition-colors first:rounded-t-lg last:rounded-b-lg"
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ticket info */}
      <div className="bg-surface rounded-xl border border-outline-variant p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-on-surface-variant">{ticketNumber(ticket.id)}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[ticket.priority]}`}>
            {ticket.priority.charAt(0) + ticket.priority.slice(1).toLowerCase()}
          </span>
        </div>
        <p className="text-sm text-on-surface">{ticket.description}</p>
        <p className="text-xs text-on-surface-variant flex items-center flex-wrap gap-1">
          Apt. {ticket.apartment.number}
          {ticket.apartment.deletedAt && (
            <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
              Deleted
            </span>
          )}
          · Floor {ticket.apartment.floor}
        </p>
      </div>

      {/* Assigned Staff */}
      <div>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Assigned Staff</p>
        {canEditAll ? (
          <select
            value={ticket.assignedTo?.id ?? ''}
            onChange={e => mutate({ id: ticket.id, assignedToId: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
          >
            <option value="">Unassigned</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        ) : ticket.assignedTo ? (
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-secondary text-on-secondary text-xs font-bold flex items-center justify-center">
              {ticket.assignedTo.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </span>
            <span className="text-sm text-on-surface">{ticket.assignedTo.name}</span>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">Unassigned</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Resolution Notes</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Describe the steps taken to resolve the issue..."
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface resize-none placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      {apiError && <p className="text-xs text-error">{apiError}</p>}

      <AttachmentPanel entityType="TICKET" entityId={ticket.id} canEdit={canEditAll} />

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-auto">
        <button
          onClick={() => mutate({ id: ticket.id, notes })}
          disabled={updateTicket.isPending}
          className="w-full py-2.5 rounded-lg border border-outline-variant text-sm font-bold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
        >
          Save Draft
        </button>
        {ticket.status !== 'COMPLETED' && (
          <button
            onClick={() => mutate({ id: ticket.id, status: 'COMPLETED' })}
            disabled={updateTicket.isPending}
            className="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Mark Resolved
          </button>
        )}
      </div>
    </div>
  );
}
