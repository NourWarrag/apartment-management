import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { ApartmentStatus, ApartmentType } from '@hotel/shared';

export interface ApartmentListItem {
  id: number;
  number: string;
  floor: number;
  type: ApartmentType;
  status: ApartmentStatus;
  currentBooking: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
    tenant: { id: number; fullName: string; phone: string };
    payments: { method: string; amount: string; status: string; paidAt: string | null }[];
  } | null;
  upcomingBooking: {
    id: number;
    checkIn: string;
    checkOut: string;
    tenant: { id: number; fullName: string; phone: string };
  } | null;
  activeTicket: { id: number; status: string; priority: string } | null;
}

export interface ApartmentDetail extends Omit<ApartmentListItem, 'upcomingBooking' | 'activeTicket'> {
  bookings: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
    tenant: { id: number; fullName: string; phone: string };
    payments: { id: number; method: string; amount: string; status: string; paidAt: string | null; createdAt: string }[];
  }[];
  tickets: {
    id: number;
    description: string;
    priority: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
    assignedTo: { id: number; name: string } | null;
  }[];
}

export interface CreateApartmentDto {
  number: string;
  floor: number;
  type?: ApartmentType;
}

export interface UpdateApartmentDto {
  number?: string;
  floor?: number;
  type?: ApartmentType;
  status?: ApartmentStatus;
}

export function useApartments(
  filters?: { status?: ApartmentStatus; type?: ApartmentType; search?: string },
  options?: { enabled?: boolean }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.search) params.set('search', filters.search);

  return useQuery<ApartmentListItem[]>({
    queryKey: ['apartments', filters],
    queryFn: async () => {
      const res = await api.get(`/apartments?${params.toString()}`);
      return res.data;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useApartment(id: number) {
  return useQuery<ApartmentDetail>({
    queryKey: ['apartments', id],
    queryFn: async () => {
      const res = await api.get(`/apartments/${id}`);
      return res.data;
    },
    enabled: id > 0,
  });
}

export function useCreateApartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApartmentDto) => api.post('/apartments', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apartments'] }),
  });
}

export function useUpdateApartment(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateApartmentDto) => api.put(`/apartments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['apartments', id] });
    },
  });
}
