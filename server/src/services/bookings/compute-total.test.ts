import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { computeBookingTotal, BookingComponents, TaxableFlags } from './compute-total';

const Dec = (s: string | number) => new Prisma.Decimal(s);

const allTaxable: TaxableFlags = {
  rentTaxable: true,
  serviceChargeTaxable: true,
  parkingTaxable: true,
  cleaningTaxable: true,
};

const noTax: TaxableFlags = {
  rentTaxable: false,
  serviceChargeTaxable: false,
  parkingTaxable: false,
  cleaningTaxable: false,
};

describe('computeBookingTotal', () => {
  it('returns rent only when other components are zero and no VAT', () => {
    const components: BookingComponents = {
      rentAmount: Dec(1000),
      serviceCharge: Dec(0),
      parkingFee: Dec(0),
      cleaningFee: Dec(0),
      discountAmount: Dec(0),
    };
    const result = computeBookingTotal(components, Dec(0), allTaxable);
    expect(result.subtotal.toString()).toBe('1000');
    expect(result.taxableSubtotal.toString()).toBe('1000');
    expect(result.vatAmount.toString()).toBe('0');
    expect(result.totalAmount.toString()).toBe('1000');
  });

  it('sums all components into subtotal', () => {
    const components: BookingComponents = {
      rentAmount: Dec(1000),
      serviceCharge: Dec(100),
      parkingFee: Dec(50),
      cleaningFee: Dec(75),
      discountAmount: Dec(0),
    };
    const result = computeBookingTotal(components, Dec(0), allTaxable);
    expect(result.subtotal.toString()).toBe('1225');
    expect(result.totalAmount.toString()).toBe('1225');
  });

  it('subtracts discount from taxable subtotal and from total', () => {
    const components: BookingComponents = {
      rentAmount: Dec(1000),
      serviceCharge: Dec(0),
      parkingFee: Dec(0),
      cleaningFee: Dec(0),
      discountAmount: Dec(100),
    };
    const result = computeBookingTotal(components, Dec(0), allTaxable);
    expect(result.subtotal.toString()).toBe('1000');
    expect(result.taxableSubtotal.toString()).toBe('900');
    expect(result.vatAmount.toString()).toBe('0');
    expect(result.totalAmount.toString()).toBe('900');
  });

  it('applies VAT on top when all components are taxable', () => {
    const components: BookingComponents = {
      rentAmount: Dec(1000),
      serviceCharge: Dec(100),
      parkingFee: Dec(0),
      cleaningFee: Dec(0),
      discountAmount: Dec(0),
    };
    const result = computeBookingTotal(components, Dec(5), allTaxable);
    expect(result.taxableSubtotal.toString()).toBe('1100');
    expect(result.vatAmount.toString()).toBe('55');
    expect(result.totalAmount.toString()).toBe('1155');
  });

  it('excludes non-taxable components from VAT base', () => {
    const components: BookingComponents = {
      rentAmount: Dec(1000),
      serviceCharge: Dec(100),
      parkingFee: Dec(50),
      cleaningFee: Dec(0),
      discountAmount: Dec(0),
    };
    const result = computeBookingTotal(components, Dec(5), {
      rentTaxable: true,
      serviceChargeTaxable: false,
      parkingTaxable: true,
      cleaningTaxable: true,
    });
    expect(result.taxableSubtotal.toString()).toBe('1050');
    expect(result.vatAmount.toString()).toBe('52.5');
    expect(result.totalAmount.toString()).toBe('1202.5');
  });

  it('discount reduces taxable subtotal even when individual components are taxable', () => {
    const components: BookingComponents = {
      rentAmount: Dec(1000),
      serviceCharge: Dec(0),
      parkingFee: Dec(0),
      cleaningFee: Dec(0),
      discountAmount: Dec(200),
    };
    const result = computeBookingTotal(components, Dec(5), allTaxable);
    expect(result.taxableSubtotal.toString()).toBe('800');
    expect(result.vatAmount.toString()).toBe('40');
    expect(result.totalAmount.toString()).toBe('840');
  });

  it('zero rate produces zero VAT regardless of taxable flags', () => {
    const components: BookingComponents = {
      rentAmount: Dec(1000),
      serviceCharge: Dec(0),
      parkingFee: Dec(0),
      cleaningFee: Dec(0),
      discountAmount: Dec(0),
    };
    const result = computeBookingTotal(components, Dec(0), allTaxable);
    expect(result.vatAmount.toString()).toBe('0');
  });

  it('all-noTax flags produce zero VAT', () => {
    const components: BookingComponents = {
      rentAmount: Dec(1000),
      serviceCharge: Dec(100),
      parkingFee: Dec(0),
      cleaningFee: Dec(0),
      discountAmount: Dec(0),
    };
    const result = computeBookingTotal(components, Dec(5), noTax);
    expect(result.taxableSubtotal.toString()).toBe('0');
    expect(result.vatAmount.toString()).toBe('0');
    expect(result.totalAmount.toString()).toBe('1100');
  });

  it('rounds VAT to 2 decimals (banker-safe via Decimal)', () => {
    const components: BookingComponents = {
      rentAmount: Dec('333.33'),
      serviceCharge: Dec(0),
      parkingFee: Dec(0),
      cleaningFee: Dec(0),
      discountAmount: Dec(0),
    };
    const result = computeBookingTotal(components, Dec(5), allTaxable);
    expect(result.vatAmount.toString()).toBe('16.67');
    expect(result.totalAmount.toString()).toBe('350');
  });

  it('discount larger than taxable base produces negative taxable subtotal but VAT clamped to zero', () => {
    const components: BookingComponents = {
      rentAmount: Dec(100),
      serviceCharge: Dec(0),
      parkingFee: Dec(0),
      cleaningFee: Dec(0),
      discountAmount: Dec(500),
    };
    const result = computeBookingTotal(components, Dec(5), allTaxable);
    expect(result.vatAmount.toString()).toBe('0');
    expect(result.totalAmount.toString()).toBe('-400');
  });
});
