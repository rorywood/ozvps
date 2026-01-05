import { log } from "./index";

// VirtFusion API response structure - based on actual API response
interface VirtFusionServerResponse {
  id: number;
  name: string;
  uuid: string;
  ownerId: number;
  hostname?: string;
  state?: string;
  suspended?: boolean;
  buildFailed?: boolean;
  protected?: boolean;
  
  // Power/status fields - try various possible names
  power_status?: string;
  powerState?: string;
  power?: string;
  
  // OS info
  os?: {
    dist?: string;
    name?: string;
    kernel?: string;
    img?: string;
  };
  
  // Server location info
  server_info?: {
    show?: boolean;
    name?: string;
    icon?: string;
    label?: string;
  };
  
  // Resources
  resources?: {
    memory?: number;
    storage?: number;
    traffic?: number;
    cpuCores?: number;
    cpu_model?: string;
  };
  
  // Network
  network?: {
    interfaces?: Array<{
      name?: string;
      mac?: string;
      ipv4?: Array<{
        address?: string;
        gateway?: string;
        netmask?: string;
      }>;
      ipv6?: Array<{
        address?: string;
      }>;
    }>;
  };
  
  created_at?: string;
  createdAt?: string;
}

interface VirtFusionUser {
  id: number;
  name: string;
  email: string;
  extRelationId: string;
  enabled: boolean;
}

export class VirtFusionClient {
  private baseUrl: string;
  private apiToken: string;

