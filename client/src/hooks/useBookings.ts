import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface CreateBookingDto {
  apartmentId: number;
  tenantId: number;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  taxCodeId?: number | null;
  payment: {
    method: 'CASH' | 'CARD' | 'INSTALLMENT';
    amount: number;
    referenceNumber?: string;
  };
  deposit?: { amount: number };
}

export interface BookingDetail {
  id: number;
  checkIn: string;
  checkOut: string;
  totalAmount: string;
  depositAmount: string | null;
  depositStatus: 'NONE' | 'HELD' | 'RELEASED' | 'FORFEITED';
  depositRefundAmount: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  tenant: {
    id: number;
    fullName: string;
    phone: string;
    idNumber: string;
  };
  apartment: {
    id: number;
    number: string;
    floor: number;
    type: string;
    building: { name: string };
  };
  payments: Array<{
    id: number;
    method: string;
    amount: string;
    status: string;
    paidAt: string | null;
    referenceNumber: string | null;
  }>;
}

export interface BookingsListParams {
  search?: string;
  status?: 'ACTIVE' | 'UPCOMING' | 'CHECKED_OUT';
  buildingId?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface BookingListItem {
  id: number;
  checkIn: string;
  checkOut: string;
  totalAmount: string;
  depositStatus: 'NONE' | 'HELD' | 'RELEASED' | 'FORFEITED';
  checkedOutAt: string | null;
  createdAt: string;
  tenant: { id: number; fullName: string; phone: string };
  apartment: {
    id: number;
    number: string;
    floor: number;
    type: string;
    building: { id: number; name: string };
  };
}

export interface BookingsListResponse {
  data: BookingListItem[];
  total: number;
  page: number;
  limit: number;
}

export function useBookingsList(params: BookingsListParams = {}) {
  return useQuery({
    queryKey: ['bookings', params],
    queryFn: async () => {
      const res = await api.get('/bookings', { params });
      return res.data as BookingsListResponse;
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookingDto) => api.post('/bookings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}

export function useCollectDeposit(bookingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => api.patch(`/bookings/${bookingId}/deposit`, { amount }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apartments'] }),
  });
}

export function useCheckout(bookingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (depositRefundAmount?: number) =>
      api.patch(`/bookings/${bookingId}/checkout`, { depositRefundAmount }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apartments'] }),
  });
}

export function useBooking(bookingId: number) {
  return useQuery({
    queryKey: ['booking', bookingId],
    queryFn: async () => {
      const res = await api.get(`/bookings/${bookingId}`);
      return res.data as BookingDetail;
    },
    enabled: bookingId > 0,
  });
}
