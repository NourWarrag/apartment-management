import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../src/lib/password';

describe('password helpers', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await comparePassword('secret123', hash)).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await comparePassword('wrong', hash)).toBe(false);
  });
});
