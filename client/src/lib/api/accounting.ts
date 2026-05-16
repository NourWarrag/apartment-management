import api from '../axios';
import type { AccountType, JEStatus, JESource } from '@hotel/shared';

export type Account = {
  id: number; code: string; name: string; type: AccountType;
  parentId: number | null; isActive: boolean; description: string | null;
};

export type JournalLine = {
  id?: number; accountId: number; buildingId: number | null;
  debit: string; credit: string; description: string | null; lineOrder: number;
  account?: Account;
};

export type JournalEntry = {
  id: number; entryNumber: string; date: string; memo: string | null;
  buildingId: number | null; status: JEStatus; source: JESource;
  sourceRefId: number | null; postedAt: string | null; postedBy: number | null;
  lines: JournalLine[];
  building: { id: number; name: string } | null;
};

export const accountsApi = {
  list: () => api.get<Account[]>('/accounting/accounts').then((r) => r.data),
  create: (d: { code: string; name: string; type: AccountType; parentId?: number | null; description?: string }) =>
    api.post<Account>('/accounting/accounts', d).then((r) => r.data),
  update: (id: number, d: Partial<{ code: string; name: string; type: AccountType; parentId: number | null; description: string }>) =>
    api.patch<Account>(`/accounting/accounts/${id}`, d).then((r) => r.data),
  setActive: (id: number, active: boolean) =>
    api.post<Account>(`/accounting/accounts/${id}/${active ? 'activate' : 'deactivate'}`).then((r) => r.data),
  seedStarter: () => api.post<{ created: number }>('/accounting/accounts/seed-starter').then((r) => r.data),
};

export type JEListResponse = { total: number; page: number; pageSize: number; data: JournalEntry[] };

export const journalApi = {
  list: (params: {
    status?: JEStatus; dateFrom?: string; dateTo?: string;
    buildingId?: number; q?: string; page?: number;
  }) => api.get<JEListResponse>('/accounting/journal-entries', { params }).then((r) => r.data),
  get: (id: number) => api.get<JournalEntry>(`/accounting/journal-entries/${id}`).then((r) => r.data),
  createDraft: (body: any) => api.post<JournalEntry>('/accounting/journal-entries', body).then((r) => r.data),
  updateDraft: (id: number, body: any) => api.patch<JournalEntry>(`/accounting/journal-entries/${id}`, body).then((r) => r.data),
  deleteDraft: (id: number) => api.delete(`/accounting/journal-entries/${id}`),
  post: (id: number) => api.post<JournalEntry>(`/accounting/journal-entries/${id}/post`).then((r) => r.data),
  createAndPost: (body: any) => api.post<JournalEntry>('/accounting/journal-entries/post', body).then((r) => r.data),
};

export type TrialBalanceRow = {
  accountId: number; accountCode: string; accountName: string; accountType: AccountType;
  totalDebit: string; totalCredit: string; netBalance: string;
};

export type GLAccount = {
  accountId: number; accountCode: string; accountName: string;
  openingBalance: string; closingBalance: string;
  lines: {
    date: string; entryNumber: string; entryId: number; memo: string | null;
    debit: string; credit: string; runningBalance: string;
  }[];
};

export const reportsApi = {
  trialBalance: (params: { asOf: string; buildingId?: number }) =>
    api.get<{ asOf: string; rows: TrialBalanceRow[] }>('/accounting/reports/trial-balance', { params }).then((r) => r.data),
  generalLedger: (params: { accountIds: number[]; dateFrom: string; dateTo: string; buildingId?: number }) =>
    api.get<GLAccount[]>('/accounting/reports/general-ledger', {
      params: { ...params, accountIds: params.accountIds.join(',') },
    }).then((r) => r.data),
};
