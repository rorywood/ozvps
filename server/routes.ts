import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { handleVncUpgrade, vncProxySessions } from "./vnc-proxy";
import crypto, { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { virtfusionClient, VirtFusionTimeoutError } from "./virtfusion";
import { storage, dbStorage } from "./storage";
import { db, checkDatabaseHealth } from "./db";
import { plans, serverBilling, billingLedger } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createServerBilling, retryUnpaidServers, retryServerBilling, getServerBillingStatus, getUpcomingCharges, getBillingLedger, runBillingJob } from "./billing";
import { auth0Client } from "./auth0";
import { loginSchema, registerSchema, serverNameSchema, reinstallSchema, SESSION_REVOKE_REASONS, createTicketSchema, ticketMessageSchema, adminTicketUpdateSchema, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, type TicketStatus, type TicketPriority, type TicketCategory } from "@shared/schema";
import { log } from './log';
import { captureException, isSentryEnabled } from "./sentry";
import { validateServerName } from "./content-filter";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { recordFailedLogin, clearFailedLogins, isAccountLocked, getProgressiveDelay, verifyHmacSignature, isIpBlocked, getBlockedEntries, adminUnblock, adminUnblockEmail, adminClearAllRateLimits } from "./security";
import { encryptSecret, decryptSecret, isEncrypted, hashBackupCode, verifyBackupCode, generateBackupCodes, verifyEmailOtpCode } from "./crypto";
import { sendPasswordResetEmail, sendPasswordChangedEmail, sendServerCredentialsEmail, sendServerReinstallEmail, sendAdminTicketNotificationEmail, sendTwoFactorCodeEmail, sendTicketStatusEmail, sendBugReportEmail, sendGuestTicketConfirmationEmail, sendGuestTicketAdminReplyEmail, sendTicketAdminReplyEmail } from "./email";
import { WebhookHandlers } from "./webhookHandlers";
import { auditUserAction, UserActions } from "./user-audit";
import { redisClient } from "./redis";
import sharp from "sharp";
import path from "path";
import fs from "fs";

// VNC security: one-time credential tokens (exchanged by noVNC on load, then deleted)
const vncSessionTokens = new Map<string, {
  wsUrl: string;
  password: string;
  serverId: string;
  auth0UserId: string;
  expiresAt: number;
}>();

// VNC auto-disable timers: kill VNC access 30 minutes after console is opened
const vncAutoDisableTimers = new Map<string, ReturnType<typeof setTimeout>>();
const VNC_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DIRECT_TOPUP_REQUEST_TTL_SECONDS = 120;
const directTopupFallback = new Map<string, { status: 'pending' | 'succeeded'; requestId: string; paymentIntentId?: string; response?: { newBalanceCents: number; chargedAmountCents: number }; expiresAt: number }>();

function getDirectTopupRequestKey(auth0UserId: string, paymentMethodId: string, amountCents: number): string {
  return `billing:direct-topup:${auth0UserId}:${paymentMethodId}:${amountCents}`;
}

function isRedisReady(): boolean {
  return !!redisClient?.isReady;
}

async function claimDirectTopupRequest(key: string): Promise<{ claimed: boolean; requestId?: string; existing?: { status: 'pending' | 'succeeded'; requestId: string; paymentIntentId?: string; response?: { newBalanceCents: number; chargedAmountCents: number } } }> {
  if (isRedisReady()) {
    const requestId = randomBytes(16).toString('hex');
    const value = JSON.stringify({ status: 'pending', requestId });
    const claimed = await redisClient!.set(key, value, { NX: true, EX: DIRECT_TOPUP_REQUEST_TTL_SECONDS });
    if (claimed) {
      return { claimed: true, requestId };
    }

    const existingRaw = await redisClient!.get(key);
    if (!existingRaw) {
      return { claimed: false };
    }

    try {
      return { claimed: false, existing: JSON.parse(existingRaw) };
    } catch {
      return { claimed: false };
    }
  }

  const now = Date.now();
  const existing = directTopupFallback.get(key);
  if (existing && existing.expiresAt > now) {
    return {
      claimed: false,
      existing: {
        status: existing.status,
        requestId: existing.requestId,
        paymentIntentId: existing.paymentIntentId,
        response: existing.response,
      },
    };
  }

  directTopupFallback.set(key, {
    status: 'pending',
    requestId: randomBytes(16).toString('hex'),
    expiresAt: now + DIRECT_TOPUP_REQUEST_TTL_SECONDS * 1000,
  });
  return { claimed: true, requestId: directTopupFallback.get(key)!.requestId };
}

async function markDirectTopupRequestSucceeded(
  key: string,
  requestId: string,
  paymentIntentId: string,
  response: { newBalanceCents: number; chargedAmountCents: number },
): Promise<void> {
  const payload = {
    status: 'succeeded' as const,
    requestId,
    paymentIntentId,
    response,
  };

  if (isRedisReady()) {
    await redisClient!.set(key, JSON.stringify(payload), { EX: DIRECT_TOPUP_REQUEST_TTL_SECONDS });
    return;
  }

  directTopupFallback.set(key, {
    ...payload,
    expiresAt: Date.now() + DIRECT_TOPUP_REQUEST_TTL_SECONDS * 1000,
  });
}

async function clearDirectTopupRequest(key: string): Promise<void> {
  if (isRedisReady()) {
    await redisClient!.del(key);
    return;
  }

  directTopupFallback.delete(key);
}

// Helper to validate IP address format (prevents header injection)
function isValidIp(ip: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified - covers most cases)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::1$|^::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

  if (ipv4Pattern.test(ip)) {
    // Validate each octet is 0-255
    const octets = ip.split('.').map(Number);
    return octets.every(o => o >= 0 && o <= 255);
  }
  return ipv6Pattern.test(ip);
}

// Helper to get client IP from request
// SECURITY: Only trust proxy headers in production behind reverse proxy (nginx/cloudflare)
// The TRUST_PROXY env var should only be set when running behind a trusted proxy
function getClientIp(req: any): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';

  if (trustProxy) {
    // When behind a trusted proxy, use X-Forwarded-For but validate format
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Take the leftmost IP (original client) and validate it
      const clientIp = forwardedFor.split(',')[0]?.trim();
      if (clientIp && isValidIp(clientIp)) {
        return clientIp;
      }
    }

    // Fallback to X-Real-IP if X-Forwarded-For is invalid
    const realIp = req.headers['x-real-ip'];
    if (realIp && isValidIp(realIp)) {
      return realIp;
    }
  }

  // Direct connection or untrusted proxy - use socket address
  const socketIp = req.socket?.remoteAddress || req.ip;
  if (socketIp) {
    // Handle IPv6-mapped IPv4 addresses (::ffff:127.0.0.1)
    const cleanIp = socketIp.replace(/^::ffff:/, '');
    if (isValidIp(cleanIp)) {
      return cleanIp;
    }
  }

  return 'unknown';
}

function getTrustedAppBaseUrl(): string {
  const configuredAppUrl = process.env.APP_URL?.trim();
  if (configuredAppUrl) {
    return configuredAppUrl.replace(/\/+$/, '');
  }

  const configuredAppDomain = process.env.APP_DOMAIN?.trim();
  if (configuredAppDomain) {
    return `https://${configuredAppDomain.replace(/\/+$/, '')}`;
  }

  return 'https://app.ozvps.com.au';
}

// Error codes for consistent error handling
const ErrorCodes = {
  // Client errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  SERVER_SUSPENDED: 'SERVER_SUSPENDED',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_SERVICE_TIMEOUT: 'EXTERNAL_SERVICE_TIMEOUT',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

interface ApiErrorResponse {
  error: string;
  code: ErrorCode;
  details?: string;
}

// Helper to handle API errors with proper status codes and error codes
function handleApiError(
  res: Response,
  error: any,
  defaultMessage: string = 'An unexpected error occurred',
  context?: string
): Response<ApiErrorResponse> {
  // Handle VirtFusion timeout specifically
  if (error instanceof VirtFusionTimeoutError) {
    log(`VirtFusion timeout${context ? ` in ${context}` : ''}: ${error.message}`, 'routes');
    captureException(error, { context: context || 'unknown', errorType: 'VirtFusionTimeout' });
    return res.status(504).json({
      error: 'The server management service is taking too long to respond. Please try again in a moment.',
      code: ErrorCodes.EXTERNAL_SERVICE_TIMEOUT,
    });
  }

  // Handle VirtFusion connection errors
  if (error.message?.includes('ECONNREFUSED') || error.message?.includes('ENOTFOUND')) {
    log(`VirtFusion connection error${context ? ` in ${context}` : ''}: ${error.message}`, 'routes');
    captureException(error, { context: context || 'unknown', errorType: 'VirtFusionConnection' });
    return res.status(503).json({
      error: 'Unable to connect to the server management service. Please try again later.',
      code: ErrorCodes.SERVICE_UNAVAILABLE,
    });
  }

  // Handle VirtFusion API errors (often contain status codes)
  if (error.message?.includes('VirtFusion API error') || error.message?.includes('status')) {
    log(`VirtFusion API error${context ? ` in ${context}` : ''}: ${error.message}`, 'routes');
    captureException(error, { context: context || 'unknown', errorType: 'VirtFusionAPI' });
    return res.status(502).json({
      error: 'The server management service returned an error. Please try again.',
      code: ErrorCodes.EXTERNAL_SERVICE_ERROR,
    });
  }

  // Handle database errors
  if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT') {
    log(`Database constraint error${context ? ` in ${context}` : ''}: ${error.message}`, 'routes');
    captureException(error, { context: context || 'unknown', errorType: 'DatabaseConstraint' });
    return res.status(409).json({
      error: 'This resource already exists or conflicts with existing data.',
      code: ErrorCodes.RESOURCE_CONFLICT,
    });
  }

  if (error.code?.startsWith('2') || error.code?.startsWith('SQLITE')) {
    log(`Database error${context ? ` in ${context}` : ''}: ${error.message}`, 'routes');
    captureException(error, { context: context || 'unknown', errorType: 'Database' });
    return res.status(500).json({
      error: 'A database error occurred. Please try again later.',
      code: ErrorCodes.DATABASE_ERROR,
    });
  }

  // Log the error for debugging
  log(`API Error${context ? ` in ${context}` : ''}: ${error.message}`, 'routes');

  // Send to Sentry for all unhandled errors
  captureException(error, { context: context || 'unknown', errorType: 'Unhandled' });

  // Return generic error with default message
  return res.status(500).json({
    error: defaultMessage,
    code: ErrorCodes.INTERNAL_ERROR,
  });
}

// TOTP helper functions using otplib
import { generateSecret as otplibGenerateSecret, generateURI as otplibGenerateURI, verifySync as otplibVerifySync } from 'otplib';

function totpGenerateSecret(): string {
  return otplibGenerateSecret();
}

function totpVerify(token: string, secret: string): boolean {
  try {
    // SECURITY: Verify TOTP token against secret
    // Uses default window of 1 (±30 seconds) for time drift tolerance
    const result = otplibVerifySync({ token, secret });
    return result?.valid === true;
  } catch (error) {
    console.error('TOTP verification error:', error);
    return false;
  }
}

function totpGenerateURI(email: string, secret: string, issuer: string = 'OzVPS'): string {
  return otplibGenerateURI({ issuer, label: email, secret, algorithm: 'sha1', digits: 6, period: 30 });
}

// Helper to add logo to QR code
async function addLogoToQRCode(qrDataUrl: string): Promise<string> {
  try {
    // Convert data URL to buffer
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');

    // Get QR code dimensions
    const qrMetadata = await sharp(qrBuffer).metadata();
    const qrSize = qrMetadata.width || 200;

    // Logo should be about 20% of QR code size
    const logoSize = Math.floor(qrSize * 0.22);

    // Load the logo and invert colors (logo is white text on transparent bg)
    // We negate FIRST to get dark text, THEN add white background
    const logoPath = path.join(process.cwd(), 'client', 'src', 'assets', 'logo.png');
    const resizedLogo = await sharp(logoPath)
      .negate({ alpha: false }) // Invert white to black while keeping transparency
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();

    // Create white background circle/square for logo
    const padding = 8;
    const bgSize = logoSize + padding * 2;
    const whiteBg = await sharp({
      create: {
        width: bgSize,
        height: bgSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{
        input: resizedLogo,
        left: padding,
        top: padding
      }])
      .png()
      .toBuffer();

    // Calculate center position
    const left = Math.floor((qrSize - bgSize) / 2);
    const top = Math.floor((qrSize - bgSize) / 2);

    // Composite logo onto QR code
    const finalBuffer = await sharp(qrBuffer)
      .composite([{
        input: whiteBg,
        left,
        top
      }])
      .png()
      .toBuffer();

    return `data:image/png;base64,${finalBuffer.toString('base64')}`;
  } catch (error: any) {
    log(`Failed to add logo to QR code: ${error.message}`, 'api');
    // Return original QR code if logo addition fails
    return qrDataUrl;
  }
}

// Helper to verify reCAPTCHA v3 token with score threshold
interface RecaptchaVerifyResult {
  success: boolean;
  score?: number;
  action?: string;
  errorCodes?: string[];
}

async function verifyRecaptchaToken(
  token: string,
  secretKey: string,
  expectedAction?: string,
  minScore: number = 0.5
): Promise<{ valid: boolean; score?: number; error?: string }> {
  try {
    const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    });

    const result = await verifyResponse.json() as {
      success: boolean;
      score?: number;
      action?: string;
      'error-codes'?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    if (!result.success) {
      return {
        valid: false,
        error: `Verification failed: ${result['error-codes']?.join(', ') || 'Unknown error'}`,
      };
    }

    // For v3, check the score
    if (result.score !== undefined) {
      if (result.score < minScore) {
        log(`reCAPTCHA score too low: ${result.score} < ${minScore}`, 'security');
        return {
          valid: false,
          score: result.score,
          error: 'Verification score too low. Please try again.',
        };
      }

      // Optionally verify the action matches
      if (expectedAction && result.action !== expectedAction) {
        log(`reCAPTCHA action mismatch: expected ${expectedAction}, got ${result.action}`, 'security');
        // Don't fail on action mismatch, just log it
      }

      log(`reCAPTCHA v3 verified: score=${result.score}, action=${result.action}`, 'security');
      return { valid: true, score: result.score };
    }

    // v2 checkpoint - just success/fail
    return { valid: true };
  } catch (error: any) {
    log(`reCAPTCHA verification error: ${error.message}`, 'security');
    return { valid: false, error: 'Verification service unavailable' };
  }
}

declare global {
  namespace Express {
    interface Request {
      userSession?: {
        id: string;
        userId: number;
        auth0UserId: string | null;
        virtFusionUserId: number | null;
        extRelationId: string | null;
        email: string;
        name?: string;
        isAdmin: boolean;
        emailVerified: boolean;
      };
    }
  }
}

// Server-side build start time tracking - survives page refreshes unlike client refs
// Key: serverId, Value: timestamp (ms) when we first saw commissioned=1
const buildStartTimes = new Map<string, number>();

const SESSION_COOKIE = 'ozvps_session';
const CSRF_COOKIE = 'ozvps_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a cryptographically secure CSRF token
 */
function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Set CSRF token cookie
 */
function setCsrfCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // Must be readable by JavaScript to include in headers
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

function getGuestTicketToken(req: Request): string | null {
  const headerToken = req.headers['x-guest-ticket-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  if (Array.isArray(headerToken) && headerToken[0]?.trim()) {
    return headerToken[0].trim();
  }

  const paramToken = typeof req.params.accessToken === 'string' ? req.params.accessToken.trim() : '';
  return paramToken || null;
}

/**
 * CSRF protection middleware - implements double-submit cookie pattern
 * Combined with Origin/Referer validation for defense in depth
 */
function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only check mutating methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for webhook endpoints (they use their own auth via signatures)
  if (req.originalUrl.startsWith('/api/hooks/') || req.originalUrl.startsWith('/api/stripe/webhook')) {
    return next();
  }

  // Skip CSRF for VNC disable — called via navigator.sendBeacon which cannot set headers.
  // Still protected by authMiddleware (session cookie) and only disables VNC (benign action).
  if (/^\/api\/servers\/[^/]+\/vnc\/disable$/.test(req.originalUrl)) {
    return next();
  }

  // Skip CSRF for login/register/logout (no session yet, or low-risk)
  if (req.originalUrl === '/api/auth/login' ||
      req.originalUrl === '/api/auth/register' ||
      req.originalUrl === '/api/auth/logout' ||
      req.originalUrl === '/api/auth/force-logout') {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;

  // In development, allow requests without origin (e.g., from tools like curl)
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Layer 1: Origin/Referer validation
  let originValid = false;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      originValid = originUrl.host === host;
    } catch {
      // Invalid origin URL
    }
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      originValid = refererUrl.host === host;
    } catch {
      // Invalid referer URL
    }
  }

  if (!originValid) {
    log(`CSRF blocked: Invalid or missing origin/referer`, 'security');
    return res.status(403).json({ error: 'Invalid request origin', code: 'CSRF_ORIGIN' });
  }

  // Layer 2: Double-submit cookie validation (for authenticated requests)
  const csrfCookie = req.cookies?.[CSRF_COOKIE];
  const csrfHeader = req.headers[CSRF_HEADER] as string | undefined;

  // If user has a session, require CSRF token
  if (req.cookies?.[SESSION_COOKIE]) {
    if (!csrfCookie || !csrfHeader) {
      log(`CSRF blocked: Missing CSRF token`, 'security');
      return res.status(403).json({ error: 'Missing security token', code: 'CSRF_MISSING' });
    }

    // Timing-safe comparison to prevent timing attacks
    try {
      const cookieBuffer = Buffer.from(csrfCookie, 'utf8');
      const headerBuffer = Buffer.from(csrfHeader, 'utf8');

      if (cookieBuffer.length !== headerBuffer.length ||
          !crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
        log(`CSRF blocked: Token mismatch`, 'security');
        return res.status(403).json({ error: 'Invalid security token', code: 'CSRF_INVALID' });
      }
    } catch {
      log(`CSRF blocked: Token comparison error`, 'security');
      return res.status(403).json({ error: 'Invalid security token', code: 'CSRF_INVALID' });
    }
  }

  next();
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'NO_SESSION' });
  }

  try {
    const session = await storage.getSession(sessionId);
    
    if (!session) {
      res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteSession(sessionId);
      res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    // Check if session was revoked
    if (session.revokedAt) {
      res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
      const reason = session.revokedReason;
      
      if (reason === SESSION_REVOKE_REASONS.CONCURRENT_LOGIN) {
        return res.status(401).json({ 
          error: 'You have been signed out because your account was accessed from another location.',
          code: 'SESSION_REVOKED_CONCURRENT'
        });
      } else if (reason === SESSION_REVOKE_REASONS.USER_BLOCKED) {
        return res.status(401).json({ 
          error: 'Your account has been suspended. Please contact support.',
          code: 'SESSION_REVOKED_BLOCKED'
        });
      } else if (reason === SESSION_REVOKE_REASONS.IDLE_TIMEOUT) {
        return res.status(401).json({ 
          error: 'Your session expired due to inactivity. Please sign in again.',
          code: 'SESSION_IDLE_TIMEOUT'
        });
      } else {
        return res.status(401).json({ 
          error: 'Your session has ended. Please sign in again.',
          code: 'SESSION_REVOKED'
        });
      }
    }

    // Check for idle timeout (15 minutes of inactivity)
    // Handle sessions without lastActivityAt (created before this feature)
    if (session.lastActivityAt) {
      const lastActivity = new Date(session.lastActivityAt);
      const now = new Date();
      if (!isNaN(lastActivity.getTime()) && now.getTime() - lastActivity.getTime() > IDLE_TIMEOUT_MS) {
        await storage.revokeSessionsByAuth0UserId(session.auth0UserId || '', SESSION_REVOKE_REASONS.IDLE_TIMEOUT);
        res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
        return res.status(401).json({ 
          error: 'Your session expired due to inactivity. Please sign in again.',
          code: 'SESSION_IDLE_TIMEOUT'
        });
      }
    }

    // Update last activity timestamp
    await storage.updateSessionActivity(sessionId);

    // Optional IP binding: reject sessions where the IP has changed
    // Enable with SESSION_VALIDATE_IP=true (requires TRUST_PROXY=true to work correctly behind nginx)
    if (process.env.SESSION_VALIDATE_IP === 'true' && session.ipAddress) {
      const currentIp = getClientIp(req);
      if (currentIp !== session.ipAddress) {
        log(`Session IP mismatch for ${session.email}: expected ${session.ipAddress}, got ${currentIp}`, 'security');
        await storage.deleteSession(sessionId);
        res.clearCookie(SESSION_COOKIE);
        res.clearCookie(CSRF_COOKIE);
        return res.status(401).json({
          error: 'Your session is no longer valid. Please sign in again.',
          code: 'SESSION_IP_MISMATCH'
        });
      }
    }

    // Check if user is blocked (read from database for most up-to-date status)
    if (session.auth0UserId) {
      const userFlags = await dbStorage.getUserFlagsFromDb(session.auth0UserId);
      if (userFlags?.blocked) {
        // Revoke the session and return blocked error
        await storage.revokeSessionsByAuth0UserId(session.auth0UserId, SESSION_REVOKE_REASONS.USER_BLOCKED);
        res.clearCookie(SESSION_COOKIE);
        res.clearCookie(CSRF_COOKIE);
        return res.status(401).json({
          error: 'Your account has been blocked. Please contact support.',
          code: 'SESSION_REVOKED_BLOCKED'
        });
      }
    }

    // Verify Auth0 user still exists (with caching to avoid excessive API calls)
    if (session.auth0UserId) {
      const userExists = await auth0Client.userExists(session.auth0UserId);
      if (!userExists) {
        // User was deleted from Auth0 - revoke all their sessions
        await storage.revokeSessionsByAuth0UserId(session.auth0UserId, SESSION_REVOKE_REASONS.USER_DELETED);
        res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
        log(`Auth0 user ${session.auth0UserId} deleted - revoking sessions`, 'auth0');
        return res.status(401).json({ 
          error: 'Your account no longer exists. Please contact support if this is unexpected.',
          code: 'USER_DELETED'
        });
      }
    }

    req.userSession = {
      id: session.id,
      userId: session.userId ?? 0,
      auth0UserId: session.auth0UserId ?? null,
      virtFusionUserId: session.virtFusionUserId ?? null,
      extRelationId: session.extRelationId ?? null,
      email: session.email,
      name: session.name ?? undefined,
      isAdmin: session.isAdmin ?? false,
      emailVerified: session.emailVerified ?? false,
    };

    next();
  } catch (error) {
    log(`Auth middleware error: ${error}`, 'api');
    return res.status(500).json({ error: 'Authentication error' });
  }
}