  constructor() {
    this.baseUrl = (process.env.VIRTFUSION_PANEL_URL || '').replace(/\/+$/, '');
    this.apiToken = process.env.VIRTFUSION_API_TOKEN || '';

    if (!this.baseUrl) {
      throw new Error('VIRTFUSION_PANEL_URL must be set');
    }
    if (!this.apiToken) {
      throw new Error('VIRTFUSION_API_TOKEN must be set');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    
    try {
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

      return await response.json();
    } catch (error: any) {
      log(`VirtFusion fetch error: ${error.message} - URL: ${url}`, 'virtfusion');
      throw error;
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.request<any>('/connect');
      return true;
    } catch (error) {
      return false;
    }
  }

  async getUserByExtRelationId(extRelationId: string): Promise<VirtFusionUser | null> {
    try {
      const data = await this.request<{ data: VirtFusionUser }>(`/users/${extRelationId}/byExtRelation`);
      return data.data;
    } catch (error) {
      log(`Failed to fetch user by extRelationId ${extRelationId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async listServersByUserId(userId: number) {
    const response = await this.request<{ data: VirtFusionServerResponse[] }>(`/servers/user/${userId}`);
    return response.data.map(server => this.transformServer(server));
  }

  async listServers() {
    const response = await this.request<{ data: VirtFusionServerResponse[] }>('/servers');
    return response.data.map(server => this.transformServer(server));
  }

  async getServer(serverId: string) {
    const response = await this.request<{ data: VirtFusionServerResponse }>(`/servers/${serverId}`);
    return this.transformServer(response.data);
  }

  async powerAction(serverId: string, action: 'start' | 'stop' | 'restart') {
    const endpoint = action === 'start' ? 'boot' : action === 'stop' ? 'shutdown' : 'restart';
    await this.request(`/servers/${serverId}/power/${endpoint}`, {
      method: 'POST',
    });
    return { success: true };
  }

  async getServerStats(serverId: string) {
    try {
      const data = await this.request<{ data: any }>(`/servers/${serverId}/traffic`);
      return data.data;
    } catch (error) {
      log(`Failed to fetch stats for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async getServerLiveStats(serverId: string) {
    try {
      // VirtFusion provides server stats in the main server response
      // Try to get the server data with remote state info
      const response = await this.request<{ data: any }>(`/servers/${serverId}`);
      const server = response.data;
      
      // Check various possible locations for stats data
      const stats = server.remoteState || server.remote_state || server.stats || server.statistics || {};
      const resources = server.resources || {};
      
      // Try to extract CPU/RAM/disk usage from available data
      // VirtFusion may provide these in different formats
      let cpuUsage = stats.cpu?.usage || stats.cpuUsage || stats.cpu_usage || stats.cpu || 0;
      let ramUsage = stats.memory?.usage || stats.memoryUsage || stats.ram_usage || stats.memory?.percent || stats.mem || 0;
      let diskUsage = stats.disk?.usage || stats.diskUsage || stats.disk_usage || stats.storage?.percent || 0;
      
      // If values are in raw bytes, calculate percentage based on allocated resources
      if (typeof cpuUsage === 'object') cpuUsage = cpuUsage.percent || cpuUsage.usage || 0;
      if (typeof ramUsage === 'object') ramUsage = ramUsage.percent || ramUsage.usage || 0;
      if (typeof diskUsage === 'object') diskUsage = diskUsage.percent || diskUsage.usage || 0;
      
      return {
        cpu_usage: Math.min(100, Math.max(0, Number(cpuUsage) || 0)),
        ram_usage: Math.min(100, Math.max(0, Number(ramUsage) || 0)),
        disk_usage: Math.min(100, Math.max(0, Number(diskUsage) || 0)),
        net_in: stats.network?.in || stats.networkIn || stats.net_in || 0,
        net_out: stats.network?.out || stats.networkOut || stats.net_out || 0,
      };
    } catch (error) {
      log(`Failed to fetch live stats for server ${serverId}: ${error}`, 'virtfusion');
      // Return null to indicate stats aren't available
      return null;
    }
  }

  async getServerTrafficHistory(serverId: string) {
    try {
      const data = await this.request<{ data: any }>(`/servers/${serverId}/traffic/blocks`);
      return data.data;
    } catch (error) {
      log(`Failed to fetch traffic history for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async getVncDetails(serverId: string) {
    try {
      const data = await this.request<{ data: any }>(`/servers/${serverId}/vnc`);
      return data.data;
    } catch (error) {
      log(`Failed to fetch VNC details for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async getOsTemplates(serverId: string) {
    try {
      const data = await this.request<{ data: any }>(`/servers/${serverId}/media/osGroups`);
      return data.data;
    } catch (error) {
      log(`Failed to fetch OS templates for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async reinstallServer(serverId: string, osId: number, hostname?: string) {
    try {
      const body: any = { osid: osId };
      if (hostname) body.hostname = hostname;
      
      const data = await this.request<{ data: any }>(`/servers/${serverId}/build`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return data.data;
    } catch (error) {
      log(`Failed to reinstall server ${serverId}: ${error}`, 'virtfusion');
      throw error;
    }
  }

  async getServerNetworkInfo(serverId: string) {
    try {
      const response = await this.request<{ data: VirtFusionServerResponse }>(`/servers/${serverId}`);
      const server = response.data;
      
      const interfaces = server.network?.interfaces || [];
      return {
        interfaces: interfaces.map((iface, index) => ({
          name: iface.name || `eth${index}`,
          mac: iface.mac || 'N/A',
          ipv4: iface.ipv4?.map(ip => ({
            address: ip.address || 'N/A',
            gateway: ip.gateway || 'N/A',
            netmask: ip.netmask || 'N/A',
          })) || [],
          ipv6: iface.ipv6?.map(ip => ({
            address: ip.address || 'N/A',
          })) || [],
        })),
      };
    } catch (error) {
      log(`Failed to fetch network info for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  private transformServer(server: VirtFusionServerResponse) {
    // Determine status from server state - "complete" means built and running
    const stateValue = server.power_status || server.powerState || server.power || server.state || '';
    const status = this.mapStatus(stateValue, server.suspended, server.buildFailed);
    
    // Get primary IP from network interfaces
    const primaryIp = server.network?.interfaces?.[0]?.ipv4?.[0]?.address || 'N/A';
    
    // Get resources
    const resources = server.resources || {};
    const vcpu = resources.cpuCores || 1;
    const ram = resources.memory || 1024;
    const disk = resources.storage || 20;
    
    // Get location from server_info
    const locationName = server.server_info?.name || 'Unknown';
    
    // Get OS info
    const osName = server.os?.name || server.os?.dist || 'Linux';
    const osDistro = server.os?.dist || 'linux';
    
    // Get created date
    const createdAt = server.created_at || server.createdAt || new Date().toISOString();
    
    return {
      id: server.id.toString(),
      name: server.name || `Server ${server.id}`,
      uuid: server.uuid || '',
      status,
      userId: server.ownerId,
      primaryIp,
      hostname: server.hostname || '',
      location: {
        id: server.id.toString(),
        name: locationName,
        flag: '🇦🇺',
      },
      plan: {
        id: server.id.toString(),
        name: `${vcpu} vCPU / ${ram >= 1024 ? (ram / 1024).toFixed(0) + ' GB' : ram + ' MB'} RAM / ${disk} GB`,
        specs: {
          vcpu,
          ram,
          disk,
        },
      },
      image: {
        id: server.id.toString(),
        name: osName,
        distro: osDistro as 'linux' | 'windows',
      },
      stats: {
        cpu_usage: 0,
        ram_usage: 0,
        disk_usage: 0,
        net_in: 0,
        net_out: 0,
      },
      created_at: createdAt,
    };
  }

  private mapStatus(status: string | undefined, suspended?: boolean, buildFailed?: boolean): 'running' | 'stopped' | 'provisioning' | 'error' {
    // Check for suspended or failed builds first
    if (suspended) return 'stopped';
    if (buildFailed) return 'error';
    
    if (!status) return 'stopped';
    const statusLower = status.toLowerCase();
    
    // Running states
    if (statusLower === 'running' || 
        statusLower === 'online' || 
        statusLower === 'active' ||
        statusLower === 'started' ||
        statusLower === 'on' ||
        statusLower === 'powered on') {
      return 'running';
    }
    
    // Stopped states
    if (statusLower === 'stopped' || 
        statusLower === 'offline' || 
        statusLower === 'off' ||
        statusLower === 'shutdown' ||
        statusLower === 'powered off') {
      return 'stopped';
    }
    
    // Complete state (server is built/ready - need separate power check)
    if (statusLower === 'complete') {
      // When state is "complete", the server is built but we need power state
      // Since we can't determine power here, return running as default for built servers
      return 'running';
    }
    
    // Provisioning states
    if (statusLower.includes('provision') || 
        statusLower.includes('building') ||
        statusLower.includes('creating') ||
        statusLower.includes('pending') ||
        statusLower.includes('queued')) {
      return 'provisioning';
    }
    
    // Error states
    if (statusLower.includes('error') || 
        statusLower.includes('failed')) {
      return 'error';
    }
    
    // Default to running for built servers
    return 'running';
  }
}

export const virtfusionClient = new VirtFusionClient();
