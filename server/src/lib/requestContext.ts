import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<{ userId: number | null }>();

export function getContextUserId(): number | null {
  return requestContext.getStore()?.userId ?? null;
}
