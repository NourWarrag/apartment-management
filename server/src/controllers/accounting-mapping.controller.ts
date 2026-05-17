import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { MAPPING_KEYS, MappingKey } from '@hotel/shared';
import { MappingService } from '../services/accounting/mapping.service';

const mapping = new MappingService(prisma as any);
const VALID_KEYS = new Set<string>(MAPPING_KEYS);

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await mapping.listAll();
    res.json(rows);
  } catch (err) { next(err); }
}

export async function setOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const key = req.params.key;
    if (!VALID_KEYS.has(key)) { res.status(400).json({ message: `Unknown mapping key: ${key}` }); return; }
    const { accountId } = req.body as { accountId?: number };
    if (typeof accountId !== 'number' || accountId <= 0) {
      res.status(400).json({ message: 'accountId required' });
      return;
    }
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) { res.status(400).json({ message: 'Account not found' }); return; }
    if (!acc.isActive) { res.status(400).json({ message: 'Cannot map to an inactive account' }); return; }

    const updated = await mapping.setMapping(key as MappingKey, accountId, req.user!.id);
    res.json(updated);
  } catch (err) { next(err); }
}
