import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface OutstandingRow {
  tenantName: string;
  apartmentNumber: string;
  pendingAmount: number;
  oldestDue: string;
}

export function useReportsOutstanding(startDate?: string, endDate?: string) {
  return useQuery<OutstandingRow[]>({
    queryKey: ['reports', 'outstanding', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const q = params.toString();
      const res = await api.get(`/reports/outstanding${q ? `?${q}` : ''}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
