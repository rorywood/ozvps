import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { virtfusionClient } from "./virtfusion";
import { log } from "./index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get('/api/servers', async (req, res) => {
    try {
      // Show servers for user ID 2 (testing user)
      const servers = await virtfusionClient.listServersByUserId(2);
      res.json(servers);
    } catch (error: any) {
      log(`Error fetching servers: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  });

  app.get('/api/servers/:id', async (req, res) => {
    try {
      const server = await virtfusionClient.getServer(req.params.id);
      res.json(server);
    } catch (error: any) {
      log(`Error fetching server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch server' });
    }
  });

  app.post('/api/servers/:id/power', async (req, res) => {
    try {
      const { action } = req.body;
      
      if (!['boot', 'reboot', 'shutdown'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
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

  app.get('/api/servers/:id/metrics', async (req, res) => {
    try {
      const metrics = await virtfusionClient.getServerStats(req.params.id);
      res.json(metrics || { cpu: [], ram: [], net: [] });
    } catch (error: any) {
      log(`Error fetching metrics for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  return httpServer;
}
