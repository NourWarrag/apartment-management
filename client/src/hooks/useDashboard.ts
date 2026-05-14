import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { useBuilding } from '../context/BuildingContext';

export interface DashboardStats {
  apartments: { total: number; occupied: number; available: number; maintenance: number };
  revenue: { total: number; cash: number; card: number; installment: number };
  pendingInstallments: number;
  openTickets: number;
}

export interface ActivityEvent {
  type: 'CHECK_IN' | 'CHECK_OUT' | 'PAYMENT' | 'TICKET';
  label: string;
  timestamp: string;
}

export interface DashboardActivity {
  events: ActivityEvent[];
}

export function useDashboardStats() {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;
  const params = buildingId ? `?buildingId=${buildingId}` : '';

  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', buildingId],
    queryFn: async () => {
      const res = await api.get(`/dashboard/stats${params}`);
      return res.data;
    },
    retry: 1,
  });
}

export function useDashboardActivity() {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;
  const params = buildingId ? `?buildingId=${buildingId}` : '';

  return useQuery<DashboardActivity>({
    queryKey: ['dashboard', 'activity', buildingId],
    queryFn: async () => {
      const res = await api.get(`/dashboard/activity${params}`);
      return res.data;
    },
    retry: 1,
    refetchInterval: 30_000,
  });
}

export interface RevenueTrendPoint {
  date: string;    // "YYYY-MM-DD"
  revenue: number;
}

export function useRevenueTrend(days: 7 | 30) {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;
  const params = new URLSearchParams({ days: String(days) });
  if (buildingId) params.set('buildingId', String(buildingId));

  return useQuery<RevenueTrendPoint[]>({
    queryKey: ['dashboard', 'revenue-trend', days, buildingId],
    queryFn: async () => {
      const res = await api.get(`/dashboard/revenue-trend?${params}`);
      return res.data;
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
}
