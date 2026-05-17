import { Prisma, PrismaClient, ReconciliationMatch } from '@prisma/client';
import { AccountingError } from './posting.errors';

export type AutoMatchCandidate = {
  bankStatementLineId: number;
  journalLineId: number;
};

export class MatchingService {
  constructor(private readonly prisma: PrismaClient) {}

  async findAutoMatches(reconciliationId: number, dateWindowDays = 2): Promise<AutoMatchCandidate[]> {
    const rec = await this.prisma.reconciliation.findUnique({
      where: { id: reconciliationId },
      include: { bankAccount: true },
    });
    if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${reconciliationId} not found`);

    const bankAccountId = rec.bankAccountId;
    const glAccountId = rec.bankAccount.accountId;

    const bankLines = await this.prisma.bankStatementLine.findMany({
      where: {
        bankAccountId,
        date: { lte: rec.endDate },
        matches: { none: {} },
      },
      orderBy: { date: 'asc' },
    });

    const candidates: AutoMatchCandidate[] = [];
    for (const bl of bankLines) {
      const lo = new Date(bl.date.getTime() - dateWindowDays * 86400000);
      const hi = new Date(bl.date.getTime() + dateWindowDays * 86400000);
      const amt = new Prisma.Decimal(bl.amount);
      const isDeposit = amt.gt(0);

      const lineCandidates = await this.prisma.journalLine.findMany({
        where: {
          accountId: glAccountId,
          journalEntry: { status: 'POSTED', date: { gte: lo, lte: hi } },
          reconciliationMatches: { none: {} },
          ...(isDeposit
            ? { debit: amt, credit: new Prisma.Decimal(0) }
            : { credit: amt.abs(), debit: new Prisma.Decimal(0) }),
        },
        take: 2,
      });
      if (lineCandidates.length === 1) {
        candidates.push({
          bankStatementLineId: bl.id,
          journalLineId: lineCandidates[0].id,
        });
      }
    }
    return candidates;
  }

  async applyAutoMatches(reconciliationId: number, userId: number, dateWindowDays = 2): Promise<number> {
    const candidates = await this.findAutoMatches(reconciliationId, dateWindowDays);
    if (candidates.length === 0) return 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of candidates) {
        await tx.reconciliationMatch.create({
          data: {
            reconciliationId,
            bankStatementLineId: c.bankStatementLineId,
            journalLineId: c.journalLineId,
            createdBy: userId,
          },
        });
      }
    });
    return candidates.length;
  }

  async manualMatch(
    reconciliationId: number,
    bankStatementLineId: number,
    journalLineIds: number[],
    userId: number,
  ): Promise<ReconciliationMatch[]> {
    if (journalLineIds.length === 0) {
      throw new AccountingError('INVALID_LINE', 'At least one journal line required');
    }

    return this.prisma.$transaction(async (tx) => {
      const rec = await tx.reconciliation.findUnique({
        where: { id: reconciliationId },
        include: { bankAccount: true },
      });
      if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${reconciliationId} not found`);
      if (rec.status === 'CLOSED') throw new AccountingError('RECONCILIATION_CLOSED', 'Reconciliation is closed');

      const bankLine = await tx.bankStatementLine.findUnique({ where: { id: bankStatementLineId } });
      if (!bankLine) throw new AccountingError('INVALID_LINE', `BankStatementLine ${bankStatementLineId} not found`);

      const jLines = await tx.journalLine.findMany({
        where: { id: { in: journalLineIds } },
        include: { reconciliationMatches: true },
      });
      if (jLines.length !== journalLineIds.length) {
        throw new AccountingError('INVALID_LINE', 'One or more journal lines not found');
      }
      if (jLines.some((l) => l.accountId !== rec.bankAccount.accountId)) {
        throw new AccountingError('INVALID_ACCOUNT', 'All journal lines must belong to the bank GL account');
      }
      if (jLines.some((l) => l.reconciliationMatches.length > 0)) {
        throw new AccountingError('LINE_ALREADY_MATCHED', 'One or more journal lines are already matched');
      }

      const bankAmount = new Prisma.Decimal(bankLine.amount);
      const isDeposit = bankAmount.gt(0);

      for (const l of jLines) {
        const d = new Prisma.Decimal(l.debit);
        const c = new Prisma.Decimal(l.credit);
        if (isDeposit && !d.gt(0)) {
          throw new AccountingError('INVALID_LINE', 'Bank deposit must match debits on the bank account');
        }
        if (!isDeposit && !c.gt(0)) {
          throw new AccountingError('INVALID_LINE', 'Bank withdrawal must match credits on the bank account');
        }
      }

      const sum = jLines.reduce(
        (acc, l) => acc.plus(isDeposit ? l.debit : l.credit),
        new Prisma.Decimal(0),
      );
      const target = bankAmount.abs();
      if (!sum.equals(target)) {
        throw new AccountingError('UNBALANCED', 'Sum of journal lines does not equal bank line amount', {
          sum: sum.toFixed(2),
          target: target.toFixed(2),
        });
      }

      const results: ReconciliationMatch[] = [];
      for (const l of jLines) {
        const m = await tx.reconciliationMatch.create({
          data: {
            reconciliationId,
            bankStatementLineId,
            journalLineId: l.id,
            createdBy: userId,
          },
        });
        results.push(m);
      }
      return results;
    });
  }

  async unmatchByBankLine(reconciliationId: number, bankStatementLineId: number): Promise<number> {
    const rec = await this.prisma.reconciliation.findUnique({ where: { id: reconciliationId } });
    if (!rec) throw new AccountingError('INVALID_LINE', `Reconciliation ${reconciliationId} not found`);
    if (rec.status === 'CLOSED') throw new AccountingError('RECONCILIATION_CLOSED', 'Reconciliation is closed');

    const result = await this.prisma.reconciliationMatch.deleteMany({
      where: { reconciliationId, bankStatementLineId },
    });
    return result.count;
  }
}
