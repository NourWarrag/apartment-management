import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';

export type EntityType = 'APARTMENT' | 'TENANT' | 'BOOKING' | 'TICKET';

const ENTITY_URL: Record<EntityType, string> = {
  APARTMENT: 'apartments',
  TENANT: 'tenants',
  BOOKING: 'bookings',
  TICKET: 'tickets',
};

export interface AttachmentItem {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy: { id: number; name: string };
  createdAt: string;
}

export function useAttachments(entityType: EntityType, entityId: number) {
  const base = ENTITY_URL[entityType];
  return useQuery<AttachmentItem[]>({
    queryKey: ['attachments', entityType, entityId],
    queryFn: async () => {
      const res = await api.get(`/${base}/${entityId}/attachments`);
      return res.data;
    },
    enabled: entityId > 0,
  });
}

export function useUploadAttachment(entityType: EntityType, entityId: number) {
  const queryClient = useQueryClient();
  const base = ENTITY_URL[entityType];
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post(`/${base}/${entityId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] }),
  });
}

export function useDeleteAttachment(entityType: EntityType, entityId: number) {
  const queryClient = useQueryClient();
  const base = ENTITY_URL[entityType];
  return useMutation({
    mutationFn: (attId: number) =>
      api.delete(`/${base}/${entityId}/attachments/${attId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] }),
  });
}
