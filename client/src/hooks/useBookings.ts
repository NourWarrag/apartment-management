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
