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
    mutationFn: (dto: CreateUserDto) => api.post('/users', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateUserDto) => api.patch(`/users/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; [key: string]: unknown }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/users/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/users/${id}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