// Middleware to require email verification
async function requireEmailVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.userSession) {
    return res.status(401).json({ error: 'Not authenticated', code: 'NO_SESSION' });
  }

  if (!req.userSession!.emailVerified) {
    return res.status(403).json({
      error: 'Email verification required. Please verify your email address before performing this action.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
}

// Admin functionality has moved to separate admin panel at admin.ozvps.com.au
// All admin routes now return 410 Gone
const requireAdmin: RequestHandler = (req, res, next) => {
  return res.status(410).json({
    error: 'Admin functionality has moved',
    message: 'Please use the admin panel at admin.ozvps.com.au'
  });
};

async function verifyServerOwnership(serverId: string, userVirtFusionId: number | null): Promise<boolean> {
  if (!userVirtFusionId) return false;
  
  try {
    const server = await virtfusionClient.getServer(serverId);
    return server && server.userId === userVirtFusionId;
  } catch (error) {
    log(`Ownership check failed for server ${serverId}: ${error}`, 'api');
    return false;
  }
}

async function getServerWithOwnershipCheck(serverId: string, userVirtFusionId: number | null): Promise<{ server: any | null; error?: string; status?: number }> {
  if (!userVirtFusionId) {
    return { server: null, error: 'Access denied', status: 403 };
  }
  
  try {
    const server = await virtfusionClient.getServer(serverId);
    if (!server) {
      return { server: null, error: 'Server not found', status: 404 };
    }
    if (server.userId !== userVirtFusionId) {
      return { server: null, error: 'Access denied', status: 403 };
    }
    return { server };
  } catch (error) {
    log(`Server check failed for ${serverId}: ${error}`, 'api');
    return { server: null, error: 'Failed to verify server access', status: 500 };
  }
}

// Error types for Stripe customer provisioning
class StripeCustomerError extends Error {
  constructor(
    message: string,
    public readonly code: 'WALLET_FROZEN' | 'STRIPE_ERROR' | 'PERSISTENCE_ERROR' | 'NO_CUSTOMER',
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = 'StripeCustomerError';
  }
}

// Ensure Stripe customer exists for wallet/billing operations
// This function validates that a user has a valid Stripe customer before allowing billing operations
async function ensureStripeCustomer(
  session: { auth0UserId: string | null; email: string; name?: string; userId?: number },
  options: { allowCreate?: boolean } = { allowCreate: true }
): Promise<{ wallet: any; stripeCustomerId: string }> {
  const { auth0UserId, email, name, userId } = session;
  
  if (!auth0UserId) {
    throw new StripeCustomerError('No Auth0 user ID in session', 'NO_CUSTOMER', 400);
  }
  
  // Get or create wallet
  const wallet = await dbStorage.getOrCreateWallet(auth0UserId);
  
  // Check if wallet is frozen (user deleted from Stripe)
  if (wallet.deletedAt) {
    throw new StripeCustomerError(
      'Billing access suspended. Please contact support.',
      'WALLET_FROZEN',
      403
    );
  }
  
  // Check if we already have a Stripe customer
  if (wallet.stripeCustomerId) {
    // Verify the customer still exists in Stripe
    try {
      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.retrieve(wallet.stripeCustomerId);
      
      // Check if customer was deleted in Stripe
      if ((customer as any).deleted) {
        log(`Stripe customer ${wallet.stripeCustomerId} was deleted in Stripe, clearing local reference`, 'stripe');
        // Clear the invalid stripeCustomerId from the wallet
        await dbStorage.clearWalletStripeCustomerId(auth0UserId);
        // Fall through to create a new customer if allowed
      } else {
        // Customer exists and is valid
        return { wallet, stripeCustomerId: wallet.stripeCustomerId };
      }
    } catch (error: any) {
      if (error instanceof StripeCustomerError) throw error;
      
      // If it's a "resource not found" error, clear the reference
      if (error.type === 'StripeInvalidRequestError' && error.code === 'resource_missing') {
        log(`Stripe customer ${wallet.stripeCustomerId} not found in Stripe, clearing local reference`, 'stripe');
        // Clear the invalid stripeCustomerId from the wallet
        await dbStorage.clearWalletStripeCustomerId(auth0UserId);
        // Fall through to create a new customer if allowed
      } else {
        log(`Failed to verify Stripe customer ${wallet.stripeCustomerId}: ${error.message}`, 'stripe');
        throw new StripeCustomerError(
          'Unable to verify payment account. Please try again.',
          'STRIPE_ERROR',
          502
        );
      }
    }
  }
  
  // No valid Stripe customer exists - check if we should create one
  if (!options.allowCreate) {
    throw new StripeCustomerError(
      'Payment account not set up. Please complete billing setup.',
      'NO_CUSTOMER',
      409
    );
  }
  
  // Create new Stripe customer
  try {
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: {
        auth0UserId,
        ozvps_user_id: String(userId || ''),
      },
    });
    
    // Persist the Stripe customer ID
    const updatedWallet = await dbStorage.updateWalletStripeCustomerId(auth0UserId, customer.id);
    if (!updatedWallet?.stripeCustomerId) {
      log(`Failed to persist Stripe customer ${customer.id} for ${auth0UserId}`, 'stripe');
      throw new StripeCustomerError(
        'Failed to link payment account. Please try again.',
        'PERSISTENCE_ERROR',
        500
      );
    }
    
    log(`Created and linked Stripe customer ${customer.id} for ${auth0UserId}`, 'stripe');
    return { wallet: updatedWallet, stripeCustomerId: customer.id };
  } catch (error: any) {
    if (error instanceof StripeCustomerError) throw error;
    
    log(`Failed to create Stripe customer for ${auth0UserId}: ${error.message}`, 'stripe');
    throw new StripeCustomerError(
      'Failed to set up payment account. Please try again.',
      'STRIPE_ERROR',
      502
    );
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // VNC WebSocket proxy: intercept upgrade requests for /api/vnc-ws/:token
  // This must be registered early so it runs before any other upgrade handlers.
  httpServer.on('upgrade', (req, socket, head) => {
    handleVncUpgrade(req, socket as any, head).catch((err) => {
      log(`VNC upgrade handler error: ${err.message}`, 'vnc');
      socket.destroy();
    });
  });

  // Rate limiters for sensitive endpoints
  const mfaRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: { error: 'Too many 2FA attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Rate limit by IP + user ID (check session first, then body for unauthenticated endpoints like /2fa/email/send)
      const ip = getClientIp(req);
      const userId = (req as any).userSession?.auth0UserId || (req.body as any)?.auth0UserId || '';
      return `${ip}:${userId}`;
    },
  });

  const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 15 login attempts per window (allows for typos without locking out)
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
  });

  const deploymentRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 deployments per minute
    message: { error: 'Too many deployment requests. Please wait before deploying again.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as any).userSession?.auth0UserId || getClientIp(req),
  });

  const ticketRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 tickets per minute
    message: { error: 'Too many ticket creation requests. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as any).userSession?.auth0UserId || getClientIp(req),
  });

  const walletTopupRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 topup requests per minute
    message: { error: 'Too many topup requests. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as any).userSession?.auth0UserId || getClientIp(req),
  });

  const serverActionRateLimiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds
    max: 10, // 10 server actions per 30 seconds
    message: { error: 'Too many server actions. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as any).userSession?.auth0UserId || getClientIp(req),
  });

  const promoValidationRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 promo validation requests per minute
    message: { error: 'Too many promo code validation requests. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as any).userSession?.auth0UserId || getClientIp(req),
  });

  const profilePictureRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 uploads per minute per user
    message: { error: 'Too many profile picture uploads. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as any).userSession?.auth0UserId || getClientIp(req),
  });

  const bugReportRateLimiter = rateLimit({
    windowMs: 90 * 1000, // 90 seconds
    max: 1, // 1 bug report per 90 seconds
    message: { error: 'Please wait before submitting another bug report.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as any).userSession?.auth0UserId || getClientIp(req),
  });

  const contactRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 public contact submissions per hour per IP
    message: { error: 'Too many contact requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
  });

  // Apply CSRF protection to all API routes
  app.use('/api', csrfProtection);

  // System health check (public) - checks database and VirtFusion connectivity
  app.get('/api/health', async (req, res) => {
    try {
      // Check database connectivity first - this is critical
      const dbHealth = await checkDatabaseHealth();
      if (!dbHealth.connected) {
        log(`Health check failed: Database unavailable - ${dbHealth.error}`, 'api');
        return res.status(503).json({
          status: 'error',
          errorCode: 'DB_UNAVAILABLE',
          message: 'System is temporarily unavailable. Please try again later.',
          services: {
            database: false,
            virtfusion: null // unknown when DB is down
          }
        });
      }

      // Check VirtFusion connectivity
      const connectionStatus = await virtfusionClient.getConnectionStatus();
      if (!connectionStatus.connected) {
        log(`Health check failed: VirtFusion ${connectionStatus.errorType || 'unknown error'}`, 'api');
        return res.status(503).json({
          status: 'error',
          errorCode: 'VF_API_UNAVAILABLE',
          message: 'Server management system is temporarily unavailable. Please try again later.',
          services: {
            database: true,
            virtfusion: false
          }
        });
      }

      // Check maintenance mode
      const maintenanceSetting = await dbStorage.getSecuritySetting('maintenance_mode');
      const maintenanceMode = maintenanceSetting ? maintenanceSetting.enabled : false;

      res.json({
        status: 'ok',
        maintenanceMode,
        services: {
          database: true,
          virtfusion: true
        }
      });
    } catch (error: any) {
      log(`Health check error: ${error.message}`, 'api');
      res.status(503).json({
        status: 'error',
        errorCode: 'SYSTEM_ERROR',
        message: 'System health check failed',
        services: {
          database: null,
          virtfusion: null
        }
      });
    }
  });

  // Sync plans from VirtFusion on startup (non-blocking)
  (async () => {
    try {
      log('Syncing plans from VirtFusion...', 'startup');

      // First seed from static config to ensure base plans exist
      const seedResult = await dbStorage.seedPlansFromConfig();
      log(`Plans seeded: ${seedResult.seeded} plans from static config`, 'startup');

      // Then sync enabled/disabled status from VirtFusion
      const vfPackages = await virtfusionClient.getPackages();
      log(`Fetched ${vfPackages.length} packages from VirtFusion`, 'startup');

      // Log what VirtFusion returned for debugging
      vfPackages.forEach(pkg => {
        log(`VirtFusion Package ${pkg.id} (${pkg.name}): enabled=${pkg.enabled}`, 'startup');
      });

      const currentPlans = await db.select().from(plans);
      const plansMap = new Map(currentPlans.map(p => [p.virtfusionPackageId, p]));

      let synced = 0;
      for (const vfPkg of vfPackages) {
        const existingPlan = plansMap.get(vfPkg.id);
        if (existingPlan) {
          log(`Checking plan ${existingPlan.code} (VF ID: ${vfPkg.id}): DB active=${existingPlan.active}, VF enabled=${vfPkg.enabled}`, 'startup');

          if (existingPlan.active !== vfPkg.enabled) {
            await db
              .update(plans)
              .set({ active: vfPkg.enabled, name: vfPkg.name })
              .where(eq(plans.virtfusionPackageId, vfPkg.id));

            log(`✓ Updated plan ${existingPlan.code}: ${existingPlan.active ? 'enabled' : 'disabled'} → ${vfPkg.enabled ? 'enabled' : 'disabled'}`, 'startup');
            synced++;
          } else {
            log(`  No change needed for plan ${existingPlan.code}`, 'startup');
          }
        } else {
          log(`⚠ No plan found in DB for VirtFusion package ${vfPkg.id} (${vfPkg.name})`, 'startup');
        }
      }

      log(`Plans sync complete: ${synced} plans updated from VirtFusion`, 'startup');
    } catch (error: any) {
      log(`Failed to sync plans from VirtFusion: ${error.message}`, 'startup');
      log('Falling back to static plan config', 'startup');
    }
  })();

  // Auth endpoints (public)

  // Check if email is available for registration
  app.post('/api/auth/check-email', loginRateLimiter, async (req, res) => {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Use a generic response so this endpoint cannot be used to enumerate accounts.
      return res.json({ available: true, exists: false });
    } catch (error: any) {
      log(`Email check error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to check email availability' });
    }
  });

  app.post('/api/auth/register', loginRateLimiter, async (req, res) => {
    try {
      // Check if registration is disabled (database setting takes precedence)
      const registrationSetting = await dbStorage.getSecuritySetting('registration_enabled');
      const isRegistrationEnabled = registrationSetting
        ? registrationSetting.enabled
        : (process.env.REGISTRATION_DISABLED !== 'true');

      if (!isRegistrationEnabled) {
        return res.status(403).json({ error: 'Registration is currently disabled. Please contact support.' });
      }

      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid registration data' });
      }

      const { email, password, name, recaptchaToken } = parsed.data;

      // SECURITY: Server-side banned name check (defense-in-depth, also checked client-side)
      const bannedNames = ['darius'];
      if (name && bannedNames.some(banned => name.toLowerCase().includes(banned))) {
        log(`Registration blocked - banned name detected: ${name}`, 'security');
        return res.status(400).json({ error: 'This name is not allowed. Please choose a different name.' });
      }

      // Check reCAPTCHA if enabled
      const recaptchaSettings = dbStorage.getRecaptchaSettings();
      if (recaptchaSettings.enabled && recaptchaSettings.secretKey) {
        if (!recaptchaToken) {
          // SECURITY: Reject registration without reCAPTCHA token
          log(`Registration blocked - missing reCAPTCHA token for: ${email}`, 'security');
          return res.status(400).json({ error: 'Security verification required. Please refresh the page and try again.' });
        }

        const verifyResult = await verifyRecaptchaToken(
          recaptchaToken,
          recaptchaSettings.secretKey,
          'register',
          recaptchaSettings.minScore
        );

        if (!verifyResult.valid) {
          log(`reCAPTCHA verification failed for registration: ${verifyResult.error}`, 'security');
          return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
        }
      }

      // Check if user already exists in Auth0 (defense-in-depth)
      try {
        const existingUser = await auth0Client.getUserByEmail(email);
        if (existingUser) {
          log(`Registration blocked: email ${email} already exists in Auth0`, 'auth');
          return res.status(400).json({ error: 'An account with this email already exists. Please sign in instead.' });
        }
      } catch (emailCheckError: any) {
        // SECURITY: If we can't verify email uniqueness, don't allow registration
        // This prevents duplicate accounts when Auth0 API is having issues
        log(`Registration blocked: Auth0 email check failed for ${email}: ${emailCheckError.message}`, 'auth');
        return res.status(503).json({ error: 'Unable to verify email. Please try again in a moment.' });
      }

      // Create user in Auth0
      const auth0Result = await auth0Client.createUser(email, password, name);
      if (!auth0Result.success || !auth0Result.user) {
        return res.status(400).json({ error: auth0Result.error || 'Failed to create account' });
      }

      // Build the Auth0 user ID early - we need it for potential rollback
      const auth0UserId = `auth0|${auth0Result.user.user_id}`;

      // Create VirtFusion user - if this fails, rollback Auth0 user
      const virtFusionUser = await virtfusionClient.findOrCreateUser(email, name || email.split('@')[0]);
      if (!virtFusionUser) {
        // Rollback: Delete the Auth0 user we just created
        log(`VirtFusion user creation failed for ${email}, rolling back Auth0 user`, 'auth');
        await auth0Client.deleteUser(auth0UserId);
        return res.status(500).json({ error: 'Failed to create account. Please try again or contact support.' });
      }
      await auth0Client.setVirtFusionUserId(auth0UserId, virtFusionUser.id);
      log(`Stored VirtFusion user ${virtFusionUser.id} in Auth0 metadata for ${auth0UserId}`, 'auth');
      
      // Update user name in Auth0 profile (dbconnections/signup doesn't store name properly)
      if (name) {
        await auth0Client.updateUserName(auth0UserId, name);
      }

      // IMPORTANT: Set email_verified=true in Auth0 to PREVENT Auth0 from sending its own verification email
      // We handle email verification ourselves with our custom system
      // The user's actual verification status is tracked in our database (emailVerificationTokens table)
      try {
        await auth0Client.updateUser(auth0UserId, { email_verified: true });
        log(`Disabled Auth0 verification email for ${email} (set email_verified=true)`, 'auth');
      } catch (verifyErr: any) {
        // Non-fatal - user can still register, we just might get duplicate emails
        log(`Warning: Could not disable Auth0 verification email for ${email}: ${verifyErr.message}`, 'auth');
      }

      // Create or find existing Stripe customer and wallet for the new user
      try {
        const stripe = await getUncachableStripeClient();
        
        // Check if a Stripe customer already exists with this email
        const existingCustomers = await stripe.customers.list({
          email: email.toLowerCase(),
          limit: 10,
        });
        
        let customer;
        // Find an active customer that isn't already linked to a different Auth0 user
        const reusableCustomer = existingCustomers.data.find(c => {
          // Skip deleted customers
          if (c.deleted) return false;
          // Skip if already linked to a different Auth0 user
          if (c.metadata?.auth0UserId && c.metadata.auth0UserId !== auth0UserId) return false;
          return true;
        });
        
        if (reusableCustomer) {
          // Reuse existing customer and update metadata
          customer = reusableCustomer;
          await stripe.customers.update(customer.id, {
            name: name || customer.name || undefined,
            metadata: {
              ...customer.metadata,
              auth0UserId,
              virtfusion_user_id: String(virtFusionUser.id),
            },
          });
          log(`Reusing existing Stripe customer ${customer.id} for new user ${auth0UserId}`, 'stripe');
        } else {
          // Create new customer
          customer = await stripe.customers.create({
            email,
            name: name || undefined,
            metadata: {
              auth0UserId,
              virtfusion_user_id: String(virtFusionUser.id),
            },
          });
          log(`Created Stripe customer ${customer.id} for new user ${auth0UserId}`, 'stripe');
        }
        
        // Create wallet with Stripe customer and VirtFusion user linked
        const wallet = await dbStorage.getOrCreateWallet(auth0UserId);
        await dbStorage.updateWalletStripeCustomerId(auth0UserId, customer.id);
        await dbStorage.updateWalletVirtFusionUserId(auth0UserId, virtFusionUser.id);
      } catch (stripeError: any) {
        // Non-fatal: user can still register, Stripe customer will be created on first top-up
        log(`Failed to create Stripe customer during registration: ${stripeError.message}`, 'stripe');
      }

      // Create local session (new users start with emailVerified: false)
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      const session = await storage.createSession({
        visitorId: 0,
        virtFusionUserId: virtFusionUser.id,
        extRelationId: virtFusionUser.extRelationId,
        email: email,
        name: name || virtFusionUser.name,
        auth0UserId: auth0UserId, // Use the prefixed version for consistency
        emailVerified: false, // New users start unverified
        expiresAt,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || undefined,
      });

      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        expires: expiresAt,
      });

      // Set CSRF token cookie for double-submit pattern
      const csrfToken = generateCsrfToken();
      setCsrfCookie(res, csrfToken, expiresAt);

      // Send verification email (non-blocking - don't fail registration if email fails)
      try {
        const verificationToken = await dbStorage.createEmailVerificationToken(auth0UserId, email);
        const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
        const verifyLink = `${appUrl}/verify-email?token=${verificationToken.token}`;
        const { sendEmailVerificationEmail } = await import('./email');
        const emailResult = await sendEmailVerificationEmail(email, verifyLink);
        if (emailResult.success) {
          log(`Verification email sent to new user ${email}`, 'auth');
        } else {
          log(`Failed to send verification email to ${email}: ${emailResult.error}`, 'auth');
        }
      } catch (emailError: any) {
        log(`Error sending verification email to ${email}: ${emailError.message}`, 'auth');
      }

      res.status(201).json({
        user: {
          id: auth0UserId,
          email: email,
          name: name || virtFusionUser.name,
          emailVerified: false, // New users start unverified
        },
        csrfToken, // Include in response for initial setup
      });
    } catch (error: any) {
      log(`Registration error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Forgot password - request reset link
  app.post('/api/auth/forgot-password', loginRateLimiter, async (req, res) => {
    try {
      const { email, recaptchaToken } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Check reCAPTCHA if enabled
      const recaptchaSettings = dbStorage.getRecaptchaSettings();
      if (recaptchaSettings.enabled && recaptchaSettings.secretKey) {
        if (!recaptchaToken) {
          log(`Forgot password blocked - missing reCAPTCHA token for: ${email}`, 'security');
          return res.status(400).json({ error: 'Please complete the reCAPTCHA verification' });
        }
        const verifyResult = await verifyRecaptchaToken(
          recaptchaToken,
          recaptchaSettings.secretKey,
          'forgot_password',
          recaptchaSettings.minScore
        );
        if (!verifyResult.valid) {
          log(`reCAPTCHA verification failed for forgot password: ${verifyResult.error}`, 'security');
          return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
        }
      }

      // Check if user exists in Auth0
      const user = await auth0Client.getUserByEmail(email);

      // Always return success message to prevent email enumeration
      // But only send email if user exists
      if (user) {
        // Create password reset token
        const resetToken = await dbStorage.createPasswordResetToken(email);

        // Build reset URL
        const baseUrl = getTrustedAppBaseUrl();
        const resetLink = `${baseUrl}/reset-password?token=${resetToken.token}`;

        // Send password reset email
        const emailResult = await sendPasswordResetEmail(email, resetLink, 30);

        // Audit log password reset request
        await auditUserAction(req, user.user_id, email, UserActions.PASSWORD_RESET_REQUEST, 'account', user.user_id);

        if (emailResult.success) {
          log(`Password reset email sent to ${email}`, 'auth');
        } else {
          log(`Failed to send password reset email to ${email}: ${emailResult.error}`, 'auth');
        }
      } else {
        log(`Password reset requested for non-existent email: ${email}`, 'auth');
      }

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link shortly.'
      });
    } catch (error: any) {
      log(`Forgot password error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  });

  // Reset password - set new password with token
  app.post('/api/auth/reset-password', loginRateLimiter, async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Reset token is required' });
      }

      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // Get and validate token
      const resetToken = await dbStorage.getPasswordResetToken(token);

      if (!resetToken) {
        log(`Invalid password reset token attempted`, 'security');
        return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
      }

      if (resetToken.used) {
        log(`Already used password reset token attempted for ${resetToken.email}`, 'security');
        return res.status(400).json({ error: 'This reset link has already been used. Please request a new one.' });
      }

      if (new Date() > resetToken.expiresAt) {
        log(`Expired password reset token attempted for ${resetToken.email}`, 'security');
        return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
      }

      // Get user from Auth0
      const user = await auth0Client.getUserByEmail(resetToken.email);
      if (!user) {
        log(`Password reset attempted for non-existent user: ${resetToken.email}`, 'security');
        return res.status(400).json({ error: 'Account not found. Please contact support.' });
      }

      // Update password in Auth0
      const updateResult = await auth0Client.changePassword(user.user_id, password);
      if (!updateResult.success) {
        log(`Failed to update password for ${resetToken.email}: ${updateResult.error}`, 'auth');
        return res.status(500).json({ error: updateResult.error || 'Failed to update password' });
      }

      // Mark token as used
      await dbStorage.markPasswordResetTokenUsed(token);

      // Send confirmation email
      await sendPasswordChangedEmail(resetToken.email);

      // Revoke all existing sessions for security
      await storage.revokeSessionsByAuth0UserId(user.user_id, SESSION_REVOKE_REASONS.PASSWORD_CHANGED);

      // Audit log password reset complete
      await auditUserAction(req, user.user_id, resetToken.email, UserActions.PASSWORD_RESET_COMPLETE, 'account', user.user_id);

      log(`Password successfully reset for ${resetToken.email}`, 'auth');

      res.json({
        success: true,
        message: 'Your password has been reset successfully. You can now log in with your new password.'
      });
    } catch (error: any) {
      log(`Reset password error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Validate reset token (for frontend)
  app.get('/api/auth/validate-reset-token', async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ valid: false, error: 'Token is required' });
      }

      const resetToken = await dbStorage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.json({ valid: false, error: 'Invalid reset link' });
      }

      if (resetToken.used) {
        return res.json({ valid: false, error: 'This reset link has already been used' });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.json({ valid: false, error: 'This reset link has expired' });
      }

      res.json({ valid: true, email: resetToken.email });
    } catch (error: any) {
      log(`Validate reset token error: ${error.message}`, 'api');
      res.status(500).json({ valid: false, error: 'Failed to validate token' });
    }
  });

  app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid email or password format' });
      }

      const { email, password } = parsed.data;
      const { recaptchaToken } = req.body;

      // Check reCAPTCHA if enabled
      // Check if this is a 2FA verification step (user already passed reCAPTCHA on initial login)
      const { totpToken, backupCode, emailOtpToken } = req.body;
      const is2FAStep = !!(totpToken || backupCode || emailOtpToken);

      // Only check reCAPTCHA on initial login, not on 2FA verification step
      const recaptchaSettings = dbStorage.getRecaptchaSettings();
      if (recaptchaSettings.enabled && recaptchaSettings.secretKey && !is2FAStep) {
        if (!recaptchaToken) {
          // SECURITY: Reject login without reCAPTCHA token
          log(`Login blocked - missing reCAPTCHA token for: ${email}`, 'security');
          return res.status(400).json({ error: 'Security verification required. Please refresh the page and try again.' });
        }

        const verifyResult = await verifyRecaptchaToken(
          recaptchaToken,
          recaptchaSettings.secretKey,
          'login',
          recaptchaSettings.minScore
        );

        if (!verifyResult.valid) {
          log(`reCAPTCHA verification failed for login: ${verifyResult.error}`, 'security');
          return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
        }
      }

      // Get client IP for rate limiting
      const clientIp = getClientIp(req);
      
      // Check if IP is blocked (distributed attack protection)
      const ipBlockStatus = await isIpBlocked(clientIp);
      if (ipBlockStatus.blocked) {
        const remainingMins = Math.ceil((ipBlockStatus.remainingMs || 0) / 60000);
        log(`Blocked login attempt from blocked IP: ${clientIp}`, 'security');
        return res.status(429).json({
          error: `Too many login attempts from your location. Try again in ${remainingMins} minutes.`,
          code: 'IP_BLOCKED'
        });
      }

      // Check if account is locked due to too many failed attempts
      const lockStatus = await isAccountLocked(email, clientIp);
      if (lockStatus.locked) {
        const remainingMins = Math.ceil((lockStatus.remainingMs || 0) / 60000);
        log(`Blocked login attempt for locked account: ${email} from IP: ${clientIp} (${lockStatus.reason})`, 'security');
        return res.status(429).json({
          error: `Account temporarily locked due to too many failed attempts. Try again in ${remainingMins} minutes.`,
          code: 'ACCOUNT_LOCKED'
        });
      }

      // Authenticate with Auth0
      const auth0Result = await auth0Client.authenticateUser(email, password);
      if (!auth0Result.success || !auth0Result.user) {
        // Only record failed login if it's an authentication failure, not a connection error
        if (!auth0Result.isConnectionError) {
          await recordFailedLogin(email, clientIp);
        }

        // Apply progressive delay ONLY on failed login attempts (after authentication fails)
        // This prevents legitimate users from experiencing delays on successful logins
        const delay = await getProgressiveDelay(email, clientIp);
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // SECURITY: Return generic error message to prevent email enumeration
        // Do NOT reveal whether the email exists or if the password was wrong
        return res.status(401).json({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Clear failed login attempts on successful auth
      await clearFailedLogins(email, clientIp);

      // Check if user is blocked
      const userFlags = await storage.getUserFlags(auth0Result.user.user_id);
      if (userFlags?.blocked) {
        log(`Blocked user attempted login: ${email}`, 'auth');
        return res.status(403).json({
          error: 'Your account has been suspended. Please contact support.',
          code: 'USER_BLOCKED'
        });
      }

      const auth0UserIdFor2FA = auth0Result.user.user_id.startsWith('auth0|')
        ? auth0Result.user.user_id
        : `auth0|${auth0Result.user.user_id}`;

      // Revoke ALL existing sessions for this user (single-session policy)
      // This allows users who lost their cookie to log in again without waiting
      const hasExistingSession = await storage.hasActiveSession(auth0Result.user.user_id, IDLE_TIMEOUT_MS);
      if (hasExistingSession) {
        log(`User ${email} has existing session - revoking to allow new login`, 'auth');
        await storage.revokeSessionsByAuth0UserId(auth0Result.user.user_id, SESSION_REVOKE_REASONS.NEW_LOGIN);
      }

      // Check for existing VirtFusion user ID in Auth0 metadata
      let virtFusionUserId = await auth0Client.getVirtFusionUserId(auth0Result.user.user_id);
      let extRelationId: string | undefined;
      
      if (virtFusionUserId) {
        log(`Found VirtFusion user ID in Auth0 metadata: ${virtFusionUserId}`, 'auth');
        // Fetch extRelationId from VirtFusion for existing users
        const existingUser = await virtfusionClient.getUserById(virtFusionUserId);
        if (existingUser && existingUser.extRelationId) {
          extRelationId = existingUser.extRelationId;
          log(`Fetched extRelationId for existing VirtFusion user: ${extRelationId}`, 'auth');
        } else {
          // VirtFusion user missing or has no extRelationId - clear stale metadata and re-create
          log(`VirtFusion user ${virtFusionUserId} missing or has no extRelationId, clearing stale metadata`, 'auth');
          // Clear the stale ID from Auth0 metadata
          await auth0Client.setVirtFusionUserId(auth0Result.user.user_id, null);
          virtFusionUserId = null;
          
          // Try to create or find the user
          const virtFusionUser = await virtfusionClient.findOrCreateUser(email, auth0Result.user.name || email.split('@')[0]);
          if (virtFusionUser) {
            virtFusionUserId = virtFusionUser.id;
            extRelationId = virtFusionUser.extRelationId;
            await auth0Client.setVirtFusionUserId(auth0Result.user.user_id, virtFusionUser.id);
            log(`Re-created VirtFusion user: ${virtFusionUser.id} with extRelationId: ${extRelationId}`, 'auth');
          } else {
            // VirtFusion user exists with this email but we can't retrieve their data
            // This requires admin intervention in VirtFusion panel
            log(`VirtFusion user exists for ${email} but cannot be retrieved - requires admin linking`, 'auth');
          }
        }
      } else {
        // Create VirtFusion user and store ID in Auth0 metadata
        const virtFusionUser = await virtfusionClient.findOrCreateUser(email, auth0Result.user.name || email.split('@')[0]);
        if (virtFusionUser) {
          virtFusionUserId = virtFusionUser.id;
          extRelationId = virtFusionUser.extRelationId;
          
          // Store in Auth0 metadata for future logins
          await auth0Client.setVirtFusionUserId(auth0Result.user.user_id, virtFusionUser.id);
          log(`Created VirtFusion user and stored in Auth0: ${virtFusionUser.id} with extRelationId: ${extRelationId}`, 'auth');
        }
      }

      // Log if VirtFusion linking failed - user can still login but won't have full server management
      if (!virtFusionUserId || !extRelationId) {
        log(`VirtFusion account not fully linked for ${email} - virtFusionUserId: ${virtFusionUserId}, extRelationId: ${extRelationId}`, 'auth');
        // Continue with login - VirtFusion linking can be done later by admin
      }
      
      // Ensure wallet has VirtFusion user ID for orphan cleanup
      // Note: wallet uses auth0| prefixed user ID
      const auth0UserIdPrefixed = auth0Result.user.user_id.startsWith('auth0|') 
        ? auth0Result.user.user_id 
        : `auth0|${auth0Result.user.user_id}`;
      if (virtFusionUserId) {
        try {
          const wallet = await dbStorage.getWallet(auth0UserIdPrefixed);
          if (wallet && !wallet.virtFusionUserId) {
            await dbStorage.updateWalletVirtFusionUserId(auth0UserIdPrefixed, virtFusionUserId);
            log(`Updated wallet with VirtFusion user ID ${virtFusionUserId}`, 'auth');
          }
        } catch (walletError: any) {
          log(`Failed to update wallet VirtFusion ID: ${walletError.message}`, 'auth');
        }
      }

      // Check if user is admin (from Auth0 app_metadata)
      const isAdmin = await auth0Client.isUserAdmin(auth0UserIdPrefixed);
      if (isAdmin) {
        log(`Admin user logged in: ${email}`, 'auth');
      }

      // Get email verification status - check both Auth0 and database override
      const emailVerifiedFromAuth0 = auth0Result.user.email_verified === true;
      const emailVerifiedOverride = await storage.getEmailVerifiedOverride(auth0UserIdPrefixed);
      const emailVerified = emailVerifiedFromAuth0 || emailVerifiedOverride;
      if (emailVerifiedOverride && !emailVerifiedFromAuth0) {
        log(`User ${email} email verified via database override`, 'auth');
      }

      // Create local session
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      const session = await storage.createSession({
        visitorId: 0,
        virtFusionUserId: virtFusionUserId ?? undefined,
        extRelationId: extRelationId ?? undefined,
        email: email,
        name: auth0Result.user.name,
        auth0UserId: auth0UserIdPrefixed, // Use prefixed version for consistency with Auth0 API
        isAdmin,
        emailVerified,
        expiresAt,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || undefined,
      });

      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        expires: expiresAt,
      });

      // Set CSRF token cookie for double-submit pattern
      const csrfToken = generateCsrfToken();
      setCsrfCookie(res, csrfToken, expiresAt);

      // Audit log successful login
      await auditUserAction(req, auth0UserIdPrefixed, email, UserActions.LOGIN_SUCCESS, 'session', session.id, {
        isAdmin,
        emailVerified,
        has2FA: false,
      });

      res.json({
        user: {
          id: auth0UserIdPrefixed,
          email: email,
          name: auth0Result.user.name,
          isAdmin,
          emailVerified,
        },
        csrfToken, // Include in response for initial setup
      });
    } catch (error: any) {
      log(`Login error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Force logout other sessions (requires password verification for security)
  app.post('/api/auth/force-logout', async (req, res) => {
    try {
      const { email, password, recaptchaToken } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Verify reCAPTCHA if enabled (same as login)
      const recaptchaSettings = dbStorage.getRecaptchaSettings();
      if (recaptchaSettings.enabled && recaptchaSettings.secretKey) {
        if (!recaptchaToken) {
          return res.status(400).json({ error: 'reCAPTCHA verification required' });
        }
        const recaptchaValid = await verifyRecaptchaToken(recaptchaToken, recaptchaSettings.secretKey!, 'force_logout', recaptchaSettings.minScore || 0.5);
        if (!recaptchaValid.valid) {
          return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
        }
      }

      // Verify credentials with Auth0 (this ensures the user owns the account)
      const auth0Result = await auth0Client.authenticateUser(email, password);
      if (!auth0Result.success || !auth0Result.user) {
        log(`Force logout failed for ${email} - invalid credentials`, 'auth');
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Revoke all existing sessions for this user
      const auth0UserId = auth0Result.user.user_id.startsWith('auth0|')
        ? auth0Result.user.user_id
        : `auth0|${auth0Result.user.user_id}`;

      await storage.revokeSessionsByAuth0UserId(auth0UserId, SESSION_REVOKE_REASONS.FORCE_LOGOUT);
      log(`Force logout successful for ${email} - all sessions revoked`, 'auth');

      res.json({ success: true, message: 'All other sessions have been logged out. You can now login.' });
    } catch (error: any) {
      log(`Force logout error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to force logout' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE];

    if (sessionId) {
      try {
        // Get session info before deleting for audit log
        const session = await storage.getSession(sessionId);
        if (session) {
          await auditUserAction(req, session.auth0UserId || 'unknown', session.email || 'unknown', UserActions.LOGOUT, 'session', sessionId);
        }
        await storage.deleteSession(sessionId);
      } catch (error) {
        log(`Logout error: ${error}`, 'api');
      }
    }

    res.clearCookie(SESSION_COOKIE);
    res.clearCookie(CSRF_COOKIE);
    res.json({ success: true });
  });

  // Session check endpoint - returns authenticated status without triggering logout
  app.get('/api/auth/session', async (req, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE];

    if (!sessionId) {
      return res.json({ authenticated: false });
    }

    try {
      const session = await storage.getSession(sessionId);

      if (!session || new Date(session.expiresAt) < new Date()) {
        res.clearCookie(SESSION_COOKIE);
        res.clearCookie(CSRF_COOKIE);
        return res.json({ authenticated: false });
      }

      // Check if session was revoked
      if (session.revokedAt) {
        res.clearCookie(SESSION_COOKIE);
        res.clearCookie(CSRF_COOKIE);
        return res.json({ authenticated: false });
      }

      if (session.lastActivityAt) {
        const lastActivity = new Date(session.lastActivityAt);
        const now = new Date();
        if (!isNaN(lastActivity.getTime()) && now.getTime() - lastActivity.getTime() > IDLE_TIMEOUT_MS) {
          await storage.revokeSessionsByAuth0UserId(session.auth0UserId || '', SESSION_REVOKE_REASONS.IDLE_TIMEOUT);
          res.clearCookie(SESSION_COOKIE);
          res.clearCookie(CSRF_COOKIE);
          return res.json({ authenticated: false });
        }
      }

      if (process.env.SESSION_VALIDATE_IP === 'true' && session.ipAddress) {
        const currentIp = getClientIp(req);
        if (currentIp !== session.ipAddress) {
          await storage.deleteSession(sessionId);
          res.clearCookie(SESSION_COOKIE);
          res.clearCookie(CSRF_COOKIE);
          return res.json({ authenticated: false });
        }
      }

      if (session.auth0UserId) {
        const userFlags = await dbStorage.getUserFlagsFromDb(session.auth0UserId);
        if (userFlags?.blocked) {
          await storage.revokeSessionsByAuth0UserId(session.auth0UserId, SESSION_REVOKE_REASONS.USER_BLOCKED);
          res.clearCookie(SESSION_COOKIE);
          res.clearCookie(CSRF_COOKIE);
          return res.json({ authenticated: false });
        }

        const userExists = await auth0Client.userExists(session.auth0UserId);
        if (!userExists) {
          await storage.revokeSessionsByAuth0UserId(session.auth0UserId, SESSION_REVOKE_REASONS.USER_DELETED);
          res.clearCookie(SESSION_COOKIE);
          res.clearCookie(CSRF_COOKIE);
          return res.json({ authenticated: false });
        }
      }

      await storage.updateSessionActivity(sessionId);
      return res.json({ authenticated: true });
    } catch (error) {
      // On any error, just return not authenticated (don't crash)
      res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
      return res.json({ authenticated: false });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE];

    if (!sessionId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const session = await storage.getSession(sessionId);
      
      if (!session || new Date(session.expiresAt) < new Date()) {
        if (session) await storage.deleteSession(sessionId);
        res.clearCookie(SESSION_COOKIE);
        res.clearCookie(CSRF_COOKIE);
        return res.status(401).json({ error: 'Session expired' });
      }

      // Check if session was revoked (e.g., by admin blocking user)
      if (session.revokedAt) {
        res.clearCookie(SESSION_COOKIE);
        res.clearCookie(CSRF_COOKIE);
        const reason = session.revokedReason;
        if (reason === 'USER_BLOCKED') {
          return res.status(401).json({
            error: 'Your account has been suspended. Please contact support.',
            code: 'SESSION_REVOKED_BLOCKED'
          });
        }
        return res.status(401).json({
          error: 'Your session has ended. Please sign in again.',
          code: 'SESSION_REVOKED'
        });
      }

      // Check for updated admin status and email verification (refreshes every call)
      let isAdmin = session.isAdmin ?? false;
      let emailVerified = session.emailVerified ?? false;
      if (session.auth0UserId) {
        try {
          // Check our database for email verification (NOT Auth0 - we set Auth0 to true during registration to prevent their emails)
          const dbEmailVerified = await dbStorage.isEmailVerified(session.auth0UserId);
          const emailVerifiedOverride = await storage.getEmailVerifiedOverride(session.auth0UserId);

          // Get admin status from Auth0
          const currentAdminStatus = await auth0Client.isUserAdmin(session.auth0UserId);

          // Email is verified if our database says so OR admin override
          const currentEmailVerified = dbEmailVerified || emailVerifiedOverride;
          log(`[/api/auth/me] DB verified: ${dbEmailVerified}, Override: ${emailVerifiedOverride}, Final: ${currentEmailVerified}`, 'auth');

          const updates: Partial<{isAdmin: boolean; emailVerified: boolean}> = {};

          if (currentAdminStatus !== isAdmin) {
            log(`Admin status changed for ${session.email}: ${isAdmin} -> ${currentAdminStatus}`, 'auth');
            isAdmin = currentAdminStatus;
            updates.isAdmin = currentAdminStatus;
          }

          if (currentEmailVerified !== emailVerified) {
            log(`Email verification status changed for ${session.email}: ${emailVerified} -> ${currentEmailVerified}${emailVerifiedOverride ? ' (override)' : ''}`, 'auth');
            emailVerified = currentEmailVerified;
            updates.emailVerified = currentEmailVerified;
          }

          // Update session if anything changed
          if (Object.keys(updates).length > 0) {
            await storage.updateSession(sessionId, updates);
          }
        } catch (err: any) {
          // If Auth0 check fails, use cached session value
          log(`Failed to refresh status from Auth0: ${err.message}`, 'auth');
        }
      }

      // Check if user account is blocked or suspended
      let accountBlocked = false;
      let accountBlockedReason: string | null = null;
      let accountSuspended = false;
      let accountSuspendedReason: string | null = null;
      let profilePictureUrl: string | null = null;
      if (session.auth0UserId) {
        // Read directly from database (not cache) for most up-to-date status
        const userFlags = await dbStorage.getUserFlagsFromDb(session.auth0UserId);
        if (userFlags?.blocked) {
          // SECURITY: Revoke session for blocked users (same as authMiddleware)
          await storage.revokeSessionsByAuth0UserId(session.auth0UserId, SESSION_REVOKE_REASONS.USER_BLOCKED);
          res.clearCookie(SESSION_COOKIE);
          res.clearCookie(CSRF_COOKIE);
          return res.status(401).json({
            error: 'Your account has been blocked. Please contact support.',
            code: 'SESSION_REVOKED_BLOCKED'
          });
        }
        if (userFlags?.suspended) {
          accountSuspended = true;
          accountSuspendedReason = userFlags.suspendedReason || null;
        }

        // Get profile picture from wallet
        const wallet = await dbStorage.getWallet(session.auth0UserId);
        profilePictureUrl = wallet?.profilePictureUrl || null;
      }

      res.json({
        user: {
          id: session.userId,
          email: session.email,
          name: session.name,
          virtFusionUserId: session.virtFusionUserId,
          extRelationId: session.extRelationId,
          isAdmin,
          emailVerified,
          accountBlocked,
          accountBlockedReason,
          accountSuspended,
          accountSuspendedReason,
          profilePictureUrl,
        },
      });
    } catch (error: any) {
      log(`Auth check error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Authentication check failed' });
    }
  });

  // Resend verification email - requires authentication (custom verification system)
  app.post('/api/auth/resend-verification', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;

      // Check if already verified via Auth0 or our custom system
      if (session.emailVerified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }

      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'User account not properly configured' });
      }

      // Check if user already verified in our system
      const isVerified = await dbStorage.isEmailVerified(session.auth0UserId);
      if (isVerified) {
        // Update session to reflect verification
        await storage.updateSession(session.id, { emailVerified: true });
        return res.status(400).json({ error: 'Email is already verified' });
      }

      // Create new verification token
      const verificationToken = await dbStorage.createEmailVerificationToken(session.auth0UserId, session.email);

      // Generate verification link
      const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
      const verifyLink = `${appUrl}/verify-email?token=${verificationToken.token}`;

      // Send verification email
      const { sendEmailVerificationEmail } = await import('./email');
      const result = await sendEmailVerificationEmail(session.email, verifyLink);

      if (!result.success) {
        return res.status(500).json({ error: result.error || 'Failed to send verification email' });
      }

      log(`Verification email sent to ${session.email}`, 'auth');
      res.json({ success: true, message: 'Verification email sent. Please check your inbox.' });
    } catch (error: any) {
      log(`Resend verification error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  });

  // Verify email token - public endpoint (no auth required)
  app.get('/api/auth/verify-email', loginRateLimiter, async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      // Get the token from database
      const verificationToken = await dbStorage.getEmailVerificationToken(token);

      if (!verificationToken) {
        return res.status(400).json({ error: 'Invalid verification link' });
      }

      // Check if already verified - token is single-use, treat as error
      if (verificationToken.verified) {
        return res.status(400).json({ error: 'This verification link has already been used.', alreadyVerified: true });
      }

      // Check if expired
      if (new Date(verificationToken.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'Verification link has expired. Please request a new one.' });
      }

      // Mark email as verified in our database
      await dbStorage.markEmailVerified(token);

      // Also mark as verified in Auth0
      try {
        await auth0Client.updateUser(verificationToken.auth0UserId, { email_verified: true });
        log(`Email verified in Auth0 for ${verificationToken.email}`, 'auth');
      } catch (auth0Error: any) {
        // Log but don't fail - our database is the source of truth
        log(`Failed to update Auth0 email_verified: ${auth0Error.message}`, 'auth');
      }

      log(`Email verified for ${verificationToken.email}`, 'auth');
      res.json({ success: true, message: 'Email verified successfully!' });
    } catch (error: any) {
      log(`Email verification error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to verify email' });
    }
  });

  // Protected routes - require authentication
  app.get('/api/servers', authMiddleware, async (req, res) => {
    try {
      const userId = req.userSession!.virtFusionUserId;
      if (!userId) {
        return res.status(400).json({ error: 'VirtFusion account not linked' });
      }
      const servers = await virtfusionClient.listServersWithStats(userId);

      // Fetch all plans to build a map of planId -> planName
      const allPlans = await dbStorage.getAllPlans();
      const planMap: Record<number, string> = {};
      for (const plan of allPlans) {
        planMap[plan.id] = plan.name;
      }

      // Fetch bandwidth status and billing info for each server in parallel
      const serversWithBandwidthAndBilling = await Promise.all(
        servers.map(async (server) => {
          try {
            // Fetch bandwidth status
            const traffic = await virtfusionClient.getServerTrafficHistory(server.id);
            let bandwidthExceeded = false;
            if (traffic?.current) {
              const usedBytes = traffic.current.total || 0;
              const limitGB = traffic.current.limit || 0;
              const usedGB = usedBytes / (1024 * 1024 * 1024);
              bandwidthExceeded = limitGB > 0 && usedGB >= limitGB;
            }

            // Fetch billing status for the server (using UUID for reliable lookup)
            // Note: Billing records are created during server deployment, not auto-initialized
            const billingStatus = await getServerBillingStatus(server.id, req.userSession!.auth0UserId!, server.uuid ?? undefined);

            return {
              ...server,
              bandwidthExceeded,
              billing: billingStatus ? {
                status: billingStatus.status,
                nextBillAt: billingStatus.nextBillAt,
                suspendAt: billingStatus.suspendAt,
                monthlyPriceCents: billingStatus.monthlyPriceCents,
                autoRenew: billingStatus.autoRenew,
                freeServer: billingStatus.freeServer,
                adminSuspended: billingStatus.adminSuspended,
                adminSuspendedAt: billingStatus.adminSuspendedAt,
                adminSuspendedReason: billingStatus.adminSuspendedReason,
                planId: billingStatus.planId,
                planName: planMap[billingStatus.planId] || null,
                isTrial: billingStatus.isTrial,
                trialExpiresAt: billingStatus.trialExpiresAt,
                trialEndedAt: billingStatus.trialEndedAt,
              } : null,
            };
          } catch (error) {
            // If fetch fails, return server without extras
            return { ...server, bandwidthExceeded: false, billing: null };
          }
        })
      );

      res.json(serversWithBandwidthAndBilling);
    } catch (error: any) {
      log(`Error fetching servers: ${error.message}`, 'api');
      return handleApiError(res, error, 'Unable to retrieve your servers. Please try again.', 'listServers');
    }
  });

  // Combined dashboard endpoint - reduces 4 API calls to 1
  // Returns servers, cancellations, billing statuses, and total bandwidth in a single request
  app.get('/api/dashboard/overview', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      const userId = session.virtFusionUserId;

      if (!userId) {
        return res.status(400).json({ error: 'VirtFusion account not linked' });
      }

      // Fetch all data in parallel
      const [servers, cancellations, billingRecords, allPlans] = await Promise.all([
        virtfusionClient.listServersWithStats(userId),
        dbStorage.getUserCancellations(session.auth0UserId!),
        dbStorage.getServerBillingByUser(session.auth0UserId!),
        dbStorage.getAllPlans(),
      ]);

      // Build plan map for lookups
      const planMap: Record<number, string> = {};
      for (const plan of allPlans) {
        planMap[plan.id] = plan.name;
      }

      // Build cancellation map
      const activeCancellations = cancellations.filter(c => c.status === 'pending_approval' || c.status === 'pending' || c.status === 'processing');
      const cancellationMap: Record<string, { scheduledDeletionAt: Date; reason: string | null; mode: string; status: string }> = {};
      for (const c of activeCancellations) {
        cancellationMap[c.virtfusionServerId] = {
          scheduledDeletionAt: c.scheduledDeletionAt,
          reason: c.reason,
          mode: c.mode || 'grace',
          status: c.status,
        };
      }

      // Build billing map
      const billingMap: Record<string, { status: string; nextBillAt?: Date; suspendAt?: Date | null; monthlyPriceCents?: number; freeServer?: boolean; isTrial?: boolean; adminSuspended?: boolean; adminSuspendedReason?: string | null; planId?: number; planName?: string | null }> = {};
      for (const b of billingRecords) {
        billingMap[b.virtfusionServerId] = {
          status: b.status,
          nextBillAt: b.nextBillAt,
          suspendAt: b.suspendAt,
          monthlyPriceCents: b.monthlyPriceCents,
          freeServer: b.freeServer,
          isTrial: b.isTrial || false,
          adminSuspended: b.adminSuspended || false,
          adminSuspendedReason: b.adminSuspendedReason,
          planId: b.planId,
          planName: planMap[b.planId] || null,
        };
      }

      // Track total bandwidth while processing servers
      let totalBandwidth = 0;
      let totalBandwidthLimit = 0;

      // Fetch bandwidth and billing for each server in parallel (with traffic data reuse)
      const serversWithData = await Promise.all(
        servers.map(async (server) => {
          try {
            // Fetch bandwidth status
            const traffic = await virtfusionClient.getServerTrafficHistory(server.id);
            let bandwidthExceeded = false;

            if (traffic?.current) {
              const usedBytes = traffic.current.total || 0;
              const limitGB = traffic.current.limit || 0;
              const usedGB = usedBytes / (1024 * 1024 * 1024);
              bandwidthExceeded = limitGB > 0 && usedGB >= limitGB;

              // Accumulate for total bandwidth calculation
              totalBandwidth += usedBytes;
              totalBandwidthLimit += limitGB;
            }

            // Fetch billing status for the server (using UUID for reliable lookup)
            const billingStatus = await getServerBillingStatus(server.id, session.auth0UserId!, server.uuid ?? undefined);

            return {
              ...server,
              bandwidthExceeded,
              billing: billingStatus ? {
                status: billingStatus.status,
                nextBillAt: billingStatus.nextBillAt,
                suspendAt: billingStatus.suspendAt,
                monthlyPriceCents: billingStatus.monthlyPriceCents,
                autoRenew: billingStatus.autoRenew,
                freeServer: billingStatus.freeServer,
                adminSuspended: billingStatus.adminSuspended,
                adminSuspendedAt: billingStatus.adminSuspendedAt,
                adminSuspendedReason: billingStatus.adminSuspendedReason,
                planId: billingStatus.planId,
                planName: planMap[billingStatus.planId] || null,
                isTrial: billingStatus.isTrial,
                trialExpiresAt: billingStatus.trialExpiresAt,
                trialEndedAt: billingStatus.trialEndedAt,
              } : null,
            };
          } catch (error) {
            return { ...server, bandwidthExceeded: false, billing: null };
          }
        })
      );

      res.json({
        servers: serversWithData,
        cancellations: cancellationMap,
        billingStatuses: billingMap,
        bandwidth: {
          totalBandwidth,
          totalLimit: totalBandwidthLimit,
          serverCount: servers.length,
        },
      });
    } catch (error: any) {
      log(`Error fetching dashboard overview: ${error.message}`, 'api');
      return handleApiError(res, error, 'Unable to load dashboard data. Please refresh the page.', 'dashboardOverview');
    }
  });

  app.get('/api/servers/:id', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      // Fetch bandwidth status (non-critical, don't fail if it errors)
      let bandwidthExceeded = false;
      try {
        const traffic = await virtfusionClient.getServerTrafficHistory(req.params.id);
        if (traffic?.current) {
          const usedBytes = traffic.current.total || 0;
          const limitGB = traffic.current.limit || 0;
          const usedGB = usedBytes / (1024 * 1024 * 1024);
          bandwidthExceeded = limitGB > 0 && usedGB >= limitGB;
        }
      } catch (bandwidthError: any) {
        log(`Warning: Could not fetch bandwidth for server ${req.params.id}: ${bandwidthError.message}`, 'api');
      }

      // Fetch billing status for this server (non-critical, don't fail if it errors)
      // Use UUID for reliable lookup - it never changes even if server ID format changes
      let billingStatus = null;
      try {
        billingStatus = await getServerBillingStatus(req.params.id, req.userSession!.auth0UserId!, server.uuid ?? undefined);

        // Auto-initialize billing for existing servers that don't have a record
        if (!billingStatus) {
          try {
            // Look up plan price from our database based on server specs
            const serverSpecs = server.plan?.specs;
            if (serverSpecs) {
              const matchingPlan = await db.select().from(plans)
                .where(
                  and(
                    eq(plans.vcpu, serverSpecs.vcpu),
                    eq(plans.ramMb, serverSpecs.ram),
                    eq(plans.storageGb, serverSpecs.disk),
                    eq(plans.active, true)
                  )
                )
                .limit(1);

              if (matchingPlan.length > 0) {
                const plan = matchingPlan[0];
                // Use server's actual creation date for accurate billing
                const serverCreatedAt = server.created_at || server.createdAt;
                const deployedAt = serverCreatedAt ? new Date(serverCreatedAt) : undefined;

                await createServerBilling({
                  auth0UserId: req.userSession!.auth0UserId!,
                  virtfusionServerId: req.params.id,
                  virtfusionServerUuid: server.uuid, // Store UUID for reliable future lookups
                  planId: plan.id,
                  monthlyPriceCents: plan.priceMonthly,
                  deployedAt,
                });
                // Fetch the newly created billing record
                billingStatus = await getServerBillingStatus(req.params.id, req.userSession!.auth0UserId!, server.uuid ?? undefined);
                log(`Auto-initialized billing for server ${req.params.id} (UUID: ${server.uuid}) with plan ${plan.code}`, 'billing');
              }
            }
          } catch (billingCreateError: any) {
            log(`Could not auto-initialize billing for server ${req.params.id}: ${billingCreateError.message}`, 'api');
          }
        }
      } catch (billingError: any) {
        log(`Warning: Could not fetch billing status for server ${req.params.id}: ${billingError.message}`, 'api');
      }

      // Fetch plan name if billing exists
      let planName: string | null = null;
      if (billingStatus?.planId) {
        const allPlans = await dbStorage.getAllPlans();
        const plan = allPlans.find(p => p.id === billingStatus.planId);
        planName = plan?.name || null;
      }

      res.json({
        ...server,
        bandwidthExceeded,
        billing: billingStatus ? {
          status: billingStatus.status,
          nextBillAt: billingStatus.nextBillAt,
          suspendAt: billingStatus.suspendAt,
          monthlyPriceCents: billingStatus.monthlyPriceCents,
          autoRenew: billingStatus.autoRenew,
          deployedAt: billingStatus.deployedAt,
          freeServer: billingStatus.freeServer,
          adminSuspended: billingStatus.adminSuspended,
          adminSuspendedAt: billingStatus.adminSuspendedAt,
          adminSuspendedReason: billingStatus.adminSuspendedReason,
          planId: billingStatus.planId,
          planName,
          isTrial: billingStatus.isTrial,
          trialExpiresAt: billingStatus.trialExpiresAt,
          trialEndedAt: billingStatus.trialEndedAt,
        } : null,
      });
    } catch (error: any) {
      log(`Error fetching server ${req.params.id}: ${error.message}`, 'api');
      return handleApiError(res, error, 'Unable to retrieve server details. Please try again.', 'getServer');
    }
  });

  app.post('/api/servers/:id/power', authMiddleware, requireEmailVerified, serverActionRateLimiter, async (req, res) => {
    try {
      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(req.userSession!.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        return res.status(403).json({ error: 'Your account has been suspended. Server controls are disabled.' });
      }

      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. Power actions are disabled.' });
      }

      const { action } = req.body;
      
      if (!['boot', 'reboot', 'shutdown', 'poweroff'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const virtfusionAction = action === 'boot' ? 'start' : 
                              action === 'shutdown' ? 'stop' : 
                              action === 'poweroff' ? 'poweroff' :
                              'restart';

      const result = await virtfusionClient.powerAction(req.params.id, virtfusionAction as any);
      await auditUserAction(req, req.userSession!.auth0UserId!, req.userSession!.email, `server_power_${action}`, 'server', req.params.id, { action });
      res.json(result);
    } catch (error: any) {
      log(`Error performing power action on server ${req.params.id}: ${error.message}`, 'api');

      // VirtFusion returns 423 Locked when there are pending tasks in queue
      if (error.message?.includes('423') || error.message?.includes('Locked') || error.message?.includes('pending tasks')) {
        return res.status(423).json({
          error: 'Server is busy with another operation. Please wait for the current task to complete and try again.'
        });
      }

      return handleApiError(res, error, 'Unable to perform the power action. The server may be busy. Please try again.', 'powerAction');
    }
  });

  app.get('/api/servers/:id/metrics', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }
      const metrics = await virtfusionClient.getServerStats(req.params.id);
      res.json(metrics || { cpu: [], ram: [], net: [] });
    } catch (error: any) {
      log(`Error fetching metrics for server ${req.params.id}: ${error.message}`, 'api');
      return handleApiError(res, error, 'Unable to retrieve server metrics.', 'getMetrics');
    }
  });

  app.get('/api/servers/:id/stats', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }
      const stats = await virtfusionClient.getServerLiveStats(req.params.id);
      res.json(stats || { cpu_usage: 0, ram_usage: 0, disk_usage: 0, net_in: 0, net_out: 0 });
    } catch (error: any) {
      log(`Error fetching live stats for server ${req.params.id}: ${error.message}`, 'api');
      return handleApiError(res, error, 'Unable to retrieve live statistics.', 'getLiveStats');
    }
  });

  app.get('/api/servers/:id/traffic', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }
      const traffic = await virtfusionClient.getServerTrafficHistory(req.params.id);
      res.json(traffic || []);
    } catch (error: any) {
      log(`Error fetching traffic for server ${req.params.id}: ${error.message}`, 'api');
      return handleApiError(res, error, 'Unable to retrieve traffic data.', 'getTrafficData');
    }
  });

  // Real-time traffic statistics for graphing
  app.get('/api/servers/:id/traffic/statistics', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }
      const period = (req.query.period as string) || '30m';
      const validPeriods = ['30m', '1h', '12h', '1d', '1w'];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ error: 'Invalid period. Valid options: 30m, 1h, 12h, 1d, 1w' });
      }
      const statistics = await virtfusionClient.getServerTrafficStatistics(req.params.id, period);
      res.json(statistics || { supported: false, points: [], interval: 60, period });
    } catch (error: any) {
      log(`Error fetching traffic statistics for server ${req.params.id}: ${error.message}`, 'api');
      return handleApiError(res, error, 'Unable to retrieve traffic statistics.', 'getTrafficStats');
    }
  });

  // Aggregate bandwidth usage across all user's servers
  app.get('/api/bandwidth/total', authMiddleware, async (req, res) => {
    try {
      const userId = req.userSession?.virtFusionUserId;
      if (!userId) {
        return res.json({ totalBandwidth: 0, totalLimit: 0, serverCount: 0 });
      }

      const servers = await virtfusionClient.listServersByUserId(userId);
      if (!servers || servers.length === 0) {
        return res.json({ totalBandwidth: 0, totalLimit: 0, serverCount: 0 });
      }

      let totalBandwidth = 0;
      let totalLimit = 0;
      
      // Fetch traffic data for each server in parallel
      const trafficPromises = servers.map(async (server: any) => {
        try {
          const traffic = await virtfusionClient.getServerTrafficHistory(server.id.toString());
          if (traffic?.current) {
            totalBandwidth += traffic.current.total || 0;
            totalLimit += traffic.current.limit || 0;
          }
        } catch (error) {
          // Skip servers that fail to fetch traffic data
        }
      });
      
      await Promise.all(trafficPromises);
      
      res.json({ 
        totalBandwidth, 
        totalLimit, 
        serverCount: servers.length 
      });
    } catch (error: any) {
      log(`Error fetching total bandwidth: ${error.message}`, 'api');
      return res.json({ totalBandwidth: 0, totalLimit: 0, serverCount: 0 });
    }
  });

  app.put('/api/servers/:id/name', authMiddleware, async (req, res) => {
    try {
      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(req.userSession!.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        return res.status(403).json({ error: 'Your account has been suspended. Server controls are disabled.' });
      }

      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. Modifications are disabled.' });
      }

      const parsed = serverNameSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid server name' });
      }

      const { name } = parsed.data;
      const profanityCheck = validateServerName(name);
      if (!profanityCheck.valid) {
        return res.status(400).json({ error: profanityCheck.error });
      }

      await virtfusionClient.updateServerName(req.params.id, name.trim());
      res.json({ success: true, name: name.trim() });
    } catch (error: any) {
      return handleApiError(res, error, 'Unable to update server name.', 'updateServerName');
    }
  });

  app.get('/api/servers/:id/vnc', authMiddleware, async (req, res) => {
    try {
      // Verify ownership before returning VNC details
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied', code: ErrorCodes.ACCESS_DENIED });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. VNC access is disabled.', code: ErrorCodes.SERVER_SUSPENDED });
      }

      const vnc = await virtfusionClient.getVncDetails(req.params.id);
      if (!vnc) {
        return res.status(404).json({ error: 'VNC not available for this server', code: ErrorCodes.RESOURCE_NOT_FOUND });
      }
      res.json(vnc);
    } catch (error: any) {
      return handleApiError(res, error, 'Unable to fetch VNC details.', 'getVncDetails');
    }
  });

  app.post('/api/servers/:id/vnc/enable', authMiddleware, requireEmailVerified, async (req, res) => {
    try {
      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(req.userSession!.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        return res.status(403).json({ error: 'Your account has been suspended. Server controls are disabled.' });
      }

      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied', code: ErrorCodes.ACCESS_DENIED });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. VNC access is disabled.', code: ErrorCodes.SERVER_SUSPENDED });
      }

      const vnc = await virtfusionClient.enableVnc(req.params.id);
      res.json(vnc);
    } catch (error: any) {
      return handleApiError(res, error, 'Unable to enable VNC console.', 'enableVnc');
    }
  });

  app.post('/api/servers/:id/vnc/disable', authMiddleware, requireEmailVerified, async (req, res) => {
    try {
      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(req.userSession!.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        return res.status(403).json({ error: 'Your account has been suspended. Server controls are disabled.' });
      }

      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied', code: ErrorCodes.ACCESS_DENIED });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. VNC access is disabled.', code: ErrorCodes.SERVER_SUSPENDED });
      }

      const vnc = await virtfusionClient.disableVnc(req.params.id);
      res.json(vnc);
    } catch (error: any) {
      return handleApiError(res, error, 'Unable to disable VNC console.', 'disableVnc');
    }
  });

  app.get('/api/servers/:id/network', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied', code: ErrorCodes.ACCESS_DENIED });
      }
      const network = await virtfusionClient.getServerNetworkInfo(req.params.id);
      res.json(network || { interfaces: [] });
    } catch (error: any) {
      return handleApiError(res, error, 'Unable to fetch network information.', 'getNetworkInfo');
    }
  });

  app.get('/api/servers/:id/os-templates', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied', code: ErrorCodes.ACCESS_DENIED });
      }
      const templates = await virtfusionClient.getOsTemplates(req.params.id);
      res.json(templates || []);
    } catch (error: any) {
      return handleApiError(res, error, 'Unable to fetch available operating systems.', 'getOsTemplates');
    }
  });

  // Filtered templates endpoint - returns only templates allowed for this user/server
  app.get('/api/servers/:id/reinstall/templates', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      // Get templates from VirtFusion - these are already filtered by server capabilities
      const templates = await virtfusionClient.getOsTemplates(req.params.id);
      res.json(templates || []);
    } catch (error: any) {
      log(`Error fetching reinstall templates for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch available templates' });
    }
  });

  app.post('/api/servers/:id/reinstall', authMiddleware, requireEmailVerified, serverActionRateLimiter, async (req, res) => {
    try {
      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(req.userSession!.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        return res.status(403).json({ error: 'Your account has been suspended. Server controls are disabled.' });
      }

      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. Reinstall is disabled.' });
      }
      
      // Block reinstall if server has a pending cancellation
      const pendingCancellation = await dbStorage.getCancellationByServerId(req.params.id, req.userSession!.auth0UserId!);
      if (pendingCancellation) {
        const cancellationMsg = pendingCancellation.status === 'pending_approval'
          ? 'Your deletion request is pending admin approval. Reinstall is disabled.'
          : 'Server is scheduled for deletion. Reinstall is disabled.';
        return res.status(403).json({ error: cancellationMsg });
      }

      // Validate request body with Zod schema
      const parseResult = reinstallSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = parseResult.error.errors.map(e => e.message).join(', ');
        return res.status(400).json({ error: errorMessage });
      }

      const { osId, hostname } = parseResult.data;

      // Verify template is allowed for this server
      // Templates are returned in groups, each group has a templates array
      const templateGroups = await virtfusionClient.getOsTemplates(req.params.id);
      let templateAllowed = false;
      let selectedTemplate: any = null;

      if (templateGroups && Array.isArray(templateGroups)) {
        for (const group of templateGroups) {
          if (group.templates && Array.isArray(group.templates)) {
            const found = group.templates.find((t: any) =>
              String(t.id) === String(osId) || t.id === osId
            );
            if (found) {
              templateAllowed = true;
              selectedTemplate = found;
              break;
            }
          }
        }
      }

      if (!templateAllowed) {
        return res.status(403).json({ error: 'Selected OS template is not available for this server' });
      }

      const result = await virtfusionClient.reinstallServer(req.params.id, Number(osId), hostname);

      // Email credentials if password was returned
      if (result.password && req.userSession?.email && server.primaryIp) {
        sendServerReinstallEmail(
          req.userSession!.email,
          hostname || server.name || `Server ${server.id}`,
          server.primaryIp,
          'root',
          result.password,
          selectedTemplate?.name || 'Linux'
        ).catch(() => {});  // Fire and forget
      }

      // Audit log server reinstall
      await auditUserAction(req, req.userSession!.auth0UserId!, req.userSession!.email, UserActions.SERVER_REINSTALL, 'server', req.params.id, {
        serverName: server.name,
        osId,
        osName: selectedTemplate?.name || 'Unknown',
        hostname,
      });

      res.json({ success: true });
    } catch (error: any) {
      log(`Error reinstalling server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to reinstall server. Please try again or contact support.' });
    }
  });

  app.get('/api/servers/:id/build-status', authMiddleware, async (req, res) => {
    try {
      const serverId = req.params.id;

      // CRITICAL FIX: Get build status FIRST to check if commissioned
      // This prevents caching stale data before we know to invalidate
      const buildStatus = await virtfusionClient.getServerBuildStatus(serverId);

      // Track server-side build start time so clients get accurate elapsed time after page refresh
      if (buildStatus.commissioned === 1 || buildStatus.isBuilding) {
        if (!buildStartTimes.has(serverId)) {
          buildStartTimes.set(serverId, Date.now());
        }
      } else if (buildStatus.commissioned === 0) {
        // Still queued — reset timer so elapsed starts from when building actually begins
        buildStartTimes.delete(serverId);
      } else if (buildStatus.commissioned === 2) {
        // Paused — clear so elapsed doesn't tick during pause (rare but avoids stale entries)
        buildStartTimes.delete(serverId);
      } else if (buildStatus.commissioned === 3 || buildStatus.isComplete) {
        // Complete — clean up
        buildStartTimes.delete(serverId);
      }

      const buildingStartedAt = buildStartTimes.get(serverId) ?? null;

      // Compute step and percent server-side so clients don't need time-based simulation
      let step: string;
      let percent: number;
      if (buildStatus.commissioned === 3 || buildStatus.isComplete) {
        step = 'complete'; percent = 100;
      } else if (buildStatus.isError) {
        step = 'failed'; percent = 0;
      } else if (buildStatus.commissioned === 0) {
        step = 'queued'; percent = 5;
      } else if (buildStatus.commissioned === 1 || buildStatus.isBuilding) {
        const elapsedSec = buildingStartedAt ? (Date.now() - buildingStartedAt) / 1000 : 0;
        if (elapsedSec < 20)       { step = 'provisioning'; percent = 20; }
        else if (elapsedSec < 60)  { step = 'imaging';      percent = 40; }
        else if (elapsedSec < 150) { step = 'installing';   percent = 65; }
        else                       { step = 'configuring';  percent = 85; }
      } else {
        step = 'queued'; percent = 5;
      }

      // If commissioned, invalidate cache BEFORE ownership check to prevent stale data
      if (buildStatus.commissioned === 3) {
        log(`Server ${serverId} is commissioned, invalidating cache BEFORE ownership check`, 'virtfusion');
        virtfusionClient.invalidateServerCache(serverId);
      }

      // Now do ownership check - will fetch fresh data if cache was invalidated
      const { server, error, status } = await getServerWithOwnershipCheck(serverId, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      res.json({ ...buildStatus, buildingStartedAt, step, percent });
    } catch (error: any) {
      log(`Error fetching build status for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch build status' });
    }
  });

  // Reset server password - security-sensitive endpoint with ownership verification
  app.post('/api/servers/:id/reset-password', authMiddleware, requireEmailVerified, serverActionRateLimiter, async (req, res) => {
    try {
      const session = req.userSession!;
      const { password } = req.body;

      // Require password confirmation for security
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Account password is required to reset server password' });
      }

      // Verify password with Auth0
      const authResult = await auth0Client.authenticateUser(session.email, password);
      if (!authResult.success) {
        return res.status(400).json({ error: 'Incorrect password. Please try again.' });
      }

      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(session.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        return res.status(403).json({ error: 'Your account has been suspended. Server controls are disabled.' });
      }

      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, session.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. Password reset is disabled.' });
      }

      // Block password reset if server has a pending cancellation
      const pendingCancellation = await dbStorage.getCancellationByServerId(req.params.id, session.auth0UserId!);
      if (pendingCancellation) {
        const cancellationMsg = pendingCancellation.status === 'pending_approval'
          ? 'Your deletion request is pending admin approval. Password reset is disabled.'
          : 'Server is scheduled for deletion. Password reset is disabled.';
        return res.status(403).json({ error: cancellationMsg });
      }

      const result = await virtfusionClient.resetServerPassword(req.params.id);

      if (!result.password) {
        log(`[ERROR] Password reset for ${req.params.id} succeeded but no password returned`, 'api');
        return res.status(500).json({ error: 'Password reset succeeded but no new password was returned' });
      }

      // Audit log server password reset
      await auditUserAction(req, session.auth0UserId!, session.email, UserActions.SERVER_PASSWORD_RESET, 'server', req.params.id, {
        serverName: server.name,
      });

      log(`Password reset completed for server ${req.params.id} by user ${req.userSession!.auth0UserId}`, 'api');
      res.json({ success: true, password: result.password, username: result.username });
    } catch (error: any) {
      log(`Error resetting password for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to reset server password. Please try again or contact support.' });
    }
  });

  // Server Cancellation endpoints
  
  // Get all pending cancellations for current user (for displaying badges on server list)
  app.get('/api/cancellations', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      const cancellations = await dbStorage.getUserCancellations(session.auth0UserId!);
      
      // Filter to return pending_approval, pending and processing cancellations (active deletions)
      const active = cancellations.filter(c => c.status === 'pending_approval' || c.status === 'pending' || c.status === 'processing');
      
      // Return as a map of serverId -> cancellation for easy lookup
      const cancellationMap: Record<string, { scheduledDeletionAt: Date; reason: string | null; mode: string; status: string }> = {};
      for (const c of active) {
        cancellationMap[c.virtfusionServerId] = {
          scheduledDeletionAt: c.scheduledDeletionAt,
          reason: c.reason,
          mode: c.mode || 'grace',
          status: c.status,
        };
      }
      
      res.json({ cancellations: cancellationMap });
    } catch (error: any) {
      log(`Error fetching user cancellations: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch cancellations' });
    }
  });
  
  // Get billing statuses for all user's servers (for showing overdue badges)
  app.get('/api/billing/servers', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      const billingRecords = await dbStorage.getServerBillingByUser(session.auth0UserId!);

      // Return as a map of serverId -> billing status
      const billingMap: Record<string, {
        status: string;
        nextBillAt?: Date;
        suspendAt?: Date | null;
        monthlyPriceCents?: number;
        freeServer?: boolean;
      }> = {};
      for (const b of billingRecords) {
        billingMap[b.virtfusionServerId] = {
          status: b.status,
          nextBillAt: b.nextBillAt,
          suspendAt: b.suspendAt,
          monthlyPriceCents: b.monthlyPriceCents,
          freeServer: b.freeServer,
        };
      }

      res.json({ billing: billingMap });
    } catch (error: any) {
      log(`Error fetching server billing statuses: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch billing statuses' });
    }
  });

  // Get upcoming charges for the user (with server name enrichment)
  app.get('/api/billing/upcoming', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;

      // Fetch upcoming charges
      let upcoming: Array<{
        id: number;
        virtfusionServerId: string;
        planId: number;
        monthlyPriceCents: number;
        status: string;
        nextBillAt: Date;
        suspendAt: Date | null;
        autoRenew: boolean;
        serverName?: string;
      }> = [];

      try {
        const billingRecords = await getUpcomingCharges(session.auth0UserId!);

        // If no billing records, return empty
        if (billingRecords.length === 0) {
          return res.json({ upcoming: [] });
        }

        // Fetch servers to enrich with names and verify they still exist
        if (!session.virtFusionUserId) {
          log(`Warning: Session missing virtFusionUserId for ${session.email}, returning billing without server names`, 'billing');
          // Return billing records without server name enrichment
          upcoming = billingRecords.map(billing => ({
            ...billing,
            serverName: undefined,
          }));
          return res.json({ upcoming });
        }

        const servers = await virtfusionClient.listServersWithStats(session.virtFusionUserId);
        // Convert server IDs to strings since serverBilling stores virtfusionServerId as text
        // Store both name and uuid for each server
        const serverMap = new Map(servers.map(s => [String(s.id), { name: s.name, uuid: s.uuid }]));

        // Include all billing records, even if server is temporarily not visible (e.g., during reinstall)
        // Just enrich with server name and UUID if available
        upcoming = billingRecords.map(billing => {
          const serverInfo = serverMap.get(billing.virtfusionServerId);
          return {
            ...billing,
            serverName: serverInfo?.name || `Server #${billing.virtfusionServerId}`,
            serverUuid: serverInfo?.uuid || billing.virtfusionServerUuid || undefined,
          };
        });
      } catch (billingError: any) {
        log(`Warning: Could not fetch upcoming charges: ${billingError.message}`, 'api');
      }

      res.json({ upcoming });
    } catch (error: any) {
      log(`Error in billing/upcoming endpoint: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch upcoming charges' });
    }
  });

  // Get billing ledger for the user
  app.get('/api/billing/ledger', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      const ledger = await getBillingLedger(session.auth0UserId!);

      res.json({ ledger });
    } catch (error: any) {
      log(`Error fetching billing ledger: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch billing ledger' });
    }
  });

  // Reactivate a suspended/unpaid server by paying the outstanding balance
  app.post('/api/billing/servers/:serverId/reactivate', authMiddleware, requireEmailVerified, async (req, res) => {
    try {
      const session = req.userSession!;
      const { serverId } = req.params;

      // Get the billing record for this server
      const billingRecord = await getServerBillingStatus(serverId, session.auth0UserId!);
      if (!billingRecord) {
        return res.status(404).json({ error: 'No billing record found for this server' });
      }

      // Verify ownership
      if (billingRecord.auth0UserId !== session.auth0UserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Free servers don't need reactivation - they should never be suspended for billing
      if (billingRecord.freeServer) {
        return res.status(400).json({ error: 'This server has complimentary hosting and cannot be reactivated through billing. Please contact support.' });
      }

      // Check if server actually has an outstanding payment
      const now = new Date();
      const isOverdue = (billingRecord.status === 'active' || billingRecord.status === 'paid') && billingRecord.nextBillAt < now;
      const needsPayment = billingRecord.status === 'suspended' || billingRecord.status === 'unpaid' || isOverdue;
      if (!needsPayment) {
        return res.status(400).json({ error: 'Server has no outstanding payment' });
      }

      // Get wallet balance
      const wallet = await dbStorage.getWallet(session.auth0UserId!);
      if (!wallet) {
        return res.status(400).json({ error: 'No wallet found. Please add funds first.' });
      }

      if (wallet.balanceCents < billingRecord.monthlyPriceCents) {
        return res.status(400).json({
          error: `Insufficient balance. You need $${(billingRecord.monthlyPriceCents / 100).toFixed(2)} but only have $${(wallet.balanceCents / 100).toFixed(2)}`,
          required: billingRecord.monthlyPriceCents,
          balance: wallet.balanceCents
        });
      }

      // Retry only the requested server so one click can't charge
      // unrelated overdue servers on the same account.
      await retryServerBilling(session.auth0UserId!, serverId);

      // Fetch the updated billing record to verify the outcome
      const updatedRecord = await getServerBillingStatus(serverId, session.auth0UserId!);

      // If the billing status is still suspended, the unsuspend failed (charge was refunded)
      if (updatedRecord?.status === 'suspended') {
        return res.status(500).json({
          error: 'Payment was processed but the server could not be unsuspended. Your wallet has been refunded. Please try again or contact support.',
          billingRecord: updatedRecord,
        });
      }

      log(`User ${session.email} reactivated server ${serverId}`, 'billing');
      res.json({
        success: true,
        message: 'Server reactivated successfully',
        billingRecord: updatedRecord
      });
    } catch (error: any) {
      log(`Error reactivating server ${req.params.serverId}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to reactivate server' });
    }
  });

  app.get('/api/servers/:id/cancellation', authMiddleware, async (req, res) => {
    try {
      const serverId = req.params.id;
      const session = req.userSession!;
      
      // Verify server ownership
      const { server, error, status } = await getServerWithOwnershipCheck(serverId, session.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }
      
      // Get pending cancellation for this server
      const cancellation = await dbStorage.getCancellationByServerId(serverId, session.auth0UserId!);
      
      res.json({ cancellation: cancellation || null });
    } catch (error: any) {
      log(`Error fetching cancellation status for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch cancellation status' });
    }
  });

  app.post('/api/servers/:id/cancellation', authMiddleware, async (req, res) => {
    try {
      const serverId = req.params.id;
      const session = req.userSession!;
      const { reason, mode = 'grace', password } = req.body;

      // Validate mode
      if (mode !== 'grace' && mode !== 'immediate') {
        return res.status(400).json({ error: 'Invalid mode. Must be "grace" or "immediate"' });
      }

      // SECURITY: Require password confirmation for immediate cancellation
      if (mode === 'immediate') {
        if (!password || typeof password !== 'string') {
          return res.status(400).json({ error: 'Password confirmation is required for immediate cancellation' });
        }

        // Verify password with Auth0
        // Use 400 instead of 401 to avoid triggering session expiry handling in frontend
        const authResult = await auth0Client.authenticateUser(session.email, password);
        if (!authResult.success) {
          return res.status(400).json({ error: 'Incorrect password. Please try again.' });
        }
      }

      // Verify server ownership
      const { server, error, status } = await getServerWithOwnershipCheck(serverId, session.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      // Check if server is overdue on payment - block deletion to prevent abuse
      const billingStatus = await getServerBillingStatus(serverId, session.auth0UserId!, server.uuid);
      if (billingStatus && !billingStatus.freeServer) {
        const isOverdue = billingStatus.status === 'unpaid' ||
          billingStatus.status === 'suspended' ||
          (billingStatus.nextBillAt && new Date(billingStatus.nextBillAt) <= new Date());
        if (isOverdue) {
          return res.status(403).json({
            error: 'Cannot delete server with outstanding payment. Please pay the overdue balance first.',
            code: 'PAYMENT_REQUIRED'
          });
        }
      }

      // Check if server is already cancelled
      const existing = await dbStorage.getCancellationByServerId(serverId, session.auth0UserId!);
      if (existing) {
        return res.status(400).json({ error: 'Server already has a pending cancellation request' });
      }
      
      // Calculate scheduled deletion date based on mode
      const scheduledDeletionAt = new Date();
      if (mode === 'immediate') {
        // Immediate: 5 minutes from now
        scheduledDeletionAt.setMinutes(scheduledDeletionAt.getMinutes() + 5);
      } else {
        // Grace period: 30 days from now
        scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 30);
      }
      
      const cancellation = await dbStorage.createCancellationRequest({
        auth0UserId: session.auth0UserId!,
        virtfusionServerId: serverId,
        serverName: server.name,
        reason: reason || null,
        status: 'pending_approval',
        scheduledDeletionAt,
        mode,
      });

      // Audit log server cancellation
      await auditUserAction(req, session.auth0UserId!, session.email, UserActions.SERVER_CANCEL, 'server', serverId, {
        serverName: server.name,
        mode,
        scheduledDeletionAt: scheduledDeletionAt.toISOString(),
        reason: reason || null,
      });

      log(`Cancellation requested for server ${serverId} by user ${session.auth0UserId}, mode=${mode}, scheduled for ${scheduledDeletionAt.toISOString()}`, 'api');

      res.json({ success: true, cancellation });
    } catch (error: any) {
      log(`Error requesting cancellation for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to request cancellation' });
    }
  });

  app.delete('/api/servers/:id/cancellation', authMiddleware, async (req, res) => {
    try {
      const serverId = req.params.id;
      const session = req.userSession!;

      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(session.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        return res.status(403).json({ error: 'Your account has been suspended. Server controls are disabled.' });
      }

      // Verify server ownership
      const { server, error, status } = await getServerWithOwnershipCheck(serverId, session.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }
      
      // Get pending cancellation
      const cancellation = await dbStorage.getCancellationByServerId(serverId, session.auth0UserId!);
      if (!cancellation) {
        return res.status(404).json({ error: 'No pending cancellation found' });
      }
      
      // Prevent revoking immediate cancellations - they cannot be stopped
      if (cancellation.mode === 'immediate') {
        return res.status(400).json({ error: 'Immediate cancellations cannot be revoked. The server will be deleted within 5 minutes.' });
      }
      
      // Revoke the cancellation
      const revoked = await dbStorage.revokeCancellationRequest(cancellation.id);
      
      log(`Cancellation revoked for server ${serverId} by user ${session.auth0UserId}`, 'api');
      
      res.json({ success: true, cancellation: revoked });
    } catch (error: any) {
      log(`Error revoking cancellation for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to revoke cancellation' });
    }
  });

  app.post('/api/servers/:id/console-url', authMiddleware, async (req, res) => {
    try {
      const serverId = req.params.id;
      const session = req.userSession!;

      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(session.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        return res.status(403).json({ error: 'Your account has been suspended. Server controls are disabled.' });
      }

      // Get server to verify ownership and get UUID
      const { server, error, status } = await getServerWithOwnershipCheck(serverId, session.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. Console access is disabled.' });
      }

      const panelUrl = process.env.VIRTFUSION_PANEL_URL || '';
      
      // Step 1: Enable VNC on the server first
      try {
        log(`Enabling VNC for server ${serverId}...`, 'api');
        await virtfusionClient.enableVnc(serverId);
        log(`VNC enabled successfully for server ${serverId}`, 'api');
      } catch (vncError: any) {
        log(`Failed to enable VNC for server ${serverId}: ${vncError.message}`, 'api');
      }
      
      // Step 2: Get VNC access details for embedded noVNC
      let vncAccess = null;
      try {
        vncAccess = await virtfusionClient.getServerVncAccess(serverId);
        // Log without exposing password
        log(`VNC access retrieved for server ${serverId}: ip=${vncAccess?.ip}, port=${vncAccess?.port}, hasPassword=${!!vncAccess?.password}`, 'api');
      } catch (vncErr: any) {
        log(`Failed to get VNC access: ${vncErr.message}`, 'api');
      }
      
      // Return embedded VNC data if we have WebSocket access
      if (vncAccess?.wss?.url && vncAccess?.password) {
        // Build WebSocket URL from panel URL
        const panelHost = new URL(panelUrl).host;
        const wsUrl = `wss://${panelHost}${vncAccess.wss.url}`;

        log(`Embedded VNC WebSocket URL: ${wsUrl}`, 'api');

        // SECURITY: Store credentials server-side as a one-time token.
        // The noVNC page exchanges this token (with auth cookie) to get credentials.
        // Raw wsUrl/password never appear in any URL or browser history.
        const vncToken = randomBytes(32).toString('hex');
        vncSessionTokens.set(vncToken, {
          wsUrl,
          password: vncAccess.password,
          serverId,
          auth0UserId: session.auth0UserId!,
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 min to exchange token
        });

        // Auto-disable VNC after 30 minutes (reset timer if user opens a new console)
        const existingTimer = vncAutoDisableTimers.get(serverId);
        if (existingTimer) clearTimeout(existingTimer);
        vncAutoDisableTimers.set(serverId, setTimeout(() => {
          virtfusionClient.disableVnc(serverId).catch(() => {});
          vncAutoDisableTimers.delete(serverId);
          log(`VNC auto-disabled for server ${serverId} after ${VNC_SESSION_TTL_MS / 60000}min TTL`, 'security');
        }, VNC_SESSION_TTL_MS));

        return res.json({
          embedded: true,
          vncToken,
        });
      }
      
      // Fallback: Try to get auth token for SSO to old panel (not preferred)
      try {
        const ownerData = await virtfusionClient.getServerOwner(serverId);
        const extRelationId = ownerData?.extRelationId;
        
        if (extRelationId) {
          const tokenData = await virtfusionClient.generateServerLoginTokens(
            server.id.toString(), 
            extRelationId.toString()
          );
          
          if (tokenData?.authentication?.tokens) {
            const tokens = tokenData.authentication.tokens;
            if (tokens['1'] && tokens['2']) {
              // Return auth URL and VNC URL separately - frontend will handle flow
              const authUrl = `${panelUrl}/token_authenticate/?1=${tokens['1']}&2=${tokens['2']}`;
              const vncUrl = `${panelUrl}/server/${server.uuid}/vnc`;
              
              log(`Fallback: Generated auth URL: ${authUrl}`, 'api');
              log(`Fallback: VNC URL: ${vncUrl}`, 'api');
              
              return res.json({ 
                authUrl,
                vncUrl,
                twoStep: true
              });
            }
          }
        }
      } catch (tokenErr: any) {
        log(`Token generation failed: ${tokenErr.message}`, 'api');
      }

      // SECURITY: Do NOT fallback to unauthenticated URL
      // If token generation fails, return an error instead of exposing unprotected console
      log(`Console URL generation failed for server ${req.params.id} - no valid authentication method`, 'security');
      return res.status(503).json({
        error: 'Console temporarily unavailable. Please try again in a few moments.',
        retryable: true
      });
    } catch (error: any) {
      log(`Error generating console URL for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to generate console URL' });
    }
  });

  // Exchange a one-time VNC session token for actual credentials.
  // Requires auth — only the session that created the token can redeem it.
  app.get('/api/vnc-session/:token', authMiddleware, async (req, res) => {
    const token = req.params.token;
    const session = req.userSession!;

    const vncSession = vncSessionTokens.get(token);
    if (!vncSession) {
      return res.status(404).json({ error: 'Invalid or expired console token. Please request a new console session.' });
    }

    // Verify the token belongs to this authenticated user
    if (vncSession.auth0UserId !== session.auth0UserId) {
      log(`VNC token theft attempt: token owned by ${vncSession.auth0UserId}, used by ${session.auth0UserId}`, 'security');
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check token expiry (5 min to exchange after console-url is called)
    if (Date.now() > vncSession.expiresAt) {
      vncSessionTokens.delete(token);
      return res.status(410).json({ error: 'Console token has expired. Please close this window and open a new console session.' });
    }

    // One-time use: delete token immediately after returning credentials
    vncSessionTokens.delete(token);

    return res.json({
      wsUrl: vncSession.wsUrl,
      password: vncSession.password,
    });
  });

  // Serve the noVNC console page with credentials injected server-side.
  // This eliminates all client-side token exchange and browser caching issues.
  // Credentials are injected into the HTML by Express — they never appear in a URL.
  app.get('/api/servers/:id/vnc-console', authMiddleware, async (req, res) => {
    try {
      const serverId = req.params.id;
      const session = req.userSession!;

      // Check account flags
      const userFlags = await dbStorage.getUserFlagsFromDb(session.auth0UserId!);
      if (userFlags?.blocked) {
        return res.status(403).send('<p>Your account has been blocked. Please contact support.</p>');
      }
      if (userFlags?.suspended) {
        return res.status(403).send('<p>Your account has been suspended. Server controls are disabled.</p>');
      }

      // Verify ownership
      const { server, error: ownerError, status: ownerStatus } = await getServerWithOwnershipCheck(serverId, session.virtFusionUserId);
      if (!server) {
        return res.status(ownerStatus || 403).send(ownerError || 'Access denied');
      }
      if (server.suspended) {
        return res.status(403).send('<p>Server is suspended. Console access is disabled.</p>');
      }

      const panelUrl = process.env.VIRTFUSION_PANEL_URL || '';

      // Enable VNC
      try {
        await virtfusionClient.enableVnc(serverId);
      } catch (vncError: any) {
        log(`Failed to enable VNC for server ${serverId}: ${vncError.message}`, 'api');
      }

      // Get VNC credentials
      let vncAccess: any = null;
      try {
        vncAccess = await virtfusionClient.getServerVncAccess(serverId);
      } catch (vncErr: any) {
        log(`Failed to get VNC access for server ${serverId}: ${vncErr.message}`, 'api');
      }

      if (!vncAccess?.wss?.url || !vncAccess?.password) {
        return res.status(503).send('<p>VNC console is not available for this server right now. The server may be powered off.</p>');
      }

      // Build WebSocket URL
      const panelHost = new URL(panelUrl).host;
      const wsUrl = new URL(`wss://${panelHost}${vncAccess.wss.url}`);
      let wsPath = wsUrl.pathname.replace(/^\//, '');
      if (wsUrl.search) wsPath += wsUrl.search;

      // Set up 30-min auto-disable timer
      const existingTimer = vncAutoDisableTimers.get(serverId);
      if (existingTimer) clearTimeout(existingTimer);
      vncAutoDisableTimers.set(serverId, setTimeout(() => {
        virtfusionClient.disableVnc(serverId).catch(() => {});
        vncAutoDisableTimers.delete(serverId);
        log(`VNC auto-disabled for server ${serverId} after ${VNC_SESSION_TTL_MS / 60000}min TTL`, 'security');
      }, VNC_SESSION_TTL_MS));

      // Read vnc.html template from dist
      const vncHtmlPath = path.resolve(__dirname, 'public/novnc/vnc.html');
      let html: string;
      try {
        html = await fs.promises.readFile(vncHtmlPath, 'utf-8');
      } catch (readErr: any) {
        log(`Failed to read vnc.html: ${readErr.message}`, 'api');
        return res.status(500).send('<p>Console unavailable. Please try again.</p>');
      }

      // Create a short-lived proxy session token.
      // The browser only gets this opaque token — NOT the VirtFusion password or wsUrl.
      // When noVNC connects via WebSocket (/api/vnc-ws/:token), our proxy:
      //   1. Validates and deletes the token (one-time use)
      //   2. Connects to VirtFusion server-side
      //   3. Handles VNC authentication (DES challenge-response) using stored password
      //   4. Presents "None" auth to noVNC — no password ever sent to browser
      const proxyToken = randomBytes(32).toString('hex'); // 64-char hex
      vncProxySessions.set(proxyToken, {
        wsUrl: wsUrl.toString(),
        password: vncAccess.password,
        auth0UserId: session.auth0UserId!,
        serverId,
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 min to initiate WebSocket
      });

      // Inject two things:
      // 1. <base href="/novnc/"> at START of <head> — fixes all relative asset paths
      // 2. window.__ozvpsVncConfig — only the proxy token path + non-sensitive settings
      //    host/port/encrypt are intentionally OMITTED so noVNC uses window.location
      //    defaults (correct hostname regardless of NGINX proxying).
      html = html.replace('<head>', '<head>\n<base href="/novnc/">');
      // Inject as JS (not JSON) so host/port/encrypt use window.location at runtime.
      // This prevents stale localStorage values from overriding the correct connection target.
      // Only path (the proxy token) and serverId are hardcoded server-side.
      const configScript = `<script>window.__ozvpsVncConfig = {
  host: window.location.hostname,
  port: window.location.port || (window.location.protocol === 'https:' ? '443' : '80'),
  encrypt: window.location.protocol === 'https:' ? '1' : '0',
  path: ${JSON.stringify(`api/vnc-ws/${proxyToken}`)},
  autoconnect: '1',
  resize: 'scale',
  reconnect: '0',
  serverId: ${JSON.stringify(serverId)}
};</script>`;
      html = html.replace('</head>', configScript + '\n</head>');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.send(html);

      log(`VNC console served for server ${serverId} (user: ${session.auth0UserId})`, 'security');
    } catch (error: any) {
      log(`Error serving VNC console for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).send('<p>Console unavailable. Please try again.</p>');
    }
  });

  app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;

      // Get wallet to retrieve profile picture
      const wallet = await dbStorage.getWallet(session.auth0UserId!);

      res.json({
        id: session.userId || session.id,
        email: session.email,
        name: session.name,
        virtFusionUserId: session.virtFusionUserId,
        profilePictureUrl: wallet?.profilePictureUrl || null,
        createdAt: new Date().toISOString(),
      });
    } catch (error: any) {
      log(`Error fetching user profile: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  app.put('/api/user/profile', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      const sessionId = req.cookies?.[SESSION_COOKIE];
      const { name } = req.body;
      
      // Validate name if provided
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length < 1) {
          return res.status(400).json({ error: 'Name must be a non-empty string' });
        }
        if (name.trim().length > 100) {
          return res.status(400).json({ error: 'Name must be 100 characters or less' });
        }
      }
      
      let updatedName = session.name;
      
      // Update name in Auth0 if provided
      if (name && name.trim() !== session.name && session.auth0UserId) {
        const success = await auth0Client.updateUserName(session.auth0UserId, name.trim());
        if (!success) {
          return res.status(500).json({ error: 'Failed to update name' });
        }
        updatedName = name.trim();

        // Persist the name change to the session storage
        if (sessionId) {
          await storage.updateSession(sessionId, { name: updatedName });
        }

        // Audit log profile update
        await auditUserAction(req, session.auth0UserId, session.email, UserActions.PROFILE_UPDATE, 'account', session.auth0UserId, {
          oldName: session.name,
          newName: updatedName,
        });

        log(`Updated user name for ${session.email} to: ${updatedName}`, 'api');
      }

      res.json({
        id: session.userId || session.id,
        email: session.email,
        name: updatedName,
        virtFusionUserId: session.virtFusionUserId,
        createdAt: new Date().toISOString(),
      });
    } catch (error: any) {
      log(`Error updating user profile: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to update user profile' });
    }
  });

  app.post('/api/user/password', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      const { currentPassword, newPassword } = req.body;

      // SECURITY: Require current password verification
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }

      if (!newPassword) {
        return res.status(400).json({ error: 'New password is required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'Unable to change password. Please contact support.' });
      }

      // SECURITY: Verify current password before allowing change
      const authResult = await auth0Client.authenticateUser(session.email, currentPassword);
      if (!authResult.success) {
        log(`Password change blocked - invalid current password for: ${session.email}`, 'security');
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const result = await auth0Client.changePassword(session.auth0UserId, newPassword);

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to change password' });
      }

      // SECURITY: Revoke all other sessions after password change
      // Keep current session active so user doesn't get logged out
      const currentSessionId = req.cookies?.[SESSION_COOKIE];
      await storage.revokeSessionsByAuth0UserId(session.auth0UserId, SESSION_REVOKE_REASONS.PASSWORD_CHANGED, currentSessionId);
      log(`All other sessions revoked after password change for: ${session.email}`, 'security');

      // Audit log password change
      await auditUserAction(req, session.auth0UserId, session.email, UserActions.PASSWORD_CHANGE, 'account', session.auth0UserId);

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      log(`Error changing password: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // ===========================================
  // PROFILE PICTURE UPLOAD
  // ===========================================

  // Upload profile picture (base64)
  // Use a higher body limit for this endpoint (15MB to accommodate 10MB image + base64 overhead)
  app.post('/api/user/profile-picture', express.json({ limit: '15mb' }), profilePictureRateLimiter, authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      const { image } = req.body; // Base64 image string

      if (!image) {
        return res.status(400).json({ error: 'No image provided' });
      }

      // Validate base64 image data URL format
      const matches = image.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: 'Invalid image format. Use JPEG, PNG, GIF, or WebP.' });
      }

      const [, , base64Data] = matches;
      const inputBuffer = Buffer.from(base64Data, 'base64');

      // Check raw upload size (10MB limit before processing)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (inputBuffer.length > maxSize) {
        return res.status(400).json({ error: 'Image too large. Maximum size is 10MB.' });
      }

      // SECURITY: Process through Sharp to:
      // 1. Verify the buffer is actually a valid image (throws if not)
      // 2. Re-encode to JPEG — strips all metadata (EXIF, embedded scripts, etc.)
      // 3. Resize to max 400x400 to prevent storage abuse
      let processedBuffer: Buffer;
      try {
        processedBuffer = await sharp(inputBuffer)
          .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, progressive: true })
          .toBuffer();
      } catch {
        return res.status(400).json({ error: 'Invalid image file. Please upload a valid image.' });
      }

      // Create uploads directory if it doesn't exist
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const uploadsDir = pathModule.join(process.cwd(), 'uploads', 'profile-pictures');
      await fs.mkdir(uploadsDir, { recursive: true });

      // Generate unique filename — always .jpg since we re-encode to JPEG
      const safeUserId = session.auth0UserId!.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${safeUserId}_${Date.now()}.jpg`;
      const filepath = pathModule.join(uploadsDir, filename);

      // Delete old profile picture if exists
      const wallet = await dbStorage.getWallet(session.auth0UserId!);
      if (wallet?.profilePictureUrl) {
        const oldFilename = wallet.profilePictureUrl.replace('/uploads/profile-pictures/', '');
        // SECURITY: Validate filename to prevent path traversal
        if (oldFilename && !oldFilename.includes('..') && !oldFilename.includes('/') && !oldFilename.includes('\\') && !pathModule.isAbsolute(oldFilename)) {
          const oldFilepath = pathModule.join(uploadsDir, oldFilename);
          if (oldFilepath.startsWith(uploadsDir)) {
            try {
              await fs.unlink(oldFilepath);
            } catch {
              // Ignore if old file doesn't exist
            }
          }
        }
      }

      // Save the sanitized, re-encoded file
      await fs.writeFile(filepath, processedBuffer);

      // Update database with new URL
      const profilePictureUrl = `/uploads/profile-pictures/${filename}`;
      await dbStorage.updateProfilePicture(session.auth0UserId!, profilePictureUrl);

      log(`Profile picture uploaded for ${session.email}: ${filename}`, 'api');
      res.json({ success: true, profilePictureUrl });
    } catch (error: any) {
      log(`Error uploading profile picture: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to upload profile picture' });
    }
  });

  // Delete profile picture
  app.delete('/api/user/profile-picture', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;

      const wallet = await dbStorage.getWallet(session.auth0UserId!);
      if (wallet?.profilePictureUrl) {
        // Delete file from disk
        const fs = await import('fs/promises');
        const path = await import('path');
        const uploadsDir = path.join(process.cwd(), 'uploads', 'profile-pictures');
        const filename = wallet.profilePictureUrl.replace('/uploads/profile-pictures/', '');
        // SECURITY: Validate filename to prevent path traversal
        if (filename && !filename.includes('..') && !filename.includes('/') && !filename.includes('\\') && !path.isAbsolute(filename)) {
          const filepath = path.join(uploadsDir, filename);
          // Double-check the resolved path is within uploads directory
          if (filepath.startsWith(uploadsDir)) {
            try {
              await fs.unlink(filepath);
            } catch {
              // Ignore if file doesn't exist
            }
          }
        }
      }

      // Clear profile picture URL in database
      await dbStorage.updateProfilePicture(session.auth0UserId!, null);

      log(`Profile picture deleted for ${session.email}`, 'api');
      res.json({ success: true });
    } catch (error: any) {
      log(`Error deleting profile picture: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to delete profile picture' });
    }
  });

  // ===========================================
  // TWO-FACTOR AUTHENTICATION ENDPOINTS
  // ===========================================

  const twoFactorTemporarilyUnavailable = (res: Response) => {
    return res.status(503).json({
      error: 'Two-factor authentication is temporarily unavailable',
      code: 'TWO_FACTOR_TEMPORARILY_DISABLED',
    });
  };

  // Get 2FA status for current user
  app.get('/api/user/2fa/status', authMiddleware, async (req, res) => {
    try {
      res.json({
        enabled: false,
        method: 'totp',
        verifiedAt: null,
        lastUsedAt: null,
        temporarilyDisabled: true,
      });
    } catch (error: any) {
      log(`Error getting 2FA status: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to get 2FA status' });
    }
  });

  // Begin 2FA setup - generate secret and QR code
  app.post('/api/user/2fa/setup', authMiddleware, mfaRateLimiter, async (req, res) => {
    return twoFactorTemporarilyUnavailable(res);
  });

  // Enable 2FA after verifying token
  app.post('/api/user/2fa/enable', authMiddleware, mfaRateLimiter, async (req, res) => {
    return twoFactorTemporarilyUnavailable(res);
  });

  // Disable 2FA
  app.post('/api/user/2fa/disable', authMiddleware, mfaRateLimiter, async (req, res) => {
    return twoFactorTemporarilyUnavailable(res);
  });

  // Generate new backup codes
  app.post('/api/user/2fa/backup-codes', authMiddleware, mfaRateLimiter, async (req, res) => {
    return twoFactorTemporarilyUnavailable(res);
  });

  // Email 2FA: Setup (creates record with email method)
  app.post('/api/user/2fa/email/setup', authMiddleware, mfaRateLimiter, async (req, res) => {
    return twoFactorTemporarilyUnavailable(res);
  });

  // Email 2FA: Enable (verify code and enable)
  app.post('/api/user/2fa/email/enable', authMiddleware, mfaRateLimiter, async (req, res) => {
    return twoFactorTemporarilyUnavailable(res);
  });

  // Email 2FA: Send code during login (public, but rate limited)
  app.post('/api/user/2fa/email/send', mfaRateLimiter, async (req, res) => {
    return twoFactorTemporarilyUnavailable(res);
  });

  app.post('/api/admin/block-user', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { auth0UserId, blocked, reason } = req.body;
      
      if (!auth0UserId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      await storage.setUserBlocked(auth0UserId, blocked, reason);

      if (blocked) {
        await storage.revokeSessionsByAuth0UserId(auth0UserId, SESSION_REVOKE_REASONS.USER_BLOCKED);
        log(`User ${auth0UserId} blocked and sessions revoked: ${reason || 'No reason provided'}`, 'admin');
        await auditLog(req, 'user.block', 'user', auth0UserId, auth0UserId, { reason }, 'success');
      } else {
        log(`User ${auth0UserId} unblocked`, 'admin');
        await auditLog(req, 'user.unblock', 'user', auth0UserId, auth0UserId, {}, 'success');
      }

      res.json({ success: true });
    } catch (error: any) {
      log(`Error blocking user: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to update user status' });
    }
  });

  // Admin: Get webhook health status
  app.get('/api/admin/webhook-health', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const health = WebhookHandlers.getHealth();

      // Also get the configured webhook URL from environment
      const appDomain = process.env.APP_DOMAIN;
      const configuredUrl = appDomain ? `https://${appDomain}/api/stripe/webhook` : 'Not configured';

      res.json({
        ...health,
        configuredUrl,
        message: health.healthy
          ? 'Webhooks are working'
          : health.lastReceived
            ? 'No webhooks received in the last 24 hours'
            : 'No webhooks received since server start',
      });
    } catch (error: any) {
      log(`Error fetching webhook health: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch webhook health' });
    }
  });

  // Admin: Get all wallets
  app.get('/api/admin/wallets', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const allWallets = await dbStorage.getAllWallets();
      res.json({ wallets: allWallets });
    } catch (error: any) {
      log(`Error fetching wallets: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch wallets' });
    }
  });

  // Admin: Adjust wallet balance
  const MAX_ADJUSTMENT_CENTS = 1000000; // $10,000 max per adjustment
  const LARGE_ADJUSTMENT_THRESHOLD_CENTS = 10000; // $100 - require confirmation above this
  const walletAdjustSchema = z.object({
    auth0UserId: z.string().min(1, 'User ID is required'),
    amountCents: z.number().int()
      .refine(val => val !== 0, 'Amount cannot be zero')
      .refine(val => Math.abs(val) <= MAX_ADJUSTMENT_CENTS, `Adjustment cannot exceed $${(MAX_ADJUSTMENT_CENTS / 100).toLocaleString()}`),
    reason: z.string().min(3, 'Reason must be at least 3 characters').max(500, 'Reason too long'),
    confirmAction: z.boolean().optional(),
  });

  app.post('/api/admin/wallet/adjust', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const parsed = walletAdjustSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' });
      }

      const { auth0UserId, amountCents, reason, confirmAction } = parsed.data;

      // SECURITY: Require explicit confirmation for large adjustments (over $100)
      if (Math.abs(amountCents) > LARGE_ADJUSTMENT_THRESHOLD_CENTS && confirmAction !== true) {
        const formattedAmount = (Math.abs(amountCents) / 100).toFixed(2);
        return res.status(400).json({
          error: 'Large adjustment requires confirmation',
          code: 'CONFIRMATION_REQUIRED',
          message: `Adjustments over $100 require confirmAction: true. This adjustment is $${formattedAmount}.`
        });
      }

      // Verify the user exists in Auth0 before adjusting
      const userExists = await auth0Client.userExists(auth0UserId);
      if (!userExists) {
        return res.status(404).json({ error: 'User not found in Auth0' });
      }

      const result = await dbStorage.adjustWalletBalance(
        auth0UserId,
        amountCents,
        reason.trim(),
        req.userSession!.email
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Sync with Stripe - create customer balance transaction
      const wallet = result.wallet;
      if (wallet?.stripeCustomerId) {
        try {
          const stripe = await getUncachableStripeClient();
          const formattedAmount = (Math.abs(amountCents) / 100).toFixed(2);
          const adjustmentType = amountCents > 0 ? 'credit' : 'debit';
          
          await stripe.customers.createBalanceTransaction(wallet.stripeCustomerId, {
            amount: -amountCents, // Stripe uses negative for credits (reduces amount owed)
            currency: 'aud',
            description: `Admin ${adjustmentType}: $${formattedAmount} - ${reason}`,
            metadata: {
              admin_email: req.userSession!.email,
              reason: reason.trim(),
              type: 'admin_adjustment'
            }
          });
          log(`Stripe balance synced for ${auth0UserId}: ${amountCents > 0 ? '+' : ''}${amountCents} cents`, 'admin');
        } catch (stripeError: any) {
          // Log but don't fail - the local wallet is already updated
          log(`Warning: Failed to sync with Stripe: ${stripeError.message}`, 'admin');
        }
      }

      log(`Admin ${req.userSession!.email} adjusted wallet for ${auth0UserId}: ${amountCents > 0 ? '+' : ''}${amountCents} cents (${reason})`, 'admin');
      res.json({ success: true, wallet: result.wallet });
    } catch (error: any) {
      log(`Error adjusting wallet: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to adjust wallet' });
    }
  });

  // Admin: Search users by email
  app.get('/api/admin/users/search', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const email = (req.query.email as string || '').trim().toLowerCase();
      if (!email || email.length < 3) {
        return res.status(400).json({ error: 'Email search query required (min 3 characters)' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Search Auth0 for user (requires exact email match)
      const auth0User = await auth0Client.getUserByEmail(email);
      if (!auth0User) {
        return res.json({ users: [] });
      }

      // Verify exact email match (case-insensitive)
      if (auth0User.email.toLowerCase() !== email) {
        return res.json({ users: [] });
      }

      // Get wallet info
      const wallet = await dbStorage.getWallet(auth0User.user_id);

      res.json({
        users: [{
          auth0UserId: auth0User.user_id,
          email: auth0User.email,
          name: auth0User.name,
          emailVerified: auth0User.email_verified,
          virtFusionUserId: auth0User.app_metadata?.virtfusion_user_id,
          wallet: wallet ? {
            balanceCents: wallet.balanceCents,
            stripeCustomerId: wallet.stripeCustomerId,
          } : null,
        }],
      });
    } catch (error: any) {
      log(`Error searching users: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to search users' });
    }
  });

  // Admin: Get user transactions
  app.get('/api/admin/users/:auth0UserId/transactions', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { auth0UserId } = req.params;
      const transactions = await dbStorage.getWalletTransactions(auth0UserId, 100);
      res.json({ transactions });
    } catch (error: any) {
      log(`Error fetching user transactions: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  // Admin: Link VirtFusion user manually
  // Note: VirtFusion API only supports lookup by extRelationId, not by user ID
  const linkVirtfusionSchema = z.object({
    auth0UserId: z.string().min(1, 'Auth0 user ID is required'),
    oldExtRelationId: z.string().min(1, 'Old extRelationId is required'),
  });

  app.post('/api/admin/link-virtfusion', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const result = linkVirtfusionSchema.safeParse(req.body);
      if (!result.success) {
        const errorMessages = result.error.errors.map(e => e.message).join(', ');
        return res.status(400).json({ error: errorMessages });
      }

      const { auth0UserId, oldExtRelationId } = result.data;
      log(`Admin ${req.userSession!.email} linking VirtFusion user (extRelationId: ${oldExtRelationId}) to Auth0 user ${auth0UserId}`, 'admin');

      // Verify Auth0 user exists
      const auth0User = await auth0Client.getUserById(auth0UserId);
      if (!auth0User) {
        return res.status(404).json({ error: 'Auth0 user not found' });
      }

      // Verify VirtFusion user exists by their old extRelationId
      const vfUser = await virtfusionClient.getUserByExtRelationId(oldExtRelationId);
      if (!vfUser) {
        return res.status(404).json({ error: `VirtFusion user not found with extRelationId: ${oldExtRelationId}` });
      }

      // Generate the numeric extRelationId we use for this email
      const normalizedEmail = auth0User.email.toLowerCase().trim();
      const newExtRelationId = virtfusionClient.generateNumericId(normalizedEmail);

      // Update the VirtFusion user's extRelationId to match our expected format
      const updatedVfUser = await virtfusionClient.updateUser(oldExtRelationId, {
        extRelationId: newExtRelationId,
      } as any);

      if (!updatedVfUser) {
        return res.status(500).json({ error: 'Failed to update VirtFusion user extRelationId' });
      }

      // Store the VirtFusion user ID in Auth0 metadata
      await auth0Client.setVirtFusionUserId(auth0UserId, vfUser.id);
      
      // Update wallet with VirtFusion user ID for orphan cleanup
      try {
        await dbStorage.updateWalletVirtFusionUserId(auth0UserId, vfUser.id);
        log(`Updated wallet with VirtFusion user ID ${vfUser.id}`, 'admin');
      } catch (walletError: any) {
        log(`Failed to update wallet VirtFusion ID: ${walletError.message}`, 'admin');
      }

      log(`Successfully linked VirtFusion user ${vfUser.id} (old extRelationId: ${oldExtRelationId}, new: ${newExtRelationId}) to Auth0 user ${auth0UserId}`, 'admin');

      res.json({
        success: true,
        message: `VirtFusion user ${vfUser.id} linked to ${auth0User.email}`,
        virtfusionUserId: vfUser.id,
        newExtRelationId,
      });
    } catch (error: any) {
      log(`Error linking VirtFusion user: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to link VirtFusion user' });
    }
  });

  // Admin: Get VirtFusion hypervisor groups (for debugging)
  app.get('/api/admin/hypervisor-groups', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const groups = await virtfusionClient.getHypervisorGroups();
      log(`Admin fetched hypervisor groups: ${JSON.stringify(groups)}`, 'admin');
      res.json({ groups });
    } catch (error: any) {
      log(`Error fetching hypervisor groups: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch hypervisor groups' });
    }
  });

  // Admin: Verify user email manually (bypass email verification requirement)
  const verifyEmailSchema = z.object({
    auth0UserId: z.string().min(1, 'Auth0 user ID is required'),
  });

  app.post('/api/admin/verify-email', authMiddleware, requireAdmin, async (req, res) => {
    log(`========== ADMIN VERIFY EMAIL START ==========`, 'admin');
    log(`Request body: ${JSON.stringify(req.body)}`, 'admin');
    log(`User session: ${JSON.stringify({ email: req.userSession?.email, isAdmin: req.userSession?.isAdmin })}`, 'admin');

    try {
      const result = verifyEmailSchema.safeParse(req.body);
      if (!result.success) {
        const errorMessages = result.error.errors.map(e => e.message).join(', ');
        log(`REJECTED: Validation failed - ${errorMessages}`, 'admin');
        return res.status(400).json({ error: errorMessages });
      }

      const { auth0UserId } = result.data;
      log(`Admin ${req.userSession!.email} manually verifying email for Auth0 user ${auth0UserId}`, 'admin');

      // Set email verified override in our database (bypasses Auth0)
      log(`Setting email verified override in database...`, 'admin');
      await storage.setEmailVerifiedOverride(auth0UserId, true, req.userSession!.email);
      log(`Email verified override set successfully`, 'admin');

      // Also try to update Auth0 (but don't fail if it doesn't work)
      try {
        log(`Attempting to update Auth0 as well...`, 'admin');
        await auth0Client.updateUser(auth0UserId, { email_verified: true });
        log(`Auth0 update succeeded`, 'admin');
      } catch (auth0Error: any) {
        log(`Auth0 update failed (using database override instead): ${auth0Error.message}`, 'admin');
        // Don't throw - the database override will work
      }

      // Audit log
      await dbStorage.createAuditLog({
        adminAuth0UserId: req.userSession!.auth0UserId!,
        adminEmail: req.userSession!.email,
        action: 'EMAIL_VERIFIED_MANUALLY',
        targetType: 'user',
        targetId: auth0UserId,
        reason: `Admin manually verified email for user ${auth0UserId} (database override)`,
        status: 'success',
      });

      log(`SUCCESS: Admin ${req.userSession!.email} verified email for user ${auth0UserId}`, 'admin');
      log(`========== ADMIN VERIFY EMAIL END ==========`, 'admin');
      res.json({ success: true, message: 'Email verified successfully' });
    } catch (error: any) {
      log(`ERROR: Admin email verification failed`, 'admin');
      log(`Error message: ${error.message}`, 'admin');
      log(`Error stack: ${error.stack}`, 'admin');

      // Audit log for failure
      try {
        await dbStorage.createAuditLog({
          adminAuth0UserId: req.userSession!.auth0UserId!,
          adminEmail: req.userSession!.email,
          action: 'EMAIL_VERIFIED_MANUALLY',
          targetType: 'user',
          targetId: req.body.auth0UserId,
          reason: `Failed to verify email: ${error.message}`,
          status: 'failed',
        });
      } catch {}

      log(`========== ADMIN VERIFY EMAIL END (FAILED) ==========`, 'admin');
      // SECURITY: Don't expose internal error details - log them but return generic message
      res.status(500).json({ error: 'Failed to verify email. Check server logs for details.' });
    }
  });

  // NOTE: /api/auth/resend-verification is defined earlier in the file (around line 1703)

  // Get public reCAPTCHA config (for login/register pages)
  app.get('/api/security/recaptcha-config', (req, res) => {
    const settings = dbStorage.getRecaptchaSettings();
    res.json({
      enabled: settings.enabled,
      siteKey: settings.enabled ? settings.siteKey : null,
      version: settings.version, // 'v2' or 'v3'
    });
  });

  // Admin: Get full reCAPTCHA settings (includes secret key status)
  app.get('/api/admin/security/recaptcha', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const settings = await dbStorage.getRecaptchaSettingsAsync();
      res.json({
        enabled: settings.enabled,
        siteKey: settings.siteKey || '',
        secretKey: settings.secretKey ? '********' + settings.secretKey.slice(-4) : '', // Mask the key
        hasSecretKey: !!settings.secretKey,
        version: settings.version,
      });
    } catch (error: any) {
      log(`Error fetching reCAPTCHA settings: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch reCAPTCHA settings' });
    }
  });

  // Admin: Update reCAPTCHA settings
  app.post('/api/admin/security/recaptcha', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        siteKey: z.string().min(1, 'Site key is required'),
        secretKey: z.string().optional(), // Optional - keep existing if not provided
        enabled: z.boolean(),
        version: z.enum(['v2', 'v3']).default('v3'),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' });
      }

      const { siteKey, secretKey, enabled, version } = parsed.data;

      // Get existing settings to preserve secret key if not provided
      const existingSettings = await dbStorage.getRecaptchaSettingsAsync();
      const finalSecretKey = (secretKey && secretKey.trim()) ? secretKey : existingSettings.secretKey;

      // Require secret key if none exists
      if (!finalSecretKey) {
        return res.status(400).json({ error: 'Secret key is required' });
      }

      // Validate key format (only if new secret key provided)
      if (secretKey && secretKey.trim()) {
        const validation = await dbStorage.testRecaptchaConfig(siteKey, secretKey);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

      // Always use secure default minScore of 0.5 (Google's recommendation)
      await dbStorage.updateRecaptchaSettings({
        siteKey,
        secretKey: finalSecretKey,
        enabled,
        version,
        minScore: 0.5,
      });

      log(`Admin ${req.userSession!.email} updated reCAPTCHA settings: enabled=${enabled}, version=${version}`, 'admin');
      res.json({ success: true });
    } catch (error: any) {
      log(`Error updating reCAPTCHA settings: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to update reCAPTCHA settings' });
    }
  });

  // Admin: Test reCAPTCHA configuration
  app.post('/api/admin/security/recaptcha/test', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        siteKey: z.string().min(1),
        secretKey: z.string().min(1),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid keys provided' });
      }

      const validation = await dbStorage.testRecaptchaConfig(parsed.data.siteKey, parsed.data.secretKey);
      res.json(validation);
    } catch (error: any) {
      log(`Error testing reCAPTCHA config: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to test configuration' });
    }
  });

  // Check if registration is enabled (public)
  app.get('/api/auth/registration-status', async (req, res) => {
    try {
      // Check database setting first, fall back to env variable
      const setting = await dbStorage.getSecuritySetting('registration_enabled');
      const enabled = setting ? setting.enabled : (process.env.REGISTRATION_DISABLED !== 'true');

      res.json({ enabled });
    } catch (error) {
      // Fall back to env variable if database query fails
      res.json({
        enabled: process.env.REGISTRATION_DISABLED !== 'true',
      });
    }
  });

  // ================== Admin VirtFusion Management Routes ==================

  // Helper to create audit log entries
  async function auditLog(
    req: any,
    action: string,
    targetType: string,
    targetId: string | null,
    targetLabel: string | null,
    payload: any,
    status: 'success' | 'failure' = 'success',
    errorMessage?: string,
    reason?: string
  ) {
    try {
      await dbStorage.createAuditLog({
        adminAuth0UserId: req.userSession?.auth0UserId || 'unknown',
        adminEmail: req.userSession?.email || 'unknown',
        action,
        targetType,
        targetId,
        targetLabel,
        payload,
        result: null,
        status,
        errorMessage: errorMessage || null,
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
        reason: reason || null,
      });
    } catch (err) {
      log(`Failed to create audit log: ${err}`, 'admin');
    }
  }

  // ============================================
  // Admin Rate Limit Management
  // ============================================

  // Get all blocked/rate-limited entries (admin)
  app.get('/api/admin/security/rate-limits', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const entries = await getBlockedEntries();
      res.json({ entries });
    } catch (error: any) {
      log(`Admin: Error fetching rate limits: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch rate limits' });
    }
  });

  // Unblock a specific rate limit entry (admin)
  app.delete('/api/admin/security/rate-limits/:type/:key', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { type, key } = req.params;

      if (!['email', 'ip', 'email_ip_combo'].includes(type)) {
        return res.status(400).json({ error: 'Invalid rate limit type' });
      }

      const success = await adminUnblock(type as 'email' | 'ip' | 'email_ip_combo', decodeURIComponent(key));

      if (success) {
        await auditLog(req, 'unblock_rate_limit', 'rate_limit', key, `${type}:${key}`, { type, key }, 'success');
        res.json({ success: true, message: `Unblocked ${type}: ${key}` });
      } else {
        res.status(500).json({ error: 'Failed to unblock entry' });
      }
    } catch (error: any) {
      log(`Admin: Error unblocking rate limit: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to unblock entry' });
    }
  });

  // Unblock all entries for an email (admin)
  app.delete('/api/admin/security/rate-limits/email/:email', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { email } = req.params;
      const result = await adminUnblockEmail(decodeURIComponent(email));

      await auditLog(req, 'unblock_email', 'rate_limit', email, email, { email, cleared: result.cleared }, 'success');
      res.json({ success: true, cleared: result.cleared, message: `Unblocked email: ${email}` });
    } catch (error: any) {
      log(`Admin: Error unblocking email: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to unblock email' });
    }
  });

  // Clear all rate limits (admin - use with caution)
  app.delete('/api/admin/security/rate-limits', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const result = await adminClearAllRateLimits();

      await auditLog(req, 'clear_all_rate_limits', 'system', 'all', 'All rate limits', {}, 'success');
      res.json({ success: true, message: 'All rate limits cleared' });
    } catch (error: any) {
      log(`Admin: Error clearing all rate limits: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to clear rate limits' });
    }
  });

  // Get all servers with owner info (admin)
  app.get('/api/admin/vf/servers', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const servers = await virtfusionClient.getAllServersWithOwners();
      res.json({ servers, total: servers.length });
    } catch (error: any) {
      log(`Admin: Error fetching all servers: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  });

  // Get server details (admin)
  app.get('/api/admin/vf/servers/:serverId', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { serverId } = req.params;
      const server = await virtfusionClient.getServer(serverId);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      res.json({ server });
    } catch (error: any) {
      log(`Admin: Error fetching server ${req.params.serverId}: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch server' });
    }
  });

  // Admin power action on server
  app.post('/api/admin/vf/servers/:serverId/power/:action', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { serverId, action } = req.params;
      const { reason } = req.body;
      
      if (!['start', 'stop', 'restart', 'poweroff'].includes(action)) {
        return res.status(400).json({ error: 'Invalid power action' });
      }
      
      await virtfusionClient.powerAction(serverId, action as any);
      await auditLog(req, `server.power.${action}`, 'server', serverId, null, { action }, 'success', undefined, reason);
      
      res.json({ success: true });
    } catch (error: any) {
      await auditLog(req, `server.power.${req.params.action}`, 'server', req.params.serverId, null, { action: req.params.action }, 'failure', error.message);
      res.status(500).json({ error: 'Failed to execute power action' });
    }
  });

  // Suspend server (admin)
  app.post('/api/admin/vf/servers/:serverId/suspend', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { serverId } = req.params;
      const { reason } = req.body;
      
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for suspend action' });
      }
      
      const success = await virtfusionClient.suspendServer(serverId);
      if (!success) {
        throw new Error('Suspend operation failed');
      }
      
      await auditLog(req, 'server.suspend', 'server', serverId, null, {}, 'success', undefined, reason);
      res.json({ success: true });
    } catch (error: any) {
      await auditLog(req, 'server.suspend', 'server', req.params.serverId, null, {}, 'failure', error.message);
      res.status(500).json({ error: 'Failed to suspend server' });
    }
  });

  // Unsuspend server (admin)
  app.post('/api/admin/vf/servers/:serverId/unsuspend', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { serverId } = req.params;
      const { reason } = req.body;
      
      const success = await virtfusionClient.unsuspendServer(serverId);
      if (!success) {
        throw new Error('Unsuspend operation failed');
      }
      
      await auditLog(req, 'server.unsuspend', 'server', serverId, null, {}, 'success', undefined, reason);
      res.json({ success: true });
    } catch (error: any) {
      await auditLog(req, 'server.unsuspend', 'server', req.params.serverId, null, {}, 'failure', error.message);
      res.status(500).json({ error: 'Failed to unsuspend server' });
    }
  });

  // Delete server (admin) - requires reason
  app.delete('/api/admin/vf/servers/:serverId', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { serverId } = req.params;
      const { reason, confirmAction } = req.body;

      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for delete action' });
      }

      // SECURITY: Require explicit confirmation for destructive actions
      if (confirmAction !== true) {
        return res.status(400).json({
          error: 'Destructive action requires confirmation',
          code: 'CONFIRMATION_REQUIRED',
          message: 'Set confirmAction: true to proceed with server deletion'
        });
      }

      const success = await virtfusionClient.deleteServer(parseInt(serverId, 10));
      if (!success) {
        throw new Error('Delete operation failed');
      }
      
      await auditLog(req, 'server.delete', 'server', serverId, null, {}, 'success', undefined, reason);
      res.json({ success: true });
    } catch (error: any) {
      await auditLog(req, 'server.delete', 'server', req.params.serverId, null, {}, 'failure', error.message);
      res.status(500).json({ error: 'Failed to delete server' });
    }
  });

  // Transfer server ownership (admin)
  app.post('/api/admin/vf/servers/:serverId/transfer', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { serverId } = req.params;
      const { newOwnerId, reason, confirmAction } = req.body;

      if (!newOwnerId) {
        return res.status(400).json({ error: 'New owner ID is required' });
      }
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for transfer action' });
      }

      // SECURITY: Require explicit confirmation for destructive actions
      if (confirmAction !== true) {
        return res.status(400).json({
          error: 'Destructive action requires confirmation',
          code: 'CONFIRMATION_REQUIRED',
          message: 'Set confirmAction: true to proceed with server transfer'
        });
      }

      const success = await virtfusionClient.transferServerOwnership(parseInt(serverId, 10), newOwnerId);
      if (!success) {
        throw new Error('Transfer operation failed');
      }
      
      await auditLog(req, 'server.transfer', 'server', serverId, null, { newOwnerId }, 'success', undefined, reason);
      res.json({ success: true });
    } catch (error: any) {
      await auditLog(req, 'server.transfer', 'server', req.params.serverId, null, { newOwnerId: req.body.newOwnerId }, 'failure', error.message);
      res.status(500).json({ error: 'Failed to transfer server' });
    }
  });

  // Get all hypervisors (admin)
  app.get('/api/admin/vf/hypervisors', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const hypervisors = await virtfusionClient.getHypervisors();
      res.json({ hypervisors, total: hypervisors.length });
    } catch (error: any) {
      log(`Admin: Error fetching hypervisors: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch hypervisors' });
    }
  });

  // Get single hypervisor details (admin)
  app.get('/api/admin/vf/hypervisors/:hypervisorId', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { hypervisorId } = req.params;
      const hypervisor = await virtfusionClient.getHypervisor(parseInt(hypervisorId, 10));
      if (!hypervisor) {
        return res.status(404).json({ error: 'Hypervisor not found' });
      }
      res.json({ hypervisor });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch hypervisor' });
    }
  });

  // Get IP blocks (admin)
  app.get('/api/admin/vf/ip-blocks', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const ipBlocks = await virtfusionClient.getIpBlocks();
      res.json({ ipBlocks, total: ipBlocks.length });
    } catch (error: any) {
      log(`Admin: Error fetching IP blocks: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch IP blocks' });
    }
  });

  // Get IP allocations (admin)
  app.get('/api/admin/vf/ip-allocations', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const allocations = await virtfusionClient.getIpAllocations();
      res.json({ allocations, total: allocations.length });
    } catch (error: any) {
      log(`Admin: Error fetching IP allocations: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch IP allocations' });
    }
  });

  // Get users (admin) - builds list from wallets with VirtFusion info
  app.get('/api/admin/vf/users', authMiddleware, requireAdmin, async (req, res) => {
    try {
      // Get all wallets which represent our user accounts
      const allWallets = await dbStorage.getAllWallets();

      // Build user list from wallets, enriching with Auth0 and VirtFusion data
      const users = await Promise.all(
        allWallets.map(async (wallet) => {
          let serverCount = 0;
          let email = 'Unknown';
          let name = 'Unknown User';
          let emailVerified = false;

          // Check database override for email verification first
          const emailVerifiedOverride = await storage.getEmailVerifiedOverride(wallet.auth0UserId);

          // Fetch user info from Auth0 to get email and name
          try {
            const auth0User = await auth0Client.getUserById(wallet.auth0UserId);
            if (auth0User) {
              email = auth0User.email || 'Unknown';
              name = auth0User.name || auth0User.email || 'Unknown User';
              // Email is verified if EITHER Auth0 says so OR we have a database override
              emailVerified = auth0User.email_verified || emailVerifiedOverride;
            }
          } catch (e) {
            // Auth0 user may have been deleted, but check override
            emailVerified = emailVerifiedOverride;
          }

          // If wallet has a linked VirtFusion user, fetch their server count
          if (wallet.virtFusionUserId) {
            try {
              const servers = await virtfusionClient.listServersByUserId(wallet.virtFusionUserId);
              serverCount = servers.length;
            } catch (e) {
              // VirtFusion user may have been deleted
            }
          }

          return {
            virtfusionId: wallet.virtFusionUserId || null,
            auth0UserId: wallet.auth0UserId,
            name,
            email,
            emailVerified,
            virtfusionLinked: !!wallet.virtFusionUserId,
            status: wallet.deletedAt ? 'deleted' : 'active',
            serverCount,
            balanceCents: wallet.balanceCents,
            stripeCustomerId: wallet.stripeCustomerId,
            created: wallet.createdAt?.toISOString() || '',
          };
        })
      );
      
      log(`Admin: Built user list from ${users.length} wallets`, 'admin');
      res.json({ 
        users, 
        total: users.length,
        currentPage: 1,
        lastPage: 1,
      });
    } catch (error: any) {
      log(`Admin: Error fetching users: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Get VirtFusion user by ID (admin)
  app.get('/api/admin/vf/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await virtfusionClient.getUserById(parseInt(userId, 10));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const servers = await virtfusionClient.listServersByUserId(parseInt(userId, 10));
      res.json({ user, servers });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // Delete VirtFusion user (admin) - requires reason
  app.delete('/api/admin/vf/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason, deleteServers, confirmAction } = req.body;

      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for delete action' });
      }

      // SECURITY: Require explicit confirmation for destructive actions
      if (confirmAction !== true) {
        return res.status(400).json({
          error: 'Destructive action requires confirmation',
          code: 'CONFIRMATION_REQUIRED',
          message: 'Set confirmAction: true to proceed with user deletion'
        });
      }

      if (deleteServers) {
        const result = await virtfusionClient.cleanupUserAndServers(parseInt(userId, 10));
        await auditLog(req, 'user.delete_with_servers', 'user', userId, null, { deleteServers: true, serversDeleted: result.serversDeleted }, result.success ? 'success' : 'failure', result.errors.join(', '), reason);
        res.json({ success: result.success, serversDeleted: result.serversDeleted, errors: result.errors });
      } else {
        const success = await virtfusionClient.deleteUserById(parseInt(userId, 10));
        await auditLog(req, 'user.delete', 'user', userId, null, {}, success ? 'success' : 'failure', undefined, reason);
        res.json({ success });
      }
    } catch (error: any) {
      await auditLog(req, 'user.delete', 'user', req.params.userId, null, {}, 'failure', error.message);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Get packages from VirtFusion (admin)
  app.get('/api/admin/vf/packages', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const packages = await virtfusionClient.getPackages();
      res.json({ packages, total: packages.length });
    } catch (error: any) {
      log(`Admin: Error fetching packages: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch packages' });
    }
  });

  // Sync plans from VirtFusion packages (admin)
  app.post('/api/admin/plans/sync-from-virtfusion', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const session = req.userSession!;

      // Fetch packages from VirtFusion
      const vfPackages = await virtfusionClient.getPackages();
      log(`Fetched ${vfPackages.length} packages from VirtFusion for sync`, 'admin');

      // Fetch current plans from database
      const currentPlans = await db.select().from(plans);
      const plansMap = new Map(currentPlans.map(p => [p.virtfusionPackageId, p]));

      let synced = 0;
      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      // Sync each VirtFusion package
      for (const vfPkg of vfPackages) {
        try {
          const existingPlan = plansMap.get(vfPkg.id);

          if (existingPlan) {
            // Update existing plan's active status from VirtFusion enabled status
            const [updatedPlan] = await db
              .update(plans)
              .set({
                active: vfPkg.enabled,
                name: vfPkg.name, // Update name too
              })
              .where(eq(plans.virtfusionPackageId, vfPkg.id))
              .returning();

            log(`Updated plan ${existingPlan.code}: active=${vfPkg.enabled} (was ${existingPlan.active})`, 'admin');
            updated++;
            synced++;
          } else {
            // Create new plan from VirtFusion package
            const monthlyPrice = vfPkg.prices?.find(p =>
              p.billingPeriod?.toLowerCase().includes('month')
            )?.price || 0;

            const [newPlan] = await db.insert(plans).values({
              code: vfPkg.code,
              name: vfPkg.name,
              vcpu: vfPkg.cpuCores,
              ramMb: vfPkg.memory,
              storageGb: vfPkg.primaryStorage,
              transferGb: vfPkg.traffic,
              priceMonthly: monthlyPrice,
              virtfusionPackageId: vfPkg.id,
              active: vfPkg.enabled,
            }).returning();

            log(`Created new plan ${newPlan.code} from VirtFusion package ${vfPkg.id}`, 'admin');
            created++;
            synced++;
          }
        } catch (error: any) {
          const errorMsg = `Failed to sync package ${vfPkg.id}: ${error.message}`;
          errors.push(errorMsg);
          log(errorMsg, 'admin');
        }
      }

      // Audit log
      await dbStorage.createAuditLog({
        adminAuth0UserId: session.auth0UserId!,
        adminEmail: session.email,
        action: 'plans.sync_from_virtfusion',
        targetType: 'plans',
        targetId: 'all',
        targetLabel: `Synced ${synced} plans`,
        result: { synced, created, updated, errors },
        status: errors.length > 0 ? 'partial' : 'success',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      log(`Plans sync completed: ${synced} synced (${created} created, ${updated} updated), ${errors.length} errors`, 'admin');

      res.json({
        success: true,
        synced,
        created,
        updated,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      log(`Admin: Error syncing plans from VirtFusion: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to sync plans from VirtFusion' });
    }
  });

  // Get OS templates for package (admin)
  app.get('/api/admin/vf/packages/:packageId/templates', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { packageId } = req.params;
      const templates = await virtfusionClient.getOsTemplatesForPackage(parseInt(packageId, 10));
      res.json({ templates });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  });

  // Get admin audit logs
  app.get('/api/admin/audit-logs', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const action = req.query.action as string | undefined;
      const targetType = req.query.targetType as string | undefined;
      const status = req.query.status as string | undefined;
      
      const result = await dbStorage.getAuditLogs({ limit, offset, action, targetType, status });
      res.json(result);
    } catch (error: any) {
      log(`Error fetching audit logs: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // Admin dashboard stats
  app.get('/api/admin/vf/stats', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const [servers, hypervisors, ipBlocks, wallets] = await Promise.all([
        virtfusionClient.getAllServersWithOwners(),
        virtfusionClient.getHypervisors(),
        virtfusionClient.getIpBlocks(),
        dbStorage.getAllWallets(),
      ]);
      
      const runningServers = servers.filter(s => s.status === 'running').length;
      const stoppedServers = servers.filter(s => s.status === 'stopped').length;
      const totalIps = ipBlocks.reduce((sum, b) => sum + b.totalAddresses, 0);
      const usedIps = ipBlocks.reduce((sum, b) => sum + b.usedAddresses, 0);
      const totalRevenue = wallets.reduce((sum, w) => sum + (w.balanceCents || 0), 0);
      
      res.json({
        servers: {
          total: servers.length,
          running: runningServers,
          stopped: stoppedServers,
        },
        hypervisors: {
          total: hypervisors.length,
          enabled: hypervisors.filter(h => h.enabled).length,
          maintenance: hypervisors.filter(h => h.maintenance).length,
        },
        networking: {
          totalIps,
          usedIps,
          availableIps: totalIps - usedIps,
          utilization: totalIps > 0 ? Math.round((usedIps / totalIps) * 100) : 0,
        },
        billing: {
          totalWallets: wallets.length,
          totalBalance: totalRevenue,
        },
      });
    } catch (error: any) {
      log(`Admin: Error fetching stats: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // ================== Admin Billing Routes ==================

  // Admin: Get all billing records
  app.get('/api/admin/billing/records', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const records = await db.select().from(serverBilling).orderBy(serverBilling.nextBillAt);

      // Enrich records with server names and user emails
      const enrichedRecords = await Promise.all(records.map(async (record) => {
        let serverName: string | undefined;
        let userEmail: string | undefined;

        // Get server name from VirtFusion
        try {
          const server = await virtfusionClient.getServer(record.virtfusionServerId);
          serverName = server?.name || server?.hostname;
        } catch (e) {
          // Server might be deleted
        }

        // Get user email from Auth0
        try {
          const auth0User = await auth0Client.getUserById(record.auth0UserId);
          userEmail = auth0User?.email;
        } catch (e) {
          // User lookup failed
        }

        return {
          ...record,
          serverName,
          userEmail,
        };
      }));

      res.json({ records: enrichedRecords });
    } catch (error: any) {
      log(`Admin: Error fetching billing records: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch billing records' });
    }
  });

  // Admin: Manually trigger billing job
  app.post('/api/admin/billing/run-job', authMiddleware, requireAdmin, async (req, res) => {
    try {
      log(`Admin ${req.userSession?.email} manually triggered billing job`, 'admin');

      // Run the billing job
      await runBillingJob();

      // Fetch updated records to return
      const records = await db.select().from(serverBilling).orderBy(serverBilling.nextBillAt);

      res.json({
        success: true,
        message: 'Billing job completed',
        records
      });
    } catch (error: any) {
      log(`Admin: Error running billing job: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to run billing job' });
    }
  });

  // Admin: Update billing record (for testing - adjust nextBillAt)
  app.put('/api/admin/billing/records/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const billingId = parseInt(req.params.id, 10);
      if (isNaN(billingId)) {
        return res.status(400).json({ error: 'Invalid billing record ID' });
      }

      // First get the current billing record to know the server ID
      const [currentRecord] = await db.select().from(serverBilling)
        .where(eq(serverBilling.id, billingId))
        .limit(1);

      if (!currentRecord) {
        return res.status(404).json({ error: 'Billing record not found' });
      }

      const { nextBillAt, status, suspendAt } = req.body;

      const updates: Record<string, any> = { updatedAt: new Date() };

      if (nextBillAt !== undefined) {
        updates.nextBillAt = new Date(nextBillAt);
        log(`Admin ${req.userSession?.email} updated billing ${billingId} nextBillAt to ${nextBillAt}`, 'admin');
      }

      if (status !== undefined) {
        if (!['active', 'paid', 'unpaid', 'suspended'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status. Must be: active, paid, unpaid, or suspended' });
        }

        // If changing TO suspended status, actually suspend the server in VirtFusion
        if (status === 'suspended' && currentRecord.status !== 'suspended') {
          try {
            await virtfusionClient.suspendServer(currentRecord.virtfusionServerId);
            log(`Admin ${req.userSession?.email} suspended server ${currentRecord.virtfusionServerId} via VirtFusion`, 'admin');
          } catch (vfError: any) {
            log(`Failed to suspend server ${currentRecord.virtfusionServerId} in VirtFusion: ${vfError.message}`, 'admin');
            return res.status(500).json({ error: `Failed to suspend server in VirtFusion: ${vfError.message}` });
          }
        }

        // If changing FROM suspended to another status, unsuspend the server in VirtFusion
        if (currentRecord.status === 'suspended' && status !== 'suspended') {
          try {
            await virtfusionClient.unsuspendServer(currentRecord.virtfusionServerId);
            log(`Admin ${req.userSession?.email} unsuspended server ${currentRecord.virtfusionServerId} via VirtFusion`, 'admin');
          } catch (vfError: any) {
            log(`Failed to unsuspend server ${currentRecord.virtfusionServerId} in VirtFusion: ${vfError.message}`, 'admin');
            return res.status(500).json({ error: `Failed to unsuspend server in VirtFusion: ${vfError.message}` });
          }
        }

        updates.status = status;
        // Clear suspendAt when unsuspending
        if (status !== 'suspended' && status !== 'unpaid') {
          updates.suspendAt = null;
        }
        log(`Admin ${req.userSession?.email} updated billing ${billingId} status to ${status}`, 'admin');
      }

      if (suspendAt !== undefined) {
        updates.suspendAt = suspendAt ? new Date(suspendAt) : null;
        log(`Admin ${req.userSession?.email} updated billing ${billingId} suspendAt to ${suspendAt}`, 'admin');
      }

      // Handle freeServer (complimentary hosting) toggle
      const { freeServer } = req.body;
      if (freeServer !== undefined) {
        updates.freeServer = Boolean(freeServer);
        log(`Admin ${req.userSession?.email} set billing ${billingId} freeServer to ${freeServer}`, 'admin');
      }

      const [updated] = await db.update(serverBilling)
        .set(updates)
        .where(eq(serverBilling.id, billingId))
        .returning();

      res.json({ success: true, record: updated });
    } catch (error: any) {
      log(`Admin: Error updating billing record: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to update billing record' });
    }
  });

  // Admin: Force unsuspend a server
  app.post('/api/admin/billing/records/:id/unsuspend', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const billingId = parseInt(req.params.id, 10);
      if (isNaN(billingId)) {
        return res.status(400).json({ error: 'Invalid billing record ID' });
      }

      const [record] = await db.select().from(serverBilling)
        .where(eq(serverBilling.id, billingId))
        .limit(1);

      if (!record) {
        return res.status(404).json({ error: 'Billing record not found' });
      }

      if (record.status !== 'suspended') {
        return res.status(400).json({ error: 'Server is not suspended' });
      }

      // Unsuspend in VirtFusion
      await virtfusionClient.unsuspendServer(record.virtfusionServerId);
      log(`Admin ${req.userSession?.email} force-unsuspended server ${record.virtfusionServerId}`, 'admin');

      // Update billing status to active (not paid - they still owe money)
      const [updated] = await db.update(serverBilling)
        .set({
          status: 'active',
          suspendAt: null,
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, billingId))
        .returning();

      res.json({ success: true, record: updated });
    } catch (error: any) {
      log(`Admin: Error force-unsuspending server: ${error.message}`, 'admin');
      res.status(500).json({ error: `Failed to unsuspend server: ${error.message}` });
    }
  });

  // Admin: Suspend a server (non-billing, e.g., TOS violation)
  app.post('/api/admin/servers/:serverId/suspend', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { serverId } = req.params;
      const { reason } = req.body;

      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ error: 'Suspension reason is required' });
      }

      // Find the billing record for this server
      const [record] = await db.select().from(serverBilling)
        .where(eq(serverBilling.virtfusionServerId, serverId))
        .limit(1);

      if (!record) {
        return res.status(404).json({ error: 'Server billing record not found' });
      }

      if (record.adminSuspended) {
        return res.status(400).json({ error: 'Server is already admin-suspended' });
      }

      // Suspend in VirtFusion (power off first, then suspend)
      await virtfusionClient.suspendServer(serverId);

      // Update billing record with admin suspension
      const [updated] = await db.update(serverBilling)
        .set({
          adminSuspended: true,
          adminSuspendedAt: new Date(),
          adminSuspendedReason: reason.trim(),
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, record.id))
        .returning();

      log(`Admin ${req.userSession?.email} suspended server ${serverId} (reason: ${reason})`, 'admin');

      res.json({ success: true, record: updated });
    } catch (error: any) {
      log(`Admin: Error suspending server: ${error.message}`, 'admin');
      res.status(500).json({ error: `Failed to suspend server: ${error.message}` });
    }
  });

  // Admin: Unsuspend a server (remove admin suspension)
  app.post('/api/admin/servers/:serverId/unsuspend', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { serverId } = req.params;

      // Find the billing record for this server
      const [record] = await db.select().from(serverBilling)
        .where(eq(serverBilling.virtfusionServerId, serverId))
        .limit(1);

      if (!record) {
        return res.status(404).json({ error: 'Server billing record not found' });
      }

      if (!record.adminSuspended) {
        return res.status(400).json({ error: 'Server is not admin-suspended' });
      }

      // Unsuspend in VirtFusion
      await virtfusionClient.unsuspendServer(serverId);

      // Clear admin suspension
      const [updated] = await db.update(serverBilling)
        .set({
          adminSuspended: false,
          adminSuspendedAt: null,
          adminSuspendedReason: null,
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, record.id))
        .returning();

      log(`Admin ${req.userSession?.email} unsuspended server ${serverId}`, 'admin');

      res.json({ success: true, record: updated });
    } catch (error: any) {
      log(`Admin: Error unsuspending server: ${error.message}`, 'admin');
      res.status(500).json({ error: `Failed to unsuspend server: ${error.message}` });
    }
  });

  // Admin: Get billing ledger (all charges)
  app.get('/api/admin/billing/ledger', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const ledger = await db.select().from(billingLedger).orderBy(billingLedger.createdAt);
      res.json({ ledger });
    } catch (error: any) {
      log(`Admin: Error fetching billing ledger: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch billing ledger' });
    }
  });

  // ================== Admin Settings Routes ==================

  // Admin: Get registration setting
  app.get('/api/admin/settings/registration', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const setting = await dbStorage.getSecuritySetting('registration_enabled');
      const enabled = setting ? setting.enabled : (process.env.REGISTRATION_DISABLED !== 'true');

      res.json({ enabled });
    } catch (error: any) {
      log(`Admin: Error fetching registration setting: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch registration setting' });
    }
  });

  // Admin: Update registration setting
  app.put('/api/admin/settings/registration', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Invalid enabled value' });
      }

      // Upsert the setting
      await dbStorage.upsertSecuritySetting('registration_enabled', null, enabled);

      // Audit log
      await auditLog(
        req,
        'settings.registration.update',
        'security_setting',
        'registration_enabled',
        null,
        { enabled },
        'success'
      );

      res.json({ enabled });
    } catch (error: any) {
      log(`Admin: Error updating registration setting: ${error.message}`, 'admin');
      await auditLog(
        req,
        'settings.registration.update',
        'security_setting',
        'registration_enabled',
        null,
        { enabled: req.body.enabled },
        'failure',
        error.message
      );
      res.status(500).json({ error: 'Failed to update registration setting' });
    }
  });

  // ================== Wallet & Deploy Routes ==================

  // Location to hypervisor GROUP mapping
  // NOTE: Update these IDs to match your VirtFusion hypervisor GROUPS (not individual hypervisors)
  // hypervisorGroupId = the group ID from /compute/hypervisors response (group.id field)
  const LOCATION_CONFIG: Record<string, { name: string; country: string; countryCode: string; hypervisorGroupId: number; enabled: boolean }> = {
    'BNE': { name: 'Brisbane', country: 'Australia', countryCode: 'AU', hypervisorGroupId: 2, enabled: true },  // "Brisbane Node" group
    'SYD': { name: 'Sydney', country: 'Australia', countryCode: 'AU', hypervisorGroupId: 2, enabled: false },  // No Sydney node yet
  };

  // Get available locations
  app.get('/api/locations', async (req, res) => {
    res.json({
      locations: Object.entries(LOCATION_CONFIG).map(([code, config]) => ({
        code,
        name: config.name,
        country: config.country,
        countryCode: config.countryCode,
        enabled: config.enabled,
      })),
    });
  });

  // Get current user info with balance (authenticated)
  app.get('/api/me', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }
      const wallet = await dbStorage.getOrCreateWallet(auth0UserId);

      // Check email verification - session value, database verification, OR admin override
      let emailVerified = req.userSession!.emailVerified ?? false;

      if (!emailVerified) {
        // Check if verified via token (e.g., on another device)
        const dbVerified = await dbStorage.isEmailVerified(auth0UserId);
        if (dbVerified) {
          emailVerified = true;
          // Update session so we don't have to check DB every time
          await storage.updateSession(req.userSession!.id, { emailVerified: true });
        }
      }

      if (!emailVerified) {
        // Check admin override
        const override = await storage.getEmailVerifiedOverride(auth0UserId);
        if (override) {
          emailVerified = true;
        }
      }

      res.json({
        user: {
          id: req.userSession!.userId,
          email: req.userSession!.email,
          name: req.userSession!.name || req.userSession!.email,
        },
        emailVerified,
        balance: wallet.balanceCents,
        balanceFormatted: `$${(wallet.balanceCents / 100).toFixed(2)}`,
      });
    } catch (error: any) {
      log(`Error fetching user info: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch user info' });
    }
  });

  // Get available plans
  app.get('/api/plans', async (req, res) => {
    try {
      const allPlans = await dbStorage.getAllPlans();

      // Filter out admin-only plans from public endpoint
      // Set ADMIN_ONLY_PLAN_IDS=7,8,9 in .env to hide specific VirtFusion package IDs from deploy page
      const adminOnlyPlanIds = (process.env.ADMIN_ONLY_PLAN_IDS || '')
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id));

      const publicPlans = adminOnlyPlanIds.length > 0
        ? allPlans.filter(plan => !plan.virtfusionPackageId || !adminOnlyPlanIds.includes(plan.virtfusionPackageId))
        : allPlans;

      res.json({ plans: publicPlans });
    } catch (error: any) {
      log(`Error fetching plans: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch plans' });
    }
  });

  // Get Stripe publishable key
  app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      log(`Error getting Stripe publishable key: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to get Stripe configuration' });
    }
  });

  // Get Stripe configuration status
  app.get('/api/billing/stripe/status', async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({
        configured: !!publishableKey,
        publishableKey: publishableKey, // Return full key for frontend to use
      });
    } catch (error: any) {
      log(`Stripe not configured: ${error.message}`, 'api');
      res.json({
        configured: false,
        error: 'Stripe connector not set up',
      });
    }
  });

  // List saved payment methods (authenticated)
  app.get('/api/billing/payment-methods', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const stripe = await getUncachableStripeClient();
      const wallet = await dbStorage.getWallet(auth0UserId);
      
      // Check if wallet is frozen (Stripe customer deleted)
      if (wallet?.deletedAt) {
        return res.status(403).json({ 
          error: 'Billing access suspended. Please contact support.',
          code: 'WALLET_FROZEN'
        });
      }
      
      if (!wallet?.stripeCustomerId) {
        return res.json({ paymentMethods: [] });
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: wallet.stripeCustomerId,
        type: 'card',
      });

      res.json({
        paymentMethods: paymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card?.brand || 'unknown',
          last4: pm.card?.last4 || '****',
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        })),
      });
    } catch (error: any) {
      log(`Error listing payment methods: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to list payment methods' });
    }
  });

  // Validate and finalize a new payment method (check for duplicates)
  app.post('/api/billing/payment-methods/validate', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      const { paymentMethodId } = req.body;
      
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }
      if (!paymentMethodId) {
        return res.status(400).json({ error: 'Payment method ID is required' });
      }

      // Ensure Stripe customer exists (auto-creates wallet if needed)
      const { wallet, stripeCustomerId } = await ensureStripeCustomer({
        auth0UserId: req.userSession!.auth0UserId,
        email: req.userSession!.email,
        name: req.userSession!.name,
        userId: req.userSession!.userId,
      });
      
      const stripe = await getUncachableStripeClient();

      // Get the new payment method
      const newPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      const newFingerprint = newPaymentMethod.card?.fingerprint;
      
      if (!newFingerprint) {
        return res.status(400).json({ error: 'Invalid card' });
      }

      // Get existing payment methods for this customer
      const existingPaymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card',
      });

      // Check if any existing card has the same fingerprint
      const duplicateCard = existingPaymentMethods.data.find(
        pm => pm.id !== paymentMethodId && pm.card?.fingerprint === newFingerprint
      );

      if (duplicateCard) {
        // Detach the duplicate payment method
        await stripe.paymentMethods.detach(paymentMethodId);
        log(`Rejected duplicate card for ${auth0UserId}`, 'stripe');
        return res.status(409).json({
          error: 'This card is already saved to your account',
          duplicate: true,
          existingCard: {
            brand: duplicateCard.card?.brand,
            last4: duplicateCard.card?.last4,
          }
        });
      }

      // Attach the payment method to the customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId,
      });

      log(`Validated and attached new card for ${auth0UserId}`, 'stripe');
      res.json({ valid: true });
    } catch (error: any) {
      if (error instanceof StripeCustomerError) {
        return res.status(error.httpStatus).json({ 
          error: error.message, 
          code: error.code 
        });
      }
      log(`Error validating payment method: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to validate payment method' });
    }
  });

  // Create SetupIntent for adding a new payment method (authenticated)
  // SECURITY: Ensures Stripe customer exists before creating setup intent
  app.post('/api/billing/setup-intent', authMiddleware, async (req, res) => {
    try {
      // Ensure Stripe customer exists
      const { stripeCustomerId } = await ensureStripeCustomer({
        auth0UserId: req.userSession!.auth0UserId,
        email: req.userSession!.email,
        name: req.userSession!.name,
        userId: req.userSession!.userId,
      });
      
      const stripe = await getUncachableStripeClient();
      const auth0UserId = req.userSession!.auth0UserId;

      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        metadata: { auth0UserId },
      });

      res.json({
        clientSecret: setupIntent.client_secret,
      });
    } catch (error: any) {
      if (error instanceof StripeCustomerError) {
        return res.status(error.httpStatus).json({ 
          error: error.message, 
          code: error.code 
        });
      }
      log(`Error creating setup intent: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to create setup intent' });
    }
  });

  // Delete a payment method (authenticated)
  app.delete('/api/billing/payment-methods/:id', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      const paymentMethodId = req.params.id;
      
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const stripe = await getUncachableStripeClient();
      const wallet = await dbStorage.getWallet(auth0UserId);
      
      // Check if wallet is frozen (Stripe customer deleted)
      if (wallet?.deletedAt) {
        return res.status(403).json({ 
          error: 'Billing access suspended. Please contact support.',
          code: 'WALLET_FROZEN'
        });
      }
      
      if (!wallet?.stripeCustomerId) {
        return res.status(404).json({ error: 'No payment methods found' });
      }

      // Verify the payment method belongs to this customer
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== wallet.stripeCustomerId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await stripe.paymentMethods.detach(paymentMethodId);
      log(`Detached payment method ${paymentMethodId} for ${auth0UserId}`, 'stripe');

      res.json({ success: true });
    } catch (error: any) {
      log(`Error deleting payment method: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to delete payment method' });
    }
  });

  // Get wallet transaction history (authenticated)
  app.get('/api/billing/transactions', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const transactions = await dbStorage.getWalletTransactions(auth0UserId);
      res.json({ transactions });
    } catch (error: any) {
      log(`Error fetching transactions: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  // Get user's invoices from Stripe (authenticated)
  app.get('/api/billing/invoices', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      // Get wallet to find Stripe customer ID
      const wallet = await dbStorage.getWallet(auth0UserId);
      if (!wallet?.stripeCustomerId) {
        return res.json({ invoices: [] });
      }

      // Fetch invoices directly from Stripe
      const stripe = await getUncachableStripeClient();
      const stripeInvoices = await stripe.invoices.list({
        customer: wallet.stripeCustomerId,
        limit: 50,
        status: 'paid',
      });

      // Transform Stripe invoices to our format
      // Use inv.total for the amount since amount_paid can be 0 for out-of-band payments
      const invoices = stripeInvoices.data.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.number || inv.id,
        amountCents: inv.total || inv.amount_due || inv.amount_paid || 0,
        description: inv.description || 'Wallet Top-up',
        status: inv.status || 'paid',
        createdAt: new Date(inv.created * 1000).toISOString(),
        pdfUrl: inv.invoice_pdf,
      }));

      res.json({ invoices });
    } catch (error: any) {
      log(`Error fetching invoices from Stripe: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  // Download invoice PDF from Stripe (authenticated)
  app.get('/api/billing/invoices/:id/download', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const invoiceId = req.params.id;
      if (!invoiceId || !invoiceId.startsWith('in_')) {
        return res.status(400).json({ error: 'Invalid invoice ID' });
      }

      // Get wallet to verify ownership
      const wallet = await dbStorage.getWallet(auth0UserId);
      if (!wallet?.stripeCustomerId) {
        return res.status(404).json({ error: 'No billing account found' });
      }

      // Fetch the invoice from Stripe
      const stripe = await getUncachableStripeClient();
      const invoice = await stripe.invoices.retrieve(invoiceId);
      
      // Verify the invoice belongs to this customer
      if (invoice.customer !== wallet.stripeCustomerId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Redirect to Stripe's hosted PDF
      if (invoice.invoice_pdf) {
        return res.redirect(invoice.invoice_pdf);
      }

      res.status(404).json({ error: 'Invoice PDF not available' });
    } catch (error: any) {
      log(`Error downloading invoice from Stripe: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to download invoice' });
    }
  });

  // Get auto top-up settings (authenticated)
  app.get('/api/billing/auto-topup', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const wallet = await dbStorage.getWallet(auth0UserId);
      if (!wallet) {
        return res.json({
          enabled: false,
          thresholdCents: 500,
          amountCents: 2000,
          paymentMethodId: null,
        });
      }

      res.json({
        enabled: wallet.autoTopupEnabled,
        thresholdCents: wallet.autoTopupThresholdCents || 500,
        amountCents: wallet.autoTopupAmountCents || 2000,
        paymentMethodId: wallet.autoTopupPaymentMethodId,
      });
    } catch (error: any) {
      log(`Error fetching auto top-up settings: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch auto top-up settings' });
    }
  });

  // Update auto top-up settings (authenticated)
  app.post('/api/billing/auto-topup', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }
      
      // Check if wallet is frozen (Stripe customer deleted)
      const wallet = await dbStorage.getWallet(auth0UserId);
      if (wallet?.deletedAt) {
        return res.status(403).json({ 
          error: 'Billing access suspended. Please contact support.',
          code: 'WALLET_FROZEN'
        });
      }

      const { enabled, thresholdCents, amountCents, paymentMethodId } = req.body;
      
      if (enabled && !paymentMethodId) {
        return res.status(400).json({ error: 'Payment method is required to enable auto top-up' });
      }

      if (thresholdCents !== undefined && (thresholdCents < 100 || thresholdCents > 10000)) {
        return res.status(400).json({ error: 'Threshold must be between $1 and $100' });
      }

      if (amountCents !== undefined && (amountCents < 500 || amountCents > 50000)) {
        return res.status(400).json({ error: 'Top-up amount must be between $5 and $500' });
      }

      if (enabled && paymentMethodId) {
        const stripe = await getUncachableStripeClient();
        const wallet = await dbStorage.getWallet(auth0UserId);

        // SECURITY: Must have a Stripe customer to verify payment method ownership
        if (!wallet?.stripeCustomerId) {
          return res.status(400).json({ error: 'Please add a payment method first before enabling auto top-up' });
        }

        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.customer !== wallet.stripeCustomerId) {
          return res.status(403).json({ error: 'Payment method does not belong to this account' });
        }
      }

      const updated = await dbStorage.updateAutoTopupSettings(auth0UserId, {
        enabled: enabled ?? false,
        thresholdCents: thresholdCents ?? 500,
        amountCents: amountCents ?? 2000,
        paymentMethodId: enabled ? paymentMethodId : null,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      log(`Updated auto top-up settings for ${auth0UserId}: enabled=${enabled}`, 'billing');
      res.json({
        enabled: updated.autoTopupEnabled,
        thresholdCents: updated.autoTopupThresholdCents,
        amountCents: updated.autoTopupAmountCents,
        paymentMethodId: updated.autoTopupPaymentMethodId,
      });
    } catch (error: any) {
      log(`Error updating auto top-up settings: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to update auto top-up settings' });
    }
  });

  // Create Stripe Customer Portal session (authenticated)
  app.post('/api/billing/portal', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      const email = req.userSession!.email;
      const name = req.userSession!.name;
      
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const stripe = await getUncachableStripeClient();
      
      // Get or create wallet - ensure it exists
      let wallet = await dbStorage.getOrCreateWallet(auth0UserId);
      if (!wallet) {
        log(`Failed to get/create wallet for portal: ${auth0UserId}`, 'stripe');
        return res.status(500).json({ error: 'Failed to access billing account' });
      }
      
      let stripeCustomerId = wallet.stripeCustomerId;

      if (!stripeCustomerId) {
        // Create Stripe customer and wait for persistence
        try {
          const customer = await stripe.customers.create({
            email,
            name: name || undefined,
            metadata: {
              auth0UserId,
              ozvps_user_id: String(req.userSession!.userId || ''),
            },
          });
          stripeCustomerId = customer.id;
          
          // Await the update and verify it succeeded
          const updatedWallet = await dbStorage.updateWalletStripeCustomerId(auth0UserId, stripeCustomerId);
          if (!updatedWallet?.stripeCustomerId) {
            log(`Failed to persist Stripe customer ${stripeCustomerId} for portal`, 'stripe');
            return res.status(500).json({ error: 'Failed to link payment account' });
          }
          log(`Created Stripe customer ${stripeCustomerId} for portal access`, 'stripe');
        } catch (stripeError: any) {
          log(`Failed to create Stripe customer for portal: ${stripeError.message}`, 'stripe');
          return res.status(500).json({ error: 'Failed to set up payment account' });
        }
      }

      // Create portal session
      const baseUrl = getTrustedAppBaseUrl();
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${baseUrl}/account`,
      });

      res.json({ url: portalSession.url });
    } catch (error: any) {
      log(`Error creating portal session: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to create billing portal session' });
    }
  });

  // Get wallet balance (authenticated)
  // SECURITY: Ensures Stripe customer exists before returning wallet
  app.get('/api/wallet', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }
      // Fetch wallet directly from DB - no Stripe call needed just to show balance
      const wallet = await dbStorage.getOrCreateWallet(auth0UserId);
      if (wallet.deletedAt) {
        return res.status(403).json({
          error: 'Billing access suspended. Please contact support.',
          code: 'WALLET_FROZEN'
        });
      }
      res.json({
        wallet,
        hasStripeCustomer: !!wallet.stripeCustomerId
      });
    } catch (error: any) {
      log(`Error fetching wallet: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch wallet' });
    }
  });

  // Get wallet transactions (authenticated)
  app.get('/api/wallet/transactions', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }
      const transactions = await dbStorage.getWalletTransactions(auth0UserId);
      res.json({ transactions });
    } catch (error: any) {
      log(`Error fetching transactions: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  // Create Stripe checkout session for wallet top-up (authenticated)
  const topupSchema = z.object({
    amountCents: z.number().min(500).max(50000), // $5 to $500 AUD
  });

  // SECURITY: Ensures Stripe customer exists before creating checkout session
  app.post('/api/wallet/topup', authMiddleware, requireEmailVerified, walletTopupRateLimiter, async (req, res) => {
    try {
      const result = topupSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid amount. Must be between $5 and $500.' });
      }

      const { amountCents } = result.data;

      // Ensure Stripe customer exists
      const { stripeCustomerId } = await ensureStripeCustomer({
        auth0UserId: req.userSession!.auth0UserId,
        email: req.userSession!.email,
        name: req.userSession!.name,
        userId: req.userSession!.userId,
      });

      const stripe = await getUncachableStripeClient();
      const auth0UserId = req.userSession!.auth0UserId;

      // Create a checkout session for wallet top-up with automatic invoice creation
      const baseUrl = getTrustedAppBaseUrl();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: stripeCustomerId,
        // Let Stripe auto-detect available payment methods (card, Apple Pay, Google Pay, etc.)
        // based on account settings and customer context
        line_items: [
          {
            price_data: {
              currency: 'aud',
              product_data: {
                name: 'Wallet Top-Up',
                description: `Add $${(amountCents / 100).toFixed(2)} AUD to your OzVPS wallet`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          setup_future_usage: 'off_session',
        },
        invoice_creation: {
          enabled: true,
          invoice_data: {
            description: `OzVPS Wallet Top-Up - $${(amountCents / 100).toFixed(2)} AUD`,
            metadata: {
              auth0UserId,
              type: 'wallet_topup',
            },
          },
        },
        metadata: {
          auth0UserId,
          type: 'wallet_topup',
          amountCents: String(amountCents),
          currency: 'aud',
        },
        success_url: `${baseUrl}/billing?topup=success`,
        cancel_url: `${baseUrl}/billing?topup=cancelled`,
      });

      log(`Created checkout session for ${auth0UserId}: ${amountCents} cents`, 'stripe');
      res.json({ url: session.url });
    } catch (error: any) {
      if (error instanceof StripeCustomerError) {
        return res.status(error.httpStatus).json({
          error: error.message,
          code: error.code
        });
      }
      // Log full Stripe error details for debugging
      const errorDetails = {
        message: error.message,
        type: error.type,
        code: error.code,
        param: error.param,
        statusCode: error.statusCode,
      };
      log(`Error creating checkout session: ${JSON.stringify(errorDetails)}`, 'stripe');

      // Report to Sentry for monitoring
      const { captureException } = await import('./sentry');
      captureException(error, { context: 'wallet_topup_checkout', userId: req.userSession?.auth0UserId });

      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // Direct charge with saved card for instant top-up (authenticated)
  // SECURITY: Ensures Stripe customer exists before charging
  const directChargeSchema = z.object({
    amountCents: z.number().min(500).max(50000), // $5 to $500 AUD
    paymentMethodId: z.string().min(1),
  });

  app.post('/api/wallet/topup/direct', authMiddleware, requireEmailVerified, walletTopupRateLimiter, async (req, res) => {
    try {
      log(`[Direct Topup] Request received from user ${req.userSession?.auth0UserId}`, 'api');

      const result = directChargeSchema.safeParse(req.body);
      if (!result.success) {
        log(`[Direct Topup] Validation failed: ${JSON.stringify(result.error)}`, 'api');
        return res.status(400).json({ error: 'Invalid request. Amount must be between $5 and $500, and a payment method is required.' });
      }

      const { amountCents, paymentMethodId } = result.data;
      log(`[Direct Topup] Processing $${(amountCents / 100).toFixed(2)} with payment method ${paymentMethodId}`, 'api');

      // Ensure Stripe customer exists
      const { stripeCustomerId } = await ensureStripeCustomer({
        auth0UserId: req.userSession!.auth0UserId,
        email: req.userSession!.email,
        name: req.userSession!.name,
        userId: req.userSession!.userId,
      });
      log(`[Direct Topup] Stripe customer: ${stripeCustomerId}`, 'api');

      const stripe = await getUncachableStripeClient();
      const auth0UserId = req.userSession!.auth0UserId!;

      // Verify the payment method belongs to this customer
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      log(`[Direct Topup] Payment method retrieved: ${paymentMethod.id}, customer: ${paymentMethod.customer}`, 'api');
      if (paymentMethod.customer !== stripeCustomerId) {
        log(`[Direct Topup] Payment method customer mismatch`, 'api');
        return res.status(403).json({ error: 'Invalid payment method' });
      }

      // Check if card is valid (not expired)
      const now = new Date();
      const expYear = paymentMethod.card?.exp_year || 0;
      const expMonth = paymentMethod.card?.exp_month || 0;
      if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
        log(`[Direct Topup] Card expired: ${expMonth}/${expYear}`, 'api');
        return res.status(400).json({ error: 'This card has expired. Please use a different card.' });
      }

      log(`[Direct Topup] Creating payment intent for $${(amountCents / 100).toFixed(2)}`, 'api');
      const requestKey = getDirectTopupRequestKey(auth0UserId, paymentMethodId, amountCents);
      const requestClaim = await claimDirectTopupRequest(requestKey);

      if (!requestClaim.claimed) {
        if (requestClaim.existing?.status === 'succeeded' && requestClaim.existing.response) {
          log(`[Direct Topup] Duplicate retry replayed cached success for ${auth0UserId}`, 'api');
          return res.json({
            success: true,
            duplicatePrevented: true,
            ...requestClaim.existing.response,
          });
        }

        return res.status(409).json({
          error: 'A matching top-up is already processing. Please wait a moment before trying again.',
        });
      }

      const idempotencyKey = `topup_${requestClaim.requestId}`;

      // Create a payment intent and confirm it immediately
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'aud',
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: 'Wallet top-up',
        metadata: {
          auth0_user_id: auth0UserId,
          type: 'wallet_topup',
          source: 'direct_charge',
        },
      }, {
        idempotencyKey,
      });

      log(`[Direct Topup] Payment intent created: ${paymentIntent.id}, status: ${paymentIntent.status}`, 'api');

      if (paymentIntent.status === 'succeeded') {
        log(`[Direct Topup] Payment succeeded, crediting wallet`, 'api');
        // Add credits to wallet and record transaction in one call
        // Include card info for display in transaction history
        const cardBrand = paymentMethod.card?.brand ?
          paymentMethod.card.brand.charAt(0).toUpperCase() + paymentMethod.card.brand.slice(1) :
          undefined;
        const cardLast4 = paymentMethod.card?.last4;

        const updatedWallet = await dbStorage.creditWallet(auth0UserId, amountCents, {
          type: 'credit',
          stripePaymentIntentId: paymentIntent.id,
          metadata: {
            source: 'direct_charge',
            cardBrand,
            cardLast4,
            reason: 'Wallet top-up',
          },
        });

        log(`[Direct Topup] Wallet credited. New balance: $${((updatedWallet?.balanceCents || 0) / 100).toFixed(2)}`, 'api');
        log(`Direct charge successful for ${auth0UserId}: $${(amountCents / 100).toFixed(2)} AUD`, 'stripe');
        
        // Create Stripe invoice for the payment (stored in Stripe, not our database)
        try {
          // First create a draft invoice
          const stripeInvoice = await stripe.invoices.create({
            customer: stripeCustomerId,
            auto_advance: false,
            collection_method: 'send_invoice',
            days_until_due: 0,
            description: `OzVPS Wallet Top-Up - $${(amountCents / 100).toFixed(2)} AUD`,
            metadata: {
              auth0UserId,
              type: 'wallet_topup',
              source: 'direct_charge',
              paymentIntentId: paymentIntent.id,
            },
          });
          
          // Add line item to the invoice with the correct amount
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice: stripeInvoice.id,
            amount: amountCents,
            currency: 'aud',
            description: `OzVPS Wallet Top-Up - $${(amountCents / 100).toFixed(2)} AUD`,
          });
          
          // Finalize the invoice
          await stripe.invoices.finalizeInvoice(stripeInvoice.id);
          
          // Mark as paid with the existing payment intent
          await stripe.invoices.pay(stripeInvoice.id, {
            paid_out_of_band: true,
          });
          
          log(`Stripe invoice created: ${stripeInvoice.number} for $${(amountCents / 100).toFixed(2)} user=${auth0UserId}`, 'billing');
        } catch (invoiceError: any) {
          // Log but don't fail - wallet credit was successful
          log(`[Direct Topup] Failed to create Stripe invoice: ${invoiceError.message}`, 'billing');
        }

        log(`[Direct Topup] Sending success response`, 'api');
        const successPayload = {
          newBalanceCents: updatedWallet?.balanceCents || 0,
          chargedAmountCents: amountCents,
        };
        await markDirectTopupRequestSucceeded(requestKey, requestClaim.requestId!, paymentIntent.id, successPayload);
        res.json({
          success: true,
          ...successPayload,
        });
      } else if (paymentIntent.status === 'requires_action') {
        // Card requires 3D Secure or additional authentication
        // Return client_secret so frontend can either handle on-session or fallback
        log(`[Direct Topup] Payment requires action: ${paymentIntent.status}`, 'stripe');
        await clearDirectTopupRequest(requestKey);
        res.status(402).json({
          error: 'This card requires additional authentication.',
          requiresAction: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        });
      } else {
        log(`[Direct Topup] Payment failed with status: ${paymentIntent.status}`, 'stripe');
        await clearDirectTopupRequest(requestKey);
        res.status(400).json({ error: 'Payment failed. Please try again or use a different card.' });
      }
    } catch (error: any) {
      log(`[Direct Topup] Error caught: ${error.message}`, 'api');
      log(`[Direct Topup] Error type: ${error.type}, code: ${error.code}`, 'api');
      log(`[Direct Topup] Full error: ${JSON.stringify(error, null, 2)}`, 'api');

      // Handle Stripe customer errors
      if (error instanceof StripeCustomerError) {
        const auth0UserId = req.userSession?.auth0UserId;
        const paymentMethodId = req.body?.paymentMethodId;
        const amountCents = req.body?.amountCents;
        if (auth0UserId && paymentMethodId && typeof amountCents === 'number') {
          await clearDirectTopupRequest(getDirectTopupRequestKey(auth0UserId, paymentMethodId, amountCents));
        }
        return res.status(error.httpStatus).json({
          error: error.message,
          code: error.code
        });
      }
      // Handle specific Stripe errors
      if (error.type === 'StripeCardError') {
        const auth0UserId = req.userSession?.auth0UserId;
        const paymentMethodId = req.body?.paymentMethodId;
        const amountCents = req.body?.amountCents;
        if (auth0UserId && paymentMethodId && typeof amountCents === 'number') {
          await clearDirectTopupRequest(getDirectTopupRequestKey(auth0UserId, paymentMethodId, amountCents));
        }
        log(`[Direct Topup] Card error: ${error.message}`, 'stripe');
        res.status(400).json({ error: error.message || 'Your card was declined. Please try a different card.' });
      } else if (error.code === 'authentication_required') {
        const auth0UserId = req.userSession?.auth0UserId;
        const paymentMethodId = req.body?.paymentMethodId;
        const amountCents = req.body?.amountCents;
        if (auth0UserId && paymentMethodId && typeof amountCents === 'number') {
          await clearDirectTopupRequest(getDirectTopupRequestKey(auth0UserId, paymentMethodId, amountCents));
        }
        log(`[Direct Topup] Authentication required`, 'stripe');
        res.status(402).json({
          error: 'This card requires additional authentication. Please use the standard top-up flow.',
          requiresAction: true,
        });
      } else {
        const auth0UserId = req.userSession?.auth0UserId;
        const paymentMethodId = req.body?.paymentMethodId;
        const amountCents = req.body?.amountCents;
        if (auth0UserId && paymentMethodId && typeof amountCents === 'number') {
          await clearDirectTopupRequest(getDirectTopupRequestKey(auth0UserId, paymentMethodId, amountCents));
        }
        log(`[Direct Topup] Unhandled error: ${error.message}`, 'api');
        log(`[Direct Topup] Stack trace: ${error.stack}`, 'api');
        res.status(500).json({ error: 'Failed to process payment. Please try again.' });
      }
    }
  });

  // Get OS templates for a plan (authenticated)
  app.get('/api/plans/:id/templates', authMiddleware, async (req, res) => {
    try {
      const planId = parseInt(req.params.id, 10);
      if (isNaN(planId)) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }

      const plan = await dbStorage.getPlanById(planId);
      if (!plan || !plan.active) {
        return res.status(404).json({ error: 'Plan not found or inactive' });
      }

      if (!plan.virtfusionPackageId) {
        return res.status(400).json({ error: 'Plan not configured for deployment' });
      }

      const templates = await virtfusionClient.getOsTemplatesForPackage(plan.virtfusionPackageId);
      res.json(templates || []);
    } catch (error: any) {
      log(`Error fetching templates for plan ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch OS templates' });
    }
  });

  // Validate a promo code (authenticated)
  app.post('/api/promo/validate', authMiddleware, promoValidationRateLimiter, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const { code, planId } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Promo code is required' });
      }

      if (!planId || typeof planId !== 'number') {
        return res.status(400).json({ error: 'Plan ID is required' });
      }

      // Get plan to calculate discount
      const plan = await dbStorage.getPlanById(planId);
      if (!plan || !plan.active) {
        return res.status(404).json({ error: 'Plan not found or inactive' });
      }

      // Validate promo code
      const validation = await dbStorage.validatePromoCode(
        code,
        auth0UserId,
        planId,
        plan.priceMonthly
      );

      if (!validation.valid) {
        return res.status(400).json({
          valid: false,
          error: validation.error,
        });
      }

      res.json({
        valid: true,
        code: validation.promoCode!.code,
        discountType: validation.promoCode!.discountType,
        discountValue: validation.promoCode!.discountValue,
        discountCents: validation.discountCents,
        originalPriceCents: plan.priceMonthly,
        finalPriceCents: validation.finalPriceCents,
      });
    } catch (error: any) {
      log(`Promo validation error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to validate promo code' });
    }
  });

  // Deploy a new VPS (authenticated)
  // osId is optional - if not provided, server is created without OS (awaiting setup)
  // Hostname can be a single label (myserver) or full domain (test.example.com)
  // Each label: 1-63 chars, starts/ends with alphanumeric, can contain hyphens
  const hostnameRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

  const deploySchema = z.object({
    planId: z.number(),
    osId: z.number().min(1).optional(),
    hostname: z.string().min(1).max(253).regex(hostnameRegex).optional(),
    locationCode: z.string().optional(),
    promoCode: z.string().max(20).optional(),
  });

  app.post('/api/deploy', authMiddleware, requireEmailVerified, deploymentRateLimiter, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      const virtFusionUserId = req.userSession!.virtFusionUserId;
      const extRelationId = req.userSession!.extRelationId;

      if (!auth0UserId || !virtFusionUserId || !extRelationId) {
        return res.status(400).json({ error: 'Invalid session state' });
      }

      // Check if user account is blocked or suspended
      const userFlags = await dbStorage.getUserFlagsFromDb(auth0UserId);
      if (userFlags?.blocked) {
        log(`Blocked user attempted to deploy: ${auth0UserId}`, 'security');
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
      }
      if (userFlags?.suspended) {
        log(`Suspended user attempted to deploy: ${auth0UserId}`, 'security');
        return res.status(403).json({ error: 'Your account has been suspended. Deployment is disabled. Please contact support for assistance.' });
      }

      const result = deploySchema.safeParse(req.body);
      if (!result.success) {
        const errorMessages = result.error.errors.map(e => e.message).join(', ');
        return res.status(400).json({ error: `Invalid deploy request: ${errorMessages}` });
      }

      const { planId, osId, hostname, locationCode, promoCode } = result.data;

      // Get hypervisor GROUP from location (default to Brisbane)
      const location = LOCATION_CONFIG[locationCode || 'BNE'];
      if (!location || !location.enabled) {
        return res.status(400).json({ error: 'Invalid or unavailable location' });
      }
      const hypervisorGroupId = location.hypervisorGroupId;

      // Get plan details
      const plan = await dbStorage.getPlanById(planId);
      if (!plan || !plan.active) {
        return res.status(404).json({ error: 'Plan not found or inactive' });
      }

      if (!plan.virtfusionPackageId) {
        return res.status(400).json({ error: 'Plan not configured for deployment' });
      }

      // Validate promo code if provided
      let finalPriceCents = plan.priceMonthly;
      let promoValidation: {
        valid: boolean;
        promoCode?: { id: number; code: string };
        discountCents?: number;
        finalPriceCents?: number;
      } | undefined;

      if (promoCode) {
        promoValidation = await dbStorage.validatePromoCode(
          promoCode,
          auth0UserId,
          planId,
          plan.priceMonthly
        );

        if (!promoValidation.valid) {
          return res.status(400).json({ error: (promoValidation as any).error || 'Invalid promo code' });
        }

        finalPriceCents = promoValidation.finalPriceCents!;
        log(`Promo code ${promoCode} applied: discount ${promoValidation.discountCents} cents, final price ${finalPriceCents} cents`, 'api');
      }

      // Only verify OS template if osId is provided
      let selectedTemplate: { id: number; name: string } | undefined;
      if (osId) {
        const templates = await virtfusionClient.getOsTemplatesForPackage(plan.virtfusionPackageId);
        let templateAllowed = false;
        if (templates && Array.isArray(templates)) {
          for (const group of templates) {
            if (group.templates && Array.isArray(group.templates)) {
              const found = group.templates.find((t: any) => t.id === osId);
              if (found) {
                templateAllowed = true;
                selectedTemplate = { id: found.id, name: found.name };
                break;
              }
            }
          }
        }

        if (!templateAllowed) {
          return res.status(403).json({ error: 'Selected operating system is not available for this plan' });
        }
      }

      // Atomically increment promo usage BEFORE wallet debit to close the race window.
      // If two concurrent requests both validated the same promo, the DB-level check in
      // incrementPromoCodeUsage (currentUses < maxUsesTotal) will reject the second one.
      // Per-user limits are enforced here before any money moves.
      if (promoValidation?.valid && promoValidation.promoCode) {
        try {
          await dbStorage.incrementPromoCodeUsage(promoValidation.promoCode.id);
        } catch (promoError: any) {
          // incrementPromoCodeUsage throws if limit reached (race condition caught)
          return res.status(400).json({ error: 'Promo code usage limit has been reached' });
        }
      }

      // Debit wallet and create order atomically
      // Use provided hostname or generate a default one
      const serverHostname = hostname || `vps-${Date.now().toString(36)}`;
      const deployResult = await dbStorage.createDeployWithDebit(
        auth0UserId,
        planId,
        finalPriceCents, // Use discounted price if promo applied
        serverHostname,
        plan.name
      );

      if (!deployResult.success || !deployResult.order) {
        // Wallet debit failed — roll back the promo increment so user can retry
        if (promoValidation?.valid && promoValidation.promoCode) {
          dbStorage.decrementPromoCodeUsage(promoValidation.promoCode.id).catch(() => {});
        }
        return res.status(400).json({ error: deployResult.error || 'Failed to create deploy order' });
      }

      const order = deployResult.order;

      // Update order to provisioning status
      await dbStorage.updateDeployOrder(order.id, { status: 'provisioning' });

      // Provision server via VirtFusion
      let serverResult: { serverId: number; name: string; uuid?: string; password?: string; primaryIp?: string; osName?: string };
      try {
        serverResult = await virtfusionClient.provisionServer({
          userId: virtFusionUserId,
          packageId: plan.virtfusionPackageId,
          hostname: serverHostname,
          extRelationId,
          osId, // Optional - if undefined, server is created without OS (awaiting setup)
          hypervisorGroupId,
        });

        log(`Server ${serverResult.serverId} provisioned successfully for order ${order.id}`, 'api');

        // Email credentials if password and IP were returned
        if (serverResult.password && serverResult.primaryIp && req.userSession?.email) {
          const emailServerName = serverResult.name || serverHostname || `Server #${serverResult.serverId}`;
          log(`Sending credentials email to ${req.userSession!.email} for server ${emailServerName}`, 'api');
          sendServerCredentialsEmail(
            req.userSession!.email,
            emailServerName,
            serverResult.primaryIp,
            'root',
            serverResult.password,
            selectedTemplate?.name || 'Linux'
          ).then(result => {
            if (result.success) {
              log(`Credentials email sent successfully for server ${serverResult.serverId}`, 'api');
            } else {
              log(`Failed to send credentials email for server ${serverResult.serverId}: ${result.error}`, 'api');
            }
          }).catch(err => {
            log(`Error sending credentials email for server ${serverResult.serverId}: ${err.message}`, 'api');
          });
        } else {
          log(`Skipping credentials email - password: ${!!serverResult.password}, IP: ${!!serverResult.primaryIp}, email: ${!!req.userSession?.email}`, 'api');
        }
      } catch (provisionError: any) {
        log(`Provisioning failed for order ${order.id}: ${provisionError.message}`, 'api');

        // Refund the wallet - server was never created
        // Use finalPriceCents (not plan.priceMonthly) to refund exactly what was charged,
        // which may be less if a promo code was applied.
        await dbStorage.refundToWallet(auth0UserId, finalPriceCents, {
          reason: 'provisioning_failed',
          orderId: order.id,
        });

        // Roll back promo increment so user can retry
        if (promoValidation?.valid && promoValidation.promoCode) {
          dbStorage.decrementPromoCodeUsage(promoValidation.promoCode.id).catch(() => {});
        }

        await dbStorage.updateDeployOrder(order.id, {
          status: 'failed',
          errorMessage: provisionError.message,
        });

        return res.status(500).json({ error: 'Server provisioning failed. Your wallet has been refunded.' });
      }

      // Server was created successfully - DO NOT REFUND FROM THIS POINT FORWARD
      // Update order with server ID (non-critical, log if it fails)
      try {
        await dbStorage.updateDeployOrder(order.id, {
          status: 'active',
          virtfusionServerId: serverResult.serverId,
        });
      } catch (updateError: any) {
        log(`Warning: Could not update order ${order.id} with server ID: ${updateError.message}`, 'api');
      }

      // Create billing record for the new server (non-critical, log if it fails)
      try {
        await createServerBilling({
          auth0UserId,
          virtfusionServerId: serverResult.serverId.toString(),
          virtfusionServerUuid: serverResult.uuid, // Immutable UUID for reliable lookups
          planId,
          monthlyPriceCents: plan.priceMonthly,
        });
      } catch (billingError: any) {
        log(`Warning: Could not create billing record for server ${serverResult.serverId}: ${billingError.message}`, 'api');
      }

      // Record promo code usage details (increment already done before provisioning)
      if (promoValidation?.valid && promoValidation.promoCode) {
        try {
          await dbStorage.recordPromoCodeUsage({
            promoCodeId: promoValidation.promoCode.id,
            auth0UserId,
            deployOrderId: order.id,
            discountAppliedCents: promoValidation.discountCents!,
            originalPriceCents: plan.priceMonthly,
            finalPriceCents: finalPriceCents,
          });
          log(`Promo code ${promoValidation.promoCode.code} usage recorded for order ${order.id}`, 'api');
        } catch (promoError: any) {
          log(`Warning: Could not record promo code usage details: ${promoError.message}`, 'api');
        }
      }

      // Audit log server creation
      await auditUserAction(req, auth0UserId, req.userSession!.email, UserActions.SERVER_CREATE, 'server', serverResult.serverId.toString(), {
        planId,
        hostname: req.body.hostname,
        orderId: order.id,
      });

      // Always return success if server was provisioned
      res.json({
        success: true,
        orderId: order.id,
        serverId: serverResult.serverId,
      });
    } catch (error: any) {
      log(`Deploy error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to deploy server' });
    }
  });

  // Get deploy order status (authenticated)
  app.get('/api/deploy/:orderId', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const orderId = parseInt(req.params.orderId, 10);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }

      const order = await dbStorage.getDeployOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify ownership
      if (order.auth0UserId !== auth0UserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({ order });
    } catch (error: any) {
      log(`Error fetching order: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  // Get user's deploy orders (authenticated)
  app.get('/api/deploy', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const orders = await dbStorage.getDeployOrdersByUser(auth0UserId);
      res.json({ orders });
    } catch (error: any) {
      log(`Error fetching orders: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  // ================== Webhook Routes ==================

  // Inbound email webhook — Resend forwards emails to support+{ticketId}@ozvps.com.au here
  app.post('/api/hooks/resend-inbound', async (req, res) => {
    try {
      // Validate shared secret to prevent forged inbound email injection.
      // RESEND_WEBHOOK_SECRET is mandatory — reject all requests if not configured.
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      if (!webhookSecret) {
        log('Resend inbound webhook: RESEND_WEBHOOK_SECRET not configured — rejecting request', 'webhook');
        return res.status(503).json({ error: 'Webhook not configured' });
      }
      const provided = req.headers['x-webhook-secret'];
      const providedSecret = typeof provided === 'string'
        ? provided
        : Array.isArray(provided)
        ? provided[0]
        : '';
      if (!providedSecret) {
        log('Resend inbound webhook: missing secret header', 'webhook');
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const providedBuffer = Buffer.from(providedSecret, 'utf8');
      const expectedBuffer = Buffer.from(webhookSecret, 'utf8');
      if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
        log('Resend inbound webhook: invalid secret', 'webhook');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Resend sends multipart/form-data or JSON depending on configuration
      const payload = req.body;

      // Extract the To address to find the ticket ID
      // support+123@ozvps.com.au → ticketId = 123
      const toAddresses: string[] = Array.isArray(payload.to)
        ? payload.to
        : typeof payload.to === 'string'
        ? [payload.to]
        : [];

      let ticketId: number | null = null;
      for (const addr of toAddresses) {
        const match = addr.match(/support\+(\d+)@/i);
        if (match) {
          ticketId = parseInt(match[1], 10);
          break;
        }
      }

      if (!ticketId || isNaN(ticketId)) {
        log(`Inbound email: no ticket ID found in To addresses: ${toAddresses.join(', ')}`, 'webhook');
        return res.json({ ok: true }); // 200 so Resend doesn't retry
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        log(`Inbound email: ticket #${ticketId} not found`, 'webhook');
        return res.json({ ok: true });
      }

      if (ticket.status === 'closed') {
        log(`Inbound email: ticket #${ticketId} is closed, ignoring reply`, 'webhook');
        return res.json({ ok: true });
      }

      // Extract sender info
      const fromRaw: string = payload.from || '';
      const fromMatch = fromRaw.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+)>?$/);
      const senderName = fromMatch?.[1]?.trim() || null;
      const senderEmail = (fromMatch?.[2]?.trim() || fromRaw).toLowerCase();

      // Extract plain text body — strip quoted text (lines starting with ">")
      const rawText: string = payload.text || payload.plain || '';
      const cleanBody = rawText
        .split('\n')
        .filter((line: string) => !line.startsWith('>') && !line.match(/^On .+wrote:$/))
        .join('\n')
        .replace(/\r\n/g, '\n')
        .trim();

      if (!cleanBody || cleanBody.length < 2) {
        log(`Inbound email: empty body after stripping quotes for ticket #${ticketId}`, 'webhook');
        return res.json({ ok: true });
      }

      // Determine if sender is the ticket owner (user or guest)
      let authorType: 'user' | 'admin' = 'user';
      let authorId = senderEmail;

      if (ticket.auth0UserId) {
        // Verify sender email matches the ticket owner
        try {
          const auth0User = await auth0Client.getUserById(ticket.auth0UserId);
          if (!auth0User?.email || auth0User.email.toLowerCase() !== senderEmail) {
            log(`Inbound email: sender ${senderEmail} doesn't match ticket owner ${auth0User?.email} for ticket #${ticketId}`, 'webhook');
            return res.json({ ok: true });
          }
          authorId = ticket.auth0UserId;
        } catch (e: any) {
          log(`Inbound email: Auth0 lookup failed for ticket #${ticketId}: ${e.message}`, 'webhook');
          return res.json({ ok: true });
        }
      } else if (ticket.guestEmail) {
        // Guest ticket — verify sender matches guest email
        if (ticket.guestEmail.toLowerCase() !== senderEmail) {
          log(`Inbound email: sender ${senderEmail} doesn't match guest email ${ticket.guestEmail} for ticket #${ticketId}`, 'webhook');
          return res.json({ ok: true });
        }
        authorId = senderEmail;
      }

      // Limit message length
      const messageText = cleanBody.slice(0, 5000);

      await dbStorage.createTicketMessage({
        ticketId,
        authorType,
        authorId,
        authorEmail: senderEmail,
        authorName: senderName,
        message: messageText,
        isInternalNote: false,
      });

      // Reopen if resolved
      if (ticket.status === 'resolved' || ticket.status === 'waiting_admin') {
        await dbStorage.updateTicket(ticketId, { status: 'waiting_admin' });
      } else if (ticket.status !== 'waiting_admin') {
        await dbStorage.updateTicket(ticketId, { status: 'waiting_admin' });
      }

      // Notify admin of the email reply
      sendAdminTicketNotificationEmail(ticketId, ticket.title, ticket.category as any, ticket.priority as any, messageText, senderEmail, senderName || null).catch(err => {
        log(`Inbound email: failed to notify admin for ticket #${ticketId}: ${err.message}`, 'webhook');
      });

      log(`Inbound email: message added to ticket #${ticketId} from ${senderEmail}`, 'webhook');
      res.json({ ok: true });
    } catch (error: any) {
      log(`Inbound email webhook error: ${error.message}`, 'webhook');
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  app.post('/api/hooks/auth0-user-deleted', async (req, res) => {
    try {
      const webhookSecret = process.env.AUTH0_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        log('Auth0 webhook secret not configured', 'webhook');
        return res.status(500).json({ error: 'Webhook not configured' });
      }

      // Verify using either Bearer token OR HMAC signature
      const authHeader = req.headers['authorization'] as string;
      const signatureHeader = req.headers['x-auth0-signature'] as string;
      
      let isAuthorized = false;
      
      // Method 1: Bearer token verification (simpler, for basic Auth0 Actions)
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === webhookSecret) {
          isAuthorized = true;
          log('Auth0 webhook verified via Bearer token', 'webhook');
        }
      }
      
      // Method 2: HMAC signature verification (more secure, for Auth0 Event Streams)
      // Uses raw request body to ensure signature matches exactly
      if (!isAuthorized && signatureHeader) {
        const rawBody = req.rawBody;
        if (rawBody) {
          const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
          if (verifyHmacSignature(payload, signatureHeader, webhookSecret)) {
            isAuthorized = true;
            log('Auth0 webhook verified via HMAC signature', 'webhook');
          } else {
            log('Auth0 webhook HMAC signature verification failed', 'webhook');
          }
        } else {
          log('Auth0 webhook has signature header but missing raw body', 'webhook');
        }
      }
      
      if (!isAuthorized) {
        log('Auth0 webhook authentication failed - no valid token or signature', 'webhook');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const eventType = req.body.type;
      if (eventType !== 'user.deleted') {
        log(`Ignoring non-deletion event: ${eventType}`, 'webhook');
        return res.status(204).send();
      }

      const userData = req.body.data?.object;
      if (!userData) {
        log('Missing user data in webhook payload', 'webhook');
        return res.status(400).json({ error: 'Missing user data' });
      }

      const auth0UserId = userData.user_id;
      const email = userData.email;
      const virtFusionUserId = userData.app_metadata?.virtfusion_user_id;

      log(`Processing user deletion for Auth0 user: ${auth0UserId}, email: ${email}`, 'webhook');

      const cleanupErrors: string[] = [];

      // 1. Delete all sessions for this user
      await storage.deleteSessionsByAuth0UserId(auth0UserId);
      log(`Deleted sessions for Auth0 user ${auth0UserId}`, 'webhook');

      // 2. Delete Stripe customer if exists
      const wallet = await dbStorage.getWallet(auth0UserId);
      if (wallet?.stripeCustomerId) {
        try {
          const stripe = await getUncachableStripeClient();
          await stripe.customers.del(wallet.stripeCustomerId);
          log(`Deleted Stripe customer ${wallet.stripeCustomerId} for Auth0 user ${auth0UserId}`, 'webhook');
        } catch (stripeError: any) {
          if (stripeError.code === 'resource_missing') {
            log(`Stripe customer ${wallet.stripeCustomerId} already deleted`, 'webhook');
          } else {
            log(`Failed to delete Stripe customer: ${stripeError.message}`, 'webhook');
            cleanupErrors.push(`Stripe: ${stripeError.message}`);
          }
        }
      }

      // 3. Mark wallet as deleted (soft delete for audit trail)
      if (wallet) {
        await dbStorage.softDeleteWallet(auth0UserId);
        log(`Soft-deleted wallet for Auth0 user ${auth0UserId}`, 'webhook');
      }

      // 4. Cancel all pending orders for this user
      const cancelledOrders = await dbStorage.cancelAllUserOrders(auth0UserId);
      if (cancelledOrders > 0) {
        log(`Cancelled ${cancelledOrders} orders for Auth0 user ${auth0UserId}`, 'webhook');
      }

      // 5. Cleanup VirtFusion user and servers
      if (virtFusionUserId) {
        const result = await virtfusionClient.cleanupUserAndServers(virtFusionUserId);
        
        if (result.success) {
          log(`Successfully cleaned up VirtFusion user ${virtFusionUserId}: ${result.serversDeleted} servers deleted`, 'webhook');
        } else {
          log(`Partial cleanup for VirtFusion user ${virtFusionUserId}: ${result.errors.join(', ')}`, 'webhook');
          cleanupErrors.push(...result.errors);
        }
      } else {
        log(`No VirtFusion user ID in app_metadata for ${auth0UserId}, skipping VirtFusion cleanup`, 'webhook');
      }

      if (cleanupErrors.length > 0) {
        return res.status(500).json({ error: 'Partial cleanup', errors: cleanupErrors });
      }
      return res.status(204).send();
    } catch (error: any) {
      log(`Webhook error: ${error.message}`, 'webhook');
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // ==========================================
  // SUPPORT TICKET ROUTES - USER FACING
  // ==========================================

  // Get ticket counts for user (for notification badge)
  app.get('/api/support/counts', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const counts = await dbStorage.getUserTicketCounts(auth0UserId);
      res.json(counts);
    } catch (error: any) {
      log(`Error fetching ticket counts: ${error.message}`, 'api');
      // Return zeros if tables don't exist yet (graceful fallback)
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return res.json({ open: 0, waitingUser: 0, total: 0 });
      }
      res.status(500).json({ error: 'Failed to fetch ticket counts' });
    }
  });

  // List user's tickets
  app.get('/api/support/tickets', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const status = req.query.status as 'open' | 'closed' | 'all' | undefined;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;

      const result = await dbStorage.getUserTickets(auth0UserId, { status, limit, offset });
      res.json(result);
    } catch (error: any) {
      log(`Error fetching user tickets: ${error.message}`, 'api');
      // Return empty array if tables don't exist yet
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return res.json({ tickets: [], total: 0 });
      }
      res.status(500).json({ error: 'Failed to fetch tickets' });
    }
  });

  // Create a new ticket
  app.post('/api/support/tickets', authMiddleware, ticketRateLimiter, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const parseResult = createTicketSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { title, category, priority, description, virtfusionServerId } = parseResult.data;

      // If a server is specified, verify ownership
      if (virtfusionServerId) {
        const isOwner = await verifyServerOwnership(virtfusionServerId, req.userSession!.virtFusionUserId);
        if (!isOwner) {
          return res.status(403).json({ error: 'You do not have access to this server' });
        }
      }

      // Create the ticket
      const ticket = await dbStorage.createTicket({
        auth0UserId,
        title,
        category,
        priority,
        virtfusionServerId: virtfusionServerId || null,
      });

      // Create the initial message
      await dbStorage.createTicketMessage({
        ticketId: ticket.id,
        authorType: 'user',
        authorId: auth0UserId,
        authorEmail: req.userSession!.email,
        authorName: req.userSession!.name || null,
        message: description,
      });

      log(`Ticket #${ticket.id} created by ${req.userSession!.email}`, 'support');

      // Send admin notification email (non-blocking, don't fail if email fails)
      sendAdminTicketNotificationEmail(
        ticket.id,
        title,
        category,
        priority,
        description,
        req.userSession!.email!,
        req.userSession!.name || null
      ).catch(err => {
        log(`Failed to send admin notification for ticket #${ticket.id}: ${err.message}`, 'email');
      });

      res.status(201).json({ ticket });
    } catch (error: any) {
      log(`Error creating ticket: ${error.message}`, 'api');
      // Log detailed error but return generic message to user
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        log('Database tables not found - run: npm run db:push', 'api');
      }
      res.status(500).json({ error: 'Failed to create ticket. Please try again or contact support.' });
    }
  });

  // Get a specific ticket with messages (user view — internal notes filtered out)
  app.get('/api/support/tickets/:id', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      let ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      // Verify ownership
      if (ticket.auth0UserId !== auth0UserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Auto-close resolved tickets older than 7 days
      if (ticket.status === 'resolved' && ticket.resolvedAt) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (new Date(ticket.resolvedAt) < sevenDaysAgo) {
          ticket = await dbStorage.closeTicket(ticketId) || ticket;
          log(`Ticket #${ticketId} auto-closed (resolved > 7 days ago)`, 'support');
        }
      }

      const messages = await dbStorage.getTicketMessages(ticketId, false); // exclude internal notes from user view

      // Get server info if attached
      let server = null;
      if (ticket.virtfusionServerId) {
        try {
          server = await virtfusionClient.getServer(ticket.virtfusionServerId);
        } catch (e) {
          // Server might be deleted
        }
      }

      res.json({ ticket, messages, server });
    } catch (error: any) {
      log(`Error fetching ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  });

  // Reply to a ticket (user)
  app.post('/api/support/tickets/:id/messages', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const parseResult = ticketMessageSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      // Verify ownership
      if (ticket.auth0UserId !== auth0UserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Create the message
      const message = await dbStorage.createTicketMessage({
        ticketId,
        authorType: 'user',
        authorId: auth0UserId,
        authorEmail: req.userSession!.email,
        authorName: req.userSession!.name || null,
        message: parseResult.data.message,
      });

      // Update ticket status to waiting_admin (user replied)
      // Also reopen if it was resolved or closed
      let newStatus: TicketStatus = 'waiting_admin';
      await dbStorage.updateTicket(ticketId, {
        status: newStatus,
        closedAt: null,
      });

      log(`Reply added to ticket #${ticketId} by ${req.userSession!.email}`, 'support');
      res.status(201).json({ message });
    } catch (error: any) {
      log(`Error replying to ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to send reply' });
    }
  });

  // Close a ticket (user can request close)
  app.post('/api/support/tickets/:id/close', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      // Verify ownership
      if (ticket.auth0UserId !== auth0UserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updatedTicket = await dbStorage.closeTicket(ticketId);
      log(`Ticket #${ticketId} closed by user ${req.userSession!.email}`, 'support');
      res.json({ ticket: updatedTicket });
    } catch (error: any) {
      log(`Error closing ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to close ticket' });
    }
  });

  // Reopen a resolved ticket (user)
  app.post('/api/support/tickets/:id/reopen', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      // Verify ownership
      if (ticket.auth0UserId !== auth0UserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Only resolved tickets can be reopened by users
      if (ticket.status !== 'resolved') {
        return res.status(400).json({ error: 'Only resolved tickets can be reopened. Please create a new ticket.' });
      }

      // Check if ticket was resolved more than 7 days ago
      if (ticket.resolvedAt) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (new Date(ticket.resolvedAt) < sevenDaysAgo) {
          // Auto-close the ticket since it's been resolved for more than 7 days
          await dbStorage.closeTicket(ticketId);
          log(`Ticket #${ticketId} auto-closed (resolved > 7 days ago)`, 'support');
          return res.status(400).json({
            error: 'This ticket was resolved more than 7 days ago and has been closed. Please create a new ticket.',
            autoClosedTicket: true
          });
        }
      }

      const updatedTicket = await dbStorage.reopenTicket(ticketId);
      log(`Ticket #${ticketId} reopened by user ${req.userSession!.email}`, 'support');
      res.json({ ticket: updatedTicket });
    } catch (error: any) {
      log(`Error reopening ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to reopen ticket' });
    }
  });

  // ==========================================
  // SUPPORT TICKET ROUTES - PUBLIC / GUEST
  // ==========================================

  // Public contact form - sales and abuse enquiries only (no auth required)
  app.post('/api/support/contact', contactRateLimiter, async (req, res) => {
    try {
      const { name, email, category, title, message } = req.body;

      // Only sales and abuse allowed for public contact
      if (!['sales', 'abuse'].includes(category)) {
        return res.status(400).json({ error: 'Invalid category. Only sales and abuse enquiries accepted here.' });
      }

      // Validate email
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
        return res.status(400).json({ error: 'A valid email address is required.' });
      }

      // Validate title
      const cleanTitle = typeof title === 'string' ? title.trim() : '';
      if (cleanTitle.length < 2) return res.status(400).json({ error: 'Subject is required.' });
      if (cleanTitle.length > 200) return res.status(400).json({ error: 'Subject must be 200 characters or less.' });

      // Validate message
      const cleanMessage = typeof message === 'string' ? message.trim() : '';
      if (cleanMessage.length < 20) return res.status(400).json({ error: 'Message must be at least 20 characters.' });
      if (cleanMessage.length > 5000) return res.status(400).json({ error: 'Message must be 5000 characters or less.' });

      const resolvedName = name ? String(name).trim().slice(0, 100) || null : null;

      // Public contact is always a guest flow so inbox possession remains
      // the only path to the secure ticket link.
      const accessToken = randomBytes(32).toString('hex');

      const ticket = await dbStorage.createTicket({
        guestEmail: cleanEmail,
        guestAccessToken: accessToken,
        title: cleanTitle,
        category,
        priority: 'normal',
      });

      await dbStorage.createTicketMessage({
        ticketId: ticket.id,
        authorType: 'user',
        authorId: cleanEmail,
        authorEmail: cleanEmail,
        authorName: resolvedName,
        message: cleanMessage,
      });

      log(`Guest ticket #${ticket.id} created via public contact form by ${cleanEmail} (${category})`, 'support');

      // Guest confirmation email carries the secure access link; the API response does not.
      sendGuestTicketConfirmationEmail(cleanEmail, ticket.id, ticket.ticketNumber!, cleanTitle, accessToken, resolvedName).catch(err => {
        log(`Failed to send guest ticket confirmation to ${cleanEmail}: ${err.message}`, 'email');
      });

      // Send admin notification (non-blocking)
      sendAdminTicketNotificationEmail(ticket.id, cleanTitle, category, 'normal', cleanMessage, cleanEmail, resolvedName).catch(err => {
        log(`Failed to send admin notification for ticket #${ticket.id}: ${err.message}`, 'email');
      });

      res.json({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber });
    } catch (error: any) {
      log(`Error creating guest ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to submit your enquiry. Please try again.' });
    }
  });

  // Get a guest ticket by access token (no auth required)
  app.get('/api/support/guest', ticketRateLimiter, async (req, res) => {
    try {
      const accessToken = getGuestTicketToken(req);
      if (!accessToken || accessToken.length < 32) {
        return res.status(400).json({ error: 'Invalid access token' });
      }

      const ticket = await dbStorage.getTicketByAccessToken(accessToken);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const { guestAccessToken: _guestAccessToken, guestEmail: _guestEmail, ...safeTicket } = ticket;
      const messages = await dbStorage.getTicketMessages(ticket.id, false); // exclude internal notes from guest view
      res.json({ ticket: safeTicket, messages });
    } catch (error: any) {
      log(`Error fetching guest ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  });

  // Reply to a guest ticket (no auth required)
  app.post('/api/support/guest/messages', ticketRateLimiter, async (req, res) => {
    try {
      const accessToken = getGuestTicketToken(req);
      if (!accessToken || accessToken.length < 32) {
        return res.status(400).json({ error: 'Invalid access token' });
      }

      const ticket = await dbStorage.getTicketByAccessToken(accessToken);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      if (ticket.status === 'closed') {
        return res.status(400).json({ error: 'This ticket is closed.' });
      }

      const rawMessage = req.body?.message;
      if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
        return res.status(400).json({ error: 'Message is required.' });
      }
      if (rawMessage.trim().length > 5000) {
        return res.status(400).json({ error: 'Message must be 5000 characters or less.' });
      }

      const newMessage = await dbStorage.createTicketMessage({
        ticketId: ticket.id,
        authorType: 'user',
        authorId: ticket.guestEmail!,
        authorEmail: ticket.guestEmail!,
        authorName: null,
        message: rawMessage.trim(),
      });

      // Reopen resolved ticket on user reply, otherwise set to waiting_admin
      const newStatus = ticket.status === 'resolved' ? 'open' : 'waiting_admin';
      await dbStorage.updateTicket(ticket.id, { status: newStatus });

      log(`Guest reply added to ticket #${ticket.id} by ${ticket.guestEmail}`, 'support');
      res.status(201).json({ message: newMessage });
    } catch (error: any) {
      log(`Error adding guest reply: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to send reply' });
    }
  });

  // ==========================================
  // SUPPORT TICKET ROUTES - ADMIN FACING
  // ==========================================

  // Get admin ticket counts (for notification badge)
  app.get('/api/admin/tickets/counts', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const counts = await dbStorage.getAdminTicketCounts();
      res.json(counts);
    } catch (error: any) {
      log(`Error fetching admin ticket counts: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch ticket counts' });
    }
  });

  // List all tickets (admin)
  app.get('/api/admin/tickets', authMiddleware, requireAdmin, async (req, res) => {
    try {
      // Parse and validate query params
      let status: TicketStatus | TicketStatus[] | undefined;
      const statusParam = req.query.status as string | undefined;
      if (statusParam) {
        if (statusParam.includes(',')) {
          const statuses = statusParam.split(',');
          // Validate each status
          for (const s of statuses) {
            if (!TICKET_STATUSES.includes(s as TicketStatus)) {
              return res.status(400).json({ error: `Invalid status: ${s}` });
            }
          }
          status = statuses as TicketStatus[];
        } else {
          if (!TICKET_STATUSES.includes(statusParam as TicketStatus)) {
            return res.status(400).json({ error: `Invalid status: ${statusParam}` });
          }
          status = statusParam as TicketStatus;
        }
      }

      // Validate category
      const categoryParam = req.query.category as string | undefined;
      let category: TicketCategory | undefined;
      if (categoryParam) {
        if (!TICKET_CATEGORIES.includes(categoryParam as TicketCategory)) {
          return res.status(400).json({ error: `Invalid category: ${categoryParam}` });
        }
        category = categoryParam as TicketCategory;
      }

      // Validate priority
      const priorityParam = req.query.priority as string | undefined;
      let priority: TicketPriority | undefined;
      if (priorityParam) {
        if (!TICKET_PRIORITIES.includes(priorityParam as TicketPriority)) {
          return res.status(400).json({ error: `Invalid priority: ${priorityParam}` });
        }
        priority = priorityParam as TicketPriority;
      }

      const auth0UserId = req.query.user as string | undefined;
      const virtfusionServerId = req.query.server as string | undefined;
      const assignedAdminId = req.query.assigned === 'null' ? null : req.query.assigned as string | undefined;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;

      // Validate sortBy
      const sortByParam = req.query.sortBy as string | undefined;
      const validSortBy = ['lastMessageAt', 'priority', 'createdAt'] as const;
      const sortBy = sortByParam && validSortBy.includes(sortByParam as typeof validSortBy[number])
        ? sortByParam as typeof validSortBy[number]
        : 'lastMessageAt';

      // Validate sortOrder
      const sortOrderParam = req.query.sortOrder as string | undefined;
      const sortOrder = sortOrderParam === 'asc' ? 'asc' : 'desc';

      const result = await dbStorage.getAllTickets({
        status,
        category,
        priority,
        auth0UserId,
        virtfusionServerId,
        assignedAdminId,
        limit,
        offset,
        sortBy,
        sortOrder,
      });

      res.json(result);
    } catch (error: any) {
      log(`Error fetching admin tickets: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch tickets' });
    }
  });

  // Get a specific ticket with messages (admin)
  app.get('/api/admin/tickets/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const messages = await dbStorage.getTicketMessages(ticketId);

      // Get server info if attached
      let server = null;
      if (ticket.virtfusionServerId) {
        try {
          server = await virtfusionClient.getServer(ticket.virtfusionServerId);
        } catch (e) {
          // Server might be deleted
        }
      }

      // Get user info from wallet (only for registered users)
      const wallet = ticket.auth0UserId ? await dbStorage.getWallet(ticket.auth0UserId) : null;

      res.json({ ticket, messages, server, user: wallet ? { email: ticket.auth0UserId } : null });
    } catch (error: any) {
      log(`Error fetching ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  });

  // Reply to a ticket (admin) with optional status change
  app.post('/api/admin/tickets/:id/messages', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const parseResult = ticketMessageSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const isInternalNote = req.body.isInternalNote === true;

      // Create the message
      const message = await dbStorage.createTicketMessage({
        ticketId,
        authorType: 'admin',
        authorId: auth0UserId,
        authorEmail: req.userSession!.email,
        authorName: req.userSession!.name || null,
        message: parseResult.data.message,
        isInternalNote,
      });

      // Internal notes don't change ticket status or trigger emails
      if (!isInternalNote) {
        // Update ticket status - default to waiting_user when admin replies
        const newStatus = (req.body.status as TicketStatus) || 'waiting_user';
        await dbStorage.updateTicket(ticketId, { status: newStatus });
      }

      // Notify ticket author by email (skip for internal notes)
      if (!isInternalNote && ticket.auth0UserId) {
        // Logged-in user — look up their email from Auth0
        auth0Client.getUserById(ticket.auth0UserId).then(auth0User => {
          if (auth0User?.email) {
            sendTicketAdminReplyEmail(auth0User.email, ticketId, ticket.ticketNumber ?? ticketId, ticket.title, parseResult.data.message).catch(err => {
              log(`Failed to send ticket reply notification for ticket #${ticketId}: ${err.message}`, 'email');
            });
          }
        }).catch(err => {
          log(`Failed to get Auth0 user for ticket reply notification #${ticketId}: ${err.message}`, 'email');
        });
      } else if (!isInternalNote && ticket.guestEmail && ticket.guestAccessToken) {
        // Guest ticket
        sendGuestTicketAdminReplyEmail(ticket.guestEmail, ticketId, ticket.ticketNumber ?? ticketId, ticket.title, ticket.guestAccessToken, parseResult.data.message).catch(err => {
          log(`Failed to send guest ticket reply notification for ticket #${ticketId}: ${err.message}`, 'email');
        });
      }

      log(`Admin ${isInternalNote ? 'note' : 'reply'} added to ticket #${ticketId} by ${req.userSession!.email}`, 'support');
      res.status(201).json({ message });
    } catch (error: any) {
      log(`Error replying to ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to send reply' });
    }
  });

  // Update ticket metadata (admin)
  app.patch('/api/admin/tickets/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const parseResult = adminTicketUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const updates: any = {};
      if (parseResult.data.status !== undefined) updates.status = parseResult.data.status;
      if (parseResult.data.priority !== undefined) updates.priority = parseResult.data.priority;
      if (parseResult.data.category !== undefined) updates.category = parseResult.data.category;
      if (parseResult.data.assignedAdminId !== undefined) updates.assignedAdminId = parseResult.data.assignedAdminId;

      // Handle resolved status - set resolvedAt for 7-day auto-close tracking
      if (updates.status === 'resolved' && ticket.status !== 'resolved') {
        updates.resolvedAt = new Date();
      } else if (updates.status && updates.status !== 'resolved' && ticket.status === 'resolved') {
        // Clearing resolved status, clear resolvedAt
        updates.resolvedAt = null;
      }

      // Handle closed status
      if (updates.status === 'closed') {
        updates.closedAt = new Date();
      } else if (ticket.status === 'closed' && updates.status && updates.status !== 'closed') {
        updates.closedAt = null;
      }

      const updatedTicket = await dbStorage.updateTicket(ticketId, updates);
      log(`Ticket #${ticketId} updated by admin ${req.userSession!.email}: ${JSON.stringify(updates)}`, 'support');

      // Send email notification if status changed to resolved or closed
      if (ticket.auth0UserId) {
        if (updates.status === 'resolved' && ticket.status !== 'resolved') {
          sendTicketStatusEmail(ticket.auth0UserId, ticketId, ticket.title, 'resolved').catch(err => {
            log(`Failed to send resolved notification for ticket #${ticketId}: ${err.message}`, 'email');
          });
        } else if (updates.status === 'closed' && ticket.status !== 'closed') {
          sendTicketStatusEmail(ticket.auth0UserId, ticketId, ticket.title, 'closed').catch(err => {
            log(`Failed to send closed notification for ticket #${ticketId}: ${err.message}`, 'email');
          });
        }
      }

      res.json({ ticket: updatedTicket });
    } catch (error: any) {
      log(`Error updating ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to update ticket' });
    }
  });

  // Close a ticket (admin)
  app.post('/api/admin/tickets/:id/close', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const updatedTicket = await dbStorage.closeTicket(ticketId);
      log(`Ticket #${ticketId} closed by admin ${req.userSession!.email}`, 'support');

      // Send email notification to user (only for registered users)
      if (ticket.auth0UserId) {
        sendTicketStatusEmail(ticket.auth0UserId, ticketId, ticket.title, 'closed').catch(err => {
          log(`Failed to send closed notification for ticket #${ticketId}: ${err.message}`, 'email');
        });
      }

      res.json({ ticket: updatedTicket });
    } catch (error: any) {
      log(`Error closing ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to close ticket' });
    }
  });

  // Reopen a ticket (admin)
  app.post('/api/admin/tickets/:id/reopen', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const updatedTicket = await dbStorage.reopenTicket(ticketId);
      log(`Ticket #${ticketId} reopened by admin ${req.userSession!.email}`, 'support');
      res.json({ ticket: updatedTicket });
    } catch (error: any) {
      log(`Error reopening ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to reopen ticket' });
    }
  });

  // Delete a ticket (admin)
  app.delete('/api/admin/tickets/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const ticket = await dbStorage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      await dbStorage.deleteTicket(ticketId);
      log(`Ticket #${ticketId} deleted by admin ${req.userSession!.email}`, 'support');
      res.json({ success: true });
    } catch (error: any) {
      log(`Error deleting ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to delete ticket' });
    }
  });

  // ==========================================
  // FEEDBACK / BUG REPORT
  // ==========================================

  // Submit a bug report (authenticated users only, rate limited to 1 per 90 seconds)
  app.post('/api/feedback/bug-report', authMiddleware, bugReportRateLimiter, async (req, res) => {
    try {
      const { description, currentUrl, appVersion, userAgent } = req.body;

      // Validate required fields
      if (!description || typeof description !== 'string') {
        return res.status(400).json({ error: 'Description is required' });
      }

      // Sanitize and limit description length
      const sanitizedDescription = description.trim().slice(0, 2000);
      if (sanitizedDescription.length < 10) {
        return res.status(400).json({ error: 'Please provide a more detailed description (at least 10 characters)' });
      }

      const userEmail = req.userSession!.email;
      const userName = req.userSession!.name || null;

      // Send bug report email
      const result = await sendBugReportEmail(
        sanitizedDescription,
        userEmail,
        userName,
        userAgent || 'Unknown',
        currentUrl || 'Unknown',
        appVersion || 'Unknown'
      );

      if (!result.success) {
        log(`Failed to send bug report from ${userEmail}: ${result.error}`, 'api');
        return res.status(500).json({ error: 'Failed to send bug report. Please try again later.' });
      }

      log(`Bug report submitted by ${userEmail}`, 'api');
      res.json({ success: true, message: 'Bug report submitted successfully' });
    } catch (error: any) {
      log(`Error submitting bug report: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to submit bug report' });
    }
  });

  return httpServer;
}
