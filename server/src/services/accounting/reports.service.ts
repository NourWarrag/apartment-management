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
