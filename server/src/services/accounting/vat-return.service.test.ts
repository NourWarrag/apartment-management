import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PostingService } from './posting.service';
import { VatReturnService } from './vat-return.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);
const vatSvc = new VatReturnService(db as any);

let cashId: number; let revenueId: number; let vatPayableId: number;
let tcStandardId: number; let bookingId: number; let userId: number;

beforeAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.tenant.deleteMany({ where: { idNumber: 'VR-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'VR-1' } });
  await db.building.deleteMany({ where: { code: 'VR-B' } });
  await db.user.deleteMany({ where: { email: 'vr@test.local' } });

  const u = await db.user.create({ data: { name: 'V', email: 'vr@test.local', password: 'x', role: 'ADMIN' } });
  userId = u.id;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const revenue = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  const vatp = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  cashId = cash.id; revenueId = revenue.id; vatPayableId = vatp.id;

  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'Standard', ratePct: 5, accountId: vatp.id, isDefault: true },
  });
  tcStandardId = tc.id;

  await db.accountMapping.createMany({
    data: [
      { key: 'CASH_METHOD', accountId: cashId },
      { key: 'CARD_METHOD', accountId: cashId },
      { key: 'INSTALLMENT_METHOD', accountId: cashId },
      { key: 'AR_DEFAULT', accountId: cashId },
      { key: 'REVENUE_DEFAULT', accountId: revenueId },
      { key: 'DEPOSIT_LIABILITY', accountId: vatPayableId },
      { key: 'DEPOSIT_FORFEIT_INCOME', accountId: revenueId },
      { key: 'VAT_PAYABLE', accountId: vatPayableId },
    ],
  });

  await db.systemSettings.upsert({
    where: { id: 1 }, create: { id: 1, accountingMode: 'CASH' }, update: { accountingMode: 'CASH' },
  });

  const bldg = await db.building.create({ data: { name: 'B', code: 'VR-B', address: '' } });
  const apt = await db.apartment.create({ data: { number: 'VR-1', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: bldg.id } });
  const ten = await db.tenant.create({ data: { fullName: 'T', phone: '+9711', idNumber: 'VR-TEST-001' } });
  const b = await db.booking.create({
    data: { apartmentId: apt.id, tenantId: ten.id,
            checkIn: new Date('2026-04-01'), checkOut: new Date('2026-07-01'),
            totalAmount: 1000, taxCodeId: tcStandardId },
  });
  bookingId = b.id;

  for (const amt of ['1050', '1050', '1050']) {
    const p = await db.payment.create({
      data: { bookingId, method: 'CASH', amount: amt, status: 'PAID', paidAt: new Date('2026-05-15') },
    });
    await posting.postFromPayment(p.id, userId);
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
  await db.tenant.deleteMany({ where: { idNumber: 'VR-TEST-001' } });
  await db.apartment.deleteMany({ where: { number: 'VR-1' } });
  await db.building.deleteMany({ where: { code: 'VR-B' } });
  await db.user.deleteMany({ where: { email: 'vr@test.local' } });
  await db.$disconnect();
});

describe('VatReturnService', () => {
  it('groups output VAT by tax code for the given period', async () => {
    const r = await vatSvc.vatReturn(new Date('2026-05-01'), new Date('2026-05-31'));
    const std = r.rows.find((row) => row.code === 'VAT_STANDARD')!;
    expect(std.output.net).toBe('3000.00');
    expect(std.output.vat).toBe('150.00');
    expect(r.outputVatTotal).toBe('150.00');
    expect(r.inputVatTotal).toBe('0.00');
    expect(r.netVatDue).toBe('150.00');
  });

  it('returns zero for periods with no activity', async () => {
    const r = await vatSvc.vatReturn(new Date('2026-01-01'), new Date('2026-02-28'));
    expect(r.outputVatTotal).toBe('0.00');
    expect(r.netVatDue).toBe('0.00');
  });
});
