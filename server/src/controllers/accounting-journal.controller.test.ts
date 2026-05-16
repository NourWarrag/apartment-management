import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let adminCookie: string;
let cashId: number;
let revenueId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'je@acc.test' } });

  const admin = await db.user.create({
    data: { name: 'Acc Admin', email: 'je@acc.test', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  cashId = cash.id;
  revenueId = rev.id;
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'je@acc.test' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
});

describe('POST /accounting/journal-entries/post', () => {
  it('creates and posts a balanced entry', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/journal-entries/post')
      .set('Cookie', adminCookie)
      .send({
        date: '2026-05-16',
        memo: 'Test entry',
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '100' },
        ],
      });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('POSTED');
    expect(r.body.entryNumber).toMatch(/^JE-\d{6}$/);
  });

  it('returns 400 with code UNBALANCED when totals do not match', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/journal-entries/post')
      .set('Cookie', adminCookie)
      .send({
        date: '2026-05-16',
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '90' },
        ],
      });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('UNBALANCED');
    expect(r.body.details.diff).toBe('10');
  });
});

describe('DRAFT lifecycle', () => {
  it('allows updating a DRAFT and rejects updating after post', async () => {
    const created = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Cookie', adminCookie)
      .send({
        date: '2026-05-16',
        lines: [
          { accountId: cashId, debit: '50' },
          { accountId: revenueId, credit: '50' },
        ],
      });
    const id = created.body.id;
    expect(created.body.status).toBe('DRAFT');

    const u1 = await request(app)
      .patch(`/api/v1/accounting/journal-entries/${id}`)
      .set('Cookie', adminCookie)
      .send({
        date: '2026-05-16',
        memo: 'updated',
        lines: [
          { accountId: cashId, debit: '70' },
          { accountId: revenueId, credit: '70' },
        ],
      });
    expect(u1.status).toBe(200);
    expect(u1.body.memo).toBe('updated');

    const posted = await request(app)
      .post(`/api/v1/accounting/journal-entries/${id}/post`)
      .set('Cookie', adminCookie);
    expect(posted.status).toBe(200);

    const u2 = await request(app)
      .patch(`/api/v1/accounting/journal-entries/${id}`)
      .set('Cookie', adminCookie)
      .send({
        date: '2026-05-16',
        lines: [
          { accountId: cashId, debit: '70' },
          { accountId: revenueId, credit: '70' },
        ],
      });
    expect(u2.status).toBe(400);
    expect(u2.body.code).toBe('ALREADY_POSTED');
  });

  it('DELETE on a POSTED entry returns 400 ALREADY_POSTED', async () => {
    const created = await request(app)
      .post('/api/v1/accounting/journal-entries/post')
      .set('Cookie', adminCookie)
      .send({
        date: '2026-05-16',
        lines: [
          { accountId: cashId, debit: '10' },
          { accountId: revenueId, credit: '10' },
        ],
      });
    const r = await request(app)
      .delete(`/api/v1/accounting/journal-entries/${created.body.id}`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ALREADY_POSTED');
  });
});
