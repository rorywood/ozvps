import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createServer, type Server } from "http";
import crypto, { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { virtfusionClient, VirtFusionTimeoutError } from "./virtfusion";
import { storage, dbStorage } from "./storage";
import { db } from "./db";
import { plans, serverBilling, billingLedger } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createServerBilling, retryUnpaidServers, getServerBillingStatus, getUpcomingCharges, getBillingLedger, runBillingJob } from "./billing";
import { auth0Client } from "./auth0";
import { loginSchema, registerSchema, serverNameSchema, reinstallSchema, SESSION_REVOKE_REASONS, createTicketSchema, ticketMessageSchema, adminTicketUpdateSchema, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, type TicketStatus, type TicketPriority, type TicketCategory } from "@shared/schema";
import { log } from "./index";
import { captureException, isSentryEnabled } from "./sentry";
import { validateServerName } from "./content-filter";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { recordFailedLogin, clearFailedLogins, isAccountLocked, getProgressiveDelay, verifyHmacSignature, isIpBlocked, getBlockedEntries, adminUnblock, adminUnblockEmail, adminClearAllRateLimits } from "./security";
import { encryptSecret, decryptSecret, isEncrypted, hashBackupCode, verifyBackupCode, generateBackupCodes } from "./crypto";
import { sendPasswordResetEmail, sendPasswordChangedEmail, sendServerCredentialsEmail, sendServerReinstallEmail } from "./email";

