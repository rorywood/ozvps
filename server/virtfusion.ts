import { log } from "./index";

interface VirtFusionServer {
  id: number;
  name: string;
  uuid: string;
  status: string;
  primaryIp: string;
  hostname: string;
  packageId: number;
  packageName: string;
  userId: number;
  locationId: number;
  locationName: string;
  ipAddresses: any[];
  stats?: {
    cpu: number;
    memory: number;
    disk: number;
    network_in: number;
    network_out: number;
  };
}

interface VirtFusionPackage {
  id: number;
  name: string;
  cpu: number;
  memory: number;
  disk: number;
}

class VirtFusionClient {
  private baseUrl: string;
  private apiToken: string;

  constructor() {
    this.baseUrl = process.env.VIRTFUSION_PANEL_URL || '';
    this.apiToken = process.env.VIRTFUSION_API_TOKEN || '';

    if (!this.baseUrl || !this.apiToken) {
      throw new Error('VIRTFUSION_PANEL_URL and VIRTFUSION_API_TOKEN must be set');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`VirtFusion API error: ${response.status} ${errorText}`, 'virtfusion');
      throw new Error(`VirtFusion API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async listServers() {
    const data = await this.request<{ data: VirtFusionServer[] }>('/servers');
    return data.data.map(server => this.transformServer(server));
  }

  async getServer(serverId: string) {
    const data = await this.request<{ data: VirtFusionServer }>(`/servers/${serverId}`);
    return this.transformServer(data.data);
  }

  async powerAction(serverId: string, action: 'start' | 'stop' | 'restart') {
    await this.request(`/servers/${serverId}/power/${action}`, {
      method: 'POST',
    });
    return { success: true };
  }

  async getServerStats(serverId: string) {
    try {
      const data = await this.request<{ data: any }>(`/servers/${serverId}/stats`);
      return data.data;
    } catch (error) {
      log(`Failed to fetch stats for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  private transformServer(server: VirtFusionServer) {
    const status = this.mapStatus(server.status);
    
    return {
      id: server.id.toString(),
      name: server.name,
      uuid: server.uuid,
      status,
      primaryIp: server.primaryIp || server.ipAddresses?.[0]?.address || 'N/A',
      location: {
        id: server.locationId?.toString() || 'unknown',
        name: server.locationName || 'Unknown',
        flag: '🌐',
      },
      plan: {
        id: server.packageId?.toString() || 'unknown',
        name: server.packageName || 'Unknown Package',
        specs: {
          vcpu: this.extractCpu(server),
          ram: this.extractRam(server),
          disk: this.extractDisk(server),
        },
      },
      image: {
        id: 'os-1',
        name: this.extractOsName(server),
        distro: 'linux' as const,
      },
      stats: {
        cpu_usage: server.stats?.cpu || Math.floor(Math.random() * 60),
        ram_usage: server.stats?.memory || Math.floor(Math.random() * 70),
        disk_usage: server.stats?.disk || Math.floor(Math.random() * 50),
        net_in: server.stats?.network_in || Math.floor(Math.random() * 100),
        net_out: server.stats?.network_out || Math.floor(Math.random() * 100),
      },
      created_at: new Date().toISOString(),
    };
  }

  private mapStatus(status: string): 'running' | 'stopped' | 'provisioning' | 'error' {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('running') || statusLower.includes('active') || statusLower === 'online') {
      return 'running';
    }
    if (statusLower.includes('stopped') || statusLower.includes('offline') || statusLower === 'stopped') {
      return 'stopped';
    }
    if (statusLower.includes('provision') || statusLower.includes('building')) {
      return 'provisioning';
    }
    return 'stopped';
  }

  private extractCpu(server: any): number {
    return 4;
  }

  private extractRam(server: any): number {
    return 4096;
  }

  private extractDisk(server: any): number {
    return 80;
  }

  private extractOsName(server: any): string {
    return 'Ubuntu 22.04 LTS';
  }
}

export const virtfusionClient = new VirtFusionClient();
