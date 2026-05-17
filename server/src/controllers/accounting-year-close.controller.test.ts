import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';
import { PostingService } from '../services/accounting/posting.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);
let adminCookie: string; let financeCookie: string;
let cashId: number; let revenueId: number; let reId: number; let adminId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.fiscalPeriod.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['p3-yc-admin@test.local', 'p3-yc-fin@test.local'] } } });

  const admin = await db.user.create({ data: { name: 'A', email: 'p3-yc-admin@test.local', password: 'x', role: 'ADMIN' } });
  const fin = await db.user.create({ data: { name: 'F', email: 'p3-yc-fin@test.local', password: 'x', role: 'FINANCE' } });
  adminId = admin.id;
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: fin.id, role: 'FINANCE', assignedBuildingId: null })}`;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  const re = await db.account.create({ data: { code: '3020', name: 'Retained Earnings', type: 'EQUITY' } });
  cashId = cash.id; revenueId = rev.id; reId = re.id;
});

afterAll(async () => {
  await db.fiscalPeriod.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: { in: ['p3-yc-admin@test.local', 'p3-yc-fin@test.local'] } } });
  await db.$disconnect(); await prisma.$disconnect();
});

beforeEach(async () => {
  await db.fiscalPeriod.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
});

describe('POST /accounting/fiscal-years/:year/close', () => {
  it('admin closes a year with activity', async () => {
    await posting.createAndPost(
      {
        date: new Date('2040-06-15'),
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '100' },
        ],
      },
      adminId,
    );
    const r = await request(app).post('/api/v1/accounting/fiscal-years/2040/close').set('Cookie', adminCookie);
    expect(r.status).toBe(201);
    expect(r.body.source).toBe('YEAR_END_CLOSE');
  });

  it('rejects second close with ALREADY_CLOSED', async () => {
    await posting.createAndPost(
      {
        date: new Date('2041-06-15'),
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '100' },
        ],
      },
      adminId,
    );
    await request(app).post('/api/v1/accounting/fiscal-years/2041/close').set('Cookie', adminCookie);
    const r = await request(app).post('/api/v1/accounting/fiscal-years/2041/close').set('Cookie', adminCookie);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ALREADY_CLOSED');
  });

  it('rejects empty year with MIN_LINES', async () => {
    const r = await request(app).post('/api/v1/accounting/fiscal-years/2042/close').set('Cookie', adminCookie);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('MIN_LINES');
  });

  it('finance is forbidden (403)', async () => {
    const r = await request(app).post('/api/v1/accounting/fiscal-years/2043/close').set('Cookie', financeCookie);
    expect(r.status).toBe(403);
  });
});
