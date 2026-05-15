import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from './app';
import { signToken } from './lib/jwt';
import { Role } from '@hotel/shared';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminToken: string;

beforeAll(async () => {
  const admin = await testPrisma.user.create({
    data: {
      name: 'Flag Test Admin',
      email: `flag-admin-${Date.now()}@test.com`,
      password: 'x',
      role: 'ADMIN',
    },
  });
  adminToken = signToken({ id: admin.id, role: admin.role, assignedBuildingId: null });
});

afterAll(async () => {
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email LIKE 'flag-%'`;
  await testPrisma.$disconnect();
});

describe('GET /api/v1/config', () => {
  it('returns all feature flags as booleans (no auth required)', async () => {
    const res = await request(app).get('/api/v1/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features');
    const flags = res.body.features;
    for (const key of ['BOOKINGS', 'PAYMENTS', 'TICKETS', 'STAFF', 'REPORTS', 'MULTI_BUILDING']) {
      expect(flags).toHaveProperty(key);
      expect(typeof flags[key]).toBe('boolean');
    }
  });
});
