import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import db from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { Role } from '@hotel/shared';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let superAdminToken: string;
let adminToken: string;
let superAdminId: number;
let adminId: number;

beforeAll(async () => {
  // Clean up any leftover test data from previous runs
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE '%_test@test.com'`;
  await testPrisma.$executeRaw`DELETE FROM "SystemSettings"`;

  // Create SUPER_ADMIN
  const superAdmin = await testPrisma.user.create({
    data: {
      name: 'Super Admin',
      email: 'superadmin_test@test.com',
      password: await hashPassword('password123'),
      role: Role.SUPER_ADMIN,
    },
  });
  superAdminId = superAdmin.id;
  superAdminToken = `token=${signToken({ id: superAdmin.id, role: superAdmin.role, assignedBuildingId: null })}`;

  // Create ADMIN
  const admin = await testPrisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin_test@test.com',
      password: await hashPassword('password123'),
      role: Role.ADMIN,
    },
  });
  adminId = admin.id;
  adminToken = `token=${signToken({ id: admin.id, role: admin.role, assignedBuildingId: null })}`;
});

afterAll(async () => {
  // Use raw SQL to delete all test records including soft-deleted ones
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE '%_test@test.com'`;
  await testPrisma.$executeRaw`DELETE FROM "SystemSettings"`;
  await testPrisma.$disconnect();
  await db.$disconnect();
});

describe('POST /api/v1/users', () => {
  it('creates a user and returns 201 with correct shape (no password field)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', superAdminToken)
      .send({
        name: 'New Receptionist',
        email: 'recep_test@test.com',
        password: 'password123',
        role: Role.RECEPTIONIST,
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: 'New Receptionist',
      email: 'recep_test@test.com',
      role: Role.RECEPTIONIST,
    });
    expect(res.body.password).toBeUndefined();
  });

  it('returns 409 with "Email already in use" for duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', superAdminToken)
      .send({
        name: 'Duplicate',
        email: 'recep_test@test.com',
        password: 'password123',
        role: Role.RECEPTIONIST,
      });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Email already in use/i);
  });

  it('returns 403 mentioning SUPER_ADMIN when ADMIN tries to create an ADMIN user', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', adminToken)
      .send({
        name: 'Another Admin',
        email: 'anotheradmin_test@test.com',
        password: 'password123',
        role: Role.ADMIN,
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/SUPER_ADMIN/i);
  });

  it('returns 400 mentioning assignedBuildingId when BUILDING_ADMIN is created without one', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', superAdminToken)
      .send({
        name: 'Building Admin',
        email: 'buildingadmin_test@test.com',
        password: 'password123',
        role: Role.BUILDING_ADMIN,
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/assignedBuildingId/i);
  });
});

describe('POST /api/v1/users/:id/deactivate and reactivate', () => {
  let targetUserId: number;

  beforeAll(async () => {
    const target = await testPrisma.user.create({
      data: {
        name: 'Target User',
        email: 'target_test@test.com',
        password: await hashPassword('password123'),
        role: Role.RECEPTIONIST,
      },
    });
    targetUserId = target.id;
  });

  it('deactivates a user — deactivated user cannot login (returns 401 with "Account deactivated")', async () => {
    const deactivateRes = await request(app)
      .post(`/api/v1/users/${targetUserId}/deactivate`)
      .set('Cookie', superAdminToken);
    expect(deactivateRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target_test@test.com', password: 'password123' });
    expect(loginRes.status).toBe(401);
    expect(loginRes.body.message).toMatch(/Account deactivated/i);
  });

  it('returns 403 mentioning "own account" when admin tries to deactivate themselves', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${superAdminId}/deactivate`)
      .set('Cookie', superAdminToken);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own account/i);
  });

  it('reactivates a user; subsequent login returns 200', async () => {
    const reactivateRes = await request(app)
      .post(`/api/v1/users/${targetUserId}/reactivate`)
      .set('Cookie', superAdminToken);
    expect(reactivateRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target_test@test.com', password: 'password123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user).toMatchObject({ email: 'target_test@test.com' });
  });
});

describe('GET /api/v1/settings and PATCH /api/v1/settings', () => {
  it('returns defaults on first access (companyName: "My Property", currency: "AED")', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Cookie', superAdminToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      companyName: 'My Property',
      currency: 'AED',
    });
  });

  it('after PATCH, GET returns updated values', async () => {
    const patchRes = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', superAdminToken)
      .send({ companyName: 'Test Hotel', currency: 'USD' });
    expect(patchRes.status).toBe(200);

    const getRes = await request(app)
      .get('/api/v1/settings')
      .set('Cookie', superAdminToken);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({
      companyName: 'Test Hotel',
      currency: 'USD',
    });
  });
});

describe('Staff status', () => {
  let maintenanceUser: { id: number };
  let staffAdminToken: string;

  beforeAll(async () => {
    const admin = await testPrisma.user.create({
      data: {
        name: 'Staff Admin',
        email: `staff-admin-${Date.now()}@test.com`,
        password: 'x',
        role: 'ADMIN',
      },
    });
    staffAdminToken = `token=${signToken({ id: admin.id, role: admin.role, assignedBuildingId: null })}`;

    maintenanceUser = await testPrisma.user.create({
      data: {
        name: 'Staff Worker',
        email: `staff-worker-${Date.now()}@test.com`,
        password: 'x',
        role: 'MAINTENANCE',
        staffStatus: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'staff-%'`;
  });

  it('GET /users/maintenance-staff includes staffStatus', async () => {
    const res = await request(app)
      .get('/api/v1/users/maintenance-staff')
      .set('Cookie', staffAdminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((u: any) => u.id === maintenanceUser.id);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('staffStatus', 'ACTIVE');
  });

  it('PATCH /users/:id updates staffStatus', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${maintenanceUser.id}`)
      .set('Cookie', staffAdminToken)
      .send({ staffStatus: 'ON_CALL' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('staffStatus', 'ON_CALL');
  });

  it('PATCH /users/:id with invalid staffStatus returns 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${maintenanceUser.id}`)
      .set('Cookie', staffAdminToken)
      .send({ staffStatus: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid staff status');
  });
});
