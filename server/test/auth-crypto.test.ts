import { describe, expect, it } from 'vitest';
import { hashPassword, issueSessionToken, readSessionToken, verifyPassword } from '../src/modules/auth/auth-crypto';

describe('auth crypto', () => {
  it('hashes and verifies a password without preserving plaintext', async () => {
    const password = 'valid-password-2026';
    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('signs an expiring session token', () => {
    const secret = 'test-session-secret-at-least-thirty-two-characters';
    const token = issueSessionToken('user-1', 3, secret, 60, 1000);

    expect(readSessionToken(token, secret, 2000)).toEqual({
      userId: 'user-1',
      sessionVersion: 3,
      expiresAt: 61000,
    });
    expect(readSessionToken(token, secret, 61001)).toBeNull();
    expect(readSessionToken(`${token}changed`, secret, 2000)).toBeNull();
  });
});
