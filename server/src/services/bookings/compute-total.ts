import { Prisma } from '@prisma/client';

export type Decimalish = string | number | Prisma.Decimal;

export interface BookingComponents {
  rentAmount: Prisma.Decimal | Decimalish;
  serviceCharge: Prisma.Decimal | Decimalish;
  parkingFee: Prisma.Decimal | Decimalish;
  cleaningFee: Prisma.Decimal | Decimalish;
  discountAmount: Prisma.Decimal | Decimalish;
}

export interface TaxableFlags {
  rentTaxable: boolean;
  serviceChargeTaxable: boolean;
  parkingTaxable: boolean;
  cleaningTaxable: boolean;
}

export interface BookingTotals {
  subtotal: Prisma.Decimal;
  taxableSubtotal: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);
const toDec = (v: Decimalish): Prisma.Decimal =>
  v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v as any);

export function computeBookingTotal(
  components: BookingComponents,
  taxRatePct: Decimalish,
  flags: TaxableFlags,
): BookingTotals {
  const rent = toDec(components.rentAmount);
  const service = toDec(components.serviceCharge);
  const parking = toDec(components.parkingFee);
  const cleaning = toDec(components.cleaningFee);
  const discount = toDec(components.discountAmount);
  const rate = toDec(taxRatePct);

  const subtotal = rent.plus(service).plus(parking).plus(cleaning);

  const taxableBeforeDiscount = (flags.rentTaxable ? rent : ZERO)
    .plus(flags.serviceChargeTaxable ? service : ZERO)
    .plus(flags.parkingTaxable ? parking : ZERO)
    .plus(flags.cleaningTaxable ? cleaning : ZERO);
  const taxableSubtotal = taxableBeforeDiscount.minus(discount);

  const vatAmount = taxableSubtotal.gt(0)
    ? taxableSubtotal.times(rate).dividedBy(HUNDRED).toDecimalPlaces(2)
    : ZERO;

  const totalAmount = subtotal.minus(discount).plus(vatAmount);

  return { subtotal, taxableSubtotal, vatAmount, totalAmount };
}
