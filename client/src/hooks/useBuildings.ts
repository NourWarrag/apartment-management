import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export interface Building {
  id: number;
  name: string;
  code: string;
  address: string;
}

export function useBuildings() {
  return useQuery<Building[]>({
    queryKey: ['buildings'],
    queryFn: async () => {
      const res = await api.get('/buildings');
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
