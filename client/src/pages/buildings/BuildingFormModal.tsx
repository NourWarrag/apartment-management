import { useState } from 'react';
import { Building } from '../../hooks/useBuildings';
import { useCreateBuilding, useUpdateBuilding } from '../../hooks/useBuildingsMutations';

interface Props {
  building?: Building;
  onClose: () => void;
}

export default function BuildingFormModal({ building, onClose }: Props) {
  const [name, setName] = useState(building?.name ?? '');
  const [code, setCode] = useState(building?.code ?? '');
  const [address, setAddress] = useState(building?.address ?? '');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateBuilding();
  const update = useUpdateBuilding(building?.id ?? 0);
  const isEdit = !!building;
  const isPending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEdit) {
        await update.mutateAsync({ name, code, address });
      } else {
        await create.mutateAsync({ name, code, address });
      }
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Something went wrong');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl p-6 w-full max-w-[90vw] lg:max-w-md">
        <h2 className="text-lg font-bold text-on-surface mb-4">
          {isEdit ? 'Edit Building' : 'Add Building'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Code (short ID, e.g. "TA")</label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required maxLength={10}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-bold bg-primary text-on-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Building'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
