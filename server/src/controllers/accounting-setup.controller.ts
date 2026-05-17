import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { seedStarterChart } from '../services/accounting/starter-chart';
import { MAPPING_KEYS, MappingKey } from '@hotel/shared';

const DEFAULT_TAX_CODES = [
  { code: 'VAT_STANDARD', name: 'VAT Standard', ratePct: 5, isDefault: true, isExempt: false },
  { code: 'VAT_ZERO', name: 'VAT Zero-rated', ratePct: 0, isDefault: false, isExempt: false },
  { code: 'VAT_EXEMPT', name: 'VAT Exempt', ratePct: 0, isDefault: false, isExempt: true },
];

const DEFAULT_MAPPINGS: { key: MappingKey; code: string }[] = [
  { key: 'CASH_METHOD', code: '1010' },
  { key: 'CARD_METHOD', code: '1020' },
  { key: 'INSTALLMENT_METHOD', code: '1020' },
  { key: 'AR_DEFAULT', code: '1100' },
  { key: 'REVENUE_DEFAULT', code: '4000' },
  { key: 'DEPOSIT_LIABILITY', code: '2050' },
  { key: 'DEPOSIT_FORFEIT_INCOME', code: '4020' },
  { key: 'VAT_PAYABLE', code: '2100' },
];

export async function setup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    const createdAccounts = await seedStarterChart(prisma as any, userId);

    const vatPayable = await prisma.account.findUnique({ where: { code: '2100' } });
    if (!vatPayable) {
      res.status(400).json({ message: 'VAT Payable account (code 2100) missing. Add it manually.' });
      return;
    }
    let createdTaxCodes = 0;
    for (const tc of DEFAULT_TAX_CODES) {
      const existing = await prisma.taxCode.findUnique({ where: { code: tc.code } });
      if (existing) continue;
      await prisma.taxCode.create({
        data: { ...tc, accountId: vatPayable.id, createdBy: userId, updatedBy: userId },
      });
      createdTaxCodes++;
    }

    let createdMappings = 0;
    const unmappedKeys: MappingKey[] = [];
    for (const { key, code } of DEFAULT_MAPPINGS) {
      const existing = await prisma.accountMapping.findUnique({ where: { key } });
      if (existing) continue;
      const acc = await prisma.account.findUnique({ where: { code } });
      if (!acc) {
        unmappedKeys.push(key);
        continue;
      }
      await prisma.accountMapping.create({ data: { key, accountId: acc.id, updatedBy: userId } });
      createdMappings++;
    }

    res.json({ createdAccounts, createdTaxCodes, createdMappings, unmappedKeys });
  } catch (err) { next(err); }
}
