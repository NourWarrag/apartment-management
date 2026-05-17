import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string;
let cashId: number; let apId: number; let utilId: number; let vatId: number; let tcId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.fiscalPeriod.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'p3-exp@test.local' } });

  const admin = await db.user.create({ data: { name: 'A', email: 'p3-exp@test.local', password: 'x', role: 'ADMIN' } });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const ap = await db.account.create({ data: { code: '2010', name: 'Accounts Payable', type: 'LIABILITY' } });
  const util = await db.account.create({ data: { code: '5010', name: 'Utilities', type: 'EXPENSE' } });
  const vat = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  cashId = cash.id; apId = ap.id; utilId = util.id; vatId = vat.id;

  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'S', ratePct: 5, accountId: vat.id, isDefault: true },
  });
  tcId = tc.id;

  await db.accountMapping.createMany({
    data: [
      { key: 'CASH_METHOD', accountId: cashId },
      { key: 'CARD_METHOD', accountId: cashId },
      { key: 'INSTALLMENT_METHOD', accountId: cashId },
      { key: 'AR_DEFAULT', accountId: cashId },
      { key: 'REVENUE_DEFAULT', accountId: cashId },
      { key: 'DEPOSIT_LIABILITY', accountId: vatId },
      { key: 'DEPOSIT_FORFEIT_INCOME', accountId: cashId },
      { key: 'VAT_PAYABLE', accountId: vatId },
    ],
  });
});

afterAll(async () => {
  await db.fiscalPeriod.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'p3-exp@test.local' } });
  await db.$disconnect(); await prisma.$disconnect();
});

describe('POST /accounting/expenses', () => {
  it('creates a 3-line JE with VAT split', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/expenses')
      .set('Cookie', adminCookie)
      .send({
        date: '2026-07-10', memo: 'Utilities',
        expenseAccountId: utilId, amount: 210,
        payFromAccountId: cashId, taxCodeId: tcId,
      });
    expect(r.status).toBe(201);
    expect(r.body.lines).toHaveLength(3);
  });

  it('creates a 2-line JE without tax code', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/expenses')
      .set('Cookie', adminCookie)
      .send({
        date: '2026-07-11',
        expenseAccountId: utilId, amount: 50,
        payFromAccountId: cashId,
      });
    expect(r.status).toBe(201);
    expect(r.body.lines).toHaveLength(2);
  });

  it('credits Accounts Payable when payFromAccountId is AP', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/expenses')
      .set('Cookie', adminCookie)
      .send({
        date: '2026-07-12',
        expenseAccountId: utilId, amount: 100,
        payFromAccountId: apId,
      });
    expect(r.status).toBe(201);
    const apLine = r.body.lines.find((l: any) => l.accountId === apId);
    expect(apLine.credit).toBe('100');
  });

  it('rejects missing required fields with 400', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/expenses')
      .set('Cookie', adminCookie)
      .send({ date: '2026-07-13', amount: 50, payFromAccountId: cashId });  // missing expenseAccountId
    expect(r.status).toBe(400);
  });
});
