import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { PostingService } from './posting.service';
import { AccountingError } from './posting.errors';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let userId: number;
let cashId: number;
let revenueId: number;
let inactiveId: number;

// Phase 2 fixture IDs
let vatAccountId: number;
let bldgId: number;
let bookingId: number;
let pendingPaymentId: number;
let paidPaymentId: number;
let taxCodeStandardId: number;
let depositLiabilityId: number;
let forfeitIncomeId: number;

async function setUpPhase2Fixtures() {
  // Clean up any stale Phase 2 data from prior runs (payments and bookings
  // are not removed by the Phase 1 beforeAll account cleanup)
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.accountMapping.deleteMany();
  await db.taxCode.deleteMany();

  const vat = await db.account.create({ data: { code: '2100', name: 'VAT Payable', type: 'LIABILITY' } });
  vatAccountId = vat.id;

  const depositLiability = await db.account.create({ data: { code: '2050', name: 'Security Deposits Held', type: 'LIABILITY' } });
  depositLiabilityId = depositLiability.id;
  const forfeitIncome = await db.account.create({ data: { code: '4020', name: 'Forfeited Deposit Income', type: 'INCOME' } });
  forfeitIncomeId = forfeitIncome.id;

  const bldg = await db.building.upsert({
    where: { code: 'TST-P2' },
    create: { name: 'TST-Bldg-P2', code: 'TST-P2', address: '' },
    update: {},
  });
  bldgId = bldg.id;

  const tc = await db.taxCode.create({
    data: { code: 'VAT_STANDARD', name: 'VAT Standard', ratePct: 5, accountId: vatAccountId, isDefault: true },
  });
  taxCodeStandardId = tc.id;

  await db.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, accountingMode: 'CASH' },
    update: { accountingMode: 'CASH' },
  });

  await db.accountMapping.deleteMany();
  await db.accountMapping.createMany({
    data: [
      { key: 'CASH_METHOD', accountId: cashId },
      { key: 'CARD_METHOD', accountId: cashId },
      { key: 'INSTALLMENT_METHOD', accountId: cashId },
      { key: 'AR_DEFAULT', accountId: cashId },
      { key: 'REVENUE_DEFAULT', accountId: revenueId },
      { key: 'DEPOSIT_LIABILITY', accountId: depositLiabilityId },
      { key: 'DEPOSIT_FORFEIT_INCOME', accountId: forfeitIncomeId },
      { key: 'VAT_PAYABLE', accountId: vatAccountId },
    ],
  });

  let apt = await db.apartment.findFirst();
  if (!apt) {
    apt = await db.apartment.create({
      data: { number: 'P2-1', floor: 1, type: 'STUDIO', status: 'OCCUPIED', buildingId: bldgId },
    });
  }
  let tenant = await db.tenant.findFirst();
  if (!tenant) {
    tenant = await db.tenant.create({
      data: { fullName: 'P2 Tenant', phone: '+971500000099', idNumber: 'P2-TEST-001' },
    });
  }
  const booking = await db.booking.create({
    data: {
      apartmentId: apt.id,
      tenantId: tenant.id,
      checkIn: new Date('2026-04-01'),
      checkOut: new Date('2026-07-01'),
      totalAmount: 10000,
      taxCodeId: taxCodeStandardId,
    },
  });
  bookingId = booking.id;

  const pending = await db.payment.create({
    data: { bookingId, method: 'INSTALLMENT', amount: 1050, status: 'PENDING' },
  });
  pendingPaymentId = pending.id;

  const paid = await db.payment.create({
    data: { bookingId, method: 'CASH', amount: 1050, status: 'PAID', paidAt: new Date() },
  });
  paidPaymentId = paid.id;
}

beforeAll(async () => {
  // Clean accounting tables in dependency order
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'posting@test.local' } });

  const user = await db.user.create({
    data: { name: 'Posting Test', email: 'posting@test.local', password: 'x', role: 'ADMIN' },
  });
  userId = user.id;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const revenue = await db.account.create({ data: { code: '4000', name: 'Rental Revenue', type: 'INCOME' } });
  const inactive = await db.account.create({
    data: { code: '9999', name: 'Closed', type: 'ASSET', isActive: false },
  });
  cashId = cash.id;
  revenueId = revenue.id;
  inactiveId = inactive.id;

  await setUpPhase2Fixtures();
});

