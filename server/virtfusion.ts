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
      // VirtFusion provides live stats when we add ?remoteState=true
      const response = await this.request<{ data: any }>(`/servers/${serverId}?remoteState=true`);
      const server = response.data;
      const remoteState = server.remoteState || {};
      const memory = remoteState.memory || {};
      const cpu = remoteState.cpu || {};
      
      // Calculate RAM usage from memory stats
      let ramUsage = 0;
      if (memory.memtotal && memory.memavailable) {
        const memTotal = parseInt(memory.memtotal) || 0;
        const memAvailable = parseInt(memory.memavailable) || 0;
        if (memTotal > 0) {
          ramUsage = ((memTotal - memAvailable) / memTotal) * 100;
        }
      } else if (memory.memtotal && memory.memfree) {
        const memTotal = parseInt(memory.memtotal) || 0;
        const memFree = parseInt(memory.memfree) || 0;
        if (memTotal > 0) {
          ramUsage = ((memTotal - memFree) / memTotal) * 100;
        }
      }
      
      // Get CPU usage - VirtFusion provides this as a direct value (e.g., "cpu": 17.4)
      let cpuUsage = 0;
      if (typeof remoteState.cpu === 'number') {
        cpuUsage = remoteState.cpu;
      } else if (typeof remoteState.cpu === 'string') {
        cpuUsage = parseFloat(remoteState.cpu) || 0;
      } else if (cpu.usage !== undefined) {
        cpuUsage = parseFloat(cpu.usage) || 0;
      } else if (cpu.percent !== undefined) {
        cpuUsage = parseFloat(cpu.percent) || 0;
      }
      
      // Get disk usage from remoteState.disk object
      // The disk data looks like: {"vda":{"capacity":"16106127360","physical":"12897910784",...}}
      let diskUsage = 0;
      let diskUsedBytes = 0;
      let diskTotalBytes = 0;
      const disk = remoteState.disk || {};
      
      // Disk is an object with disk names as keys (e.g., "vda", "sda")
      const diskKeys = Object.keys(disk);
      for (const key of diskKeys) {
        const diskData = disk[key];
        if (diskData && diskData.capacity && diskData.physical) {
          const capacity = parseInt(diskData.capacity) || 0;
          const physical = parseInt(diskData.physical) || 0;
          diskTotalBytes += capacity;
          diskUsedBytes += physical;
        }
      }
      
      if (diskTotalBytes > 0) {
        diskUsage = (diskUsedBytes / diskTotalBytes) * 100;
      }
      
      // Memory details for display
      const memTotalMB = Math.round((parseInt(memory.memtotal) || 0) / 1024);
      const memUsedMB = Math.round(((parseInt(memory.memtotal) || 0) - (parseInt(memory.memavailable) || parseInt(memory.memfree) || 0)) / 1024);
      const memFreeMB = Math.round((parseInt(memory.memavailable) || parseInt(memory.memfree) || 0) / 1024);
      
      return {
        cpu_usage: Math.min(100, Math.max(0, cpuUsage)),
        ram_usage: Math.min(100, Math.max(0, ramUsage)),
        disk_usage: Math.min(100, Math.max(0, diskUsage)),
        memory_total_mb: memTotalMB,
        memory_used_mb: memUsedMB,
        memory_free_mb: memFreeMB,
        disk_used_gb: Math.round(diskUsedBytes / (1024 * 1024 * 1024) * 100) / 100,
        disk_total_gb: Math.round(diskTotalBytes / (1024 * 1024 * 1024) * 100) / 100,
        running: remoteState.running || remoteState.state === 'running',
      };
    } catch (error) {
      log(`Failed to fetch live stats for server ${serverId}: ${error}`, 'virtfusion');
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

  async enableVnc(serverId: string) {
    try {
      const data = await this.request<{ data: any }>(`/servers/${serverId}/vnc`, {
        method: 'POST',
        body: JSON.stringify({ action: 'enable' }),
      });
      return data.data;
    } catch (error) {
      log(`Failed to enable VNC for server ${serverId}: ${error}`, 'virtfusion');
      throw error;
    }
  }

  async disableVnc(serverId: string) {
    try {
      const data = await this.request<{ data: any }>(`/servers/${serverId}/vnc`, {
        method: 'POST',
        body: JSON.stringify({ action: 'disable' }),
      });
      return data.data;
    } catch (error) {
      log(`Failed to disable VNC for server ${serverId}: ${error}`, 'virtfusion');
      throw error;
    }
  }

  async getOsTemplates(serverId: string) {
    try {
      // Get server specs to match against packages
      const serverResponse = await this.request<{ data: any }>(`/servers/${serverId}`);
      const serverResources = serverResponse.data?.settings?.resources || {};
      const serverMemory = serverResources.memory || 0;
      const serverStorage = serverResources.storage || 0;
      const serverCores = serverResources.cpuCores || 0;
      
      // Get all packages and find matching one
      const packagesResponse = await this.request<{ data: any[] }>('/packages');
      const packages = packagesResponse.data || [];
      
      // Find matching package by comparing specs
      let matchingPackage = packages.find(pkg => 
        pkg.memory === serverMemory && 
        pkg.primaryStorage === serverStorage && 
        pkg.cpuCores === serverCores
      );
      
      // If no exact match, find closest match
      if (!matchingPackage && packages.length > 0) {
        matchingPackage = packages.find(pkg => 
          pkg.memory === serverMemory && pkg.cpuCores === serverCores
        ) || packages[0];
      }
      
      if (!matchingPackage) {
        log(`No matching package found for server ${serverId}`, 'virtfusion');
        return null;
      }
      
      // Use the correct endpoint for getting OS templates available for a package
      const data = await this.request<{ data: any }>(`/media/templates/fromServerPackageSpec/${matchingPackage.id}`);
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
    
    // Get resources from settings.resources (actual allocation) or fallback to resources
    const settingsResources = (server as any).settings?.resources || {};
    const resources = server.resources || {};
    const vcpu = settingsResources.cpuCores || resources.cpuCores || 1;
    const ram = settingsResources.memory || resources.memory || 1024;
    const disk = settingsResources.storage || resources.storage || 20;
    const trafficLimit = settingsResources.traffic || resources.traffic || 0;
    
    // Get location from server_info
    const locationName = server.server_info?.name || 'Unknown';
    
    // Get OS info - prefer template name from settings, then qemuAgent os.name
    const settingsOs = (server as any).os || {};
    const qemuAgentOs = (server as any).qemuAgent?.os || {};
    const osTemplateName = settingsOs.templateName || '';
    const osFullName = qemuAgentOs.name || '';
    const osName = osTemplateName || osFullName || server.os?.name || server.os?.dist || 'Linux';
    const osDistro = qemuAgentOs.dist || server.os?.dist || 'linux';
    
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
          traffic: trafficLimit,
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
