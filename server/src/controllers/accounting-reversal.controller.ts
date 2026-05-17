import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService } from '../services/accounting/posting.service';
import { AccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);

export async function reverse(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const paymentId = Number(req.params.id);
    if (isNaN(paymentId) || paymentId <= 0) { res.status(400).json({ message: 'Invalid id' }); return; }

    try {
      const entry = await posting.reversePayment(paymentId, req.user!.id);
      res.json(entry);
    } catch (err) {
      if (err instanceof AccountingError) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}
