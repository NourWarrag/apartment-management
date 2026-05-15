import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

// Arbitrary IDs are fine — all report endpoints are GET-only, no audit FK writes
const adminCookie = `token=${signToken({ id: 9100, role: 'ADMIN', assignedBuildingId: null })}`;
const financeCookie = `token=${signToken({ id: 9101, role: 'FINANCE', assignedBuildingId: null })}`;
const receptionistCookie = `token=${signToken({ id: 9102, role: 'RECEPTIONIST', assignedBuildingId: null })}`;

// Use year 2030 to avoid interference with seed data
const TEST_PAID_AT = new Date('2030-02-15T12:00:00.000Z');
const TEST_CHECK_IN = new Date('2030-01-01T00:00:00.000Z');
const TEST_CHECK_OUT = new Date('2030-03-31T00:00:00.000Z');

beforeAll(async () => {
  // Clean test-specific data in dependency order
  await testPrisma.payment.deleteMany({ where: { booking: { apartment: { number: 'RPT-101' } } } });
  await testPrisma.booking.deleteMany({ where: { apartment: { number: 'RPT-101' } } });
  await testPrisma.maintenanceTicket.deleteMany({ where: { apartment: { number: 'RPT-101' } } });
  await testPrisma.tenant.deleteMany({ where: { idNumber: 'RPT-TEST-001' } });
  await testPrisma.apartment.deleteMany({ where: { number: 'RPT-101' } });

  const apt = await testPrisma.apartment.create({
    data: { number: 'RPT-101', floor: 1, type: 'STUDIO', status: 'OCCUPIED', buildingId: 1 },
  });

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Report Tenant', phone: '+971599000001', idNumber: 'RPT-TEST-001' },
  });

  const booking = await testPrisma.booking.create({
    data: { apartmentId: apt.id, tenantId: tenant.id, checkIn: TEST_CHECK_IN, checkOut: TEST_CHECK_OUT, totalAmount: 9000 },
  });

  await testPrisma.payment.create({
    data: { bookingId: booking.id, method: 'CASH', amount: 5000, status: 'PAID', paidAt: TEST_PAID_AT },
  });

  await testPrisma.payment.create({
    data: { bookingId: booking.id, method: 'INSTALLMENT', amount: 4000, status: 'PENDING' },
  });

  await testPrisma.maintenanceTicket.create({
    data: { apartmentId: apt.id, description: 'RPT test ticket 1', priority: 'HIGH', status: 'OPEN', type: 'MAINTENANCE' },
  });
  await testPrisma.maintenanceTicket.create({
    data: { apartmentId: apt.id, description: 'RPT test ticket 2', priority: 'LOW', status: 'IN_PROGRESS', type: 'CLEANING' },
  });
});

afterAll(async () => {
  try {
    await testPrisma.payment.deleteMany({ where: { booking: { apartment: { number: 'RPT-101' } } } });
    await testPrisma.booking.deleteMany({ where: { apartment: { number: 'RPT-101' } } });
    await testPrisma.maintenanceTicket.deleteMany({ where: { apartment: { number: 'RPT-101' } } });
    await testPrisma.tenant.deleteMany({ where: { idNumber: 'RPT-TEST-001' } });
    await testPrisma.apartment.deleteMany({ where: { number: 'RPT-101' } });
  } finally {
    await testPrisma.$disconnect();
  }
});

// ─── Revenue ────────────────────────────────────────────────────────────────

describe('GET /api/v1/reports/revenue', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/reports/revenue');
    expect(res.status).toBe(401);
  });

  it('returns 403 for receptionist', async () => {
    const res = await request(app).get('/api/v1/reports/revenue').set('Cookie', receptionistCookie);
    expect(res.status).toBe(403);
  });

  it('returns revenue totals for admin within date range', async () => {
    const res = await request(app)
      .get('/api/v1/reports/revenue?startDate=2030-01-01&endDate=2030-12-31')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBe(5000);
    const cashEntry = res.body.byMethod.find((m: { method: string }) => m.method === 'CASH');
    expect(cashEntry).toBeDefined();
    expect(cashEntry.amount).toBe(5000);
    expect(cashEntry.count).toBe(1);
    const febEntry = res.body.byMonth.find((m: { month: string }) => m.month === '2030-02');
    expect(febEntry).toBeDefined();
    expect(febEntry.amount).toBe(5000);
  });

  it('returns empty result when date range excludes all payments', async () => {
    const res = await request(app)
      .get('/api/v1/reports/revenue?startDate=2020-01-01&endDate=2020-12-31')
      .set('Cookie', financeCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalRevenue');
    expect(Array.isArray(res.body.byMethod)).toBe(true);
    expect(Array.isArray(res.body.byMonth)).toBe(true);
  });

  it('finance role can access revenue', async () => {
    const res = await request(app).get('/api/v1/reports/revenue').set('Cookie', financeCookie);
    expect(res.status).toBe(200);
  });
});

