import { useBuilding } from '../../context/BuildingContext';
import { useBuildings, Building } from '../../hooks/useBuildings';

export default function BuildingSelector() {
  const { selectedBuilding, setSelectedBuilding } = useBuilding();
  const { data: buildings = [] } = useBuildings();

  const currentId = selectedBuilding === 'all' ? 'all' : String(selectedBuilding.id);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === 'all') {
      setSelectedBuilding('all');
    } else {
      const b = buildings.find((b) => String(b.id) === val);
      if (b) setSelectedBuilding(b);
    }
  }

  if (buildings.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">business</span>
      <select
        value={currentId}
        onChange={handleChange}
        className="text-sm font-medium text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
        aria-label="Select building"
      >
        <option value="all">All Buildings</option>
        {buildings.map((b: Building) => (
          <option key={b.id} value={String(b.id)}>
            {b.name} ({b.code})
          </option>
        ))}
      </select>
    </div>
  );
}
