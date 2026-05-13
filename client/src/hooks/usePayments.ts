import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface PaymentListItem {
  id: number;
  method: 'CASH' | 'CARD' | 'INSTALLMENT';
  amount: string;
  status: 'PAID' | 'PENDING' | 'FAILED';
  referenceNumber: string | null;
  paidAt: string | null;
  createdAt: string;
  booking: {
    id: number;
    checkIn: string;
    checkOut: string;
    tenant: { id: number; fullName: string; phone: string };
    apartment: { id: number; number: string; floor: number };
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
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.method) params.set('method', filters.method);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page && filters.page > 1) params.set('page', String(filters.page));

  return useQuery<PaymentsListResponse>({
    queryKey: ['payments', filters],
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
