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
let aptId: number;
let tenantId: number;
let bookingId: number;

beforeAll(async () => {
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.apartment.deleteMany({ where: { number: 'DASH-RT-101' } });
  await testPrisma.tenant.deleteMany({ where: { idNumber: 'DASH-RT-ID-001' } });
  await testPrisma.user.deleteMany({ where: { email: 'admin-dash@test.com' } });

  const admin = await testPrisma.user.create({
    data: { name: 'Admin Dash', email: 'admin-dash@test.com', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN' })}`;

  const apt = await testPrisma.apartment.create({
    data: { number: 'DASH-RT-101', floor: 1, type: 'STUDIO', status: 'OCCUPIED' },
  });
  aptId = apt.id;

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Dash Test Tenant', phone: '0501234500', idNumber: 'DASH-RT-ID-001' },
  });
  tenantId = tenant.id;

  const booking = await testPrisma.booking.create({
    data: {
      apartmentId: aptId,
      tenantId,
      checkIn: new Date(),
      checkOut: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      totalAmount: 10000,
    },
  });
  bookingId = booking.id;

  // Create 2 PAID payments today and 1 PENDING (should not be counted)
  const today = new Date();
  await testPrisma.payment.createMany({
    data: [
      { bookingId, method: 'CASH', amount: 3000, status: 'PAID', paidAt: today },
      { bookingId, method: 'CARD', amount: 2000, status: 'PAID', paidAt: today },
      { bookingId, method: 'INSTALLMENT', amount: 1000, status: 'PENDING', paidAt: null },
    ],
  });
});

afterAll(async () => {
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.apartment.deleteMany({ where: { number: 'DASH-RT-101' } });
  await testPrisma.tenant.deleteMany({ where: { idNumber: 'DASH-RT-ID-001' } });
  await testPrisma.user.deleteMany({ where: { email: 'admin-dash@test.com' } });
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/dashboard/revenue-trend', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/dashboard/revenue-trend?days=7');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid days param', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=invalid')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('returns 400 when days param is missing', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('returns 7 entries for days=7', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=7')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toHaveProperty('date');
    expect(res.body[0]).toHaveProperty('revenue');
  });

  it('returns 30 entries for days=30', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=30')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(30);
  });

  it('sums only PAID payments (not PENDING) in todays entry', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=7')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntry = res.body.find((e: { date: string }) => e.date === todayStr);
    expect(todayEntry).toBeDefined();
    // 3000 + 2000 = 5000 (PENDING 1000 must be excluded)
    expect(todayEntry.revenue).toBe(5000);
  });
});
