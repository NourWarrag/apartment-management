import { PrismaClient } from '@prisma/client';

export const STARTER_ACCOUNTS = [
  { code: '1010', name: 'Cash on Hand', type: 'ASSET' as const },
  { code: '1020', name: 'Bank', type: 'ASSET' as const },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET' as const },
  { code: '2010', name: 'Accounts Payable', type: 'LIABILITY' as const },
  { code: '2050', name: 'Security Deposits Held', type: 'LIABILITY' as const },
  { code: '2100', name: 'VAT Payable', type: 'LIABILITY' as const },
  { code: '3010', name: "Owner's Equity", type: 'EQUITY' as const },
  { code: '3020', name: 'Retained Earnings', type: 'EQUITY' as const },
  { code: '4000', name: 'Rental Revenue', type: 'INCOME' as const },
  { code: '4010', name: 'Other Income', type: 'INCOME' as const },
  { code: '4020', name: 'Forfeited Deposit Income', type: 'INCOME' as const },
  { code: '5010', name: 'Utilities Expense', type: 'EXPENSE' as const },
  { code: '5020', name: 'Maintenance Expense', type: 'EXPENSE' as const },
  { code: '5030', name: 'Cleaning Expense', type: 'EXPENSE' as const },
  { code: '5040', name: 'Salaries Expense', type: 'EXPENSE' as const },
  { code: '5050', name: 'Office Expense', type: 'EXPENSE' as const },
];

export async function seedStarterChart(prisma: PrismaClient, userId: number): Promise<number> {
  let created = 0;
  for (const a of STARTER_ACCOUNTS) {
    const existing = await prisma.account.findUnique({ where: { code: a.code } });
    if (existing) continue;
    await prisma.account.create({
      data: { ...a, createdBy: userId, updatedBy: userId },
    });
    created++;
  }
  return created;
}
