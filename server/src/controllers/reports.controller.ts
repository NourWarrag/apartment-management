import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function parseDateRange(query: Record<string, unknown>): { start?: Date; end?: Date } {
  const parseDate = (val: unknown, suffix: string): Date | undefined => {
    if (typeof val !== 'string' || !val) return undefined;
    const d = new Date(val + suffix);
    return isNaN(d.getTime()) ? undefined : d;
  };
  return {
    start: parseDate(query.startDate, 'T00:00:00.000Z'),
    end: parseDate(query.endDate, 'T23:59:59.999Z'),
  };
}

function dateFilter(
  start?: Date,
  end?: Date,
): { gte?: Date; lte?: Date } | undefined {
  if (!start && !end) return undefined;
  const f: { gte?: Date; lte?: Date } = {};
  if (start) f.gte = start;
  if (end) f.lte = end;
  return f;
}

// ─── buildingStats ───────────────────────────────────────────────────────────

export async function buildingStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { start, end } = parseDateRange(req.query as Record<string, unknown>);
    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const paidAtWhere = dateFilter(start, end) ?? { gte: defaultStart, lt: defaultEnd };

    const buildings = await prisma.building.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      buildings.map(async (b) => {
        const [totalApartments, occupied, monthlyRevRaw, openTickets] = await Promise.all([
          prisma.apartment.count({ where: { buildingId: b.id } }),
          prisma.apartment.count({ where: { buildingId: b.id, status: 'OCCUPIED' } }),
          prisma.payment.aggregate({
            where: {
              status: 'PAID',
              paidAt: paidAtWhere,
              booking: { apartment: { buildingId: b.id } },
            },
            _sum: { amount: true },
          }),
          prisma.maintenanceTicket.count({
            where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, apartment: { buildingId: b.id } },
          }),
        ]);
        const monthlyRevenue = Number(monthlyRevRaw._sum.amount ?? 0);
        return {
          buildingId: b.id,
          buildingName: b.name,
          buildingCode: b.code,
          totalApartments,
          occupied,
          occupancyRate:
            totalApartments === 0 ? 0 : Math.round((occupied / totalApartments) * 100) / 100,
          monthlyRevenue,
          openTickets,
        };
      })
    );

    const global = rows.reduce(
      (acc, r) => ({
        totalApartments: acc.totalApartments + r.totalApartments,
        occupied: acc.occupied + r.occupied,
        monthlyRevenue: acc.monthlyRevenue + r.monthlyRevenue,
        openTickets: acc.openTickets + r.openTickets,
      }),
      { totalApartments: 0, occupied: 0, monthlyRevenue: 0, openTickets: 0 }
    );

    res.json([
      ...rows,
      {
        buildingId: null,
        buildingName: 'All Buildings',
        buildingCode: null,
        totalApartments: global.totalApartments,
        occupied: global.occupied,
        occupancyRate:
          global.totalApartments === 0
            ? 0
            : Math.round((global.occupied / global.totalApartments) * 100) / 100,
        monthlyRevenue: global.monthlyRevenue,
        openTickets: global.openTickets,
      },
    ]);
  } catch (err) {
    next(err);
  }
}

// ─── revenue ─────────────────────────────────────────────────────────────────

