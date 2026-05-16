import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ReportsService } from '../services/accounting/reports.service';

const reports = new ReportsService(prisma as any);

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function trialBalance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { asOf, buildingId } = req.query as { asOf?: string; buildingId?: string };
    const date = asOf ? new Date(asOf) : new Date();
    const rows = await reports.trialBalance({
      asOf: date,
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.json({ asOf: date.toISOString(), rows });
  } catch (err) { next(err); }
}

export async function trialBalanceCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { asOf, buildingId } = req.query as { asOf?: string; buildingId?: string };
    const date = asOf ? new Date(asOf) : new Date();
    const rows = await reports.trialBalance({
      asOf: date,
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="trial-balance-${date.toISOString().slice(0, 10)}.csv"`);
    res.write('Code,Name,Type,Debit,Credit,Net\n');
    for (const r of rows) {
      res.write([r.accountCode, r.accountName, r.accountType, r.totalDebit, r.totalCredit, r.netBalance]
        .map((x) => csvEscape(String(x))).join(',') + '\n');
    }
    res.end();
  } catch (err) { next(err); }
}

export async function generalLedger(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { accountIds, dateFrom, dateTo, buildingId } = req.query as Record<string, string>;
    if (!accountIds) { res.status(400).json({ message: 'accountIds is required' }); return; }
    const ids = accountIds.split(',').map((s) => Number(s)).filter((n) => !isNaN(n));
    const data = await reports.generalLedger({
      accountIds: ids,
      dateFrom: dateFrom ? new Date(dateFrom) : new Date('1970-01-01'),
      dateTo: dateTo ? new Date(dateTo) : new Date(),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.json(data);
  } catch (err) { next(err); }
}

export async function generalLedgerCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { accountIds, dateFrom, dateTo, buildingId } = req.query as Record<string, string>;
    if (!accountIds) { res.status(400).json({ message: 'accountIds is required' }); return; }
    const ids = accountIds.split(',').map((s) => Number(s)).filter((n) => !isNaN(n));
    const data = await reports.generalLedger({
      accountIds: ids,
      dateFrom: dateFrom ? new Date(dateFrom) : new Date('1970-01-01'),
      dateTo: dateTo ? new Date(dateTo) : new Date(),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="general-ledger.csv"`);
    res.write('Account,Date,Entry,Memo,Debit,Credit,Running\n');
    for (const acc of data) {
      res.write(`"${csvEscape(acc.accountCode)} ${csvEscape(acc.accountName)}","","Opening","",,${acc.openingBalance}\n`);
      for (const l of acc.lines) {
        res.write([`${acc.accountCode} ${acc.accountName}`, l.date, l.entryNumber, l.memo ?? '', l.debit, l.credit, l.runningBalance]
          .map((x) => csvEscape(String(x))).join(',') + '\n');
      }
      res.write(`"${csvEscape(acc.accountCode)} ${csvEscape(acc.accountName)}","","Closing","",,${acc.closingBalance}\n`);
    }
    res.end();
  } catch (err) { next(err); }
}
