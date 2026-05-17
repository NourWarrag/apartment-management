import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService } from '../services/accounting/posting.service';
import { BackfillService } from '../services/accounting/backfill.service';

const posting = new PostingService(prisma as any);
const backfill = new BackfillService(prisma as any, posting);

export async function run(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fromDate } = req.body as { fromDate?: string };
    const parsed = fromDate ? new Date(fromDate) : undefined;
    if (fromDate && isNaN(parsed!.getTime())) {
      res.status(400).json({ message: 'fromDate must be a valid ISO date' });
      return;
    }
    const result = await backfill.run({ fromDate: parsed, userId: req.user!.id });
    res.json(result);
  } catch (err) { next(err); }
}
