import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PaymentMethod, PaymentStatus } from '@hotel/shared';
import { Prisma } from '@prisma/client';

const VALID_METHODS = Object.values(PaymentMethod);
const PAGE_SIZE = 20;

const bookingInclude = {
  booking: {
    include: {
      tenant: { select: { id: true, fullName: true, phone: true } },
      apartment: { select: { id: true, number: true, floor: true } },
    },
  },
} as const;

export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, method, search, page } = req.query as {
      status?: string;
      method?: string;
      search?: string;
      page?: string;
    };

    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const skip = (pageNum - 1) * PAGE_SIZE;

    const where: Prisma.PaymentWhereInput = {};
    if (status && Object.values(PaymentStatus).includes(status as PaymentStatus)) {
      where.status = status as PaymentStatus;
    }
    if (method && VALID_METHODS.includes(method as PaymentMethod)) {
      where.method = method as PaymentMethod;
    }
    if (search) {
      where.OR = [
        { booking: { tenant: { fullName: { contains: search, mode: 'insensitive' } } } },
        { booking: { apartment: { number: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [total, data] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: bookingInclude,
      }),
    ]);

    res.json({ total, page: pageNum, pageSize: PAGE_SIZE, data });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { bookingId, method, amount, referenceNumber } = req.body as {
      bookingId?: number;
      method?: string;
      amount?: number;
      referenceNumber?: string;
    };

    if (!bookingId || !method || amount === undefined || amount === null) {
      res.status(400).json({ message: 'bookingId, method, and amount are required' });
      return;
    }
    if (!VALID_METHODS.includes(method as PaymentMethod)) {
      res.status(400).json({ message: `Invalid method. Must be one of: ${VALID_METHODS.join(', ')}` });
      return;
    }
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ message: 'amount must be a positive number' });
      return;
    }

    const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }

    const now = new Date();
    const isPaidOnCreate = method === PaymentMethod.CASH || method === PaymentMethod.CARD;

    const payment = await prisma.payment.create({
      data: {
        bookingId: Number(bookingId),
        method: method as PaymentMethod,
        amount,
        referenceNumber: referenceNumber?.trim() || null,
        status: isPaidOnCreate ? PaymentStatus.PAID : PaymentStatus.PENDING,
        paidAt: isPaidOnCreate ? now : null,
      },
      include: bookingInclude,
    });

    res.status(201).json(payment);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function markPaid(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ message: 'Invalid payment id' });
      return;
    }

    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      res.status(404).json({ message: 'Payment not found' });
      return;
    }
    if (payment.status === PaymentStatus.PAID) {
      res.status(409).json({ message: 'Payment is already marked as paid' });
      return;
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.PAID, paidAt: new Date() },
      include: bookingInclude,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
