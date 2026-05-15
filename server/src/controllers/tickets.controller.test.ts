import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminCookie: string;
let receptionistCookie: string;
let financeCookie: string;
let maintCookie: string;       // maintUser1 — owns tickets
let otherMaintCookie: string;  // maintUser2 — owns nothing

let aptId: number;
let openTicketId: number;
let closedTicketId: number;
let maintUser1Id: number;
let maintUser2Id: number;

beforeAll(async () => {
  // Clean in dependency order
  await testPrisma.maintenanceTicket.deleteMany();
  await testPrisma.apartment.deleteMany();
  await testPrisma.user.deleteMany({
    where: { email: { in: ['admin-tk@test.com', 'maint1-tk@test.com', 'maint2-tk@test.com'] } },
  });

  // Seed users
  const adminUser = await testPrisma.user.create({
    data: { name: 'Admin TK', email: 'admin-tk@test.com', password: 'x', role: 'ADMIN' },
  });
  const maint1 = await testPrisma.user.create({
    data: { name: 'Alex Rivera', email: 'maint1-tk@test.com', password: 'x', role: 'MAINTENANCE' },
  });
  const maint2 = await testPrisma.user.create({
    data: { name: 'Bob Smith', email: 'maint2-tk@test.com', password: 'x', role: 'MAINTENANCE' },
  });
  maintUser1Id = maint1.id;
  maintUser2Id = maint2.id;

  // Seed apartment
  const apt = await testPrisma.apartment.create({
    data: { number: 'TK101', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: 1 },
  });
  aptId = apt.id;

  // Seed tickets
  const open = await testPrisma.maintenanceTicket.create({
    data: { apartmentId: apt.id, description: 'Leaky faucet', priority: 'HIGH', status: 'OPEN', assignedToId: maint1.id },
  });
  openTicketId = open.id;

  await testPrisma.maintenanceTicket.create({
    data: { apartmentId: apt.id, description: 'AC broken', priority: 'MEDIUM', status: 'IN_PROGRESS', assignedToId: maint1.id },
  });

  await testPrisma.maintenanceTicket.create({
    data: {
      apartmentId: apt.id,
      description: 'Fixed lamp',
      priority: 'LOW',
      status: 'COMPLETED',
      assignedToId: maint1.id,
      resolvedAt: new Date(),
    },
  });

  const closed = await testPrisma.maintenanceTicket.create({
    data: { apartmentId: apt.id, description: 'Old issue', priority: 'LOW', status: 'CLOSED', assignedToId: maint1.id },
  });
  closedTicketId = closed.id;

  // Ticket assigned to maint2 (not maint1)
  await testPrisma.maintenanceTicket.create({
    data: { apartmentId: apt.id, description: 'Paint peeling', priority: 'LOW', status: 'OPEN', assignedToId: maint2.id },
  });

  // Cookies — ids match seeded users so assignedToId checks work
  adminCookie = `token=${signToken({ id: adminUser.id, role: 'ADMIN', assignedBuildingId: null })}`;
  receptionistCookie = `token=${signToken({ id: 997, role: 'RECEPTIONIST', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: 998, role: 'FINANCE', assignedBuildingId: null })}`;
  maintCookie = `token=${signToken({ id: maint1.id, role: 'MAINTENANCE', assignedBuildingId: null })}`;
  otherMaintCookie = `token=${signToken({ id: maint2.id, role: 'MAINTENANCE', assignedBuildingId: null })}`;
});

afterAll(async () => {
  await testPrisma.maintenanceTicket.deleteMany();
  await testPrisma.apartment.deleteMany();
  await testPrisma.user.deleteMany({
    where: { email: { in: ['admin-tk@test.com', 'maint1-tk@test.com', 'maint2-tk@test.com'] } },
  });
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

// ─── GET /api/v1/tickets ────────────────────────────────────────────────────

describe('GET /api/v1/tickets', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/tickets');
    expect(res.status).toBe(401);
  });

  it('MAINTENANCE user only sees their own assigned tickets', async () => {
    const res = await request(app).get('/api/v1/tickets').set('Cookie', maintCookie);
    expect(res.status).toBe(200);
    const ids: (number | null)[] = res.body.data.map((t: any) => t.assignedTo?.id ?? null);
    expect(ids.every(id => id === maintUser1Id)).toBe(true);
  });

  it('CLOSED tickets are excluded even without status filter', async () => {
    const res = await request(app).get('/api/v1/tickets').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const statuses: string[] = res.body.data.map((t: any) => t.status);
    expect(statuses).not.toContain('CLOSED');
  });

  it('status=OPEN filter returns only OPEN tickets', async () => {
    const res = await request(app).get('/api/v1/tickets?status=OPEN').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const statuses: string[] = res.body.data.map((t: any) => t.status);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every(s => s === 'OPEN')).toBe(true);
  });
});

