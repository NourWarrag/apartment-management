import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminCookie: string;
let financeCookie: string;
let receptionistCookie: string;
let bookingId: number;
let pendingPaymentId: number;
let paidPaymentId: number;

beforeAll(async () => {
  // Clean slate (reverse dependency order)
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.tenant.deleteMany();
  await testPrisma.apartment.deleteMany();
  await testPrisma.user.deleteMany({
    where: { email: { in: ['admin@pay.test', 'receptionist@pay.test'] } },
  });

  // Create real users so the audit middleware FK (createdBy/updatedBy) doesn't fail.
  // Finance and Maintenance only read or are forbidden before any write, so they
  // don't need real DB rows — arbitrary IDs in the JWT are fine for them.
  const adminUser = await testPrisma.user.create({
    data: { name: 'Pay Admin', email: 'admin@pay.test', password: 'x', role: 'ADMIN' },
  });
  const receptionistUser = await testPrisma.user.create({
    data: { name: 'Pay Receptionist', email: 'receptionist@pay.test', password: 'x', role: 'RECEPTIONIST' },
  });

  adminCookie = `token=${signToken({ id: adminUser.id, role: 'ADMIN', assignedBuildingId: null })}`;
  financeCookie = `token=${signToken({ id: 9001, role: 'FINANCE', assignedBuildingId: null })}`;
  receptionistCookie = `token=${signToken({ id: receptionistUser.id, role: 'RECEPTIONIST', assignedBuildingId: null })}`;

  // Seed: one apartment, one tenant, one booking, two payments
  const apt = await testPrisma.apartment.create({
    data: { number: 'P101', floor: 1, type: 'STUDIO', status: 'OCCUPIED', buildingId: 1 },
  });
  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Test Tenant', phone: '+971500000001', idNumber: 'TEST-001' },
  });
  const booking = await testPrisma.booking.create({
    data: {
      apartmentId: apt.id,
      tenantId: tenant.id,
      checkIn: new Date('2026-04-01'),
      checkOut: new Date('2026-07-01'),
      totalAmount: 10000,
      rentAmount: 9523.81,
    },
  });
  bookingId = booking.id;

  const pending = await testPrisma.payment.create({
    data: { bookingId: booking.id, method: 'INSTALLMENT', amount: 3000, status: 'PENDING' },
  });
  pendingPaymentId = pending.id;

  const paid = await testPrisma.payment.create({
    data: {
      bookingId: booking.id,
      method: 'CARD',
      amount: 5000,
      status: 'PAID',
      paidAt: new Date(),
      referenceNumber: 'TXN-TEST-001',
    },
  });
  paidPaymentId = paid.id;
});

