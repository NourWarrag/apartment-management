import { PrismaClient } from '@prisma/client';
import { PostingService } from './posting.service';
import { isAccountingError } from './posting.errors';

export type BackfillFailure = {
  kind: 'payment' | 'booking-revenue' | 'booking-deposit';
  id: number;
  code: string;
  message: string;
};

export type BackfillResult = {
  processed: number;
  posted: number;
  skipped: number;
  failed: BackfillFailure[];
};

export class BackfillService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly posting: PostingService,
  ) {}

  async run(opts: { fromDate?: Date; userId: number }): Promise<BackfillResult> {
    const result: BackfillResult = { processed: 0, posted: 0, skipped: 0, failed: [] };
    const dateFilter = opts.fromDate ? { gte: opts.fromDate } : undefined;
    const mode = (await this.prisma.systemSettings.findUnique({ where: { id: 1 } }))?.accountingMode ?? 'CASH';

    if (mode === 'ACCRUAL') {
      const bookings = await this.prisma.booking.findMany({
        where: { revenuePostedEntryId: null, ...(dateFilter ? { createdAt: dateFilter } : {}) },
        orderBy: { createdAt: 'asc' },
      });
      for (const b of bookings) {
        result.processed++;
        try {
          const out = await this.posting.postFromBookingCreated(b.id, opts.userId);
          if (out) result.posted++; else result.skipped++;
        } catch (err) {
          if (isAccountingError(err)) {
            result.failed.push({ kind: 'booking-revenue', id: b.id, code: err.code, message: err.message });
          } else throw err;
        }
      }
    }

    const heldBookings = await this.prisma.booking.findMany({
      where: {
        depositStatus: 'HELD',
        depositPostedEntryId: null,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { depositCollectedAt: 'asc' },
    });
    for (const b of heldBookings) {
      result.processed++;
      try {
        const out = await this.posting.postFromDepositTransition(b.id, 'NONE', 'HELD', opts.userId);
        if (out) result.posted++; else result.skipped++;
      } catch (err) {
        if (isAccountingError(err)) {
          result.failed.push({ kind: 'booking-deposit', id: b.id, code: err.code, message: err.message });
        } else throw err;
      }
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'PAID',
        postedEntryId: null,
        ...(dateFilter ? { paidAt: dateFilter } : {}),
      },
      orderBy: { paidAt: 'asc' },
    });
    for (const p of payments) {
      result.processed++;
      try {
        const out = await this.posting.postFromPayment(p.id, opts.userId);
        if (out) result.posted++; else result.skipped++;
      } catch (err) {
        if (isAccountingError(err)) {
          result.failed.push({ kind: 'payment', id: p.id, code: err.code, message: err.message });
        } else throw err;
      }
    }

    return result;
  }
}
