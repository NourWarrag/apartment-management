import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { MatchingService } from './matching.service';
import { PostingService } from './posting.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const posting = new PostingService(db as any);

let userId: number;
let bankGlId: number;
let revenueId: number;
let bankAccountId: number;
let reconciliationId: number;
let statementId: number;

beforeAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.fiscalPeriod.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'match@test.local' } });

  const u = await db.user.create({ data: { name: 'M', email: 'match@test.local', password: 'x', role: 'ADMIN' } });
  userId = u.id;

  const bank = await db.account.create({ data: { code: '1020', name: 'Bank', type: 'ASSET' } });
  const rev = await db.account.create({ data: { code: '4000', name: 'Revenue', type: 'INCOME' } });
  bankGlId = bank.id;
  revenueId = rev.id;

  const ba = await db.bankAccount.create({
    data: { name: 'Main', accountId: bankGlId, csvDateFormat: 'DD/MM/YYYY' },
  });
  bankAccountId = ba.id;

  const statement = await db.bankStatement.create({
    data: { bankAccountId, filename: 'test.csv', importedBy: userId, lineCount: 0 },
  });
  statementId = statement.id;

  const rec = await db.reconciliation.create({
    data: { bankAccountId, endDate: new Date('2026-05-31'), statementBalance: '0' },
  });
  reconciliationId = rec.id;
});

afterAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.reconciliation.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.fiscalPeriod.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'match@test.local' } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.reconciliationMatch.deleteMany();
});

const svc = () => new MatchingService(db as any);

async function postBankDeposit(amount: string, date: Date) {
  return posting.createAndPost(
    {
      date,
      lines: [
        { accountId: bankGlId, debit: amount },
        { accountId: revenueId, credit: amount },
      ],
    },
    userId,
  );
}

async function postBankWithdrawal(amount: string, date: Date) {
  return posting.createAndPost(
    {
      date,
      lines: [
        { accountId: revenueId, debit: amount },
        { accountId: bankGlId, credit: amount },
      ],
    },
    userId,
  );
}

async function createBankLine(amount: string, date: Date, description = 'test') {
  return db.bankStatementLine.create({
    data: { bankStatementId: statementId, bankAccountId, date, amount, description },
  });
}

describe('MatchingService.findAutoMatches', () => {
  beforeEach(async () => {
    await db.reconciliationMatch.deleteMany();
    await db.bankStatementLine.deleteMany();
    await db.journalLine.deleteMany();
    await db.journalEntry.deleteMany();
  });

  it('finds exact 1-to-1 matches within date window', async () => {
    const date = new Date('2026-05-15');
    await postBankDeposit('1050', date);
    const bankLine = await createBankLine('1050', date);

    const matches = await svc().findAutoMatches(reconciliationId);
    expect(matches).toHaveLength(1);
    expect(matches[0].bankStatementLineId).toBe(bankLine.id);
  });

  it('skips ambiguous matches (multiple GL candidates)', async () => {
    const date = new Date('2026-05-16');
    await postBankDeposit('500', date);
    await postBankDeposit('500', date);
    await createBankLine('500', date);

    const matches = await svc().findAutoMatches(reconciliationId);
    expect(matches).toHaveLength(0);
  });

  it('respects sign — withdrawal matches a credit', async () => {
    const date = new Date('2026-05-17');
    await postBankWithdrawal('50', date);
    await createBankLine('-50', date);

    const matches = await svc().findAutoMatches(reconciliationId);
    expect(matches).toHaveLength(1);
  });
});

describe('MatchingService.applyAutoMatches', () => {
  beforeEach(async () => {
    await db.reconciliationMatch.deleteMany();
    await db.bankStatementLine.deleteMany();
    await db.journalLine.deleteMany();
    await db.journalEntry.deleteMany();
  });

  it('persists all auto-matches in one call', async () => {
    const date = new Date('2026-05-18');
    await postBankDeposit('200', date);
    await createBankLine('200', date);
    const before = await db.reconciliationMatch.count();
    const count = await svc().applyAutoMatches(reconciliationId, userId);
    expect(count).toBe(1);
    expect(await db.reconciliationMatch.count()).toBe(before + 1);
  });
});

describe('MatchingService.manualMatch — N-to-1', () => {
  beforeEach(async () => {
    await db.reconciliationMatch.deleteMany();
    await db.bankStatementLine.deleteMany();
    await db.journalLine.deleteMany();
    await db.journalEntry.deleteMany();
  });

  it('matches multiple journal lines to one bank line when sums equal', async () => {
    const date = new Date('2026-05-19');
    const e1 = await postBankDeposit('500', date);
    const e2 = await postBankDeposit('300', date);
    const e3 = await postBankDeposit('200', date);
    const bankLine = await createBankLine('1000', date);

    const jLines = await db.journalLine.findMany({
      where: { journalEntryId: { in: [e1.id, e2.id, e3.id] }, accountId: bankGlId },
    });
    const matches = await svc().manualMatch(reconciliationId, bankLine.id, jLines.map((l) => l.id), userId);
    expect(matches).toHaveLength(3);
  });

  it('rejects when sum does not equal bank line', async () => {
    const date = new Date('2026-05-20');
    const e1 = await postBankDeposit('500', date);
    const bankLine = await createBankLine('1000', date);
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: e1.id, accountId: bankGlId } });
    await expect(svc().manualMatch(reconciliationId, bankLine.id, [jLine!.id], userId))
      .rejects.toMatchObject({ code: 'UNBALANCED' });
  });

  it('rejects sign-flip (debits matched to a withdrawal)', async () => {
    const date = new Date('2026-05-21');
    const e1 = await postBankDeposit('100', date); // debit to bank
    const bankLine = await createBankLine('-100', date); // withdrawal
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: e1.id, accountId: bankGlId } });
    await expect(svc().manualMatch(reconciliationId, bankLine.id, [jLine!.id], userId))
      .rejects.toMatchObject({ code: 'INVALID_LINE' });
  });

  it('rejects already-matched journal lines', async () => {
    const date = new Date('2026-05-22');
    const e1 = await postBankDeposit('150', date);
    const bankLine1 = await createBankLine('150', date);
    const bankLine2 = await createBankLine('150', date);
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: e1.id, accountId: bankGlId } });
    await svc().manualMatch(reconciliationId, bankLine1.id, [jLine!.id], userId);
    await expect(svc().manualMatch(reconciliationId, bankLine2.id, [jLine!.id], userId))
      .rejects.toMatchObject({ code: 'LINE_ALREADY_MATCHED' });
  });
});

describe('MatchingService.unmatchByBankLine', () => {
  it('removes all matches for a bank line', async () => {
    await db.reconciliationMatch.deleteMany();
    await db.bankStatementLine.deleteMany();
    await db.journalLine.deleteMany();
    await db.journalEntry.deleteMany();

    const date = new Date('2026-05-23');
    const e1 = await postBankDeposit('75', date);
    const bankLine = await createBankLine('75', date);
    const jLine = await db.journalLine.findFirst({ where: { journalEntryId: e1.id, accountId: bankGlId } });
    await svc().manualMatch(reconciliationId, bankLine.id, [jLine!.id], userId);
    const removed = await svc().unmatchByBankLine(reconciliationId, bankLine.id);
    expect(removed).toBe(1);
    expect(await db.reconciliationMatch.count({ where: { bankStatementLineId: bankLine.id } })).toBe(0);
  });
});
