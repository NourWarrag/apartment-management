import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface BuildingReportRow {
  buildingId: number | null;
  buildingName: string;
  buildingCode: string | null;
  totalApartments: number;
  occupied: number;
  occupancyRate: number;
  monthlyRevenue: number;
  openTickets: number;
}

export function useReportsBuildings() {
  return useQuery<BuildingReportRow[]>({
    queryKey: ['reports', 'buildings'],
    queryFn: async () => {
      const res = await api.get('/reports/buildings');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
