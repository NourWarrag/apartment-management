import { Prisma, PrismaClient, JournalEntry, JEStatus } from '@prisma/client';
import { AccountingError } from './posting.errors';
import { splitTaxInclusive } from './tax';
import { MappingService } from './mapping.service';

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

  private mapping = new MappingService(this.prisma);

  private async getAccountingMode(tx: Prisma.TransactionClient | PrismaClient): Promise<'CASH' | 'ACCRUAL'> {
    const s = await tx.systemSettings.findUnique({ where: { id: 1 } });
    return (s?.accountingMode ?? 'CASH') as 'CASH' | 'ACCRUAL';
  }

  private async getEffectiveTaxCode(
    tx: Prisma.TransactionClient | PrismaClient,
    taxCodeId: number | null,
  ) {
    if (taxCodeId !== null) {
      const tc = await tx.taxCode.findUnique({ where: { id: taxCodeId } });
      if (tc) return tc;
    }
    return tx.taxCode.findFirst({ where: { isDefault: true, isActive: true } });
  }

  async createDraft(input: EntryInput, userId: number, tx?: Prisma.TransactionClient): Promise<JournalEntry> {
    const preparedLines = this.prepareLinesForWrite(input.lines);
    const runner = async (db: Prisma.TransactionClient) => {
      const entry = await db.journalEntry.create({
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
        await db.journalLine.createMany({
          data: preparedLines.map((l) => ({ ...l, journalEntryId: entry.id })),
        });
      }

      return entry;
    };
    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async updateDraft(id: number, input: EntryInput, userId: number, tx?: Prisma.TransactionClient): Promise<JournalEntry> {
    const preparedLines = this.prepareLinesForWrite(input.lines);
    const runner = async (db: Prisma.TransactionClient) => {
      const existing = await db.journalEntry.findUnique({ where: { id } });
      if (!existing) throw new AccountingError('INVALID_LINE', `Entry ${id} not found`);
      if (existing.status !== JEStatus.DRAFT) {
        throw new AccountingError('ALREADY_POSTED', 'Cannot edit a posted entry');
      }

      await db.journalLine.deleteMany({ where: { journalEntryId: id } });
      const updated = await db.journalEntry.update({
        where: { id },
        data: {
          date: input.date,
          memo: input.memo ?? null,
          buildingId: input.buildingId ?? null,
          updatedBy: userId,
        },
      });

      if (preparedLines.length > 0) {
        await db.journalLine.createMany({
          data: preparedLines.map((l) => ({ ...l, journalEntryId: id })),
        });
      }

      return updated;
    };
    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async deleteDraft(id: number, _userId: number, tx?: Prisma.TransactionClient): Promise<void> {
    const runner = async (db: Prisma.TransactionClient) => {
      const e = await db.journalEntry.findUnique({ where: { id } });
      if (!e) return;
      if (e.status !== JEStatus.DRAFT) {
        throw new AccountingError('ALREADY_POSTED', 'Cannot delete a posted entry');
      }
      await db.journalEntry.delete({ where: { id } });
    };
    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async post(id: number, userId: number, tx?: Prisma.TransactionClient): Promise<JournalEntry> {
    const runner = async (db: Prisma.TransactionClient) => {
      // Lock the row for the duration of the transaction
      await db.$queryRaw`SELECT id FROM "JournalEntry" WHERE id = ${id} FOR UPDATE`;

      const entry = await db.journalEntry.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!entry) throw new AccountingError('INVALID_LINE', `Entry ${id} not found`);
      if (entry.status !== JEStatus.DRAFT) {
        throw new AccountingError('ALREADY_POSTED', 'Entry is already posted');
      }

      await this.validate(db, entry.lines, entry.buildingId);

      const [{ nextval }] = await db.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('journal_entry_number_seq') AS nextval
      `;
      const entryNumber = `JE-${String(nextval).padStart(6, '0')}`;

      return db.journalEntry.update({
        where: { id },
        data: {
          entryNumber,
          status: JEStatus.POSTED,
          postedAt: new Date(),
          postedBy: userId,
          updatedBy: userId,
        },
      });
    };
    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async createAndPost(input: EntryInput, userId: number, tx?: Prisma.TransactionClient): Promise<JournalEntry> {
    const runner = async (db: Prisma.TransactionClient) => {
      const draft = await this.createDraft(input, userId, db);
      return this.post(draft.id, userId, db);
    };
    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async postFromBookingCreated(
    bookingId: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntry | null> {
    const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry | null> => {
      const mode = await this.getAccountingMode(db);
      if (mode !== 'ACCRUAL') return null;

      const booking = await db.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        throw new AccountingError('INVALID_LINE', `Booking ${bookingId} not found`);
      }
      if (booking.revenuePostedEntryId) {
        return db.journalEntry.findUnique({ where: { id: booking.revenuePostedEntryId } });
      }

      const arId = await this.mapping.resolveAccount(db, 'AR_DEFAULT');
      const revenueAccountId = await this.mapping.resolveAccount(db, 'REVENUE_DEFAULT');
      const gross = new Prisma.Decimal(booking.totalAmount);
      const taxCode = await this.getEffectiveTaxCode(db, booking.taxCodeId);
      const rate = taxCode ? new Prisma.Decimal(taxCode.ratePct) : new Prisma.Decimal(0);
      const { net, vat } = splitTaxInclusive(gross, rate);

      const lines: LineInput[] = [
        { accountId: arId, debit: gross },
        { accountId: revenueAccountId, credit: net },
      ];
      if (vat.gt(0) && taxCode) {
        const vatAccountId = await this.mapping.resolveAccount(db, 'VAT_PAYABLE');
        lines.push({ accountId: vatAccountId, credit: vat });
      }

      const entry = await this.createAndPost(
        {
          date: booking.createdAt,
          memo: `Booking #${booking.id} revenue (accrual)`,
          buildingId: null,
          source: 'PAYMENT_AUTO',
          sourceRefId: booking.id,
          lines,
        },
        userId,
        db,
      );

      if (taxCode) {
        await db.journalLine.updateMany({
          where: { journalEntryId: entry.id, accountId: { not: arId } },
          data: { taxCodeId: taxCode.id },
        });
      }
      await db.booking.update({ where: { id: booking.id }, data: { revenuePostedEntryId: entry.id } });
      return entry;
    };

    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async postFromDepositTransition(
    bookingId: number,
    fromStatus: 'NONE' | 'HELD' | 'RELEASED' | 'FORFEITED',
    toStatus: 'NONE' | 'HELD' | 'RELEASED' | 'FORFEITED',
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntry | null> {
    const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry | null> => {
      const booking = await db.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        throw new AccountingError('INVALID_LINE', `Booking ${bookingId} not found`);
      }

      // Idempotency guard for the NONE→HELD transition only.
      // Subsequent transitions (RELEASED/FORFEITED) intentionally overwrite the
      // depositPostedEntryId, so they don't short-circuit on a set pointer.
      if (fromStatus === 'NONE' && toStatus === 'HELD' && booking.depositPostedEntryId) {
        return db.journalEntry.findUnique({ where: { id: booking.depositPostedEntryId } });
      }

      const cashAccountId = await this.mapping.resolveAccount(db, 'CASH_METHOD');
      const liabilityId = await this.mapping.resolveAccount(db, 'DEPOSIT_LIABILITY');
      const forfeitId = await this.mapping.resolveAccount(db, 'DEPOSIT_FORFEIT_INCOME');

      let lines: LineInput[];
      let memo: string;
      const depAmt = new Prisma.Decimal(booking.depositAmount ?? 0);

      if (fromStatus === 'NONE' && toStatus === 'HELD') {
        lines = [
          { accountId: cashAccountId, debit: depAmt },
          { accountId: liabilityId, credit: depAmt },
        ];
        memo = `Deposit collected for Booking #${booking.id}`;
      } else if (fromStatus === 'HELD' && toStatus === 'RELEASED') {
        lines = [
          { accountId: liabilityId, debit: depAmt },
          { accountId: cashAccountId, credit: depAmt },
        ];
        memo = `Deposit released for Booking #${booking.id}`;
      } else if (fromStatus === 'HELD' && toStatus === 'FORFEITED') {
        const refundAmt = new Prisma.Decimal(booking.depositRefundAmount ?? 0);
        const forfeitAmt = depAmt.minus(refundAmt);
        lines = [{ accountId: liabilityId, debit: depAmt }];
        if (refundAmt.gt(0)) lines.push({ accountId: cashAccountId, credit: refundAmt });
        if (forfeitAmt.gt(0)) lines.push({ accountId: forfeitId, credit: forfeitAmt });
        memo = `Deposit forfeited for Booking #${booking.id}`;
      } else {
        return null;
      }

      const entry = await this.createAndPost(
        {
          date: new Date(),
          memo,
          buildingId: null,
          source: 'PAYMENT_AUTO',
          sourceRefId: booking.id,
          lines,
        },
        userId,
        db,
      );

      await db.booking.update({
        where: { id: booking.id },
        data: { depositPostedEntryId: entry.id },
      });

      return entry;
    };

    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async reversePayment(
    paymentId: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntry | null> {
    const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry> => {
      const payment = await db.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        throw new AccountingError('INVALID_LINE', `Payment ${paymentId} not found`);
      }
      if (payment.status === 'REVERSED') {
        throw new AccountingError('ALREADY_REVERSED', 'Payment is already reversed');
      }
      if (payment.status !== 'PAID' || !payment.postedEntryId) {
        throw new AccountingError(
          'CANNOT_REVERSE',
          'Only PAID payments with a posted entry can be reversed',
          { status: payment.status, hasPostedEntry: !!payment.postedEntryId },
        );
      }

      const original = await db.journalEntry.findUnique({
        where: { id: payment.postedEntryId },
        include: { lines: true },
      });
      if (!original) {
        throw new AccountingError('INVALID_LINE', 'Original entry missing');
      }

      const reversingLines: LineInput[] = original.lines.map((l) => ({
        accountId: l.accountId,
        buildingId: l.buildingId,
        debit: l.credit,
        credit: l.debit,
        description: l.description ?? undefined,
      }));

      const entry = await this.createAndPost(
        {
          date: new Date(),
          memo: `Reversal of ${original.entryNumber}`,
          buildingId: original.buildingId,
          source: 'PAYMENT_AUTO',
          sourceRefId: payment.id,
          lines: reversingLines,
        },
        userId,
        db,
      );

      await db.payment.update({
        where: { id: paymentId },
        data: { status: 'REVERSED' },
      });

      return entry;
    };

    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
  }

  async postFromPayment(
    paymentId: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntry | null> {
    const runner = async (db: Prisma.TransactionClient): Promise<JournalEntry | null> => {
      const payment = await db.payment.findUnique({
        where: { id: paymentId },
        include: { booking: true },
      });
      if (!payment) {
        throw new AccountingError('INVALID_LINE', `Payment ${paymentId} not found`);
      }
      if (payment.postedEntryId) {
        // idempotency: already posted, return existing entry
        return db.journalEntry.findUnique({ where: { id: payment.postedEntryId } });
      }
      if (payment.status !== 'PAID') {
        // Defensive: callers should only call on PAID; silently no-op
        return null;
      }

      const mode = await this.getAccountingMode(db);
      const methodKey =
        payment.method === 'CASH' ? 'CASH_METHOD' :
        payment.method === 'CARD' ? 'CARD_METHOD' :
        'INSTALLMENT_METHOD';
      const methodAccountId = await this.mapping.resolveAccount(db, methodKey as any);
      const gross = new Prisma.Decimal(payment.amount);

      let lines: LineInput[];
      let memo: string;
      let taxCodeForLines: { id: number } | null = null;

      if (mode === 'ACCRUAL') {
        const arId = await this.mapping.resolveAccount(db, 'AR_DEFAULT');
        lines = [
          { accountId: methodAccountId, debit: gross },
          { accountId: arId, credit: gross },
        ];
        memo = `Cash collection: Payment #${payment.id}`;
      } else {
        // CASH mode
        const revenueAccountId = await this.mapping.resolveAccount(db, 'REVENUE_DEFAULT');
        const taxCode = await this.getEffectiveTaxCode(db, payment.booking.taxCodeId);
        const rate = taxCode ? new Prisma.Decimal(taxCode.ratePct) : new Prisma.Decimal(0);
        const { net, vat } = splitTaxInclusive(gross, rate);

        lines = [
          { accountId: methodAccountId, debit: gross },
          { accountId: revenueAccountId, credit: net },
        ];
        if (vat.gt(0) && taxCode) {
          const vatAccountId = await this.mapping.resolveAccount(db, 'VAT_PAYABLE');
          lines.push({ accountId: vatAccountId, credit: vat });
        }
        if (taxCode) taxCodeForLines = { id: taxCode.id };
        memo = `Payment #${payment.id} (${payment.method})`;
      }

      const entry = await this.createAndPost(
        {
          date: payment.paidAt ?? new Date(),
          memo,
          buildingId: null,
          source: 'PAYMENT_AUTO',
          sourceRefId: payment.id,
          lines,
        },
        userId,
        db,
      );

      // Tag non-cash lines with the tax code (CASH mode only)
      if (mode === 'CASH' && taxCodeForLines) {
        await db.journalLine.updateMany({
          where: { journalEntryId: entry.id, accountId: { not: methodAccountId } },
          data: { taxCodeId: taxCodeForLines.id },
        });
      }

      await db.payment.update({
        where: { id: paymentId },
        data: { postedEntryId: entry.id },
      });

      return entry;
    };

    if (tx) return runner(tx);
    return this.prisma.$transaction(runner);
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
