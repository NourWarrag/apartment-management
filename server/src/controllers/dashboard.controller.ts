import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function stats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawBuilding = req.query.buildingId;
    const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
    if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
      res.status(400).json({ message: 'Invalid buildingId' });
      return;
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const aptWhere = buildingId ? { buildingId } : {};
    const paymentBuildingFilter = buildingId ? { booking: { apartment: { buildingId } } } : {};
    const ticketBuildingFilter = buildingId ? { apartment: { buildingId } } : {};

    const [aptGroups, revenueGroups, pendingInstallments, openTickets] = await Promise.all([
      prisma.apartment.groupBy({ by: ['status'], where: aptWhere, _count: { _all: true } }),
      prisma.payment.groupBy({
        by: ['method'],
        where: { status: 'PAID', paidAt: { gte: startOfToday, lt: startOfTomorrow }, ...paymentBuildingFilter },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: { method: 'INSTALLMENT', status: 'PENDING', ...paymentBuildingFilter } }),
      prisma.maintenanceTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, ...ticketBuildingFilter } }),
    ]);

    const aptCounts = { total: 0, occupied: 0, available: 0, maintenance: 0 };
    for (const g of aptGroups) {
      aptCounts.total += g._count._all;
      if (g.status === 'OCCUPIED') aptCounts.occupied = g._count._all;
      if (g.status === 'AVAILABLE') aptCounts.available = g._count._all;
      if (g.status === 'MAINTENANCE') aptCounts.maintenance = g._count._all;
    }

    const rev = { cash: 0, card: 0, installment: 0 };
    for (const g of revenueGroups) {
      const amount = Number(g._sum.amount ?? 0);
      if (g.method === 'CASH') rev.cash = amount;
      if (g.method === 'CARD') rev.card = amount;
      if (g.method === 'INSTALLMENT') rev.installment = amount;
    }
    const revenueTotal = rev.cash + rev.card + rev.installment;

    res.json({
      apartments: aptCounts,
      revenue: { total: revenueTotal, cash: rev.cash, card: rev.card, installment: rev.installment },
      pendingInstallments,
      openTickets,
    });
  } catch (err) { next(err); }
}

export async function activity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawBuilding = req.query.buildingId;
    const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
    if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
      res.status(400).json({ message: 'Invalid buildingId' });
      return;
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const bookingBuildingFilter = buildingId ? { apartment: { buildingId } } : {};
    const paymentBuildingFilter = buildingId ? { booking: { apartment: { buildingId } } } : {};
    const ticketBuildingFilter = buildingId ? { apartment: { buildingId } } : {};

    const [checkIns, checkOuts, payments, tickets] = await Promise.all([
      prisma.booking.findMany({
        where: { checkIn: { gte: startOfToday, lt: startOfTomorrow }, ...bookingBuildingFilter },
        include: { tenant: { select: { fullName: true } }, apartment: { select: { number: true } } },
        take: 20,
      }),
      prisma.booking.findMany({
        where: { checkOut: { gte: startOfToday, lt: startOfTomorrow }, ...bookingBuildingFilter },
        include: { tenant: { select: { fullName: true } }, apartment: { select: { number: true } } },
        take: 20,
      }),
      prisma.payment.findMany({
        where: { status: 'PAID', paidAt: { gte: startOfToday, lt: startOfTomorrow }, ...paymentBuildingFilter },
        orderBy: { paidAt: 'desc' },
        take: 20,
        include: { booking: { include: { tenant: { select: { fullName: true } } } } },
      }),
      prisma.maintenanceTicket.findMany({
        where: { createdAt: { gte: startOfToday, lt: startOfTomorrow }, ...ticketBuildingFilter },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { apartment: { select: { number: true } } },
      }),
    ]);

    type Event = { type: string; label: string; timestamp: Date };
    const events: Event[] = [];

    for (const b of checkIns) {
      events.push({ type: 'CHECK_IN', label: `${b.tenant.fullName} checked in to apt ${b.apartment.number}`, timestamp: b.checkIn });
    }
    for (const b of checkOuts) {
      events.push({ type: 'CHECK_OUT', label: `${b.tenant.fullName} checked out of apt ${b.apartment.number}`, timestamp: b.checkOut });
    }
    for (const p of payments) {
      if (p.paidAt) {
        events.push({ type: 'PAYMENT', label: `Payment of AED ${Number(p.amount).toFixed(0)} received from ${p.booking.tenant.fullName}`, timestamp: p.paidAt });
      }
    }
    for (const t of tickets) {
      const desc = t.description.length > 60 ? t.description.slice(0, 57) + '...' : t.description;
      events.push({ type: 'TICKET', label: `Ticket opened for apt ${t.apartment.number}: ${desc}`, timestamp: t.createdAt });
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const top20 = events.slice(0, 20).map((e) => ({ ...e, timestamp: e.timestamp.toISOString() }));

    res.json({ events: top20 });
  } catch (err) { next(err); }
}

export async function revenueTrend(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { days: daysParam } = req.query as { days?: string };
    if (daysParam !== '7' && daysParam !== '30') {
      res.status(400).json({ message: 'days must be 7 or 30' });
      return;
    }

    const rawBuilding = req.query.buildingId;
    const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
    if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
      res.status(400).json({ message: 'Invalid buildingId' });
      return;
    }

    const days = Number(daysParam);

    // Start date: (days - 1) days ago, midnight UTC
    const now = new Date();
    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(0, 0, 0, 0);

    const paymentBuildingFilter = buildingId ? { booking: { apartment: { buildingId } } } : {};

    const payments = await prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: startDate }, ...paymentBuildingFilter },
      select: { paidAt: true, amount: true },
    });

    // Aggregate by UTC date string
    const revenueMap: Record<string, number> = {};
    for (const p of payments) {
      if (!p.paidAt) continue;
      const dateStr = p.paidAt.toISOString().split('T')[0];
      revenueMap[dateStr] = (revenueMap[dateStr] ?? 0) + Number(p.amount);
    }

    // Build result array oldest → newest, filling zeros
    const result: { date: string; revenue: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      result.push({ date: dateStr, revenue: revenueMap[dateStr] ?? 0 });
    }

    res.json(result);
  } catch (err) { next(err); }
}
