import { Server } from "./types";

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
}

export const api = new ApiClient();
