import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService } from '../services/accounting/posting.service';
import { AccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);

const entryInclude = {
  lines: { orderBy: { lineOrder: 'asc' as const }, include: { account: true } },
  building: { select: { id: true, name: true } },
} as const;

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { date, memo, buildingId, expenseAccountId, amount, payFromAccountId, taxCodeId } = req.body as {
      date?: string; memo?: string; buildingId?: number | null;
      expenseAccountId?: number; amount?: number | string;
      payFromAccountId?: number; taxCodeId?: number | null;
    };

    if (!date) { res.status(400).json({ message: 'date is required' }); return; }
    if (typeof expenseAccountId !== 'number' || expenseAccountId <= 0) {
      res.status(400).json({ message: 'expenseAccountId is required' });
      return;
    }
    if (typeof payFromAccountId !== 'number' || payFromAccountId <= 0) {
      res.status(400).json({ message: 'payFromAccountId is required' });
      return;
    }
    if (amount === undefined || amount === null || (typeof amount === 'number' && amount <= 0)) {
      res.status(400).json({ message: 'amount must be a positive number' });
      return;
    }

    try {
      const entry = await posting.postExpense(
        {
          date: new Date(date),
          memo: memo ?? undefined,
          buildingId: buildingId ?? null,
          expenseAccountId,
          amount,
          payFromAccountId,
          taxCodeId: taxCodeId ?? null,
        },
        req.user!.id,
      );
      const full = await prisma.journalEntry.findUnique({ where: { id: entry.id }, include: entryInclude });
      res.status(201).json(full);
    } catch (err) {
      if (err instanceof AccountingError) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}
