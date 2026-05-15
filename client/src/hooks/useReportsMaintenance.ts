import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface MaintenanceReport {
  byStatus: Array<{ status: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
}

export function useReportsMaintenance(startDate?: string, endDate?: string) {
  return useQuery<MaintenanceReport>({
    queryKey: ['reports', 'maintenance', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const q = params.toString();
      const res = await api.get(`/reports/maintenance${q ? `?${q}` : ''}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
