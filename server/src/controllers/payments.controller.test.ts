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
let financeCookie: string;
let receptionistCookie: string;
let bookingId: number;
let pendingPaymentId: number;
let paidPaymentId: number;

beforeAll(async () => {
  // Clean slate (reverse dependency order)
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.tenant.deleteMany();
  await testPrisma.apartment.deleteMany();
  await testPrisma.user.deleteMany({
    where: { email: { in: ['admin@pay.test', 'receptionist@pay.test'] } },
  });

  // Create real users so the audit middleware FK (createdBy/updatedBy) doesn't fail.
  // Finance and Maintenance only read or are forbidden before any write, so they
  // don't need real DB rows — arbitrary IDs in the JWT are fine for them.
  const adminUser = await testPrisma.user.create({
    data: { name: 'Pay Admin', email: 'admin@pay.test', password: 'x', role: 'ADMIN' },
  });
  const receptionistUser = await testPrisma.user.create({
    data: { name: 'Pay Receptionist', email: 'receptionist@pay.test', password: 'x', role: 'RECEPTIONIST' },
  });

  adminCookie = `token=${signToken({ id: adminUser.id, role: 'ADMIN', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: 9001, role: 'FINANCE', assignedBuildingId: null })}`;
  receptionistCookie = `token=${signToken({ id: receptionistUser.id, role: 'RECEPTIONIST', assignedBuildingId: null })}`;

  // Seed: one apartment, one tenant, one booking, two payments
  const apt = await testPrisma.apartment.create({
    data: { number: 'P101', floor: 1, type: 'STUDIO', status: 'OCCUPIED', buildingId: 1 },
  });
  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Test Tenant', phone: '+971500000001', idNumber: 'TEST-001' },
  });
  const booking = await testPrisma.booking.create({
    data: {
      apartmentId: apt.id,
      tenantId: tenant.id,
      checkIn: new Date('2026-04-01'),
      checkOut: new Date('2026-07-01'),
      totalAmount: 10000,
    },
  });
  bookingId = booking.id;

  const pending = await testPrisma.payment.create({
    data: { bookingId: booking.id, method: 'INSTALLMENT', amount: 3000, status: 'PENDING' },
  });
  pendingPaymentId = pending.id;

  const paid = await testPrisma.payment.create({
    data: {
      bookingId: booking.id,
      method: 'CARD',
      amount: 5000,
      status: 'PAID',
      paidAt: new Date(),
      referenceNumber: 'TXN-TEST-001',
    },
  });
  paidPaymentId = paid.id;
});

afterAll(async () => {
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.tenant.deleteMany();
  await testPrisma.apartment.deleteMany();
  await testPrisma.user.deleteMany({
    where: { email: { in: ['admin@pay.test', 'receptionist@pay.test'] } },
  });
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/payments', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/payments');
    expect(res.status).toBe(401);
  });

  it('returns correct response shape', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      page: 1,
      pageSize: 20,
      data: expect.any(Array),
    });
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('each item has booking with tenant and apartment', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Cookie', adminCookie);

    for (const item of res.body.data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('method');
      expect(item).toHaveProperty('amount');
      expect(item).toHaveProperty('status');
      expect(item.booking).toHaveProperty('tenant');
      expect(item.booking).toHaveProperty('apartment');
      expect(typeof item.booking.tenant.fullName).toBe('string');
      expect(typeof item.booking.apartment.number).toBe('string');
    }
  });

  it('filters by status=PENDING', async () => {
    const res = await request(app)
      .get('/api/v1/payments?status=PENDING')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    for (const item of res.body.data) {
      expect(item.status).toBe('PENDING');
    }
  });

  it('filters by method=CARD', async () => {
    const res = await request(app)
      .get('/api/v1/payments?method=CARD')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    for (const item of res.body.data) {
      expect(item.method).toBe('CARD');
    }
  });

  it('filters by search (tenant name)', async () => {
    const res = await request(app)
      .get('/api/v1/payments?search=Test+Tenant')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    for (const item of res.body.data) {
      expect(item.booking.tenant.fullName.toLowerCase()).toContain('test tenant'.toLowerCase());
    }
  });

  it('returns page 2 with empty data when total <= 20', async () => {
    const res = await request(app)
      .get('/api/v1/payments?page=2')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.data).toEqual([]);
    expect(typeof res.body.total).toBe('number');
  });

  it('FINANCE role can list payments', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Cookie', financeCookie);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/payments', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/payments').send({});
    expect(res.status).toBe(401);
  });

  it('returns 403 for FINANCE role', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', financeCookie)
      .send({ bookingId, method: 'CASH', amount: 1000 });
    expect(res.status).toBe(403);
  });

  it('RECEPTIONIST role can create a payment', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', receptionistCookie)
      .send({ bookingId, method: 'CASH', amount: 750 });

    try {
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAID');
    } finally {
      if (res.body.id) await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
    }
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ method: 'CASH' }); // missing bookingId and amount
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is not positive', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CASH', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid method value', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'BITCOIN', amount: 500 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent bookingId', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId: 999999, method: 'CASH', amount: 500 });
    expect(res.status).toBe(404);
  });

  it('CASH payment is created with status PAID and paidAt set', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CASH', amount: 1000 });

    try {
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAID');
      expect(res.body.method).toBe('CASH');
      expect(res.body.paidAt).not.toBeNull();
      expect(res.body.amount).toBe('1000');
    } finally {
      if (res.body.id) await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
    }
  });

  it('INSTALLMENT payment is created with status PENDING and paidAt null', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'INSTALLMENT', amount: 2000 });

    try {
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.method).toBe('INSTALLMENT');
      expect(res.body.paidAt).toBeNull();
    } finally {
      if (res.body.id) await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
    }
  });

  it('CARD payment stores referenceNumber', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CARD', amount: 1500, referenceNumber: 'TXN-NEW-001' });

    try {
      expect(res.status).toBe(201);
      expect(res.body.referenceNumber).toBe('TXN-NEW-001');
      expect(res.body.status).toBe('PAID');
      expect(res.body.paidAt).not.toBeNull();
    } finally {
      if (res.body.id) await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
    }
  });
});

