import { useState } from 'react';
import { useBuildings, Building } from '../../hooks/useBuildings';
import { useDeleteBuilding } from '../../hooks/useBuildingsMutations';
import BuildingFormModal from './BuildingFormModal';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/ui/Table';
import TableContainer from '../../components/ui/TableContainer';
import Badge from '../../components/ui/Badge';
import IconButton from '../../components/ui/IconButton';

export default function BuildingsPage() {
  const { data: buildings = [], isLoading } = useBuildings();
  const deleteBuilding = useDeleteBuilding();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Building | undefined>();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(id: number) {
    setDeleteError(null);
    try {
      await deleteBuilding.mutateAsync(id);
    } catch (err: any) {
      setDeleteError(err.response?.data?.message ?? 'Failed to delete building');
    }
  }

  return (
    <div className="space-y-widget-gap">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-display-lg text-primary">Buildings</h2>
          <p className="text-on-surface-variant text-body-base mt-1">Manage your property buildings.</p>
        </div>
        <button onClick={() => { setEditing(undefined); setShowForm(true); }}
          className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded font-bold text-body-sm hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined text-[20px]">add</span>
          Add Building
        </button>
      </div>

      {deleteError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{deleteError}</div>
      )}

      <TableContainer isLoading={isLoading} isEmpty={buildings.length === 0} emptyMessage="No buildings yet">
        <Table>
          <TableHead headers={['Name', 'Code', 'Address', 'Actions']} />
          <TableBody>
            {buildings.map(b => (
              <TableRow key={b.id}>
                <TableCell variant="strong">{b.name}</TableCell>
                <TableCell>
                  <Badge variant="tag" tone="secondary">{b.code}</Badge>
                </TableCell>
                <TableCell variant="muted">{b.address || '—'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <IconButton icon="edit" title="Edit" onClick={() => { setEditing(b); setShowForm(true); }} />
                    <IconButton icon="delete" tone="error" title="Delete" onClick={() => handleDelete(b.id)} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {showForm && <BuildingFormModal building={editing} onClose={() => setShowForm(false)} />}
    </div>
  );
}
