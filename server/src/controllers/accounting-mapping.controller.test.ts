import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string;
let cashId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'map@test.local' } });

  const admin = await db.user.create({
    data: { name: 'M', email: 'map@test.local', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  const a = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  cashId = a.id;
});

afterAll(async () => {
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'map@test.local' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await db.accountMapping.deleteMany();
});

describe('GET /accounting/mapping', () => {
  it('returns one row per known key, unmapped keys have null accountId', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/mapping')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(12);
    expect(r.body.every((row: any) => row.accountId === null)).toBe(true);
  });

  it('reflects a mapping once set', async () => {
    await db.accountMapping.create({ data: { key: 'CASH_METHOD', accountId: cashId } });
    const r = await request(app)
      .get('/api/v1/accounting/mapping')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    const row = r.body.find((x: any) => x.key === 'CASH_METHOD');
    expect(row.accountId).toBe(cashId);
  });
});

describe('PATCH /accounting/mapping/:key', () => {
  it('upserts a mapping', async () => {
    const r = await request(app)
      .patch('/api/v1/accounting/mapping/CASH_METHOD')
      .set('Cookie', adminCookie)
      .send({ accountId: cashId });
    expect(r.status).toBe(200);
    const saved = await db.accountMapping.findUnique({ where: { key: 'CASH_METHOD' } });
    expect(saved?.accountId).toBe(cashId);
  });

  it('rejects unknown key with 400', async () => {
    const r = await request(app)
      .patch('/api/v1/accounting/mapping/NONSENSE')
      .set('Cookie', adminCookie)
      .send({ accountId: cashId });
    expect(r.status).toBe(400);
  });

  it('rejects mapping to a non-existent account', async () => {
    const r = await request(app)
      .patch('/api/v1/accounting/mapping/CASH_METHOD')
      .set('Cookie', adminCookie)
      .send({ accountId: 999999 });
    expect(r.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const r = await request(app)
      .patch('/api/v1/accounting/mapping/CASH_METHOD')
      .send({ accountId: cashId });
    expect(r.status).toBe(401);
  });
});
