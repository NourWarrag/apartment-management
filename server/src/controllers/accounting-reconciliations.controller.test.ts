import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';
import { PostingService } from '../services/accounting/posting.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);
let adminCookie: string;
let financeCookie: string;
let bankAccountId: number;
let bankGlId: number;
let revenueId: number;
let userId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.fiscalPeriod.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['p4-rec@test.local', 'p4-rec-fin@test.local'] } } });

  const admin = await db.user.create({ data: { name: 'R', email: 'p4-rec@test.local', password: 'x', role: 'ADMIN' } });
  const fin = await db.user.create({ data: { name: 'F', email: 'p4-rec-fin@test.local', password: 'x', role: 'FINANCE' } });
  userId = admin.id;
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: fin.id, role: 'FINANCE', assignedBuildingId: null })}`;

  const bank = await db.account.create({ data: { code: '1020', name: 'Bank', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  bankGlId = bank.id;
  revenueId = rev.id;
  const ba = await db.bankAccount.create({ data: { name: 'Main', accountId: bankGlId, csvDateFormat: 'DD/MM/YYYY' } });
  bankAccountId = ba.id;
});

afterAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.fiscalPeriod.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['p4-rec@test.local', 'p4-rec-fin@test.local'] } } });
  await db.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
});

describe('POST /accounting/reconciliations', () => {
  it('creates an OPEN reconciliation', async () => {
    const r = await request(app).post('/api/v1/accounting/reconciliations').set('Cookie', adminCookie)
      .send({ bankAccountId, endDate: '2026-05-31', statementBalance: '0' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('OPEN');
  });

  it('rejects duplicate OPEN for the same bank account', async () => {
    await request(app).post('/api/v1/accounting/reconciliations').set('Cookie', adminCookie)
      .send({ bankAccountId, endDate: '2026-06-30', statementBalance: '0' });
    const r = await request(app).post('/api/v1/accounting/reconciliations').set('Cookie', adminCookie)
      .send({ bankAccountId, endDate: '2026-07-31', statementBalance: '0' });
    expect(r.status).toBe(400);
  });
});

describe('GET /accounting/reconciliations/:id', () => {
  it('returns rec with bankLines + journalLines arrays', async () => {
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-08-31'), statementBalance: '0' },
    });
    const r = await request(app).get(`/api/v1/accounting/reconciliations/${rec.id}`).set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.bankLines)).toBe(true);
    expect(Array.isArray(r.body.journalLines)).toBe(true);
  });
});

describe('POST /accounting/reconciliations/:id/match (manual N-to-1)', () => {
  it('matches a bank line to a journal line when amounts agree', async () => {
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-09-30'), statementBalance: '0' },
    });
    // Post a JE that creates a debit on the bank account
    const entry = await posting.createAndPost(
      {
        date: new Date('2026-09-10'),
        lines: [
          { accountId: bankGlId, debit: '500' },
          { accountId: revenueId, credit: '500' },
        ],
      },
      userId,
    );
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: entry.id, accountId: bankGlId } });

    const statement = await db.bankStatement.create({
      data: { bankAccountId, filename: 'm.csv', importedBy: userId, lineCount: 1 },
    });
    const bankLine = await db.bankStatementLine.create({
      data: { bankStatementId: statement.id, bankAccountId, date: new Date('2026-09-10'), amount: '500', description: 'Deposit' },
    });

    const r = await request(app).post(`/api/v1/accounting/reconciliations/${rec.id}/match`).set('Cookie', adminCookie)
      .send({ bankStatementLineId: bankLine.id, journalLineIds: [jLine!.id] });
    expect(r.status).toBe(201);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBe(1);
  });
});

describe('POST /accounting/reconciliations/:id/close', () => {
  it('closes a balanced reconciliation', async () => {
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-10-31'), statementBalance: '0' },
    });
    const r = await request(app).post(`/api/v1/accounting/reconciliations/${rec.id}/close`).set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CLOSED');
  });

  it('rejects unbalanced close', async () => {
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-11-30'), statementBalance: '9999' },
    });
    const r = await request(app).post(`/api/v1/accounting/reconciliations/${rec.id}/close`).set('Cookie', adminCookie);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('RECONCILIATION_UNBALANCED');
  });
});

describe('POST /accounting/reconciliations/:id/reopen', () => {
  it('admin can reopen a closed reconciliation', async () => {
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-12-31'), statementBalance: '0' },
    });
    await request(app).post(`/api/v1/accounting/reconciliations/${rec.id}/close`).set('Cookie', adminCookie);
    const r = await request(app).post(`/api/v1/accounting/reconciliations/${rec.id}/reopen`).set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('OPEN');
  });

  it('finance forbidden', async () => {
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2027-01-31'), statementBalance: '0' },
    });
    await request(app).post(`/api/v1/accounting/reconciliations/${rec.id}/close`).set('Cookie', adminCookie);
    const r = await request(app).post(`/api/v1/accounting/reconciliations/${rec.id}/reopen`).set('Cookie', financeCookie);
    expect(r.status).toBe(403);
  });
});
