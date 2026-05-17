import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import db from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { Role, ApartmentStatus, DepositStatus } from '@hotel/shared';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminToken: string;
let buildingId: number;
let tenantId: number;

let adminCookieOld: string;
let maintCookie: string;
let financeCookie: string;
let aptIdOld: number;
let tenantIdOld: number;
let unavailableAptId: number;

const futureCheckIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const futureCheckOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const todayCheckIn = new Date().toISOString().split('T')[0];

beforeAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001'))`;
  await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'TEST-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000001'`;

  // Cleanup for old tests (must happen before building delete)
  await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number IN ('BK101', 'BK102')))`;
  await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number IN ('BK101', 'BK102'))`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number IN ('BK101', 'BK102')`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE "idNumber" = 'BK-ID-001'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email = 'admin-bk-old@test.com'`;

  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'TEST-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email = 'admin_booking_test@test.com'`;

  const building = await testPrisma.building.create({
    data: { name: 'Test Building', code: 'TEST-BLD', address: '1 Test St' },
  });
  buildingId = building.id;

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Test Tenant', phone: '0500000001', idNumber: 'TEST-ID-001' },
  });
  tenantId = tenant.id;

  const admin = await testPrisma.user.create({
    data: {
      name: 'Booking Admin',
      email: 'admin_booking_test@test.com',
      password: await hashPassword('password123'),
      role: Role.ADMIN,
    },
  });
  adminToken = `token=${signToken({ id: admin.id, role: admin.role, assignedBuildingId: null })}`;

  // Setup for old tests
  const adminOld = await testPrisma.user.create({
    data: { name: 'Admin BK Old', email: 'admin-bk-old@test.com', password: 'x', role: 'ADMIN' },
  });
  adminCookieOld = `token=${signToken({ id: adminOld.id, role: 'ADMIN', assignedBuildingId: null })}`;
  maintCookie = `token=${signToken({ id: 901, role: 'MAINTENANCE', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: 902, role: 'FINANCE', assignedBuildingId: null })}`;

  const aptOld = await testPrisma.apartment.create({
    data: { number: 'BK101', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId },
  });
  aptIdOld = aptOld.id;

  const unavailableApt = await testPrisma.apartment.create({
    data: { number: 'BK102', floor: 1, type: 'STUDIO', status: 'OCCUPIED', buildingId },
  });
  unavailableAptId = unavailableApt.id;

  const tenantOld = await testPrisma.tenant.create({
    data: { fullName: 'Test Tenant BK', phone: '0501111111', idNumber: 'BK-ID-001' },
  });
  tenantIdOld = tenantOld.id;
});

afterAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001'))`;
  await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'TEST-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000001'`;

  // Cleanup for old tests (must happen before building delete)
  await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number IN ('BK101', 'BK102')))`;
  await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number IN ('BK101', 'BK102'))`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number IN ('BK101', 'BK102')`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE "idNumber" = 'BK-ID-001'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email = 'admin-bk-old@test.com'`;

  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'TEST-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email = 'admin_booking_test@test.com'`;

  await testPrisma.$disconnect();
  await db.$disconnect();
});

async function createAvailableApartment(suffix: string) {
  return testPrisma.apartment.create({
    data: { number: `TEST-${suffix}`, floor: 1, buildingId, status: 'AVAILABLE' as const },
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    apartmentId: aptIdOld,
    tenantId: tenantIdOld,
    checkIn: futureCheckIn,
    checkOut: futureCheckOut,
    totalAmount: 15000,
    payment: { method: 'CASH', amount: 5000 },
    ...overrides,
  };
}

async function createOccupiedBookingWithDeposit(aptId: number, depositAmount: number) {
  const booking = await testPrisma.booking.create({
    data: {
      apartmentId: aptId,
      tenantId,
      checkIn: new Date('2026-01-01'),
      checkOut: new Date('2026-02-01'),
      totalAmount: 5000,
      depositAmount,
      depositStatus: 'HELD',
      depositCollectedAt: new Date(),
    },
  });
  await testPrisma.apartment.update({
    where: { id: aptId },
    data: { status: 'OCCUPIED' },
  });
  return booking;
}

describe('POST /api/v1/bookings — with deposit', () => {
  it('creates booking with depositStatus HELD when deposit.amount provided', async () => {
    const apt = await createAvailableApartment('DEP-CREATE');

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminToken)
      .send({
        apartmentId: apt.id,
        tenantId,
        checkIn: '2026-06-01',
        checkOut: '2026-07-01',
        totalAmount: 5000,
        payment: { method: 'CASH', amount: 5000 },
        deposit: { amount: 1000 },
      });

    expect(res.status).toBe(201);
    expect(res.body.depositStatus).toBe('HELD');
    expect(Number(res.body.depositAmount)).toBe(1000);
    expect(res.body.depositCollectedAt).not.toBeNull();
  });
});

