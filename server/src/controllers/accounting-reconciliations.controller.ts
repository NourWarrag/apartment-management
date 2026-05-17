import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { MatchingService } from '../services/accounting/matching.service';
import { AccountingError } from '../services/accounting/posting.errors';

const matching = new MatchingService(prisma as any);

function mapErr(err: unknown, res: Response): boolean {
  if (err instanceof AccountingError) {
    res.status(400).json({ code: err.code, message: err.message, details: err.details });
    return true;
  }
  return false;
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { bankAccountId, endDate, statementBalance } = req.body as {
      bankAccountId?: number; endDate?: string; statementBalance?: string | number;
    };
    if (typeof bankAccountId !== 'number' || !endDate || statementBalance === undefined) {
      res.status(400).json({ message: 'bankAccountId, endDate, statementBalance required' });
      return;
    }
    const existingOpen = await prisma.reconciliation.findFirst({
      where: { bankAccountId, status: 'OPEN' },
    });
    if (existingOpen) {
      res.status(400).json({ message: 'An OPEN reconciliation already exists for this bank account' });
      return;
    }
    const rec = await prisma.reconciliation.create({
      data: {
        bankAccountId,
        endDate: new Date(endDate),
        statementBalance: String(statementBalance),
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      },
    });
    res.status(201).json(rec);
  } catch (err) { next(err); }
}

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { bankAccountId, status } = req.query as { bankAccountId?: string; status?: string };
    const where: any = {};
    if (bankAccountId) where.bankAccountId = Number(bankAccountId);
    if (status === 'OPEN' || status === 'CLOSED') where.status = status;
    const rows = await prisma.reconciliation.findMany({
      where,
      include: { bankAccount: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { endDate: 'desc' }],
    });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const rec = await prisma.reconciliation.findUnique({
      where: { id },
      include: { bankAccount: true },
    });
    if (!rec) { res.status(404).json({ message: 'Reconciliation not found' }); return; }

    const bankLines = await prisma.bankStatementLine.findMany({
      where: { bankAccountId: rec.bankAccountId, date: { lte: rec.endDate } },
      include: { matches: { where: { reconciliationId: id } } },
      orderBy: { date: 'asc' },
    });
    const journalLines = await prisma.journalLine.findMany({
      where: {
        accountId: rec.bankAccount.accountId,
        journalEntry: { status: 'POSTED', date: { lte: rec.endDate } },
      },
      include: {
        journalEntry: { select: { id: true, entryNumber: true, date: true, memo: true } },
        reconciliationMatches: { where: { reconciliationId: id } },
      },
      orderBy: { journalEntry: { date: 'asc' } },
    });
    res.json({ ...rec, bankLines, journalLines });
  } catch (err) { next(err); }
}

export async function autoMatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const count = await matching.applyAutoMatches(id, req.user!.id);
    res.json({ matchedCount: count });
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function manualMatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const { bankStatementLineId, journalLineIds } = req.body as {
      bankStatementLineId?: number; journalLineIds?: number[];
    };
    if (typeof bankStatementLineId !== 'number' || !Array.isArray(journalLineIds)) {
      res.status(400).json({ message: 'bankStatementLineId and journalLineIds required' });
      return;
    }
    const matches = await matching.manualMatch(id, bankStatementLineId, journalLineIds, req.user!.id);
    res.status(201).json(matches);
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function unmatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const bankLineId = Number(req.params.bankLineId);
    const count = await matching.unmatchByBankLine(id, bankLineId);
    res.json({ removed: count });
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function adjustment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const { bankStatementLineId, offsetAccountId, memo } = req.body as {
      bankStatementLineId?: number; offsetAccountId?: number; memo?: string;
    };
    if (typeof bankStatementLineId !== 'number' || typeof offsetAccountId !== 'number') {
      res.status(400).json({ message: 'bankStatementLineId and offsetAccountId required' });
      return;
    }
    const match = await matching.addAdjustmentAndMatch(
      { reconciliationId: id, bankStatementLineId, offsetAccountId, memo },
      req.user!.id,
    );
    res.status(201).json(match);
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function close(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const closed = await matching.close(id, req.user!.id);
    res.json(closed);
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function reopen(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const reopened = await matching.reopen(id, req.user!.id);
    res.json(reopened);
  } catch (err) {
    if (mapErr(err, res)) return;
    next(err);
  }
}

export async function reportCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const rec = await prisma.reconciliation.findUnique({ where: { id } });
    if (!rec) { res.status(404).json({ message: 'Not found' }); return; }
    const snapshot = rec.reportSnapshot as any;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${id}.csv"`);
    res.write('Type,Detail,Amount\n');
    if (snapshot) {
      res.write(`Summary,Statement Balance,${snapshot.statementBalance}\n`);
      res.write(`Summary,GL Balance,${snapshot.glBalance}\n`);
      res.write(`Summary,Outstanding Deposits,${snapshot.outstandingDeposits}\n`);
      res.write(`Summary,Outstanding Withdrawals,${snapshot.outstandingWithdrawals}\n`);
    } else {
      res.write('Summary,Reconciliation is OPEN — live snapshot not implemented in CSV\n');
    }
    res.end();
  } catch (err) { next(err); }
}
