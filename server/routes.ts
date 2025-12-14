import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { createVirtFusionClient } from "./virtfusion";
import { log } from "./index";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.apiToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function getClient(req: Request) {
  const token = req.session.apiToken;
  if (!token) {
    throw new Error('Not authenticated');
  }
  return createVirtFusionClient(token);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { apiToken } = req.body;
      
      if (!apiToken || typeof apiToken !== 'string') {
        return res.status(400).json({ error: 'API token is required' });
      }

      const client = createVirtFusionClient(apiToken);
      const isValid = await client.validateToken();
      
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid API token' });
      }

      req.session.apiToken = apiToken;
      log('User logged in with VirtFusion token', 'auth');
      res.json({ success: true });
    } catch (error: any) {
      log(`Login error: ${error.message}`, 'auth');
      res.status(401).json({ error: 'Invalid API token' });
    }
  });

  app.get('/api/auth/session', (req, res) => {
    res.json({ 
      authenticated: !!req.session.apiToken 
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        log(`Logout error: ${err.message}`, 'auth');
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  app.get('/api/servers', requireAuth, async (req, res) => {
    try {
      const client = getClient(req);
      const servers = await client.listServers();
      res.json(servers);
    } catch (error: any) {
      log(`Error fetching servers: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  });

  app.get('/api/servers/:id', requireAuth, async (req, res) => {
    try {
      const client = getClient(req);
      const server = await client.getServer(req.params.id);
      res.json(server);
    } catch (error: any) {
      log(`Error fetching server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch server' });
    }
  });

  app.post('/api/servers/:id/power', requireAuth, async (req, res) => {
    try {
      const { action } = req.body;
      
      if (!['boot', 'reboot', 'shutdown'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const virtfusionAction = action === 'boot' ? 'start' : 
                              action === 'shutdown' ? 'stop' : 
                              'restart';

      const client = getClient(req);
      const result = await client.powerAction(req.params.id, virtfusionAction);
      res.json(result);
    } catch (error: any) {
      log(`Error performing power action on server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to perform power action' });
    }
  });

  app.get('/api/servers/:id/metrics', requireAuth, async (req, res) => {
    try {
      const client = getClient(req);
      const metrics = await client.getServerStats(req.params.id);
      res.json(metrics || { cpu: [], ram: [], net: [] });
    } catch (error: any) {
      log(`Error fetching metrics for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  return httpServer;
}
