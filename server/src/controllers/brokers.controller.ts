import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { CommissionType } from '@hotel/shared';

const VALID_TYPES = Object.values(CommissionType);

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const brokers = await prisma.broker.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status: status as 'ACTIVE' | 'INACTIVE' } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }
          : {}),
      },
      include: {
        _count: { select: { agents: { where: { deletedAt: null } }, bookings: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(brokers);
  } catch (err) {
    next(err);
  }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, phone, email, taxRegistrationNumber, address, notes, commissionType, defaultCommissionValue } =
      req.body as {
        name?: string;
        phone?: string;
        email?: string;
        taxRegistrationNumber?: string;
        address?: string;
        notes?: string;
        commissionType?: string;
        defaultCommissionValue?: number;
      };

    if (!name || !phone) {
      res.status(400).json({ message: 'name and phone are required' });
      return;
    }
    if (commissionType && !VALID_TYPES.includes(commissionType as CommissionType)) {
      res.status(400).json({ message: `commissionType must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (defaultCommissionValue !== undefined && (typeof defaultCommissionValue !== 'number' || defaultCommissionValue < 0)) {
      res.status(400).json({ message: 'defaultCommissionValue must be a non-negative number' });
      return;
    }

    const broker = await prisma.broker.create({
      data: {
        name,
        phone,
        email: email ?? null,
        taxRegistrationNumber: taxRegistrationNumber ?? null,
        address: address ?? null,
        notes: notes ?? null,
        commissionType: (commissionType as CommissionType) ?? CommissionType.PERCENT,
        defaultCommissionValue: defaultCommissionValue ?? 0,
        createdBy: req.user?.id ?? null,
        updatedBy: req.user?.id ?? null,
      },
    });
    res.status(201).json(broker);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const broker = await prisma.broker.findFirst({
      where: { id, deletedAt: null },
      include: {
        agents: { where: { deletedAt: null }, orderBy: { fullName: 'asc' } },
      },
    });
    if (!broker) {
      res.status(404).json({ message: 'Broker not found' });
      return;
    }
    res.json(broker);
  } catch (err) {
    next(err);
  }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.broker.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Broker not found' });
      return;
    }
    const { name, phone, email, taxRegistrationNumber, address, notes, status, commissionType, defaultCommissionValue } =
      req.body as {
        name?: string;
        phone?: string;
        email?: string | null;
        taxRegistrationNumber?: string | null;
        address?: string | null;
        notes?: string | null;
        status?: 'ACTIVE' | 'INACTIVE';
        commissionType?: 'PERCENT' | 'FLAT';
        defaultCommissionValue?: number;
      };

    if (defaultCommissionValue !== undefined && (typeof defaultCommissionValue !== 'number' || defaultCommissionValue < 0)) {
      res.status(400).json({ message: 'defaultCommissionValue must be a non-negative number' });
      return;
    }
    if (commissionType && !VALID_TYPES.includes(commissionType as CommissionType)) {
      res.status(400).json({ message: `commissionType must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }

    const broker = await prisma.broker.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(taxRegistrationNumber !== undefined ? { taxRegistrationNumber } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(commissionType !== undefined ? { commissionType } : {}),
        ...(defaultCommissionValue !== undefined ? { defaultCommissionValue } : {}),
        updatedBy: req.user?.id ?? null,
      },
    });
    res.json(broker);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.broker.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Broker not found' });
      return;
    }

    const activeAgentCount = await prisma.brokerAgent.count({
      where: { brokerId: id, deletedAt: null, status: 'ACTIVE' },
    });
    if (activeAgentCount > 0) {
      res.status(409).json({
        message: 'Cannot delete broker with active agents. Deactivate all agents first.',
      });
      return;
    }

    await prisma.broker.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: req.user?.id ?? null },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function listAgents(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const brokerId = Number(req.params.brokerId);
    const agents = await prisma.brokerAgent.findMany({
      where: { brokerId, deletedAt: null },
      orderBy: { fullName: 'asc' },
    });
    res.json(agents);
  } catch (err) {
    next(err);
  }
}

export async function createAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const brokerId = Number(req.params.brokerId);
    const broker = await prisma.broker.findFirst({ where: { id: brokerId, deletedAt: null } });
    if (!broker) {
      res.status(404).json({ message: 'Broker not found' });
      return;
    }
    const { fullName, phone, email, idNumber, notes, commissionType, commissionValueOverride } = req.body as {
      fullName?: string;
      phone?: string;
      email?: string;
      idNumber?: string;
      notes?: string;
      commissionType?: string;
      commissionValueOverride?: number;
    };
    if (!fullName || !phone) {
      res.status(400).json({ message: 'fullName and phone are required' });
      return;
    }
    if (commissionType && !VALID_TYPES.includes(commissionType as CommissionType)) {
      res.status(400).json({ message: `commissionType must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (commissionValueOverride !== undefined && (typeof commissionValueOverride !== 'number' || commissionValueOverride < 0)) {
      res.status(400).json({ message: 'commissionValueOverride must be a non-negative number' });
      return;
    }
    const agent = await prisma.brokerAgent.create({
      data: {
        brokerId,
        fullName,
        phone,
        email: email ?? null,
        idNumber: idNumber ?? null,
        notes: notes ?? null,
        commissionType: (commissionType as CommissionType) ?? null,
        commissionValueOverride: commissionValueOverride ?? null,
        createdBy: req.user?.id ?? null,
        updatedBy: req.user?.id ?? null,
      },
    });
    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
}
