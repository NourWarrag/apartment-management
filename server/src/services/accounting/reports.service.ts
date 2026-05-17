import { PrismaClient, Prisma } from '@prisma/client';

const ZERO = new Prisma.Decimal(0);
const toFixed2 = (d: Prisma.Decimal) => d.toFixed(2);

export type TrialBalanceRow = {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  totalDebit: string;
  totalCredit: string;
  netBalance: string;
};

export type GLLine = {
  date: string;
  entryNumber: string;
  entryId: number;
  memo: string | null;
  debit: string;
  credit: string;
  runningBalance: string;
};

export type GLAccount = {
  accountId: number;
  accountCode: string;
  accountName: string;
  openingBalance: string;
  closingBalance: string;
  lines: GLLine[];
};

export type IncomeStatementSection = {
  type: 'INCOME' | 'EXPENSE';
  rows: { accountId: number; code: string; name: string; amount: string }[];
  total: string;
};

export type IncomeStatementResult = {
  from: string;
  to: string;
  income: IncomeStatementSection;
  expenses: IncomeStatementSection;
  netIncome: string;
};

export type BalanceSheetSection = {
  type: 'ASSET' | 'LIABILITY' | 'EQUITY';
  rows: { accountId: number; code: string; name: string; balance: string }[];
  total: string;
};

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
  accountId: number;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY';
  change: string;
};

export type CashFlowResult = {
  from: string;
  to: string;
  netIncome: string;
  workingCapitalChanges: WorkingCapitalChange[];
  netCashFromOperations: string;
  beginningCash: string;
  endingCash: string;
  reconcilesToCash: boolean;
};

export class ReportsService {
  constructor(private readonly prisma: PrismaClient) {}

  async trialBalance(opts: { asOf: Date; buildingId?: number }): Promise<TrialBalanceRow[]> {
    const accounts = await this.prisma.account.findMany({
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });

    const lines = await this.prisma.journalLine.findMany({
      where: {
        journalEntry: { status: 'POSTED', date: { lte: opts.asOf } },
        ...(opts.buildingId
          ? {
              OR: [
                { buildingId: opts.buildingId },
                { buildingId: null, journalEntry: { buildingId: opts.buildingId } },
              ],
            }
          : {}),
      },
      select: { accountId: true, debit: true, credit: true },
    });

    const totals = new Map<number, { d: Prisma.Decimal; c: Prisma.Decimal }>();
    for (const l of lines) {
      const t = totals.get(l.accountId) ?? { d: ZERO, c: ZERO };
      totals.set(l.accountId, { d: t.d.plus(l.debit), c: t.c.plus(l.credit) });
    }

    return accounts.map((a) => {
      const t = totals.get(a.id) ?? { d: ZERO, c: ZERO };
      return {
        accountId: a.id,
        accountCode: a.code,
        accountName: a.name,
        accountType: a.type,
        totalDebit: toFixed2(t.d),
        totalCredit: toFixed2(t.c),
        netBalance: toFixed2(t.d.minus(t.c)),
      };
    });
  }

  async incomeStatement(opts: {
    from: Date;
    to: Date;
    buildingId?: number;
  }): Promise<IncomeStatementResult> {
    const accounts = await this.prisma.account.findMany({
      where: { type: { in: ['INCOME', 'EXPENSE'] } },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        journalEntry: { status: 'POSTED', date: { gte: opts.from, lte: opts.to } },
        ...(opts.buildingId
          ? {
              OR: [
                { buildingId: opts.buildingId },
                { buildingId: null, journalEntry: { buildingId: opts.buildingId } },
              ],
            }
          : {}),
      },
      select: { accountId: true, debit: true, credit: true },
    });

    const byAccount = new Map<number, { d: Prisma.Decimal; c: Prisma.Decimal }>();
    for (const l of lines) {
      const t = byAccount.get(l.accountId) ?? { d: ZERO, c: ZERO };
      byAccount.set(l.accountId, { d: t.d.plus(l.debit), c: t.c.plus(l.credit) });
    }

    const incomeRows: IncomeStatementSection['rows'] = [];
    const expenseRows: IncomeStatementSection['rows'] = [];
    let incomeTotal = new Prisma.Decimal(0);
    let expenseTotal = new Prisma.Decimal(0);

