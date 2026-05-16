import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string;
let financeCookie: string;
let receptionistCookie: string;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['admin@acc.test', 'fin@acc.test', 'rec@acc.test'] } } });

  const admin = await db.user.create({
    data: { name: 'Acc Admin', email: 'admin@acc.test', password: 'x', role: 'ADMIN' },
  });
  const fin = await db.user.create({
    data: { name: 'Fin', email: 'fin@acc.test', password: 'x', role: 'FINANCE' },
  });
  const rec = await db.user.create({
    data: { name: 'Rec', email: 'rec@acc.test', password: 'x', role: 'RECEPTIONIST' },
  });

  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: fin.id, role: 'FINANCE', assignedBuildingId: null })}`;
  receptionistCookie = `token=${signToken({ id: rec.id, role: 'RECEPTIONIST', assignedBuildingId: null })}`;
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['admin@acc.test', 'fin@acc.test', 'rec@acc.test'] } } });
  await db.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
});

describe('Account access control', () => {
  it('401 unauthenticated', async () => {
    const r = await request(app).get('/api/v1/accounting/accounts');
    expect(r.status).toBe(401);
  });
  it('403 for RECEPTIONIST — accounting is FINANCE/ADMIN only', async () => {
    const r = await request(app).get('/api/v1/accounting/accounts').set('Cookie', receptionistCookie);
    expect(r.status).toBe(403);
  });
  it('200 for FINANCE', async () => {
    const r = await request(app).get('/api/v1/accounting/accounts').set('Cookie', financeCookie);
    expect(r.status).toBe(200);
  });
});

describe('Feature flag gating', () => {
  it('403 when FEATURE_ACCOUNTING is off — matches requireFeature middleware', async () => {
    process.env.FEATURE_ACCOUNTING = 'false';
    const r = await request(app).get('/api/v1/accounting/accounts').set('Cookie', adminCookie);
    expect(r.status).toBe(403);
    process.env.FEATURE_ACCOUNTING = 'true';
  });
});

describe('Account CRUD', () => {
  it('creates an account', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/accounts')
      .set('Cookie', adminCookie)
      .send({ code: '1010', name: 'Cash', type: 'ASSET' });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe('1010');
  });

  it('rejects duplicate code with 409 — codes are user-facing unique identifiers', async () => {
    await request(app).post('/api/v1/accounting/accounts').set('Cookie', adminCookie)
      .send({ code: '1010', name: 'Cash', type: 'ASSET' });
    const r = await request(app).post('/api/v1/accounting/accounts').set('Cookie', adminCookie)
      .send({ code: '1010', name: 'Other', type: 'ASSET' });
    expect(r.status).toBe(409);
  });

  it('cannot change type once the account has activity — preserves report integrity', async () => {
    const acc = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
    const acc2 = await db.account.create({ data: { code: '4000', name: 'Rev', type: 'INCOME' } });
    const entry = await db.journalEntry.create({
      data: { entryNumber: 'JE-TEST', date: new Date(), status: 'POSTED' },
    });
    await db.journalLine.create({ data: { journalEntryId: entry.id, accountId: acc.id, debit: 1, lineOrder: 0 } });
    await db.journalLine.create({ data: { journalEntryId: entry.id, accountId: acc2.id, credit: 1, lineOrder: 1 } });

    const r = await request(app)
      .patch(`/api/v1/accounting/accounts/${acc.id}`)
      .set('Cookie', adminCookie)
      .send({ type: 'EXPENSE' });
    expect(r.status).toBe(400);
  });

  it('seed-starter creates the standard chart idempotently', async () => {
    const r1 = await request(app).post('/api/v1/accounting/accounts/seed-starter').set('Cookie', adminCookie);
    expect(r1.status).toBe(200);
    expect(r1.body.created).toBeGreaterThan(0);
    const r2 = await request(app).post('/api/v1/accounting/accounts/seed-starter').set('Cookie', adminCookie);
    expect(r2.body.created).toBe(0);
  });
});

describe('Settings booksMode', () => {
  it('round-trips booksMode through PATCH /settings', async () => {
    const r = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', adminCookie)
      .send({ booksMode: 'PER_BUILDING' });
    expect(r.status).toBe(200);
    expect(r.body.booksMode).toBe('PER_BUILDING');

    const back = await request(app).get('/api/v1/settings').set('Cookie', adminCookie);
    expect(back.body.booksMode).toBe('PER_BUILDING');
  });

  it('rejects invalid booksMode values', async () => {
    const r = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', adminCookie)
      .send({ booksMode: 'NONSENSE' });
    expect(r.status).toBe(400);
  });
});
