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
let bookingId: number;
let pendingPaymentId: number;
let paidPaymentId: number;

beforeAll(async () => {
  adminCookie = `token=${signToken({ id: 1, role: 'ADMIN' })}`;
  financeCookie = `token=${signToken({ id: 2, role: 'FINANCE' })}`;

  // Clean slate (reverse dependency order)
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.tenant.deleteMany();
  await testPrisma.apartment.deleteMany();

  // Seed: one apartment, one tenant, one booking, two payments
  const apt = await testPrisma.apartment.create({
    data: { number: 'P101', floor: 1, type: 'STUDIO', status: 'OCCUPIED' },
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

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PAID');
    expect(res.body.method).toBe('CASH');
    expect(res.body.paidAt).not.toBeNull();
    expect(res.body.amount).toBe('1000');

    // Clean up
    await testPrisma.payment.delete({ where: { id: res.body.id } });
  });

  it('INSTALLMENT payment is created with status PENDING and paidAt null', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'INSTALLMENT', amount: 2000 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.method).toBe('INSTALLMENT');
    expect(res.body.paidAt).toBeNull();

    // Clean up
    await testPrisma.payment.delete({ where: { id: res.body.id } });
  });

  it('CARD payment stores referenceNumber', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CARD', amount: 1500, referenceNumber: 'TXN-NEW-001' });

    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toBe('TXN-NEW-001');
    expect(res.body.status).toBe('PAID');
    expect(res.body.paidAt).not.toBeNull();

    // Clean up
    await testPrisma.payment.delete({ where: { id: res.body.id } });
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
    // Create a fresh payment for this test
    const fresh = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 500, status: 'PENDING' },
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${fresh.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    expect(res.body.paidAt).not.toBeNull();
    expect(res.body.id).toBe(fresh.id);

    // Clean up
    await testPrisma.payment.delete({ where: { id: fresh.id } });
  });
});
