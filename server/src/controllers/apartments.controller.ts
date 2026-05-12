import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApartmentStatus, ApartmentType } from '@hotel/shared';
import { Prisma } from '@prisma/client';

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

  const where: Prisma.ApartmentWhereInput = {};
  if (status) where.status = status as ApartmentStatus;
  if (type) where.type = type as ApartmentType;
  if (search) where.number = { contains: search, mode: 'insensitive' };

  const now = new Date();

  const apartments = await prisma.apartment.findMany({
    where,
    orderBy: { number: 'asc' },
    include: {
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
      currentBooking,
      upcomingBooking,
      activeTicket: a.tickets[0] ?? null,
    };
  });

  res.json(result);
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { number, floor, type } = req.body as { number: string; floor: number; type?: string };

  if (!number || floor === undefined) {
    res.status(400).json({ message: 'number and floor are required' });
    return;
  }
  if (type !== undefined && !VALID_TYPES.includes(type as ApartmentType)) {
    res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }

  try {
    const data: Prisma.ApartmentCreateInput = {
      number: String(number).trim(),
      floor: Number(floor),
    };
    if (type) data.type = type as ApartmentType;

    const apartment = await prisma.apartment.create({ data });
    res.status(201).json(apartment);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'Apartment number already exists' });
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
    const apartment = await prisma.apartment.update({ where: { id }, data });
    res.json(apartment);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        res.status(404).json({ message: 'Apartment not found' });
        return;
      }
      if (err.code === 'P2002') {
        res.status(409).json({ message: 'Apartment number already exists' });
        return;
      }
    }
    throw err;
  }
}
