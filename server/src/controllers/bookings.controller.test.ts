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
let maintCookie: string;
let financeCookie: string;
let aptId: number;
let tenantId: number;
let unavailableAptId: number;

const futureCheckIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const futureCheckOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const todayCheckIn = new Date().toISOString().split('T')[0];

beforeAll(async () => {
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.maintenanceTicket.deleteMany();
  await testPrisma.apartment.deleteMany({ where: { number: { in: ['BK101', 'BK102'] } } });
  await testPrisma.tenant.deleteMany({ where: { idNumber: 'BK-ID-001' } });
  await testPrisma.user.deleteMany({ where: { email: 'admin-bk@test.com' } });

  const admin = await testPrisma.user.create({
    data: { name: 'Admin BK', email: 'admin-bk@test.com', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN' })}`;
  maintCookie = `token=${signToken({ id: 901, role: 'MAINTENANCE' })}`;
  financeCookie = `token=${signToken({ id: 902, role: 'FINANCE' })}`;

  const apt = await testPrisma.apartment.create({
    data: { number: 'BK101', floor: 1, type: 'STUDIO', status: 'AVAILABLE' },
  });
  aptId = apt.id;

  const unavailableApt = await testPrisma.apartment.create({
    data: { number: 'BK102', floor: 1, type: 'STUDIO', status: 'OCCUPIED' },
  });
  unavailableAptId = unavailableApt.id;

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Test Tenant BK', phone: '0501111111', idNumber: 'BK-ID-001' },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.maintenanceTicket.deleteMany();
  await testPrisma.apartment.deleteMany({ where: { number: { in: ['BK101', 'BK102'] } } });
  await testPrisma.tenant.deleteMany({ where: { idNumber: 'BK-ID-001' } });
  await testPrisma.user.deleteMany({ where: { email: 'admin-bk@test.com' } });
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    apartmentId: aptId,
    tenantId,
    checkIn: futureCheckIn,
    checkOut: futureCheckOut,
    totalAmount: 15000,
    payment: { method: 'CASH', amount: 5000 },
    ...overrides,
  };
}

describe('POST /api/v1/bookings', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/bookings').send(validBody());
    expect(res.status).toBe(401);
  });

  it('returns 403 for MAINTENANCE role', async () => {
    const res = await request(app).post('/api/v1/bookings').set('Cookie', maintCookie).send(validBody());
    expect(res.status).toBe(403);
  });

  it('returns 403 for FINANCE role', async () => {
    const res = await request(app).post('/api/v1/bookings').set('Cookie', financeCookie).send(validBody());
    expect(res.status).toBe(403);
  });

  it('creates booking + payment and sets apartment to RESERVED for future checkIn', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookie)
      .send(validBody());

    try {
      expect(res.status).toBe(201);
      expect(res.body.apartment.id).toBe(aptId);
      expect(res.body.tenant.id).toBe(tenantId);
      expect(typeof res.body.totalAmount).toBe('string');
      expect(res.body.checkIn).toBeDefined();
      expect(res.body.checkOut).toBeDefined();
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0].method).toBe('CASH');
      expect(res.body.payments[0].status).toBe('PAID');

      const apt = await testPrisma.apartment.findUnique({ where: { id: aptId } });
      expect(apt?.status).toBe('RESERVED');
    } finally {
      if (res.body.id) {
        await testPrisma.payment.deleteMany({ where: { bookingId: res.body.id } });
        await testPrisma.booking.delete({ where: { id: res.body.id } });
      }
      await testPrisma.apartment.update({ where: { id: aptId }, data: { status: 'AVAILABLE' } });
    }
  });

  it('sets apartment to OCCUPIED when checkIn is today', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookie)
      .send(validBody({ checkIn: todayCheckIn }));

    try {
      expect(res.status).toBe(201);

      const apt = await testPrisma.apartment.findUnique({ where: { id: aptId } });
      expect(apt?.status).toBe('OCCUPIED');
    } finally {
      if (res.body.id) {
        await testPrisma.payment.deleteMany({ where: { bookingId: res.body.id } });
        await testPrisma.booking.delete({ where: { id: res.body.id } });
      }
      await testPrisma.apartment.update({ where: { id: aptId }, data: { status: 'AVAILABLE' } });
    }
  });

  it('returns 409 when apartment is not AVAILABLE', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookie)
      .send(validBody({ apartmentId: unavailableAptId }));
    expect(res.status).toBe(409);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookie)
      .send({ apartmentId: aptId });
    expect(res.status).toBe(400);
  });

  it('returns 400 when checkOut is before checkIn', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookie)
      .send(validBody({ checkOut: futureCheckIn, checkIn: futureCheckOut }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when apartment does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookie)
      .send(validBody({ apartmentId: 999999 }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when tenant does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookie)
      .send(validBody({ tenantId: 999999 }));
    expect(res.status).toBe(404);
  });
});
