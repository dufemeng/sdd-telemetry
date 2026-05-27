import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export interface SessionClaims {
  userId: string;
  sessionVersion: number;
  expiresAt: number;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const key = await derivePassword(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return ['scrypt', 'v1', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, version, nText, rText, pText, salt, keyText] = encodedHash.split('$');
  if (algorithm !== 'scrypt' || version !== 'v1' || !salt || !keyText) {
    return false;
  }

  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) {
    return false;
  }

  const expected = Buffer.from(keyText, 'base64url');
  if (expected.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }

  const actual = await derivePassword(password, salt, n, r, p);
  return timingSafeEqual(actual, expected);
}

export function issueSessionToken(
  userId: string,
  sessionVersion: number,
  secret: string,
  maxAgeSeconds: number,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      sessionVersion,
      expiresAt: now + maxAgeSeconds * 1000,
    } satisfies SessionClaims),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SessionClaims | null {
  if (!token) {
    return null;
  }
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !secureStringEqual(signature, sign(payload, secret))) {
    return null;
  }

  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SessionClaims>;
    if (
      typeof value.userId !== 'string' ||
      !Number.isSafeInteger(value.sessionVersion) ||
      typeof value.expiresAt !== 'number' ||
      value.expiresAt <= now
    ) {
      return null;
    }
    return {
      userId: value.userId,
      sessionVersion: value.sessionVersion!,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}

function derivePassword(
  password: string,
  salt: string,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: n, r, p, maxmem: SCRYPT_MAX_MEMORY },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      },
    );
  });
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function secureStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
