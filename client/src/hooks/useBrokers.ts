import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { BrokerStatus, BrokerAgentStatus, CommissionType } from '@hotel/shared';

export interface Broker {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  taxRegistrationNumber: string | null;
  address: string | null;
  notes: string | null;
  status: BrokerStatus;
  commissionType: CommissionType;
  defaultCommissionValue: string;
  createdAt: string;
  _count?: { agents: number; bookings: number };
}

export interface BrokerAgent {
  id: number;
  brokerId: number;
  fullName: string;
  phone: string;
  email: string | null;
  idNumber: string | null;
  notes: string | null;
  status: BrokerAgentStatus;
  commissionType: CommissionType | null;
  commissionValueOverride: string | null;
  createdAt: string;
}

export interface BrokerDetail extends Broker {
  agents: BrokerAgent[];
}

export interface CreateBrokerDto {
  name: string;
  phone: string;
  email?: string;
  taxRegistrationNumber?: string;
  address?: string;
  notes?: string;
  commissionType?: CommissionType;
  defaultCommissionValue?: number;
}

export interface UpdateBrokerDto extends Partial<CreateBrokerDto> {
  status?: BrokerStatus;
}

export interface CreateBrokerAgentDto {
  fullName: string;
  phone: string;
  email?: string;
  idNumber?: string;
  notes?: string;
  commissionType?: CommissionType;
  commissionValueOverride?: number;
}

export interface UpdateBrokerAgentDto extends Partial<CreateBrokerAgentDto> {
  status?: BrokerAgentStatus;
}

export interface AgentGroup {
  broker: { id: number; name: string };
  agents: BrokerAgent[];
}

export function useBrokers(search?: string) {
  return useQuery<Broker[]>({
    queryKey: ['brokers', search ?? ''],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/brokers${params}`);
      return res.data;
    },
  });
}

export function useBroker(id: number) {
  return useQuery<BrokerDetail>({
    queryKey: ['broker', id],
    queryFn: async () => (await api.get(`/brokers/${id}`)).data,
    enabled: id > 0,
  });
}

export function useCreateBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBrokerDto) => api.post('/brokers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brokers'] }),
  });
}

export function useUpdateBroker(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBrokerDto) => api.patch(`/brokers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brokers'] });
      qc.invalidateQueries({ queryKey: ['broker', id] });
    },
  });
}

export function useDeleteBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/brokers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brokers'] }),
  });
}

export function useCreateBrokerAgent(brokerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBrokerAgentDto) => api.post(`/brokers/${brokerId}/agents`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broker', brokerId] });
      qc.invalidateQueries({ queryKey: ['agent-search'] });
    },
  });
}

export function useUpdateBrokerAgent(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBrokerAgentDto) => api.patch(`/agents/${id}`, data),
    onSuccess: (res) => {
      const brokerId = (res.data as BrokerAgent).brokerId;
      qc.invalidateQueries({ queryKey: ['broker', brokerId] });
      qc.invalidateQueries({ queryKey: ['agent-search'] });
    },
  });
}

export function useDeleteBrokerAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broker'] });
      qc.invalidateQueries({ queryKey: ['agent-search'] });
    },
  });
}

export function useAgentSearch(search: string) {
  return useQuery<AgentGroup[]>({
    queryKey: ['agent-search', search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/agents${params}`);
      return res.data;
    },
  });
}