afterAll(async () => {
  // Phase 2 cleanup (must come before account/user cleanup)
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.taxCode.deleteMany();
  await db.accountMapping.deleteMany();
  // Delete apartments in the test building before the building itself
  await db.apartment.deleteMany({ where: { buildingId: bldgId } });
  await db.building.deleteMany({ where: { code: 'TST-P2' } });

  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'posting@test.local' } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
});

const service = () => new PostingService(db as any);

describe('PostingService.post()', () => {
  it('rejects when debits != credits (the core double-entry invariant)', async () => {
    const draft = await service().createDraft(
      {
        date: new Date('2026-05-16'),
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '90' },
        ],
      },
      userId,
    );
    await expect(service().post(draft.id, userId)).rejects.toMatchObject({
      name: 'AccountingError',
      code: 'UNBALANCED',
    });
  });

  it('rejects single-line entry — double-entry requires >=2 lines', async () => {
    const draft = await service().createDraft(
      { date: new Date('2026-05-16'), lines: [{ accountId: cashId, debit: '100' }] },
      userId,
    );
    await expect(service().post(draft.id, userId)).rejects.toMatchObject({ code: 'MIN_LINES' });
  });

  it('rejects line with both debit and credit > 0 — line shape invariant', async () => {
    await expect(
      service().createAndPost(
        {
          date: new Date('2026-05-16'),
          lines: [
            { accountId: cashId, debit: '100', credit: '50' },
            { accountId: revenueId, credit: '50' },
          ],
        },
        userId,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_LINE' });
  });

  it('rejects line with zero on both sides when an account is selected — no phantom lines', async () => {
    await expect(
      service().createAndPost(
        {
          date: new Date('2026-05-16'),
          lines: [
            { accountId: cashId, debit: '100' },
            { accountId: revenueId, credit: '100' },
            { accountId: cashId }, // accountId set but no amount — invalid shape
          ],
        },
        userId,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_LINE' });
  });

  it('rejects post() targeting an inactive account — closed accounts cannot accept activity', async () => {
    const draft = await service().createDraft(
      {
        date: new Date('2026-05-16'),
        lines: [
          { accountId: inactiveId, debit: '100' },
          { accountId: revenueId, credit: '100' },
        ],
      },
      userId,
    );
    await expect(service().post(draft.id, userId)).rejects.toMatchObject({ code: 'INVALID_ACCOUNT' });
  });

  it('transitions DRAFT -> POSTED and stamps postedAt/postedBy on success', async () => {
    const draft = await service().createDraft(
      {
        date: new Date('2026-05-16'),
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '100' },
        ],
      },
      userId,
    );
    const posted = await service().post(draft.id, userId);
    expect(posted.status).toBe('POSTED');
    expect(posted.postedAt).toBeInstanceOf(Date);
    expect(posted.postedBy).toBe(userId);
  });

  it('throws ALREADY_POSTED when re-posting — posted entries are immutable', async () => {
    const e = await service().createAndPost(
      {
        date: new Date('2026-05-16'),
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '100' },
        ],
      },
      userId,
    );
    await expect(service().post(e.id, userId)).rejects.toMatchObject({ code: 'ALREADY_POSTED' });
  });

  // INVALID_BUILDING is defended at two levels: the Postgres FK on
  // JournalEntry.buildingId / JournalLine.buildingId catches a bad ID at
  // createDraft insert time (well before post's validate() runs).
  // PostingService.validate() retains a building-existence check as defense
  // in depth against direct DB writes that bypass the service. That path is
  // intentionally unreachable through the public API and therefore untested.
});

describe('PostingService.deleteDraft()', () => {
  it('rejects deleting a POSTED entry — posted entries are immutable history', async () => {
    const e = await service().createAndPost(
      {
        date: new Date('2026-05-16'),
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '100' },
        ],
      },
      userId,
    );
    await expect(service().deleteDraft(e.id, userId)).rejects.toMatchObject({ code: 'ALREADY_POSTED' });
  });
});

describe('PostingService.createDraft()', () => {
  it('allows unbalanced draft — users save work-in-progress before posting', async () => {
    const draft = await service().createDraft(
      {
        date: new Date('2026-05-16'),
        lines: [
          { accountId: cashId, debit: '100' },
          { accountId: revenueId, credit: '50' },
        ],
      },
      userId,
    );
    expect(draft.status).toBe('DRAFT');
  });
});

