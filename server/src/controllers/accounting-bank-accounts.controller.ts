import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await prisma.bankAccount.findMany({
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
        _count: { select: { statements: true, reconciliations: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, accountId } = req.body as { name?: string; accountId?: number };
    if (!name?.trim() || typeof accountId !== 'number') {
      res.status(400).json({ message: 'name and accountId required' });
      return;
    }
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) { res.status(400).json({ message: 'Account not found' }); return; }
    if (acc.type !== 'ASSET') { res.status(400).json({ message: 'Bank account must link to an ASSET account' }); return; }
    if (!acc.isActive) { res.status(400).json({ message: 'Cannot link to an inactive account' }); return; }
    try {
      const ba = await prisma.bankAccount.create({
        data: { name: name.trim(), accountId, createdBy: req.user!.id, updatedBy: req.user!.id },
      });
      res.status(201).json(ba);
    } catch (err: any) {
      if (err?.code === 'P2002') { res.status(409).json({ message: 'GL account already linked to a bank account' }); return; }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: 'BankAccount not found' }); return; }
    const { name, isActive } = req.body as { name?: string; isActive?: boolean };
    const data: any = { updatedBy: req.user!.id };
    if (name !== undefined) data.name = name.trim();
    if (isActive !== undefined) data.isActive = isActive;
    const updated = await prisma.bankAccount.update({ where: { id }, data });
    res.json(updated);
  } catch (err) { next(err); }
}

export async function updateCsvMapping(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: 'BankAccount not found' }); return; }
    const body = req.body as {
      csvDateColumn?: number; csvAmountColumn?: number;
      csvDescriptionColumn?: number; csvReferenceColumn?: number | null;
      csvHasHeader?: boolean; csvDateFormat?: string;
    };
    const updated = await prisma.bankAccount.update({
      where: { id },
      data: {
        csvDateColumn: body.csvDateColumn,
        csvAmountColumn: body.csvAmountColumn,
        csvDescriptionColumn: body.csvDescriptionColumn,
        csvReferenceColumn: body.csvReferenceColumn,
        csvHasHeader: body.csvHasHeader,
        csvDateFormat: body.csvDateFormat,
        updatedBy: req.user!.id,
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
}

export async function deactivate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.bankAccount.update({ where: { id }, data: { isActive: false, updatedBy: req.user!.id } });
    res.json(updated);
  } catch (err) { next(err); }
}
