import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ReportsService } from '../services/accounting/reports.service';

const reports = new ReportsService(prisma as any);

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function incomeStatement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, buildingId } = req.query as { from?: string; to?: string; buildingId?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const result = await reports.incomeStatement({
      from: new Date(from), to: new Date(to),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function incomeStatementCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, buildingId } = req.query as { from?: string; to?: string; buildingId?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const r = await reports.incomeStatement({
      from: new Date(from), to: new Date(to),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="income-statement-${from}-${to}.csv"`);
    res.write('Section,Code,Name,Amount\n');
    for (const row of r.income.rows) res.write(['Income', row.code, row.name, row.amount].map((v) => csvEscape(String(v))).join(',') + '\n');
    res.write(`Income,,,Total,${r.income.total}\n`);
    for (const row of r.expenses.rows) res.write(['Expenses', row.code, row.name, row.amount].map((v) => csvEscape(String(v))).join(',') + '\n');
    res.write(`Expenses,,,Total,${r.expenses.total}\n`);
    res.write(`Net Income,,,,${r.netIncome}\n`);
    res.end();
  } catch (err) { next(err); }
}

export async function balanceSheet(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { asOf, buildingId } = req.query as { asOf?: string; buildingId?: string };
    if (!asOf) { res.status(400).json({ message: 'asOf query param required' }); return; }
    const result = await reports.balanceSheet({
      asOf: new Date(asOf),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function balanceSheetCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { asOf, buildingId } = req.query as { asOf?: string; buildingId?: string };
    if (!asOf) { res.status(400).json({ message: 'asOf query param required' }); return; }
    const r = await reports.balanceSheet({
      asOf: new Date(asOf),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="balance-sheet-${asOf}.csv"`);
    res.write('Section,Code,Name,Balance\n');
    for (const sec of [r.assets, r.liabilities, r.equity]) {
      for (const row of sec.rows) res.write([sec.type, row.code, row.name, row.balance].map((v) => csvEscape(String(v))).join(',') + '\n');
      res.write(`${sec.type},,,Total,${sec.total}\n`);
    }
    res.write(`EQUITY,,,Current Year Earnings,${r.currentYearIncome}\n`);
    res.write(`,,,Total Liabilities + Equity,${r.totalLiabilitiesAndEquity}\n`);
    res.end();
  } catch (err) { next(err); }
}

export async function cashFlow(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, buildingId } = req.query as { from?: string; to?: string; buildingId?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const result = await reports.cashFlow({
      from: new Date(from), to: new Date(to),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function cashFlowCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, buildingId } = req.query as { from?: string; to?: string; buildingId?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const r = await reports.cashFlow({
      from: new Date(from), to: new Date(to),
      buildingId: buildingId ? Number(buildingId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cash-flow-${from}-${to}.csv"`);
    res.write('Line,Detail,Amount\n');
    res.write(`Net Income,,${r.netIncome}\n`);
    for (const wc of r.workingCapitalChanges) {
      res.write(['Working Capital', `${wc.code} ${wc.name}`, wc.change].map((v) => csvEscape(String(v))).join(',') + '\n');
    }
    res.write(`Net Cash from Operations,,${r.netCashFromOperations}\n`);
    res.write(`Beginning Cash,,${r.beginningCash}\n`);
    res.write(`Ending Cash,,${r.endingCash}\n`);
    res.end();
  } catch (err) { next(err); }
}
