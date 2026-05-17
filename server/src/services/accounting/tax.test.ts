import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { splitTaxInclusive } from './tax';

const D = (n: string) => new Prisma.Decimal(n);

describe('splitTaxInclusive', () => {
  it('splits 105 at 5% into net=100, vat=5 (canonical case)', () => {
    const r = splitTaxInclusive(D('105'), D('5'));
    expect(r.net.toFixed(2)).toBe('100.00');
    expect(r.vat.toFixed(2)).toBe('5.00');
  });

  it('splits 100 at 5% with HALF_EVEN rounding: vat=4.76, net=95.24', () => {
    const r = splitTaxInclusive(D('100'), D('5'));
    expect(r.net.toFixed(2)).toBe('95.24');
    expect(r.vat.toFixed(2)).toBe('4.76');
  });

  it('returns net=gross, vat=0 when rate is 0 — zero-rated and exempt cases', () => {
    const r = splitTaxInclusive(D('500'), D('0'));
    expect(r.net.toFixed(2)).toBe('500.00');
    expect(r.vat.toFixed(2)).toBe('0.00');
  });

  it('keeps the equation net + vat === gross exact to the cent', () => {
    for (const g of ['100', '105', '1234.56', '0.01', '999.99']) {
      const r = splitTaxInclusive(D(g), D('5'));
      expect(r.net.plus(r.vat).toFixed(2)).toBe(new Prisma.Decimal(g).toFixed(2));
    }
  });
});
