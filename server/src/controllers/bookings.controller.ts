import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { PaymentMethod, PaymentStatus, ApartmentStatus, DepositStatus } from '@hotel/shared';
import { Prisma } from '@prisma/client';
import { PostingService } from '../services/accounting/posting.service';
import { isAccountingError } from '../services/accounting/posting.errors';

const posting = new PostingService(prisma as any);

const VALID_METHODS = Object.values(PaymentMethod);

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { apartmentId, tenantId, checkIn, checkOut, totalAmount, payment, deposit, taxCodeId: rawTaxCodeId } = req.body as {
      apartmentId?: number;
      tenantId?: number;
      checkIn?: string;
      checkOut?: string;
      totalAmount?: number;
      payment?: { method?: string; amount?: number; referenceNumber?: string };
      deposit?: { amount?: number };
      taxCodeId?: number;
    };
    const taxCodeId = typeof rawTaxCodeId === 'number' ? rawTaxCodeId : null;

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
    if (deposit !== undefined && (typeof deposit.amount !== 'number' || deposit.amount <= 0)) {
      res.status(400).json({ message: 'deposit.amount must be a positive number' });
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

    const depositData =
      deposit?.amount
        ? {
            depositAmount: deposit.amount,
            depositStatus: DepositStatus.HELD,
            depositCollectedAt: new Date(),
          }
        : {};

    try {
      const booking = await prisma.$transaction(async (tx) => {
        const newBooking = await tx.booking.create({
          data: {
            apartmentId: Number(apartmentId),
            tenantId: Number(tenantId),
            checkIn: checkInDate,
            checkOut: checkOutDate,
            totalAmount,
            taxCodeId,
            ...depositData,
          },
        });

        const createdPayment = await tx.payment.create({
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

        const hasMapping = (await tx.accountMapping.count({ where: { key: 'REVENUE_DEFAULT' } })) > 0;
        if (hasMapping) {
          await posting.postFromBookingCreated(newBooking.id, req.user!.id, tx as unknown as Prisma.TransactionClient);
          await posting.postFromPayment(createdPayment.id, req.user!.id, tx as unknown as Prisma.TransactionClient);
          if (newBooking.depositAmount && Number(newBooking.depositAmount) > 0 && newBooking.depositStatus === 'HELD') {
            await posting.postFromDepositTransition(newBooking.id, 'NONE', 'HELD', req.user!.id, tx as unknown as Prisma.TransactionClient);
          }
        }

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
    } catch (err) {
      if (isAccountingError(err)) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function collectDeposit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const bookingId = Number(req.params.id);
    if (isNaN(bookingId) || bookingId <= 0) {
      res.status(400).json({ message: 'Invalid booking ID' });
      return;
    }

    const { amount } = req.body as { amount?: number };
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ message: 'amount must be a positive number' });
      return;
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }
    if (booking.checkedOutAt !== null) {
      res.status(409).json({ message: 'Cannot collect deposit on a checked-out booking' });
      return;
    }
    if (booking.depositStatus !== DepositStatus.NONE) {
      res.status(409).json({ message: 'Deposit already collected' });
      return;
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.booking.update({
          where: { id: bookingId },
          data: {
            depositAmount: amount,
            depositStatus: DepositStatus.HELD,
            depositCollectedAt: new Date(),
          },
        });
        const hasMapping = (await tx.accountMapping.count({ where: { key: 'REVENUE_DEFAULT' } })) > 0;
        if (hasMapping) {
          await posting.postFromDepositTransition(u.id, 'NONE', 'HELD', req.user!.id, tx as unknown as Prisma.TransactionClient);
        }
        return u;
      });
      res.json(updated);
    } catch (err) {
      if (isAccountingError(err)) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function checkout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const bookingId = Number(req.params.id);
    if (isNaN(bookingId) || bookingId <= 0) {
      res.status(400).json({ message: 'Invalid booking ID' });
      return;
    }

    const { depositRefundAmount } = req.body as { depositRefundAmount?: number };

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { apartment: true },
    });

    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }
    if (booking.checkedOutAt !== null) {
      res.status(409).json({ message: 'Booking already checked out' });
      return;
    }
    if (booking.apartment.status !== ApartmentStatus.OCCUPIED) {
      res.status(400).json({ message: 'Apartment is not in OCCUPIED status' });
      return;
    }

    if (booking.depositStatus === DepositStatus.HELD) {
      if (depositRefundAmount === undefined || depositRefundAmount === null) {
        res.status(400).json({ message: 'depositRefundAmount is required when deposit is held' });
        return;
      }
      if (typeof depositRefundAmount !== 'number' || depositRefundAmount < 0) {
        res.status(400).json({ message: 'depositRefundAmount must be a non-negative number' });
        return;
      }
      if (depositRefundAmount > Number(booking.depositAmount)) {
        res.status(400).json({ message: 'Refund amount cannot exceed deposit amount' });
        return;
      }
    }

    const newDepositStatus =
      booking.depositStatus === DepositStatus.HELD
        ? depositRefundAmount === Number(booking.depositAmount)
          ? DepositStatus.RELEASED
          : DepositStatus.FORFEITED
        : booking.depositStatus;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.booking.update({
          where: { id: bookingId },
          data: {
            checkedOutAt: new Date(),
            ...(booking.depositStatus === DepositStatus.HELD
              ? { depositStatus: newDepositStatus, depositRefundAmount }
              : {}),
          },
        });

        await tx.apartment.update({
          where: { id: booking.apartmentId },
          data: { status: ApartmentStatus.CLEANING },
        });

        const hasMapping = (await tx.accountMapping.count({ where: { key: 'REVENUE_DEFAULT' } })) > 0;
        if (hasMapping && booking.depositStatus === DepositStatus.HELD && (newDepositStatus === DepositStatus.RELEASED || newDepositStatus === DepositStatus.FORFEITED)) {
          await posting.postFromDepositTransition(booking.id, 'HELD', newDepositStatus, req.user!.id, tx as unknown as Prisma.TransactionClient);
        }

        return updated;
      });

      res.json(result);
    } catch (err) {
      if (isAccountingError(err)) {
        res.status(400).json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const pageRaw = parseInt((req.query.page as string) ?? '1');
    const limitRaw = parseInt((req.query.limit as string) ?? '20');
    const page = isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 20 : Math.min(limitRaw, 100);

    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const buildingId = req.query.buildingId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    if (from && isNaN(new Date(from).getTime())) {
      res.status(400).json({ message: 'Invalid date format' });
      return;
    }
    if (to && isNaN(new Date(to).getTime())) {
      res.status(400).json({ message: 'Invalid date format' });
      return;
    }

    const now = new Date();
    const bid = buildingId ? parseInt(buildingId) : NaN;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      where.OR = [
        { tenant: { fullName: { contains: search, mode: 'insensitive' } } },
        { apartment: { number: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (!isNaN(bid)) {
      where.apartment = { buildingId: bid };
    }
    if (from) where.checkIn = { ...(where.checkIn ?? {}), gte: new Date(from) };
    if (to) where.checkIn = { ...(where.checkIn ?? {}), lte: new Date(to) };

    if (status === 'ACTIVE') {
      where.checkIn = { ...(where.checkIn ?? {}), lte: now };
      where.checkedOutAt = null;
    } else if (status === 'UPCOMING') {
      where.checkIn = { ...(where.checkIn ?? {}), gt: now };
      where.checkedOutAt = null;
    } else if (status === 'CHECKED_OUT') {
      where.checkedOutAt = { not: null };
    }

    const [total, data] = await prisma.$transaction([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        select: {
          id: true,
          checkIn: true,
          checkOut: true,
          totalAmount: true,
          depositStatus: true,
          checkedOutAt: true,
          createdAt: true,
          tenant: { select: { id: true, fullName: true, phone: true } },
          apartment: {
            select: {
              id: true,
              number: true,
              floor: true,
              type: true,
              building: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ data, total, page, limit });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ message: 'Invalid booking ID' });
      return;
    }
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, fullName: true, phone: true, idNumber: true } },
        apartment: {
          select: {
            id: true,
            number: true,
            floor: true,
            type: true,
            building: { select: { name: true } },
          },
        },
        payments: {
          select: {
            id: true,
            method: true,
            amount: true,
            status: true,
            paidAt: true,
            referenceNumber: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }
    res.json(booking);
  } catch (err) { next(err); }
}
