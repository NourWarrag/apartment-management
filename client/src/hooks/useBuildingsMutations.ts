import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export interface CreateBuildingDto { name: string; code: string; address: string; }
export interface UpdateBuildingDto { name?: string; code?: string; address?: string; }

export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBuildingDto) => api.post('/buildings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}

export function useUpdateBuilding(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBuildingDto) => api.patch(`/buildings/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}

export function useDeleteBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/buildings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
}
