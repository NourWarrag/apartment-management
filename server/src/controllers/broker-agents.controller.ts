import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { CommissionType } from '@hotel/shared';

const VALID_TYPES = Object.values(CommissionType);

export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const agent = await prisma.brokerAgent.findFirst({
      where: { id, deletedAt: null },
      include: { broker: true },
    });
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (err) {
    next(err);
  }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.brokerAgent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    const { fullName, phone, email, idNumber, notes, status, commissionType, commissionValueOverride } =
      req.body as {
        fullName?: string;
        phone?: string;
        email?: string | null;
        idNumber?: string | null;
        notes?: string | null;
        status?: 'ACTIVE' | 'INACTIVE';
        commissionType?: 'PERCENT' | 'FLAT' | null;
        commissionValueOverride?: number | null;
      };
    if (commissionType && !['PERCENT', 'FLAT', null].includes(commissionType as any)) {
      res.status(400).json({ message: `commissionType must be PERCENT, FLAT, or null` });
      return;
    }
    if (commissionValueOverride !== undefined && commissionValueOverride !== null && (typeof commissionValueOverride !== 'number' || commissionValueOverride < 0)) {
      res.status(400).json({ message: 'commissionValueOverride must be a non-negative number or null' });
      return;
    }
    const agent = await prisma.brokerAgent.update({
      where: { id },
      data: {
        ...(fullName !== undefined ? { fullName } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(idNumber !== undefined ? { idNumber } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(commissionType !== undefined ? { commissionType } : {}),
        ...(commissionValueOverride !== undefined ? { commissionValueOverride } : {}),
        updatedBy: req.user?.id ?? null,
      },
    });
    res.json(agent);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.brokerAgent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    await prisma.brokerAgent.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: req.user?.id ?? null },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const agents = await prisma.brokerAgent.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        broker: { deletedAt: null, status: 'ACTIVE' },
        ...(q
          ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }
          : {}),
      },
      include: { broker: { select: { id: true, name: true } } },
      orderBy: [{ broker: { name: 'asc' } }, { fullName: 'asc' }],
    });

    const groups = new Map<number, { broker: { id: number; name: string }; agents: typeof agents }>();
    for (const a of agents) {
      const key = a.broker.id;
      if (!groups.has(key)) {
        groups.set(key, { broker: a.broker, agents: [] });
      }
      groups.get(key)!.agents.push(a);
    }
    res.json(Array.from(groups.values()));
  } catch (err) {
    next(err);
  }
}
