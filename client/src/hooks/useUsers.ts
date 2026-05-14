import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { Role } from '@hotel/shared';

export interface UserListItem {
  id: number;
  name: string;
  email: string;
  role: Role;
  assignedBuildingId: number | null;
  assignedBuilding: { id: number; name: string; code: string } | null;
  createdAt: string;
  deletedAt: string | null;
}

export function useUsers() {
  return useQuery<UserListItem[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
    staleTime: 2 * 60 * 1000,
  });
}
