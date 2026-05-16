import { Prisma, PrismaClient, JournalEntry, JEStatus } from '@prisma/client';
import { AccountingError } from './posting.errors';

type Decimalish = string | number | Prisma.Decimal;

export type LineInput = {
  accountId: number;
  buildingId?: number | null;
  debit?: Decimalish;
  credit?: Decimalish;
  description?: string;
};

export type EntryInput = {
  date: Date;
  memo?: string;
  buildingId?: number | null;
  lines: LineInput[];
  source?: 'MANUAL' | 'PAYMENT_AUTO' | 'VAT_ADJUST' | 'YEAR_END_CLOSE';
  sourceRefId?: number | null;
};

const ZERO = new Prisma.Decimal(0);
const toDec = (v: Decimalish | undefined): Prisma.Decimal =>
  v === undefined || v === null || v === '' ? ZERO : new Prisma.Decimal(v as any);

export class PostingService {
  constructor(private readonly prisma: PrismaClient) {}

  async createDraft(input: EntryInput, userId: number): Promise<JournalEntry> {
    const preparedLines = this.prepareLinesForWrite(input.lines);
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber: `DRAFT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          date: input.date,
          memo: input.memo ?? null,
          buildingId: input.buildingId ?? null,
          status: JEStatus.DRAFT,
          source: input.source ?? 'MANUAL',
          sourceRefId: input.sourceRefId ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      if (preparedLines.length > 0) {
        await tx.journalLine.createMany({
          data: preparedLines.map((l) => ({ ...l, journalEntryId: entry.id })),
        });
      }

      return entry;
    });
  }

  async updateDraft(id: number, input: EntryInput, userId: number): Promise<JournalEntry> {
    const preparedLines = this.prepareLinesForWrite(input.lines);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.journalEntry.findUnique({ where: { id } });
      if (!existing) throw new AccountingError('INVALID_LINE', `Entry ${id} not found`);
      if (existing.status !== JEStatus.DRAFT) {
        throw new AccountingError('ALREADY_POSTED', 'Cannot edit a posted entry');
      }

      await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
      const updated = await tx.journalEntry.update({
        where: { id },
        data: {
          date: input.date,
          memo: input.memo ?? null,
          buildingId: input.buildingId ?? null,
          updatedBy: userId,
        },
      });

      if (preparedLines.length > 0) {
        await tx.journalLine.createMany({
          data: preparedLines.map((l) => ({ ...l, journalEntryId: id })),
        });
      }

      return updated;
    });
  }

  async deleteDraft(id: number, _userId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const e = await tx.journalEntry.findUnique({ where: { id } });
      if (!e) return;
      if (e.status !== JEStatus.DRAFT) {
        throw new AccountingError('ALREADY_POSTED', 'Cannot delete a posted entry');
      }
      await tx.journalEntry.delete({ where: { id } });
    });
  }

  async post(id: number, userId: number): Promise<JournalEntry> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the row for the duration of the transaction
      await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE id = ${id} FOR UPDATE`;

      const entry = await tx.journalEntry.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!entry) throw new AccountingError('INVALID_LINE', `Entry ${id} not found`);
      if (entry.status !== JEStatus.DRAFT) {
        throw new AccountingError('ALREADY_POSTED', 'Entry is already posted');
      }

      await this.validate(tx, entry.lines, entry.buildingId);

      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('journal_entry_number_seq') AS nextval
      `;
      const entryNumber = `JE-${String(nextval).padStart(6, '0')}`;

      return tx.journalEntry.update({
        where: { id },
        data: {
          entryNumber,
          status: JEStatus.POSTED,
          postedAt: new Date(),
          postedBy: userId,
          updatedBy: userId,
        },
      });
    });
  }

  async createAndPost(input: EntryInput, userId: number): Promise<JournalEntry> {
    const draft = await this.createDraft(input, userId);
    return this.post(draft.id, userId);
  }

  private prepareLinesForWrite(lines: LineInput[]): Array<{
    accountId: number;
    buildingId: number | null;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    description: string | null;
    lineOrder: number;
  }> {
    const result: ReturnType<PostingService['prepareLinesForWrite']> = [];
    let order = 0;
    for (const l of lines) {
      const d = toDec(l.debit);
      const c = toDec(l.credit);
      const isEmpty = !l.accountId && d.equals(0) && c.equals(0);
      if (isEmpty) continue; // skip placeholder rows

      if (d.lt(0) || c.lt(0)) {
        throw new AccountingError('INVALID_LINE', 'Debit and credit must be non-negative');
      }
      const dPos = d.gt(0);
      const cPos = c.gt(0);
      if ((dPos && cPos) || (!dPos && !cPos)) {
        throw new AccountingError('INVALID_LINE', 'Each line must have exactly one of debit or credit > 0');
      }

      result.push({
        accountId: l.accountId,
        buildingId: l.buildingId ?? null,
        debit: d,
        credit: c,
        description: l.description ?? null,
        lineOrder: order++,
      });
    }
    return result;
  }

  private async validate(
    tx: Prisma.TransactionClient,
    lines: Array<{ accountId: number; buildingId: number | null; debit: Prisma.Decimal; credit: Prisma.Decimal }>,
    headerBuildingId: number | null,
  ): Promise<void> {
    if (lines.length < 2) {
      throw new AccountingError('MIN_LINES', 'A journal entry must have at least 2 lines');
    }

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    for (const l of lines) {
      const d = new Prisma.Decimal(l.debit);
      const c = new Prisma.Decimal(l.credit);
      const dPos = d.gt(0);
      const cPos = c.gt(0);
      if (d.lt(0) || c.lt(0) || (dPos && cPos) || (!dPos && !cPos)) {
        throw new AccountingError('INVALID_LINE', 'Each line must have exactly one of debit or credit > 0');
      }
      totalDebit = totalDebit.plus(d);
      totalCredit = totalCredit.plus(c);
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new AccountingError('UNBALANCED', 'Debits do not equal credits', {
        diff: totalDebit.minus(totalCredit).toString(),
      });
    }

    const accountIds = Array.from(new Set(lines.map((l) => l.accountId)));
    const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } });
    if (accounts.length !== accountIds.length) {
      throw new AccountingError('INVALID_ACCOUNT', 'One or more accounts do not exist');
    }
    if (accounts.some((a) => !a.isActive)) {
      throw new AccountingError('INVALID_ACCOUNT', 'Cannot post to an inactive account');
    }

    const buildingIds = Array.from(
      new Set([headerBuildingId, ...lines.map((l) => l.buildingId)].filter((b): b is number => b != null)),
    );
    if (buildingIds.length > 0) {
      const buildings = await tx.building.findMany({ where: { id: { in: buildingIds } } });
      if (buildings.length !== buildingIds.length) {
        throw new AccountingError('INVALID_BUILDING', 'One or more buildings do not exist');
      }
    }
  }
}
