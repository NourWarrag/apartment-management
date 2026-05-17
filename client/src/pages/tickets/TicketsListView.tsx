import type { TicketItem } from '../../hooks/useTickets';
import TableScroller from '../../components/ui/TableScroller';
import { TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';

function ticketNumber(id: number): string {
  return `MNT-${String(id).padStart(4, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PRIORITY_BADGE: Record<TicketItem['priority'], string> = {
  HIGH: 'bg-primary text-on-primary',
  MEDIUM: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  LOW: 'bg-surface-container-high text-on-surface-variant',
};

const STATUS_BADGE: Record<TicketItem['status'], string> = {
  OPEN: 'bg-error-container text-on-error-container',
  IN_PROGRESS: 'bg-secondary-container text-on-secondary-container',
  COMPLETED: 'bg-tertiary-container text-on-tertiary-container',
};

const STATUS_LABEL: Record<TicketItem['status'], string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

interface TicketsListViewProps {
  tickets: TicketItem[];
  onRowClick: (ticket: TicketItem) => void;
}

export default function TicketsListView({ tickets, onRowClick }: TicketsListViewProps) {
  return (
    <TableScroller minWidth={900}>
      <div className="bg-white border border-outline-variant rounded-xl overflow-auto shadow-sm flex-1">
        <table className="w-full text-left border-collapse">
        <TableHead headers={['Ticket #', 'Apartment', 'Description', 'Priority', 'Status', 'Assigned To', 'Created']} />
        <TableBody>
          {tickets.map(t => (
            <TableRow key={t.id} onClick={() => onRowClick(t)}>
              <TableCell className="font-mono text-xs text-on-surface-variant">
                <span className="flex items-center gap-1">
                  {ticketNumber(t.id)}
                  {t.type === 'CLEANING' && (
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant" title="Cleaning">cleaning_services</span>
                  )}
                </span>
              </TableCell>
              <TableCell variant="strong">
                <span className="flex items-center flex-wrap gap-0.5">
                  Apt. {t.apartment.number}
                  {t.apartment.deletedAt && (
                    <Badge variant="tag" className="ml-1 bg-red-100 text-red-700">Deleted</Badge>
                  )}
                </span>
              </TableCell>
              <TableCell variant="text">
                {t.description.length > 60 ? t.description.slice(0, 60) + '…' : t.description}
              </TableCell>
              <TableCell>
                <Badge className={`text-[10px] font-bold ${PRIORITY_BADGE[t.priority]}`}>
                  {t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={`text-[10px] font-bold ${STATUS_BADGE[t.status]}`}>
                  {STATUS_LABEL[t.status]}
                </Badge>
              </TableCell>
              <TableCell variant="muted">{t.assignedTo?.name ?? '—'}</TableCell>
              <TableCell variant="muted" className="whitespace-nowrap">{formatDate(t.createdAt)}</TableCell>
            </TableRow>
          ))}
          {tickets.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} variant="muted" align="center" className="py-12">No tickets found</TableCell>
            </TableRow>
          )}
        </TableBody>
      </table>
      </div>
    </TableScroller>
  );
}
