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

let aptId: number;
let tenantId: number;
let bookingId: number;
let paidPaymentId: number;
let pendingPaymentId: number;

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
  aptId = apt.id;

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Report Tenant', phone: '+971599000001', idNumber: 'RPT-TEST-001' },
  });
  tenantId = tenant.id;

  const booking = await testPrisma.booking.create({
    data: { apartmentId: apt.id, tenantId: tenant.id, checkIn: TEST_CHECK_IN, checkOut: TEST_CHECK_OUT, totalAmount: 9000 },
  });
  bookingId = booking.id;

  const paid = await testPrisma.payment.create({
    data: { bookingId: booking.id, method: 'CASH', amount: 5000, status: 'PAID', paidAt: TEST_PAID_AT },
  });
  paidPaymentId = paid.id;

  const pending = await testPrisma.payment.create({
    data: { bookingId: booking.id, method: 'INSTALLMENT', amount: 4000, status: 'PENDING' },
  });
  pendingPaymentId = pending.id;

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
    expect(res.body.totalRevenue).toBeGreaterThanOrEqual(5000);
    const cashEntry = res.body.byMethod.find((m: { method: string }) => m.method === 'CASH');
    expect(cashEntry).toBeDefined();
    expect(cashEntry.amount).toBeGreaterThanOrEqual(5000);
    const febEntry = res.body.byMonth.find((m: { month: string }) => m.month === '2030-02');
    expect(febEntry).toBeDefined();
    expect(febEntry.amount).toBeGreaterThanOrEqual(5000);
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
