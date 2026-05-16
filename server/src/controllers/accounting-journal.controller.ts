import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PostingService, EntryInput } from '../services/accounting/posting.service';
import { AccountingError } from '../services/accounting/posting.errors';
import { JEStatus } from '@hotel/shared';
import { Prisma } from '@prisma/client';

const PAGE_SIZE = 20;
const posting = new PostingService(prisma as any);

const entryInclude = {
  lines: { orderBy: { lineOrder: 'asc' as const }, include: { account: true } },
  building: { select: { id: true, name: true } },
} as const;

function parseInput(body: any): EntryInput | string {
  if (!body || typeof body !== 'object') return 'Request body must be an object';
  if (!body.date) return 'date is required';
  if (!Array.isArray(body.lines)) return 'lines must be an array';
  return {
    date: new Date(body.date),
    memo: body.memo ?? undefined,
    buildingId: body.buildingId ?? null,
    lines: body.lines.map((l: any) => ({
      accountId: Number(l.accountId),
      buildingId: l.buildingId ?? null,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
    })),
  };
}

function mapAccountingError(err: unknown, res: Response): boolean {
  if (err instanceof AccountingError) {
    res.status(400).json({ code: err.code, message: err.message, details: err.details });
    return true;
  }
  return false;
}

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, dateFrom, dateTo, buildingId, q, page } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);

    const where: Prisma.JournalEntryWhereInput = {};
    if (status === 'DRAFT' || status === 'POSTED') where.status = status as JEStatus;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }
    if (buildingId) where.buildingId = Number(buildingId);
    if (q) {
      where.OR = [
        { entryNumber: { contains: q, mode: 'insensitive' } },
        { memo: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (pageNum - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: entryInclude,
      }),
    ]);

    res.json({ total, page: pageNum, pageSize: PAGE_SIZE, data });
  } catch (err) { next(err); }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const entry = await prisma.journalEntry.findUnique({ where: { id }, include: entryInclude });
    if (!entry) { res.status(404).json({ message: 'Entry not found' }); return; }
    res.json(entry);
  } catch (err) { next(err); }
}

export async function createDraft(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseInput(req.body);
    if (typeof input === 'string') { res.status(400).json({ message: input }); return; }
    const userId = req.user!.id;
    const draft = await posting.createDraft(input, userId);
    const full = await prisma.journalEntry.findUnique({ where: { id: draft.id }, include: entryInclude });
    res.status(201).json(full);
  } catch (err) {
    if (mapAccountingError(err, res)) return;
    next(err);
  }
}

export async function updateDraft(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const input = parseInput(req.body);
    if (typeof input === 'string') { res.status(400).json({ message: input }); return; }
    const userId = req.user!.id;
    await posting.updateDraft(id, input, userId);
    const full = await prisma.journalEntry.findUnique({ where: { id }, include: entryInclude });
    res.json(full);
  } catch (err) {
    if (mapAccountingError(err, res)) return;
    next(err);
  }
}

export async function deleteDraft(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const userId = req.user!.id;
    await posting.deleteDraft(id, userId);
    res.status(204).end();
  } catch (err) {
    if (mapAccountingError(err, res)) return;
    next(err);
  }
}

export async function postEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const userId = req.user!.id;
    await posting.post(id, userId);
    const full = await prisma.journalEntry.findUnique({ where: { id }, include: entryInclude });
    res.json(full);
  } catch (err) {
    if (mapAccountingError(err, res)) return;
    next(err);
  }
}

export async function createAndPost(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseInput(req.body);
    if (typeof input === 'string') { res.status(400).json({ message: input }); return; }
    const userId = req.user!.id;
    const posted = await posting.createAndPost(input, userId);
    const full = await prisma.journalEntry.findUnique({ where: { id: posted.id }, include: entryInclude });
    res.status(201).json(full);
  } catch (err) {
    if (mapAccountingError(err, res)) return;
    next(err);
  }
}
