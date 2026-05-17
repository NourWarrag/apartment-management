import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BankStatementService } from './bank-statement.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let userId: number;
let bankAccountId: number;
let bankGlAccountId: number;

const SAMPLE_CSV =
  'Date,Description,Amount,Reference\n' +
  '01/05/2026,Rent Apt 1,1050.00,REF-001\n' +
  '03/05/2026,Bank fee,-25.00,REF-002\n';

beforeAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'bss@test.local' } });

  const u = await db.user.create({ data: { name: 'BS', email: 'bss@test.local', password: 'x', role: 'ADMIN' } });
  userId = u.id;

  const acc = await db.account.create({ data: { code: '1020', name: 'Bank', type: 'ASSET' } });
  bankGlAccountId = acc.id;
  const ba = await db.bankAccount.create({
    data: {
      name: 'Main Checking',
      accountId: bankGlAccountId,
      csvDateColumn: 0,
      csvDescriptionColumn: 1,
      csvAmountColumn: 2,
      csvReferenceColumn: 3,
      csvHasHeader: true,
      csvDateFormat: 'DD/MM/YYYY',
    },
  });
  bankAccountId = ba.id;
});

afterAll(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
  await db.bankAccount.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'bss@test.local' } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.reconciliationMatch.deleteMany();
  await db.bankStatementLine.deleteMany();
  await db.bankStatement.deleteMany();
});

const svc = () => new BankStatementService(db as any);

describe('BankStatementService.preview', () => {
  it('returns sample rows and column count without persisting', async () => {
    const r = await svc().preview(SAMPLE_CSV);
    expect(r.columnCount).toBe(4);
    expect(r.sampleRows.length).toBe(3); // header + 2 rows
    expect(r.sampleRows[1][0]).toBe('01/05/2026');
    expect(await db.bankStatement.count()).toBe(0);
  });
});

describe('BankStatementService.import', () => {
  it('persists statement + lines when mapping is set', async () => {
    const result = await svc().import(bankAccountId, 'main-may.csv', SAMPLE_CSV, userId);
    expect(result.lineCount).toBe(2);
    const lines = await db.bankStatementLine.findMany({ where: { bankStatementId: result.statementId }, orderBy: { date: 'asc' } });
    expect(lines).toHaveLength(2);
    expect(lines[0].amount.toFixed(2)).toBe('1050.00');
    expect(lines[1].amount.toFixed(2)).toBe('-25.00');
    expect(lines[0].description).toBe('Rent Apt 1');
    expect(lines[0].reference).toBe('REF-001');
  });

  it('throws BANK_STATEMENT_INVALID when mapping is unset', async () => {
    const newAccount = await db.account.create({ data: { code: '1099', name: 'X', type: 'ASSET' } });
    const newAcc = await db.bankAccount.create({
      data: { name: 'Unmapped', accountId: newAccount.id },
    });
    await expect(svc().import(newAcc.id, 'x.csv', SAMPLE_CSV, userId))
      .rejects.toMatchObject({ code: 'BANK_STATEMENT_INVALID' });
    await db.bankAccount.delete({ where: { id: newAcc.id } });
    await db.account.delete({ where: { id: newAccount.id } });
  });

  it('throws BANK_STATEMENT_INVALID with row number on parse failure (atomic)', async () => {
    const bad =
      'Date,Description,Amount,Reference\n' +
      '01/05/2026,Good,100.00,\n' +
      'bad-date,Bad,200.00,\n';
    await expect(svc().import(bankAccountId, 'bad.csv', bad, userId))
      .rejects.toMatchObject({ code: 'BANK_STATEMENT_INVALID', details: { row: 2 } });
    expect(await db.bankStatement.count()).toBe(0); // atomic rollback
  });
});
