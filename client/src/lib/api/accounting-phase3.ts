import api from '../axios';

export type IncomeStatementRow = { accountId: number; code: string; name: string; amount: string };
export type IncomeStatementSection = { type: 'INCOME' | 'EXPENSE'; rows: IncomeStatementRow[]; total: string };
export type IncomeStatementResult = {
  from: string; to: string;
  income: IncomeStatementSection;
  expenses: IncomeStatementSection;
  netIncome: string;
};

export type BalanceSheetRow = { accountId: number; code: string; name: string; balance: string };
export type BalanceSheetSection = { type: 'ASSET' | 'LIABILITY' | 'EQUITY'; rows: BalanceSheetRow[]; total: string };
export type BalanceSheetResult = {
  asOf: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  currentYearIncome: string;
  totalLiabilitiesAndEquity: string;
  isBalanced: boolean;
};

export type WorkingCapitalChange = {
  accountId: number; code: string; name: string;
  type: 'ASSET' | 'LIABILITY'; change: string;
};

export type CashFlowResult = {
  from: string; to: string;
  netIncome: string;
  workingCapitalChanges: WorkingCapitalChange[];
  netCashFromOperations: string;
  beginningCash: string;
  endingCash: string;
  reconcilesToCash: boolean;
};

export type FiscalPeriod = {
  id: number;
  year: number;
  month: number;
  status: 'OPEN' | 'LOCKED';
  lockedAt: string | null;
  lockedBy: number | null;
  closingEntryId: number | null;
  closingEntry: { id: number; entryNumber: string } | null;
};

export const statementsApi = {
  incomeStatement: (params: { from: string; to: string; buildingId?: number }) =>
    api.get<IncomeStatementResult>('/accounting/reports/income-statement', { params }).then((r) => r.data),
  balanceSheet: (params: { asOf: string; buildingId?: number }) =>
    api.get<BalanceSheetResult>('/accounting/reports/balance-sheet', { params }).then((r) => r.data),
  cashFlow: (params: { from: string; to: string; buildingId?: number }) =>
    api.get<CashFlowResult>('/accounting/reports/cash-flow', { params }).then((r) => r.data),
};

export const periodsApi = {
  list: (year?: number) =>
    api.get<FiscalPeriod[]>('/accounting/fiscal-periods', { params: year ? { year } : {} }).then((r) => r.data),
  lock: (year: number, month: number) =>
    api.post<FiscalPeriod>(`/accounting/fiscal-periods/${year}/${month}/lock`).then((r) => r.data),
  unlock: (year: number, month: number) =>
    api.post<FiscalPeriod>(`/accounting/fiscal-periods/${year}/${month}/unlock`).then((r) => r.data),
};

export const yearCloseApi = {
  close: (year: number) =>
    api.post(`/accounting/fiscal-years/${year}/close`).then((r) => r.data),
};

export const expenseApi = {
  create: (body: {
    date: string;
    memo?: string;
    buildingId?: number | null;
    expenseAccountId: number;
    amount: string | number;
    payFromAccountId: number;
    taxCodeId?: number | null;
  }) => api.post('/accounting/expenses', body).then((r) => r.data),
};

export const reversalApi = {
  reverseEntry: (entryId: number) =>
    api.post(`/accounting/journal-entries/${entryId}/reverse`).then((r) => r.data),
};
