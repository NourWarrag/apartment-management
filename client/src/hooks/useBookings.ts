import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface CreateBookingDto {
  apartmentId: number;
  tenantId: number;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  payment: {
    method: 'CASH' | 'CARD' | 'INSTALLMENT';
    amount: number;
    referenceNumber?: string;
  };
  deposit?: { amount: number };
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookingDto) => api.post('/bookings', data),
    onSuccess: () => {
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