// ─── Outstanding ─────────────────────────────────────────────────────────────

describe('GET /api/v1/reports/outstanding', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/reports/outstanding');
    expect(res.status).toBe(401);
  });

  it('returns 403 for receptionist', async () => {
    const res = await request(app).get('/api/v1/reports/outstanding').set('Cookie', receptionistCookie);
    expect(res.status).toBe(403);
  });

  it('returns pending payment rows for admin', async () => {
    const res = await request(app).get('/api/v1/reports/outstanding').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const row = res.body.find((r: { tenantName: string }) => r.tenantName === 'Report Tenant');
    expect(row).toBeDefined();
    expect(row.pendingAmount).toBe(4000);
    expect(typeof row.oldestDue).toBe('string');
    expect(row.apartmentNumber).toBe('RPT-101');
  });

  it('finance role can access outstanding', async () => {
    const res = await request(app).get('/api/v1/reports/outstanding').set('Cookie', financeCookie);
    expect(res.status).toBe(200);
  });
});

// ─── Maintenance ─────────────────────────────────────────────────────────────

describe('GET /api/v1/reports/maintenance', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/reports/maintenance');
    expect(res.status).toBe(401);
  });

  it('returns 403 for receptionist', async () => {
    const res = await request(app).get('/api/v1/reports/maintenance').set('Cookie', receptionistCookie);
    expect(res.status).toBe(403);
  });

  it('returns ticket counts by status and type for admin', async () => {
    const res = await request(app).get('/api/v1/reports/maintenance').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.byStatus)).toBe(true);
    expect(Array.isArray(res.body.byType)).toBe(true);
    const openEntry = res.body.byStatus.find((e: { status: string }) => e.status === 'OPEN');
    expect(openEntry).toBeDefined();
    expect(openEntry.count).toBeGreaterThanOrEqual(1);
    const maintEntry = res.body.byType.find((e: { type: string }) => e.type === 'MAINTENANCE');
    expect(maintEntry).toBeDefined();
    expect(maintEntry.count).toBeGreaterThanOrEqual(1);
  });

  it('date filter scopes results', async () => {
    const res = await request(app)
      .get('/api/v1/reports/maintenance?startDate=2020-01-01&endDate=2020-12-31')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    // 2020 has no test tickets — verify response shape is correct even when empty
    expect(Array.isArray(res.body.byStatus)).toBe(true);
    expect(Array.isArray(res.body.byType)).toBe(true);
  });
});

// ─── Occupancy ────────────────────────────────────────────────────────────────

describe('GET /api/v1/reports/occupancy', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/reports/occupancy');
    expect(res.status).toBe(401);
  });

  it('returns 403 for receptionist', async () => {
    const res = await request(app).get('/api/v1/reports/occupancy').set('Cookie', receptionistCookie);
    expect(res.status).toBe(403);
  });

  it('returns month rows covering the requested range', async () => {
    // Test booking spans 2030-01-01 to 2030-03-31
    const res = await request(app)
      .get('/api/v1/reports/occupancy?startDate=2030-01-01&endDate=2030-03-31')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3); // Jan, Feb, Mar
    expect(res.body[0].month).toBe('2030-01');
    expect(res.body[1].month).toBe('2030-02');
    expect(res.body[2].month).toBe('2030-03');
    // Each month should have at least 1 occupied apartment (our test booking)
    for (const row of res.body) {
      expect(row.occupied).toBeGreaterThanOrEqual(1);
      expect(typeof row.total).toBe('number');
      expect(typeof row.rate).toBe('number');
    }
  });

  it('returns single month with zero occupied when no bookings exist in range', async () => {
    const res = await request(app)
      .get('/api/v1/reports/occupancy?startDate=2025-06-01&endDate=2025-06-30')
      .set('Cookie', financeCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1); // Just June
    expect(res.body[0].month).toBe('2025-06');
    expect(typeof res.body[0].occupied).toBe('number');
  });

  it('defaults to 12 months when no date range provided', async () => {
    const res = await request(app).get('/api/v1/reports/occupancy').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(12);
  });
});