export async function revenue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { start, end } = parseDateRange(req.query as Record<string, unknown>);
    const paidAtWhere = dateFilter(start, end);

    const payments = await prisma.payment.findMany({
      where: { status: 'PAID', ...(paidAtWhere && { paidAt: paidAtWhere }) },
      select: { method: true, amount: true, paidAt: true },
    });

    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);

    const methodMap = new Map<string, { amount: number; count: number }>();
    const monthMap = new Map<string, number>();
    for (const p of payments) {
      const m = methodMap.get(p.method) ?? { amount: 0, count: 0 };
      m.amount += Number(p.amount);
      m.count += 1;
      methodMap.set(p.method, m);
      if (p.paidAt) {
        const mo = p.paidAt.toISOString().slice(0, 7);
        monthMap.set(mo, (monthMap.get(mo) ?? 0) + Number(p.amount));
      }
    }

    res.json({
      totalRevenue,
      byMethod: [...methodMap.entries()].map(([method, v]) => ({ method, ...v })),
      byMonth: [...monthMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── occupancy ───────────────────────────────────────────────────────────────

export async function occupancy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { start, end } = parseDateRange(req.query as Record<string, unknown>);

    // Default: last 12 calendar months
    const rangeEnd = end ?? new Date();
    const rangeStart =
      start ??
      new Date(Date.UTC(rangeEnd.getUTCFullYear() - 1, rangeEnd.getUTCMonth() + 1, 1));

    const total = await prisma.apartment.count();

    // Enumerate calendar months between rangeStart and rangeEnd
    const months: Array<{ label: string; ms: Date; me: Date }> = [];
    let cur = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
    while (
      cur.getUTCFullYear() < rangeEnd.getUTCFullYear() ||
      (cur.getUTCFullYear() === rangeEnd.getUTCFullYear() &&
        cur.getUTCMonth() <= rangeEnd.getUTCMonth())
    ) {
      const ms = new Date(cur);
      const me = new Date(
        Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0, 23, 59, 59, 999)
      );
      months.push({ label: cur.toISOString().slice(0, 7), ms, me });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }

    const result = await Promise.all(
      months.map(async ({ label, ms, me }) => {
        // Count distinct apartments that had an active booking overlapping this month
        const bookings = await prisma.booking.findMany({
          where: { checkIn: { lte: me }, checkOut: { gte: ms } },
          select: { apartmentId: true },
          distinct: ['apartmentId'],
        });
        const occupied = bookings.length;
        return {
          month: label,
          occupied,
          total,
          rate: total === 0 ? 0 : Math.round((occupied / total) * 1000) / 10,
        };
      })
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ─── outstanding ─────────────────────────────────────────────────────────────

export async function outstanding(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { start, end } = parseDateRange(req.query as Record<string, unknown>);
    const createdAtWhere = dateFilter(start, end);

    const payments = await prisma.payment.findMany({
      where: { status: 'PENDING', ...(createdAtWhere && { createdAt: createdAtWhere }) },
      select: {
        amount: true,
        createdAt: true,
        booking: {
          select: {
            apartment: { select: { number: true } },
            tenant: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    const tenantMap = new Map<
      number,
      { tenantName: string; apartmentNumber: string; pendingAmount: number; oldestDue: Date }
    >();
    for (const p of payments) {
      const tid = p.booking.tenant.id;
      const entry = tenantMap.get(tid);
      if (entry) {
        entry.pendingAmount += Number(p.amount);
        if (p.createdAt < entry.oldestDue) entry.oldestDue = p.createdAt;
      } else {
        tenantMap.set(tid, {
          tenantName: p.booking.tenant.fullName,
          apartmentNumber: p.booking.apartment.number,
          pendingAmount: Number(p.amount),
          oldestDue: p.createdAt,
        });
      }
    }

    res.json(
      [...tenantMap.values()]
        .sort((a, b) => b.pendingAmount - a.pendingAmount)
        .map((r) => ({ ...r, oldestDue: r.oldestDue.toISOString() }))
    );
  } catch (err) {
    next(err);
  }
}

// ─── maintenance ─────────────────────────────────────────────────────────────

export async function maintenance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { start, end } = parseDateRange(req.query as Record<string, unknown>);
    const createdAtWhere = dateFilter(start, end);
    const where = createdAtWhere ? { createdAt: createdAtWhere } : undefined;

    const [byStatusRaw, byTypeRaw] = await Promise.all([
      prisma.maintenanceTicket.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.maintenanceTicket.groupBy({ by: ['type'], where, _count: { _all: true } }),
    ]);

    res.json({
      byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count._all })),
      byType: byTypeRaw.map((r) => ({ type: r.type, count: r._count._all })),
    });
  } catch (err) {
    next(err);
  }
}
