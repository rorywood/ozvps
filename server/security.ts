/**
 * Security utilities for brute-force protection and rate limiting
 * Uses PostgreSQL for persistent storage with in-memory caching for performance
 */

import crypto from 'crypto';
import { db } from './db';
import { rateLimits } from '@shared/schema';
import { eq, and, lt, or, isNull } from 'drizzle-orm';
import { log } from './log';

// Configuration constants
const FAILED_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 1000; // 5 seconds
const PROGRESSIVE_DELAY_BASE_MS = 1000;

// IP-based rate limiting for distributed attacks
const IP_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const IP_MAX_ATTEMPTS = 20; // Max attempts per IP in window
const IP_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes - prevents brute force retry

// Email+IP combo has stricter limits
const COMBO_MAX_ATTEMPTS = 3;

// Rate limit types
type RateLimitType = 'email' | 'ip' | 'email_ip_combo';

interface RateLimitRecord {
  attempts: number;
  windowStart: Date;
  lockedUntil: Date | null;
  lastAttempt: Date;
}

// In-memory cache for performance (reduces database queries)
// Cache is secondary to database - database is source of truth
const memoryCache = new Map<string, { record: RateLimitRecord; cachedAt: number }>();
const CACHE_TTL_MS = 5000; // 5 second cache TTL

function getCacheKey(type: RateLimitType, key: string): string {
  return `${type}:${key}`;
}

function getFromCache(type: RateLimitType, key: string): RateLimitRecord | null {
  const cacheKey = getCacheKey(type, key);
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.record;
  }
  memoryCache.delete(cacheKey);
  return null;
}

function setCache(type: RateLimitType, key: string, record: RateLimitRecord): void {
  const cacheKey = getCacheKey(type, key);
  memoryCache.set(cacheKey, { record, cachedAt: Date.now() });
}

function invalidateCache(type: RateLimitType, key: string): void {
  const cacheKey = getCacheKey(type, key);
  memoryCache.delete(cacheKey);
}

/**
 * Get or create a rate limit record from the database
 */
