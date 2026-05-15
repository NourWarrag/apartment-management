import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import app from './app';
import { FeatureFlag } from '@hotel/shared';

describe('GET /api/v1/config', () => {
  it('returns all feature flags as booleans (no auth required)', async () => {
    const res = await request(app).get('/api/v1/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features');
    const flags = res.body.features;
    for (const key of Object.values(FeatureFlag)) {
      expect(flags).toHaveProperty(key);
      expect(typeof flags[key]).toBe('boolean');
    }
  });
});

describe('Route feature gates', () => {
  let adminToken: string;
  let testPrisma: PrismaClient;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    testPrisma = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } },
    });
    const { signToken } = await import('./lib/jwt');
    const admin = await testPrisma.user.create({
      data: {
        name: 'Flag Gate Admin',
        email: `flag-gate-${Date.now()}@test.com`,
        password: 'x',
        role: 'ADMIN',
      },
    });
    adminToken = signToken({ id: admin.id, role: admin.role, assignedBuildingId: null });
  });

  afterAll(async () => {
    await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'flag-gate-%' OR email LIKE 'flag-maint-%'`;
    await testPrisma.$disconnect();
  });

  it('GET /bookings returns 403 when FEATURE_BOOKINGS is not set', async () => {
    vi.stubEnv('FEATURE_BOOKINGS', '');
    const res = await request(app)
      .get('/api/v1/bookings')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Module not enabled');
  });

  it('POST /buildings returns 403 when FEATURE_MULTI_BUILDING is not set', async () => {
    vi.stubEnv('FEATURE_MULTI_BUILDING', '');
    const res = await request(app)
      .post('/api/v1/buildings')
      .set('Cookie', `token=${adminToken}`)
      .send({ name: 'Test Building', code: 'TST', address: '1 Test St' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Module not enabled');
  });

  it('GET /users/maintenance-staff returns 403 when FEATURE_STAFF is not set', async () => {
    vi.stubEnv('FEATURE_STAFF', '');
    const res = await request(app)
      .get('/api/v1/users/maintenance-staff')
      .set('Cookie', `token=${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Module not enabled');
  });

  it('PATCH /users/:id staffStatus is silently ignored when FEATURE_STAFF is not set', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const rawPrisma = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } },
    });
    const maintUser = await rawPrisma.user.create({
      data: {
        name: 'Flag Maint',
        email: `flag-maint-${Date.now()}@test.com`,
        password: 'x',
        role: 'MAINTENANCE',
        staffStatus: 'ACTIVE',
      },
    });
    await rawPrisma.$disconnect();

    vi.stubEnv('FEATURE_STAFF', '');
    const res = await request(app)
      .patch(`/api/v1/users/${maintUser.id}`)
      .set('Cookie', `token=${adminToken}`)
      .send({ name: 'Flag Updated', staffStatus: 'ON_CALL' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Flag Updated');
    expect(res.body.staffStatus).toBe('ACTIVE'); // unchanged
  });
});
