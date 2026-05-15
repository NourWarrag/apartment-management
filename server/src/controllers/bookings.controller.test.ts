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

beforeAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001'))`;
  await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'TEST-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000001'`;
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
});

afterAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001'))`;
  await testPrisma.$executeRaw`DELETE FROM "Booking" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000001')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'TEST-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000001'`;
  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'TEST-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email = 'admin_booking_test@test.com'`;
  await testPrisma.$disconnect();
  await db.$disconnect();
});

async function createAvailableApartment(suffix: string) {
  return testPrisma.apartment.create({
    data: { number: `TEST-${suffix}`, floor: 1, buildingId },
  });
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
