import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string;
let vatAccountId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.taxCode.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'tc@test.local' } });

  const admin = await db.user.create({
    data: { name: 'T', email: 'tc@test.local', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  const a = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  vatAccountId = a.id;
});

afterAll(async () => {
  await db.taxCode.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'tc@test.local' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await db.taxCode.deleteMany();
});

describe('TaxCode CRUD', () => {
  it('creates a tax code', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/tax-codes')
      .set('Cookie', adminCookie)
      .send({ code: 'VAT_STANDARD', name: 'VAT 5%', ratePct: 5, accountId: vatAccountId, isDefault: true });
    expect(r.status).toBe(201);
    expect(r.body.isDefault).toBe(true);
  });

  it('setting isDefault on a second code unsets the first atomically', async () => {
    await db.taxCode.create({
      data: { code: 'A', name: 'A', ratePct: 5, accountId: vatAccountId, isDefault: true },
    });
    const second = await db.taxCode.create({
      data: { code: 'B', name: 'B', ratePct: 5, accountId: vatAccountId, isDefault: false },
    });

    const r = await request(app)
      .patch(`/api/v1/accounting/tax-codes/${second.id}`)
      .set('Cookie', adminCookie)
      .send({ isDefault: true });
    expect(r.status).toBe(200);

    const a = await db.taxCode.findUnique({ where: { code: 'A' } });
    const b = await db.taxCode.findUnique({ where: { code: 'B' } });
    expect(a?.isDefault).toBe(false);
    expect(b?.isDefault).toBe(true);
  });

  it('rejects duplicate code with 409', async () => {
    await request(app)
      .post('/api/v1/accounting/tax-codes')
      .set('Cookie', adminCookie)
      .send({ code: 'X', name: 'X', ratePct: 5, accountId: vatAccountId });
    const r = await request(app)
      .post('/api/v1/accounting/tax-codes')
      .set('Cookie', adminCookie)
      .send({ code: 'X', name: 'X2', ratePct: 5, accountId: vatAccountId });
    expect(r.status).toBe(409);
  });

  it('GET /accounting/tax-codes lists all active codes', async () => {
    await db.taxCode.create({
      data: { code: 'VAT5', name: 'VAT 5%', ratePct: 5, accountId: vatAccountId },
    });
    const r = await request(app)
      .get('/api/v1/accounting/tax-codes')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  it('deactivate sets isActive false', async () => {
    const tc = await db.taxCode.create({
      data: { code: 'TODEACT', name: 'Deact', ratePct: 0, accountId: vatAccountId },
    });
    const r = await request(app)
      .post(`/api/v1/accounting/tax-codes/${tc.id}/deactivate`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    const refreshed = await db.taxCode.findUnique({ where: { id: tc.id } });
    expect(refreshed?.isActive).toBe(false);
  });
});
