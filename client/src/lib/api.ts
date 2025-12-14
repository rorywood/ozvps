import { Server, User, Invoice, IpAddress } from "./types";
import { mockServers, mockStats } from "./mock-data";

// Simulation of the VirtFusion API
// In a real app, these would be fetch() calls to the backend proxy

const DELAY = 800; // ms to simulate network latency

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class VirtFusionClient {
  private servers: Server[] = [];

  constructor() {
    // Initialize with mock data transformed to match API types
    this.servers = mockServers.map(s => ({
      id: s.id,
      name: s.name,
      uuid: crypto.randomUUID(),
      status: s.status,
      primaryIp: s.ip,
      location: {
        id: s.location.toLowerCase().replace(/\s/g, '-'),
        name: s.location,
        flag: '🇺🇸' // Simplified for mock
      },
      plan: {
        id: 'p-1',
        name: s.plan,
        specs: {
          vcpu: s.cpu,
          ram: parseInt(s.ram) * 1024,
          disk: parseInt(s.disk)
        }
      },
      image: {
        id: 'img-1',
        name: s.image,
        distro: s.image.toLowerCase().includes('windows') ? 'windows' : 'linux'
      },
      stats: {
        cpu_usage: s.usage_cpu,
        ram_usage: s.usage_ram,
        disk_usage: s.usage_disk,
        net_in: Math.floor(Math.random() * 100),
        net_out: Math.floor(Math.random() * 100)
      },
      created_at: new Date().toISOString()
    }));
  }

  // --- Servers ---

  async listServers(): Promise<Server[]> {
    await wait(DELAY);
    return [...this.servers];
  }

  async getServer(id: string): Promise<Server> {
    await wait(DELAY);
    const server = this.servers.find(s => s.id === id);
    if (!server) throw new Error("Server not found");
    return { ...server }; // Return copy
  }

  async createServer(payload: { name: string; planId: string; imageId: string; locationId: string }): Promise<Server> {
    await wait(DELAY * 2);
    const newServer: Server = {
      id: `srv-${Math.floor(Math.random() * 10000)}`,
      uuid: crypto.randomUUID(),
      name: payload.name,
      status: 'provisioning',
      primaryIp: '10.0.0.x', // Mock
      location: { id: payload.locationId, name: 'New Location', flag: '🏳️' },
      plan: { id: payload.planId, name: 'Custom Plan', specs: { vcpu: 1, ram: 1024, disk: 25 } },
      image: { id: payload.imageId, name: 'OS Image', distro: 'linux' },
      stats: { cpu_usage: 0, ram_usage: 0, disk_usage: 0, net_in: 0, net_out: 0 },
      created_at: new Date().toISOString()
    };
    this.servers.push(newServer);
    return newServer;
  }

  async deleteServer(id: string): Promise<void> {
    await wait(DELAY);
    this.servers = this.servers.filter(s => s.id !== id);
  }

  async powerAction(id: string, action: 'boot' | 'reboot' | 'shutdown' | 'force-shutdown'): Promise<{ success: boolean }> {
    await wait(DELAY);
    const server = this.servers.find(s => s.id === id);
    if (!server) throw new Error("Server not found");

    switch (action) {
      case 'boot':
        server.status = 'running';
        break;
      case 'shutdown':
      case 'force-shutdown':
        server.status = 'stopped';
        break;
      case 'reboot':
        server.status = 'running'; // In real life this would go running -> rebooting -> running
        break;
    }
    return { success: true };
  }

  // --- User ---

  async getProfile(): Promise<User> {
    await wait(DELAY);
    return {
      id: 1,
      name: "John Doe",
      email: "demo@cloudasn.com",
      balance: mockStats.credit_balance,
      currency: "USD"
    };
  }

  // --- Metrics ---
  
  async getMetrics(id: string): Promise<{ cpu: number[], ram: number[], net: number[] }> {
    await wait(DELAY);
    // Generate simulated historical data
    return {
      cpu: Array.from({ length: 24 }, () => Math.floor(Math.random() * 80)),
      ram: Array.from({ length: 24 }, () => Math.floor(Math.random() * 60 + 20)),
      net: Array.from({ length: 24 }, () => Math.floor(Math.random() * 500))
    };
  }
}

// Singleton instance
export const api = new VirtFusionClient();
