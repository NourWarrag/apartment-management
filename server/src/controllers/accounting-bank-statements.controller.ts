import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { BankStatementService } from '../services/accounting/bank-statement.service';
import { AccountingError } from '../services/accounting/posting.errors';

const svc = new BankStatementService(prisma as any);

export async function preview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const bankAccountId = Number(req.params.id);
    if (!req.file) { res.status(400).json({ message: 'CSV file required' }); return; }
    const ba = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!ba) { res.status(404).json({ message: 'BankAccount not found' }); return; }

    const text = req.file.buffer.toString('utf-8');
    const result = await svc.preview(text);
    res.json(result);
  } catch (err) { next(err); }
}

export async function importStatement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const bankAccountId = Number(req.params.id);
    if (!req.file) { res.status(400).json({ message: 'CSV file required' }); return; }

    const text = req.file.buffer.toString('utf-8');

    try {
      const result = await svc.import(bankAccountId, req.file.originalname, text, req.user!.id);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof AccountingError) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function listStatements(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const bankAccountId = Number(req.params.id);
    const rows = await prisma.bankStatement.findMany({
      where: { bankAccountId },
      include: { _count: { select: { lines: true } } },
      orderBy: { importedAt: 'desc' },
    });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function deleteStatement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const matchedCount = await prisma.reconciliationMatch.count({
      where: { bankStatementLine: { bankStatementId: id } },
    });
    if (matchedCount > 0) {
      res.status(400).json({ message: 'Cannot delete a statement whose lines are matched in a reconciliation' });
      return;
    }
    await prisma.bankStatement.delete({ where: { id } });
    res.status(204).end();
  } catch (err) { next(err); }
}