// Helper to get client IP from request
function getClientIp(req: any): string {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
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
import { authenticator } from 'otplib';

// Configure authenticator with secure defaults
authenticator.options = {
  window: 1, // Allow codes from ±30 seconds to handle time drift
  digits: 6,
  step: 30,
  algorithm: 'sha1',
};

function totpGenerateSecret(): string {
  return authenticator.generateSecret();
}

function totpVerify(token: string, secret: string): boolean {
  try {
    // SECURITY: window: 1 allows codes from ±30 seconds to handle time drift
    // This is a balance between security (smaller window = less attack surface)
    // and usability (allow for reasonable clock drift between client and server)
    return authenticator.verify({ token, secret });
  } catch (error) {
    console.error('TOTP verification error:', error);
    return false;
  }
}

function totpGenerateURI(email: string, secret: string, issuer: string = 'OzVPS'): string {
  return authenticator.keyuri(email, issuer, secret);
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

  // Skip CSRF for login/register (no session yet)
  if (req.originalUrl === '/api/auth/login' ||
      req.originalUrl === '/api/auth/register' ||
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

    // Check if user is blocked
    if (session.auth0UserId) {
      const userFlags = await storage.getUserFlags(session.auth0UserId);
      if (userFlags?.blocked) {
        // Revoke the session and return blocked error
        await storage.revokeSessionsByAuth0UserId(session.auth0UserId, SESSION_REVOKE_REASONS.USER_BLOCKED);
        res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
        return res.status(401).json({ 
          error: 'Your account has been suspended. Please contact support.',
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

  if (!req.userSession.emailVerified) {
    return res.status(403).json({
      error: 'Email verification required. Please verify your email address before performing this action.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
}

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

  // Rate limiters for sensitive endpoints
  const mfaRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: { error: 'Too many 2FA attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Rate limit by IP + user ID if available
      const ip = getClientIp(req);
      const userId = (req as any).userSession?.auth0UserId || '';
      return `${ip}:${userId}`;
    },
  });

  const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per window
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
  });

  const deploymentRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3, // 3 deployments per minute
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

  // Apply CSRF protection to all API routes
  app.use('/api', csrfProtection);

  // System health check (public)
  app.get('/api/health', async (req, res) => {
    try {
      const connectionStatus = await virtfusionClient.getConnectionStatus();
      if (!connectionStatus.connected) {
        // Log the actual error type for admins
        log(`Health check failed: VirtFusion ${connectionStatus.errorType || 'unknown error'}`, 'api');

        // Return generic error to users (don't expose license/config details)
        return res.status(503).json({
          status: 'error',
          errorCode: 'VF_API_UNAVAILABLE',
          message: 'Server management system is temporarily unavailable. Please try again later.'
        });
      }
      res.json({ status: 'ok' });
    } catch (error: any) {
      log(`Health check error: ${error.message}`, 'api');
      res.status(503).json({
        status: 'error',
        errorCode: 'SYSTEM_ERROR',
        message: 'System health check failed'
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
  app.post('/api/auth/register', async (req, res) => {
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
      const existingUser = await auth0Client.getUserByEmail(email);
      if (existingUser) {
        log(`Registration blocked: email ${email} already exists in Auth0`, 'auth');
        return res.status(400).json({ error: 'An account with this email already exists. Please sign in instead.' });
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
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Check if user exists in Auth0
      const user = await auth0Client.getUserByEmail(email);

      // Always return success message to prevent email enumeration
      // But only send email if user exists
      if (user) {
        // Create password reset token
        const resetToken = await dbStorage.createPasswordResetToken(email);

        // Build reset URL
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        const resetLink = `${baseUrl}/reset-password?token=${resetToken.token}`;

        // Send password reset email
        const emailResult = await sendPasswordResetEmail(email, resetLink, 30);

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
  app.post('/api/auth/reset-password', async (req, res) => {
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
      const { totpToken, backupCode } = req.body;
      const is2FAStep = !!(totpToken || backupCode);

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

      // Check if user exists in Auth0 first
      const existingUser = await auth0Client.getUserByEmail(email);

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

        // If user doesn't exist, return a specific code for the frontend
        if (!existingUser) {
          return res.status(401).json({
            error: 'No account found with this email address',
            code: 'USER_NOT_FOUND'
          });
        }

        // User exists but wrong password
        return res.status(401).json({
          error: 'Invalid password. Please try again.',
          code: 'INVALID_PASSWORD'
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

      // Check if 2FA is enabled for this user
      const tfa = await dbStorage.getTwoFactorAuth(auth0Result.user.user_id);
      if (tfa?.enabled) {
        // 2FA required - check if token was provided (totpToken/backupCode already extracted above)
        if (!totpToken && !backupCode) {
          // Return 2FA required status - client should prompt for code
          log(`2FA required for user: ${email}`, 'auth');
          return res.status(200).json({
            requires2FA: true,
            message: 'Two-factor authentication required',
          });
        }

        let tfaValid = false;

        // Decrypt the secret for TOTP verification
        let plaintextSecret: string;
        try {
          plaintextSecret = isEncrypted(tfa.secret) ? decryptSecret(tfa.secret) : tfa.secret;
          log(`Login 2FA: secret decrypted, length=${plaintextSecret.length}, wasEncrypted=${isEncrypted(tfa.secret)}`, 'security');
        } catch (decryptError: any) {
          log(`Login 2FA: decrypt failed: ${decryptError.message}`, 'security');
          return res.status(500).json({ error: 'Authentication error. Please contact support.' });
        }

        // Try TOTP token first
        if (totpToken) {
          log(`Login 2FA: verifying TOTP token ${totpToken}`, 'security');
          tfaValid = totpVerify(totpToken, plaintextSecret);
          log(`Login 2FA: TOTP verification result=${tfaValid}`, 'security');
        }

        // If TOTP failed, try backup code
        if (!tfaValid && backupCode) {
          const backupCodes: string[] = tfa.backupCodes ? JSON.parse(tfa.backupCodes) : [];

          // Check each backup code with argon2 (or fallback to sha256 for legacy codes)
          for (let i = 0; i < backupCodes.length; i++) {
            const storedHash = backupCodes[i];
            // Check if it's an argon2 hash (starts with $argon2)
            if (storedHash.startsWith('$argon2')) {
              if (await verifyBackupCode(backupCode, storedHash)) {
                tfaValid = true;
                // Remove used backup code
                backupCodes.splice(i, 1);
                await dbStorage.updateTwoFactorBackupCodes(auth0Result.user.user_id, backupCodes);
                log(`Backup code used for 2FA login: ${email}`, 'security');
                break;
              }
            } else {
              // Legacy sha256 hash - check and migrate if valid
              const crypto = await import('crypto');
              const hashedInput = crypto.createHash('sha256').update(backupCode.toUpperCase()).digest('hex');
              if (hashedInput === storedHash) {
                tfaValid = true;
                // Remove used backup code
                backupCodes.splice(i, 1);
                await dbStorage.updateTwoFactorBackupCodes(auth0Result.user.user_id, backupCodes);
                log(`Legacy backup code used for 2FA login: ${email}`, 'security');
                break;
              }
            }
          }
        }

        if (!tfaValid) {
          await recordFailedLogin(email, clientIp);
          return res.status(401).json({ error: 'Invalid two-factor authentication code' });
        }

        // Update last used timestamp
        await dbStorage.updateTwoFactorLastUsed(auth0Result.user.user_id);
      }

      // Revoke any idle sessions first (sessions that exceeded 15 min idle timeout)
      await storage.revokeIdleSessions(auth0Result.user.user_id, IDLE_TIMEOUT_MS, SESSION_REVOKE_REASONS.IDLE_TIMEOUT);

      // Check if user already has an active session (strict single-session)
      const hasExistingSession = await storage.hasActiveSession(auth0Result.user.user_id, IDLE_TIMEOUT_MS);
      if (hasExistingSession) {
        log(`User ${email} already has an active session - login blocked`, 'auth');
        return res.status(403).json({ 
          error: 'You are already logged in from another location. Please log out there first or wait for your session to expire.',
          code: 'ALREADY_LOGGED_IN'
        });
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
        if (!recaptchaValid) {
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
        await storage.deleteSession(sessionId);
      } catch (error) {
        log(`Logout error: ${error}`, 'api');
      }
    }
    
    res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
    res.json({ success: true });
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

      // Check Auth0 for updated admin status and email verification (refreshes every call)
      let isAdmin = session.isAdmin ?? false;
      let emailVerified = session.emailVerified ?? false;
      if (session.auth0UserId) {
        try {
          // Check database override for email verification first
          log(`[/api/auth/me] Checking override for: ${session.auth0UserId}`, 'auth');
          const emailVerifiedOverride = await storage.getEmailVerifiedOverride(session.auth0UserId);
          log(`[/api/auth/me] Override result: ${emailVerifiedOverride}`, 'auth');

          const [currentAdminStatus, currentEmailVerifiedFromAuth0] = await Promise.all([
            auth0Client.isUserAdmin(session.auth0UserId),
            auth0Client.isEmailVerified(session.auth0UserId),
          ]);
          log(`[/api/auth/me] Auth0 emailVerified: ${currentEmailVerifiedFromAuth0}`, 'auth');

          // Email is verified if EITHER Auth0 says so OR we have a database override
          const currentEmailVerified = currentEmailVerifiedFromAuth0 || emailVerifiedOverride;
          log(`[/api/auth/me] Final emailVerified: ${currentEmailVerified}`, 'auth');

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

      res.json({
        user: {
          id: session.userId,
          email: session.email,
          name: session.name,
          virtFusionUserId: session.virtFusionUserId,
          extRelationId: session.extRelationId,
          isAdmin,
          emailVerified,
        },
      });
    } catch (error: any) {
      log(`Auth check error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Authentication check failed' });
    }
  });

  // Resend verification email - requires authentication
  app.post('/api/auth/resend-verification', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;

      // Check if already verified
      if (session.emailVerified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }

      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'User account not properly configured' });
      }

      const result = await auth0Client.resendVerificationEmail(session.auth0UserId);

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to send verification email' });
      }

      log(`Verification email resent for ${session.email}`, 'auth');
      res.json({ success: true, message: 'Verification email sent. Please check your inbox.' });
    } catch (error: any) {
      log(`Resend verification error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to send verification email' });
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
            const billingStatus = await getServerBillingStatus(server.id, req.userSession!.auth0UserId, server.uuid);

            return {
              ...server,
              bandwidthExceeded,
              billing: billingStatus ? {
                status: billingStatus.status,
                nextBillAt: billingStatus.nextBillAt,
                suspendAt: billingStatus.suspendAt,
                monthlyPriceCents: billingStatus.monthlyPriceCents,
                autoRenew: billingStatus.autoRenew,
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
      const [servers, cancellations, billingRecords] = await Promise.all([
        virtfusionClient.listServersWithStats(userId),
        dbStorage.getUserCancellations(session.auth0UserId!),
        dbStorage.getServerBillingByUser(session.auth0UserId!),
      ]);

      // Build cancellation map
      const activeCancellations = cancellations.filter(c => c.status === 'pending' || c.status === 'processing');
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
      const billingMap: Record<string, { status: string; nextBillAt?: Date; suspendAt?: Date | null; monthlyPriceCents?: number }> = {};
      for (const b of billingRecords) {
        billingMap[b.virtfusionServerId] = {
          status: b.status,
          nextBillAt: b.nextBillAt,
          suspendAt: b.suspendAt,
          monthlyPriceCents: b.monthlyPriceCents,
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
            const billingStatus = await getServerBillingStatus(server.id, session.auth0UserId, server.uuid);

            return {
              ...server,
              bandwidthExceeded,
              billing: billingStatus ? {
                status: billingStatus.status,
                nextBillAt: billingStatus.nextBillAt,
                suspendAt: billingStatus.suspendAt,
                monthlyPriceCents: billingStatus.monthlyPriceCents,
                autoRenew: billingStatus.autoRenew,
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
        billingStatus = await getServerBillingStatus(req.params.id, req.userSession!.auth0UserId, server.uuid);

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
                billingStatus = await getServerBillingStatus(req.params.id, req.userSession!.auth0UserId, server.uuid);
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
        } : null,
      });
    } catch (error: any) {
      log(`Error fetching server ${req.params.id}: ${error.message}`, 'api');
      return handleApiError(res, error, 'Unable to retrieve server details. Please try again.', 'getServer');
    }
  });

  app.post('/api/servers/:id/power', authMiddleware, requireEmailVerified, serverActionRateLimiter, async (req, res) => {
    try {
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

  app.post('/api/servers/:id/vnc/enable', authMiddleware, async (req, res) => {
    try {
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

  app.post('/api/servers/:id/vnc/disable', authMiddleware, async (req, res) => {
    try {
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
        return res.status(403).json({ error: 'Server is scheduled for deletion. Reinstall is disabled.' });
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
          req.userSession.email,
          hostname || server.name || `Server ${server.id}`,
          server.primaryIp,
          'root',
          result.password,
          selectedTemplate?.name || 'Linux'
        ).catch(() => {});  // Fire and forget
      }

      res.json({ success: true });
    } catch (error: any) {
      log(`Error reinstalling server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: error.message || 'Failed to reinstall server' });
    }
  });

  app.get('/api/servers/:id/build-status', authMiddleware, async (req, res) => {
    try {
      // CRITICAL FIX: Get build status FIRST to check if commissioned
      // This prevents caching stale data before we know to invalidate
      const buildStatus = await virtfusionClient.getServerBuildStatus(req.params.id);

      // If commissioned, invalidate cache BEFORE ownership check to prevent stale data
      if (buildStatus.commissioned === 3) {
        log(`Server ${req.params.id} is commissioned, invalidating cache BEFORE ownership check`, 'virtfusion');
        virtfusionClient.invalidateServerCache(req.params.id);
      }

      // Now do ownership check - will fetch fresh data if cache was invalidated
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      res.json(buildStatus);
    } catch (error: any) {
      log(`Error fetching build status for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch build status' });
    }
  });

  // Reset server password - security-sensitive endpoint with ownership verification
  app.post('/api/servers/:id/reset-password', authMiddleware, requireEmailVerified, serverActionRateLimiter, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. Password reset is disabled.' });
      }
      
      // Block password reset if server has a pending cancellation
      const pendingCancellation = await dbStorage.getCancellationByServerId(req.params.id, req.userSession!.auth0UserId!);
      if (pendingCancellation) {
        return res.status(403).json({ error: 'Server is scheduled for deletion. Password reset is disabled.' });
      }

      const result = await virtfusionClient.resetServerPassword(req.params.id);

      log(`[DEBUG] Password reset result for ${req.params.id}: ${JSON.stringify({ success: result.success, hasPassword: !!result.password, username: result.username })}`, 'api');

      if (!result.password) {
        log(`[ERROR] Password reset for ${req.params.id} succeeded but no password returned`, 'api');
        return res.status(500).json({ error: 'Password reset succeeded but no new password was returned' });
      }

      log(`Password reset completed for server ${req.params.id} by user ${req.userSession!.auth0UserId}`, 'api');
      const response = { success: true, password: result.password, username: result.username };
      log(`[DEBUG] Sending response: ${JSON.stringify({ success: true, hasPassword: !!result.password, username: result.username })}`, 'api');
      res.json(response);
    } catch (error: any) {
      log(`Error resetting password for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: error.message || 'Failed to reset server password' });
    }
  });

  // Server Cancellation endpoints
  
  // Get all pending cancellations for current user (for displaying badges on server list)
  app.get('/api/cancellations', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      const cancellations = await dbStorage.getUserCancellations(session.auth0UserId!);
      
      // Filter to return pending and processing cancellations (active deletions)
      const active = cancellations.filter(c => c.status === 'pending' || c.status === 'processing');
      
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
      }> = {};
      for (const b of billingRecords) {
        billingMap[b.virtfusionServerId] = {
          status: b.status,
          nextBillAt: b.nextBillAt,
          suspendAt: b.suspendAt,
          monthlyPriceCents: b.monthlyPriceCents,
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
      const { reason, mode = 'grace' } = req.body;
      
      // Validate mode
      if (mode !== 'grace' && mode !== 'immediate') {
        return res.status(400).json({ error: 'Invalid mode. Must be "grace" or "immediate"' });
      }
      
      // Verify server ownership
      const { server, error, status } = await getServerWithOwnershipCheck(serverId, session.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
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
        status: 'pending',
        scheduledDeletionAt,
        mode,
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
        
        return res.json({
          embedded: true,
          vnc: {
            wsUrl,
            password: vncAccess.password,
            ip: vncAccess.ip,
            port: vncAccess.port
          }
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

  app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      
      res.json({
        id: session.userId || session.id,
        email: session.email,
        name: session.name,
        virtFusionUserId: session.virtFusionUserId,
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
      
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      log(`Error changing password: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // ===========================================
  // TWO-FACTOR AUTHENTICATION ENDPOINTS
  // ===========================================

  // Get 2FA status for current user
  app.get('/api/user/2fa/status', authMiddleware, async (req, res) => {
    try {
      const session = req.userSession!;
      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'User not authenticated' });
      }

      const tfa = await dbStorage.getTwoFactorAuth(session.auth0UserId);

      res.json({
        enabled: tfa?.enabled || false,
        verifiedAt: tfa?.verifiedAt || null,
        lastUsedAt: tfa?.lastUsedAt || null,
      });
    } catch (error: any) {
      log(`Error getting 2FA status: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to get 2FA status' });
    }
  });

  // Begin 2FA setup - generate secret and QR code
  app.post('/api/user/2fa/setup', authMiddleware, mfaRateLimiter, async (req, res) => {
    try {
      const session = req.userSession!;
      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'User not authenticated' });
      }

      // Import QR code library
      const QRCode = await import('qrcode');

      // Check if 2FA is already enabled
      const existing = await dbStorage.getTwoFactorAuth(session.auth0UserId);
      if (existing?.enabled) {
        return res.status(400).json({ error: '2FA is already enabled. Disable it first to set up again.' });
      }

      // Generate a new secret
      const plaintextSecret = totpGenerateSecret();
      // Encrypt the secret for storage
      const encryptedSecret = encryptSecret(plaintextSecret);

      // Create or update the 2FA record with encrypted secret
      if (existing) {
        await dbStorage.updateTwoFactorAuth(session.auth0UserId, { secret: encryptedSecret, enabled: false });
      } else {
        await dbStorage.createTwoFactorAuth({
          auth0UserId: session.auth0UserId,
          secret: encryptedSecret,
          enabled: false,
        });
      }

      // Generate QR code URL using plaintext secret (user needs to scan it)
      const otpAuthUrl = totpGenerateURI(session.email, plaintextSecret);
      const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

      log(`2FA setup initiated for user ${session.email}`, 'security');

      res.json({
        secret: plaintextSecret, // Show plaintext to user for manual entry
        qrCode: qrCodeDataUrl,
        otpAuthUrl,
      });
    } catch (error: any) {
      log(`Error setting up 2FA: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to set up 2FA' });
    }
  });

  // Enable 2FA after verifying token
  app.post('/api/user/2fa/enable', authMiddleware, mfaRateLimiter, async (req, res) => {
    try {
      const session = req.userSession!;
      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'User not authenticated' });
      }

      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      // Get the pending 2FA setup
      const tfa = await dbStorage.getTwoFactorAuth(session.auth0UserId);
      if (!tfa) {
        return res.status(400).json({ error: 'Please set up 2FA first by calling /api/user/2fa/setup' });
      }

      if (tfa.enabled) {
        return res.status(400).json({ error: '2FA is already enabled' });
      }

      // Decrypt the secret for verification
      let plaintextSecret: string;
      try {
        plaintextSecret = isEncrypted(tfa.secret) ? decryptSecret(tfa.secret) : tfa.secret;
        log(`2FA enable: decrypted secret length=${plaintextSecret.length}, encrypted=${isEncrypted(tfa.secret)}`, 'security');
      } catch (decryptError: any) {
        log(`2FA enable: failed to decrypt secret: ${decryptError.message}`, 'security');
        return res.status(500).json({ error: 'Failed to verify 2FA. Please try setting up again.' });
      }

      // Verify the token
      log(`2FA enable: verifying token ${token} against secret`, 'security');
      const isValid = totpVerify(token, plaintextSecret);
      log(`2FA enable: verification result=${isValid}`, 'security');
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid verification code. Please try again.' });
      }

      // Generate backup codes with argon2 hashing
      const { codes: backupCodes, hashes: hashedBackupCodes } = await generateBackupCodes(10);

      // Enable 2FA with backup codes
      await dbStorage.enableTwoFactorAuth(session.auth0UserId, hashedBackupCodes);

      log(`2FA enabled for user ${session.email}`, 'security');

      res.json({
        success: true,
        backupCodes, // Return plaintext codes only once
        message: '2FA has been enabled. Please save your backup codes in a safe place.',
      });
    } catch (error: any) {
      log(`Error enabling 2FA: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to enable 2FA' });
    }
  });

  // Disable 2FA
  app.post('/api/user/2fa/disable', authMiddleware, mfaRateLimiter, async (req, res) => {
    try {
      const session = req.userSession!;
      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'User not authenticated' });
      }

      const { token, password } = req.body;

      // Require either a valid 2FA token or password
      if (!token && !password) {
        return res.status(400).json({ error: 'Either 2FA token or password is required' });
      }

      const tfa = await dbStorage.getTwoFactorAuth(session.auth0UserId);
      if (!tfa?.enabled) {
        return res.status(400).json({ error: '2FA is not enabled' });
      }

      // Decrypt the secret for verification
      const plaintextSecret = isEncrypted(tfa.secret) ? decryptSecret(tfa.secret) : tfa.secret;

      // If token is provided, verify it
      if (token) {
        const isValid = totpVerify(token, plaintextSecret);
        if (!isValid) {
          return res.status(400).json({ error: 'Invalid verification code' });
        }
      } else if (password) {
        // Verify password
        const authResult = await auth0Client.authenticateUser(session.email, password);
        if (!authResult.success) {
          return res.status(400).json({ error: 'Invalid password' });
        }
      }

      await dbStorage.disableTwoFactorAuth(session.auth0UserId);
      log(`2FA disabled for user ${session.email}`, 'security');

      res.json({ success: true, message: '2FA has been disabled' });
    } catch (error: any) {
      log(`Error disabling 2FA: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to disable 2FA' });
    }
  });

  // Generate new backup codes
  app.post('/api/user/2fa/backup-codes', authMiddleware, mfaRateLimiter, async (req, res) => {
    try {
      const session = req.userSession!;
      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'User not authenticated' });
      }

      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: '2FA token is required' });
      }

      const tfa = await dbStorage.getTwoFactorAuth(session.auth0UserId);
      if (!tfa?.enabled) {
        return res.status(400).json({ error: '2FA is not enabled' });
      }

      // Decrypt the secret for verification
      const plaintextSecret = isEncrypted(tfa.secret) ? decryptSecret(tfa.secret) : tfa.secret;

      // Verify the token
      const isValid = totpVerify(token, plaintextSecret);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // Generate new backup codes with argon2 hashing
      const { codes: backupCodes, hashes: hashedBackupCodes } = await generateBackupCodes(10);

      await dbStorage.updateTwoFactorBackupCodes(session.auth0UserId, hashedBackupCodes);
      log(`New backup codes generated for user ${session.email}`, 'security');

      res.json({
        success: true,
        backupCodes,
        message: 'New backup codes generated. Please save them in a safe place.',
      });
    } catch (error: any) {
      log(`Error generating backup codes: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to generate backup codes' });
    }
  });

  app.post('/api/admin/block-user', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const { auth0UserId, blocked, reason } = req.body;
      
      if (!auth0UserId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      await storage.setUserBlocked(auth0UserId, blocked, reason);
      
      if (blocked) {
        await storage.revokeSessionsByAuth0UserId(auth0UserId, SESSION_REVOKE_REASONS.USER_BLOCKED);
        log(`User ${auth0UserId} blocked and sessions revoked: ${reason || 'No reason provided'}`, 'admin');
      } else {
        log(`User ${auth0UserId} unblocked`, 'admin');
      }
      
      res.json({ success: true });
    } catch (error: any) {
      log(`Error blocking user: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to update user status' });
    }
  });

  // Admin: Get all wallets
  app.get('/api/admin/wallets', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const allWallets = await dbStorage.getAllWallets();
      res.json({ wallets: allWallets });
    } catch (error: any) {
      log(`Error fetching wallets: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch wallets' });
    }
  });

  // Admin: Adjust wallet balance
  const MAX_ADJUSTMENT_CENTS = 1000000; // $10,000 max per adjustment
  const walletAdjustSchema = z.object({
    auth0UserId: z.string().min(1, 'User ID is required'),
    amountCents: z.number().int()
      .refine(val => val !== 0, 'Amount cannot be zero')
      .refine(val => Math.abs(val) <= MAX_ADJUSTMENT_CENTS, `Adjustment cannot exceed $${(MAX_ADJUSTMENT_CENTS / 100).toLocaleString()}`),
    reason: z.string().min(3, 'Reason must be at least 3 characters').max(500, 'Reason too long'),
  });

  app.post('/api/admin/wallet/adjust', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const parsed = walletAdjustSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' });
      }

      const { auth0UserId, amountCents, reason } = parsed.data;

      // Verify the user exists in Auth0 before adjusting
      const userExists = await auth0Client.userExists(auth0UserId);
      if (!userExists) {
        return res.status(404).json({ error: 'User not found in Auth0' });
      }

      const result = await dbStorage.adjustWalletBalance(
        auth0UserId,
        amountCents,
        reason.trim(),
        req.userSession.email
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
              admin_email: req.userSession.email,
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

      log(`Admin ${req.userSession.email} adjusted wallet for ${auth0UserId}: ${amountCents > 0 ? '+' : ''}${amountCents} cents (${reason})`, 'admin');
      res.json({ success: true, wallet: result.wallet });
    } catch (error: any) {
      log(`Error adjusting wallet: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to adjust wallet' });
    }
  });

  // Admin: Search users by email
  app.get('/api/admin/users/search', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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
  app.get('/api/admin/users/:auth0UserId/transactions', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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

  app.post('/api/admin/link-virtfusion', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const result = linkVirtfusionSchema.safeParse(req.body);
      if (!result.success) {
        const errorMessages = result.error.errors.map(e => e.message).join(', ');
        return res.status(400).json({ error: errorMessages });
      }

      const { auth0UserId, oldExtRelationId } = result.data;
      log(`Admin ${req.userSession.email} linking VirtFusion user (extRelationId: ${oldExtRelationId}) to Auth0 user ${auth0UserId}`, 'admin');

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
  app.get('/api/admin/hypervisor-groups', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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

  app.post('/api/admin/verify-email', authMiddleware, async (req, res) => {
    log(`========== ADMIN VERIFY EMAIL START ==========`, 'admin');
    log(`Request body: ${JSON.stringify(req.body)}`, 'admin');
    log(`User session: ${JSON.stringify({ email: req.userSession?.email, isAdmin: req.userSession?.isAdmin })}`, 'admin');

    try {
      if (!req.userSession?.isAdmin) {
        log(`REJECTED: User ${req.userSession?.email} is not admin`, 'admin');
        return res.status(403).json({ error: 'Admin access required' });
      }

      const result = verifyEmailSchema.safeParse(req.body);
      if (!result.success) {
        const errorMessages = result.error.errors.map(e => e.message).join(', ');
        log(`REJECTED: Validation failed - ${errorMessages}`, 'admin');
        return res.status(400).json({ error: errorMessages });
      }

      const { auth0UserId } = result.data;
      log(`Admin ${req.userSession.email} manually verifying email for Auth0 user ${auth0UserId}`, 'admin');

      // Set email verified override in our database (bypasses Auth0)
      log(`Setting email verified override in database...`, 'admin');
      await storage.setEmailVerifiedOverride(auth0UserId, true, req.userSession.email);
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
        adminAuth0UserId: req.userSession.auth0UserId!,
        adminEmail: req.userSession.email,
        action: 'EMAIL_VERIFIED_MANUALLY',
        targetType: 'user',
        targetId: auth0UserId,
        reason: `Admin manually verified email for user ${auth0UserId} (database override)`,
        status: 'success',
      });

      log(`SUCCESS: Admin ${req.userSession.email} verified email for user ${auth0UserId}`, 'admin');
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
      res.status(500).json({ error: `Failed to verify email: ${error.message}` });
    }
  });

  // User: Resend verification email
  app.post('/api/auth/resend-verification', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.auth0UserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      log(`User ${req.userSession.email} requesting verification email resend`, 'auth');

      // Call Auth0 to resend verification email
      const result = await auth0Client.resendVerificationEmail(req.userSession.auth0UserId);

      if (!result.success) {
        log(`Failed to resend verification email for ${req.userSession.email}: ${result.error}`, 'auth');
        return res.status(400).json({ error: result.error || 'Failed to send verification email' });
      }

      log(`Verification email resent successfully for ${req.userSession.email}`, 'auth');
      res.json({ success: true, message: 'Verification email sent successfully' });
    } catch (error: any) {
      log(`Resend verification email error: ${error.message}`, 'auth');
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  });

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
  app.get('/api/admin/security/recaptcha', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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
  app.post('/api/admin/security/recaptcha', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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

      log(`Admin ${req.userSession.email} updated reCAPTCHA settings: enabled=${enabled}, version=${version}`, 'admin');
      res.json({ success: true });
    } catch (error: any) {
      log(`Error updating reCAPTCHA settings: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to update reCAPTCHA settings' });
    }
  });

  // Admin: Test reCAPTCHA configuration
  app.post('/api/admin/security/recaptcha/test', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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
  
  // Middleware to require admin access - chains with authMiddleware
  const requireAdmin: RequestHandler = (req, res, next) => {
    if (!req.userSession?.isAdmin) {
      log(`Unauthorized admin access attempt by ${req.userSession?.email || 'unknown'}`, 'security');
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };
  
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
      const { reason } = req.body;
      
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for delete action' });
      }
      
      const success = await virtfusionClient.deleteServer(parseInt(serverId));
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
      const { newOwnerId, reason } = req.body;
      
      if (!newOwnerId) {
        return res.status(400).json({ error: 'New owner ID is required' });
      }
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for transfer action' });
      }
      
      const success = await virtfusionClient.transferServerOwnership(parseInt(serverId), newOwnerId);
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
      const hypervisor = await virtfusionClient.getHypervisor(parseInt(hypervisorId));
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
      const user = await virtfusionClient.getUserById(parseInt(userId));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const servers = await virtfusionClient.listServersByUserId(parseInt(userId));
      res.json({ user, servers });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // Delete VirtFusion user (admin) - requires reason
  app.delete('/api/admin/vf/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason, deleteServers } = req.body;
      
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for delete action' });
      }
      
      if (deleteServers) {
        const result = await virtfusionClient.cleanupUserAndServers(parseInt(userId));
        await auditLog(req, 'user.delete_with_servers', 'user', userId, null, { deleteServers: true, serversDeleted: result.serversDeleted }, result.success ? 'success' : 'failure', result.errors.join(', '), reason);
        res.json({ success: result.success, serversDeleted: result.serversDeleted, errors: result.errors });
      } else {
        const success = await virtfusionClient.deleteUserById(parseInt(userId));
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
      await dbStorage.createAdminAuditLog({
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
      const templates = await virtfusionClient.getOsTemplatesForPackage(parseInt(packageId));
      res.json({ templates });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  });

  // Get admin audit logs
  app.get('/api/admin/audit-logs', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
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
          const server = await virtfusionClient.getServer(parseInt(record.virtfusionServerId));
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
        updates.status = status;
        log(`Admin ${req.userSession?.email} updated billing ${billingId} status to ${status}`, 'admin');
      }

      if (suspendAt !== undefined) {
        updates.suspendAt = suspendAt ? new Date(suspendAt) : null;
        log(`Admin ${req.userSession?.email} updated billing ${billingId} suspendAt to ${suspendAt}`, 'admin');
      }

      const [updated] = await db.update(serverBilling)
        .set(updates)
        .where(eq(serverBilling.id, billingId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Billing record not found' });
      }

      res.json({ success: true, record: updated });
    } catch (error: any) {
      log(`Admin: Error updating billing record: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to update billing record' });
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

      // Check email verification - session value OR database override
      let emailVerified = req.userSession!.emailVerified ?? false;
      log(`[/api/me] User: ${req.userSession!.email}, auth0UserId: ${auth0UserId}`, 'api');
      log(`[/api/me] Session emailVerified: ${req.userSession!.emailVerified}`, 'api');

      if (!emailVerified) {
        const override = await storage.getEmailVerifiedOverride(auth0UserId);
        log(`[/api/me] Database override: ${override}`, 'api');
        if (override) {
          emailVerified = true;
        }
      }
      log(`[/api/me] Final emailVerified: ${emailVerified}`, 'api');

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
      res.json({ plans: allPlans });
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

  // Get Stripe configuration status (check Replit connector)
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
          fingerprint: pm.card?.fingerprint,
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
        log(`Rejected duplicate card for ${auth0UserId} - fingerprint ${newFingerprint}`, 'stripe');
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

      log(`Validated and attached new card for ${auth0UserId} - fingerprint ${newFingerprint}`, 'stripe');
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
        if (wallet?.stripeCustomerId) {
          const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
          if (pm.customer !== wallet.stripeCustomerId) {
            return res.status(403).json({ error: 'Payment method does not belong to this account' });
          }
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
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || req.headers.host}`;
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
      const { wallet, stripeCustomerId } = await ensureStripeCustomer({
        auth0UserId: req.userSession!.auth0UserId,
        email: req.userSession!.email,
        name: req.userSession!.name,
        userId: req.userSession!.userId,
      });
      
      res.json({ 
        wallet,
        hasStripeCustomer: !!stripeCustomerId 
      });
    } catch (error: any) {
      if (error instanceof StripeCustomerError) {
        return res.status(error.httpStatus).json({ 
          error: error.message, 
          code: error.code 
        });
      }
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
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || req.headers.host}`;
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
        res.json({
          success: true,
          newBalanceCents: updatedWallet?.balanceCents || 0,
          chargedAmountCents: amountCents,
        });
      } else if (paymentIntent.status === 'requires_action') {
        // Card requires 3D Secure or additional authentication
        // Return client_secret so frontend can either handle on-session or fallback
        log(`[Direct Topup] Payment requires action: ${paymentIntent.status}`, 'stripe');
        res.status(402).json({
          error: 'This card requires additional authentication.',
          requiresAction: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        });
      } else {
        log(`[Direct Topup] Payment failed with status: ${paymentIntent.status}`, 'stripe');
        res.status(400).json({ error: 'Payment failed. Please try again or use a different card.' });
      }
    } catch (error: any) {
      log(`[Direct Topup] Error caught: ${error.message}`, 'api');
      log(`[Direct Topup] Error type: ${error.type}, code: ${error.code}`, 'api');
      log(`[Direct Topup] Full error: ${JSON.stringify(error, null, 2)}`, 'api');

      // Handle Stripe customer errors
      if (error instanceof StripeCustomerError) {
        return res.status(error.httpStatus).json({
          error: error.message,
          code: error.code
        });
      }
      // Handle specific Stripe errors
      if (error.type === 'StripeCardError') {
        log(`[Direct Topup] Card error: ${error.message}`, 'stripe');
        res.status(400).json({ error: error.message || 'Your card was declined. Please try a different card.' });
      } else if (error.code === 'authentication_required') {
        log(`[Direct Topup] Authentication required`, 'stripe');
        res.status(402).json({
          error: 'This card requires additional authentication. Please use the standard top-up flow.',
          requiresAction: true,
        });
      } else {
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

      // DEBUG: Log template names to verify what VirtFusion returns
      if (templates && Array.isArray(templates)) {
        const templateNames = templates.flatMap((group: any) =>
          group.templates ? group.templates.map((t: any) => t.name) : []
        );
        log(`[TEMPLATES DEBUG] VirtFusion returned ${templateNames.length} templates for package ${plan.virtfusionPackageId}: ${templateNames.join(', ')}`, 'api');
      }

      res.json(templates || []);
    } catch (error: any) {
      log(`Error fetching templates for plan ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch OS templates' });
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
  });

  app.post('/api/deploy', authMiddleware, requireEmailVerified, deploymentRateLimiter, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      const virtFusionUserId = req.userSession!.virtFusionUserId;
      const extRelationId = req.userSession!.extRelationId;

      if (!auth0UserId || !virtFusionUserId || !extRelationId) {
        return res.status(400).json({ error: 'Invalid session state' });
      }

      const result = deploySchema.safeParse(req.body);
      if (!result.success) {
        const errorMessages = result.error.errors.map(e => e.message).join(', ');
        return res.status(400).json({ error: `Invalid deploy request: ${errorMessages}` });
      }

      const { planId, osId, hostname, locationCode } = result.data;

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

      // Debit wallet and create order atomically
      // Use provided hostname or generate a default one
      const serverHostname = hostname || `vps-${Date.now().toString(36)}`;
      const deployResult = await dbStorage.createDeployWithDebit(
        auth0UserId,
        planId,
        plan.priceMonthly,
        serverHostname,
        plan.name
      );

      if (!deployResult.success || !deployResult.order) {
        return res.status(400).json({ error: deployResult.error || 'Failed to create deploy order' });
      }

      const order = deployResult.order;

      // Update order to provisioning status
      await dbStorage.updateDeployOrder(order.id, { status: 'provisioning' });

      // Provision server via VirtFusion
      let serverResult;
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
          log(`Sending credentials email to ${req.userSession.email} for server ${emailServerName}`, 'api');
          sendServerCredentialsEmail(
            req.userSession.email,
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
        await dbStorage.refundToWallet(auth0UserId, plan.priceMonthly, {
          reason: 'provisioning_failed',
          orderId: order.id,
        });

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
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

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
      res.status(201).json({ ticket });
    } catch (error: any) {
      log(`Error creating ticket: ${error.message}`, 'api');
      // Return detailed error for debugging - check if it's a DB error
      const errorMessage = error.message?.includes('relation') || error.message?.includes('does not exist')
        ? 'Database tables not found. Please run: npm run db:push'
        : error.message || 'Failed to create ticket';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get a specific ticket with messages
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
  // SUPPORT TICKET ROUTES - ADMIN FACING
  // ==========================================

  // Get admin ticket counts (for notification badge)
  app.get('/api/admin/tickets/counts', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const counts = await dbStorage.getAdminTicketCounts();
      res.json(counts);
    } catch (error: any) {
      log(`Error fetching admin ticket counts: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch ticket counts' });
    }
  });

  // List all tickets (admin)
  app.get('/api/admin/tickets', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      // Parse query params
      let status: TicketStatus | TicketStatus[] | undefined;
      const statusParam = req.query.status as string | undefined;
      if (statusParam) {
        if (statusParam.includes(',')) {
          status = statusParam.split(',') as TicketStatus[];
        } else {
          status = statusParam as TicketStatus;
        }
      }

      const category = req.query.category as TicketCategory | undefined;
      const priority = req.query.priority as TicketPriority | undefined;
      const auth0UserId = req.query.user as string | undefined;
      const virtfusionServerId = req.query.server as string | undefined;
      const assignedAdminId = req.query.assigned === 'null' ? null : req.query.assigned as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sortBy as 'lastMessageAt' | 'priority' | 'createdAt') || 'lastMessageAt';
      const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

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
  app.get('/api/admin/tickets/:id', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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

      // Get user info from wallet
      const wallet = await dbStorage.getWallet(ticket.auth0UserId);

      res.json({ ticket, messages, server, user: wallet ? { email: ticket.auth0UserId } : null });
    } catch (error: any) {
      log(`Error fetching ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  });

  // Reply to a ticket (admin) with optional status change
  app.post('/api/admin/tickets/:id/messages', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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

      // Create the message
      const message = await dbStorage.createTicketMessage({
        ticketId,
        authorType: 'admin',
        authorId: auth0UserId,
        authorEmail: req.userSession!.email,
        authorName: req.userSession!.name || null,
        message: parseResult.data.message,
      });

      // Update ticket status - default to waiting_user when admin replies
      const newStatus = (req.body.status as TicketStatus) || 'waiting_user';
      await dbStorage.updateTicket(ticketId, { status: newStatus });

      log(`Admin reply added to ticket #${ticketId} by ${req.userSession!.email}`, 'support');
      res.status(201).json({ message });
    } catch (error: any) {
      log(`Error replying to ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to send reply' });
    }
  });

  // Update ticket metadata (admin)
  app.patch('/api/admin/tickets/:id', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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
      res.json({ ticket: updatedTicket });
    } catch (error: any) {
      log(`Error updating ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to update ticket' });
    }
  });

  // Close a ticket (admin)
  app.post('/api/admin/tickets/:id/close', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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
      res.json({ ticket: updatedTicket });
    } catch (error: any) {
      log(`Error closing ticket: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to close ticket' });
    }
  });

  // Reopen a ticket (admin)
  app.post('/api/admin/tickets/:id/reopen', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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
  app.delete('/api/admin/tickets/:id', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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

  return httpServer;
}
