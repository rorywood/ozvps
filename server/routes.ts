import type { Express } from "express";
import { createServer, type Server } from "http";
import { virtfusionClient } from "./virtfusion";
import { log } from "./index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get all servers
  app.get('/api/servers', async (req, res) => {
    try {
      const servers = await virtfusionClient.listServers();
      res.json(servers);
    } catch (error: any) {
      log(`Error fetching servers: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  });

  // Get single server
  app.get('/api/servers/:id', async (req, res) => {
    try {
      const server = await virtfusionClient.getServer(req.params.id);
      res.json(server);
    } catch (error: any) {
      log(`Error fetching server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch server' });
    }
  });

  // Power actions
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

  // Get server metrics
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
