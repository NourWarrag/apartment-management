export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  BUILDING_ADMIN = 'BUILDING_ADMIN',
  RECEPTIONIST = 'RECEPTIONIST',
  MAINTENANCE = 'MAINTENANCE',
  FINANCE = 'FINANCE',
}

export enum ApartmentStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
  RESERVED = 'RESERVED',
  CLEANING = 'CLEANING',
  PENDING_CHECKOUT = 'PENDING_CHECKOUT',
}

export enum ApartmentType {
  STUDIO = 'STUDIO',
  ONE_BEDROOM = 'ONE_BEDROOM',
  TWO_BEDROOM = 'TWO_BEDROOM',
  PENTHOUSE = 'PENTHOUSE',
}

export enum KycStatus {
  VERIFIED = 'VERIFIED',
  PENDING = 'PENDING',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
}

export enum TenantTier {
  NEW = 'NEW',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  INSTALLMENT = 'INSTALLMENT',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum DepositStatus {
  NONE = 'NONE',
  HELD = 'HELD',
  RELEASED = 'RELEASED',
  FORFEITED = 'FORFEITED',
}

export enum StaffStatus {
  ACTIVE = 'ACTIVE',
  ON_CALL = 'ON_CALL',
  OFF_DUTY = 'OFF_DUTY',
}

export enum TicketType {
  MAINTENANCE = 'MAINTENANCE',
  CLEANING = 'CLEANING',
}

export enum FeatureFlag {
  BOOKINGS = 'BOOKINGS',
  PAYMENTS = 'PAYMENTS',
  TICKETS = 'TICKETS',
  STAFF = 'STAFF',
  REPORTS = 'REPORTS',
  MULTI_BUILDING = 'MULTI_BUILDING',
  ACCOUNTING = 'ACCOUNTING',
}

export enum AttachmentEntity {
  APARTMENT = 'APARTMENT',
  TENANT = 'TENANT',
  BOOKING = 'BOOKING',
  TICKET = 'TICKET',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
}

export interface ApiError {
  message: string;
  field?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  assignedBuildingId: number | null;
}

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum JEStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
}

export enum JESource {
  MANUAL = 'MANUAL',
  PAYMENT_AUTO = 'PAYMENT_AUTO',
  VAT_ADJUST = 'VAT_ADJUST',
  YEAR_END_CLOSE = 'YEAR_END_CLOSE',
}

export enum BooksMode {
  CONSOLIDATED = 'CONSOLIDATED',
  PER_BUILDING = 'PER_BUILDING',
}

export type AccountingErrorCode =
  | 'UNBALANCED'
  | 'INVALID_LINE'
  | 'MIN_LINES'
  | 'INVALID_ACCOUNT'
  | 'INVALID_BUILDING'
  | 'ALREADY_POSTED'
  | 'MAPPING_MISSING'
  | 'ALREADY_REVERSED'
  | 'CANNOT_REVERSE'
  | 'PERIOD_LOCKED'
  | 'ALREADY_CLOSED'
  | 'BANK_ACCOUNT_NOT_FOUND'
  | 'BANK_STATEMENT_INVALID'
  | 'RECONCILIATION_CLOSED'
  | 'RECONCILIATION_UNBALANCED'
  | 'LINE_ALREADY_MATCHED';

export enum AccountingMode {
  CASH = 'CASH',
  ACCRUAL = 'ACCRUAL',
}

export enum BrokerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum BrokerAgentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum CommissionType {
  PERCENT = 'PERCENT',
  FLAT = 'FLAT',
}

export const MAPPING_KEYS = [
  'CASH_METHOD',
  'CARD_METHOD',
  'INSTALLMENT_METHOD',
  'AR_DEFAULT',
  'REVENUE_DEFAULT',
  'SERVICE_CHARGE_REVENUE',
  'PARKING_REVENUE',
  'CLEANING_REVENUE',
  'DISCOUNT_CONTRA_REVENUE',
  'DEPOSIT_LIABILITY',
  'DEPOSIT_FORFEIT_INCOME',
  'VAT_PAYABLE',
] as const;
export type MappingKey = typeof MAPPING_KEYS[number];

export enum FiscalPeriodStatus {
  OPEN = 'OPEN',
  LOCKED = 'LOCKED',
}

export enum ReconciliationStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}
