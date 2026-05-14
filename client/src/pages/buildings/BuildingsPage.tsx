import { useState } from 'react';
import { useBuildings, Building } from '../../hooks/useBuildings';
import { useDeleteBuilding } from '../../hooks/useBuildingsMutations';
import BuildingFormModal from './BuildingFormModal';

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

      {isLoading ? (
        <div className="text-on-surface-variant text-sm p-8 text-center">Loading…</div>
      ) : (
        <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                {['NAME', 'CODE', 'ADDRESS', 'ACTIONS'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {buildings.map(b => (
                <tr key={b.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 text-sm font-bold text-on-surface">{b.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold bg-secondary/10 text-secondary px-1.5 py-0.5 rounded uppercase tracking-wide">{b.code}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{b.address || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditing(b); setShowForm(true); }}
                        className="p-1 hover:bg-surface-container rounded-full" title="Edit">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">edit</span>
                      </button>
                      <button onClick={() => handleDelete(b.id)}
                        className="p-1 hover:bg-surface-container rounded-full" title="Delete">
                        <span className="material-symbols-outlined text-[20px] text-error">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && <BuildingFormModal building={editing} onClose={() => setShowForm(false)} />}
    </div>
  );
}
