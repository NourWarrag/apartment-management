import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useBroker, useDeleteBrokerAgent, BrokerAgent } from '../../hooks/useBrokers';
import { useBookingsList } from '../../hooks/useBookings';
import BrokerFormModal from './BrokerFormModal';
import BrokerAgentFormModal from './BrokerAgentFormModal';
import Badge from '../../components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';

type Tab = 'agents' | 'bookings' | 'payouts';

export default function BrokerDetailPage() {
  const { id } = useParams();
  const brokerId = Number(id);
  const { data: broker, isLoading } = useBroker(brokerId);
  const { data: user } = useAuth();
  const [tab, setTab] = useState<Tab>('agents');
  const [editOpen, setEditOpen] = useState(false);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<BrokerAgent | null>(null);
  const deleteAgent = useDeleteBrokerAgent();

  const canEdit = user?.role === Role.SUPER_ADMIN || user?.role === Role.ADMIN || user?.role === Role.FINANCE;

  const { data: bookingsRes } = useBookingsList({});

  if (isLoading) return <div className="p-6 text-on-surface-variant">Loading…</div>;
  if (!broker) return <div className="p-6 text-error">Broker not found.</div>;

  const brokerBookings = (bookingsRes?.data ?? []).filter((b: any) => b.brokerId === broker.id);

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
    }`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/brokers" className="text-sm text-primary hover:underline">← Brokers</Link>
          <h1 className="text-2xl font-bold text-on-surface mt-1">{broker.name}</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {broker.phone} {broker.email && `• ${broker.email}`}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditOpen(true)}
            className="px-4 py-2 border border-outline-variant text-on-surface rounded-lg text-sm font-medium hover:bg-surface-container transition-colors"
          >
            Edit broker
          </button>
        )}
      </div>

      <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-on-surface-variant">Status</p>
          <Badge className={broker.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-surface-container text-on-surface-variant'}>
            {broker.status}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant">Default commission</p>
          <p className="text-sm font-bold text-on-surface">
            {broker.commissionType === 'PERCENT'
              ? `${Number(broker.defaultCommissionValue)}%`
              : `AED ${Number(broker.defaultCommissionValue).toFixed(2)}`}
          </p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant">Agents</p>
          <p className="text-sm font-bold text-on-surface">{broker.agents.length}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant">Bookings</p>
          <p className="text-sm font-bold text-on-surface">{brokerBookings.length}</p>
        </div>
      </div>

      <div className="border-b border-outline-variant flex gap-2">
        <button className={tabCls('agents')} onClick={() => setTab('agents')}>Agents ({broker.agents.length})</button>
        <button className={tabCls('bookings')} onClick={() => setTab('bookings')}>Bookings ({brokerBookings.length})</button>
        <button className={tabCls('payouts')} onClick={() => setTab('payouts')}>Payouts</button>
      </div>

      {tab === 'agents' && (
        <div className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <button
                onClick={() => setNewAgentOpen(true)}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Add Agent
              </button>
            </div>
          )}
          <TableContainer isLoading={false} isEmpty={broker.agents.length === 0} emptyMessage="No agents yet.">
            <Table>
              <TableHead headers={['Name', 'Phone', 'Override', 'Status', '']} />
              <TableBody>
                {broker.agents.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell variant="strong">{a.fullName}</TableCell>
                    <TableCell variant="muted">{a.phone}</TableCell>
                    <TableCell variant="text">
                      {a.commissionType && a.commissionValueOverride
                        ? a.commissionType === 'PERCENT'
                          ? `${Number(a.commissionValueOverride)}%`
                          : `AED ${Number(a.commissionValueOverride).toFixed(2)}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={a.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-surface-container text-on-surface-variant'}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell align="right">
                      {canEdit && (
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditAgent(a)} className="text-xs text-primary hover:underline">Edit</button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete agent ${a.fullName}?`)) return;
                              try {
                                await deleteAgent.mutateAsync(a.id);
                                toast.success('Agent deleted');
                              } catch (err: unknown) {
                                toast.error('Failed to delete');
                              }
                            }}
                            className="text-xs text-error hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}

      {tab === 'bookings' && (
        <TableContainer isLoading={false} isEmpty={brokerBookings.length === 0} emptyMessage="No bookings referenced this broker yet.">
          <Table>
            <TableHead headers={['Tenant', 'Apartment', 'Total', 'Commission', 'Status']} />
            <TableBody>
              {brokerBookings.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell variant="strong">{b.tenant?.fullName ?? '—'}</TableCell>
                  <TableCell variant="text">{b.apartment?.number ?? '—'}</TableCell>
                  <TableCell variant="text">AED {Number(b.totalAmount).toFixed(2)}</TableCell>
                  <TableCell variant="text">
                    {b.commissionAmount !== null ? `AED ${Number(b.commissionAmount).toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-amber-100 text-amber-800">Owed</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 'payouts' && (
        <div className="bg-surface-container-low rounded-2xl p-8 border border-outline-variant text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant">payments</span>
          <p className="text-sm text-on-surface-variant mt-2">Payouts arrive in Phase 2 of the broker module.</p>
        </div>
      )}

      {editOpen && <BrokerFormModal broker={broker} onClose={() => setEditOpen(false)} />}
      {newAgentOpen && <BrokerAgentFormModal brokerId={broker.id} onClose={() => setNewAgentOpen(false)} />}
      {editAgent && <BrokerAgentFormModal brokerId={broker.id} agent={editAgent} onClose={() => setEditAgent(null)} />}
    </div>
  );
}
