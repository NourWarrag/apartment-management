import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string; let financeCookie: string;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.fiscalPeriod.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['p3-periods-admin@test.local', 'p3-periods-fin@test.local'] } } });

  const admin = await db.user.create({ data: { name: 'A', email: 'p3-periods-admin@test.local', password: 'x', role: 'ADMIN' } });
  const fin = await db.user.create({ data: { name: 'F', email: 'p3-periods-fin@test.local', password: 'x', role: 'FINANCE' } });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: fin.id, role: 'FINANCE', assignedBuildingId: null })}`;
});
afterAll(async () => {
  await db.fiscalPeriod.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['p3-periods-admin@test.local', 'p3-periods-fin@test.local'] } } });
  await db.$disconnect(); await prisma.$disconnect();
});
beforeEach(async () => { await db.fiscalPeriod.deleteMany(); });

describe('GET /accounting/fiscal-periods', () => {
  it('returns empty array when no periods', async () => {
    const r = await request(app).get('/api/v1/accounting/fiscal-periods').set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('filters by year', async () => {
    await db.fiscalPeriod.create({ data: { year: 2026, month: 5, status: 'OPEN' } });
    await db.fiscalPeriod.create({ data: { year: 2027, month: 5, status: 'OPEN' } });
    const r = await request(app).get('/api/v1/accounting/fiscal-periods?year=2026').set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].year).toBe(2026);
  });
});

describe('POST /accounting/fiscal-periods/:year/:month/lock', () => {
  it('admin can lock a period', async () => {
    const r = await request(app).post('/api/v1/accounting/fiscal-periods/2026/5/lock').set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('LOCKED');
  });
  it('finance is forbidden (403)', async () => {
    const r = await request(app).post('/api/v1/accounting/fiscal-periods/2026/5/lock').set('Cookie', financeCookie);
    expect(r.status).toBe(403);
  });
});

describe('POST /accounting/fiscal-periods/:year/:month/unlock', () => {
  it('admin can unlock a non-closed period', async () => {
    await db.fiscalPeriod.create({ data: { year: 2026, month: 6, status: 'LOCKED', lockedAt: new Date() } });
    const r = await request(app).post('/api/v1/accounting/fiscal-periods/2026/6/unlock').set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('OPEN');
  });

  it('rejects unlocking a period that belongs to a closed year', async () => {
    // Create a fake closing JE
    const journalEntry = await db.journalEntry.create({
      data: { entryNumber: 'JE-TEST-CLOSE', date: new Date('2025-12-31'), source: 'YEAR_END_CLOSE', status: 'POSTED' },
    });
    await db.fiscalPeriod.create({
      data: { year: 2025, month: 12, status: 'LOCKED', closingEntryId: journalEntry.id, lockedAt: new Date() },
    });
    const r = await request(app).post('/api/v1/accounting/fiscal-periods/2025/12/unlock').set('Cookie', adminCookie);
    expect(r.status).toBe(400);

    // Cleanup
    await db.journalEntry.delete({ where: { id: journalEntry.id } });
  });
});
