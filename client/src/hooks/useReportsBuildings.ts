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

export function useReportsBuildings(startDate?: string, endDate?: string) {
  return useQuery<BuildingReportRow[]>({
    queryKey: ['reports', 'buildings', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const q = params.toString();
      const res = await api.get(`/reports/buildings${q ? `?${q}` : ''}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
