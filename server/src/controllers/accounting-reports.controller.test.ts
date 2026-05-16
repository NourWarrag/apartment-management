import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';
import { PostingService } from '../services/accounting/posting.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);
let adminCookie: string;
let cashId: number;
let revId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'rpt@acc.test' } });

  const admin = await db.user.create({
    data: { name: 'Rpt', email: 'rpt@acc.test', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Rev', type: 'INCOME' } });
  cashId = cash.id;
  revId = rev.id;

  for (const amt of ['100', '50', '25']) {
    await posting.createAndPost(
      {
        date: new Date('2026-05-10'),
        lines: [
          { accountId: cashId, debit: amt },
          { accountId: revId, credit: amt },
        ],
      },
      admin.id,
    );
  }
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'rpt@acc.test' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

describe('GET /accounting/reports/trial-balance', () => {
  it('returns rows with grand totals matching — books are in balance', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/trial-balance?asOf=2026-12-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    const cash = r.body.rows.find((x: any) => x.accountId === cashId);
    const rev = r.body.rows.find((x: any) => x.accountId === revId);
    expect(cash.totalDebit).toBe('175.00');
    expect(rev.totalCredit).toBe('175.00');
  });
});

describe('GET /accounting/reports/general-ledger', () => {
  it('returns running balance for selected account', async () => {
    const r = await request(app)
      .get(`/api/v1/accounting/reports/general-ledger?accountIds=${cashId}&dateFrom=2026-01-01&dateTo=2026-12-31`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    const cash = r.body[0];
    expect(cash.closingBalance).toBe('175.00');
    expect(cash.lines).toHaveLength(3);
  });
});

describe('CSV exports', () => {
  it('trial-balance.csv returns text/csv with rows', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/trial-balance.csv?asOf=2026-12-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain('Code,Name,Type,Debit,Credit,Net');
  });
});
