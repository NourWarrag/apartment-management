import { useQuery } from '@tanstack/react-query';
import { FeatureFlag } from '@hotel/shared';
import api from '../lib/axios';

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await api.get('/config');
      return res.data.features as Record<FeatureFlag, boolean>;
    },
    staleTime: Infinity,
  });
}