afterAll(async () => {
  await testPrisma.payment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.tenant.deleteMany();
  await testPrisma.apartment.deleteMany();
  await testPrisma.user.deleteMany({
    where: { email: { in: ['admin@pay.test', 'receptionist@pay.test'] } },
  });
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/payments', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/payments');
    expect(res.status).toBe(401);
  });

  it('returns correct response shape', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      page: 1,
      pageSize: 20,
      data: expect.any(Array),
    });
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('each item has booking with tenant and apartment', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Cookie', adminCookie);

    for (const item of res.body.data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('method');
      expect(item).toHaveProperty('amount');
      expect(item).toHaveProperty('status');
      expect(item.booking).toHaveProperty('tenant');
      expect(item.booking).toHaveProperty('apartment');
      expect(typeof item.booking.tenant.fullName).toBe('string');
      expect(typeof item.booking.apartment.number).toBe('string');
    }
  });

  it('filters by status=PENDING', async () => {
    const res = await request(app)
      .get('/api/v1/payments?status=PENDING')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    for (const item of res.body.data) {
      expect(item.status).toBe('PENDING');
    }
  });

  it('filters by method=CARD', async () => {
    const res = await request(app)
      .get('/api/v1/payments?method=CARD')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    for (const item of res.body.data) {
      expect(item.method).toBe('CARD');
    }
  });

  it('filters by search (tenant name)', async () => {
    const res = await request(app)
      .get('/api/v1/payments?search=Test+Tenant')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    for (const item of res.body.data) {
      expect(item.booking.tenant.fullName.toLowerCase()).toContain('test tenant'.toLowerCase());
    }
  });

  it('returns page 2 with empty data when total <= 20', async () => {
    const res = await request(app)
      .get('/api/v1/payments?page=2')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.data).toEqual([]);
    expect(typeof res.body.total).toBe('number');
  });

  it('FINANCE role can list payments', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Cookie', financeCookie);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/payments', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/payments').send({});
    expect(res.status).toBe(401);
  });

  it('returns 403 for FINANCE role', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', financeCookie)
      .send({ bookingId, method: 'CASH', amount: 1000 });
    expect(res.status).toBe(403);
  });

  it('RECEPTIONIST role can create a payment', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', receptionistCookie)
      .send({ bookingId, method: 'CASH', amount: 750 });

    try {
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAID');
    } finally {
      if (res.body.id) await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
    }
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ method: 'CASH' }); // missing bookingId and amount
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is not positive', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CASH', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid method value', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'BITCOIN', amount: 500 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent bookingId', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId: 999999, method: 'CASH', amount: 500 });
    expect(res.status).toBe(404);
  });

  it('CASH payment is created with status PAID and paidAt set', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CASH', amount: 1000 });

    try {
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAID');
      expect(res.body.method).toBe('CASH');
      expect(res.body.paidAt).not.toBeNull();
      expect(res.body.amount).toBe('1000');
    } finally {
      if (res.body.id) await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
    }
  });

  it('INSTALLMENT payment is created with status PENDING and paidAt null', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'INSTALLMENT', amount: 2000 });

    try {
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.method).toBe('INSTALLMENT');
      expect(res.body.paidAt).toBeNull();
    } finally {
      if (res.body.id) await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
    }
  });

  it('CARD payment stores referenceNumber', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CARD', amount: 1500, referenceNumber: 'TXN-NEW-001' });

    try {
      expect(res.status).toBe(201);
      expect(res.body.referenceNumber).toBe('TXN-NEW-001');
      expect(res.body.status).toBe('PAID');
      expect(res.body.paidAt).not.toBeNull();
    } finally {
      if (res.body.id) await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
    }
  });
});

describe('PATCH /api/v1/payments/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).patch(`/api/v1/payments/${pendingPaymentId}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for FINANCE role', async () => {
    const res = await request(app)
      .patch(`/api/v1/payments/${pendingPaymentId}`)
      .set('Cookie', financeCookie);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent payment', async () => {
    const res = await request(app)
      .patch('/api/v1/payments/999999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('returns 409 when payment is already PAID', async () => {
    const res = await request(app)
      .patch(`/api/v1/payments/${paidPaymentId}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
  });

  it('marks PENDING payment as PAID with paidAt set', async () => {
    const fresh = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 500, status: 'PENDING' },
    });

    try {
      const res = await request(app)
        .patch(`/api/v1/payments/${fresh.id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PAID');
      expect(res.body.paidAt).not.toBeNull();
      expect(res.body.id).toBe(fresh.id);
    } finally {
      await testPrisma.payment.delete({ where: { id: fresh.id } }).catch(() => {});
    }
  });
});

