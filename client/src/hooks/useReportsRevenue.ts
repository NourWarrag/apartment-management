import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface RevenueReport {
  totalRevenue: number;
  byMethod: Array<{ method: string; amount: number; count: number }>;
  byMonth: Array<{ month: string; amount: number }>;
}

export function useReportsRevenue(startDate?: string, endDate?: string) {
  return useQuery<RevenueReport>({
    queryKey: ['reports', 'revenue', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const q = params.toString();
      const res = await api.get(`/reports/revenue${q ? `?${q}` : ''}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
