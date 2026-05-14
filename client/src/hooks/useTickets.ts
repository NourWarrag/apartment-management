import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface TicketItem {
  id: number;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  apartment: { id: number; number: string; floor: number; deletedAt: string | null };
  assignedTo: { id: number; name: string } | null;
}

export interface TicketStats {
  open: number;
  inProgress: number;
  completed: number;
  resolved24h: number;
  avgResolutionHours: number | null;
}

export interface CreateTicketDto {
  apartmentId: number;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assignedToId?: number;
}

export interface UpdateTicketDto {
  status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  notes?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  assignedToId?: number | null;
}

export function useTickets(filters?: { status?: string; priority?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);

  return useQuery<{ total: number; data: TicketItem[] }>({
    queryKey: ['tickets', filters],
    queryFn: async () => {
      const res = await api.get(`/tickets?${params.toString()}`);
      return res.data;
    },
    retry: 1,
  });
}

export function useTicketStats() {
  return useQuery<TicketStats>({
    queryKey: ['tickets', 'stats'],
    queryFn: async () => {
      const res = await api.get('/tickets/stats');
      return res.data;
    },
    retry: 1,
  });
}

export function useMaintenanceStaff(options?: { enabled?: boolean }) {
  return useQuery<{ id: number; name: string }[]>({
    queryKey: ['users', 'maintenance-staff'],
    queryFn: async () => {
      const res = await api.get('/users/maintenance-staff');
      return res.data;
    },
    retry: 1,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTicketDto) => api.post('/tickets', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: number } & UpdateTicketDto) =>
      api.patch(`/tickets/${id}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
