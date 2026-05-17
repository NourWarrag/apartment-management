import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { VatReturnService } from '../services/accounting/vat-return.service';

const svc = new VatReturnService(prisma as any);

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function vatReturn(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const result = await svc.vatReturn(new Date(from), new Date(to));
    res.json(result);
  } catch (err) { next(err); }
}

export async function vatReturnCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) { res.status(400).json({ message: 'from and to query params required' }); return; }
    const result = await svc.vatReturn(new Date(from), new Date(to));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vat-return-${from}-${to}.csv"`);
    res.write('Tax Code,Name,Rate %,Output Net,Output VAT,Input Net,Input VAT\n');
    for (const r of result.rows) {
      res.write([r.code, r.name, r.ratePct, r.output.net, r.output.vat, r.input.net, r.input.vat]
        .map((x) => csvEscape(String(x))).join(',') + '\n');
    }
    res.write(`Output VAT Total,,,,${result.outputVatTotal}\n`);
    res.write(`Input VAT Total,,,,,,${result.inputVatTotal}\n`);
    res.write(`Net VAT Due,,,,${result.netVatDue}\n`);
    res.end();
  } catch (err) { next(err); }
}