describe('GET /api/v1/payments/stats', () => {
  // Global seed: 1 PAID CARD (5000, paidAt=now), 1 PENDING INSTALLMENT (3000)
  // Expected: monthlyRevenue=5000, outstandingBalance=3000, activePlans=0

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/payments/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 for MAINTENANCE role', async () => {
    const maintenanceCookie = `token=${signToken({ id: 9002, role: 'MAINTENANCE', assignedBuildingId: null })}`;
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', maintenanceCookie);
    expect(res.status).toBe(403);
  });

  it('monthlyRevenue includes only PAID payments within the current month', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.monthlyRevenue).toBe(5000);
  });

  it('outstandingBalance counts only PENDING payments', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.outstandingBalance).toBe(3000);
  });

  it('activePlans is 0 when no PAID installment payments exist', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stats')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.activePlans).toBe(0);
  });

  it('activePlans counts bookings with partial paid installment sum', async () => {
    const partial = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 4000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/stats')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.activePlans).toBeGreaterThanOrEqual(1);
    } finally {
      await testPrisma.payment.delete({ where: { id: partial.id } });
    }
  });

  it('collectionRate = 100.0 when no pending payments exist', async () => {
    const allPayments = await testPrisma.payment.findMany();
    await testPrisma.payment.deleteMany();
    const sole = await testPrisma.payment.create({
      data: { bookingId, method: 'CASH', amount: 2000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/stats')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.collectionRate).toBe(100.0);
    } finally {
      await testPrisma.payment.delete({ where: { id: sole.id } });
      for (const p of allPayments) {
        await testPrisma.payment.create({
          data: {
            bookingId: p.bookingId,
            method: p.method,
            amount: p.amount,
            status: p.status,
            referenceNumber: p.referenceNumber,
            paidAt: p.paidAt,
          },
        });
      }
    }
  });
});

describe('GET /api/v1/payments/installment-plans', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/payments/installment-plans');
    expect(res.status).toBe(401);
  });

  it('returns empty array when no PAID installment payments exist', async () => {
    const res = await request(app)
      .get('/api/v1/payments/installment-plans')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns active plans (paidAmount < totalAmount)', async () => {
    const partial = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 4000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/installment-plans')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const plan = res.body[0];
      expect(plan).toHaveProperty('bookingId');
      expect(plan).toHaveProperty('tenantName');
      expect(plan).toHaveProperty('apartmentNumber');
      expect(plan).toHaveProperty('totalAmount');
      expect(plan).toHaveProperty('paidAmount');
      expect(plan).toHaveProperty('checkIn');
      expect(plan).toHaveProperty('checkOut');
      expect(Number(plan.paidAmount)).toBeLessThan(Number(plan.totalAmount));
    } finally {
      await testPrisma.payment.delete({ where: { id: partial.id } });
    }
  });

  it('excludes fully paid installment bookings', async () => {
    const full = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 10000, status: 'PAID', paidAt: new Date() },
    });

    try {
      const res = await request(app)
        .get('/api/v1/payments/installment-plans')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      const plan = res.body.find((p: { bookingId: number }) => p.bookingId === bookingId);
      expect(plan).toBeUndefined();
    } finally {
      await testPrisma.payment.delete({ where: { id: full.id } });
    }
  });
});

// ─── Phase 2: Auto-posting ───────────────────────────────────────────────────

