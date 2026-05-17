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
let paidPaymentId: number;
let pendingPaymentId: number;

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
  await db.tenant.deleteMany({ where: { idNumber: 'REV-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'REV-1' } });
  await db.building.deleteMany({ where: { code: 'REV-B' } });
  await db.user.deleteMany({ where: { email: 'rev@test.local' } });

  const admin = await db.user.create({
    data: { name: 'R', email: 'rev@test.local', password: 'x', role: 'ADMIN' },
  });
  adminCookie = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;

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

  // Booking
  const bldg = await db.building.create({ data: { name: 'Rev Bldg', code: 'REV-B', address: '' } });
  const apt = await db.apartment.create({
    data: { number: 'REV-1', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldg.id },
  });
  const tenant = await db.tenant.create({
    data: { fullName: 'Rev Tenant', phone: '+97199', idNumber: 'REV-TEST-001' },
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

  // PAID payment — run postFromPayment so postedEntryId is set
  const paidPayment = await db.payment.create({
    data: { bookingId: booking.id, method: 'CASH', amount: 1050, status: 'PAID', paidAt: new Date() },
  });
  await posting.postFromPayment(paidPayment.id, admin.id);
  paidPaymentId = paidPayment.id;

  // PENDING payment — no posting
  const pendingPayment = await db.payment.create({
    data: { bookingId: booking.id, method: 'INSTALLMENT', amount: 500, status: 'PENDING' },
  });
  pendingPaymentId = pendingPayment.id;
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'REV-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'REV-1' } });
  await db.building.deleteMany({ where: { code: 'REV-B' } });
  await db.user.deleteMany({ where: { email: 'rev@test.local' } });
  await db.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/accounting/payments/:id/reverse', () => {
  it('reverses a PAID payment — returns 200, reversing entry has swapped d/c lines, payment is REVERSED', async () => {
    const r = await request(app)
      .post(`/api/v1/accounting/payments/${paidPaymentId}/reverse`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);

    // Verify reversing entry has 3 lines (CASH mode with VAT produces 3-line original → 3-line reversal)
    const entry = await db.journalEntry.findUnique({
      where: { id: r.body.id },
      include: { lines: true },
    });
    expect(entry).not.toBeNull();
    expect(entry!.lines.length).toBe(3);

    // Verify payment is now REVERSED
    const payment = await db.payment.findUnique({ where: { id: paidPaymentId } });
    expect(payment?.status).toBe('REVERSED');
  });

  it('second reversal returns 400 ALREADY_REVERSED', async () => {
    const r = await request(app)
      .post(`/api/v1/accounting/payments/${paidPaymentId}/reverse`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ALREADY_REVERSED');
  });

  it('reversing a PENDING payment returns 400 CANNOT_REVERSE', async () => {
    const r = await request(app)
      .post(`/api/v1/accounting/payments/${pendingPaymentId}/reverse`)
      .set('Cookie', adminCookie);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CANNOT_REVERSE');
  });
});
