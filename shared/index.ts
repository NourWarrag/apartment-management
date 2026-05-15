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
