import { Prisma } from '@prisma/client';

const ROUND_HALF_EVEN = Prisma.Decimal.ROUND_HALF_EVEN;

export function splitTaxInclusive(
  gross: Prisma.Decimal,
  ratePct: Prisma.Decimal,
): { net: Prisma.Decimal; vat: Prisma.Decimal } {
  if (ratePct.eq(0)) {
    return { net: gross, vat: new Prisma.Decimal(0) };
  }
  const vat = gross
    .times(ratePct)
    .div(ratePct.plus(100))
    .toDecimalPlaces(2, ROUND_HALF_EVEN);
  const net = gross.minus(vat);
  return { net, vat };
}