// ─── POST /api/v1/tickets ───────────────────────────────────────────────────

describe('POST /api/v1/tickets', () => {
  it('returns 403 for MAINTENANCE and FINANCE roles', async () => {
    const body = { apartmentId: aptId, description: 'Test', priority: 'LOW' };
    const [r1, r2] = await Promise.all([
      request(app).post('/api/v1/tickets').set('Cookie', maintCookie).send(body),
      request(app).post('/api/v1/tickets').set('Cookie', financeCookie).send(body),
    ]);
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
  });

  it('creates ticket with apartment and assignee in response', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Cookie', adminCookie)
      .send({ apartmentId: aptId, description: 'Water leak', priority: 'HIGH', assignedToId: maintUser1Id });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe('Water leak');
    expect(res.body.priority).toBe('HIGH');
    expect(res.body.status).toBe('OPEN');
    expect(res.body.apartment.id).toBe(aptId);
    expect(res.body.assignedTo.id).toBe(maintUser1Id);
    // cleanup
    await testPrisma.maintenanceTicket.delete({ where: { id: res.body.id } });
  });

  it('missing description returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Cookie', adminCookie)
      .send({ apartmentId: aptId, priority: 'LOW' });
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/v1/tickets/:id ──────────────────────────────────────────────

describe('PATCH /api/v1/tickets/:id', () => {
  it('MAINTENANCE can update status and notes on own ticket', async () => {
    const res = await request(app)
      .patch(`/api/v1/tickets/${openTicketId}`)
      .set('Cookie', maintCookie)
      .send({ status: 'IN_PROGRESS', notes: 'Started work' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body.notes).toBe('Started work');
    // restore
    await testPrisma.maintenanceTicket.update({ where: { id: openTicketId }, data: { status: 'OPEN', notes: null } });
  });

  it('MAINTENANCE gets 403 when updating another user ticket', async () => {
    const res = await request(app)
      .patch(`/api/v1/tickets/${openTicketId}`)
      .set('Cookie', otherMaintCookie)
      .send({ notes: 'Hack' });
    expect(res.status).toBe(403);
  });

  it('ADMIN can update any ticket including assignedToId', async () => {
    const res = await request(app)
      .patch(`/api/v1/tickets/${openTicketId}`)
      .set('Cookie', adminCookie)
      .send({ priority: 'LOW', assignedToId: maintUser2Id });
    expect(res.status).toBe(200);
    expect(res.body.priority).toBe('LOW');
    expect(res.body.assignedTo.id).toBe(maintUser2Id);
    // restore
    await testPrisma.maintenanceTicket.update({
      where: { id: openTicketId },
      data: { priority: 'HIGH', assignedToId: maintUser1Id },
    });
  });

  it('COMPLETED sets resolvedAt; reverting to OPEN clears it', async () => {
    const r1 = await request(app)
      .patch(`/api/v1/tickets/${openTicketId}`)
      .set('Cookie', adminCookie)
      .send({ status: 'COMPLETED' });
    expect(r1.status).toBe(200);
    expect(r1.body.resolvedAt).not.toBeNull();

    const r2 = await request(app)
      .patch(`/api/v1/tickets/${openTicketId}`)
      .set('Cookie', adminCookie)
      .send({ status: 'OPEN' });
    expect(r2.status).toBe(200);
    expect(r2.body.resolvedAt).toBeNull();
  });

  it('returns 404 for non-existent ticket', async () => {
    const res = await request(app)
      .patch('/api/v1/tickets/999999')
      .set('Cookie', adminCookie)
      .send({ notes: 'test' });
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/v1/tickets/stats ──────────────────────────────────────────────

describe('GET /api/v1/tickets/stats', () => {
  it('returns correct shape', async () => {
    const res = await request(app).get('/api/v1/tickets/stats').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      open: expect.any(Number),
      inProgress: expect.any(Number),
      completed: expect.any(Number),
      resolved24h: expect.any(Number),
      // avgResolutionHours can be number or null
    });
    expect('avgResolutionHours' in res.body).toBe(true);
  });
});

// ─── TicketType — CLEANING tickets ──────────────────────────────────────────

describe('TicketType — CLEANING tickets', () => {
  let adminToken: string;
  let apartment: { id: number };
  let building: { id: number };
  let createdTicketId: number;

  beforeAll(async () => {
    const admin = await testPrisma.user.create({
      data: {
        name: 'Type Admin',
        email: `type-admin-${Date.now()}@test.com`,
        password: 'x',
        role: 'ADMIN',
      },
    });
    adminToken = signToken({ id: admin.id, role: admin.role, assignedBuildingId: null });

    building = await testPrisma.building.create({
      data: { name: 'Type Building', code: `TYPE-${Date.now()}`, address: '1 Type St' },
    });
    apartment = await testPrisma.apartment.create({
      data: { number: 'TYP-001', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: building.id },
    });
  });

  afterAll(async () => {
    if (createdTicketId) {
      await testPrisma.maintenanceTicket.deleteMany({ where: { id: createdTicketId } });
    }
    await testPrisma.apartment.delete({ where: { id: apartment.id } });
    await testPrisma.building.delete({ where: { id: building.id } });
    await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'type-admin-%'`;
  });

  it('POST /tickets with type CLEANING creates a cleaning ticket', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Cookie', `token=${adminToken}`)
      .send({
        apartmentId: apartment.id,
        description: 'Clean room after checkout',
        priority: 'LOW',
        type: 'CLEANING',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('type', 'CLEANING');
    createdTicketId = res.body.id;
  });

  it('GET /tickets?type=CLEANING returns only cleaning tickets', async () => {
    const res = await request(app)
      .get('/api/v1/tickets?type=CLEANING')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach((t: any) => {
      expect(t.type).toBe('CLEANING');
    });
  });

  it('POST /tickets with invalid type returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Cookie', `token=${adminToken}`)
      .send({
        apartmentId: apartment.id,
        description: 'Test',
        priority: 'LOW',
        type: 'INVALID',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid ticket type');
  });

  it('MAINTENANCE staff cannot change ticket type (silently ignored)', async () => {
    // Create a maintenance user and a cleaning ticket, then try to change type
    const maintenanceUser = await testPrisma.user.create({
      data: {
        name: 'Maint User',
        email: `maint-type-${Date.now()}@test.com`,
        password: 'x',
        role: 'MAINTENANCE',
      },
    });
    const cleaningTicket = await testPrisma.maintenanceTicket.create({
      data: {
        apartmentId: apartment.id,
        description: 'Test cleaning',
        priority: 'LOW',
        type: 'CLEANING',
        assignedToId: maintenanceUser.id,
      },
    });

    const maintToken = signToken({ id: maintenanceUser.id, role: maintenanceUser.role, assignedBuildingId: null });
    const res = await request(app)
      .patch(`/api/v1/tickets/${cleaningTicket.id}`)
      .set('Cookie', `token=${maintToken}`)
      .send({ status: 'IN_PROGRESS', type: 'MAINTENANCE' });

    expect(res.status).toBe(200);
    // type must remain CLEANING — not changed by MAINTENANCE user
    expect(res.body).toHaveProperty('type', 'CLEANING');

    // Cleanup
    await testPrisma.maintenanceTicket.delete({ where: { id: cleaningTicket.id } });
    await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'maint-type-%'`;
  });
});

// ─── GET /api/v1/users/maintenance-staff ────────────────────────────────────

describe('GET /api/v1/users/maintenance-staff', () => {
  it('returns only MAINTENANCE users with id and name', async () => {
    const res = await request(app)
      .get('/api/v1/users/maintenance-staff')
      .set('Cookie', receptionistCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    for (const u of res.body) {
      expect(u).toHaveProperty('id');
      expect(u).toHaveProperty('name');
      expect(u).not.toHaveProperty('role');
    }
  });

  it('returns 403 for MAINTENANCE and FINANCE roles', async () => {
    const [r1, r2] = await Promise.all([
      request(app).get('/api/v1/users/maintenance-staff').set('Cookie', maintCookie),
      request(app).get('/api/v1/users/maintenance-staff').set('Cookie', financeCookie),
    ]);
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
  });
});
