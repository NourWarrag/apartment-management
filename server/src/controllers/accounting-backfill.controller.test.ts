import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

let adminCookie: string;
let financeCookie: string;

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
  await db.tenant.deleteMany({ where: { idNumber: 'BF-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'BF-1' } });
  await db.building.deleteMany({ where: { code: 'BF-B' } });
  await db.user.deleteMany({ where: { email: { in: ['bf-admin@test.local', 'bf-finance@test.local'] } } });

  const admin = await db.user.create({
    data: { name: 'BF Admin', email: 'bf-admin@test.local', password: 'x', role: 'ADMIN' },
  });
  const finance = await db.user.create({
    data: { name: 'BF Finance', email: 'bf-finance@test.local', password: 'x', role: 'FINANCE' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: finance.id, role: 'FINANCE', assignedBuildingId: null })}`;

  // Accounts
  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const revenue = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  const vatPayable = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });

  // Tax code
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

  // Booking with 2 PAID payments — no postedEntryId (backfill candidates)
  const bldg = await db.building.create({ data: { name: 'BF Bldg', code: 'BF-B', address: '' } });
  const apt = await db.apartment.create({
    data: { number: 'BF-1', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldg.id },
  });
  const tenant = await db.tenant.create({
    data: { fullName: 'BF Tenant', phone: '+97180', idNumber: 'BF-TEST-001' },
  });
  const booking = await db.booking.create({
    data: {
      apartmentId: apt.id,
      tenantId: tenant.id,
      checkIn: new Date('2026-04-01'),
      checkOut: new Date('2026-07-01'),
      totalAmount: 1000,
      taxCodeId: tc.id,
    },
  });

  // Two PAID payments without postedEntryId — backfill must post these
  await db.payment.create({
    data: { bookingId: booking.id, method: 'CASH', amount: 500, status: 'PAID', paidAt: new Date() },
  });
  await db.payment.create({
    data: { bookingId: booking.id, method: 'CASH', amount: 500, status: 'PAID', paidAt: new Date() },
  });
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'BF-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'BF-1' } });
  await db.building.deleteMany({ where: { code: 'BF-B' } });
  await db.user.deleteMany({ where: { email: { in: ['bf-admin@test.local', 'bf-finance@test.local'] } } });
  await db.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/accounting/backfill', () => {
  it('admin: first call returns processed > 0 and posts all unposted payments', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/backfill')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.processed).toBeGreaterThan(0);
    expect(r.body.posted).toBeGreaterThan(0);
  });

  it('admin: second call returns processed === 0 (idempotent — nothing left to post)', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/backfill')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.processed).toBe(0);
  });

  it('FINANCE role is forbidden from backfill (admin-only endpoint)', async () => {
    const r = await request(app)
      .post('/api/v1/accounting/backfill')
      .set('Cookie', financeCookie);
    expect(r.status).toBe(403);
  });
});
