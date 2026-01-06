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

  // Force resync plans from VirtFusion (localhost only, for update script)
  // Registered BEFORE CSRF to allow curl from update script
  app.post('/api/admin/resync-plans', async (req, res) => {
    // Only allow from localhost for security
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocalhost) {
      log(`Plan resync rejected from non-local IP: ${ip}`, 'api');
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const packages = await virtfusionClient.getPackages();
      if (packages.length > 0) {
        const result = await dbStorage.syncPlansFromVirtFusion(packages);
        log(`Plans resynced: ${result.synced} synced, ${result.errors.length} errors`, 'api');
        res.json({ success: true, synced: result.synced, errors: result.errors });
      } else {
        res.json({ success: false, error: 'No packages found from VirtFusion' });
      }
    } catch (error: any) {
      log(`Plan resync failed: ${error.message}`, 'api');
      res.status(500).json({ success: false, error: error.message });
    }
  });

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

  // Plan sync function (reusable for startup and periodic sync)
  const syncPlansFromVirtFusion = async (source: string) => {
    try {
      const packages = await virtfusionClient.getPackages();
      if (packages.length > 0) {
        const result = await dbStorage.syncPlansFromVirtFusion(packages);
        log(`Plans synced from VirtFusion: ${result.synced} synced, ${result.errors.length} errors`, source);
        if (result.errors.length > 0) {
          result.errors.forEach(err => log(`Plan sync error: ${err}`, source));
        }
      } else {
        log('No packages found from VirtFusion to sync', source);
      }
    } catch (error: any) {
      log(`Failed to sync plans: ${error.message}`, source);
    }
  };

  // Sync plans from VirtFusion on startup
  syncPlansFromVirtFusion('startup');

  // Periodic plan sync every 10 minutes
  const PLAN_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
  setInterval(() => {
    syncPlansFromVirtFusion('scheduled');
  }, PLAN_SYNC_INTERVAL);
  log(`Scheduled plan sync every ${PLAN_SYNC_INTERVAL / 60000} minutes`, 'startup');

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
        
        // Create wallet with Stripe customer linked
        const wallet = await dbStorage.getOrCreateWallet(auth0UserId);
        await dbStorage.updateWalletStripeCustomerId(auth0UserId, customer.id);
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

      // Authenticate with Auth0
      const auth0Result = await auth0Client.authenticateUser(email, password);
      if (!auth0Result.success || !auth0Result.user) {
        return res.status(401).json({ error: auth0Result.error || 'Invalid email or password' });
      }

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

      // Check if user is admin (from Auth0 app_metadata)
      const isAdmin = await auth0Client.isUserAdmin(auth0Result.user.user_id);
      if (isAdmin) {
        log(`Admin user logged in: ${email}`, 'auth');
      }

      // Create local session
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      const session = await storage.createSession({
        visitorId: 0,
        virtFusionUserId,
        extRelationId,
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

      res.json({
        user: {
          id: session.userId,
          email: session.email,
          name: session.name,
          virtFusionUserId: session.virtFusionUserId,
          extRelationId: session.extRelationId,
          isAdmin: session.isAdmin ?? false,
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

  // ================== Wallet & Deploy Routes ==================

  // Get available locations
  app.get('/api/locations', async (req, res) => {
    res.json({
      locations: [
        {
          code: 'BNE',
          name: 'Brisbane',
          country: 'Australia',
          countryCode: 'AU',
          enabled: true,
        },
        {
          code: 'SYD',
          name: 'Sydney',
          country: 'Australia',
          countryCode: 'AU',
          enabled: false,
        },
      ],
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
  const deploySchema = z.object({
    planId: z.number(),
    osId: z.number().min(1),
    hostname: z.string().min(1).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i),
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

      // Get plan details
      const plan = await dbStorage.getPlanById(planId);
      if (!plan || !plan.active) {
        return res.status(404).json({ error: 'Plan not found or inactive' });
      }

      if (!plan.virtfusionPackageId) {
        return res.status(400).json({ error: 'Plan not configured for deployment' });
      }

      // Verify OS template is valid for this plan
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

      // Debit wallet and create order atomically
      const deployResult = await dbStorage.createDeployWithDebit(
        auth0UserId,
        planId,
        plan.priceMonthly,
        hostname
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
          hostname: hostname,
          extRelationId,
          osId,
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

      const authHeader = req.headers['authorization'] as string;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        log('Missing or invalid Authorization header', 'webhook');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      if (token !== webhookSecret) {
        log('Invalid webhook token', 'webhook');
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

      await storage.deleteSessionsByAuth0UserId(auth0UserId);
      log(`Deleted sessions for Auth0 user ${auth0UserId}`, 'webhook');

      if (virtFusionUserId) {
        const result = await virtfusionClient.cleanupUserAndServers(virtFusionUserId);
        
        if (result.success) {
          log(`Successfully cleaned up VirtFusion user ${virtFusionUserId}: ${result.serversDeleted} servers deleted`, 'webhook');
          return res.status(204).send();
        } else {
          log(`Partial cleanup for VirtFusion user ${virtFusionUserId}: ${result.errors.join(', ')}`, 'webhook');
          return res.status(500).json({ error: 'Partial cleanup', errors: result.errors });
        }
      } else {
        log(`No VirtFusion user ID in app_metadata for ${auth0UserId}, skipping VirtFusion cleanup`, 'webhook');
        return res.status(204).send();
      }
    } catch (error: any) {
      log(`Webhook error: ${error.message}`, 'webhook');
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  return httpServer;
}