describe('PATCH /api/v1/payments/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).patch(`/api/v1/payments/${pendingPaymentId}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for FINANCE role', async () => {
    const res = await request(app)
      .patch(`/api/v1/payments/${pendingPaymentId}`)
      .set('Cookie', financeCookie);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent payment', async () => {
    const res = await request(app)
      .patch('/api/v1/payments/999999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('returns 409 when payment is already PAID', async () => {
    const res = await request(app)
      .patch(`/api/v1/payments/${paidPaymentId}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
  });

  it('marks PENDING payment as PAID with paidAt set', async () => {
    const fresh = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 500, status: 'PENDING' },
    });

    try {
      const res = await request(app)
        .patch(`/api/v1/payments/${fresh.id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PAID');
      expect(res.body.paidAt).not.toBeNull();
      expect(res.body.id).toBe(fresh.id);
    } finally {
      await testPrisma.payment.delete({ where: { id: fresh.id } }).catch(() => {});
    }
  });
});

describe('GET /api/v1/payments/stats', () => {
  // Global seed: 1 PAID CARD (5000, paidAt=now), 1 PENDING INSTALLMENT (3000)
  // Expected: monthlyRevenue=5000, outstandingBalance=3000, activePlans=0

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/payments/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 for MAINTENANCE role', async () => {
    const maintenanceCookie = `token=${signToken({ id: 9002, role: 'MAINTENANCE', assignedBuildingId: null })}`;
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', maintenanceCookie);
    expect(res.status).toBe(403);
  });

  it('monthlyRevenue includes only PAID payments within the current month', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.monthlyRevenue).toBe(5000);
  });

  it('outstandingBalance counts only PENDING payments', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.outstandingBalance).toBe(3000);
  });

  it('activePlans is 0 when no PAID installment payments exist', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.activePlans).toBe(0);
  });

  it('activePlans counts bookings with partial paid installment sum', async () => {
    const partial = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 4000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/stats')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.activePlans).toBeGreaterThanOrEqual(1);
    } finally {
      await testPrisma.payment.delete({ where: { id: partial.id } });
    }
  });

  it('collectionRate = 100.0 when no pending payments exist', async () => {
    const allPayments = await testPrisma.payment.findMany();
    await testPrisma.payment.deleteMany();
    const sole = await testPrisma.payment.create({
      data: { bookingId, method: 'CASH', amount: 2000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/stats')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.collectionRate).toBe(100.0);
    } finally {
      await testPrisma.payment.delete({ where: { id: sole.id } });
      for (const p of allPayments) {
        await testPrisma.payment.create({
          data: {
            bookingId: p.bookingId,
            method: p.method,
            amount: p.amount,
            status: p.status,
            referenceNumber: p.referenceNumber,
            paidAt: p.paidAt,
          },
        });
      }
    }
  });
});

describe('GET /api/v1/payments/installment-plans', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/payments/installment-plans');
    expect(res.status).toBe(401);
  });

  it('returns empty array when no PAID installment payments exist', async () => {
    const res = await request(app)
      .get('/api/v1/payments/installment-plans')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns active plans (paidAmount < totalAmount)', async () => {
    const partial = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 4000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/installment-plans')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const plan = res.body[0];
      expect(plan).toHaveProperty('bookingId');
      expect(plan).toHaveProperty('tenantName');
      expect(plan).toHaveProperty('apartmentNumber');
      expect(plan).toHaveProperty('totalAmount');
      expect(plan).toHaveProperty('paidAmount');
      expect(plan).toHaveProperty('checkIn');
      expect(plan).toHaveProperty('checkOut');
      expect(Number(plan.paidAmount)).toBeLessThan(Number(plan.totalAmount));
    } finally {
      await testPrisma.payment.delete({ where: { id: partial.id } });
    }
  });

  it('excludes fully paid installment bookings', async () => {
    const full = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 10000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/installment-plans')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      const plan = res.body.find((p: { bookingId: number }) => p.bookingId === bookingId);
      expect(plan).toBeUndefined();
    } finally {
      await testPrisma.payment.delete({ where: { id: full.id } });
    }
  });
});
