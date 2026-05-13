import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function maintenanceStaff(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'MAINTENANCE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
}
