import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { KycStatus, TenantTier } from '@hotel/shared';
import { Prisma } from '@prisma/client';
import { handlePrismaError } from '../lib/handlePrismaError';

const VALID_KYC = Object.values(KycStatus);
const VALID_TIERS = Object.values(TenantTier);

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
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

    const now = new Date();

    const tenants = await prisma.tenant.findMany({
      where,
      orderBy: { fullName: 'asc' },
      include: {
        bookings: {
          where: { checkIn: { lte: now }, checkOut: { gte: now } },
          take: 1,
          orderBy: { checkIn: 'desc' },
          include: {
            apartment: { select: { id: true, number: true, type: true } },
          },
        },
      },
    });

    const result = tenants.map(({ bookings, ...t }) => ({
      ...t,
      currentBooking: bookings[0]
        ? {
            id: bookings[0].id,
            checkIn: bookings[0].checkIn,
            checkOut: bookings[0].checkOut,
            apartment: bookings[0].apartment,
          }
        : null,
    }));

    res.json(result);
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const { fullName, phone, idNumber, kycStatus, tier, notes } = req.body as {
    fullName?: string;
    phone?: string;
    idNumber?: string;
    kycStatus?: string;
    tier?: string;
    notes?: string;
  };

  if (!fullName?.trim() || !phone?.trim() || !idNumber?.trim()) {
    res.status(400).json({ message: 'fullName, phone, and idNumber are required' });
    return;
  }
  if (kycStatus !== undefined && !VALID_KYC.includes(kycStatus as KycStatus)) {
    res.status(400).json({ message: `Invalid kycStatus. Must be one of: ${VALID_KYC.join(', ')}` });
    return;
  }
  if (tier !== undefined && !VALID_TIERS.includes(tier as TenantTier)) {
    res.status(400).json({ message: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` });
    return;
  }

  const data: Prisma.TenantCreateInput = {
    fullName: fullName.trim(),
    phone: phone.trim(),
    idNumber: idNumber.trim(),
  };
  if (kycStatus) data.kycStatus = kycStatus as KycStatus;
  if (tier) data.tier = tier as TenantTier;
  if (notes !== undefined) data.notes = notes.trim() || null;

  try {
    const tenant = await prisma.tenant.create({ data });
    res.status(201).json(tenant);
  } catch (err) {
    handlePrismaError(err, res, next, {
      P2002: { status: 409, message: 'ID number already registered' },
    });
    return;
  }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
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
            apartment: { select: { id: true, number: true, floor: true, type: true } },
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
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  try {
    await prisma.tenant.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    handlePrismaError(err, res, next, {
      P2025: { status: 404, message: 'Tenant not found' },
    });
    return;
  }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const { fullName, phone, idNumber, kycStatus, tier, notes } = req.body as {
    fullName?: string;
    phone?: string;
    idNumber?: string;
    kycStatus?: string;
    tier?: string;
    notes?: string;
  };

  if (kycStatus !== undefined && !VALID_KYC.includes(kycStatus as KycStatus)) {
    res.status(400).json({ message: `Invalid kycStatus. Must be one of: ${VALID_KYC.join(', ')}` });
    return;
  }
  if (tier !== undefined && !VALID_TIERS.includes(tier as TenantTier)) {
    res.status(400).json({ message: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` });
    return;
  }

  const data: Prisma.TenantUpdateInput = {};
  if (fullName !== undefined) data.fullName = fullName.trim();
  if (phone !== undefined) data.phone = phone.trim();
  if (idNumber !== undefined) data.idNumber = idNumber.trim();
  if (kycStatus !== undefined) data.kycStatus = kycStatus as KycStatus;
  if (tier !== undefined) data.tier = tier as TenantTier;
  if (notes !== undefined) data.notes = notes.trim() || null;

  try {
    const tenant = await prisma.tenant.update({ where: { id }, data });
    res.json(tenant);
  } catch (err) {
    handlePrismaError(err, res, next, {
      P2025: { status: 404, message: 'Tenant not found' },
      P2002: { status: 409, message: 'ID number already registered' },
    });
    return;
  }
}
