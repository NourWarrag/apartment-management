import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface TenantListItem {
  id: number;
  fullName: string;
  phone: string;
  idNumber: string;
  createdAt: string;
}

export interface TenantDetail extends TenantListItem {
  bookings: {
    id: number;
    checkIn: string;
    checkOut: string;
    totalAmount: string;
    apartment: { id: number; number: string; floor: number };
    payments: { id: number; method: string; amount: string; status: string; paidAt: string | null }[];
  }[];
}

export interface CreateTenantDto {
  fullName: string;
  phone: string;
  idNumber: string;
}

export interface UpdateTenantDto {
  fullName?: string;
  phone?: string;
  idNumber?: string;
}

export function useTenants(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return useQuery<TenantListItem[]>({
    queryKey: ['tenants', search],
    queryFn: async () => {
      const res = await api.get(`/tenants${params}`);
      return res.data;
    },
  });
}

export function useTenant(id: number) {
  return useQuery<TenantDetail>({
    queryKey: ['tenants', id],
    queryFn: async () => {
      const res = await api.get(`/tenants/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTenantDto) => api.post('/tenants', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenants'] }),
  });
}

export function useUpdateTenant(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTenantDto) => api.put(`/tenants/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants', id] });
    },
  });
}
