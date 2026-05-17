import { PrismaClient, Prisma } from '@prisma/client';
import { parseCsv, parseDate } from './csv-parser';
import { AccountingError } from './posting.errors';

export type PreviewResult = {
  columnCount: number;
  sampleRows: string[][];
};

export type ImportResult = {
  statementId: number;
  lineCount: number;
  dateRange: { from: string; to: string };
};

export class BankStatementService {
  constructor(private readonly prisma: PrismaClient) {}

  async preview(csvText: string): Promise<PreviewResult> {
    const rows = parseCsv(csvText);
    const sample = rows.slice(0, 20);
    return {
      columnCount: rows[0]?.length ?? 0,
      sampleRows: sample,
    };
  }

  async import(
    bankAccountId: number,
    filename: string,
    csvText: string,
    userId: number,
  ): Promise<ImportResult> {
    const ba = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!ba) {
      throw new AccountingError('BANK_ACCOUNT_NOT_FOUND', `BankAccount ${bankAccountId} not found`);
    }
    if (
      ba.csvDateColumn === null ||
      ba.csvAmountColumn === null ||
      ba.csvDescriptionColumn === null ||
      !ba.csvDateFormat
    ) {
      throw new AccountingError('BANK_STATEMENT_INVALID', 'CSV mapping not configured', { bankAccountId });
    }

    const rows = parseCsv(csvText);
    const dataRows = ba.csvHasHeader ? rows.slice(1) : rows;

    const parsed: {
      date: Date;
      amount: Prisma.Decimal;
      description: string;
      reference: string | null;
    }[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        const dateStr = row[ba.csvDateColumn!];
        const amtStr = row[ba.csvAmountColumn!];
        const descStr = row[ba.csvDescriptionColumn!];
        const refStr = ba.csvReferenceColumn !== null ? row[ba.csvReferenceColumn] : null;

        if (!dateStr || !amtStr) {
          throw new Error(`Missing date or amount`);
        }

        const date = parseDate(dateStr, ba.csvDateFormat!);
        const amount = new Prisma.Decimal(amtStr.replace(/,/g, ''));

        parsed.push({
          date,
          amount,
          description: descStr ?? '',
          reference: refStr || null,
        });
      } catch (err: any) {
        throw new AccountingError(
          'BANK_STATEMENT_INVALID',
          `Row ${i + 1}: ${err.message}`,
          { row: i + 1 },
        );
      }
    }

    if (parsed.length === 0) {
      throw new AccountingError('BANK_STATEMENT_INVALID', 'CSV has no data rows');
    }

    return this.prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: {
          bankAccountId,
          filename,
          importedBy: userId,
          lineCount: parsed.length,
        },
      });

      await tx.bankStatementLine.createMany({
        data: parsed.map((p) => ({
          bankStatementId: statement.id,
          bankAccountId,
          date: p.date,
          amount: p.amount,
          description: p.description,
          reference: p.reference,
        })),
      });

      const dates = parsed.map((p) => p.date).sort((a, b) => a.getTime() - b.getTime());

      return {
        statementId: statement.id,
        lineCount: parsed.length,
        dateRange: {
          from: dates[0].toISOString(),
          to: dates[dates.length - 1].toISOString(),
        },
      };
    });
  }
}
