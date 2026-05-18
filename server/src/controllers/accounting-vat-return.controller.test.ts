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

beforeAll(async () => {
  process.env.FEATURE_ACCOUNTING = 'true';

  // Clean in reverse dependency order
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'VH-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'VH-1' } });
  await db.building.deleteMany({ where: { code: 'VH-B' } });
  await db.user.deleteMany({ where: { email: 'vh@test.local' } });

  const admin = await db.user.create({
    data: { name: 'VH Admin', email: 'vh@test.local', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

  // Accounts
  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const revenue = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  const vatPayable = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });

  // Tax code — 5%
  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'Standard 5%', ratePct: 5, accountId: vatPayable.id, isDefault: true },
  });

  // All 8 mappings
  await db.accountMapping.createMany({
    data: [
      { key: 'CASH_METHOD', accountId: cash.id },
      { key: 'CARD_METHOD', accountId: cash.id },
      { key: 'INSTALLMENT_METHOD', accountId: cash.id },
      { key: 'AR_DEFAULT', accountId: cash.id },
      { key: 'REVENUE_DEFAULT', accountId: revenue.id },
      { key: 'DEPOSIT_LIABILITY', accountId: vatPayable.id },
      { key: 'DEPOSIT_FORFEIT_INCOME', accountId: revenue.id },
      { key: 'VAT_PAYABLE', accountId: vatPayable.id },
    ],
  });

  // System settings — CASH mode
  await db.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, accountingMode: 'CASH' },
    update: { accountingMode: 'CASH' },
  });

  // Booking + payments (seeded similarly to vat-return.service.test.ts)
  const bldg = await db.building.create({ data: { name: 'VH Bldg', code: 'VH-B', address: '' } });
  const apt = await db.apartment.create({
    data: { number: 'VH-1', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldg.id },
  });
  const tenant = await db.tenant.create({
    data: { fullName: 'VH Tenant', phone: '+97170', idNumber: 'VH-TEST-001' },
  });
  const booking = await db.booking.create({
    data: {
      apartmentId: apt.id,
      tenantId: tenant.id,
      checkIn: new Date('2026-04-01'),
      checkOut: new Date('2026-07-01'),
      totalAmount: 1000,
      rentAmount: 952.38,
      taxCodeId: tc.id,
    },
  });

  // Three payments paid in May 2026 — each 1050 (gross-inclusive of 5% VAT = net 1000, vat 50)
  for (const amt of ['1050', '1050', '1050']) {
    const p = await db.payment.create({
      data: {
        bookingId: booking.id,
        method: 'CASH',
        amount: amt,
        status: 'PAID',
        paidAt: new Date('2026-05-15'),
      },
    });
    await posting.postFromPayment(p.id, admin.id);
  }
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'VH-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'VH-1' } });
  await db.building.deleteMany({ where: { code: 'VH-B' } });
  await db.user.deleteMany({ where: { email: 'vh@test.local' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/accounting/reports/vat-return', () => {
  it('returns 200 with grouped totals for the given period', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/vat-return?from=2026-05-01&to=2026-05-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('rows');
    expect(r.body).toHaveProperty('outputVatTotal');
    expect(r.body).toHaveProperty('inputVatTotal');
    expect(r.body).toHaveProperty('netVatDue');

    const std = r.body.rows.find((row: any) => row.code === 'VAT_STANDARD');
    expect(std).toBeDefined();
    expect(std.output.vat).toBe('150.00');
    expect(r.body.outputVatTotal).toBe('150.00');
    expect(r.body.netVatDue).toBe('150.00');
  });

  it('returns 400 when from query param is missing', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/vat-return?to=2026-05-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(400);
  });

  it('returns 400 when to query param is missing', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/vat-return?from=2026-05-01')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(400);
  });
});

describe('GET /api/v1/accounting/reports/vat-return.csv', () => {
  it('returns 200 with text/csv content-type', async () => {
    const r = await request(app)
      .get('/api/v1/accounting/reports/vat-return.csv?from=2026-05-01&to=2026-05-31')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain('Tax Code,Name,Rate %,Output Net,Output VAT,Input Net,Input VAT');
    expect(r.text).toContain('VAT_STANDARD');
  });
});
