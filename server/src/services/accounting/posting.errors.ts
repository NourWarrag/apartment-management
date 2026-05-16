import type { AccountingErrorCode } from '@hotel/shared';

export class AccountingError extends Error {
  public readonly code: AccountingErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: AccountingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AccountingError';
    this.code = code;
    this.details = details;
  }
}

export function isAccountingError(err: unknown): err is AccountingError {
  return err instanceof AccountingError;
}
