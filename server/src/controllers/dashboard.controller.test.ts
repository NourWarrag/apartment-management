import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

// ─── Stats + Activity ─────────────────────────────────────────────────────────

let adminCookieA: string;

describe('dashboard/stats + activity suite setup', () => {
  beforeAll(async () => {
    adminCookieA = `token=${signToken({ id: 1, role: 'ADMIN' })}`;
    await testPrisma.apartment.deleteMany();
    const aptData = [
      { number: '101', floor: 1, type: 'STUDIO' as const,      status: 'OCCUPIED' as const,          buildingId: 1 },
      { number: '102', floor: 1, type: 'ONE_BEDROOM' as const,  status: 'AVAILABLE' as const,         buildingId: 1 },
      { number: '103', floor: 1, type: 'TWO_BEDROOM' as const,  status: 'RESERVED' as const,          buildingId: 1 },
      { number: '201', floor: 2, type: 'ONE_BEDROOM' as const,  status: 'OCCUPIED' as const,          buildingId: 1 },
      { number: '202', floor: 2, type: 'PENTHOUSE' as const,    status: 'MAINTENANCE' as const,       buildingId: 1 },
      { number: '203', floor: 2, type: 'STUDIO' as const,      status: 'AVAILABLE' as const,          buildingId: 1 },
      { number: '301', floor: 3, type: 'TWO_BEDROOM' as const,  status: 'OCCUPIED' as const,          buildingId: 1 },
      { number: '302', floor: 3, type: 'ONE_BEDROOM' as const,  status: 'PENDING_CHECKOUT' as const,  buildingId: 1 },
      { number: '401', floor: 4, type: 'PENTHOUSE' as const,    status: 'OCCUPIED' as const,          buildingId: 1 },
      { number: '402', floor: 4, type: 'STUDIO' as const,      status: 'AVAILABLE' as const,          buildingId: 1 },
      { number: '501', floor: 5, type: 'TWO_BEDROOM' as const,  status: 'OCCUPIED' as const,          buildingId: 1 },
      { number: '502', floor: 5, type: 'ONE_BEDROOM' as const,  status: 'RESERVED' as const,          buildingId: 1 },
    ];
    await testPrisma.apartment.createMany({ data: aptData });
  });

  afterAll(async () => {
    await testPrisma.apartment.deleteMany();
  });

  describe('GET /api/v1/dashboard/stats', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/dashboard/stats');
      expect(res.status).toBe(401);
    });

    it('returns the correct response shape', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('Cookie', adminCookieA);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        apartments: {
          total: expect.any(Number),
          occupied: expect.any(Number),
          available: expect.any(Number),
          maintenance: expect.any(Number),
        },
        revenue: {
          total: expect.any(Number),
          cash: expect.any(Number),
          card: expect.any(Number),
          installment: expect.any(Number),
        },
        pendingInstallments: expect.any(Number),
        openTickets: expect.any(Number),
      });
    });

    it('apartment total matches seeded count and status buckets are populated', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('Cookie', adminCookieA);

      const { apartments } = res.body as {
        apartments: { total: number; occupied: number; available: number; maintenance: number };
      };
      expect(apartments.total).toBe(12);
      expect(apartments.occupied + apartments.available + apartments.maintenance).toBeGreaterThan(0);
    });

    it('revenue total equals sum of cash + card + installment', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('Cookie', adminCookieA);

      const { revenue } = res.body as {
        revenue: { total: number; cash: number; card: number; installment: number };
      };
      expect(revenue.total).toBeCloseTo(revenue.cash + revenue.card + revenue.installment, 2);
    });
  });

  describe('GET /api/v1/dashboard/activity', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/dashboard/activity');
      expect(res.status).toBe(401);
    });

    it('returns events array with correct shape', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Cookie', adminCookieA);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events.length).toBeLessThanOrEqual(20);
    });

    it('each event has type, label, and timestamp', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Cookie', adminCookieA);

      expect(res.status).toBe(200);
      for (const event of res.body.events) {
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('label');
        expect(event).toHaveProperty('timestamp');
        expect(['CHECK_IN', 'CHECK_OUT', 'PAYMENT', 'TICKET']).toContain(event.type);
        expect(typeof event.label).toBe('string');
        expect(typeof event.timestamp).toBe('string');
      }
    });

    it('events are sorted newest-first', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Cookie', adminCookieA);

      const events = res.body.events as { timestamp: string }[];
      for (let i = 0; i < events.length - 1; i++) {
        expect(new Date(events[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(events[i + 1].timestamp).getTime()
        );
      }
    });
  });
});

// ─── Revenue Trend ────────────────────────────────────────────────────────────

describe('GET /api/v1/dashboard/revenue-trend', () => {
  let adminCookieB: string;
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
    adminCookieB = `token=${signToken({ id: admin.id, role: 'ADMIN' })}`;

    const apt = await testPrisma.apartment.create({
      data: { number: 'DASH-RT-101', floor: 1, type: 'STUDIO', status: 'OCCUPIED', buildingId: 1 },
    });

    const tenant = await testPrisma.tenant.create({
      data: { fullName: 'Dash Test Tenant', phone: '0501234500', idNumber: 'DASH-RT-ID-001' },
    });

    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date(),
        checkOut: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        totalAmount: 10000,
      },
    });
    bookingId = booking.id;

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

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/dashboard/revenue-trend?days=7');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid days param', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=invalid')
      .set('Cookie', adminCookieB);
    expect(res.status).toBe(400);
  });

  it('returns 400 when days param is missing', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend')
      .set('Cookie', adminCookieB);
    expect(res.status).toBe(400);
  });

  it('returns 7 entries for days=7', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=7')
      .set('Cookie', adminCookieB);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toHaveProperty('date');
    expect(res.body[0]).toHaveProperty('revenue');
  });

  it('returns 30 entries for days=30', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=30')
      .set('Cookie', adminCookieB);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(30);
  });

  it('sums only PAID payments (not PENDING) in todays entry', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend?days=7')
      .set('Cookie', adminCookieB);
    expect(res.status).toBe(200);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntry = res.body.find((e: { date: string }) => e.date === todayStr);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.revenue).toBe(5000);
  });
});
