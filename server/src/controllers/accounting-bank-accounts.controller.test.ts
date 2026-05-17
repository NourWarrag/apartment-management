import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string;
let assetAccountId: number;
let expenseAccountId: number;
let alreadyLinkedAccountId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.bankAccount.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'p4-ba@test.local' } });

  const admin = await db.user.create({ data: { name: 'BA', email: 'p4-ba@test.local', password: 'x', role: 'ADMIN' } });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

  const a1 = await db.account.create({ data: { code: '1020', name: 'Bank', type: 'ASSET' } });
  const a2 = await db.account.create({ data: { code: '5010', name: 'Expense', type: 'EXPENSE' } });
  const a3 = await db.account.create({ data: { code: '1021', name: 'USD Bank', type: 'ASSET' } });
  assetAccountId = a1.id;
  expenseAccountId = a2.id;
  alreadyLinkedAccountId = a3.id;

  await db.bankAccount.create({ data: { name: 'Pre-linked', accountId: alreadyLinkedAccountId } });
});

afterAll(async () => {
  await db.bankAccount.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'p4-ba@test.local' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Wipe non-prelinked bank accounts between tests so creating + linking the asset account is repeatable
  await db.bankAccount.deleteMany({ where: { NOT: { accountId: alreadyLinkedAccountId } } });
});

describe('BankAccount auth gating', () => {
  it('401 unauthenticated', async () => {
    const r = await request(app).get('/api/v1/accounting/bank-accounts');
    expect(r.status).toBe(401);
  });
});

describe('GET /accounting/bank-accounts', () => {
  it('returns list including counts', async () => {
    const r = await request(app).get('/api/v1/accounting/bank-accounts').set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThan(0);
  });
});

describe('POST /accounting/bank-accounts', () => {
  it('creates a row linking to an ASSET account', async () => {
    const r = await request(app).post('/api/v1/accounting/bank-accounts').set('Cookie', adminCookie)
      .send({ name: 'Main', accountId: assetAccountId });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('Main');
  });

  it('rejects linking to a non-ASSET account', async () => {
    const r = await request(app).post('/api/v1/accounting/bank-accounts').set('Cookie', adminCookie)
      .send({ name: 'Bad', accountId: expenseAccountId });
    expect(r.status).toBe(400);
  });

  it('rejects already-linked account with 409', async () => {
    const r = await request(app).post('/api/v1/accounting/bank-accounts').set('Cookie', adminCookie)
      .send({ name: 'Dup', accountId: alreadyLinkedAccountId });
    expect(r.status).toBe(409);
  });
});

describe('PATCH /accounting/bank-accounts/:id/csv-mapping', () => {
  it('round-trips mapping fields', async () => {
    const ba = await db.bankAccount.create({ data: { name: 'Mapper', accountId: assetAccountId } });
    const r = await request(app).patch(`/api/v1/accounting/bank-accounts/${ba.id}/csv-mapping`).set('Cookie', adminCookie)
      .send({
        csvDateColumn: 0, csvAmountColumn: 2, csvDescriptionColumn: 1,
        csvReferenceColumn: 3, csvHasHeader: true, csvDateFormat: 'DD/MM/YYYY',
      });
    expect(r.status).toBe(200);
    expect(r.body.csvDateFormat).toBe('DD/MM/YYYY');
  });
});
