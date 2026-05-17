import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string;
let bankAccountId: number;
let bankAccountUnmappedId: number;

const SAMPLE_CSV =
  'Date,Description,Amount,Reference\n' +
  '01/05/2026,Rent,1050.00,REF1\n' +
  '03/05/2026,Fee,-25.00,REF2\n';

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'p4-bs@test.local' } });

  const admin = await db.user.create({ data: { name: 'BS', email: 'p4-bs@test.local', password: 'x', role: 'ADMIN' } });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

  const a1 = await db.account.create({ data: { code: '1020', name: 'Bank', type: 'ASSET' } });
  const a2 = await db.account.create({ data: { code: '1021', name: 'Bank2', type: 'ASSET' } });
  const ba1 = await db.bankAccount.create({
    data: {
      name: 'Mapped',
      accountId: a1.id,
      csvDateColumn: 0, csvDescriptionColumn: 1, csvAmountColumn: 2, csvReferenceColumn: 3,
      csvHasHeader: true, csvDateFormat: 'DD/MM/YYYY',
    },
  });
  const ba2 = await db.bankAccount.create({ data: { name: 'Unmapped', accountId: a2.id } });
  bankAccountId = ba1.id;
  bankAccountUnmappedId = ba2.id;
});

afterAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'p4-bs@test.local' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
});

describe('POST /bank-accounts/:id/statements/preview', () => {
  it('returns sample rows and column count', async () => {
    const r = await request(app)
      .post(`/api/v1/accounting/bank-accounts/${bankAccountId}/statements/preview`)
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(SAMPLE_CSV), 'test.csv');
    expect(r.status).toBe(200);
    expect(r.body.columnCount).toBe(4);
    expect(r.body.sampleRows.length).toBeGreaterThan(0);
  });
});

describe('POST /bank-accounts/:id/statements (import)', () => {
  it('imports a statement when mapping is set', async () => {
    const r = await request(app)
      .post(`/api/v1/accounting/bank-accounts/${bankAccountId}/statements`)
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(SAMPLE_CSV), 'main.csv');
    expect(r.status).toBe(201);
    expect(r.body.lineCount).toBe(2);
  });

  it('returns 400 BANK_STATEMENT_INVALID when mapping is unset', async () => {
    const r = await request(app)
      .post(`/api/v1/accounting/bank-accounts/${bankAccountUnmappedId}/statements`)
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(SAMPLE_CSV), 'x.csv');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BANK_STATEMENT_INVALID');
  });
});

describe('DELETE /bank-statements/:id', () => {
  it('deletes an unmatched statement', async () => {
    const imported = await request(app)
      .post(`/api/v1/accounting/bank-accounts/${bankAccountId}/statements`)
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(SAMPLE_CSV), 'todelete.csv');
    const r = await request(app)
      .delete(`/api/v1/accounting/bank-statements/${imported.body.statementId}`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(204);
  });

  it('rejects deleting a statement whose lines are matched', async () => {
    const imported = await request(app)
      .post(`/api/v1/accounting/bank-accounts/${bankAccountId}/statements`)
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(SAMPLE_CSV), 'matched.csv');

    const line = await db.bankStatementLine.findFirst({ where: { bankStatementId: imported.body.statementId } });
    const rec = await db.reconciliation.create({
      data: { bankAccountId, endDate: new Date('2026-05-31'), statementBalance: '0' },
    });
    // Create a journal line on the bank account to match against
    const journalEntry = await db.journalEntry.create({
      data: { entryNumber: `JE-TEST-BS-${Date.now()}`, date: new Date('2026-05-15'), status: 'POSTED' },
    });
    const journalLine = await db.journalLine.create({
      data: { journalEntryId: journalEntry.id, accountId: (await db.bankAccount.findUnique({ where: { id: bankAccountId } }))!.accountId, debit: line!.amount, credit: 0, lineOrder: 0 },
    });
    await db.reconciliationMatch.create({
      data: { reconciliationId: rec.id, bankStatementLineId: line!.id, journalLineId: journalLine.id },
    });

    const r = await request(app)
      .delete(`/api/v1/accounting/bank-statements/${imported.body.statementId}`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(400);

    // Cleanup
    await db.reconciliationMatch.deleteMany();
    await db.journalLine.deleteMany({ where: { journalEntryId: journalEntry.id } });
    await db.journalEntry.delete({ where: { id: journalEntry.id } });
    await db.reconciliation.delete({ where: { id: rec.id } });
  });
});
