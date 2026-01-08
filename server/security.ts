import crypto from 'crypto';
import { log } from './index';

const FAILED_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;
const PROGRESSIVE_DELAY_BASE_MS = 1000;

// IP-based rate limiting for distributed attacks
const IP_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const IP_MAX_ATTEMPTS = 20; // Max attempts per IP in window
const IP_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min lockout

interface LoginAttemptRecord {
  attempts: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

interface IpRateLimitRecord {
  attempts: number;
  windowStart: number;
  lockedUntil: number | null;
}

// Email-based tracking (existing)
const loginAttempts = new Map<string, LoginAttemptRecord>();
// IP-based tracking (new)
const ipAttempts = new Map<string, IpRateLimitRecord>();
// Combined email+IP tracking for more granular control
const emailIpAttempts = new Map<string, LoginAttemptRecord>();

// Cleanup old records
setInterval(() => {
  const now = Date.now();
  
  // Clean email-based records
  Array.from(loginAttempts.entries()).forEach(([key, record]) => {
    if (now - record.lastAttempt > FAILED_ATTEMPTS_WINDOW_MS && !record.lockedUntil) {
      loginAttempts.delete(key);
    } else if (record.lockedUntil && now > record.lockedUntil) {
      loginAttempts.delete(key);
    }
  });
  
  // Clean IP-based records
  Array.from(ipAttempts.entries()).forEach(([key, record]) => {
    if (now - record.windowStart > IP_RATE_LIMIT_WINDOW_MS && !record.lockedUntil) {
      ipAttempts.delete(key);
    } else if (record.lockedUntil && now > record.lockedUntil) {
      ipAttempts.delete(key);
    }
  });
  
  // Clean email+IP combined records
  Array.from(emailIpAttempts.entries()).forEach(([key, record]) => {
    if (now - record.lastAttempt > FAILED_ATTEMPTS_WINDOW_MS && !record.lockedUntil) {
      emailIpAttempts.delete(key);
    } else if (record.lockedUntil && now > record.lockedUntil) {
      emailIpAttempts.delete(key);
    }
  });
}, 60 * 1000);

export function recordFailedLogin(email: string, ip?: string): void {
  const emailKey = email.toLowerCase().trim();
  const now = Date.now();
  
  // Track by email (original behavior)
  const existing = loginAttempts.get(emailKey);
  if (existing) {
    if (now - existing.lastAttempt > FAILED_ATTEMPTS_WINDOW_MS) {
      loginAttempts.set(emailKey, { attempts: 1, lastAttempt: now, lockedUntil: null });
    } else {
      existing.attempts++;
      existing.lastAttempt = now;
      if (existing.attempts >= MAX_FAILED_ATTEMPTS) {
        existing.lockedUntil = now + LOCKOUT_DURATION_MS;
        log(`Account locked due to too many failed attempts: ${emailKey}`, 'security');
      }
    }
  } else {
    loginAttempts.set(emailKey, { attempts: 1, lastAttempt: now, lockedUntil: null });
  }
  
  // Track by IP for distributed attack detection
  if (ip) {
    const ipRecord = ipAttempts.get(ip);
    if (ipRecord) {
      if (now - ipRecord.windowStart > IP_RATE_LIMIT_WINDOW_MS) {
        ipAttempts.set(ip, { attempts: 1, windowStart: now, lockedUntil: null });
      } else {
        ipRecord.attempts++;
        if (ipRecord.attempts >= IP_MAX_ATTEMPTS) {
          ipRecord.lockedUntil = now + IP_LOCKOUT_DURATION_MS;
          log(`IP blocked due to too many login attempts: ${ip}`, 'security');
        }
      }
    } else {
      ipAttempts.set(ip, { attempts: 1, windowStart: now, lockedUntil: null });
    }
    
    // Track by email+IP combo (tighter control per attacker)
    const comboKey = `${emailKey}:${ip}`;
    const comboRecord = emailIpAttempts.get(comboKey);
    if (comboRecord) {
      if (now - comboRecord.lastAttempt > FAILED_ATTEMPTS_WINDOW_MS) {
        emailIpAttempts.set(comboKey, { attempts: 1, lastAttempt: now, lockedUntil: null });
      } else {
        comboRecord.attempts++;
        comboRecord.lastAttempt = now;
        // Stricter limit for same email from same IP
        if (comboRecord.attempts >= 3) {
          comboRecord.lockedUntil = now + LOCKOUT_DURATION_MS;
          log(`Email+IP combo locked: ${comboKey}`, 'security');
        }
      }
    } else {
      emailIpAttempts.set(comboKey, { attempts: 1, lastAttempt: now, lockedUntil: null });
    }
  }
}

export function clearFailedLogins(email: string, ip?: string): void {
  const emailKey = email.toLowerCase().trim();
  loginAttempts.delete(emailKey);
  
  if (ip) {
    const comboKey = `${emailKey}:${ip}`;
    emailIpAttempts.delete(comboKey);
    // Don't clear IP record on success - still want to track overall IP behavior
  }
}

export function isAccountLocked(email: string, ip?: string): { locked: boolean; remainingMs?: number; reason?: string } {
  const emailKey = email.toLowerCase().trim();
  const now = Date.now();
  
  // Check IP lockout first (most restrictive)
  if (ip) {
    const ipRecord = ipAttempts.get(ip);
    if (ipRecord?.lockedUntil && now < ipRecord.lockedUntil) {
      return { 
        locked: true, 
        remainingMs: ipRecord.lockedUntil - now,
        reason: 'IP_BLOCKED'
      };
    }
    
    // Check email+IP combo lockout
    const comboKey = `${emailKey}:${ip}`;
    const comboRecord = emailIpAttempts.get(comboKey);
    if (comboRecord?.lockedUntil && now < comboRecord.lockedUntil) {
      return { 
        locked: true, 
        remainingMs: comboRecord.lockedUntil - now,
        reason: 'COMBO_BLOCKED'
      };
    }
  }
  
  // Check email lockout
  const record = loginAttempts.get(emailKey);
  if (!record || !record.lockedUntil) {
    return { locked: false };
  }

  if (now > record.lockedUntil) {
    loginAttempts.delete(emailKey);
    return { locked: false };
  }

  return { locked: true, remainingMs: record.lockedUntil - now, reason: 'EMAIL_BLOCKED' };
}

export function getProgressiveDelay(email: string, ip?: string): number {
  const emailKey = email.toLowerCase().trim();
  const record = loginAttempts.get(emailKey);
  let attempts = record?.attempts || 0;
  
  // Add IP-based attempts to increase delay for distributed attacks
  if (ip) {
    const ipRecord = ipAttempts.get(ip);
    if (ipRecord) {
      attempts = Math.max(attempts, Math.floor(ipRecord.attempts / 2));
    }
  }

  if (attempts === 0) {
    return 0;
  }

  return Math.min(PROGRESSIVE_DELAY_BASE_MS * Math.pow(2, attempts - 1), 10000);
}

export function isIpBlocked(ip: string): { blocked: boolean; remainingMs?: number } {
  const now = Date.now();
  const ipRecord = ipAttempts.get(ip);
  
  if (!ipRecord?.lockedUntil) {
    return { blocked: false };
  }
  
  if (now > ipRecord.lockedUntil) {
    ipAttempts.delete(ip);
    return { blocked: false };
  }
  
  return { blocked: true, remainingMs: ipRecord.lockedUntil - now };
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
