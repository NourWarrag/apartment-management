import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { useBuilding } from '../context/BuildingContext';

export interface PaymentListItem {
  id: number;
  method: 'CASH' | 'CARD' | 'INSTALLMENT';
  amount: string;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'REVERSED';
  referenceNumber: string | null;
  paidAt: string | null;
  createdAt: string;
  postedEntryId?: number | null;
  booking: {
    id: number;
    checkIn: string;
    checkOut: string;
    tenant: { id: number; fullName: string; phone: string; deletedAt: string | null };
    apartment: { id: number; number: string; floor: number; deletedAt: string | null };
  };
}

export interface PaymentsListResponse {
  total: number;
  page: number;
  pageSize: number;
  data: PaymentListItem[];
}

export interface CreatePaymentDto {
  bookingId: number;
  method: 'CASH' | 'CARD' | 'INSTALLMENT';
  amount: number;
  referenceNumber?: string;
}

export function usePayments(filters?: {
  status?: string;
  method?: string;
  search?: string;
  page?: number;
}) {
  const { selectedBuilding } = useBuilding();
  const buildingId = selectedBuilding === 'all' ? undefined : selectedBuilding.id;

  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.method) params.set('method', filters.method);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page && filters.page > 1) params.set('page', String(filters.page));
  if (buildingId) params.set('buildingId', String(buildingId));

  return useQuery<PaymentsListResponse>({
    queryKey: ['payments', { ...filters, buildingId }],
    queryFn: async () => {
      const res = await api.get(`/payments?${params.toString()}`);
      return res.data;
    },
    retry: 1,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePaymentDto) => api.post('/payments', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments'] }),
  });
}

export function useMarkPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.patch(`/payments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments'] }),
  });
}

export interface PaymentStats {
  monthlyRevenue: number;
  outstandingBalance: number;
  activePlans: number;
  collectionRate: number;
}

export interface InstallmentPlan {
  bookingId: number;
  tenantName: string;
  apartmentNumber: string;
  totalAmount: string;
  paidAmount: string;
  checkIn: string;
  checkOut: string;
}

export function usePaymentStats() {
  return useQuery<PaymentStats>({
    queryKey: ['payments', 'stats'],
    queryFn: async () => {
      const res = await api.get('/payments/stats');
      return res.data;
    },
    retry: 1,
  });
}

export function useInstallmentPlans() {
  return useQuery<InstallmentPlan[]>({
    queryKey: ['payments', 'installment-plans'],
    queryFn: async () => {
      const res = await api.get('/payments/installment-plans');
      return res.data;
    },
    retry: 1,
  });
}
