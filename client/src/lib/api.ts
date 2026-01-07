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

  // Server Cancellation endpoints
  
  // Get all pending cancellations for the current user (for badges on server list)
  async getAllCancellations(): Promise<{
    cancellations: Record<string, { scheduledDeletionAt: string; reason: string | null; mode: 'grace' | 'immediate' }>;
  }> {
    const response = await fetch(`${this.baseUrl}/cancellations`);
    if (!response.ok) throw new Error('Failed to fetch cancellations');
    return response.json();
  }
  
  async getCancellationStatus(id: string): Promise<{
    cancellation: {
      id: number;
      auth0UserId: string;
      virtfusionServerId: string;
      serverName: string | null;
      reason: string | null;
      status: string;
      mode: 'grace' | 'immediate';
      requestedAt: string;
      scheduledDeletionAt: string;
      revokedAt: string | null;
      completedAt: string | null;
    } | null;
  }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/cancellation`);
    if (!response.ok) throw new Error('Failed to fetch cancellation status');
    return response.json();
  }

  async requestCancellation(id: string, reason?: string, mode: 'grace' | 'immediate' = 'grace'): Promise<{ success: boolean; cancellation: any }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/cancellation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, mode })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to request cancellation');
    }
    return response.json();
  }

  async revokeCancellation(id: string): Promise<{ success: boolean; cancellation: any }> {
    const response = await fetch(`${this.baseUrl}/servers/${id}/cancellation`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to revoke cancellation');
    }
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

  async getAuthUser(): Promise<{ user: { id: number; email: string; name: string; extRelationId: string; isAdmin?: boolean } } | null> {
    const response = await fetch(`${this.baseUrl}/auth/me`);
    if (!response.ok) return null;
    return response.json();
  }

  async getCurrentUser(): Promise<{ user: { id: number | string; email: string; name?: string; isAdmin?: boolean } }> {
    const response = await fetch(`${this.baseUrl}/auth/me`);
    if (!response.ok) throw new Error('Not authenticated');
    return response.json();
  }

  async getPlans(): Promise<{ plans: any[] }> {
    const response = await fetch(`${this.baseUrl}/plans`);
    if (!response.ok) throw new Error('Failed to fetch plans');
    return response.json();
  }

  async getLocations(): Promise<{ locations: any[] }> {
    const response = await fetch(`${this.baseUrl}/locations`);
    if (!response.ok) throw new Error('Failed to fetch locations');
    return response.json();
  }

  async getMe(): Promise<{ user: any; balance: number; balanceFormatted: string }> {
    const response = await fetch(`${this.baseUrl}/me`);
    if (!response.ok) throw new Error('Failed to fetch user info');
    return response.json();
  }

  async getWallet(): Promise<{ wallet: any }> {
    const response = await fetch(`${this.baseUrl}/wallet`);
    if (!response.ok) throw new Error('Failed to fetch wallet');
    return response.json();
  }

  async getWalletTransactions(): Promise<{ transactions: any[] }> {
    const response = await fetch(`${this.baseUrl}/wallet/transactions`);
    if (!response.ok) throw new Error('Failed to fetch transactions');
    return response.json();
  }

  async createTopup(amountCents: number): Promise<{ url: string }> {
    const response = await fetch(`${this.baseUrl}/wallet/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create checkout');
    }
    return response.json();
  }

  async getPlanTemplates(planId: number): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/plans/${planId}/templates`);
    if (!response.ok) throw new Error('Failed to fetch OS templates');
    return response.json();
  }

  async deployServer(data: { planId: number; osId?: number; hostname?: string; locationCode?: string }): Promise<{ orderId: number; serverId: number; success: boolean }> {
    const response = await fetch(`${this.baseUrl}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to deploy server');
    }
    return response.json();
  }

  async getDeployOrder(orderId: number): Promise<{ order: any }> {
    const response = await fetch(`${this.baseUrl}/deploy/${orderId}`);
    if (!response.ok) throw new Error('Failed to fetch order');
    return response.json();
  }

  async getStripeStatus(): Promise<{
    configured: boolean;
    publishableKey?: string;
    error?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/billing/stripe/status`);
    if (!response.ok) throw new Error('Failed to fetch Stripe status');
    return response.json();
  }

  async createBillingPortalSession(): Promise<{ url: string }> {
    const response = await fetch(`${this.baseUrl}/billing/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create billing portal session');
    }
    return response.json();
  }

  async getPaymentMethods(): Promise<{ paymentMethods: Array<{
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }> }> {
    const response = await fetch(`${this.baseUrl}/billing/payment-methods`);
    if (!response.ok) throw new Error('Failed to fetch payment methods');
    return response.json();
  }

  async createSetupIntent(): Promise<{ clientSecret: string }> {
    const response = await fetch(`${this.baseUrl}/billing/setup-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create setup intent');
    }
    return response.json();
  }

  async deletePaymentMethod(id: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/billing/payment-methods/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete payment method');
    }
    return response.json();
  }

  async getTransactions(): Promise<{ transactions: Array<{
    id: number;
    type: string;
    amountCents: number;
    createdAt: string;
    stripeEventId?: string;
    metadata?: Record<string, unknown>;
  }> }> {
    const response = await fetch(`${this.baseUrl}/billing/transactions`);
    if (!response.ok) throw new Error('Failed to fetch transactions');
    return response.json();
  }

  async getStripePublishableKey(): Promise<{ publishableKey: string }> {
    const response = await fetch(`${this.baseUrl.replace('/api', '')}/api/stripe/publishable-key`);
    if (!response.ok) throw new Error('Failed to fetch Stripe publishable key');
    return response.json();
  }

}

export const api = new ApiClient();
