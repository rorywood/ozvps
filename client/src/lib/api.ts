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

  async powerAction(id: string, action: 'boot' | 'reboot' | 'shutdown'): Promise<{ success: boolean }> {
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

  async reinstallServer(id: string, osId: number, hostname?: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/reinstall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ osId, hostname })
    });
    if (!response.ok) throw new Error('Failed to reinstall server');
    return response.json();
  }
}

export const api = new ApiClient();
