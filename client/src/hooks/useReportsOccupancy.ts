import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface OccupancyRow {
  month: string;
  occupied: number;
  total: number;
  rate: number;
}

export function useReportsOccupancy(startDate?: string, endDate?: string) {
  return useQuery<OccupancyRow[]>({
    queryKey: ['reports', 'occupancy', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const q = params.toString();
      const res = await api.get(`/reports/occupancy${q ? `?${q}` : ''}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
