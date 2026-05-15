import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function buildingStats(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

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
              paidAt: { gte: startOfMonth, lt: startOfNextMonth },
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
          occupancyRate: totalApartments === 0 ? 0 : Math.round((occupied / totalApartments) * 100) / 100,
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
        occupancyRate: global.totalApartments === 0 ? 0 : Math.round((global.occupied / global.totalApartments) * 100) / 100,
        monthlyRevenue: global.monthlyRevenue,
        openTickets: global.openTickets,
      },
    ]);
  } catch (err) { next(err); }
}
