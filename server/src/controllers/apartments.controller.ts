import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApartmentStatus, ApartmentType } from '@hotel/shared';
import { Prisma } from '@prisma/client';
import { assertBuildingAccess } from '../lib/assertBuildingAccess';

const VALID_STATUSES = Object.values(ApartmentStatus);
const VALID_TYPES = Object.values(ApartmentType);

export async function list(req: AuthRequest, res: Response): Promise<void> {
  const { status, type, search } = req.query as { status?: string; type?: string; search?: string };

  if (status && !VALID_STATUSES.includes(status as ApartmentStatus)) {
    res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }
  if (type && !VALID_TYPES.includes(type as ApartmentType)) {
    res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }

  const rawBuilding = req.query.buildingId;
  const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
  if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
    res.status(400).json({ message: 'Invalid buildingId' });
    return;
  }

  const where: Prisma.ApartmentWhereInput = {};
  if (status) where.status = status as ApartmentStatus;
  if (type) where.type = type as ApartmentType;
  if (search) where.number = { contains: search, mode: 'insensitive' };
  if (buildingId) where.buildingId = buildingId;

  const now = new Date();

  const apartments = await prisma.apartment.findMany({
    where,
    orderBy: { number: 'asc' },
    include: {
      building: { select: { id: true, name: true, code: true } },
      bookings: {
        where: { checkOut: { gte: now } },
        orderBy: { checkIn: 'asc' },
        take: 2,
        include: {
          tenant: { select: { id: true, fullName: true, phone: true } },
          payments: { select: { method: true, amount: true, status: true, paidAt: true } },
        },
      },
      tickets: {
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        take: 1,
        select: { id: true, status: true, priority: true },
      },
    },
  });

  const result = apartments.map((a) => {
    const currentBooking = a.bookings.find(
      (b) => new Date(b.checkIn) <= now && new Date(b.checkOut) >= now
    ) ?? null;
    const upcomingBooking = a.bookings.find((b) => new Date(b.checkIn) > now) ?? null;

    return {
      id: a.id,
      number: a.number,
      floor: a.floor,
      type: a.type,
      status: a.status,
      building: a.building,
      currentBooking,
      upcomingBooking,
      activeTicket: a.tickets[0] ?? null,
    };
  });

  res.json(result);
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { number, floor, type, buildingId } = req.body as {
    number?: string; floor?: number; type?: string; buildingId?: number;
  };
  if (!number?.trim() || floor === undefined || floor === null) {
    res.status(400).json({ message: 'number and floor are required' });
    return;
  }
  if (!buildingId) {
    res.status(400).json({ message: 'buildingId is required' });
    return;
  }
  const bId = Number(buildingId);
  if (isNaN(bId) || bId <= 0) {
    res.status(400).json({ message: 'Invalid buildingId' });
    return;
  }
  if (!assertBuildingAccess(req, res, bId)) return;
  if (type !== undefined && !VALID_TYPES.includes(type as ApartmentType)) {
    res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }
  const building = await prisma.building.findUnique({ where: { id: bId } });
  if (!building) { res.status(404).json({ message: 'Building not found' }); return; }

  // Compound uniqueness check: apartment number must be unique within the building
  const conflict = await prisma.apartment.findFirst({
    where: { buildingId: bId, number: number.trim() },
  });
  if (conflict) {
    res.status(409).json({ message: 'Apartment number already exists in this building' });
    return;
  }
  const apartment = await prisma.apartment.create({
    data: {
      number: number.trim(),
      floor: Number(floor),
      type: (type as ApartmentType) ?? ApartmentType.STUDIO,
      buildingId: bId,
    },
    include: { building: { select: { id: true, name: true, code: true } } },
  });
  res.status(201).json(apartment);
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const apartment = await prisma.apartment.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { checkIn: 'desc' },
        include: {
          tenant: { select: { id: true, fullName: true, phone: true } },
          payments: { select: { id: true, method: true, amount: true, status: true, paidAt: true, createdAt: true } },
        },
      },
      tickets: {
        orderBy: { createdAt: 'desc' },
        include: { assignedTo: { select: { id: true, name: true } } },
      },
    },
  });

  if (!apartment) {
    res.status(404).json({ message: 'Apartment not found' });
    return;
  }

  const now = new Date();
  const currentBooking = apartment.bookings.find(
    (b) => new Date(b.checkIn) <= now && new Date(b.checkOut) >= now
  ) ?? null;

  res.json({ ...apartment, currentBooking });
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  try {
    await prisma.apartment.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      res.status(404).json({ message: 'Apartment not found' });
      return;
    }
    throw err;
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  const { number, floor, status, type } = req.body as {
    number?: string;
    floor?: number;
    status?: ApartmentStatus;
    type?: ApartmentType;
  };

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }

  const data: Prisma.ApartmentUpdateInput = {};
  if (number !== undefined) data.number = String(number).trim();
  if (floor !== undefined) data.floor = Number(floor);
  if (status !== undefined) data.status = status;
  if (type !== undefined) data.type = type;

  try {
    // Always fetch existing apartment — needed for building access check and uniqueness check
    const existing = await prisma.apartment.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: 'Apartment not found' });
      return;
    }

    const body = req.body as { buildingId?: number };
    const targetBuildingId = (body.buildingId as number | undefined) ?? existing.buildingId;
    if (!assertBuildingAccess(req, res, targetBuildingId)) return;

    // Per-building uniqueness check when number is being changed
    if (number !== undefined) {
      const conflict = await prisma.apartment.findFirst({
        where: { buildingId: existing.buildingId, number: String(number).trim(), NOT: { id } },
      });
      if (conflict) {
        res.status(409).json({ message: 'Apartment number already exists in this building' });
        return;
      }
    }

    const apartment = await prisma.apartment.update({ where: { id }, data });
    res.json(apartment);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        res.status(404).json({ message: 'Apartment not found' });
        return;
      }
      if (err.code === 'P2002') {
        res.status(409).json({ message: 'Apartment number already exists in this building' });
        return;
      }
    }
    throw err;
  }
}

export async function markReady(req: AuthRequest, res: Response): Promise<void> {
  try {
    const aptId = Number(req.params.id);
    if (isNaN(aptId) || aptId <= 0) {
      res.status(400).json({ message: 'Invalid apartment ID' });
      return;
    }

    const apartment = await prisma.apartment.findUnique({ where: { id: aptId } });
    if (!apartment) {
      res.status(404).json({ message: 'Apartment not found' });
      return;
    }
    if (apartment.status !== ApartmentStatus.CLEANING) {
      res.status(400).json({ message: 'Apartment is not in CLEANING status' });
      return;
    }

    const updated = await prisma.apartment.update({
      where: { id: aptId },
      data: { status: ApartmentStatus.AVAILABLE },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
