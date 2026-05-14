import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

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
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const res = await api.get('/dashboard/stats');
      return res.data;
    },
    retry: 1,
  });
}

export function useDashboardActivity() {
  return useQuery<DashboardActivity>({
    queryKey: ['dashboard', 'activity'],
    queryFn: async () => {
      const res = await api.get('/dashboard/activity');
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
  return useQuery<RevenueTrendPoint[]>({
    queryKey: ['dashboard', 'revenue-trend', days],
    queryFn: async () => {
      const res = await api.get(`/dashboard/revenue-trend?days=${days}`);
      return res.data;
    },
    retry: 1,
  });
}
