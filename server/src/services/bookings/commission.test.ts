import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { resolveCommission } from './commission';

const Dec = (v: string | number) => new Prisma.Decimal(v);

describe('resolveCommission', () => {
  it('returns null when there is no broker', () => {
    const result = resolveCommission({
      broker: null,
      agent: null,
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toBeNull();
  });

  it('uses broker default when no agent override is set', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(5) },
      agent: null,
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(50).toString(),
    });
  });

  it('uses agent override when both override type and value are set', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(5) },
      agent: { commissionType: 'PERCENT', commissionValueOverride: Dec(10) },
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(100).toString(),
    });
  });

  it('falls back to broker default when agent has type but no value', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(5) },
      agent: { commissionType: 'PERCENT', commissionValueOverride: null },
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(50).toString(),
    });
  });

  it('uses FLAT broker default ignoring booking total', () => {
    const result = resolveCommission({
      broker: { commissionType: 'FLAT', defaultCommissionValue: Dec(500) },
      agent: null,
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'FLAT',
      commissionAmount: Dec(500).toString(),
    });
  });

  it('lets staff override the final amount even when broker/agent dictate a default', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(5) },
      agent: null,
      bookingTotal: Dec(1000),
      override: 75,
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(75).toString(),
    });
  });

  it('rounds PERCENT result to 2 decimal places', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec('3.33') },
      agent: null,
      bookingTotal: Dec('333.33'),
      override: undefined,
    });
    expect(result?.commissionAmount).toBe('11.1');
  });

  it('returns null when broker is set but type/default is unusable AND no override given', () => {
    const result = resolveCommission({
      broker: { commissionType: 'PERCENT', defaultCommissionValue: Dec(0) },
      agent: null,
      bookingTotal: Dec(1000),
      override: undefined,
    });
    expect(result).toEqual({
      commissionType: 'PERCENT',
      commissionAmount: Dec(0).toString(),
    });
  });
});
