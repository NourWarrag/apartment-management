import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { Role, StaffStatus, FeatureFlag } from '@hotel/shared';
import { isFeatureEnabled } from '../features';
import { hashPassword } from '../lib/password';
import { PrismaClient } from '@prisma/client';
import { handlePrismaError } from '../lib/handlePrismaError';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  staffStatus: true,
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

export async function maintenanceStaff(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'MAINTENANCE' },
      select: { id: true, name: true, staffStatus: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (err) { next(err); }
}

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const raw = getRawClient();
  try {
    const users = await raw.user.findMany({
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  } finally {
    await raw.$disconnect();
  }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  const raw = getRawClient();
  try {
    const user = await raw.user.findUnique({ where: { id }, select: userSelect });
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(user);
  } catch (err) {
    next(err);
  } finally {
    await raw.$disconnect();
  }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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
    handlePrismaError(err, res, next, {
      P2002: { status: 409, message: 'Email already in use' },
    });
    return;
  }
}

interface UserUpdateBody {
  name?: string;
  email?: string;
  role?: string;
  assignedBuildingId?: number | null;
}

type UserCheckResult = { ok: true } | { ok: false; status: number; message: string };

function validateUserUpdateInput(
  body: UserUpdateBody,
  staffStatus: string | undefined,
  rawStaffStatus: unknown
): UserCheckResult {
  const { name, email, role, assignedBuildingId } = body;
  if (!name && !email && !role && assignedBuildingId === undefined && staffStatus === undefined && rawStaffStatus === undefined) {
    return { ok: false, status: 400, message: 'At least one field required' };
  }
  const VALID_STAFF_STATUSES = Object.values(StaffStatus) as string[];
  if (staffStatus !== undefined && !VALID_STAFF_STATUSES.includes(staffStatus)) {
    return { ok: false, status: 400, message: 'Invalid staff status' };
  }
  return { ok: true };
}

function authorizeRoleAssignment(role: string | undefined, actorRole: string | undefined): UserCheckResult {
  if (!role) return { ok: true };
  const validRoles = Object.values(Role) as string[];
  if (!validRoles.includes(role)) {
    return { ok: false, status: 400, message: 'Invalid role' };
  }
  if (role === Role.ADMIN && actorRole !== Role.SUPER_ADMIN) {
    return { ok: false, status: 403, message: 'Only SUPER_ADMIN can assign ADMIN role' };
  }
  if (role === Role.SUPER_ADMIN && actorRole !== Role.SUPER_ADMIN) {
    return { ok: false, status: 403, message: 'Only SUPER_ADMIN can assign SUPER_ADMIN role' };
  }
  return { ok: true };
}

function buildUserUpdatePayload(body: UserUpdateBody, staffStatus: string | undefined): Record<string, unknown> {
  const { name, email, role, assignedBuildingId } = body;
  const data: Record<string, unknown> = {};
  if (name) data.name = name.trim();
  if (email) data.email = email.trim().toLowerCase();
  if (role) data.role = role;
  if (assignedBuildingId !== undefined) data.assignedBuildingId = assignedBuildingId;
  if (role && role !== Role.BUILDING_ADMIN) data.assignedBuildingId = null;
  if (staffStatus !== undefined) data.staffStatus = staffStatus;
  return data;
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }

  const body = req.body as UserUpdateBody;
  const staffStatus = isFeatureEnabled(FeatureFlag.STAFF)
    ? (req.body.staffStatus as string | undefined)
    : undefined;

  const inputCheck = validateUserUpdateInput(body, staffStatus, req.body.staffStatus);
  if (!inputCheck.ok) {
    res.status(inputCheck.status).json({ message: inputCheck.message });
    return;
  }

  // staffStatus DB-precondition runs before role validation to preserve original error precedence
  if (staffStatus !== undefined) {
    const raw = getRawClient();
    let targetUser: { role: string } | null;
    try {
      targetUser = await raw.user.findUnique({ where: { id }, select: { role: true } });
    } finally {
      await raw.$disconnect();
    }
    if (!targetUser || targetUser.role !== Role.MAINTENANCE) {
      res.status(400).json({ message: 'Staff status can only be set on MAINTENANCE role users' });
      return;
    }
  }

  const roleCheck = authorizeRoleAssignment(body.role, req.user?.role);
  if (!roleCheck.ok) {
    res.status(roleCheck.status).json({ message: roleCheck.message });
    return;
  }

  const raw = getRawClient();
  let existing: { role: string; assignedBuildingId: number | null } | null;
  try {
    existing = await raw.user.findUnique({ where: { id }, select: { role: true, assignedBuildingId: true } });
  } finally {
    await raw.$disconnect();
  }
  if (!existing) { res.status(404).json({ message: 'User not found' }); return; }

  const effectiveRole = (body.role as Role | undefined) ?? existing.role;
  if (effectiveRole === Role.BUILDING_ADMIN) {
    const effectiveBuildingId = body.assignedBuildingId !== undefined ? body.assignedBuildingId : existing.assignedBuildingId;
    if (!effectiveBuildingId) {
      res.status(400).json({ message: 'assignedBuildingId required for BUILDING_ADMIN' });
      return;
    }
  }

  const data = buildUserUpdatePayload(body, staffStatus);

  try {
    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    res.json(user);
  } catch (err) {
    handlePrismaError(err, res, next, {
      P2002: { status: 409, message: 'Email already in use' },
    });
    return;
  }
}

export async function deactivate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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
  } catch (err) {
    next(err); return;
  } finally {
    await raw.$disconnect();
  }
  try {
    // prisma.user.delete is intercepted by the soft-delete extension → sets deletedAt
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User deactivated' });
  } catch (err) { next(err); }
}

export async function reactivate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: 'Invalid user id' }); return; }
  const raw = getRawClient();
  try {
    const existing = await raw.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) { res.status(404).json({ message: 'User not found' }); return; }
    // Use the raw client to bypass the soft-delete extension and clear deletedAt
    await raw.user.update({ where: { id }, data: { deletedAt: null } });
  } catch (err) {
    next(err); return;
  } finally {
    await raw.$disconnect();
  }
  res.json({ message: 'User reactivated' });
}
