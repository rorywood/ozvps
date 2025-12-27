import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { log } from "./index";

const mockServers = [
  {
    id: "1",
    name: "web-prod-01",
    uuid: "550e8400-e29b-41d4-a716-446655440001",
    status: "running",
    primaryIp: "185.199.108.45",
    location: { id: "1", name: "Los Angeles", flag: "🇺🇸" },
    plan: { id: "1", name: "Cloud VPS Pro", specs: { vcpu: 4, ram: 8192, disk: 160 } },
    image: { id: "1", name: "Ubuntu 22.04 LTS", distro: "linux" },
    stats: { cpu_usage: 45, ram_usage: 62, disk_usage: 38, net_in: 125, net_out: 89 },
    created_at: "2024-06-15T10:30:00Z"
  },
  {
    id: "2", 
    name: "db-master",
    uuid: "550e8400-e29b-41d4-a716-446655440002",
    status: "running",
    primaryIp: "185.199.108.46",
    location: { id: "2", name: "New York", flag: "🇺🇸" },
    plan: { id: "2", name: "Cloud VPS Enterprise", specs: { vcpu: 8, ram: 16384, disk: 320 } },
    image: { id: "2", name: "Debian 12", distro: "linux" },
    stats: { cpu_usage: 72, ram_usage: 85, disk_usage: 54, net_in: 340, net_out: 210 },
    created_at: "2024-05-20T14:15:00Z"
  },
  {
    id: "3",
    name: "staging-api",
    uuid: "550e8400-e29b-41d4-a716-446655440003", 
    status: "stopped",
    primaryIp: "185.199.108.47",
    location: { id: "3", name: "Amsterdam", flag: "🇳🇱" },
    plan: { id: "1", name: "Cloud VPS Pro", specs: { vcpu: 4, ram: 8192, disk: 160 } },
    image: { id: "3", name: "Rocky Linux 9", distro: "linux" },
    stats: { cpu_usage: 0, ram_usage: 0, disk_usage: 22, net_in: 0, net_out: 0 },
    created_at: "2024-08-01T09:00:00Z"
  },
  {
    id: "4",
    name: "mail-server",
    uuid: "550e8400-e29b-41d4-a716-446655440004",
    status: "running",
    primaryIp: "185.199.108.48",
    location: { id: "4", name: "Frankfurt", flag: "🇩🇪" },
    plan: { id: "3", name: "Cloud VPS Basic", specs: { vcpu: 2, ram: 4096, disk: 80 } },
    image: { id: "1", name: "Ubuntu 22.04 LTS", distro: "linux" },
    stats: { cpu_usage: 18, ram_usage: 45, disk_usage: 67, net_in: 56, net_out: 78 },
    created_at: "2024-07-10T16:45:00Z"
  },
  {
    id: "5",
    name: "minecraft-server",
    uuid: "550e8400-e29b-41d4-a716-446655440005",
    status: "running",
    primaryIp: "185.199.108.49",
    location: { id: "1", name: "Los Angeles", flag: "🇺🇸" },
    plan: { id: "2", name: "Cloud VPS Enterprise", specs: { vcpu: 8, ram: 16384, disk: 320 } },
    image: { id: "2", name: "Debian 12", distro: "linux" },
    stats: { cpu_usage: 58, ram_usage: 71, disk_usage: 42, net_in: 180, net_out: 95 },
    created_at: "2024-09-05T12:00:00Z"
  }
];

function generateMetricsHistory() {
  const now = Date.now();
  const points = 24;
  const cpu = [];
  const ram = [];
  const net = [];
  
  for (let i = points - 1; i >= 0; i--) {
    const timestamp = new Date(now - i * 3600000).toISOString();
    cpu.push({ timestamp, value: Math.floor(30 + Math.random() * 50) });
    ram.push({ timestamp, value: Math.floor(50 + Math.random() * 35) });
    net.push({ 
      timestamp, 
      in: Math.floor(50 + Math.random() * 150),
      out: Math.floor(30 + Math.random() * 100)
    });
  }
  
  return { cpu, ram, net };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get('/api/servers', async (req, res) => {
    try {
      log('Returning mock server data', 'api');
      res.json(mockServers);
    } catch (error: any) {
      log(`Error fetching servers: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  });

  app.get('/api/servers/:id', async (req, res) => {
    try {
      const server = mockServers.find(s => s.id === req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
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

      const server = mockServers.find(s => s.id === req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      if (action === 'boot') {
        server.status = 'running';
        server.stats = { cpu_usage: 15, ram_usage: 30, disk_usage: server.stats.disk_usage, net_in: 10, net_out: 5 };
      } else if (action === 'shutdown') {
        server.status = 'stopped';
        server.stats = { cpu_usage: 0, ram_usage: 0, disk_usage: server.stats.disk_usage, net_in: 0, net_out: 0 };
      }

      log(`Power action ${action} on server ${req.params.id}`, 'api');
      res.json({ success: true });
    } catch (error: any) {
      log(`Error performing power action on server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to perform power action' });
    }
  });

  app.get('/api/servers/:id/metrics', async (req, res) => {
    try {
      const server = mockServers.find(s => s.id === req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      
      const metrics = generateMetricsHistory();
      res.json(metrics);
    } catch (error: any) {
      log(`Error fetching metrics for server ${req.params.id}: ${error.message}`, 'api');
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  return httpServer;
}
