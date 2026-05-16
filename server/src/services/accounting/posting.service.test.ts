import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PostingService } from './posting.service';
import { AccountingError } from './posting.errors';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let userId: number;
let cashId: number;
let revenueId: number;
let inactiveId: number;

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
});

afterAll(async () => {
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
