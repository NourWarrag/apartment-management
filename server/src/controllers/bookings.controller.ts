import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PaymentMethod, PaymentStatus, ApartmentStatus } from '@hotel/shared';

const VALID_METHODS = Object.values(PaymentMethod);

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { apartmentId, tenantId, checkIn, checkOut, totalAmount, payment } = req.body as {
      apartmentId?: number;
      tenantId?: number;
      checkIn?: string;
      checkOut?: string;
      totalAmount?: number;
      payment?: { method?: string; amount?: number; referenceNumber?: string };
    };

    if (!apartmentId || !tenantId || !checkIn || !checkOut || totalAmount === undefined || totalAmount === null) {
      res.status(400).json({ message: 'apartmentId, tenantId, checkIn, checkOut, and totalAmount are required' });
      return;
    }
    if (!payment || !payment.method || payment.amount === undefined || payment.amount === null) {
      res.status(400).json({ message: 'payment.method and payment.amount are required' });
      return;
    }
    if (!VALID_METHODS.includes(payment.method as PaymentMethod)) {
      res.status(400).json({ message: `Invalid payment method. Must be one of: ${VALID_METHODS.join(', ')}` });
      return;
    }
    if (typeof payment.amount !== 'number' || payment.amount <= 0) {
      res.status(400).json({ message: 'payment.amount must be a positive number' });
      return;
    }
    if (typeof totalAmount !== 'number' || totalAmount <= 0) {
      res.status(400).json({ message: 'totalAmount must be a positive number' });
      return;
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      res.status(400).json({ message: 'Invalid date format for checkIn or checkOut' });
      return;
    }
    if (checkOutDate <= checkInDate) {
      res.status(400).json({ message: 'checkOut must be after checkIn' });
      return;
    }

    const apartment = await prisma.apartment.findUnique({ where: { id: Number(apartmentId) } });
    if (!apartment) {
      res.status(404).json({ message: 'Apartment not found' });
      return;
    }
    if (apartment.status !== ApartmentStatus.AVAILABLE) {
      res.status(409).json({ message: 'Apartment is not available' });
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
    if (!tenant) {
      res.status(404).json({ message: 'Tenant not found' });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const checkInStr = checkIn.slice(0, 10);
    const newStatus = checkInStr <= todayStr ? ApartmentStatus.OCCUPIED : ApartmentStatus.RESERVED;

    const booking = await prisma.$transaction(async (tx) => {
      const newBooking = await tx.booking.create({
        data: {
          apartmentId: Number(apartmentId),
          tenantId: Number(tenantId),
          checkIn: checkInDate,
          checkOut: checkOutDate,
          totalAmount,
        },
      });

      await tx.payment.create({
        data: {
          bookingId: newBooking.id,
          method: payment.method as PaymentMethod,
          amount: payment.amount as number,
          referenceNumber: payment.referenceNumber?.trim() || null,
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      await tx.apartment.update({
        where: { id: Number(apartmentId) },
        data: { status: newStatus },
      });

      return tx.booking.findUnique({
        where: { id: newBooking.id },
        include: {
          apartment: { select: { id: true, number: true, floor: true } },
          tenant: { select: { id: true, fullName: true, phone: true } },
          payments: { select: { id: true, method: true, amount: true, status: true } },
        },
      });
    });

    res.status(201).json(booking);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
