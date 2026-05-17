import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService } from '../services/accounting/posting.service';
import { AccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);

export async function close(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const year = Number(req.params.year);
    if (isNaN(year) || year < 1900 || year > 9999) {
      res.status(400).json({ message: 'Invalid year' });
      return;
    }
    try {
      const entry = await posting.closeFiscalYear(year, req.user!.id);
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof AccountingError) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}
