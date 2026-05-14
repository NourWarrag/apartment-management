import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useBuildings, Building } from '../hooks/useBuildings';

type SelectedBuilding = Building | 'all';

interface BuildingContextValue {
  selectedBuilding: SelectedBuilding;
  setSelectedBuilding: (b: SelectedBuilding) => void;
}

const BuildingContext = createContext<BuildingContextValue>({
  selectedBuilding: 'all',
  setSelectedBuilding: () => {},
});

const STORAGE_KEY = 'selectedBuilding';

function loadFromStorage(): SelectedBuilding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw === 'all') return 'all';
    return JSON.parse(raw) as Building;
  } catch {
    return 'all';
  }
}

export function BuildingProvider({ children }: { children: ReactNode }) {
  const [selectedBuilding, setSelectedBuildingState] = useState<SelectedBuilding>(loadFromStorage);
  const { data: buildings = [] } = useBuildings();

  // Reset to 'all' if the stored building no longer exists
  useEffect(() => {
    if (selectedBuilding === 'all') return;
    if (buildings.length === 0) return; // not loaded yet
    const stillExists = buildings.some((b) => b.id === (selectedBuilding as Building).id);
    if (!stillExists) {
      setSelectedBuildingState('all');
      localStorage.setItem(STORAGE_KEY, 'all');
    }
  }, [buildings, selectedBuilding]);

  function setSelectedBuilding(b: SelectedBuilding) {
    setSelectedBuildingState(b);
    localStorage.setItem(STORAGE_KEY, b === 'all' ? 'all' : JSON.stringify(b));
  }

  return (
    <BuildingContext.Provider value={{ selectedBuilding, setSelectedBuilding }}>
      {children}
    </BuildingContext.Provider>
  );
}

export function useBuilding() {
  return useContext(BuildingContext);
}