describe('PATCH /api/v1/bookings/:id/deposit', () => {
  it('collects deposit on a booking that has none', async () => {
    const apt = await createAvailableApartment('DEP-COLLECT');
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date('2026-06-01'),
        checkOut: new Date('2026-07-01'),
        totalAmount: 5000,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/deposit`)
      .set('Cookie', adminToken)
      .send({ amount: 1500 });

    expect(res.status).toBe(200);
    expect(res.body.depositStatus).toBe('HELD');
    expect(Number(res.body.depositAmount)).toBe(1500);
  });

  it('returns 409 when deposit is already held', async () => {
    const apt = await createAvailableApartment('DEP-ALREADY');
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date('2026-06-01'),
        checkOut: new Date('2026-07-01'),
        totalAmount: 5000,
        depositAmount: 1000,
        depositStatus: 'HELD',
        depositCollectedAt: new Date(),
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/deposit`)
      .set('Cookie', adminToken)
      .send({ amount: 500 });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Deposit already collected');
  });

  it('returns 409 when trying to collect deposit on checked-out booking', async () => {
    const apt = await createAvailableApartment('DEP-CO');
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date('2026-06-01'),
        checkOut: new Date('2026-07-01'),
        totalAmount: 5000,
        depositStatus: 'NONE',
        checkedOutAt: new Date(),
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/deposit`)
      .set('Cookie', adminToken)
      .send({ amount: 500 });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot collect deposit on a checked-out booking');
  });
});

describe('PATCH /api/v1/bookings/:id/checkout', () => {
  it('full release: sets checkedOutAt, depositStatus RELEASED, apartment CLEANING', async () => {
    const apt = await createAvailableApartment('CO-FULL');
    const booking = await createOccupiedBookingWithDeposit(apt.id, 1000);

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({ depositRefundAmount: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.depositStatus).toBe('RELEASED');
    expect(Number(res.body.depositRefundAmount)).toBe(1000);
    expect(res.body.checkedOutAt).not.toBeNull();

    const updatedApt = await testPrisma.apartment.findUnique({ where: { id: apt.id } });
    expect(updatedApt?.status).toBe('CLEANING');
  });

  it('partial refund: sets depositStatus FORFEITED', async () => {
    const apt = await createAvailableApartment('CO-FORFEIT');
    const booking = await createOccupiedBookingWithDeposit(apt.id, 1000);

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({ depositRefundAmount: 500 });

    expect(res.status).toBe(200);
    expect(res.body.depositStatus).toBe('FORFEITED');
    expect(Number(res.body.depositRefundAmount)).toBe(500);
  });

  it('returns 409 when booking is already checked out', async () => {
    const apt = await createAvailableApartment('CO-ALREADY');
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date('2026-01-01'),
        checkOut: new Date('2026-02-01'),
        totalAmount: 5000,
        checkedOutAt: new Date(),
      },
    });
    await testPrisma.apartment.update({ where: { id: apt.id }, data: { status: 'CLEANING' } });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Booking already checked out');
  });

  it('returns 400 when apartment is not OCCUPIED during checkout', async () => {
    const apt = await createAvailableApartment('CHK-NOTOCCUPIED');
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date('2026-01-01'),
        checkOut: new Date('2026-02-01'),
        totalAmount: 5000,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Apartment is not in OCCUPIED status');
  });

  it('returns 400 when deposit held but depositRefundAmount missing', async () => {
    const apt = await createAvailableApartment('CO-MISSING');
    const booking = await createOccupiedBookingWithDeposit(apt.id, 1000);

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('depositRefundAmount is required when deposit is held');
  });

  it('returns 400 when depositRefundAmount exceeds deposit amount', async () => {
    const apt = await createAvailableApartment('CO-EXCEED');
    const booking = await createOccupiedBookingWithDeposit(apt.id, 1000);

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', adminToken)
      .send({ depositRefundAmount: 1500 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Refund amount cannot exceed deposit amount');
  });
});

describe('PATCH /api/v1/apartments/:id/mark-ready', () => {
  it('marks a CLEANING apartment as AVAILABLE', async () => {
    const apt = await testPrisma.apartment.create({
      data: { number: 'TEST-MR-1', floor: 2, buildingId, status: 'CLEANING' },
    });

    const res = await request(app)
      .patch(`/api/v1/apartments/${apt.id}/mark-ready`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AVAILABLE');
  });

  it('returns 400 when apartment is not CLEANING', async () => {
    const apt = await testPrisma.apartment.create({
      data: { number: 'TEST-MR-2', floor: 2, buildingId, status: 'AVAILABLE' },
    });

    const res = await request(app)
      .patch(`/api/v1/apartments/${apt.id}/mark-ready`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Apartment is not in CLEANING status');
  });
});

describe('POST /api/v1/bookings — auth, roles, validation', () => {
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
      .set('Cookie', adminCookieOld)
      .send(validBody());

    try {
      expect(res.status).toBe(201);
      expect(res.body.apartment.id).toBe(aptIdOld);
      expect(res.body.tenant.id).toBe(tenantIdOld);
      expect(typeof res.body.totalAmount).toBe('string');
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0].method).toBe('CASH');
      expect(res.body.payments[0].status).toBe('PAID');
      const apt = await testPrisma.apartment.findUnique({ where: { id: aptIdOld } });
      expect(apt?.status).toBe('RESERVED');
    } finally {
      if (res.body.id) {
        await testPrisma.payment.deleteMany({ where: { bookingId: res.body.id } });
        await testPrisma.booking.delete({ where: { id: res.body.id } });
      }
      await testPrisma.apartment.update({ where: { id: aptIdOld }, data: { status: 'AVAILABLE' } });
    }
  });

  it('sets apartment to OCCUPIED when checkIn is today', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookieOld)
      .send(validBody({ checkIn: todayCheckIn }));

    try {
      expect(res.status).toBe(201);
      const apt = await testPrisma.apartment.findUnique({ where: { id: aptIdOld } });
      expect(apt?.status).toBe('OCCUPIED');
    } finally {
      if (res.body.id) {
        await testPrisma.payment.deleteMany({ where: { bookingId: res.body.id } });
        await testPrisma.booking.delete({ where: { id: res.body.id } });
      }
      await testPrisma.apartment.update({ where: { id: aptIdOld }, data: { status: 'AVAILABLE' } });
    }
  });

  it('returns 409 when apartment is not AVAILABLE', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookieOld)
      .send(validBody({ apartmentId: unavailableAptId }));
    expect(res.status).toBe(409);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookieOld)
      .send({ apartmentId: aptIdOld });
    expect(res.status).toBe(400);
  });

  it('returns 400 when checkOut is before checkIn', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookieOld)
      .send(validBody({ checkOut: futureCheckIn, checkIn: futureCheckOut }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when apartment does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookieOld)
      .send(validBody({ apartmentId: 999999 }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when tenant does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', adminCookieOld)
      .send(validBody({ tenantId: 999999 }));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/bookings/:id', () => {
  let invoiceBookingId: number;

  beforeAll(async () => {
    // Clean up any prior runs
    await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number = 'INV-001'))`;
    await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number = 'INV-001')`;
    await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number = 'INV-001'`;

    const apt = await testPrisma.apartment.create({
      data: { number: 'INV-001', floor: 3, buildingId, status: 'AVAILABLE' },
    });

    const futureIn = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const futureOut = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId,
        checkIn: new Date(futureIn),
        checkOut: new Date(futureOut),
        totalAmount: 8000,
      },
    });
    invoiceBookingId = booking.id;

    await testPrisma.payment.create({
      data: {
        bookingId: booking.id,
        method: 'CASH',
        amount: 4000,
        status: 'PAID',
        paidAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" = ${invoiceBookingId}`;
    await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE id = ${invoiceBookingId}`;
    await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number = 'INV-001'`;
  });

  it('returns booking with tenant, apartment, building, and payments', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${invoiceBookingId}`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(invoiceBookingId);
    expect(res.body.totalAmount).toBeDefined();
    expect(res.body.tenant).toMatchObject({ fullName: 'Test Tenant', phone: '0500000001' });
    expect(res.body.apartment).toMatchObject({ number: 'INV-001', floor: 3 });
    expect(res.body.apartment.building).toMatchObject({ name: 'Test Building' });
    expect(Array.isArray(res.body.payments)).toBe(true);
    expect(res.body.payments.length).toBe(1);
    expect(res.body.payments[0]).toMatchObject({ method: 'CASH', status: 'PAID' });
    expect(res.body.tenant.idNumber).toBeDefined();
    expect(res.body.depositStatus).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.checkIn).toBeDefined();
    expect(res.body.checkOut).toBeDefined();
  });

  it('returns 404 for unknown booking', async () => {
    const res = await request(app)
      .get('/api/v1/bookings/99999')
      .set('Cookie', adminToken);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Booking not found');
  });
});

describe('GET /api/v1/bookings (list)', () => {
  let adminToken: string;
  let building: { id: number };
  let apartment: { id: number };
  let tenant: { id: number };
  let booking: { id: number };

  beforeAll(async () => {
    const user = await testPrisma.user.create({
      data: {
        name: 'List Admin',
        email: `list-admin-${Date.now()}@test.com`,
        password: 'x',
        role: 'ADMIN',
      },
    });
    adminToken = signToken({ id: user.id, role: user.role, assignedBuildingId: null });

    building = await testPrisma.building.create({
      data: { name: 'List Tower', code: `LIST-${Date.now()}`, address: '1 List St' },
    });
    apartment = await testPrisma.apartment.create({
      data: { number: 'LST-001', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: building.id },
    });
    tenant = await testPrisma.tenant.create({
      data: { fullName: 'List Tenant', phone: `0510${Date.now().toString().slice(-6)}`, idNumber: `LT-${Date.now()}` },
    });
    booking = await testPrisma.booking.create({
      data: {
        apartmentId: apartment.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-01-01'),
        checkOut: new Date('2026-02-01'),
        totalAmount: 3000,
        createdBy: user.id,
      },
    });
  });

  afterAll(async () => {
    await testPrisma.booking.deleteMany({ where: { apartmentId: apartment.id } });
    await testPrisma.apartment.delete({ where: { id: apartment.id } });
    await testPrisma.tenant.update({ where: { id: tenant.id }, data: { deletedAt: new Date() } });
    await testPrisma.building.delete({ where: { id: building.id } });
  });

  it('returns paginated list with correct shape', async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 20);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find((b: any) => b.id === booking.id);
    expect(found).toBeDefined();
    expect(found.tenant).toMatchObject({ fullName: 'List Tenant' });
    expect(found.apartment).toMatchObject({ number: 'LST-001' });
    expect(found.apartment.building).toMatchObject({ name: 'List Tower' });
  });

  it('returns only ACTIVE bookings when status=ACTIVE', async () => {
    const res = await request(app)
      .get('/api/v1/bookings?status=ACTIVE')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find((b: any) => b.id === booking.id);
    expect(found).toBeDefined();
    res.body.data.forEach((b: any) => {
      expect(new Date(b.checkIn).getTime()).toBeLessThanOrEqual(Date.now());
      expect(b.checkedOutAt).toBeNull();
    });
  });
});

// ─── Phase 2: Auto-posting on booking lifecycle ──────────────────────────────

describe('Auto-posting on booking lifecycle (Phase 2)', () => {
  let p2AdminCookie: string;
  let p2BuildingId: number;
  let p2TenantId: number;
  let p2CashId: number;
  let p2RevenueId: number;
  let p2VatPayableId: number;
  let p2TaxCodeId: number;

  beforeAll(async () => {
    process.env.FEATURE_ACCOUNTING = 'true';

    // Clean Phase 2 leftovers from previous runs
    await testPrisma.journalLine.deleteMany();
    await testPrisma.journalEntry.deleteMany();
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.taxCode.deleteMany({ where: { code: 'BK_VAT5' } });
    await testPrisma.account.deleteMany({ where: { code: { in: ['BK-1010', 'BK-4000', 'BK-2100'] } } });
    await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'P2-BK-%'))`;
    await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'P2-BK-%')`;
    await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'P2-BK-%'`;
    await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'P2-BK-B'`;
    await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE "idNumber" = 'P2-BK-001'`;
    await testPrisma.user.deleteMany({ where: { email: 'p2bk@test.local' } });

    const admin = await testPrisma.user.create({
      data: { name: 'P2 BK Admin', email: 'p2bk@test.local', password: 'x', role: 'ADMIN' },
    });
    p2AdminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

    // Accounts
    const cash = await testPrisma.account.create({ data: { code: 'BK-1010', name: 'BK Cash', type: 'ASSET' } });
    const revenue = await testPrisma.account.create({ data: { code: 'BK-4000', name: 'BK Revenue', type: 'INCOME' } });
    const vatPayable = await testPrisma.account.create({ data: { code: 'BK-2100', name: 'BK VAT Payable', type: 'LIABILITY' } });
    p2CashId = cash.id; p2RevenueId = revenue.id; p2VatPayableId = vatPayable.id;

    const tc = await testPrisma.taxCode.create({
      data: { code: 'BK_VAT5', name: 'BK VAT 5%', ratePct: 5, accountId: vatPayable.id, isDefault: true },
    });
    p2TaxCodeId = tc.id;

    // All 8 mappings
    for (const [key, accountId] of [
      ['CASH_METHOD', cash.id],
      ['CARD_METHOD', cash.id],
      ['INSTALLMENT_METHOD', cash.id],
      ['AR_DEFAULT', cash.id],
      ['REVENUE_DEFAULT', revenue.id],
      ['DEPOSIT_LIABILITY', vatPayable.id],
      ['DEPOSIT_FORFEIT_INCOME', revenue.id],
      ['VAT_PAYABLE', vatPayable.id],
    ] as [string, number][]) {
      await testPrisma.accountMapping.upsert({
        where: { key },
        create: { key, accountId },
        update: { accountId },
      });
    }

    // System settings default to CASH; individual tests switch as needed
    await testPrisma.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1, accountingMode: 'CASH' },
      update: { accountingMode: 'CASH' },
    });

    const bldg = await testPrisma.building.create({
      data: { name: 'P2 BK Bldg', code: 'P2-BK-B', address: '' },
    });
    p2BuildingId = bldg.id;

    const tenant = await testPrisma.tenant.create({
      data: { fullName: 'P2 BK Tenant', phone: '+97160', idNumber: 'P2-BK-001' },
    });
    p2TenantId = tenant.id;
  });

  afterAll(async () => {
    await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'P2-BK-%'))`;
    await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'P2-BK-%')`;
    await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'P2-BK-%'`;
    await testPrisma.journalLine.deleteMany();
    await testPrisma.journalEntry.deleteMany();
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.taxCode.deleteMany({ where: { id: p2TaxCodeId } });
    await testPrisma.account.deleteMany({
      where: { id: { in: [p2CashId, p2RevenueId, p2VatPayableId] } },
    });
    await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE "idNumber" = 'P2-BK-001'`;
    await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'P2-BK-B'`;
    await testPrisma.user.deleteMany({ where: { email: 'p2bk@test.local' } });
  });

  it('POST /bookings in ACCRUAL mode auto-posts AR + Revenue + VAT (3-line JE on booking)', async () => {
    await testPrisma.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'ACCRUAL' } });

    const apt = await testPrisma.apartment.create({
      data: { number: 'P2-BK-ACR', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: p2BuildingId },
    });

    try {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Cookie', p2AdminCookie)
        .send({
          apartmentId: apt.id,
          tenantId: p2TenantId,
          checkIn: '2026-08-01',
          checkOut: '2026-09-01',
          totalAmount: 1050,
          taxCodeId: p2TaxCodeId,
          payment: { method: 'CASH', amount: 1050 },
        });

      expect(res.status).toBe(201);

      // In ACCRUAL mode, bookings.create calls postFromBookingCreated which posts
      // the revenue recognition entry (3 lines: debit AR, credit Revenue, credit VAT).
      const booking = await testPrisma.booking.findUnique({ where: { id: res.body.id } });
      expect(booking?.revenuePostedEntryId).not.toBeNull();

      const entry = await testPrisma.journalEntry.findUnique({
        where: { id: booking!.revenuePostedEntryId! },
        include: { lines: true },
      });
      expect(entry).not.toBeNull();
      expect(entry!.lines.length).toBe(3);
    } finally {
      await testPrisma.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'CASH' } });
    }
  });

  it('PATCH /bookings/:id/deposit auto-posts deposit liability (2-line JE)', async () => {
    const apt = await testPrisma.apartment.create({
      data: { number: 'P2-BK-DEP', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: p2BuildingId },
    });
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: p2TenantId,
        checkIn: new Date('2026-08-01'),
        checkOut: new Date('2026-09-01'),
        totalAmount: 5000,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/deposit`)
      .set('Cookie', p2AdminCookie)
      .send({ amount: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.depositStatus).toBe('HELD');

    const updated = await testPrisma.booking.findUnique({ where: { id: booking.id } });
    expect(updated?.depositPostedEntryId).not.toBeNull();

    const entry = await testPrisma.journalEntry.findUnique({
      where: { id: updated!.depositPostedEntryId! },
      include: { lines: true },
    });
    expect(entry).not.toBeNull();
    expect(entry!.lines.length).toBe(2);
  });

  it('PATCH /bookings/:id/checkout (full refund) posts deposit release JE (2-line entry)', async () => {
    const apt = await testPrisma.apartment.create({
      data: { number: 'P2-BK-CHK', floor: 1, type: 'STUDIO', status: 'OCCUPIED', buildingId: p2BuildingId },
    });
    const booking = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: p2TenantId,
        checkIn: new Date('2026-01-01'),
        checkOut: new Date('2026-02-01'),
        totalAmount: 5000,
        depositAmount: 1000,
        depositStatus: 'HELD',
        depositCollectedAt: new Date(),
      },
    });

    const entryCountBefore = await testPrisma.journalEntry.count();

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/checkout`)
      .set('Cookie', p2AdminCookie)
      .send({ depositRefundAmount: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.depositStatus).toBe('RELEASED');

    const entryCountAfter = await testPrisma.journalEntry.count();
    expect(entryCountAfter).toBe(entryCountBefore + 1);

    const releaseEntry = await testPrisma.journalEntry.findFirst({
      where: { sourceRefId: booking.id, source: 'PAYMENT_AUTO' },
      include: { lines: true },
      orderBy: { id: 'desc' },
    });
    expect(releaseEntry).not.toBeNull();
    expect(releaseEntry!.lines.length).toBe(2);
  });
});

// ─── Phase 3: Period-lock regression ─────────────────────────────────────────

describe('Period-lock regression on booking deposit (Phase 3)', () => {
  let p3LockBuildingId: number;
  let p3LockAptId: number;
  let p3LockBookingId: number;
  let p3LockAdminCookie: string;

  beforeAll(async () => {
    process.env.FEATURE_ACCOUNTING = 'true';

    // Ensure accounting mappings exist so the deposit posting path can resolve accounts
    await testPrisma.journalLine.deleteMany();
    await testPrisma.journalEntry.deleteMany();
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.account.deleteMany({ where: { code: { in: ['P3LK-1010', 'P3LK-2100', 'P3LK-4000'] } } });

    const cash = await testPrisma.account.create({ data: { code: 'P3LK-1010', name: 'P3LK Cash', type: 'ASSET' } });
    const liab = await testPrisma.account.create({ data: { code: 'P3LK-2100', name: 'P3LK Deposit Liab', type: 'LIABILITY' } });
    const inc = await testPrisma.account.create({ data: { code: 'P3LK-4000', name: 'P3LK Income', type: 'INCOME' } });

    for (const [key, accountId] of [
      ['CASH_METHOD', cash.id],
      ['CARD_METHOD', cash.id],
      ['INSTALLMENT_METHOD', cash.id],
      ['AR_DEFAULT', cash.id],
      ['REVENUE_DEFAULT', inc.id],
      ['DEPOSIT_LIABILITY', liab.id],
      ['DEPOSIT_FORFEIT_INCOME', inc.id],
      ['VAT_PAYABLE', liab.id],
    ] as [string, number][]) {
      await testPrisma.accountMapping.upsert({
        where: { key },
        create: { key, accountId },
        update: { accountId },
      });
    }

    await testPrisma.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1, accountingMode: 'CASH' },
      update: { accountingMode: 'CASH' },
    });

    const admin = await testPrisma.user.create({
      data: { name: 'P3LK Admin', email: `p3lk-admin-${Date.now()}@test.local`, password: 'x', role: 'ADMIN' },
    });
    p3LockAdminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

    const bldg = await testPrisma.building.create({ data: { name: 'P3LK Bldg', code: `P3LK-${Date.now()}`, address: '' } });
    p3LockBuildingId = bldg.id;

    const apt = await testPrisma.apartment.create({
      data: { number: `P3LK-${Date.now()}`, floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldg.id },
    });
    p3LockAptId = apt.id;

    const ten = await testPrisma.tenant.create({ data: { fullName: 'P3LK Tenant', phone: `+9720${Date.now().toString().slice(-5)}`, idNumber: `P3LK-${Date.now()}` } });

    const bk = await testPrisma.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: ten.id,
        checkIn: new Date('2026-06-01'),
        checkOut: new Date('2026-09-01'),
        totalAmount: 2000,
      },
    });
    p3LockBookingId = bk.id;
  });

  afterAll(async () => {
    // Restore OPEN so other tests aren't affected
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    await testPrisma.fiscalPeriod.updateMany({
      where: { year, month, status: 'LOCKED' },
      data: { status: 'OPEN', lockedAt: null, lockedBy: null },
    });

    await testPrisma.booking.deleteMany({ where: { apartmentId: p3LockAptId } });
    await testPrisma.apartment.deleteMany({ where: { buildingId: p3LockBuildingId } });
    await testPrisma.building.delete({ where: { id: p3LockBuildingId } });
    await testPrisma.journalLine.deleteMany();
    await testPrisma.journalEntry.deleteMany();
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.account.deleteMany({ where: { code: { in: ['P3LK-1010', 'P3LK-2100', 'P3LK-4000'] } } });
  });

  it('deposit collect rejects when target period is LOCKED', async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    await testPrisma.fiscalPeriod.upsert({
      where: { year_month: { year, month } },
      create: { year, month, status: 'LOCKED' },
      update: { status: 'LOCKED' },
    });

    const r = await request(app)
      .patch(`/api/v1/bookings/${p3LockBookingId}/deposit`)
      .set('Cookie', p3LockAdminCookie)
      .send({ amount: 500 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PERIOD_LOCKED');

    // Restore for downstream tests
    await testPrisma.fiscalPeriod.update({
      where: { year_month: { year, month } },
      data: { status: 'OPEN', lockedAt: null, lockedBy: null },
    });
  });
});
