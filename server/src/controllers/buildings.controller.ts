import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { handlePrismaError } from '../lib/handlePrismaError';

const buildingSelect = { id: true, name: true, code: true, address: true, createdAt: true } as const;

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const buildings = await prisma.building.findMany({
      select: buildingSelect,
      orderBy: { name: 'asc' },
    });
    res.json(buildings);
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid building id' }); return; }
    const building = await prisma.building.findUnique({ where: { id }, select: buildingSelect });
    if (!building) { res.status(404).json({ message: 'Building not found' }); return; }
    res.json(building);
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, code, address } = req.body as { name?: string; code?: string; address?: string };
    if (!name?.trim() || !code?.trim() || address === undefined) {
      res.status(400).json({ message: 'name, code, and address are required' });
      return;
    }
    const existing = await prisma.building.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (existing) { res.status(409).json({ message: 'A building with this code already exists' }); return; }
    const building = await prisma.building.create({
      data: { name: name.trim(), code: code.trim().toUpperCase(), address: address.trim() },
      select: buildingSelect,
    });
    res.status(201).json(building);
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid building id' }); return; }
  const { name, code, address } = req.body as { name?: string; code?: string; address?: string };
  if (!name?.trim() && !code?.trim() && address === undefined) {
    res.status(400).json({ message: 'At least one field required' });
    return;
  }
  const data: { name?: string; code?: string; address?: string } = {};
  if (name?.trim()) data.name = name.trim();
  if (code?.trim()) {
    const upper = code.trim().toUpperCase();
    const conflict = await prisma.building.findFirst({ where: { code: upper, NOT: { id } } });
    if (conflict) { res.status(409).json({ message: 'A building with this code already exists' }); return; }
    data.code = upper;
  }
  if (address !== undefined) data.address = address.trim();
  try {
    const building = await prisma.building.update({ where: { id }, data, select: buildingSelect });
    res.json(building);
  } catch (err) {
    handlePrismaError(err, res, next, {
      P2025: { status: 404, message: 'Building not found' },
    });
    return;
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) { res.status(400).json({ message: 'Invalid building id' }); return; }
  const aptCount = await prisma.apartment.count({ where: { buildingId: id } });
  if (aptCount > 0) {
    res.status(409).json({ message: 'Cannot delete a building that has apartments' });
    return;
  }
  try {
    await prisma.building.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    handlePrismaError(err, res, next, {
      P2025: { status: 404, message: 'Building not found' },
    });
    return;
  }
}
