import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';
import Badge from '../../components/ui/Badge';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useBrokers } from '../../hooks/useBrokers';
import BrokerFormModal from './BrokerFormModal';

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: 'Active', classes: 'bg-green-100 text-green-800' },
  INACTIVE: { label: 'Inactive', classes: 'bg-surface-container text-on-surface-variant' },
};

export default function BrokersPage() {
  const { data: user } = useAuth();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { data: brokers = [], isLoading } = useBrokers(search);

  const canCreate = user?.role === Role.SUPER_ADMIN || user?.role === Role.ADMIN || user?.role === Role.FINANCE;
  const totalActive = brokers.filter((b) => b.status === 'ACTIVE').length;
  const totalAgents = brokers.reduce((sum, b) => sum + (b._count?.agents ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Brokers</h1>
          <p className="text-sm text-on-surface-variant mt-1">Referral companies and their agents</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Broker
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4 border border-outline-variant">
          <span className="material-symbols-outlined text-3xl text-primary">apartment</span>
          <div>
            <p className="text-2xl font-bold text-on-surface">{brokers.length}</p>
            <p className="text-xs text-on-surface-variant">Total brokers</p>
          </div>
        </div>
        <div className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4 border border-outline-variant">
          <span className="material-symbols-outlined text-3xl text-green-600">check_circle</span>
          <div>
            <p className="text-2xl font-bold text-on-surface">{totalActive}</p>
            <p className="text-xs text-on-surface-variant">Active</p>
          </div>
        </div>
        <div className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-4 border border-outline-variant">
          <span className="material-symbols-outlined text-3xl text-blue-600">person</span>
          <div>
            <p className="text-2xl font-bold text-on-surface">{totalAgents}</p>
            <p className="text-xs text-on-surface-variant">Active agents</p>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant">
        <input
          type="text"
          placeholder="Search brokers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <TableContainer
        isLoading={isLoading}
        isEmpty={!isLoading && brokers.length === 0}
        emptyMessage="No brokers yet."
      >
        <Table>
          <TableHead headers={['Name', 'Phone', 'Default rate', 'Agents', 'Status']} />
          <TableBody>
            {brokers.map((b) => (
              <TableRow key={b.id}>
                <TableCell variant="strong">
                  <Link to={`/brokers/${b.id}`} className="text-primary hover:underline">{b.name}</Link>
                </TableCell>
                <TableCell variant="muted">{b.phone}</TableCell>
                <TableCell variant="text">
                  {b.commissionType === 'PERCENT'
                    ? `${Number(b.defaultCommissionValue)}%`
                    : `AED ${Number(b.defaultCommissionValue).toFixed(2)}`}
                </TableCell>
                <TableCell variant="text">{b._count?.agents ?? 0}</TableCell>
                <TableCell>
                  <Badge className={STATUS_BADGE[b.status].classes}>{STATUS_BADGE[b.status].label}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {createOpen && <BrokerFormModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
