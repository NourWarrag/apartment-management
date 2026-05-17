import { PrismaClient, Prisma } from '@prisma/client';

export type VatReturnRow = {
  taxCodeId: number;
  code: string;
  name: string;
  ratePct: string;
  isExempt: boolean;
  output: { net: string; vat: string };
  input:  { net: string; vat: string };
};

export type VatReturnResult = {
  from: string;
  to:   string;
  rows: VatReturnRow[];
  outputVatTotal: string;
  inputVatTotal:  string;
  netVatDue:      string;
};

const toFixed2 = (d: Prisma.Decimal) => d.toFixed(2);

export class VatReturnService {
  constructor(private readonly prisma: PrismaClient) {}

  async vatReturn(from: Date, to: Date): Promise<VatReturnResult> {
    const taxCodes = await this.prisma.taxCode.findMany({ orderBy: { code: 'asc' } });
    const rows: VatReturnRow[] = [];

    let outputVatTotal = new Prisma.Decimal(0);
    let inputVatTotal = new Prisma.Decimal(0);

    for (const tc of taxCodes) {
      const taggedLines = await this.prisma.journalLine.findMany({
        where: {
          taxCodeId: tc.id,
          journalEntry: { status: 'POSTED', date: { gte: from, lte: to } },
        },
        include: {
          account: true,
          journalEntry: { include: { lines: true } },
        },
      });

      let outputNet = new Prisma.Decimal(0);
      let outputVat = new Prisma.Decimal(0);
      let inputNet  = new Prisma.Decimal(0);
      let inputVat  = new Prisma.Decimal(0);

      for (const line of taggedLines) {
        const isOutput = line.account.type === 'INCOME';
        const isInput  = line.account.type === 'EXPENSE';

        const netAmt = isOutput ? new Prisma.Decimal(line.credit) : new Prisma.Decimal(line.debit);

        const vatLine = line.journalEntry.lines.find(
          (l) => l.id !== line.id && l.accountId === tc.accountId,
        );
        const vatAmt = vatLine
          ? (isOutput ? new Prisma.Decimal(vatLine.credit) : new Prisma.Decimal(vatLine.debit))
          : new Prisma.Decimal(0);

        if (isOutput) { outputNet = outputNet.plus(netAmt); outputVat = outputVat.plus(vatAmt); }
        else if (isInput) { inputNet = inputNet.plus(netAmt); inputVat = inputVat.plus(vatAmt); }
      }

      outputVatTotal = outputVatTotal.plus(outputVat);
      inputVatTotal = inputVatTotal.plus(inputVat);

      rows.push({
        taxCodeId: tc.id,
        code: tc.code,
        name: tc.name,
        ratePct: tc.ratePct.toFixed(2),
        isExempt: tc.isExempt,
        output: { net: toFixed2(outputNet), vat: toFixed2(outputVat) },
        input:  { net: toFixed2(inputNet),  vat: toFixed2(inputVat) },
      });
    }

    return {
      from: from.toISOString(),
      to:   to.toISOString(),
      rows,
      outputVatTotal: toFixed2(outputVatTotal),
      inputVatTotal:  toFixed2(inputVatTotal),
      netVatDue:      toFixed2(outputVatTotal.minus(inputVatTotal)),
    };
  }
}
