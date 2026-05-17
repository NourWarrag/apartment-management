import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ReportsService } from '../services/accounting/reports.service';

const reports = new ReportsService(prisma as any);

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { year } = req.query as { year?: string };
    const rows = await reports.listFiscalPeriods(year ? Number(year) : undefined);
    res.json(rows);
  } catch (err) { next(err); }
}

function parseYM(req: AuthRequest): { year: number; month: number } | null {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function lock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ym = parseYM(req);
    if (!ym) { res.status(400).json({ message: 'Invalid year/month' }); return; }
    const updated = await prisma.fiscalPeriod.upsert({
      where: { year_month: ym },
      create: { ...ym, status: 'LOCKED', lockedAt: new Date(), lockedBy: req.user!.id },
      update: { status: 'LOCKED', lockedAt: new Date(), lockedBy: req.user!.id },
    });
    res.json(updated);
  } catch (err) { next(err); }
}

export async function unlock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ym = parseYM(req);
    if (!ym) { res.status(400).json({ message: 'Invalid year/month' }); return; }
    const existing = await prisma.fiscalPeriod.findUnique({ where: { year_month: ym } });
    if (!existing) { res.status(404).json({ message: 'Period not found' }); return; }
    if (existing.closingEntryId) {
      res.status(400).json({ message: 'Cannot unlock a period belonging to a closed fiscal year' });
      return;
    }
    const updated = await prisma.fiscalPeriod.update({
      where: { year_month: ym },
      data: { status: 'OPEN', lockedAt: null, lockedBy: null },
    });
    res.json(updated);
  } catch (err) { next(err); }
}
