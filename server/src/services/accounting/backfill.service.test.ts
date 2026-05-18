import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PostingService } from './posting.service';
import { BackfillService } from './backfill.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);
const backfill = new BackfillService(db as any, posting);

let userId: number; let cashId: number; let revenueId: number; let vatId: number;
let tcId: number; let bldgId: number; let bookingId: number;

beforeAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'BF-001' } });
  await db.apartment.deleteMany({ where: { number: 'BF-1' } });
  await db.building.deleteMany({ where: { code: 'BF-B' } });
  await db.user.deleteMany({ where: { email: 'bf@test.local' } });

  const u = await db.user.create({ data: { name: 'B', email: 'bf@test.local', password: 'x', role: 'ADMIN' } });
  userId = u.id;
  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  const vat = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  cashId = cash.id; revenueId = rev.id; vatId = vat.id;

  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'S', ratePct: 5, accountId: vatId, isDefault: true },
  });
  tcId = tc.id;

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
  await db.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, accountingMode: 'CASH' }, update: { accountingMode: 'CASH' } });

  const bldg = await db.building.create({ data: { name: 'B', code: 'BF-B', address: '' } });
  bldgId = bldg.id;
  const apt = await db.apartment.create({ data: { number: 'BF-1', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldgId } });
  const ten = await db.tenant.create({ data: { fullName: 'T', phone: '+9712', idNumber: 'BF-001' } });
  const b = await db.booking.create({
    data: { apartmentId: apt.id, tenantId: ten.id, checkIn: new Date('2026-01-01'), checkOut: new Date('2026-04-01'),
            totalAmount: 1000, rentAmount: 952.38, taxCodeId: tcId },
  });
  bookingId = b.id;

  for (const amt of ['1050', '1050', '1050']) {
    await db.payment.create({
      data: { bookingId, method: 'CASH', amount: amt, status: 'PAID', paidAt: new Date('2026-03-15') },
    });
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
  await db.tenant.deleteMany({ where: { idNumber: 'BF-001' } });
  await db.apartment.deleteMany({ where: { number: 'BF-1' } });
  await db.building.deleteMany({ where: { code: 'BF-B' } });
  await db.user.deleteMany({ where: { email: 'bf@test.local' } });
  await db.$disconnect();
});

describe('BackfillService.run()', () => {
  it('posts all paid Payments and skips already-posted', async () => {
    const r1 = await backfill.run({ userId });
    expect(r1.processed).toBe(3);
    expect(r1.posted).toBe(3);

    const r2 = await backfill.run({ userId });
    expect(r2.processed).toBe(0);
    expect(r2.posted).toBe(0);
    expect(r2.skipped).toBe(0);
  });

  it('records per-row failures without halting', async () => {
    const p = await db.payment.create({
      data: { bookingId, method: 'CASH', amount: '100', status: 'PAID', paidAt: new Date('2026-03-20') },
    });
    await db.accountMapping.delete({ where: { key: 'REVENUE_DEFAULT' } });

    const r = await backfill.run({ userId });
    expect(r.failed.length).toBe(1);
    expect(r.failed[0].code).toBe('MAPPING_MISSING');

    await db.accountMapping.create({ data: { key: 'REVENUE_DEFAULT', accountId: revenueId } });
    await db.payment.delete({ where: { id: p.id } });
  });
});
