import api from '../axios';
import type { MappingKey } from '@hotel/shared';

export type MappingRow = {
  key: MappingKey;
  accountId: number | null;
  account: { code: string; name: string } | null;
};

export const mappingApi = {
  list: () => api.get<MappingRow[]>('/accounting/mapping').then((r) => r.data),
  set: (key: MappingKey, accountId: number) =>
    api.patch(`/accounting/mapping/${key}`, { accountId }).then((r) => r.data),
};

export type TaxCode = {
  id: number; code: string; name: string; ratePct: string;
  accountId: number; isDefault: boolean; isExempt: boolean; isActive: boolean;
};

export const taxCodesApi = {
  list: () => api.get<TaxCode[]>('/accounting/tax-codes').then((r) => r.data),
  create: (d: { code: string; name: string; ratePct: number; accountId: number; isDefault?: boolean; isExempt?: boolean }) =>
    api.post<TaxCode>('/accounting/tax-codes', d).then((r) => r.data),
  update: (id: number, d: Partial<{ code: string; name: string; ratePct: number; accountId: number; isDefault: boolean; isExempt: boolean }>) =>
    api.patch<TaxCode>(`/accounting/tax-codes/${id}`, d).then((r) => r.data),
  deactivate: (id: number) =>
    api.post<TaxCode>(`/accounting/tax-codes/${id}/deactivate`).then((r) => r.data),
};

export const accountingAdminApi = {
  setup: () =>
    api.post<{ createdAccounts: number; createdTaxCodes: number; createdMappings: number; unmappedKeys: string[] }>(
      '/accounting/setup'
    ).then((r) => r.data),

  backfill: (fromDate?: string) =>
    api.post<{
      processed: number; posted: number; skipped: number;
      failed: Array<{ kind: string; id: number; code: string; message: string }>;
    }>('/accounting/backfill', fromDate ? { fromDate } : {}).then((r) => r.data),

  reversePayment: (paymentId: number) =>
    api.post(`/accounting/payments/${paymentId}/reverse`).then((r) => r.data),
};

export type VatReturnRow = {
  taxCodeId: number; code: string; name: string; ratePct: string; isExempt: boolean;
  output: { net: string; vat: string };
  input:  { net: string; vat: string };
};

export type VatReturnResult = {
  from: string; to: string;
  rows: VatReturnRow[];
  outputVatTotal: string; inputVatTotal: string; netVatDue: string;
};

export const vatReturnApi = {
  get: (params: { from: string; to: string }) =>
    api.get<VatReturnResult>('/accounting/reports/vat-return', { params }).then((r) => r.data),
};
