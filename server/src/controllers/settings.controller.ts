import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const ALLOWED_FIELDS = new Set(['companyName', 'currency', 'timezone', 'phone', 'email', 'address']);

export async function getSettings(_req: AuthRequest, res: Response): Promise<void> {
  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  res.json(settings);
}

export async function updateSettings(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(key) && typeof body[key] === 'string') {
      data[key] = body[key];
    }
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ message: 'No valid fields provided' });
    return;
  }
  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  res.json(settings);
}
