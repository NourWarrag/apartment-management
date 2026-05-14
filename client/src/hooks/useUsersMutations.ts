import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { Role } from '@hotel/shared';

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  role: Role;
  assignedBuildingId?: number | null;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: Role;
  assignedBuildingId?: number | null;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUserDto) => api.post('/users', dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateUserDto) => api.patch(`/users/${id}`, dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/users/${id}/deactivate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/users/${id}/reactivate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
