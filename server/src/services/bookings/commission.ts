import { Prisma } from '@prisma/client';

export type Decimalish = string | number | Prisma.Decimal;

export interface BrokerLike {
  commissionType: 'PERCENT' | 'FLAT';
  defaultCommissionValue: Prisma.Decimal | Decimalish;
}

export interface AgentLike {
  commissionType: 'PERCENT' | 'FLAT' | null;
  commissionValueOverride: Prisma.Decimal | Decimalish | null;
}

export interface ResolveCommissionInput {
  broker: BrokerLike | null;
  agent: AgentLike | null;
  bookingTotal: Decimalish;
  override: Decimalish | undefined;
}

export interface ResolvedCommission {
  commissionType: 'PERCENT' | 'FLAT';
  commissionAmount: string;
}

const HUNDRED = new Prisma.Decimal(100);
const toDec = (v: Decimalish): Prisma.Decimal =>
  v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v as any);

export function resolveCommission(input: ResolveCommissionInput): ResolvedCommission | null {
  if (!input.broker) return null;

  const useAgentRate =
    input.agent &&
    input.agent.commissionType !== null &&
    input.agent.commissionValueOverride !== null;

  const commissionType = useAgentRate
    ? (input.agent!.commissionType as 'PERCENT' | 'FLAT')
    : input.broker.commissionType;

  const rateValue = useAgentRate
    ? toDec(input.agent!.commissionValueOverride as Decimalish)
    : toDec(input.broker.defaultCommissionValue);

  let amount: Prisma.Decimal;
  if (input.override !== undefined) {
    amount = toDec(input.override).toDecimalPlaces(2);
  } else if (commissionType === 'PERCENT') {
    amount = toDec(input.bookingTotal).times(rateValue).dividedBy(HUNDRED).toDecimalPlaces(2);
  } else {
    amount = rateValue.toDecimalPlaces(2);
  }

  return { commissionType, commissionAmount: amount.toString() };
}
