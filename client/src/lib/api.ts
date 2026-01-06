import { Server } from "./types";

export interface NetworkInterface {
  name: string;
  mac: string;
  ipv4: Array<{
    address: string;
    gateway: string;
    netmask: string;
  }>;
  ipv6: Array<{
    address: string;
  }>;
}

export interface VncDetails {
  host?: string;
  port?: number;
  password?: string;
  url?: string;
}

export interface OsTemplate {
  id: number;
  name: string;
  group?: string;
}

class ApiClient {
  private baseUrl = '/api';

  async checkHealth(): Promise<{ status: string; errorCode?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json();
      return data;
    } catch (error) {
      return { status: 'error', errorCode: 'NETWORK_ERROR' };
    }
  }

  async listServers(): Promise<Server[]> {
    const response = await fetch(`${this.baseUrl}/servers`);
    if (!response.ok) throw new Error('Failed to fetch servers');
    return response.json();
  }

  async getServer(id: string): Promise<Server> {
    const response = await fetch(`${this.baseUrl}/servers/${id}`);
    if (!response.ok) throw new Error('Failed to fetch server');
    return response.json();
  }

  async powerAction(id: string, action: 'boot' | 'reboot' | 'shutdown' | 'poweroff'): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/power`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    if (!response.ok) throw new Error('Failed to perform power action');
    return response.json();
  }

  async getMetrics(id: string): Promise<{ cpu: number[], ram: number[], net: number[] }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/metrics`);
    if (!response.ok) throw new Error('Failed to fetch metrics');
    return response.json();
  }

  async getLiveStats(id: string): Promise<{ 
    cpu_usage: number, 
    ram_usage: number, 
    disk_usage: number, 
    memory_total_mb?: number,
    memory_used_mb?: number,
    memory_free_mb?: number,
    disk_used_gb?: number,
    disk_total_gb?: number,
    running?: boolean 
  }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/stats`);
    if (!response.ok) throw new Error('Failed to fetch live stats');
    return response.json();
  }

  async getVncDetails(id: string): Promise<{
    vnc: {
      ip: string;
      port: number;
      password: string;
      enabled: boolean;
      wss: {
        token: string;
        url: string;
      };
    };
  }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/vnc`);
    if (!response.ok) throw new Error('Failed to fetch VNC details');
    return response.json();
  }

  async enableVnc(id: string): Promise<{
    vnc: {
      ip: string;
      port: number;
      password: string;
      enabled: boolean;
      wss: {
        token: string;
        url: string;
      };
    };
  }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/vnc/enable`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to enable VNC');
    return response.json();
  }

  async disableVnc(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/vnc/disable`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to disable VNC');
  }

  async getTrafficHistory(id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/traffic`);
    if (!response.ok) throw new Error('Failed to fetch traffic data');
    return response.json();
  }

  async getNetworkInfo(id: string): Promise<{ interfaces: NetworkInterface[] }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/network`);
    if (!response.ok) throw new Error('Failed to fetch network info');
    return response.json();
  }

  async getOsTemplates(id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/os-templates`);
    if (!response.ok) throw new Error('Failed to fetch OS templates');
    return response.json();
  }

  async getReinstallTemplates(id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/reinstall/templates`);
    if (!response.ok) throw new Error('Failed to fetch available templates');
    return response.json();
  }

  async renameServer(id: string, name: string): Promise<{ success: boolean; name: string }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!response.ok) throw new Error('Failed to rename server');
    return response.json();
  }

  async reinstallServer(id: string, osId: number, hostname: string): Promise<{ success: boolean; error?: string; data?: { generatedPassword?: string } }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/reinstall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ osId, hostname })
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to reinstall server');
    }
    return response.json();
  }


  async updateServerName(id: string, name: string): Promise<{ success: boolean; name: string }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update server name');
    }
    return response.json();
  }

  async getBuildStatus(id: string): Promise<{
    state: string;
    phase: 'queued' | 'building' | 'complete' | 'error';
    buildFailed: boolean;
    suspended: boolean;
    commissionStatus: number;
    isComplete: boolean;
    isError: boolean;
    isBuilding: boolean;
  }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/build-status`);
    if (!response.ok) throw new Error('Failed to fetch build status');
    return response.json();
  }

  async getConsoleUrl(id: string): Promise<{ 
    url?: string;
    authUrl?: string;
    vncUrl?: string;
    twoStep?: boolean;
    embedded?: boolean;
    vnc?: { 
      wsUrl?: string;
      ip: string; 
      port: number; 
      password: string; 
    }; 
  }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/console-url`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to generate console URL');
    return response.json();
  }

  // User Profile endpoints
  async getUserProfile(): Promise<{
    id: number | string;
    name: string;
    email: string;
    extRelationId?: string;
    virtFusionUserId?: number | null;
    enabled?: boolean;
    timezone?: string;
    twoFactorAuth?: boolean;
    created?: string;
    updated?: string;
    createdAt?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/user/profile`);
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return response.json();
  }

  async updateUserProfile(updates: { name?: string; email?: string; timezone?: string }): Promise<{
    id: number;
    name: string;
    email: string;
    timezone?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/user/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update user profile');
    return response.json();
  }

  async changePassword(newPassword: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/user/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    if (!response.ok) throw new Error('Failed to change password');
    return response.json();
  }

  async login(email: string, password: string): Promise<{ user: { id: number; email: string; name: string } }> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Invalid email or password');
    }
    return response.json();
  }

  async register(email: string, password: string, name?: string): Promise<{ user: { id: number; email: string; name: string } }> {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Registration failed');
    }
    return response.json();
  }

  async logout(): Promise<void> {
    await fetch(`${this.baseUrl}/auth/logout`, { method: 'POST' });
  }

  async getAuthUser(): Promise<{ user: { id: number; email: string; name: string; extRelationId: string } } | null> {
    const response = await fetch(`${this.baseUrl}/auth/me`);
    if (!response.ok) return null;
    return response.json();
  }
}

export const api = new ApiClient();
