import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { virtfusionClient } from "./virtfusion";
import { storage, dbStorage } from "./storage";
import { auth0Client } from "./auth0";
import { loginSchema, registerSchema, serverNameSchema, reinstallSchema, SESSION_REVOKE_REASONS } from "@shared/schema";
import { log } from "./index";
import { validateServerName } from "./content-filter";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { recordFailedLogin, clearFailedLogins, isAccountLocked, getProgressiveDelay, verifyHmacSignature } from "./security";

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
      };
    }
  }
}

const SESSION_COOKIE = 'ozvps_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// CSRF protection middleware - validates Origin header for mutating requests
function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only check mutating methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for webhook endpoints (they use their own auth)
  if (req.originalUrl.startsWith('/api/hooks/') || req.originalUrl.startsWith('/api/stripe/webhook')) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;

  // In development, allow requests without origin (e.g., from tools like curl)
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Validate origin or referer matches the host
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        log(`CSRF blocked: Origin ${origin} doesn't match host ${host}`, 'security');
        return res.status(403).json({ error: 'Invalid request origin' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid request origin' });
    }
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host !== host) {
        log(`CSRF blocked: Referer ${referer} doesn't match host ${host}`, 'security');
        return res.status(403).json({ error: 'Invalid request origin' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid request origin' });
    }
  } else {
    // No origin or referer - block in production
    log(`CSRF blocked: No origin or referer header`, 'security');
    return res.status(403).json({ error: 'Missing request origin' });
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
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteSession(sessionId);
      res.clearCookie(SESSION_COOKIE);
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    // Check if session was revoked
    if (session.revokedAt) {
      res.clearCookie(SESSION_COOKIE);
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
    };

    next();
  } catch (error) {
    log(`Auth middleware error: ${error}`, 'api');
    return res.status(500).json({ error: 'Authentication error' });
  }
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Apply CSRF protection to all API routes
  app.use('/api', csrfProtection);

  // System health check (public)
  app.get('/api/health', async (req, res) => {
    try {
      const isConnected = await virtfusionClient.validateConnection();
      if (!isConnected) {
        log('Health check failed: VirtFusion API unreachable', 'api');
        return res.status(503).json({ 
          status: 'error', 
          errorCode: 'VF_API_UNAVAILABLE',
          message: 'VirtFusion API is unreachable'
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

  // Seed plans from static config on startup (non-blocking)
  (async () => {
    try {
      const result = await dbStorage.seedPlansFromConfig();
      log(`Plans seeded: ${result.seeded} plans`, 'startup');
      if (result.errors.length > 0) {
        result.errors.forEach(err => log(`Plan seed error: ${err}`, 'startup'));
      }
    } catch (error: any) {
      log(`Failed to seed plans: ${error.message}`, 'startup');
    }
  })();

  // Auth endpoints (public)
  app.post('/api/auth/register', async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid registration data' });
      }

      const { email, password, name } = parsed.data;

      // Create user in Auth0
      const auth0Result = await auth0Client.createUser(email, password, name);
      if (!auth0Result.success || !auth0Result.user) {
        return res.status(400).json({ error: auth0Result.error || 'Failed to create account' });
      }

      // Create VirtFusion user
      const virtFusionUser = await virtfusionClient.findOrCreateUser(email, name || email.split('@')[0]);
      if (!virtFusionUser) {
        return res.status(500).json({ error: 'Failed to create account. Please try again or contact support.' });
      }

      // Store VirtFusion user ID in Auth0 metadata (no local database needed)
      const auth0UserId = `auth0|${auth0Result.user.user_id}`;
      await auth0Client.setVirtFusionUserId(auth0UserId, virtFusionUser.id);
      log(`Stored VirtFusion user ${virtFusionUser.id} in Auth0 metadata for ${auth0UserId}`, 'auth');

      // Create Stripe customer and wallet for the new user
      try {
        const stripe = await getUncachableStripeClient();
        const customer = await stripe.customers.create({
          email,
          name: name || undefined,
          metadata: {
            auth0UserId,
            virtfusion_user_id: String(virtFusionUser.id),
          },
        });
        
        // Create wallet with Stripe customer and VirtFusion user linked
        const wallet = await dbStorage.getOrCreateWallet(auth0UserId);
        await dbStorage.updateWalletStripeCustomerId(auth0UserId, customer.id);
        await dbStorage.updateWalletVirtFusionUserId(auth0UserId, virtFusionUser.id);
        log(`Created Stripe customer ${customer.id} for new user ${auth0UserId}`, 'stripe');
      } catch (stripeError: any) {
        // Non-fatal: user can still register, Stripe customer will be created on first top-up
        log(`Failed to create Stripe customer during registration: ${stripeError.message}`, 'stripe');
      }

      // Create local session
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      const session = await storage.createSession({
        visitorId: 0,
        virtFusionUserId: virtFusionUser.id,
        extRelationId: virtFusionUser.extRelationId,
        email: email,
        name: name || virtFusionUser.name,
        auth0UserId: auth0Result.user.user_id,
        expiresAt,
      });

      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: expiresAt,
      });

      res.status(201).json({
        user: {
          id: auth0Result.user.user_id,
          email: email,
          name: name || virtFusionUser.name,
        },
      });
    } catch (error: any) {
      log(`Registration error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid email or password format' });
      }

      const { email, password } = parsed.data;
      const { recaptchaToken } = req.body;

      // Check reCAPTCHA if enabled
      const recaptchaSettings = await dbStorage.getRecaptchaSettings();
      if (recaptchaSettings.enabled && recaptchaSettings.secretKey) {
        if (!recaptchaToken) {
          return res.status(400).json({ error: 'reCAPTCHA verification required' });
        }

        try {
          const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${encodeURIComponent(recaptchaSettings.secretKey)}&response=${encodeURIComponent(recaptchaToken)}`,
          });
          const verifyResult = await verifyResponse.json() as { success: boolean; 'error-codes'?: string[] };
          
          if (!verifyResult.success) {
            log(`reCAPTCHA verification failed: ${JSON.stringify(verifyResult['error-codes'])}`, 'security');
            return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
          }
        } catch (err: any) {
          log(`reCAPTCHA verification error: ${err.message}`, 'security');
          return res.status(500).json({ error: 'Failed to verify reCAPTCHA. Please try again.' });
        }
      }

      // Check if account is locked due to too many failed attempts
      const lockStatus = isAccountLocked(email);
      if (lockStatus.locked) {
        const remainingMins = Math.ceil((lockStatus.remainingMs || 0) / 60000);
        log(`Blocked login attempt for locked account: ${email}`, 'security');
        return res.status(429).json({ 
          error: `Account temporarily locked due to too many failed attempts. Try again in ${remainingMins} minutes.`,
          code: 'ACCOUNT_LOCKED'
        });
      }

      // Apply progressive delay based on failed attempts
      const delay = getProgressiveDelay(email);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Authenticate with Auth0
      const auth0Result = await auth0Client.authenticateUser(email, password);
      if (!auth0Result.success || !auth0Result.user) {
        recordFailedLogin(email);
        return res.status(401).json({ error: auth0Result.error || 'Invalid email or password' });
      }
      
      // Clear failed login attempts on successful auth
      clearFailedLogins(email);

      // Check if user is blocked
      const userFlags = await storage.getUserFlags(auth0Result.user.user_id);
      if (userFlags?.blocked) {
        log(`Blocked user attempted login: ${email}`, 'auth');
        return res.status(403).json({ 
          error: 'Your account has been suspended. Please contact support.',
          code: 'USER_BLOCKED'
        });
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
      const isAdmin = await auth0Client.isUserAdmin(auth0Result.user.user_id);
      if (isAdmin) {
        log(`Admin user logged in: ${email}`, 'auth');
      }

      // Create local session
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      const session = await storage.createSession({
        visitorId: 0,
        virtFusionUserId: virtFusionUserId ?? undefined,
        extRelationId: extRelationId ?? undefined,
        email: email,
        name: auth0Result.user.name,
        auth0UserId: auth0Result.user.user_id,
        isAdmin,
        expiresAt,
      });

      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: expiresAt,
      });

      res.json({
        user: {
          id: auth0Result.user.user_id,
          email: email,
          name: auth0Result.user.name,
          isAdmin,
        },
      });
    } catch (error: any) {
      log(`Login error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Login failed' });
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
        return res.status(401).json({ error: 'Session expired' });
      }

      // Check Auth0 for updated admin status (refreshes every call)
      let isAdmin = session.isAdmin ?? false;
      if (session.auth0UserId) {
        try {
          const currentAdminStatus = await auth0Client.isUserAdmin(session.auth0UserId);
          if (currentAdminStatus !== isAdmin) {
            log(`Admin status changed for ${session.email}: ${isAdmin} -> ${currentAdminStatus}`, 'auth');
            isAdmin = currentAdminStatus;
            // Update session with new admin status
            await storage.updateSession(sessionId, { isAdmin: currentAdminStatus });
          }
        } catch (err: any) {
          // If Auth0 check fails, use cached session value
          log(`Failed to refresh admin status from Auth0: ${err.message}`, 'auth');
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
        },
      });
    } catch (error: any) {
      log(`Auth check error: ${error.message}`, 'api');
      res.status(500).json({ error: 'Authentication check failed' });
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
      res.json(servers);
    } catch (error: any) {
      log(`Error fetching servers: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  });

  app.get('/api/servers/:id', authMiddleware, async (req, res) => {
    try {
      const server = await virtfusionClient.getServer(req.params.id);
      res.json(server);
    } catch (error: any) {
      log(`Error fetching server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch server' });
    }
  });

  app.post('/api/servers/:id/power', authMiddleware, async (req, res) => {
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
      res.status(500).json({ error: 'Failed to perform power action' });
    }
  });

  app.get('/api/servers/:id/metrics', authMiddleware, async (req, res) => {
    try {
      const metrics = await virtfusionClient.getServerStats(req.params.id);
      res.json(metrics || { cpu: [], ram: [], net: [] });
    } catch (error: any) {
      log(`Error fetching metrics for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  app.get('/api/servers/:id/stats', authMiddleware, async (req, res) => {
    try {
      const stats = await virtfusionClient.getServerLiveStats(req.params.id);
      res.json(stats || { cpu_usage: 0, ram_usage: 0, disk_usage: 0, net_in: 0, net_out: 0 });
    } catch (error: any) {
      log(`Error fetching live stats for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch live stats' });
    }
  });

  app.get('/api/servers/:id/traffic', authMiddleware, async (req, res) => {
    try {
      const traffic = await virtfusionClient.getServerTrafficHistory(req.params.id);
      res.json(traffic || []);
    } catch (error: any) {
      log(`Error fetching traffic for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch traffic data' });
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
      log(`Error updating server name for ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to update server name' });
    }
  });

  app.get('/api/servers/:id/vnc', authMiddleware, async (req, res) => {
    try {
      const vnc = await virtfusionClient.getVncDetails(req.params.id);
      if (!vnc) {
        return res.status(404).json({ error: 'VNC not available for this server' });
      }
      res.json(vnc);
    } catch (error: any) {
      log(`Error fetching VNC details for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch VNC details' });
    }
  });

  app.post('/api/servers/:id/vnc/enable', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. VNC access is disabled.' });
      }

      const vnc = await virtfusionClient.enableVnc(req.params.id);
      res.json(vnc);
    } catch (error: any) {
      log(`Error enabling VNC for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to enable VNC' });
    }
  });

  app.post('/api/servers/:id/vnc/disable', authMiddleware, async (req, res) => {
    try {
      const { server, error, status } = await getServerWithOwnershipCheck(req.params.id, req.userSession!.virtFusionUserId);
      if (!server) {
        return res.status(status || 403).json({ error: error || 'Access denied' });
      }

      if (server.suspended) {
        return res.status(403).json({ error: 'Server is suspended. VNC access is disabled.' });
      }

      const vnc = await virtfusionClient.disableVnc(req.params.id);
      res.json(vnc);
    } catch (error: any) {
      log(`Error disabling VNC for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to disable VNC' });
    }
  });

  app.get('/api/servers/:id/network', authMiddleware, async (req, res) => {
    try {
      const network = await virtfusionClient.getServerNetworkInfo(req.params.id);
      res.json(network || { interfaces: [] });
    } catch (error: any) {
      log(`Error fetching network info for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch network info' });
    }
  });

  app.get('/api/servers/:id/os-templates', authMiddleware, async (req, res) => {
    try {
      const templates = await virtfusionClient.getOsTemplates(req.params.id);
      res.json(templates || []);
    } catch (error: any) {
      log(`Error fetching OS templates for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch OS templates' });
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

  app.post('/api/servers/:id/reinstall', authMiddleware, async (req, res) => {
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
      
      if (templateGroups && Array.isArray(templateGroups)) {
        for (const group of templateGroups) {
          if (group.templates && Array.isArray(group.templates)) {
            const found = group.templates.some((t: any) => 
              String(t.id) === String(osId) || t.id === osId
            );
            if (found) {
              templateAllowed = true;
              break;
            }
          }
        }
      }
      
      if (!templateAllowed) {
        return res.status(403).json({ error: 'Selected OS template is not available for this server' });
      }

      const result = await virtfusionClient.reinstallServer(req.params.id, Number(osId), hostname);
      res.json({ success: true, data: result });
    } catch (error: any) {
      log(`Error reinstalling server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: error.message || 'Failed to reinstall server' });
    }
  });

  app.get('/api/servers/:id/build-status', authMiddleware, async (req, res) => {
    try {
      const status = await virtfusionClient.getServerBuildStatus(req.params.id);
      res.json(status);
    } catch (error: any) {
      log(`Error fetching build status for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch build status' });
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
      const billingMap: Record<string, { status: string; overdueSince: Date | null }> = {};
      for (const b of billingRecords) {
        billingMap[b.virtfusionServerId] = {
          status: b.status,
          overdueSince: b.overdueSince,
        };
      }
      
      res.json({ billing: billingMap });
    } catch (error: any) {
      log(`Error fetching server billing statuses: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch billing statuses' });
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
        log(`VNC access for server ${serverId}: ${JSON.stringify(vncAccess)}`, 'api');
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
      
      // Last fallback to direct VNC URL
      const consoleUrl = `${panelUrl}/server/${server.uuid}/vnc`;
      res.json({ url: consoleUrl });
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
      
      // Profile updates are managed through Auth0
      // For now, just return the current session data
      res.json({
        id: session.userId || session.id,
        email: session.email,
        name: session.name,
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
      const { newPassword } = req.body;
      
      if (!newPassword) {
        return res.status(400).json({ error: 'New password is required' });
      }
      
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      if (!session.auth0UserId) {
        return res.status(400).json({ error: 'Unable to change password. Please contact support.' });
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

  app.post('/api/admin/block-user', authMiddleware, async (req, res) => {
    try {
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
  const walletAdjustSchema = z.object({
    auth0UserId: z.string().min(1, 'User ID is required'),
    amountCents: z.number().int().refine(val => val !== 0, 'Amount cannot be zero'),
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

  // Get reCAPTCHA settings (admin only)
  app.get('/api/admin/security/recaptcha', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const settings = await dbStorage.getRecaptchaSettings();
      res.json({
        enabled: settings.enabled,
        siteKey: settings.siteKey || '',
        hasSecretKey: !!settings.secretKey,
      });
    } catch (error: any) {
      log(`Error fetching reCAPTCHA settings: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch reCAPTCHA settings' });
    }
  });

  // Update reCAPTCHA settings (admin only)
  app.post('/api/admin/security/recaptcha', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { siteKey, secretKey, enabled } = req.body;
      
      if (enabled && (!siteKey || !secretKey)) {
        return res.status(400).json({ error: 'Site key and secret key are required to enable reCAPTCHA' });
      }
      
      await dbStorage.updateRecaptchaSettings(
        siteKey || null,
        secretKey || null,
        !!enabled
      );
      
      log(`Admin updated reCAPTCHA settings: enabled=${enabled}`, 'admin');
      res.json({ success: true });
    } catch (error: any) {
      log(`Error updating reCAPTCHA settings: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to update reCAPTCHA settings' });
    }
  });

  // Get public reCAPTCHA config (for login page - only returns site key if enabled)
  app.get('/api/security/recaptcha-config', async (req, res) => {
    try {
      const settings = await dbStorage.getRecaptchaSettings();
      res.json({
        enabled: settings.enabled,
        siteKey: settings.enabled ? settings.siteKey : null,
      });
    } catch (error: any) {
      res.json({ enabled: false, siteKey: null });
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

  // Get all servers with owner info (admin)
  app.get('/api/admin/vf/servers', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const servers = await virtfusionClient.getAllServersWithOwners();
      res.json({ servers, total: servers.length });
    } catch (error: any) {
      log(`Admin: Error fetching all servers: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  });

  // Get server details (admin)
  app.get('/api/admin/vf/servers/:serverId', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
  app.post('/api/admin/vf/servers/:serverId/power/:action', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
  app.post('/api/admin/vf/servers/:serverId/suspend', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { serverId } = req.params;
      const { reason } = req.body;
      
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for suspend action' });
      }
      
      const success = await virtfusionClient.suspendServer(parseInt(serverId));
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
  app.post('/api/admin/vf/servers/:serverId/unsuspend', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { serverId } = req.params;
      const { reason } = req.body;
      
      const success = await virtfusionClient.unsuspendServer(parseInt(serverId));
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
  app.delete('/api/admin/vf/servers/:serverId', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
  app.post('/api/admin/vf/servers/:serverId/transfer', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
  app.get('/api/admin/vf/hypervisors', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const hypervisors = await virtfusionClient.getHypervisors();
      res.json({ hypervisors, total: hypervisors.length });
    } catch (error: any) {
      log(`Admin: Error fetching hypervisors: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch hypervisors' });
    }
  });

  // Get single hypervisor details (admin)
  app.get('/api/admin/vf/hypervisors/:hypervisorId', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
  app.get('/api/admin/vf/ip-blocks', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const ipBlocks = await virtfusionClient.getIpBlocks();
      res.json({ ipBlocks, total: ipBlocks.length });
    } catch (error: any) {
      log(`Admin: Error fetching IP blocks: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch IP blocks' });
    }
  });

  // Get IP allocations (admin)
  app.get('/api/admin/vf/ip-allocations', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const allocations = await virtfusionClient.getIpAllocations();
      res.json({ allocations, total: allocations.length });
    } catch (error: any) {
      log(`Admin: Error fetching IP allocations: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch IP allocations' });
    }
  });

  // Get VirtFusion users (admin)
  app.get('/api/admin/vf/users', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await virtfusionClient.getAllUsers(page, limit);
      res.json(result);
    } catch (error: any) {
      log(`Admin: Error fetching VF users: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Get VirtFusion user by ID (admin)
  app.get('/api/admin/vf/users/:userId', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
  app.delete('/api/admin/vf/users/:userId', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
  app.get('/api/admin/vf/packages', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const packages = await virtfusionClient.getPackages();
      res.json({ packages, total: packages.length });
    } catch (error: any) {
      log(`Admin: Error fetching packages: ${error.message}`, 'admin');
      res.status(500).json({ error: 'Failed to fetch packages' });
    }
  });

  // Get OS templates for package (admin)
  app.get('/api/admin/vf/packages/:packageId/templates', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { packageId } = req.params;
      const templates = await virtfusionClient.getOsTemplatesForPackage(parseInt(packageId));
      res.json({ templates });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  });

  // Get admin audit logs
  app.get('/api/admin/audit-logs', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
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
  app.get('/api/admin/vf/stats', authMiddleware, async (req, res) => {
    try {
      if (!req.userSession?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
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
      res.json({
        user: {
          id: req.userSession!.userId,
          email: req.userSession!.email,
          name: req.userSession!.name || req.userSession!.email,
        },
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
      const activePlans = await dbStorage.getActivePlans();
      res.json({ plans: activePlans });
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
        publishableKey: publishableKey ? publishableKey.substring(0, 12) + '...' : null,
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

  // Create SetupIntent for adding a new payment method (authenticated)
  app.post('/api/billing/setup-intent', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      const email = req.userSession!.email;
      const name = req.userSession!.name;
      
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const stripe = await getUncachableStripeClient();
      
      // Get or create Stripe customer
      let wallet = await dbStorage.getOrCreateWallet(auth0UserId);
      let stripeCustomerId = wallet.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email,
          name: name || undefined,
          metadata: { auth0UserId },
        });
        stripeCustomerId = customer.id;
        await dbStorage.updateWalletStripeCustomerId(auth0UserId, stripeCustomerId);
        log(`Created Stripe customer ${stripeCustomerId} for setup intent`, 'stripe');
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        metadata: { auth0UserId },
      });

      res.json({
        clientSecret: setupIntent.client_secret,
      });
    } catch (error: any) {
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
  app.get('/api/wallet', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }
      const wallet = await dbStorage.getOrCreateWallet(auth0UserId);
      res.json({ wallet });
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

  app.post('/api/wallet/topup', authMiddleware, async (req, res) => {
    try {
      const auth0UserId = req.userSession!.auth0UserId;
      const email = req.userSession!.email;
      const name = req.userSession!.name;
      if (!auth0UserId) {
        return res.status(400).json({ error: 'No Auth0 user ID in session' });
      }

      const result = topupSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid amount. Must be between $5 and $500.' });
      }

      const { amountCents } = result.data;
      const stripe = await getUncachableStripeClient();

      // Get or create wallet - ensure it exists
      let wallet = await dbStorage.getOrCreateWallet(auth0UserId);
      if (!wallet) {
        log(`Failed to get/create wallet for ${auth0UserId}`, 'stripe');
        return res.status(500).json({ error: 'Failed to initialize wallet' });
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
            log(`Failed to persist Stripe customer ${stripeCustomerId} for ${auth0UserId}`, 'stripe');
            return res.status(500).json({ error: 'Failed to link payment account' });
          }
          log(`Created and linked Stripe customer ${stripeCustomerId} for ${auth0UserId}`, 'stripe');
        } catch (stripeError: any) {
          log(`Failed to create Stripe customer: ${stripeError.message}`, 'stripe');
          return res.status(500).json({ error: 'Failed to set up payment account' });
        }
      }

      // Create a checkout session for wallet top-up
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || req.headers.host}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: stripeCustomerId,
        payment_method_types: ['card'],
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
      log(`Error creating checkout session: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to create checkout session' });
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

  // Deploy a new VPS (authenticated)
  // osId is optional - if not provided, server is created without OS (awaiting setup)
  const deploySchema = z.object({
    planId: z.number(),
    osId: z.number().min(1).optional(),
    hostname: z.string().min(1).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i).optional(),
    locationCode: z.string().optional(),
  });

  app.post('/api/deploy', authMiddleware, async (req, res) => {
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
      if (osId) {
        const templates = await virtfusionClient.getOsTemplatesForPackage(plan.virtfusionPackageId);
        let templateAllowed = false;
        if (templates && Array.isArray(templates)) {
          for (const group of templates) {
            if (group.templates && Array.isArray(group.templates)) {
              if (group.templates.some((t: any) => t.id === osId)) {
                templateAllowed = true;
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
        serverHostname
      );

      if (!deployResult.success || !deployResult.order) {
        return res.status(400).json({ error: deployResult.error || 'Failed to create deploy order' });
      }

      const order = deployResult.order;

      // Update order to provisioning status
      await dbStorage.updateDeployOrder(order.id, { status: 'provisioning' });

      // Provision server via VirtFusion
      try {
        const serverResult = await virtfusionClient.provisionServer({
          userId: virtFusionUserId,
          packageId: plan.virtfusionPackageId,
          hostname: serverHostname,
          extRelationId,
          osId, // Optional - if undefined, server is created without OS (awaiting setup)
          hypervisorGroupId,
        });

        // Update order with server ID
        await dbStorage.updateDeployOrder(order.id, {
          status: 'active',
          virtfusionServerId: serverResult.serverId,
        });

        res.json({
          success: true,
          orderId: order.id,
          serverId: serverResult.serverId,
        });
      } catch (provisionError: any) {
        log(`Provisioning failed for order ${order.id}: ${provisionError.message}`, 'api');
        
        // Refund the wallet
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

  return httpServer;
}
