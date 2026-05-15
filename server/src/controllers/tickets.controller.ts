import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest, assertAuthenticated } from '../middleware/auth.middleware';
import { Priority, Role, TicketStatus, TicketType } from '@hotel/shared';
import { Prisma } from '@prisma/client';
import { assertBuildingAccess } from '../lib/assertBuildingAccess';

const VALID_PRIORITIES = Object.values(Priority);
const VALID_NON_CLOSED_STATUSES = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.COMPLETED];
const VALID_TICKET_TYPES = Object.values(TicketType);

const ticketInclude = {
  apartment: { select: { id: true, number: true, floor: true, deletedAt: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

function baseWhere(req: AuthRequest): Prisma.MaintenanceTicketWhereInput {
  const where: Prisma.MaintenanceTicketWhereInput = { NOT: { status: TicketStatus.CLOSED } };
  if (req.user?.role === Role.MAINTENANCE) {
    where.assignedToId = req.user.id;
  }
  return where;
}

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, priority } = req.query as { status?: string; priority?: string };
    const where = baseWhere(req);
    if (status && VALID_NON_CLOSED_STATUSES.includes(status as TicketStatus)) {
      where.status = status as TicketStatus;
    }
    if (priority && VALID_PRIORITIES.includes(priority as Priority)) {
      where.priority = priority as Priority;
    }

    // Unlike status/priority filters (which silently ignore invalid values), type returns 400 on invalid input
    const typeParam = req.query.type as string | undefined;
    if (typeParam !== undefined) {
      if (!VALID_TICKET_TYPES.includes(typeParam as TicketType)) {
        res.status(400).json({ message: 'Invalid ticket type' });
        return;
      }
      where.type = typeParam as TicketType;
    }

    const rawBuilding = req.query.buildingId;
    const buildingId = rawBuilding ? Number(rawBuilding) : undefined;
    if (buildingId !== undefined && (isNaN(buildingId) || buildingId <= 0)) {
      res.status(400).json({ message: 'Invalid buildingId' });
      return;
    }
    if (buildingId) where.apartment = { buildingId };

    const [total, data] = await Promise.all([
      prisma.maintenanceTicket.count({ where }),
      prisma.maintenanceTicket.findMany({ where, orderBy: { createdAt: 'desc' }, include: ticketInclude }),
    ]);
    res.json({ total, data });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { apartmentId, description, priority, assignedToId, type } = req.body as {
      apartmentId?: number;
      description?: string;
      priority?: string;
      assignedToId?: number;
      type?: string;
    };
    if (!apartmentId || description === undefined || description === null || !priority) {
      res.status(400).json({ message: 'apartmentId, description, and priority are required' });
      return;
    }
    if (typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ message: 'description must be a non-empty string' });
      return;
    }
    if (!VALID_PRIORITIES.includes(priority as Priority)) {
      res.status(400).json({ message: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }
    const apartment = await prisma.apartment.findUnique({
      where: { id: Number(apartmentId) },
      select: { buildingId: true },
    });
    if (!apartment) {
      res.status(404).json({ message: 'Apartment not found' });
      return;
    }
    if (!assertBuildingAccess(req, res, apartment.buildingId)) return;
    if (type !== undefined && !VALID_TICKET_TYPES.includes(type as TicketType)) {
      res.status(400).json({ message: 'Invalid ticket type' });
      return;
    }
    if (assignedToId !== undefined) {
      const assignee = await prisma.user.findUnique({ where: { id: Number(assignedToId) } });
      if (!assignee || assignee.role !== Role.MAINTENANCE) {
        res.status(400).json({ message: 'assignedToId must refer to a MAINTENANCE user' });
        return;
      }
    }
    const ticket = await prisma.maintenanceTicket.create({
      data: {
        apartmentId: Number(apartmentId),
        description: description.trim(),
        priority: priority as Priority,
        assignedToId: assignedToId ? Number(assignedToId) : null,
        type: type ? (type as TicketType) : TicketType.MAINTENANCE,
      },
      include: ticketInclude,
    });
    res.status(201).json(ticket);
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  assertAuthenticated(req);
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ message: 'Invalid ticket id' });
      return;
    }

    const { status, notes, priority, assignedToId, apartmentId, type } = req.body as {
      status?: string;
      notes?: string;
      priority?: string;
      assignedToId?: number | null;
      apartmentId?: number;
      type?: string;
    };

    const isMaintenance = req.user?.role === Role.MAINTENANCE;
    const isAdminOrReceptionist = req.user?.role === Role.ADMIN || req.user?.role === Role.RECEPTIONIST;

    if (!isMaintenance && !isAdminOrReceptionist) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    // Field restriction check against request body only — no DB read needed
    if (isMaintenance && (priority !== undefined || assignedToId !== undefined || apartmentId !== undefined)) {
      res.status(403).json({ message: 'MAINTENANCE staff can only update status and notes' });
      return;
    }

    // Validate enum values before any DB operation
    if (status !== undefined && !VALID_NON_CLOSED_STATUSES.includes(status as TicketStatus)) {
      res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_NON_CLOSED_STATUSES.join(', ')}` });
      return;
    }
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as Priority)) {
      res.status(400).json({ message: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }

    // Validate assignedToId refers to a MAINTENANCE user before writing
    if (assignedToId != null) {
      const assignee = await prisma.user.findUnique({ where: { id: Number(assignedToId) } });
      if (!assignee || assignee.role !== Role.MAINTENANCE) {
        res.status(400).json({ message: 'assignedToId must refer to a MAINTENANCE user' });
        return;
      }
    }

    // Validate apartmentId exists when being updated
    if (apartmentId !== undefined) {
      const apt = await prisma.apartment.findUnique({ where: { id: Number(apartmentId) } });
      if (!apt) {
        res.status(404).json({ message: 'Apartment not found' });
        return;
      }
    }

    // Build scalar update payload (compatible with both updateMany and update)
    const data: {
      status?: TicketStatus;
      resolvedAt?: Date | null;
      notes?: string | null;
      priority?: Priority;
      assignedToId?: number | null;
      apartmentId?: number;
      type?: TicketType;
    } = {};
    if (status !== undefined) {
      data.status = status as TicketStatus;
      data.resolvedAt = status === TicketStatus.COMPLETED ? new Date() : null;
    }
    if (notes !== undefined) data.notes = notes.trim() === '' ? null : notes.trim();
    if (!isMaintenance) {
      if (priority !== undefined) data.priority = priority as Priority;
      if (assignedToId !== undefined) data.assignedToId = assignedToId === null ? null : Number(assignedToId);
      if (apartmentId !== undefined) data.apartmentId = Number(apartmentId);
      if (type !== undefined) {
        if (!VALID_TICKET_TYPES.includes(type as TicketType)) {
          res.status(400).json({ message: 'Invalid ticket type' });
          return;
        }
        data.type = type as TicketType;
      }
    }

    if (isMaintenance) {
      // updateMany with compound where atomically checks ownership + applies update (no TOCTOU).
      // Prisma's update only accepts unique where-fields, so updateMany is the correct primitive here.
      const result = await prisma.maintenanceTicket.updateMany({
        where: { id, assignedToId: req.user.id },
        data,
      });
      if (result.count === 0) {
        // Distinguish 404 (ticket absent) from 403 (ticket exists but not owned by this user)
        const exists = await prisma.maintenanceTicket.count({ where: { id } });
        res.status(exists === 0 ? 404 : 403).json({
          message: exists === 0 ? 'Ticket not found' : 'You can only update tickets assigned to you',
        });
        return;
      }
      // updateMany doesn't return the record — fetch it for the response
      const updated = await prisma.maintenanceTicket.findUnique({ where: { id }, include: ticketInclude });
      if (!updated) {
        res.status(404).json({ message: 'Ticket not found' });
        return;
      }
      res.json(updated);
    } else {
      // ADMIN/RECEPTIONIST: update by unique id, surface P2025 as 404
      try {
        const updated = await prisma.maintenanceTicket.update({
          where: { id },
          data,
          include: ticketInclude,
        });
        res.json(updated);
      } catch (innerErr: any) {
        if (innerErr?.code === 'P2025') {
          res.status(404).json({ message: 'Ticket not found' });
          return;
        }
        next(innerErr); return;
      }
    }
  } catch (err) { next(err); }
}

export async function stats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const where = baseWhere(req);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [open, inProgress, completed, resolved24h, completedWithTime] = await Promise.all([
      prisma.maintenanceTicket.count({ where: { ...where, status: TicketStatus.OPEN } }),
      prisma.maintenanceTicket.count({ where: { ...where, status: TicketStatus.IN_PROGRESS } }),
      prisma.maintenanceTicket.count({ where: { ...where, status: TicketStatus.COMPLETED } }),
      prisma.maintenanceTicket.count({
        where: { ...where, status: TicketStatus.COMPLETED, resolvedAt: { gte: since24h } },
      }),
      prisma.maintenanceTicket.findMany({
        where: { ...where, status: TicketStatus.COMPLETED, resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);
    let avgResolutionHours: number | null = null;
    if (completedWithTime.length > 0) {
      const totalHours = completedWithTime.reduce((sum, t) => {
        return sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3600000;
      }, 0);
      avgResolutionHours = Math.round((totalHours / completedWithTime.length) * 10) / 10;
    }
    res.json({ open, inProgress, completed, resolved24h, avgResolutionHours });
  } catch (err) { next(err); }
}
