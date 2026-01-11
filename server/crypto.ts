/**
 * Cryptographic utilities for secure storage
 * - AES-256-GCM encryption for TOTP secrets
 * - Argon2 hashing for backup codes
 */

import crypto from 'crypto';
import argon2 from 'argon2';

// Get encryption key from environment or generate a warning
const ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY;

function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    console.warn('WARNING: TOTP_ENCRYPTION_KEY not set. Using derived key from SESSION_SECRET.');
    // Derive a key from SESSION_SECRET if TOTP_ENCRYPTION_KEY not set
    const sessionSecret = process.env.SESSION_SECRET || 'default-session-secret-change-me';
    return crypto.scryptSync(sessionSecret, 'totp-salt', 32);
  }
  // If key is hex-encoded (64 chars = 32 bytes)
  if (ENCRYPTION_KEY.length === 64 && /^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
    return Buffer.from(ENCRYPTION_KEY, 'hex');
  }
  // Otherwise derive from the key string
  return crypto.scryptSync(ENCRYPTION_KEY, 'totp-salt', 32);
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
