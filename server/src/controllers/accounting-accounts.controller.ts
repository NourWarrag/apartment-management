import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { AccountType } from '@hotel/shared';
import { seedStarterChart } from '../services/accounting/starter-chart';
import { Prisma } from '@prisma/client';

const VALID_TYPES = Object.values(AccountType) as string[];

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type } = req.query as { type?: string };
    const where: Prisma.AccountWhereInput = {};
    if (type && VALID_TYPES.includes(type)) where.type = type as AccountType;

    const accounts = await prisma.account.findMany({
      where,
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
    res.json(accounts);
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, name, type, parentId, description } = req.body as {
      code?: string; name?: string; type?: string;
      parentId?: number | null; description?: string;
    };

    if (!code?.trim() || !name?.trim() || !type) {
      res.status(400).json({ message: 'code, name, and type are required' });
      return;
    }
    if (!VALID_TYPES.includes(type)) {
      res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }

    if (parentId) {
      const parent = await prisma.account.findUnique({ where: { id: parentId } });
      if (!parent) { res.status(400).json({ message: 'parentId not found' }); return; }
      if (parent.type !== type) {
        res.status(400).json({ message: 'parent must have the same type as the child account' });
        return;
      }
    }

    try {
      const acc = await prisma.account.create({
        data: {
          code: code.trim(), name: name.trim(),
          type: type as AccountType, parentId: parentId ?? null,
          description: description?.trim() || null,
        },
      });
      res.status(201).json(acc);
    } catch (err: any) {
      if (err?.code === 'P2002') { res.status(409).json({ message: 'Account code already exists' }); return; }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid id' }); return; }

    const existing = await prisma.account.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: 'Account not found' }); return; }

    const body = req.body as {
      code?: string; name?: string; type?: string;
      parentId?: number | null; description?: string;
    };

    const hasActivity = (await prisma.journalLine.count({ where: { accountId: id } })) > 0;
    const data: Prisma.AccountUpdateInput = {};

    if (body.name !== undefined) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;

    if (body.code !== undefined) {
      if (hasActivity && body.code !== existing.code) {
        res.status(400).json({ message: 'Cannot change code of an account with journal activity' });
        return;
      }
      data.code = body.code.trim();
    }
    if (body.type !== undefined) {
      if (hasActivity && body.type !== existing.type) {
        res.status(400).json({ message: 'Cannot change type of an account with journal activity' });
        return;
      }
      if (!VALID_TYPES.includes(body.type)) {
        res.status(400).json({ message: 'Invalid type' });
        return;
      }
      data.type = body.type as AccountType;
    }
    if (body.parentId !== undefined) {
      if (hasActivity && body.parentId !== existing.parentId) {
        res.status(400).json({ message: 'Cannot change parent of an account with journal activity' });
        return;
      }
      data.parent = body.parentId ? { connect: { id: body.parentId } } : { disconnect: true };
    }

    try {
      const updated = await prisma.account.update({ where: { id }, data });
      res.json(updated);
    } catch (err: any) {
      if (err?.code === 'P2002') { res.status(409).json({ message: 'Account code already exists' }); return; }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function setActive(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid id' }); return; }
    const isActive = req.path.endsWith('/activate');
    const updated = await prisma.account.update({ where: { id }, data: { isActive } });
    res.json(updated);
  } catch (err) { next(err); }
}

export async function seedStarter(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }
    const created = await seedStarterChart(prisma as any, userId);
    res.json({ created });
  } catch (err) { next(err); }
}
