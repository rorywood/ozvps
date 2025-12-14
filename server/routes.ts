import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { virtfusionClient } from "./virtfusion";
import { log } from "./index";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { extRelationId } = req.body;
      
      if (!extRelationId || typeof extRelationId !== 'string') {
        return res.status(400).json({ error: 'Customer ID is required' });
      }

      const user = await virtfusionClient.getUserByExtRelationId(extRelationId.trim());
      
      if (!user) {
        return res.status(401).json({ error: 'Customer not found. Please check your Customer ID.' });
      }

      if (!user.enabled) {
        return res.status(401).json({ error: 'Account is disabled. Please contact support.' });
      }

      req.session.regenerate((err) => {
        if (err) {
          log(`Session regeneration error: ${err.message}`, 'auth');
          return res.status(500).json({ error: 'Login failed. Please try again.' });
        }
        
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        req.session.extRelationId = extRelationId;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            log(`Session save error: ${saveErr.message}`, 'auth');
            return res.status(500).json({ error: 'Login failed. Please try again.' });
          }
          
          log(`User logged in: ${user.name} (${user.email})`, 'auth');
          res.json({ 
            success: true,
            user: {
              name: user.name,
              email: user.email
            }
          });
        });
      });
    } catch (error: any) {
      log(`Login error: ${error.message}`, 'auth');
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  app.get('/api/auth/session', (req, res) => {
    res.json({ 
      authenticated: !!req.session.userId,
      user: req.session.userId ? {
        name: req.session.userName,
        email: req.session.userEmail
      } : null
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
      const userId = req.session.userId!;
      const servers = await virtfusionClient.listServersByUserId(userId);
      res.json(servers);
    } catch (error: any) {
      log(`Error fetching servers: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  });

  app.get('/api/servers/:id', requireAuth, async (req, res) => {
    try {
      const server = await virtfusionClient.getServer(req.params.id);
      
      if (server.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
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

      const server = await virtfusionClient.getServer(req.params.id);
      if (server.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const virtfusionAction = action === 'boot' ? 'start' : 
                              action === 'shutdown' ? 'stop' : 
                              'restart';

      const result = await virtfusionClient.powerAction(req.params.id, virtfusionAction);
      res.json(result);
    } catch (error: any) {
      log(`Error performing power action on server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to perform power action' });
    }
  });

  app.get('/api/servers/:id/metrics', requireAuth, async (req, res) => {
    try {
      const server = await virtfusionClient.getServer(req.params.id);
      if (server.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const metrics = await virtfusionClient.getServerStats(req.params.id);
      res.json(metrics || { cpu: [], ram: [], net: [] });
    } catch (error: any) {
      log(`Error fetching metrics for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  return httpServer;
}
