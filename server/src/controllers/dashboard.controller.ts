import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function stats(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [aptGroups, revenueGroups, pendingInstallments, openTickets] = await Promise.all([
      prisma.apartment.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.payment.groupBy({
        by: ['method'],
        where: { status: 'PAID', paidAt: { gte: startOfToday, lt: startOfTomorrow } },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: { method: 'INSTALLMENT', status: 'PENDING' } }),
      prisma.maintenanceTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
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
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function activity(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [checkIns, checkOuts, payments, tickets] = await Promise.all([
      prisma.booking.findMany({
        where: { checkIn: { gte: startOfToday, lt: startOfTomorrow } },
        include: { tenant: { select: { fullName: true } }, apartment: { select: { number: true } } },
        take: 20,
      }),
      prisma.booking.findMany({
        where: { checkOut: { gte: startOfToday, lt: startOfTomorrow } },
        include: { tenant: { select: { fullName: true } }, apartment: { select: { number: true } } },
        take: 20,
      }),
      prisma.payment.findMany({
        where: { status: 'PAID', paidAt: { gte: startOfToday, lt: startOfTomorrow } },
        orderBy: { paidAt: 'desc' },
        take: 20,
        include: { booking: { include: { tenant: { select: { fullName: true } } } } },
      }),
      prisma.maintenanceTicket.findMany({
        where: { createdAt: { gte: startOfToday, lt: startOfTomorrow } },
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
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
