import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { Prisma } from '@prisma/client';

export async function list(req: AuthRequest, res: Response): Promise<void> {
  const { search } = req.query as { search?: string };

  const where: Prisma.TenantWhereInput = search
    ? {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { idNumber: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, phone: true, idNumber: true, createdAt: true },
  });

  res.json(tenants);
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { fullName, phone, idNumber } = req.body as {
    fullName?: string;
    phone?: string;
    idNumber?: string;
  };

  if (!fullName?.trim() || !phone?.trim() || !idNumber?.trim()) {
    res.status(400).json({ message: 'fullName, phone, and idNumber are required' });
    return;
  }

  try {
    const tenant = await prisma.tenant.create({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        idNumber: idNumber.trim(),
      },
    });
    res.status(201).json(tenant);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'ID number already registered' });
      return;
    }
    throw err;
  }
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { checkIn: 'desc' },
        include: {
          apartment: { select: { id: true, number: true, floor: true } },
          payments: {
            select: { id: true, method: true, amount: true, status: true, paidAt: true },
          },
        },
      },
    },
  });

  if (!tenant) {
    res.status(404).json({ message: 'Tenant not found' });
    return;
  }

  res.json(tenant);
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const { fullName, phone, idNumber } = req.body as {
    fullName?: string;
    phone?: string;
    idNumber?: string;
  };

  const data: Prisma.TenantUpdateInput = {};
  if (fullName !== undefined) data.fullName = fullName.trim();
  if (phone !== undefined) data.phone = phone.trim();
  if (idNumber !== undefined) data.idNumber = idNumber.trim();

  try {
    const tenant = await prisma.tenant.update({ where: { id }, data });
    res.json(tenant);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        res.status(404).json({ message: 'Tenant not found' });
        return;
      }
      if (err.code === 'P2002') {
        res.status(409).json({ message: 'ID number already registered' });
        return;
      }
    }
    throw err;
  }
}
