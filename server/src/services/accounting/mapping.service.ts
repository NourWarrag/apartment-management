import { Prisma, PrismaClient } from '@prisma/client';
import { MAPPING_KEYS, MappingKey } from '@hotel/shared';
import { AccountingError } from './posting.errors';

export class MappingService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveAccount(tx: Prisma.TransactionClient | PrismaClient, key: MappingKey): Promise<number> {
    const m = await tx.accountMapping.findUnique({ where: { key } });
    if (!m) {
      throw new AccountingError('MAPPING_MISSING', `No account mapped to ${key}`, { key });
    }
    return m.accountId;
  }

  async setMapping(key: MappingKey, accountId: number, userId: number) {
    return this.prisma.accountMapping.upsert({
      where: { key },
      create: { key, accountId, updatedBy: userId },
      update: { accountId, updatedBy: userId },
    });
  }

  async listAll(): Promise<Array<{ key: string; accountId: number | null; account: { code: string; name: string } | null }>> {
    const existing = await this.prisma.accountMapping.findMany({
      include: { account: { select: { code: true, name: true } } },
    });
    const byKey = new Map(existing.map((m) => [m.key, m]));
    return MAPPING_KEYS.map((key) => {
      const m = byKey.get(key);
      return {
        key,
        accountId: m?.accountId ?? null,
        account: m ? { code: m.account.code, name: m.account.name } : null,
      };
    });
  }
}