describe('Auto-posting on PAID (Phase 2)', () => {
  // Phase 2 fixture IDs
  let p2CashId: number;
  let p2RevenueId: number;
  let p2VatPayableId: number;
  let p2TaxCodeId: number;

  beforeAll(async () => {
    process.env.FEATURE_ACCOUNTING = 'true';

    // Clean up any leftover state from previous runs before creating fixtures
    await testPrisma.journalLine.deleteMany();
    await testPrisma.journalEntry.deleteMany();
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.taxCode.deleteMany({ where: { code: 'P2_VAT5' } });
    await testPrisma.account.deleteMany({ where: { code: { in: ['P2-1010', 'P2-4000', 'P2-2100'] } } });

    // Phase 2 accounts (codes offset so they don't clash with other test files
    // running concurrently against the same DB)
    const cash = await testPrisma.account.create({
      data: { code: 'P2-1010', name: 'P2 Cash', type: 'ASSET' },
    });
    const revenue = await testPrisma.account.create({
      data: { code: 'P2-4000', name: 'P2 Revenue', type: 'INCOME' },
    });
    const vatPayable = await testPrisma.account.create({
      data: { code: 'P2-2100', name: 'P2 VAT Payable', type: 'LIABILITY' },
    });
    p2CashId = cash.id;
    p2RevenueId = revenue.id;
    p2VatPayableId = vatPayable.id;

    const tc = await testPrisma.taxCode.create({
      data: { code: 'P2_VAT5', name: 'P2 VAT 5%', ratePct: 5, accountId: vatPayable.id, isDefault: true },
    });
    p2TaxCodeId = tc.id;

    // All 8 mappings (upsert so they override any prior state)
    for (const [key, accountId] of [
      ['CASH_METHOD', cash.id],
      ['CARD_METHOD', cash.id],
      ['INSTALLMENT_METHOD', cash.id],
      ['AR_DEFAULT', cash.id],
      ['REVENUE_DEFAULT', revenue.id],
      ['DEPOSIT_LIABILITY', vatPayable.id],
      ['DEPOSIT_FORFEIT_INCOME', revenue.id],
      ['VAT_PAYABLE', vatPayable.id],
    ] as const) {
      await testPrisma.accountMapping.upsert({
        where: { key },
        create: { key, accountId },
        update: { accountId },
      });
    }

    // System settings — CASH mode
    await testPrisma.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1, accountingMode: 'CASH' },
      update: { accountingMode: 'CASH' },
    });

    // Attach taxCodeId to the existing test booking used by POST /payments tests
    await testPrisma.booking.update({
      where: { id: bookingId },
      data: { taxCodeId: p2TaxCodeId },
    });
  });

  afterAll(async () => {
    // Reset booking FK reference before deleting the tax code
    await testPrisma.booking.update({ where: { id: bookingId }, data: { taxCodeId: null } });
    // Remove Phase 2 fixtures in dependency order
    await testPrisma.journalLine.deleteMany();
    await testPrisma.journalEntry.deleteMany();
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.taxCode.deleteMany({ where: { id: p2TaxCodeId } });
    await testPrisma.account.deleteMany({
      where: { id: { in: [p2CashId, p2RevenueId, p2VatPayableId] } },
    });
  });

  it('POST /payments with CASH auto-posts a JE; response has postedEntryId and JE has 3 lines', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CASH', amount: 1050 });

    try {
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAID');

      // Fetch the payment from DB to read postedEntryId
      const payment = await testPrisma.payment.findUnique({ where: { id: res.body.id } });
      expect(payment?.postedEntryId).not.toBeNull();

      const entry = await testPrisma.journalEntry.findUnique({
        where: { id: payment!.postedEntryId! },
        include: { lines: true },
      });
      expect(entry).not.toBeNull();
      expect(entry!.lines.length).toBe(3);
    } finally {
      if (res.body.id) {
        await testPrisma.journalLine.deleteMany({
          where: { journalEntry: { sourceRefId: res.body.id } },
        });
        await testPrisma.journalEntry.deleteMany({ where: { sourceRefId: res.body.id } });
        await testPrisma.payment.delete({ where: { id: res.body.id } }).catch(() => {});
      }
    }
  });

  it('PATCH /payments/:id (markPaid on PENDING) auto-posts; postedEntryId is set', async () => {
    const fresh = await testPrisma.payment.create({
      data: { bookingId, method: 'INSTALLMENT', amount: 525, status: 'PENDING' },
    });

    try {
      const res = await request(app)
        .patch(`/api/v1/payments/${fresh.id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PAID');

      const payment = await testPrisma.payment.findUnique({ where: { id: fresh.id } });
      expect(payment?.postedEntryId).not.toBeNull();
    } finally {
      await testPrisma.journalLine.deleteMany({
        where: { journalEntry: { sourceRefId: fresh.id } },
      });
      await testPrisma.journalEntry.deleteMany({ where: { sourceRefId: fresh.id } });
      await testPrisma.payment.delete({ where: { id: fresh.id } }).catch(() => {});
    }
  });

  it('Payment.create rolls back when posting throws MAPPING_MISSING — 400, payment count unchanged', async () => {
    // The controller checks for REVENUE_DEFAULT before posting. To trigger MAPPING_MISSING
    // inside the transaction, we keep REVENUE_DEFAULT but remove CASH_METHOD, which
    // postFromPayment resolves first in CASH mode.
    await testPrisma.accountMapping.deleteMany({ where: { key: 'CASH_METHOD' } });

    const countBefore = await testPrisma.payment.count({ where: { bookingId } });

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CASH', amount: 500 });

    // Restore the mapping immediately so other tests are not affected
    await testPrisma.accountMapping.upsert({
      where: { key: 'CASH_METHOD' },
      create: { key: 'CASH_METHOD', accountId: p2CashId },
      update: { accountId: p2CashId },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MAPPING_MISSING');

    const countAfter = await testPrisma.payment.count({ where: { bookingId } });
    expect(countAfter).toBe(countBefore);
  });
});

// ─── Phase 3: Period-lock regression ─────────────────────────────────────────

describe('Period-lock regression (Phase 3)', () => {
  let p3LockCashId: number;
  let p3LockRevenueId: number;

  beforeAll(async () => {
    process.env.FEATURE_ACCOUNTING = 'true';
    // Ensure the accounts + mappings exist so postFromPayment is triggered and period-lock fires.
    // Phase 2 afterAll already deleted all mappings/accounts, so we create fresh ones here.
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.account.deleteMany({ where: { code: { in: ['P3LK-PAY-1010', 'P3LK-PAY-4000'] } } });

    const cash = await testPrisma.account.create({ data: { code: 'P3LK-PAY-1010', name: 'P3LK Pay Cash', type: 'ASSET' } });
    const rev = await testPrisma.account.create({ data: { code: 'P3LK-PAY-4000', name: 'P3LK Pay Revenue', type: 'INCOME' } });
    p3LockCashId = cash.id;
    p3LockRevenueId = rev.id;

    for (const [key, accountId] of [
      ['CASH_METHOD', cash.id],
      ['CARD_METHOD', cash.id],
      ['INSTALLMENT_METHOD', cash.id],
      ['AR_DEFAULT', cash.id],
      ['REVENUE_DEFAULT', rev.id],
      ['DEPOSIT_LIABILITY', cash.id],
      ['DEPOSIT_FORFEIT_INCOME', rev.id],
      ['VAT_PAYABLE', cash.id],
    ] as [string, number][]) {
      await testPrisma.accountMapping.upsert({
        where: { key },
        create: { key, accountId },
        update: { accountId },
      });
    }

    await testPrisma.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1, accountingMode: 'CASH' },
      update: { accountingMode: 'CASH' },
    });
  });

  afterAll(async () => {
    // Restore OPEN so other tests aren't affected
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    await testPrisma.fiscalPeriod.updateMany({
      where: { year, month, status: 'LOCKED' },
      data: { status: 'OPEN', lockedAt: null, lockedBy: null },
    });
    await testPrisma.accountMapping.deleteMany();
    await testPrisma.account.deleteMany({ where: { id: { in: [p3LockCashId, p3LockRevenueId] } } });
  });

  it('payment auto-post rejects when target period is LOCKED', async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    await testPrisma.fiscalPeriod.upsert({
      where: { year_month: { year, month } },
      create: { year, month, status: 'LOCKED' },
      update: { status: 'LOCKED' },
    });

    const r = await request(app)
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send({ bookingId, method: 'CASH', amount: 100 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PERIOD_LOCKED');

    // Restore for downstream tests
    await testPrisma.fiscalPeriod.update({
      where: { year_month: { year, month } },
      data: { status: 'OPEN', lockedAt: null, lockedBy: null },
    });
  });
});
