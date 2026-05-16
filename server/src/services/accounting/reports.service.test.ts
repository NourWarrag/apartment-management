import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PostingService } from './posting.service';
import { ReportsService } from './reports.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);
const reports = new ReportsService(db as any);

let userId: number;
let cashId: number;
let revenueId: number;
let bldgA: number;
let bldgB: number;

beforeAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.building.deleteMany({ where: { code: { startsWith: 'TST-' } } });
  await db.user.deleteMany({ where: { email: 'reports@test.local' } });

  const user = await db.user.create({
    data: { name: 'Reports Test', email: 'reports@test.local', password: 'x', role: 'ADMIN' },
  });
  userId = user.id;

  const cash = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  const revenue = await db.account.create({ data: { code: '4000', name: 'Rental Revenue', type: 'INCOME' } });
  cashId = cash.id;
  revenueId = revenue.id;

  const a = await db.building.create({ data: { name: 'A', code: 'TST-A', address: '' } });
  const b = await db.building.create({ data: { name: 'B', code: 'TST-B', address: '' } });
  bldgA = a.id;
  bldgB = b.id;

  for (const amt of ['100', '50', '150']) {
    await posting.createAndPost(
      {
        date: new Date('2026-04-15'),
        buildingId: bldgA,
        lines: [
          { accountId: cashId, debit: amt },
          { accountId: revenueId, credit: amt },
        ],
      },
      userId,
    );
  }

  for (const amt of ['30', '50']) {
    await posting.createAndPost(
      {
        date: new Date('2026-05-10'),
        buildingId: bldgB,
        lines: [
          { accountId: cashId, debit: amt },
          { accountId: revenueId, credit: amt },
        ],
      },
      userId,
    );
  }

  // 1 draft — must be excluded from reports
  await posting.createDraft(
    {
      date: new Date('2026-05-10'),
      buildingId: bldgA,
      lines: [
        { accountId: cashId, debit: '9999' },
        { accountId: revenueId, credit: '9999' },
      ],
    },
    userId,
  );
});

afterAll(async () => {
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.building.deleteMany({ where: { code: { startsWith: 'TST-' } } });
  await db.user.deleteMany({ where: { email: 'reports@test.local' } });
  await db.$disconnect();
});

describe('ReportsService.trialBalance()', () => {
  it('aggregates posted entries only — drafts must not pollute totals', async () => {
    const rows = await reports.trialBalance({ asOf: new Date('2026-12-31') });
    const cash = rows.find((r) => r.accountId === cashId)!;
    const rev = rows.find((r) => r.accountId === revenueId)!;
    expect(cash.totalDebit).toBe('380.00');
    expect(rev.totalCredit).toBe('380.00');
  });

  it('grand totals equal each other — books are in balance', async () => {
    const rows = await reports.trialBalance({ asOf: new Date('2026-12-31') });
    const totalD = rows.reduce((s, r) => s + Number(r.totalDebit), 0);
    const totalC = rows.reduce((s, r) => s + Number(r.totalCredit), 0);
    expect(totalD).toBe(totalC);
  });

  it('filters by building — per-building books mode must isolate buildings', async () => {
    const rows = await reports.trialBalance({ asOf: new Date('2026-12-31'), buildingId: bldgB });
    const cash = rows.find((r) => r.accountId === cashId)!;
    expect(cash.totalDebit).toBe('80.00');
  });
});

describe('ReportsService.generalLedger()', () => {
  it('opening balance reflects pre-range activity — running balance starts from history', async () => {
    const gl = await reports.generalLedger({
      accountIds: [cashId],
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-12-31'),
    });
    const cashLines = gl.find((g) => g.accountId === cashId)!;
    expect(cashLines.openingBalance).toBe('300.00');
    expect(cashLines.closingBalance).toBe('380.00');
    expect(cashLines.lines.length).toBe(2);
  });
});
