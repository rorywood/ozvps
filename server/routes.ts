import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { virtfusionClient } from "./virtfusion";
import { storage } from "./storage";
import { auth0Client } from "./auth0";
import { loginSchema, registerSchema, serverNameSchema, reinstallSchema } from "@shared/schema";
import { log } from "./index";
import { validateServerName } from "./content-filter";

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
      };
    }
  }
}

const SESSION_COOKIE = 'ozvps_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// CSRF protection middleware - validates Origin header for mutating requests
function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only check mutating methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
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
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const session = await storage.getSession(sessionId);
    
    if (!session) {
      res.clearCookie(SESSION_COOKIE);
      return res.status(401).json({ error: 'Session expired' });
    }

    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteSession(sessionId);
      res.clearCookie(SESSION_COOKIE);
      return res.status(401).json({ error: 'Session expired' });
    }

    req.userSession = {
      id: session.id,
      userId: session.userId ?? 0,
      auth0UserId: session.auth0UserId ?? null,
      virtFusionUserId: session.virtFusionUserId ?? null,
      extRelationId: session.extRelationId ?? null,
      email: session.email,
      name: session.name ?? undefined,
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

      // Check for existing VirtFusion user ID in Auth0 metadata
      let virtFusionUserId = await auth0Client.getVirtFusionUserId(auth0Result.user.user_id);
      let extRelationId: string | undefined;
      
      if (virtFusionUserId) {
        log(`Found VirtFusion user ID in Auth0 metadata: ${virtFusionUserId}`, 'auth');
        // For existing users, we'll get extRelationId from server owner data when needed
        // Don't set it here as user lookup by ID doesn't work reliably in VirtFusion
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

      // Delete any existing sessions for this Auth0 user
      await storage.deleteSessionsByAuth0UserId(auth0Result.user.user_id);

      // Create local session
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      const session = await storage.createSession({
        visitorId: 0,
        virtFusionUserId: virtFusionUserId ?? undefined,
        extRelationId,
        email: email,
        name: auth0Result.user.name,
        auth0UserId: auth0Result.user.user_id,
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

      const result = await virtfusionClient.reinstallServer(req.params.id, osId, hostname);
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

  // Public install script endpoint (no auth required)
  // Auto-configures download URL and non-sensitive VirtFusion panel URL
  app.get('/install.sh', async (req, res) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const scriptPath = path.join(process.cwd(), 'public', 'install.sh');
      let script = await fs.readFile(scriptPath, 'utf-8');
      
      // Get the current Replit app URL from the request
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['host'] || '';
      const replitUrl = `${protocol}://${host}`;
      
      // Only inject non-sensitive values - VirtFusion panel URL (not the token!)
      const virtfusionUrl = process.env.VIRTFUSION_PANEL_URL || '';
      
      // Replace placeholder values in the script
      script = script.replace(
        'DOWNLOAD_URL="${OZVPS_DOWNLOAD_URL:-}"',
        `DOWNLOAD_URL="${replitUrl}/download.tar.gz"`
      );
      script = script.replace(
        'PRECONFIGURED_VIRTFUSION_URL=""',
        `PRECONFIGURED_VIRTFUSION_URL="${virtfusionUrl}"`
      );
      
      res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="install.sh"');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(script);
    } catch (error: any) {
      log(`Error serving install script: ${error.message}`, 'api');
      res.status(404).send('# Install script not found');
    }
  });

  // Public download endpoint - serves application code as tar.gz archive
  app.get('/download.tar.gz', async (req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const path = await import('path');
      const fs = await import('fs/promises');
      const crypto = await import('crypto');
      const execAsync = promisify(exec);
      
      const cwd = process.cwd();
      // Use unique temp file to prevent race conditions
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const archivePath = path.join('/tmp', `ozvps-panel-${uniqueId}.tar.gz`);
      
      // Files and directories to include - check which exist
      const potentialFiles = [
        'client',
        'server', 
        'shared',
        'public',
        'script',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'vite.config.ts',
        'vite-plugin-meta-images.ts',
        'postcss.config.js',
        'drizzle.config.ts',
        'tailwind.config.ts',
        'components.json',
        'INSTALL.md'
      ];
      
      // Filter to only existing files
      const existingFiles: string[] = [];
      for (const file of potentialFiles) {
        try {
          await fs.access(path.join(cwd, file));
          existingFiles.push(file);
        } catch {
          // File doesn't exist, skip it
        }
      }
      
      if (existingFiles.length === 0) {
        return res.status(500).send('No files found to archive');
      }
      
      // Create tar.gz archive excluding node_modules, .env, and other unnecessary files
      // Safely quote each file to handle spaces/special characters
      const quotedFiles = existingFiles.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ');
      const tarCommand = `tar -czf '${archivePath}' --exclude='node_modules' --exclude='.env' --exclude='*.log' --exclude='.git' --exclude='dist' --exclude='.replit' --exclude='replit.nix' -C '${cwd}' ${quotedFiles}`;
      
      await execAsync(tarCommand);
      
      const archive = await fs.readFile(archivePath);
      
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="ozvps-panel.tar.gz"');
      res.setHeader('Content-Length', archive.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(archive);
      
      // Cleanup
      await fs.unlink(archivePath).catch(() => {});
    } catch (error: any) {
      log(`Error creating download archive: ${error.message}`, 'api');
      res.status(500).send('Failed to create download archive');
    }
  });

  return httpServer;
}
