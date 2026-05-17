import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await prisma.taxCode.findMany({ orderBy: { code: 'asc' } });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, name, ratePct, accountId, isDefault, isExempt } = req.body as {
      code?: string; name?: string; ratePct?: number; accountId?: number;
      isDefault?: boolean; isExempt?: boolean;
    };
    if (!code?.trim() || !name?.trim() || typeof ratePct !== 'number' || typeof accountId !== 'number') {
      res.status(400).json({ message: 'code, name, ratePct, accountId required' });
      return;
    }
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) { res.status(400).json({ message: 'accountId not found' }); return; }

    try {
      const result = await prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.taxCode.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.taxCode.create({
          data: {
            code: code.trim(), name: name.trim(),
            ratePct, accountId,
            isDefault: !!isDefault, isExempt: !!isExempt,
            createdBy: req.user!.id, updatedBy: req.user!.id,
          },
        });
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err?.code === 'P2002') { res.status(409).json({ message: 'TaxCode code already exists' }); return; }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid id' }); return; }
    const existing = await prisma.taxCode.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: 'Not found' }); return; }

    const body = req.body as { code?: string; name?: string; ratePct?: number; accountId?: number; isDefault?: boolean; isExempt?: boolean };
    const data: any = { updatedBy: req.user!.id };
    if (body.code !== undefined) data.code = body.code.trim();
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.ratePct !== undefined) data.ratePct = body.ratePct;
    if (body.accountId !== undefined) data.accountId = body.accountId;
    if (body.isExempt !== undefined) data.isExempt = body.isExempt;

    const result = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.taxCode.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
        data.isDefault = true;
      }
      return tx.taxCode.update({ where: { id }, data });
    });

    res.json(result);
  } catch (err) { next(err); }
}

export async function deactivate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.taxCode.update({ where: { id }, data: { isActive: false, updatedBy: req.user!.id } });
    res.json(updated);
  } catch (err) { next(err); }
}