    for (const a of accounts) {
      const t = byAccount.get(a.id) ?? { d: ZERO, c: ZERO };
      const amount = a.type === 'INCOME' ? t.c.minus(t.d) : t.d.minus(t.c);
      if (amount.eq(0)) continue;
      const row = { accountId: a.id, code: a.code, name: a.name, amount: amount.toFixed(2) };
      if (a.type === 'INCOME') {
        incomeRows.push(row);
        incomeTotal = incomeTotal.plus(amount);
      } else {
        expenseRows.push(row);
        expenseTotal = expenseTotal.plus(amount);
      }
    }

    return {
      from: opts.from.toISOString(),
      to: opts.to.toISOString(),
      income: { type: 'INCOME', rows: incomeRows, total: incomeTotal.toFixed(2) },
      expenses: { type: 'EXPENSE', rows: expenseRows, total: expenseTotal.toFixed(2) },
      netIncome: incomeTotal.minus(expenseTotal).toFixed(2),
    };
  }

  async balanceSheet(opts: { asOf: Date; buildingId?: number }): Promise<BalanceSheetResult> {
    const accounts = await this.prisma.account.findMany({
      where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        journalEntry: { status: 'POSTED', date: { lte: opts.asOf } },
        ...(opts.buildingId
          ? {
              OR: [
                { buildingId: opts.buildingId },
                { buildingId: null, journalEntry: { buildingId: opts.buildingId } },
              ],
            }
          : {}),
      },
      select: { accountId: true, debit: true, credit: true },
    });

    const byAccount = new Map<number, { d: Prisma.Decimal; c: Prisma.Decimal }>();
    for (const l of lines) {
      const t = byAccount.get(l.accountId) ?? { d: ZERO, c: ZERO };
      byAccount.set(l.accountId, { d: t.d.plus(l.debit), c: t.c.plus(l.credit) });
    }

    const make = (type: 'ASSET' | 'LIABILITY' | 'EQUITY'): BalanceSheetSection => {
      const rows: BalanceSheetSection['rows'] = [];
      let total = new Prisma.Decimal(0);
      for (const a of accounts) {
        if (a.type !== type) continue;
        const t = byAccount.get(a.id) ?? { d: ZERO, c: ZERO };
        const balance = type === 'ASSET' ? t.d.minus(t.c) : t.c.minus(t.d);
        if (balance.eq(0)) continue;
        rows.push({ accountId: a.id, code: a.code, name: a.name, balance: balance.toFixed(2) });
        total = total.plus(balance);
      }
      return { type, rows, total: total.toFixed(2) };
    };

    const assets = make('ASSET');
    const liabilities = make('LIABILITY');
    const equity = make('EQUITY');

    const yearStart = new Date(Date.UTC(opts.asOf.getUTCFullYear(), 0, 1));
    const isResult = await this.incomeStatement({
      from: yearStart,
      to: opts.asOf,
      buildingId: opts.buildingId,
    });
    const currentYearIncome = new Prisma.Decimal(isResult.netIncome);

    const totalLE = new Prisma.Decimal(liabilities.total).plus(equity.total).plus(currentYearIncome);
    const assetsTotal = new Prisma.Decimal(assets.total);
    const isBalanced = assetsTotal.minus(totalLE).abs().lt(new Prisma.Decimal('0.005'));

    return {
      asOf: opts.asOf.toISOString(),
      assets,
      liabilities,
      equity,
      currentYearIncome: currentYearIncome.toFixed(2),
      totalLiabilitiesAndEquity: totalLE.toFixed(2),
      isBalanced,
    };
  }

  async cashFlow(opts: { from: Date; to: Date; buildingId?: number }): Promise<CashFlowResult> {
    // 1. Net income for the period
    const is = await this.incomeStatement({ from: opts.from, to: opts.to, buildingId: opts.buildingId });
    const netIncome = new Prisma.Decimal(is.netIncome);

    // 2. Cash account set from mappings
    const cashMappings = await this.prisma.accountMapping.findMany({
      where: { key: { in: ['CASH_METHOD', 'CARD_METHOD', 'INSTALLMENT_METHOD'] } },
    });
    const cashAccountIds = new Set(cashMappings.map((m) => m.accountId));

    // 3. Non-cash assets + liabilities
    const accounts = await this.prisma.account.findMany({
      where: { type: { in: ['ASSET', 'LIABILITY'] } },
      orderBy: { code: 'asc' },
    });

    const balanceAt = async (accountId: number, date: Date): Promise<Prisma.Decimal> => {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId,
          journalEntry: { status: 'POSTED', date: { lte: date } },
          ...(opts.buildingId
            ? {
                OR: [
                  { buildingId: opts.buildingId },
                  { buildingId: null, journalEntry: { buildingId: opts.buildingId } },
                ],
              }
            : {}),
        },
        _sum: { debit: true, credit: true },
      });
      return new Prisma.Decimal(agg._sum.debit ?? 0).minus(agg._sum.credit ?? 0);
    };

    const fromMinus = new Date(opts.from.getTime() - 1);
    const workingCapitalChanges: WorkingCapitalChange[] = [];
    let totalWcChange = new Prisma.Decimal(0);

    for (const a of accounts) {
      if (cashAccountIds.has(a.id)) continue;
      const begin = await balanceAt(a.id, fromMinus);
      const end = await balanceAt(a.id, opts.to);
      const rawChange = end.minus(begin);
      // ASSET increase = cash usage (negate). LIABILITY increase = cash source; stored as credit-minus-debit goes negative for liabilities; negate flips to positive.
      const change = rawChange.negated();
      if (change.eq(0)) continue;
      workingCapitalChanges.push({
        accountId: a.id,
        code: a.code,
        name: a.name,
        type: a.type as 'ASSET' | 'LIABILITY',
        change: change.toFixed(2),
      });
      totalWcChange = totalWcChange.plus(change);
    }

    const netCashFromOperations = netIncome.plus(totalWcChange);

    // 4. Beginning / ending cash
    let beginningCash = new Prisma.Decimal(0);
    let endingCash = new Prisma.Decimal(0);
    for (const id of cashAccountIds) {
      beginningCash = beginningCash.plus(await balanceAt(id, fromMinus));
      endingCash = endingCash.plus(await balanceAt(id, opts.to));
    }

    const reconcilesToCash = endingCash
      .minus(beginningCash)
      .minus(netCashFromOperations)
      .abs()
      .lt(new Prisma.Decimal('0.005'));

    return {
      from: opts.from.toISOString(),
      to: opts.to.toISOString(),
      netIncome: netIncome.toFixed(2),
      workingCapitalChanges,
      netCashFromOperations: netCashFromOperations.toFixed(2),
      beginningCash: beginningCash.toFixed(2),
      endingCash: endingCash.toFixed(2),
      reconcilesToCash,
    };
  }

  async listFiscalPeriods(year?: number) {
    return this.prisma.fiscalPeriod.findMany({
      where: year !== undefined ? { year } : {},
      include: { closingEntry: { select: { id: true, entryNumber: true } } },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }

  async generalLedger(opts: {
    accountIds: number[];
    dateFrom: Date;
    dateTo: Date;
    buildingId?: number;
  }): Promise<GLAccount[]> {
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: opts.accountIds } },
      orderBy: { code: 'asc' },
    });

    const result: GLAccount[] = [];
    for (const a of accounts) {
      const buildingClause = opts.buildingId
        ? {
            OR: [
              { buildingId: opts.buildingId },
              { buildingId: null, journalEntry: { buildingId: opts.buildingId } },
            ],
          }
        : {};

      const openingAgg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: a.id,
          journalEntry: { status: 'POSTED', date: { lt: opts.dateFrom } },
          ...buildingClause,
        },
        _sum: { debit: true, credit: true },
      });
      const opening = new Prisma.Decimal(openingAgg._sum.debit ?? 0).minus(
        new Prisma.Decimal(openingAgg._sum.credit ?? 0),
      );

      const inRange = await this.prisma.journalLine.findMany({
        where: {
          accountId: a.id,
          journalEntry: { status: 'POSTED', date: { gte: opts.dateFrom, lte: opts.dateTo } },
          ...buildingClause,
        },
        orderBy: [{ journalEntry: { date: 'asc' } }, { journalEntryId: 'asc' }, { lineOrder: 'asc' }],
        include: { journalEntry: { select: { id: true, date: true, entryNumber: true, memo: true } } },
      });

      let running = opening;
      const lines: GLLine[] = inRange.map((l) => {
        const d = new Prisma.Decimal(l.debit);
        const c = new Prisma.Decimal(l.credit);
        running = running.plus(d).minus(c);
        return {
          date: l.journalEntry.date.toISOString(),
          entryNumber: l.journalEntry.entryNumber,
          entryId: l.journalEntry.id,
          memo: l.journalEntry.memo,
          debit: toFixed2(d),
          credit: toFixed2(c),
          runningBalance: toFixed2(running),
        };
      });

      result.push({
        accountId: a.id,
        accountCode: a.code,
        accountName: a.name,
        openingBalance: toFixed2(opening),
        closingBalance: toFixed2(running),
        lines,
      });
    }
    return result;
  }
}
