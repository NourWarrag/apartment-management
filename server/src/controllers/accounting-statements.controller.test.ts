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
let cashId: number; let revenueId: number; let vatId: number;

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';
  await db.fiscalPeriod.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'P3-STMT-001' } });
  await db.apartment.deleteMany({ where: { number: 'P3-STMT-1' } });
  await db.building.deleteMany({ where: { code: 'P3-STMT-B' } });
  await db.user.deleteMany({ where: { email: 'stmt@test.local' } });

  const admin = await db.user.create({ data: { name: 'S', email: 'stmt@test.local', password: 'x', role: 'ADMIN' } });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  const vat = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  cashId = cash.id; revenueId = rev.id; vatId = vat.id;

  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'S', ratePct: 5, accountId: vat.id, isDefault: true },
  });

  await db.accountMapping.createMany({
    data: [
      { key: 'CASH_METHOD', accountId: cashId },
      { key: 'CARD_METHOD', accountId: cashId },
      { key: 'INSTALLMENT_METHOD', accountId: cashId },
      { key: 'AR_DEFAULT', accountId: cashId },
      { key: 'REVENUE_DEFAULT', accountId: revenueId },
      { key: 'DEPOSIT_LIABILITY', accountId: vatId },
      { key: 'DEPOSIT_FORFEIT_INCOME', accountId: revenueId },
      { key: 'VAT_PAYABLE', accountId: vatId },
    ],
  });
  await db.systemSettings.upsert({
    where: { id: 1 }, create: { id: 1, accountingMode: 'CASH' }, update: { accountingMode: 'CASH' },
  });

  const bldg = await db.building.create({ data: { name: 'B', code: 'P3-STMT-B', address: '' } });
  const apt = await db.apartment.create({ data: { number: 'P3-STMT-1', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldg.id } });
  const ten = await db.tenant.create({ data: { fullName: 'T', phone: '+9711', idNumber: 'P3-STMT-001' } });
  const b = await db.booking.create({
    data: {
      apartmentId: apt.id, tenantId: ten.id,
      checkIn: new Date('2026-05-01'), checkOut: new Date('2026-08-01'),
      totalAmount: 1000, taxCodeId: tc.id,
    },
  });

  // 3 paid payments of 1050 each → 3000 net revenue + 150 VAT
  for (const amt of ['1050', '1050', '1050']) {
    const p = await db.payment.create({
      data: { bookingId: b.id, method: 'CASH', amount: amt, status: 'PAID', paidAt: new Date('2026-05-15') },
    });
    await posting.postFromPayment(p.id, admin.id);
  }
});

afterAll(async () => {
  await db.fiscalPeriod.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'P3-STMT-001' } });
  await db.apartment.deleteMany({ where: { number: 'P3-STMT-1' } });
  await db.building.deleteMany({ where: { code: 'P3-STMT-B' } });
  await db.user.deleteMany({ where: { email: 'stmt@test.local' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

describe('GET /accounting/reports/income-statement', () => {
  it('returns net income for the period', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/income-statement?from=2026-05-01&to=2026-05-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.netIncome).toBe('3000.00');
  });
  it('CSV variant returns text/csv', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/income-statement.csv?from=2026-05-01&to=2026-05-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
  });
});

describe('GET /accounting/reports/balance-sheet', () => {
  it('returns balanced sheet (isBalanced: true)', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/balance-sheet?asOf=2026-12-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.isBalanced).toBe(true);
  });
  it('CSV variant returns text/csv', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/balance-sheet.csv?asOf=2026-12-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
  });
});

describe('GET /accounting/reports/cash-flow', () => {
  it('reconciles', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/cash-flow?from=2026-05-01&to=2026-05-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.reconcilesToCash).toBe(true);
  });
  it('CSV variant returns text/csv', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/cash-flow.csv?from=2026-05-01&to=2026-05-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
  });
});
