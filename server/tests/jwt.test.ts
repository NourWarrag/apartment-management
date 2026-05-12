import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../src/lib/jwt';

describe('jwt helpers', () => {
  it('signs and verifies a payload', () => {
    const payload = { id: 1, role: 'ADMIN' };
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject(payload);
  });

  it('throws on invalid token', () => {
    expect(() => verifyToken('bad-token')).toThrow();
  });
});
