import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { Role } from '@hotel/shared';
import { hashPassword } from '../lib/password';
import { Prisma, PrismaClient } from '@prisma/client';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  assignedBuildingId: true,
  assignedBuilding: { select: { id: true, name: true, code: true } },
  createdAt: true,
  deletedAt: true,
} as const;

// Use a bare PrismaClient to bypass the soft-delete extension when we need
// to see or modify deleted records.
function getRawClient() {
  return new PrismaClient();
}

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

export async function list(_req: AuthRequest, res: Response): Promise<void> {
  const raw = getRawClient();
  try {
    const users = await raw.user.findMany({
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } finally {
    await raw.$disconnect();
  }
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  const raw = getRawClient();
  try {
    const user = await raw.user.findUnique({ where: { id }, select: userSelect });
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(user);
  } finally {
    await raw.$disconnect();
  }
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { name, email, password, role, assignedBuildingId } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    assignedBuildingId?: number | null;
  };

  if (!name?.trim() || !email?.trim() || !password || !role) {
    res.status(400).json({ message: 'name, email, password, and role are required' });
    return;
  }

  const validRoles = Object.values(Role) as string[];
  if (!validRoles.includes(role)) {
    res.status(400).json({ message: 'Invalid role' });
    return;
  }

  if (role === Role.ADMIN && req.user?.role !== Role.SUPER_ADMIN) {
    res.status(403).json({ message: 'Only SUPER_ADMIN can create ADMIN users' });
    return;
  }

  if (role === Role.SUPER_ADMIN && req.user?.role !== Role.SUPER_ADMIN) {
    res.status(403).json({ message: 'Only SUPER_ADMIN can create SUPER_ADMIN users' });
    return;
  }

  if (role === Role.BUILDING_ADMIN && !assignedBuildingId) {
    res.status(400).json({ message: 'assignedBuildingId required for BUILDING_ADMIN' });
    return;
  }

  if (role !== Role.BUILDING_ADMIN && assignedBuildingId) {
    res.status(400).json({ message: 'assignedBuildingId only allowed for BUILDING_ADMIN' });
    return;
  }

  const hashedPassword = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role: role as Role,
        assignedBuildingId: assignedBuildingId ?? null,
      },
      select: userSelect,
    });
    res.status(201).json(user);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }
    throw err;
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }

  const { name, email, role, assignedBuildingId } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    assignedBuildingId?: number | null;
  };

  if (!name && !email && !role && assignedBuildingId === undefined) {
    res.status(400).json({ message: 'At least one field required' });
    return;
  }

  if (role) {
    const validRoles = Object.values(Role) as string[];
    if (!validRoles.includes(role)) {
      res.status(400).json({ message: 'Invalid role' });
      return;
    }
    if (role === Role.ADMIN && req.user?.role !== Role.SUPER_ADMIN) {
      res.status(403).json({ message: 'Only SUPER_ADMIN can assign ADMIN role' });
      return;
    }
  }

  const raw = getRawClient();
  let existing: { role: Role; assignedBuildingId: number | null } | null;
  try {
    existing = await raw.user.findUnique({ where: { id }, select: { role: true, assignedBuildingId: true } });
  } finally {
    await raw.$disconnect();
  }
  if (!existing) { res.status(404).json({ message: 'User not found' }); return; }

  const effectiveRole = (role as Role | undefined) ?? existing.role;
  if (effectiveRole === Role.BUILDING_ADMIN) {
    const effectiveBuildingId = assignedBuildingId !== undefined ? assignedBuildingId : existing.assignedBuildingId;
    if (!effectiveBuildingId) {
      res.status(400).json({ message: 'assignedBuildingId required for BUILDING_ADMIN' });
      return;
    }
  }

  const data: Record<string, unknown> = {};
  if (name) data.name = name.trim();
  if (email) data.email = email.trim().toLowerCase();
  if (role) data.role = role;
  if (assignedBuildingId !== undefined) data.assignedBuildingId = assignedBuildingId;
  if (role && role !== Role.BUILDING_ADMIN) data.assignedBuildingId = null;

  try {
    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    res.json(user);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }
    throw err;
  }
}

export async function deactivate(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  if (req.user?.id === id) {
    res.status(403).json({ message: 'Cannot deactivate your own account' });
    return;
  }
  const raw = getRawClient();
  try {
    const existing = await raw.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) { res.status(404).json({ message: 'User not found' }); return; }
  } finally {
    await raw.$disconnect();
  }
  // prisma.user.delete is intercepted by the soft-delete extension → sets deletedAt
  await prisma.user.delete({ where: { id } });
  res.json({ message: 'User deactivated' });
}

export async function reactivate(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  const raw = getRawClient();
  try {
    const existing = await raw.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) { res.status(404).json({ message: 'User not found' }); return; }
    // Use the raw client to bypass the soft-delete extension and clear deletedAt
    await raw.user.update({ where: { id }, data: { deletedAt: null } });
  } finally {
    await raw.$disconnect();
  }
  res.json({ message: 'User reactivated' });
}
