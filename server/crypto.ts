/**
 * Cryptographic utilities for secure storage
 * - AES-256-GCM encryption for TOTP secrets
 * - Argon2 hashing for backup codes
 */

import crypto from 'crypto';
import argon2 from 'argon2';

// Get encryption key from environment - REQUIRED in production
const ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// SECURITY: Validate encryption keys on startup - FAIL in production if weak
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  const message = `SESSION_SECRET must be at least 32 characters (current: ${SESSION_SECRET?.length || 0}).\n` +
    `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;

  if (IS_PRODUCTION) {
    throw new Error(`SECURITY ERROR: ${message}`);
  }
  console.warn(`⚠️  SECURITY WARNING: ${message}`);
}

if (IS_PRODUCTION && (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32)) {
  const message = `TOTP_ENCRYPTION_KEY must be at least 32 characters for production (current: ${ENCRYPTION_KEY?.length || 0}).\n` +
    `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
  throw new Error(`SECURITY ERROR: ${message}`);
} else if (ENCRYPTION_KEY && ENCRYPTION_KEY.length < 32) {
  console.warn(`⚠️  SECURITY WARNING: TOTP_ENCRYPTION_KEY should be at least 32 characters (current: ${ENCRYPTION_KEY.length})`);
}

// Cache the derived key to avoid repeated derivation
let cachedEncryptionKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  // Return cached key if available
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  if (ENCRYPTION_KEY) {
    // If key is hex-encoded (64 chars = 32 bytes)
    if (ENCRYPTION_KEY.length === 64 && /^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
      cachedEncryptionKey = Buffer.from(ENCRYPTION_KEY, 'hex');
    } else {
      // Otherwise derive from the key string
      cachedEncryptionKey = crypto.scryptSync(ENCRYPTION_KEY, 'totp-salt', 32);
    }
    return cachedEncryptionKey;
  }

  // Fallback to SESSION_SECRET if TOTP_ENCRYPTION_KEY not set
  if (SESSION_SECRET) {
    console.warn('WARNING: TOTP_ENCRYPTION_KEY not set. Using derived key from SESSION_SECRET.');
    cachedEncryptionKey = crypto.scryptSync(SESSION_SECRET, 'totp-salt', 32);
    return cachedEncryptionKey;
  }

  // SECURITY: Fail fast in production if no secrets are configured
  if (IS_PRODUCTION) {
    throw new Error(
      'SECURITY ERROR: Neither TOTP_ENCRYPTION_KEY nor SESSION_SECRET is configured. ' +
      'This is required in production to encrypt 2FA secrets. ' +
      'Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  // Development only: Use a derived key from a warning message
  console.error(
    '⚠️  SECURITY WARNING: No encryption key configured! ' +
    'Set TOTP_ENCRYPTION_KEY or SESSION_SECRET environment variable. ' +
    'Using insecure development key - DO NOT USE IN PRODUCTION!'
  );
  cachedEncryptionKey = crypto.scryptSync('INSECURE-DEV-KEY-DO-NOT-USE-IN-PRODUCTION', 'totp-salt', 32);
  return cachedEncryptionKey;
}

/**
 * Encrypt a TOTP secret using AES-256-GCM
 * @param plaintext The TOTP secret to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex encoded)
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a TOTP secret encrypted with encryptSecret
 * @param encryptedData The encrypted string in format: iv:authTag:ciphertext
 * @returns The decrypted TOTP secret
 */
export function decryptSecret(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a string is encrypted (has the iv:authTag:ciphertext format)
 */
export function isEncrypted(data: string): boolean {
  const parts = data.split(':');
  if (parts.length !== 3) return false;
  // Check if all parts are valid hex
  return parts.every(part => /^[0-9a-fA-F]+$/.test(part));
}

/**
 * Hash a backup code using Argon2id
 * @param code The backup code to hash
 * @returns The Argon2 hash
 */
export async function hashBackupCode(code: string): Promise<string> {
  return argon2.hash(code.toUpperCase(), {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a backup code against its Argon2 hash
 * @param code The backup code to verify
 * @param hash The stored Argon2 hash
 * @returns true if the code matches
 */
export async function verifyBackupCode(code: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, code.toUpperCase());
  } catch {
    return false;
  }
}

/**
 * Generate secure backup codes
 * @param count Number of codes to generate
 * @returns Object with plaintext codes and their hashes
 */
export async function generateBackupCodes(count: number = 10): Promise<{
  codes: string[];
  hashes: string[];
}> {
  const codes: string[] = [];
  const hashes: string[] = [];

  for (let i = 0; i < count; i++) {
    // Generate 8-character hex code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
    hashes.push(await hashBackupCode(code));
  }

  return { codes, hashes };
}
