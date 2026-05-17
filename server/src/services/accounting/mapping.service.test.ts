import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MappingService } from './mapping.service';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
let userId: number;
let cashId: number;

beforeAll(async () => {
  await db.accountMapping.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'mapping@test.local' } });

  const user = await db.user.create({
    data: { name: 'Mapping Test', email: 'mapping@test.local', password: 'x', role: 'ADMIN' },
  });
  userId = user.id;

  const a = await db.account.create({ data: { code: '1010', name: 'Cash', type: 'ASSET' } });
  cashId = a.id;
});

afterAll(async () => {
  await db.accountMapping.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany({ where: { email: 'mapping@test.local' } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.accountMapping.deleteMany();
});

const svc = () => new MappingService(db as any);

describe('MappingService.resolveAccount()', () => {
  it('returns the mapped account id for a known key', async () => {
    await db.accountMapping.create({ data: { key: 'CASH_METHOD', accountId: cashId } });
    const id = await svc().resolveAccount(db as any, 'CASH_METHOD');
    expect(id).toBe(cashId);
  });

  it('throws MAPPING_MISSING when the key is not mapped', async () => {
    await expect(svc().resolveAccount(db as any, 'CASH_METHOD'))
      .rejects.toMatchObject({ code: 'MAPPING_MISSING' });
  });
});

describe('MappingService.setMapping()', () => {
  it('creates a new mapping when one does not exist', async () => {
    await svc().setMapping('CASH_METHOD', cashId, userId);
    const row = await db.accountMapping.findUnique({ where: { key: 'CASH_METHOD' } });
    expect(row?.accountId).toBe(cashId);
  });

  it('updates an existing mapping', async () => {
    await db.accountMapping.create({ data: { key: 'CASH_METHOD', accountId: cashId } });
    const other = await db.account.create({ data: { code: '1011', name: 'Other', type: 'ASSET' } });
    await svc().setMapping('CASH_METHOD', other.id, userId);
    const row = await db.accountMapping.findUnique({ where: { key: 'CASH_METHOD' } });
    expect(row?.accountId).toBe(other.id);
  });
});

describe('MappingService.listAll()', () => {
  it('returns one row per known key, with accountId or null for unmapped', async () => {
    await db.accountMapping.create({ data: { key: 'CASH_METHOD', accountId: cashId } });
    const rows = await svc().listAll();
    expect(rows.find((r) => r.key === 'CASH_METHOD')?.accountId).toBe(cashId);
    expect(rows.find((r) => r.key === 'AR_DEFAULT')?.accountId).toBeNull();
  });
});