async function getRateLimitRecord(type: RateLimitType, key: string): Promise<RateLimitRecord | null> {
  // Check memory cache first
  const cached = getFromCache(type, key);
  if (cached) {
    return cached;
  }

  try {
    const result = await db
      .select()
      .from(rateLimits)
      .where(and(eq(rateLimits.limitType, type), eq(rateLimits.limitKey, key)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const dbRecord = result[0];
    const record: RateLimitRecord = {
      attempts: dbRecord.attempts,
      windowStart: dbRecord.windowStart,
      lockedUntil: dbRecord.lockedUntil,
      lastAttempt: dbRecord.lastAttempt,
    };

    setCache(type, key, record);
    return record;
  } catch (error: any) {
    log(`Error fetching rate limit record: ${error.message}`, 'security');
    return null;
  }
}

/**
 * Update or create a rate limit record in the database
 */
async function upsertRateLimitRecord(
  type: RateLimitType,
  key: string,
  record: RateLimitRecord
): Promise<void> {
  try {
    // Use upsert with ON CONFLICT
    await db
      .insert(rateLimits)
      .values({
        limitType: type,
        limitKey: key,
        attempts: record.attempts,
        windowStart: record.windowStart,
        lockedUntil: record.lockedUntil,
        lastAttempt: record.lastAttempt,
      })
      .onConflictDoUpdate({
        target: [rateLimits.limitType, rateLimits.limitKey],
        set: {
          attempts: record.attempts,
          windowStart: record.windowStart,
          lockedUntil: record.lockedUntil,
          lastAttempt: record.lastAttempt,
        },
      });

    // Update cache
    setCache(type, key, record);
  } catch (error: any) {
    log(`Error upserting rate limit record: ${error.message}`, 'security');
  }
}

/**
 * Delete a rate limit record from the database
 */
async function deleteRateLimitRecord(type: RateLimitType, key: string): Promise<void> {
  try {
    await db
      .delete(rateLimits)
      .where(and(eq(rateLimits.limitType, type), eq(rateLimits.limitKey, key)));

    invalidateCache(type, key);
  } catch (error: any) {
    log(`Error deleting rate limit record: ${error.message}`, 'security');
  }
}

/**
 * Clean up expired rate limit records from the database
 * Run periodically to prevent table bloat
 */
async function cleanupExpiredRecords(): Promise<void> {
  try {
    const now = new Date();
    const emailWindowCutoff = new Date(now.getTime() - FAILED_ATTEMPTS_WINDOW_MS);
    const ipWindowCutoff = new Date(now.getTime() - IP_RATE_LIMIT_WINDOW_MS);

    // Delete records that are:
    // 1. Not locked AND outside their tracking window
    // 2. Were locked but the lockout has expired
    await db.delete(rateLimits).where(
      or(
        // Unlocked records outside window
        and(
          isNull(rateLimits.lockedUntil),
          or(
            and(eq(rateLimits.limitType, 'email'), lt(rateLimits.lastAttempt, emailWindowCutoff)),
            and(eq(rateLimits.limitType, 'email_ip_combo'), lt(rateLimits.lastAttempt, emailWindowCutoff)),
            and(eq(rateLimits.limitType, 'ip'), lt(rateLimits.windowStart, ipWindowCutoff))
          )
        ),
        // Expired lockouts
        lt(rateLimits.lockedUntil, now)
      )
    );

    // Clear memory cache of potentially stale entries
    memoryCache.clear();
  } catch (error: any) {
    log(`Error cleaning up rate limit records: ${error.message}`, 'security');
  }
}

// Run cleanup every 60 seconds
setInterval(cleanupExpiredRecords, 60 * 1000);

/**
 * Record a failed login attempt
 * Tracks by email, IP, and email+IP combination
 */
export async function recordFailedLogin(email: string, ip?: string): Promise<void> {
  const emailKey = email.toLowerCase().trim();
  const now = new Date();
  const nowMs = now.getTime();

  // Track by email
  const emailRecord = await getRateLimitRecord('email', emailKey);
  if (emailRecord) {
    if (nowMs - emailRecord.lastAttempt.getTime() > FAILED_ATTEMPTS_WINDOW_MS) {
      // Window expired, reset
      await upsertRateLimitRecord('email', emailKey, {
        attempts: 1,
        windowStart: now,
        lockedUntil: null,
        lastAttempt: now,
      });
    } else {
      // Increment attempts
      const newAttempts = emailRecord.attempts + 1;
      const lockedUntil = newAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(nowMs + LOCKOUT_DURATION_MS)
        : emailRecord.lockedUntil;

      if (newAttempts >= MAX_FAILED_ATTEMPTS && !emailRecord.lockedUntil) {
        log(`Account locked due to too many failed attempts: ${emailKey}`, 'security');
      }

      await upsertRateLimitRecord('email', emailKey, {
        attempts: newAttempts,
        windowStart: emailRecord.windowStart,
        lockedUntil,
        lastAttempt: now,
      });
    }
  } else {
    await upsertRateLimitRecord('email', emailKey, {
      attempts: 1,
      windowStart: now,
      lockedUntil: null,
      lastAttempt: now,
    });
  }

  // Track by IP for distributed attack detection
  if (ip) {
    const ipRecord = await getRateLimitRecord('ip', ip);
    if (ipRecord) {
      if (nowMs - ipRecord.windowStart.getTime() > IP_RATE_LIMIT_WINDOW_MS) {
        // Window expired, reset
        await upsertRateLimitRecord('ip', ip, {
          attempts: 1,
          windowStart: now,
          lockedUntil: null,
          lastAttempt: now,
        });
      } else {
        // Increment attempts
        const newAttempts = ipRecord.attempts + 1;
        const lockedUntil = newAttempts >= IP_MAX_ATTEMPTS
          ? new Date(nowMs + IP_LOCKOUT_DURATION_MS)
          : ipRecord.lockedUntil;

        if (newAttempts >= IP_MAX_ATTEMPTS && !ipRecord.lockedUntil) {
          log(`IP blocked due to too many login attempts: ${ip}`, 'security');
        }

        await upsertRateLimitRecord('ip', ip, {
          attempts: newAttempts,
          windowStart: ipRecord.windowStart,
          lockedUntil,
          lastAttempt: now,
        });
      }
    } else {
      await upsertRateLimitRecord('ip', ip, {
        attempts: 1,
        windowStart: now,
        lockedUntil: null,
        lastAttempt: now,
      });
    }

    // Track by email+IP combo (tighter control per attacker)
    const comboKey = `${emailKey}:${ip}`;
    const comboRecord = await getRateLimitRecord('email_ip_combo', comboKey);
    if (comboRecord) {
      if (nowMs - comboRecord.lastAttempt.getTime() > FAILED_ATTEMPTS_WINDOW_MS) {
        // Window expired, reset
        await upsertRateLimitRecord('email_ip_combo', comboKey, {
          attempts: 1,
          windowStart: now,
          lockedUntil: null,
          lastAttempt: now,
        });
      } else {
        // Increment attempts - stricter limit for same email from same IP
        const newAttempts = comboRecord.attempts + 1;
        const lockedUntil = newAttempts >= COMBO_MAX_ATTEMPTS
          ? new Date(nowMs + LOCKOUT_DURATION_MS)
          : comboRecord.lockedUntil;

        if (newAttempts >= COMBO_MAX_ATTEMPTS && !comboRecord.lockedUntil) {
          log(`Email+IP combo locked: ${comboKey}`, 'security');
        }

        await upsertRateLimitRecord('email_ip_combo', comboKey, {
          attempts: newAttempts,
          windowStart: comboRecord.windowStart,
          lockedUntil,
          lastAttempt: now,
        });
      }
    } else {
      await upsertRateLimitRecord('email_ip_combo', comboKey, {
        attempts: 1,
        windowStart: now,
        lockedUntil: null,
        lastAttempt: now,
      });
    }
  }
}

/**
 * Clear failed login records on successful authentication
 */
export async function clearFailedLogins(email: string, ip?: string): Promise<void> {
  const emailKey = email.toLowerCase().trim();

  await deleteRateLimitRecord('email', emailKey);

  if (ip) {
    const comboKey = `${emailKey}:${ip}`;
    await deleteRateLimitRecord('email_ip_combo', comboKey);
    // Don't clear IP record on success - still want to track overall IP behavior
  }
}

/**
 * Check if an account is locked due to too many failed attempts
 */
export async function isAccountLocked(
  email: string,
  ip?: string
): Promise<{ locked: boolean; remainingMs?: number; reason?: string }> {
  const emailKey = email.toLowerCase().trim();
  const now = Date.now();

  // Check IP lockout first (most restrictive)
  if (ip) {
    const ipRecord = await getRateLimitRecord('ip', ip);
    if (ipRecord?.lockedUntil && now < ipRecord.lockedUntil.getTime()) {
      return {
        locked: true,
        remainingMs: ipRecord.lockedUntil.getTime() - now,
        reason: 'IP_BLOCKED',
      };
    }

    // Check email+IP combo lockout
    const comboKey = `${emailKey}:${ip}`;
    const comboRecord = await getRateLimitRecord('email_ip_combo', comboKey);
    if (comboRecord?.lockedUntil && now < comboRecord.lockedUntil.getTime()) {
      return {
        locked: true,
        remainingMs: comboRecord.lockedUntil.getTime() - now,
        reason: 'COMBO_BLOCKED',
      };
    }
  }

  // Check email lockout
  const emailRecord = await getRateLimitRecord('email', emailKey);
  if (!emailRecord?.lockedUntil) {
    return { locked: false };
  }

  if (now > emailRecord.lockedUntil.getTime()) {
    // Lockout expired, clean up
    await deleteRateLimitRecord('email', emailKey);
    return { locked: false };
  }

  return {
    locked: true,
    remainingMs: emailRecord.lockedUntil.getTime() - now,
    reason: 'EMAIL_BLOCKED',
  };
}

/**
 * Get progressive delay based on failed attempts
 */
export async function getProgressiveDelay(email: string, ip?: string): Promise<number> {
  const emailKey = email.toLowerCase().trim();
  const emailRecord = await getRateLimitRecord('email', emailKey);
  let attempts = emailRecord?.attempts || 0;

  // Add IP-based attempts to increase delay for distributed attacks
  if (ip) {
    const ipRecord = await getRateLimitRecord('ip', ip);
    if (ipRecord) {
      attempts = Math.max(attempts, Math.floor(ipRecord.attempts / 2));
    }
  }

  if (attempts === 0) {
    return 0;
  }

  // Exponential backoff with max delay of 5 seconds
  return Math.min(PROGRESSIVE_DELAY_BASE_MS * Math.pow(2, attempts - 1), 5000);
}

/**
 * Check if an IP address is blocked
 */
export async function isIpBlocked(ip: string): Promise<{ blocked: boolean; remainingMs?: number }> {
  const now = Date.now();
  const ipRecord = await getRateLimitRecord('ip', ip);

  if (!ipRecord?.lockedUntil) {
    return { blocked: false };
  }

  if (now > ipRecord.lockedUntil.getTime()) {
    await deleteRateLimitRecord('ip', ip);
    return { blocked: false };
  }

  return { blocked: true, remainingMs: ipRecord.lockedUntil.getTime() - now };
}

/**
 * Get the number of failed attempts for an email
 */
export async function getFailedAttemptCount(email: string): Promise<number> {
  const key = email.toLowerCase().trim();
  const record = await getRateLimitRecord('email', key);
  return record?.attempts || 0;
}

/**
 * Verify HMAC signature using timing-safe comparison
 */
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

/**
 * Admin function: Get all currently blocked/rate-limited entries
 * Returns entries that are either locked or have high attempt counts
 */
export async function getBlockedEntries(): Promise<Array<{
  type: RateLimitType;
  key: string;
  attempts: number;
  lockedUntil: Date | null;
  lastAttempt: Date;
  remainingMs: number | null;
}>> {
  try {
    const now = new Date();

    // Get all records from the database
    const records = await db
      .select()
      .from(rateLimits)
      .orderBy(rateLimits.lastAttempt);

    // Filter and format records that are either locked or have attempts
    return records
      .filter(r => r.attempts > 0 || (r.lockedUntil && r.lockedUntil > now))
      .map(r => ({
        type: r.limitType as RateLimitType,
        key: r.limitKey,
        attempts: r.attempts,
        lockedUntil: r.lockedUntil,
        lastAttempt: r.lastAttempt,
        remainingMs: r.lockedUntil && r.lockedUntil > now
          ? r.lockedUntil.getTime() - now.getTime()
          : null,
      }));
  } catch (error: any) {
    log(`Error fetching blocked entries: ${error.message}`, 'security');
    return [];
  }
}

/**
 * Admin function: Unblock a specific email, IP, or combo
 */
export async function adminUnblock(type: RateLimitType, key: string): Promise<boolean> {
  try {
    await deleteRateLimitRecord(type, key);
    log(`Admin unblocked ${type}: ${key}`, 'security');
    return true;
  } catch (error: any) {
    log(`Error unblocking ${type}:${key}: ${error.message}`, 'security');
    return false;
  }
}

/**
 * Admin function: Unblock all entries for a specific email
 * Clears email, and all email_ip_combo entries for that email
 */
export async function adminUnblockEmail(email: string): Promise<{ cleared: number }> {
  const emailKey = email.toLowerCase().trim();
  let cleared = 0;

  try {
    // Delete the email record
    await deleteRateLimitRecord('email', emailKey);
    cleared++;

    // Delete all combo records for this email
    const comboRecords = await db
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.limitType, 'email_ip_combo'));

    for (const record of comboRecords) {
      if (record.limitKey.startsWith(`${emailKey}:`)) {
        await deleteRateLimitRecord('email_ip_combo', record.limitKey);
        invalidateCache('email_ip_combo', record.limitKey);
        cleared++;
      }
    }

    log(`Admin unblocked email ${emailKey} (${cleared} records cleared)`, 'security');
    return { cleared };
  } catch (error: any) {
    log(`Error unblocking email ${emailKey}: ${error.message}`, 'security');
    return { cleared };
  }
}

/**
 * Admin function: Clear all rate limit records (nuclear option)
 */
export async function adminClearAllRateLimits(): Promise<{ cleared: number }> {
  try {
    const result = await db.delete(rateLimits);
    memoryCache.clear();
    log(`Admin cleared all rate limit records`, 'security');
    return { cleared: 0 }; // Drizzle doesn't return count easily
  } catch (error: any) {
    log(`Error clearing all rate limits: ${error.message}`, 'security');
    return { cleared: 0 };
  }
}
