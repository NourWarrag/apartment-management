import api from '../axios';

export type BankAccount = {
  id: number; name: string; accountId: number; isActive: boolean;
  csvDateColumn: number | null; csvAmountColumn: number | null;
  csvDescriptionColumn: number | null; csvReferenceColumn: number | null;
  csvHasHeader: boolean; csvDateFormat: string | null;
  account: { id: number; code: string; name: string; type: string };
  _count: { statements: number; reconciliations: number };
};

export type BankStatement = {
  id: number; bankAccountId: number; filename: string;
  importedAt: string; lineCount: number;
  _count: { lines: number };
};

export type BankStatementLine = {
  id: number; bankStatementId: number; bankAccountId: number;
  date: string; amount: string; description: string; reference: string | null;
  matches: { id: number }[];
};

export type Reconciliation = {
  id: number; bankAccountId: number; endDate: string;
  statementBalance: string; status: 'OPEN' | 'CLOSED';
  closedAt: string | null; closedBy: number | null;
  reportSnapshot: any | null;
  bankAccount: { id: number; name: string };
};

export type ReconciliationDetail = Omit<Reconciliation, 'bankAccount'> & {
  bankAccount: BankAccount;
  bankLines: BankStatementLine[];
  journalLines: Array<{
    id: number; debit: string; credit: string; description: string | null;
    journalEntry: { id: number; entryNumber: string; date: string; memo: string | null };
    reconciliationMatches: { id: number }[];
  }>;
};

export const bankAccountsApi = {
  list: () => api.get<BankAccount[]>('/accounting/bank-accounts').then((r) => r.data),
  create: (d: { name: string; accountId: number }) =>
    api.post<BankAccount>('/accounting/bank-accounts', d).then((r) => r.data),
  update: (id: number, d: { name?: string; isActive?: boolean }) =>
    api.patch<BankAccount>(`/accounting/bank-accounts/${id}`, d).then((r) => r.data),
  updateCsvMapping: (id: number, d: {
    csvDateColumn: number; csvAmountColumn: number;
    csvDescriptionColumn: number; csvReferenceColumn?: number | null;
    csvHasHeader: boolean; csvDateFormat: string;
  }) => api.patch<BankAccount>(`/accounting/bank-accounts/${id}/csv-mapping`, d).then((r) => r.data),
  deactivate: (id: number) =>
    api.post<BankAccount>(`/accounting/bank-accounts/${id}/deactivate`).then((r) => r.data),
};

export const bankStatementsApi = {
  preview: (bankAccountId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ columnCount: number; sampleRows: string[][] }>(
      `/accounting/bank-accounts/${bankAccountId}/statements/preview`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then((r) => r.data);
  },
  import: (bankAccountId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ statementId: number; lineCount: number; dateRange: { from: string; to: string } }>(
      `/accounting/bank-accounts/${bankAccountId}/statements`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then((r) => r.data);
  },
  list: (bankAccountId: number) =>
    api.get<BankStatement[]>(`/accounting/bank-accounts/${bankAccountId}/statements`).then((r) => r.data),
  delete: (id: number) => api.delete(`/accounting/bank-statements/${id}`),
};

export const reconciliationsApi = {
  create: (d: { bankAccountId: number; endDate: string; statementBalance: string }) =>
    api.post<Reconciliation>('/accounting/reconciliations', d).then((r) => r.data),
  list: (params?: { bankAccountId?: number; status?: 'OPEN' | 'CLOSED' }) =>
    api.get<Reconciliation[]>('/accounting/reconciliations', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<ReconciliationDetail>(`/accounting/reconciliations/${id}`).then((r) => r.data),
  autoMatch: (id: number) =>
    api.post<{ matchedCount: number }>(`/accounting/reconciliations/${id}/auto-match`).then((r) => r.data),
  manualMatch: (id: number, body: { bankStatementLineId: number; journalLineIds: number[] }) =>
    api.post(`/accounting/reconciliations/${id}/match`, body).then((r) => r.data),
  unmatch: (id: number, bankLineId: number) =>
    api.delete(`/accounting/reconciliations/${id}/match/${bankLineId}`).then((r) => r.data),
  adjustment: (id: number, body: { bankStatementLineId: number; offsetAccountId: number; memo?: string }) =>
    api.post(`/accounting/reconciliations/${id}/adjustment`, body).then((r) => r.data),
  close: (id: number) =>
    api.post<Reconciliation>(`/accounting/reconciliations/${id}/close`).then((r) => r.data),
  reopen: (id: number) =>
    api.post<Reconciliation>(`/accounting/reconciliations/${id}/reopen`).then((r) => r.data),
};