describe('entry numbering', () => {
  it('gives distinct entry numbers under concurrent posts — sequence safety', async () => {
    const drafts = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        service().createDraft(
          {
            date: new Date('2026-05-16'),
            lines: [
              { accountId: cashId, debit: '1' },
              { accountId: revenueId, credit: '1' },
            ],
          },
          userId,
        ),
      ),
    );
    const posted = await Promise.all(drafts.map((d) => service().post(d.id, userId)));
    const numbers = posted.map((p) => p.entryNumber);
    expect(new Set(numbers).size).toBe(5);
    numbers.forEach((n) => expect(n).toMatch(/^JE-\d{6}$/));
  });
});

describe('PostingService.postFromPayment (CASH mode)', () => {
  it('posts a 3-line JE with VAT split: debit Cash gross, credit Revenue net, credit VAT Payable tax', async () => {
    // Make sure no leftover postedEntryId from a previous test run
    await db.payment.update({ where: { id: paidPaymentId }, data: { postedEntryId: null } });
    const entry = await service().postFromPayment(paidPaymentId, userId);
    expect(entry).not.toBeNull();
    const lines = await db.journalLine.findMany({
      where: { journalEntryId: entry!.id },
      orderBy: { lineOrder: 'asc' },
    });
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.accountId === cashId)?.debit.toFixed(2)).toBe('1050.00');
    expect(lines.find((l) => l.accountId === revenueId)?.credit.toFixed(2)).toBe('1000.00');
    expect(lines.find((l) => l.accountId === vatAccountId)?.credit.toFixed(2)).toBe('50.00');
  });

  it('sets payment.postedEntryId after successful post', async () => {
    await db.payment.update({ where: { id: paidPaymentId }, data: { postedEntryId: null } });
    const entry = await service().postFromPayment(paidPaymentId, userId);
    const p = await db.payment.findUnique({ where: { id: paidPaymentId } });
    expect(p?.postedEntryId).not.toBeNull();
    expect(p?.postedEntryId).toBe(entry!.id);
  });

  it('is idempotent — second call returns the existing entry without creating a new one', async () => {
    await db.payment.update({ where: { id: paidPaymentId }, data: { postedEntryId: null } });
    const firstEntry = await service().postFromPayment(paidPaymentId, userId);
    expect(firstEntry).not.toBeNull();
    const before = await db.journalEntry.count();
    const result = await service().postFromPayment(paidPaymentId, userId);
    const after = await db.journalEntry.count();
    expect(after).toBe(before);
    const p = await db.payment.findUnique({ where: { id: paidPaymentId } });
    expect(result?.id).toBe(p?.postedEntryId);
  });

  it('throws MAPPING_MISSING when REVENUE_DEFAULT is unmapped', async () => {
    const newPayment = await db.payment.create({
      data: { bookingId, method: 'CASH', amount: 100, status: 'PAID', paidAt: new Date() },
    });
    await db.accountMapping.delete({ where: { key: 'REVENUE_DEFAULT' } });
    await expect(service().postFromPayment(newPayment.id, userId))
      .rejects.toMatchObject({ code: 'MAPPING_MISSING', details: { key: 'REVENUE_DEFAULT' } });
    await db.accountMapping.create({ data: { key: 'REVENUE_DEFAULT', accountId: revenueId } });
    await db.payment.delete({ where: { id: newPayment.id } });
  });

  it('posts a 2-line JE (no VAT line) when rate is 0 (VAT_ZERO booking)', async () => {
    const tcZero = await db.taxCode.create({
      data: { code: 'VAT_ZERO', name: 'Zero', ratePct: 0, accountId: vatAccountId, isDefault: false },
    });
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-08-01'),
        checkOut: new Date('2026-09-01'),
        totalAmount: 500,
        taxCodeId: tcZero.id,
      },
    });
    const p = await db.payment.create({
      data: { bookingId: b.id, method: 'CASH', amount: 500, status: 'PAID', paidAt: new Date() },
    });
    const entry = await service().postFromPayment(p.id, userId);
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id } });
    expect(lines).toHaveLength(2);
    // cleanup
    await db.journalLine.deleteMany({ where: { journalEntryId: entry!.id } });
    await db.journalEntry.delete({ where: { id: entry!.id } });
    await db.payment.delete({ where: { id: p.id } });
    await db.booking.delete({ where: { id: b.id } });
    await db.taxCode.delete({ where: { id: tcZero.id } });
  });
});

