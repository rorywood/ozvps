import crypto from 'crypto';
import { log } from './index';

const FAILED_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;
const PROGRESSIVE_DELAY_BASE_MS = 1000;

interface LoginAttemptRecord {
  attempts: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

const loginAttempts = new Map<string, LoginAttemptRecord>();

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(loginAttempts.entries());
  for (const [key, record] of entries) {
    if (now - record.lastAttempt > FAILED_ATTEMPTS_WINDOW_MS && !record.lockedUntil) {
      loginAttempts.delete(key);
    } else if (record.lockedUntil && now > record.lockedUntil) {
      loginAttempts.delete(key);
    }
  }
}, 60 * 1000);

export function recordFailedLogin(email: string): void {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const existing = loginAttempts.get(key);

  if (existing) {
    if (now - existing.lastAttempt > FAILED_ATTEMPTS_WINDOW_MS) {
      loginAttempts.set(key, { attempts: 1, lastAttempt: now, lockedUntil: null });
    } else {
      existing.attempts++;
      existing.lastAttempt = now;
      if (existing.attempts >= MAX_FAILED_ATTEMPTS) {
        existing.lockedUntil = now + LOCKOUT_DURATION_MS;
        log(`Account locked due to too many failed attempts: ${key}`, 'security');
      }
    }
  } else {
    loginAttempts.set(key, { attempts: 1, lastAttempt: now, lockedUntil: null });
  }
}

export function clearFailedLogins(email: string): void {
  const key = email.toLowerCase().trim();
  loginAttempts.delete(key);
}

export function isAccountLocked(email: string): { locked: boolean; remainingMs?: number } {
  const key = email.toLowerCase().trim();
  const record = loginAttempts.get(key);

  if (!record || !record.lockedUntil) {
    return { locked: false };
  }

  const now = Date.now();
  if (now > record.lockedUntil) {
    loginAttempts.delete(key);
    return { locked: false };
  }

  return { locked: true, remainingMs: record.lockedUntil - now };
}

export function getProgressiveDelay(email: string): number {
  const key = email.toLowerCase().trim();
  const record = loginAttempts.get(key);

  if (!record || record.attempts === 0) {
    return 0;
  }

  return Math.min(PROGRESSIVE_DELAY_BASE_MS * Math.pow(2, record.attempts - 1), 10000);
}

export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  try {
    const payloadStr = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');

    const providedSig = signature.startsWith('sha256=') 
      ? signature.substring(7) 
      : signature;

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSig, 'hex')
    );
  } catch (error) {
    return false;
  }
}

export function getFailedAttemptCount(email: string): number {
  const key = email.toLowerCase().trim();
  const record = loginAttempts.get(key);
  return record?.attempts || 0;
}