describe('PostingService.postFromPayment (ACCRUAL mode)', () => {
  it('posts only Cash debit + AR credit, no VAT line (revenue was already recognized at booking)', async () => {
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'ACCRUAL' } });
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-09-01'),
        checkOut: new Date('2026-10-01'),
        totalAmount: 500,
        taxCodeId: taxCodeStandardId,
      },
    });
    const p = await db.payment.create({
      data: { bookingId: b.id, method: 'CASH', amount: 500, status: 'PAID', paidAt: new Date() },
    });
    const entry = await service().postFromPayment(p.id, userId);
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id } });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.debit.gt(0))?.accountId).toBe(cashId); // mapping AR_DEFAULT also points to cashId for now
    // cleanup
    await db.journalLine.deleteMany({ where: { journalEntryId: entry!.id } });
    await db.journalEntry.delete({ where: { id: entry!.id } });
    await db.payment.delete({ where: { id: p.id } });
    await db.booking.delete({ where: { id: b.id } });
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'CASH' } });
  });
});

describe('PostingService.postFromBookingCreated (ACCRUAL mode)', () => {
  beforeAll(async () => {
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'ACCRUAL' } });
  });
  afterAll(async () => {
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'CASH' } });
  });

  it('posts AR + Revenue + VAT for a new booking with standard tax', async () => {
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-06-01'),
        checkOut: new Date('2026-09-01'),
        totalAmount: 10500,
        taxCodeId: taxCodeStandardId,
      },
    });
    const entry = await service().postFromBookingCreated(b.id, userId);
    expect(entry).not.toBeNull();
    const lines = await db.journalLine.findMany({ where: { journalEntryId: entry!.id } });
    expect(lines).toHaveLength(3);
    const arLine = lines.find((l) => l.debit.gt(0));
    expect(arLine?.debit.toFixed(2)).toBe('10500.00');
    const creditSum = lines
      .filter((l) => l.credit.gt(0))
      .reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0));
    expect(creditSum.toFixed(2)).toBe('10500.00');
    // cleanup
    await db.booking.update({ where: { id: b.id }, data: { revenuePostedEntryId: null } });
    await db.journalLine.deleteMany({ where: { journalEntryId: entry!.id } });
    await db.journalEntry.delete({ where: { id: entry!.id } });
    await db.booking.delete({ where: { id: b.id } });
  });

  it('is a no-op in CASH mode', async () => {
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'CASH' } });
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-08-01'),
        checkOut: new Date('2026-11-01'),
        totalAmount: 1000,
        taxCodeId: taxCodeStandardId,
      },
    });
    const result = await service().postFromBookingCreated(b.id, userId);
    expect(result).toBeNull();
    expect((await db.booking.findUnique({ where: { id: b.id } }))?.revenuePostedEntryId).toBeNull();
    await db.booking.delete({ where: { id: b.id } });
    await db.systemSettings.update({ where: { id: 1 }, data: { accountingMode: 'ACCRUAL' } });
  });

  it('is idempotent — does not create a second JE on repeat call', async () => {
    const apt = (await db.apartment.findFirst())!;
    const tenant = (await db.tenant.findFirst())!;
    const b = await db.booking.create({
      data: {
        apartmentId: apt.id,
        tenantId: tenant.id,
        checkIn: new Date('2026-10-01'),
        checkOut: new Date('2026-12-01'),
        totalAmount: 500,
        taxCodeId: taxCodeStandardId,
      },
    });
    const first = await service().postFromBookingCreated(b.id, userId);
    const before = await db.journalEntry.count();
    const second = await service().postFromBookingCreated(b.id, userId);
    const after = await db.journalEntry.count();
    expect(after).toBe(before);
    expect(second?.id).toBe(first?.id);
    // cleanup
    await db.booking.update({ where: { id: b.id }, data: { revenuePostedEntryId: null } });
    if (first) {
      await db.journalLine.deleteMany({ where: { journalEntryId: first.id } });
      await db.journalEntry.delete({ where: { id: first.id } });
    }
    await db.booking.delete({ where: { id: b.id } });
  });
});
