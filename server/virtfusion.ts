import { log } from './log';

// Request timeout in milliseconds (10 seconds)
const REQUEST_TIMEOUT_MS = 10000;

// Cache TTL in milliseconds (5 seconds - short for real-time power status)
const CACHE_TTL_MS = 5000;

// Simple in-memory cache for server data
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();

  // Maximum age for stale data (5 minutes) - used as fallback when fresh fetch fails
  private readonly STALE_TTL_MS = 5 * 60 * 1000;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      // Don't delete - keep for stale fallback
      return null;
    }
    return entry.data;
  }

  // Get stale data even if expired (but not older than STALE_TTL_MS)
  getStale<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    // Allow stale data up to 5 minutes old
    if (Date.now() - entry.timestamp > this.STALE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

const apiCache = new SimpleCache();

// Custom error class for API timeouts
export class VirtFusionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VirtFusionTimeoutError';
  }
}

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
  timezone?: string;
  twoFactorAuth?: boolean;
  created?: string;
  updated?: string;
}

interface VirtFusionUserUpdateRequest {
  name?: string;
  email?: string;
  timezone?: string;
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

  // Generate a deterministic numeric ID from a string (for VirtFusion extRelationId which must be numeric)
  // Uses a stable hash algorithm so the same email always produces the same ID
  // VirtFusion extRelationId must be between 1 and 18446744073709551615
  generateNumericId(email: string): string {
    const str = email.toLowerCase().trim();
    // Use a simple but stable hash
    let hash1 = 0;
    let hash2 = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash1 = (hash1 * 31 + char) >>> 0;
      hash2 = (hash2 * 37 + char) >>> 0;
    }
    // Ensure we stay within VirtFusion's limit (max 18446744073709551615)
    // Use modulo to keep numbers reasonable - max 10 digits each part
    const part1 = (hash1 % 1000000000) + 1; // 1 to 999999999
    const part2 = hash2 % 1000000000;       // 0 to 999999999
    // Combined gives us a 10-18 digit number, well within limits
    return `${part1}${part2}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        log(`VirtFusion API error: ${response.status} ${errorText}`, 'virtfusion');
        
        // Try to parse error response for conflict (409) which may contain user data
        if (response.status === 409) {
          try {
            const errorJson = JSON.parse(errorText);
            throw Object.assign(new Error(`VirtFusion API error: 409 Conflict`), { 
              status: 409, 
              data: errorJson 
            });
          } catch (parseError) {
            throw new Error(`VirtFusion API error: 409 Conflict`);
          }
        }
        
        throw new Error(`VirtFusion API error: ${response.status} ${response.statusText}`);
      }

      // Handle empty responses (common for DELETE operations)
      const text = await response.text();
      if (!text || text.trim() === '') {
        return {} as T;
      }
      
      return JSON.parse(text);
    } catch (error: any) {
      clearTimeout(timeoutId);
      // Comprehensive timeout detection for various fetch implementations (native fetch, node-fetch, undici)
      const isTimeoutError = 
        // AbortController abort
        error.name === 'AbortError' || 
        // Native TimeoutError
        error.name === 'TimeoutError' ||
        // Transport layer timeout codes
        error.cause?.code === 'ECONNABORTED' ||
        error.cause?.code === 'ETIMEDOUT' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        // Undici FetchError with AbortError cause
        (error.name === 'FetchError' && error.cause?.name === 'AbortError') ||
        // Undici FetchError with type === 'aborted' (no cause)
        (error.name === 'FetchError' && error.type === 'aborted') ||
        // Undici/node-fetch timeout detection via cause
        error.cause?.name === 'TimeoutError' ||
        error.cause?.name === 'AbortError' ||
        // Message-based detection as fallback for any fetch implementation
        (error.message && (
          error.message.toLowerCase().includes('timeout') ||
          error.message.toLowerCase().includes('timed out') ||
          error.message.toLowerCase().includes('aborted')
        ));
      
      if (isTimeoutError) {
        log(`VirtFusion API timeout after ${REQUEST_TIMEOUT_MS}ms - URL: ${url}`, 'virtfusion');
        throw new VirtFusionTimeoutError(`VirtFusion API timeout after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
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

  /**
   * Get connection status by checking if VirtFusion API is responding
   * Returns: { connected: boolean, errorType?: string }
   */
  async getConnectionStatus(): Promise<{ connected: boolean; errorType?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/connect`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json',
        },
      });

      // Any successful response means API is working
      // Don't check for specific status codes or license issues
      if (response.ok) {
        return { connected: true };
      }

      // Even 401/403 means API is responding, just auth issues
      // This is fine for health check purposes
      if (response.status === 401 || response.status === 403) {
        log('VirtFusion API responding but auth issue detected', 'virtfusion');
        return { connected: true }; // API is up, just config issue
      }

      // Only consider 5xx errors as API being down
      if (response.status >= 500) {
        return { connected: false, errorType: 'api_error' };
      }

      // For any other status, consider API as available
      return { connected: true };
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        return { connected: false, errorType: 'timeout' };
      }
      return { connected: false, errorType: 'network_error' };
    }
  }

  async getUserByExtRelationId(extRelationId: string): Promise<VirtFusionUser | null> {
    try {
      const encodedExtRelationId = encodeURIComponent(extRelationId);
      const data = await this.request<{ data: VirtFusionUser }>(`/users/${encodedExtRelationId}/byExtRelation`);
      return data.data;
    } catch (error) {
      log(`Failed to fetch user by extRelationId ${extRelationId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async findUserByEmail(email: string): Promise<VirtFusionUser | null> {
    try {
      // VirtFusion doesn't have a direct email lookup API
      // We use the email as extRelationId for users created by our panel
      const normalizedEmail = email.toLowerCase().trim();
      
      // Try to find by extRelationId = email (for users we created)
      const user = await this.getUserByExtRelationId(normalizedEmail);
      if (user) {
        log(`Found VirtFusion user by email extRelationId: ${email} (ID: ${user.id})`, 'virtfusion');
        return user;
      }
      
      return null;
    } catch (error: any) {
      log(`Failed to find user by email ${email}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async createUser(email: string, name: string): Promise<VirtFusionUser | null> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      // Generate a numeric extRelationId from email hash (VirtFusion requires numeric ID)
      const numericExtRelationId = this.generateNumericId(normalizedEmail);
      const data = await this.request<{ data: VirtFusionUser }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          name,
          extRelationId: numericExtRelationId,
          sendMail: false,
        }),
      });
      log(`Created VirtFusion user: ${email} with ID ${data.data.id} and extRelationId ${numericExtRelationId}`, 'virtfusion');
      return data.data;
    } catch (error: any) {
      // If user already exists (409), try to extract user data from response
      if (error.status === 409 || error.message?.includes('409')) {
        log(`User ${email} already exists in VirtFusion`, 'virtfusion');
        
        // Check if 409 response contains user data
        if (error.data?.data) {
          log(`Found user data in 409 response for ${email}`, 'virtfusion');
          return error.data.data as VirtFusionUser;
        }
        
        log(`User ${email} exists but cannot retrieve their data - please link manually`, 'virtfusion');
        return null;
      }
      log(`Failed to create VirtFusion user ${email}: ${error}`, 'virtfusion');
      return null;
    }
  }

  // NOTE: VirtFusion API v1 does NOT support listing users (GET /users returns 405)
  // Users can only be looked up by ID or extRelationId
  // If a user exists with a different extRelationId format, they cannot be automatically linked

  async findOrCreateUser(email: string, name: string): Promise<VirtFusionUser | null> {
    const normalizedEmail = email.toLowerCase().trim();
    
    // First, try to look up by the numeric extRelationId we would generate
    const expectedExtRelationId = this.generateNumericId(normalizedEmail);
    let user = await this.getUserByExtRelationId(expectedExtRelationId);
    if (user) {
      log(`Found existing VirtFusion user by expected extRelationId: ${expectedExtRelationId}`, 'virtfusion');
      return user;
    }
    
    // Try to create - this handles new users
    user = await this.createUser(email, name);
    if (user) {
      return user;
    }
    
    // If creation failed (409 conflict), user exists but with different extRelationId format
    // Try the legacy email-as-extRelationId lookup (for users created with old format)
    log(`Creation failed for ${email}, trying legacy email-as-extRelationId lookup...`, 'virtfusion');
    user = await this.findUserByEmail(email);
    
    if (!user) {
      // User exists in VirtFusion but with incompatible extRelationId - cannot auto-link
      log(`User ${email} exists in VirtFusion but cannot be auto-linked. Admin intervention required.`, 'virtfusion');
    }
    
    return user;
  }

  async getUserById(userId: number): Promise<VirtFusionUser | null> {
    try {
      // VirtFusion uses /users/{id} endpoint for getting user by ID
      const data = await this.request<{ data: VirtFusionUser }>(`/users/${userId}`);
      return data.data;
    } catch (error: any) {
      if (!error?.message?.includes('404')) {
        log(`Failed to fetch user by ID ${userId}: ${error}`, 'virtfusion');
      }
      return null;
    }
  }

  async updateUserById(userId: number, updates: { extRelationId?: string; name?: string; email?: string }): Promise<VirtFusionUser | null> {
    try {
      log(`Updating VirtFusion user ${userId} with: ${JSON.stringify(updates)}`, 'virtfusion');
      const data = await this.request<{ data: VirtFusionUser }>(`/users/${userId}/byId`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      log(`Successfully updated user ${userId}`, 'virtfusion');
      return data.data;
    } catch (error) {
      log(`Failed to update user by ID ${userId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async updateUser(extRelationId: string, updates: VirtFusionUserUpdateRequest): Promise<VirtFusionUser | null> {
    try {
      const encodedExtRelationId = encodeURIComponent(extRelationId);
      const data = await this.request<{ data: VirtFusionUser }>(`/users/${encodedExtRelationId}/byExtRelation`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      return data.data;
    } catch (error) {
      log(`Failed to update user ${extRelationId}: ${error}`, 'virtfusion');
      throw error;
    }
  }

  async resetUserPassword(extRelationId: string, newPassword: string): Promise<boolean> {
    try {
      const encodedExtRelationId = encodeURIComponent(extRelationId);
      await this.request(`/users/${encodedExtRelationId}/byExtRelation/resetPassword`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
      return true;
    } catch (error) {
      log(`Failed to reset password for user ${extRelationId}: ${error}`, 'virtfusion');
      throw error;
    }
  }

  async listServersByUserId(userId: number, useCache = true) {
    const cacheKey = `servers:user:${userId}`;
    
    // Check cache first
    if (useCache) {
      const cached = apiCache.get<ReturnType<typeof this.transformServer>[]>(cacheKey);
      if (cached) {
        log(`Cache hit for user ${userId} servers`, 'virtfusion');
        return cached;
      }
    }
    
    // Fetch with remoteState=true to get live power status from hypervisor
    const response = await this.request<{ data: VirtFusionServerResponse[] }>(`/servers/user/${userId}?remoteState=true`);
    const servers = response.data.map(server => this.transformServer(server));
    
    // Cache the result
    apiCache.set(cacheKey, servers);
    return servers;
  }

  async listServers(useCache = true) {
    const cacheKey = 'servers:all';
    
    // Check cache first
    if (useCache) {
      const cached = apiCache.get<ReturnType<typeof this.transformServer>[]>(cacheKey);
      if (cached) {
        log(`Cache hit for all servers`, 'virtfusion');
        return cached;
      }
    }
    
    // Fetch with remoteState=true to get live power status from hypervisor
    const response = await this.request<{ data: VirtFusionServerResponse[] }>('/servers?remoteState=true');
    const servers = response.data.map(server => this.transformServer(server));
    
    // Cache the result
    apiCache.set(cacheKey, servers);
    return servers;
  }

  async getServer(serverId: string, useCache = false) {
    const cacheKey = `server:${serverId}`;

    // Check cache first
    if (useCache) {
      const cached = apiCache.get<ReturnType<typeof this.transformServer>>(cacheKey);
      if (cached) {
        log(`Cache hit for server ${serverId}`, 'virtfusion');
        return cached;
      }
    }

    try {
      // Fetch with remoteState=true to get live power status from hypervisor
      const response = await this.request<{ data: VirtFusionServerResponse & { remoteState?: { running?: boolean; state?: string } } }>(`/servers/${serverId}?remoteState=true`);
      const server = this.transformServer(response.data);

      // Cache the result
      apiCache.set(cacheKey, server);
      return server;
    } catch (error: any) {
      // If fetch fails, try to return stale cached data (up to 5 minutes old)
      // This prevents brief "Server not found" errors during VirtFusion API hiccups
      const staleData = apiCache.getStale<ReturnType<typeof this.transformServer>>(cacheKey);
      if (staleData) {
        log(`VirtFusion API failed for server ${serverId}, using stale cache: ${error.message}`, 'virtfusion');
        return staleData;
      }
      // No stale data available, re-throw the error
      throw error;
    }
  }
  
  // Invalidate server cache after power actions or changes
  invalidateServerCache(serverId?: string) {
    if (serverId) {
      apiCache.invalidate(`server:${serverId}`);
    }
    apiCache.invalidatePrefix('servers:');
  }

  async getServerWithVnc(serverId: string): Promise<{ vnc?: { ip: string; port: number; enabled: boolean; password?: string; wss?: { token: string; url: string } } } | null> {
    try {
      const response = await this.request<{ data: any }>(`/servers/${serverId}`);
      const server = response.data;
      return {
        vnc: server.vnc || null,
      };
    } catch (error) {
      log(`Failed to fetch server VNC info for ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async getServerVncAccess(serverId: string): Promise<{ ip: string; port: number; password: string; wss: { token: string; url: string } } | null> {
    try {
      const response = await this.request<{ data: { vnc: { ip: string; port: number; password: string; wss: { token: string; url: string } } } }>(`/servers/${serverId}/vnc`);
      return response.data.vnc || null;
    } catch (error) {
      log(`Failed to fetch VNC access for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async getServerOwner(serverId: string): Promise<{ id: number; extRelationId: string | null; name: string; email: string } | null> {
    try {
      const response = await this.request<{ data: { owner: { id: number; extRelationId: string | null; name: string; email: string } } }>(`/servers/${serverId}?with=owner`);
      log(`Server ${serverId} owner data: ${JSON.stringify(response.data.owner)}`, 'virtfusion');
      return response.data.owner || null;
    } catch (error) {
      log(`Failed to fetch server owner for ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async powerAction(serverId: string, action: 'start' | 'stop' | 'restart' | 'poweroff') {
    // Map action to VirtFusion endpoint
    // VirtFusion has: boot, shutdown (graceful), restart, poweroff (hard)
    const endpoint = action === 'start' ? 'boot' :
                     action === 'stop' ? 'shutdown' :
                     action === 'poweroff' ? 'poweroff' :
                     'restart';
    await this.request(`/servers/${serverId}/power/${endpoint}`, {
      method: 'POST',
    });

    // Invalidate cache since server state has changed
    this.invalidateServerCache(serverId);

    return { success: true };
  }

  async suspendServer(serverId: string) {
    try {
      // First, power off the server before suspending
      // VirtFusion suspend alone doesn't stop the VM, and we may not be able to poweroff after suspend
      try {
        await this.request(`/servers/${serverId}/power/poweroff`, {
          method: 'POST',
        });
        log(`Server ${serverId} powered off before suspension`, 'virtfusion');
      } catch (powerError: any) {
        // Server might already be stopped - that's fine
        log(`Could not poweroff server ${serverId} (may already be stopped): ${powerError.message}`, 'virtfusion');
      }

      // Then flag the server as suspended in VirtFusion
      await this.request(`/servers/${serverId}/suspend`, {
        method: 'POST',
      });
      log(`Server ${serverId} flagged as suspended in VirtFusion`, 'virtfusion');

      // Invalidate cache since server state has changed
      this.invalidateServerCache(serverId);

      log(`Server ${serverId} suspended successfully`, 'virtfusion');
      return { success: true };
    } catch (error: any) {
      log(`Failed to suspend server ${serverId}: ${error.message}`, 'virtfusion');
      throw error;
    }
  }

  async unsuspendServer(serverId: string) {
    try {
      // First, unsuspend in VirtFusion to allow the server to be managed again
      await this.request(`/servers/${serverId}/unsuspend`, {
        method: 'POST',
      });
      log(`Server ${serverId} unsuspend request sent to VirtFusion`, 'virtfusion');

      // Give VirtFusion a moment to process the unsuspend
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify the server is actually unsuspended
      const verifyResponse = await this.request<{ data: any }>(`/servers/${serverId}`);
      if (verifyResponse.data.suspended) {
        log(`WARNING: Server ${serverId} still shows as suspended after unsuspend request`, 'virtfusion');
        // Try again
        await this.request(`/servers/${serverId}/unsuspend`, { method: 'POST' });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Then boot the server so the user doesn't have to manually power it on
      try {
        await this.request(`/servers/${serverId}/power/boot`, {
          method: 'POST',
        });
        log(`Server ${serverId} booted after unsuspension`, 'virtfusion');
      } catch (bootError: any) {
        // Server might already be running or have issues - log but don't fail
        log(`Could not boot server ${serverId} after unsuspension: ${bootError.message}`, 'virtfusion');
      }

      // Invalidate cache since server state has changed
      this.invalidateServerCache(serverId);

      log(`Server ${serverId} unsuspended successfully`, 'virtfusion');
      return { success: true };
    } catch (error: any) {
      log(`Failed to unsuspend server ${serverId}: ${error.message}`, 'virtfusion');
      throw error;
    }
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
        const memTotal = parseInt(memory.memtotal, 10) || 0;
        const memAvailable = parseInt(memory.memavailable, 10) || 0;
        if (memTotal > 0) {
          ramUsage = ((memTotal - memAvailable) / memTotal) * 100;
        }
      } else if (memory.memtotal && memory.memfree) {
        const memTotal = parseInt(memory.memtotal, 10) || 0;
        const memFree = parseInt(memory.memfree, 10) || 0;
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
          const capacity = parseInt(diskData.capacity, 10) || 0;
          const physical = parseInt(diskData.physical, 10) || 0;
          diskTotalBytes += capacity;
          diskUsedBytes += physical;
        }
      }
      
      if (diskTotalBytes > 0) {
        diskUsage = (diskUsedBytes / diskTotalBytes) * 100;
      }
      
      // Memory details for display
      const memTotalMB = Math.round((parseInt(memory.memtotal, 10) || 0) / 1024);
      const memUsedMB = Math.round(((parseInt(memory.memtotal, 10) || 0) - (parseInt(memory.memavailable, 10) || parseInt(memory.memfree, 10) || 0)) / 1024);
      const memFreeMB = Math.round((parseInt(memory.memavailable, 10) || parseInt(memory.memfree, 10) || 0) / 1024);
      
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
      // Get actual traffic usage stats from VirtFusion
      const trafficResponse = await this.request<{ data: any }>(`/servers/${serverId}/traffic`);
      const trafficData = trafficResponse.data;
      
      // Also get server details for network speed info
      const serverResponse = await this.request<{ data: any }>(`/servers/${serverId}`);
      const server = serverResponse.data;
      
      // Get network interface speed limits (in bytes/sec, convert to Mbps)
      const networkInterface = server.network?.interfaces?.[0];
      const inSpeedKbps = networkInterface?.inAverage || 0;
      const outSpeedKbps = networkInterface?.outAverage || 0;
      // VirtFusion uses KB/s, convert to Mbps: KB/s * 8 / 1000 = Mbps
      const inSpeedMbps = Math.round((inSpeedKbps * 8) / 1000);
      const outSpeedMbps = Math.round((outSpeedKbps * 8) / 1000);
      
      // Get traffic limit from server resources
      const trafficLimit = server.settings?.resources?.traffic || server.traffic?.public?.currentPeriod?.limit || 0;
      
      // Get current billing period info
      const billingPeriod = server.traffic?.public?.currentPeriod || null;
      
      // Parse monthly data
      const monthlyData = trafficData?.monthly || [];
      const currentMonthData = monthlyData[0] || null;
      
      return {
        current: {
          rx: currentMonthData?.rx || 0,        // bytes received
          tx: currentMonthData?.tx || 0,        // bytes transmitted  
          total: currentMonthData?.total || 0,  // total bytes
          limit: trafficLimit,                   // GB limit
          month: currentMonthData?.month || new Date().getMonth() + 1,
          periodStart: currentMonthData?.start || billingPeriod?.start || null,
          periodEnd: currentMonthData?.end || billingPeriod?.end || null,
        },
        network: {
          inSpeedMbps,
          outSpeedMbps,
          portSpeed: Math.max(inSpeedMbps, outSpeedMbps),
        },
        history: monthlyData,
      };
    } catch (error) {
      log(`Failed to fetch traffic history for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async getServerTrafficStatistics(serverId: string, period: string = '30m') {
    try {
      // VirtFusion API: GET /servers/{serverId}/traffic/statistics
      // Provides real-time network traffic data for graphing
      // Period options: 30m, 1h, 12h, 1d, 1w
      // Note: This endpoint may not be available on all VirtFusion instances
      const response = await this.request<any>(`/servers/${serverId}/traffic/statistics?period=${period}`);
      
      log(`Traffic statistics raw response for ${serverId}: ${JSON.stringify(response).slice(0, 1000)}`, 'virtfusion');
      
      // VirtFusion may return data in various structures:
      // 1. { data: [...] } - wrapped in data property
      // 2. { data: { points: [...] } } - nested with points
      // 3. [...] - direct array at root
      // 4. { points: [...] } - points at root
      const statsData = response?.data ?? response;
      
      // VirtFusion returns data in various possible formats - handle flexibly
      let points: any[] = [];
      if (Array.isArray(statsData)) {
        points = statsData;
      } else if (Array.isArray(response)) {
        points = response;
      } else if (statsData?.points && Array.isArray(statsData.points)) {
        points = statsData.points;
      } else if (statsData?.data && Array.isArray(statsData.data)) {
        points = statsData.data;
      } else if (statsData?.statistics && Array.isArray(statsData.statistics)) {
        points = statsData.statistics;
      } else if (response?.points && Array.isArray(response.points)) {
        points = response.points;
      }
      
      log(`Traffic statistics parsed ${points.length} points for ${serverId}`, 'virtfusion');
      
      return {
        supported: true,
        points,
        interval: statsData?.interval || response?.interval || 60,
        period: period,
      };
    } catch (error: any) {
      // Check if this is a 404 error - endpoint not available on this VirtFusion instance
      const is404 = error?.message?.includes('404') || error?.status === 404;
      if (is404) {
        log(`Traffic statistics endpoint not available for server ${serverId} (VirtFusion doesn't support this feature)`, 'virtfusion');
        return {
          supported: false,
          points: [],
          interval: 60,
          period: period,
        };
      }
      log(`Failed to fetch traffic statistics for server ${serverId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  async getServerBuildStatus(serverId: string) {
    try {
      const response = await this.request<{ data: any }>(`/servers/${serverId}`);
      const server = response.data;

      // Extract the raw build state information
      const state = server.state || '';
      const buildFailed = server.buildFailed === true;
      const suspended = server.suspended === true;
      const commissionStatus = server.commissionStatus; // 0 = not built, 1 = building, 2 = paused, 3 = complete
      // CRITICAL FIX: Field is commissionStatus, not commissioned!
      const commissioned = commissionStatus;

      // Check if server is in a transitional/building state
      // IMPORTANT: commissioned takes priority - if 0, 1, or undefined, server is not ready
      const isTransitionalState = commissioned === 0 || commissioned === 1 || commissioned === undefined || commissioned === null || ['queued', 'pending', 'provisioning', 'building', 'installing'].includes(state);

      // Determine the build phase based on VirtFusion state
      // Important: VirtFusion temporarily sets buildFailed=true during rebuilds
      // Only consider it a real error if buildFailed is true AND state is NOT transitional
      let phase: 'queued' | 'building' | 'complete' | 'error' = 'building';

      if (commissioned === 0) {
        phase = 'queued'; // Not built yet
      } else if (commissioned === 1 || commissioned === undefined || commissioned === null || state === 'queued' || state === 'pending') {
        phase = 'building'; // Currently building or commissioned field not available yet
      } else if (state === 'provisioning' || state === 'building' || state === 'installing') {
        phase = 'building';
      } else if ((state === 'complete' || state === 'running') && commissioned === 3) {
        phase = 'complete'; // Fully commissioned and complete
      } else if (buildFailed && !isTransitionalState) {
        // Only mark as error if buildFailed is true AND we're not in a building state
        phase = 'error';
      }

      // isError should only be true if we have a confirmed error (not during transition)
      const isRealError = buildFailed && !isTransitionalState && state !== 'complete' && state !== 'running';

      return {
        state,
        phase,
        buildFailed,
        suspended,
        commissionStatus,
        commissioned,
        isComplete: commissioned === 3 && (state === 'complete' || state === 'running') && !isRealError,
        isError: isRealError,
        isBuilding: isTransitionalState,
      };
    } catch (error) {
      log(`Failed to fetch build status for server ${serverId}: ${error}`, 'virtfusion');
      throw error;
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
    } catch (error: any) {
      // 423 Locked means VNC is already disabled or in process - treat as success
      if (error.message?.includes('423')) {
        log(`VNC already disabled for server ${serverId}`, 'virtfusion');
        return { disabled: true };
      }
      log(`Failed to disable VNC for server ${serverId}: ${error}`, 'virtfusion');
      throw error;
    }
  }

  async listServersWithStats(userId: number) {
    // First get the basic list of servers
    const response = await this.request<{ data: VirtFusionServerResponse[] }>(`/servers/user/${userId}`);
    const basicServers = response.data;
    
    // Then fetch each server individually with remoteState=true to get live stats
    // This is necessary because the bulk endpoint doesn't include remoteState data
    const enrichedServers = await Promise.all(
      basicServers.map(async (server) => {
        try {
          const detailedResponse = await this.request<{ data: VirtFusionServerResponse & { remoteState?: any } }>(`/servers/${server.id}?remoteState=true`);
          return this.transformServer(detailedResponse.data);
        } catch (error) {
          // If individual fetch fails, use basic data
          return this.transformServer(server);
        }
      })
    );
    
    return enrichedServers;
  }

  async generateServerLoginTokens(serverId: string, extRelationId: string, redirectTo?: string) {
    try {
      // Use the VirtFusion API to generate authentication tokens for a specific server
      // POST /users/{extRelationId}/serverAuthenticationTokens/{serverId}
      log(`Generating server token: serverId=${serverId}, extRelationId=${extRelationId}, redirectTo=${redirectTo}`, 'virtfusion');
      const body: any = {};
      if (redirectTo) {
        body.redirect_to = redirectTo;
      }
      const data = await this.request<{ data: any }>(`/users/${extRelationId}/serverAuthenticationTokens/${serverId}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      log(`Token generated successfully: ${JSON.stringify(data.data)}`, 'virtfusion');
      return data.data;
    } catch (error) {
      log(`Failed to generate login tokens for server ${serverId}: ${error}`, 'virtfusion');
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
      const body: any = {
        operatingSystemId: osId,
        sendMail: false, // Don't email password, return it in response instead
      };

      // Include hostname if provided
      if (hostname) {
        body.name = hostname;
      }

      log(`Reinstalling server ${serverId} with OS template ${osId}${hostname ? `, hostname: ${hostname}` : ''}`, 'virtfusion');

      const response = await this.request<{ data: any }>(`/servers/${serverId}/build`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // Invalidate cache since server state has changed
      this.invalidateServerCache(serverId);

      // Extract password from response - check all possible locations
      const password =
        (response as any).password ||
        response.data?.password ||
        response.data?.settings?.password ||
        response.data?.settings?.decryptedPassword ||
        undefined;

      return {
        ...response.data,
        password,
      };
    } catch (error) {
      log(`Failed to reinstall server ${serverId}: ${error}`, 'virtfusion');
      throw error;
    }
  }

  async resetServerPassword(serverId: string) {
    try {
      log(`Resetting password for server ${serverId}`, 'virtfusion');
      
      // First, get the server info to determine the OS type
      const serverInfo = await this.request<{ data: VirtFusionServerResponse }>(`/servers/${serverId}`);
      const osData = (serverInfo.data as any).os;
      const osDist = osData?.dist?.toLowerCase() || '';
      const osName = osData?.name?.toLowerCase() || '';
      
      // Determine the appropriate username based on OS
      // Windows uses "Administrator", Linux/BSD/etc use "root"
      let resetUser = 'root';
      if (osDist.includes('windows') || osName.includes('windows')) {
        resetUser = 'Administrator';
      }
      
      log(`Detected OS: ${osDist || osName || 'unknown'}, using user: ${resetUser}`, 'virtfusion');
      
      // VirtFusion API: POST /servers/{serverId}/resetPassword
      // Response includes expectedPassword field (admin API v4.1.0+)
      // Required: "user" parameter specifies which user's password to reset
      // Optional: "sendMail" parameter (v5.0.0+) controls email notification
      const data = await this.request<{
        data: {
          queueId?: number;
          expectedPassword?: string;
          password?: string;
          decryptedPassword?: string;
          system?: {
            success?: boolean;
            data?: {
              reset_password?: boolean;
            };
          };
        }
      }>(`/servers/${serverId}/resetPassword`, {
        method: 'POST',
        body: JSON.stringify({ user: resetUser, sendMail: false }),
      });

      // Log full response to debug structure
      log(`[PASSWORD RESET] Full response for ${serverId}: ${JSON.stringify(data.data)}`, 'virtfusion');

      // Check if guest agent responded successfully
      // VirtFusion returns data.system.data.reset_password: false when guest agent fails
      const resetPasswordSuccess = data.data?.system?.data?.reset_password;
      if (resetPasswordSuccess === false) {
        log(`Password reset for server ${serverId} failed: Guest agent not responding (reset_password=false)`, 'virtfusion');
        throw new Error('Password reset failed. The QEMU guest agent is not responding. Please wait 30-60 seconds after deployment and try again.');
      }

      // VirtFusion returns the new password via expectedPassword
      // Response includes: { queueId: number, expectedPassword: string }
      // The reset is queued and executed asynchronously, but password is returned immediately
      const newPassword = data.data?.expectedPassword || data.data?.decryptedPassword || data.data?.password || null;

      // Verify we actually got a password - without it, reset didn't work properly
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
        log(`Password reset for server ${serverId} failed: No password returned in response. Data: ${JSON.stringify(data.data)}`, 'virtfusion');
        throw new Error('Password reset failed. No password was returned by VirtFusion. The server may not be ready yet. Please wait 30-60 seconds and try again.');
      }

      // Invalidate cache since server credentials have changed
      this.invalidateServerCache(serverId);

      log(`Password reset for server ${serverId} completed successfully`, 'virtfusion');
      return { success: true, password: newPassword, username: resetUser };
    } catch (error) {
      log(`Failed to reset password for server ${serverId}: ${error}`, 'virtfusion');
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

  async updateServerName(serverId: string, name: string) {
    try {
      const data = await this.request<{ data: any }>(`/servers/${serverId}/modify/name`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      
      // Invalidate cache since server has been modified
      this.invalidateServerCache(serverId);
      
      return data.data;
    } catch (error) {
      log(`Failed to update server name for ${serverId}: ${error}`, 'virtfusion');
      throw error;
    }
  }

  private transformServer(server: VirtFusionServerResponse & { remoteState?: { running?: boolean; state?: string } }) {
    // Check remoteState first for live power status from hypervisor
    const remoteState = (server as any).remoteState;
    let status: 'running' | 'stopped' | 'provisioning' | 'error';

    // Check commissioned state FIRST before determining power status
    // commissioned: 0 = not built, 1 = building, 2 = paused, 3 = complete
    // CRITICAL: VirtFusion returns "commissionStatus" not "commissioned"!
    const rawServerData = server as any;
    const commissioned = rawServerData.commissionStatus ?? rawServerData.commissioned;

    // server.state is the COMMISSION state (queued, building, complete, etc.)
    // remoteState.state is the POWER state from hypervisor (running, stopped, etc.)
    // remoteState.running is a boolean for power state
    const commissionState = server.state?.toLowerCase() || '';
    const powerState = remoteState?.state?.toLowerCase() || '';

    // Priority: suspended > buildFailed > commissioned undefined/null > NOT COMMISSIONED (0 or 1) > commission state > power state
    if (server.suspended) {
      status = 'stopped';
    } else if (server.buildFailed) {
      status = 'error';
    } else if (commissioned === undefined || commissioned === null) {
      // CRITICAL: If commissioned field is not set yet (very new server), assume provisioning
      // This handles race condition where server is created but VirtFusion hasn't populated fields yet
      status = 'provisioning';
    } else if (commissioned === 0 || commissioned === 1) {
      // Server not yet commissioned or currently building - always show as provisioning
      status = 'provisioning';
    } else if (commissioned !== 3 && (commissionState === 'queued' || commissionState === 'building' || commissionState === 'deploying')) {
      // Commission state indicates building ONLY if not already commissioned
      // This prevents FQDN hostnames from getting stuck on 'provisioning' after commission completes
      status = 'provisioning';
    } else if (powerState) {
      // Use remoteState.state for power status - most reliable
      if (powerState === 'running' || powerState === 'on' || powerState === 'online') {
        status = 'running';
      } else if (powerState === 'stopped' || powerState === 'shutdown' || powerState === 'shutoff' || powerState === 'poweroff' || powerState === 'off' || powerState === 'paused') {
        status = 'stopped';
      } else {
        // Unknown power state, fall back to running boolean
        status = remoteState?.running ? 'running' : 'stopped';
      }
    } else if (remoteState && typeof remoteState.running === 'boolean') {
      // Use live power status from hypervisor boolean
      status = remoteState.running ? 'running' : 'stopped';
    } else {
      // Final fallback to state-based detection using other fields
      const stateValue = server.power_status || server.powerState || server.power || '';
      if (stateValue) {
        status = this.mapStatus(stateValue, server.suspended, server.buildFailed);
      } else if (commissioned === 3) {
        // If server is fully commissioned but no power state info available,
        // assume running (VirtFusion list endpoint may not include remoteState)
        status = 'running';
      } else {
        status = this.mapStatus(stateValue, server.suspended, server.buildFailed);
      }
    }
    
    // Get primary IP from network interfaces
    const primaryIp = server.network?.interfaces?.[0]?.ipv4?.[0]?.address || 'N/A';
    
    // Get resources from settings.resources (actual allocation) or fallback to resources
    const settingsResources = (server as any).settings?.resources || {};
    const resources = server.resources || {};
    const vcpu = settingsResources.cpuCores || resources.cpuCores || 1;
    const ram = settingsResources.memory || resources.memory || 1024;
    const disk = settingsResources.storage || resources.storage || 20;
    const trafficLimit = settingsResources.traffic || resources.traffic || 0;
    
    // Get location from hypervisor group (e.g. "Brisbane Node") or hypervisor name
    const rawServer = server as any;
    const locationName = rawServer.hypervisor?.group?.name || rawServer.hypervisor?.displayName || server.server_info?.name || 'Unknown';
    
    // Get OS info - prefer template name from settings, then qemuAgent os.name
    const settingsOs = (server as any).os || {};
    const qemuAgentOs = (server as any).qemuAgent?.os || {};
    const osTemplateName = settingsOs.templateName || '';
    const osFullName = qemuAgentOs.name || '';
    const osName = osTemplateName || osFullName || server.os?.name || server.os?.dist || '';
    const osDistro = qemuAgentOs.dist || server.os?.dist || 'linux';
    
    // A server needs setup if:
    // - commissioned === 0 (not built yet)
    // - commissioned === 1 (currently building)
    // - commissioned is undefined/null (very new server, fields not populated yet)
    // Note: commissioned is already checked above when determining status
    // commissioned: 0 = not built, 1 = building, 2 = paused, 3 = complete
    const needsSetup = commissioned === 0 || commissioned === 1 || commissioned === undefined || commissioned === null;
    
    // Get created date
    const createdAt = server.created_at || server.createdAt || new Date().toISOString();
    
    // Calculate live stats from remoteState if available
    let cpuUsage = 0;
    let ramUsage = 0;
    let diskUsage = 0;
    
    if (remoteState && status === 'running') {
      // CPU usage - can be a number or in a cpu object
      if (typeof remoteState.cpu === 'number') {
        cpuUsage = Math.min(100, Math.max(0, remoteState.cpu));
      } else if (typeof remoteState.cpu === 'string') {
        cpuUsage = Math.min(100, Math.max(0, parseFloat(remoteState.cpu) || 0));
      } else if (remoteState.cpu?.usage !== undefined) {
        cpuUsage = Math.min(100, Math.max(0, parseFloat(remoteState.cpu.usage) || 0));
      }
      
      // RAM usage from memory stats
      const memory = remoteState.memory || {};
      if (memory.memtotal && (memory.memavailable || memory.memfree)) {
        const memTotal = parseInt(memory.memtotal, 10) || 0;
        const memAvailable = parseInt(memory.memavailable, 10) || parseInt(memory.memfree, 10) || 0;
        if (memTotal > 0) {
          ramUsage = Math.min(100, Math.max(0, ((memTotal - memAvailable) / memTotal) * 100));
        }
      }
      
      // Disk usage from disk stats
      const diskData = remoteState.disk || {};
      let diskTotalBytes = 0;
      let diskUsedBytes = 0;
      for (const key of Object.keys(diskData)) {
        const d = diskData[key];
        if (d && d.capacity && d.physical) {
          diskTotalBytes += parseInt(d.capacity, 10) || 0;
          diskUsedBytes += parseInt(d.physical, 10) || 0;
        }
      }
      if (diskTotalBytes > 0) {
        diskUsage = Math.min(100, Math.max(0, (diskUsedBytes / diskTotalBytes) * 100));
      }
    }
    
    return {
      id: server.id.toString(),
      name: server.name || `Server ${server.id}`,
      uuid: server.uuid || '',
      status,
      needsSetup, // True if server was created but OS not installed yet
      suspended: server.suspended === true,
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
        name: osName || 'Not installed',
        distro: osDistro as 'linux' | 'windows',
      },
      stats: {
        cpu_usage: Math.round(cpuUsage * 10) / 10,
        ram_usage: Math.round(ramUsage * 10) / 10,
        disk_usage: Math.round(diskUsage * 10) / 10,
        net_in: 0,
        net_out: 0,
      },
      created_at: createdAt,
    };
  }

  private mapStatus(status: string | undefined, suspended?: boolean, buildFailed?: boolean): 'running' | 'stopped' | 'provisioning' | 'error' {
    // Check for suspended first
    if (suspended) return 'stopped';
    
    if (!status) return 'stopped';
    const statusLower = status.toLowerCase();
    
    // Check if server is in a transitional/building state
    // VirtFusion temporarily sets buildFailed=true during rebuilds, so we check state first
    const isTransitionalState = 
      statusLower.includes('provision') || 
      statusLower.includes('building') ||
      statusLower.includes('creating') ||
      statusLower.includes('pending') ||
      statusLower.includes('queued') ||
      statusLower === 'installing';
    
    // If in transitional state, return provisioning regardless of buildFailed
    if (isTransitionalState) {
      return 'provisioning';
    }
    
    // Only check buildFailed for non-transitional states
    // This prevents false errors during rebuilds
    if (buildFailed) return 'error';
    
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
    
    // Error states
    if (statusLower.includes('error') || 
        statusLower.includes('failed')) {
      return 'error';
    }
    
    // Default to running for built servers
    return 'running';
  }

  async authenticateUser(email: string, password: string): Promise<{
    token: string;
    user: {
      id: number;
      name: string;
      email: string;
      extRelationId: string;
    };
  } | null> {
    try {
      const loginUrl = `${this.baseUrl}/api/v1/login`;
      log(`Attempting login to: ${loginUrl} for email: ${email}`, 'virtfusion');
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      log(`Login response status: ${response.status}`, 'virtfusion');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        log(`VirtFusion auth failed: ${response.status} - ${JSON.stringify(errorData)}`, 'virtfusion');
        return null;
      }

      const data = await response.json();
      log(`Login response data keys: ${Object.keys(data).join(', ')}`, 'virtfusion');
      
      if (!data.token && !data.data?.token) {
        log('VirtFusion auth response missing token', 'virtfusion');
        return null;
      }

      const token = data.token || data.data?.token;
      const userData = data.user || data.data?.user || data.data;

      return {
        token,
        user: {
          id: userData.id,
          name: userData.name || userData.email,
          email: userData.email,
          extRelationId: userData.extRelationId || String(userData.id),
        },
      };
    } catch (error) {
      log(`VirtFusion auth error: ${error}`, 'virtfusion');
      return null;
    }
  }

  async getUserWithToken(token: string): Promise<{
    id: number;
    name: string;
    email: string;
    extRelationId: string;
  } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const user = data.data || data;

      return {
        id: user.id,
        name: user.name || user.email,
        email: user.email,
        extRelationId: user.extRelationId || String(user.id),
      };
    } catch (error) {
      log(`Failed to fetch user with token: ${error}`, 'virtfusion');
      return null;
    }
  }

  async logoutUser(token: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });
    } catch (error) {
      log(`Failed to logout from VirtFusion: ${error}`, 'virtfusion');
    }
  }

  async deleteServer(serverId: number): Promise<boolean> {
    try {
      log(`Deleting server ${serverId}`, 'virtfusion');
      await this.request(`/servers/${serverId}`, {
        method: 'DELETE',
      });
      
      // Invalidate cache since server is deleted
      this.invalidateServerCache(String(serverId));
      
      log(`Successfully deleted server ${serverId}`, 'virtfusion');
      return true;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        log(`Server ${serverId} already deleted or not found`, 'virtfusion');
        this.invalidateServerCache(String(serverId));
        return true;
      }
      log(`Failed to delete server ${serverId}: ${error}`, 'virtfusion');
      return false;
    }
  }

  async checkServerExists(serverId: number): Promise<boolean> {
    try {
      await this.request(`/servers/${serverId}`);
      return true;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        return false;
      }
      // For other errors, assume server might still exist
      return true;
    }
  }

  async deleteUserById(userId: number): Promise<boolean> {
    try {
      log(`Deleting VirtFusion user by ID ${userId}`, 'virtfusion');

      // First check if user exists
      const userBefore = await this.getUserById(userId);
      if (!userBefore) {
        log(`VirtFusion user ${userId} not found - nothing to delete`, 'virtfusion');
        return true; // Already gone
      }

      log(`Found VirtFusion user to delete: id=${userBefore.id}, extRelationId=${userBefore.extRelationId}, email=${userBefore.email}`, 'virtfusion');

      // Try multiple deletion methods since VirtFusion API can be inconsistent
      let deleteAttempted = false;
      let lastError: string | null = null;

      // Method 1: Try DELETE /users/{id}/byId (same pattern as updateUserById)
      try {
        await this.request(`/users/${userId}/byId`, {
          method: 'DELETE',
        });
        deleteAttempted = true;
        log(`DELETE /users/${userId}/byId completed`, 'virtfusion');
      } catch (byIdError: any) {
        lastError = byIdError.message;
        log(`DELETE /users/${userId}/byId failed: ${byIdError.message}`, 'virtfusion');

        if (byIdError.message?.includes('404')) {
          return true;
        }
      }

      // Method 2: Try direct DELETE /users/{id}
      if (!deleteAttempted) {
        try {
          await this.request(`/users/${userId}`, {
            method: 'DELETE',
          });
          deleteAttempted = true;
          log(`Direct DELETE /users/${userId} completed`, 'virtfusion');
        } catch (directError: any) {
          lastError = directError.message;
          log(`Direct DELETE /users/${userId} failed: ${directError.message}`, 'virtfusion');

          if (directError.message?.includes('404')) {
            return true;
          }
        }
      }

      // Method 3: Try delete by extRelationId if user has one
      if (!deleteAttempted && userBefore.extRelationId) {
        try {
          log(`Trying delete by extRelationId: ${userBefore.extRelationId}`, 'virtfusion');
          const deleted = await this.deleteUserByExtRelationId(userBefore.extRelationId);
          if (deleted) {
            deleteAttempted = true;
            log(`Delete by extRelationId completed for user ${userId}`, 'virtfusion');
          } else {
            log(`Delete by extRelationId returned false for user ${userId}`, 'virtfusion');
          }
        } catch (extError: any) {
          lastError = extError.message;
          log(`Delete by extRelationId failed for ${userId}: ${extError.message}`, 'virtfusion');
        }
      }

      // Verify deletion by checking if user still exists
      const userAfter = await this.getUserById(userId);
      if (userAfter) {
        log(`FAILED: VirtFusion user ${userId} still exists after deletion attempts! Email: ${userAfter.email}`, 'virtfusion');
        return false;
      }

      log(`Verified: VirtFusion user ${userId} successfully deleted`, 'virtfusion');
      return true;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        log(`VirtFusion user ${userId} already deleted or not found`, 'virtfusion');
        return true;
      }
      log(`Failed to delete VirtFusion user ${userId}: ${error.message}`, 'virtfusion');
      return false;
    }
  }

  async deleteUserByExtRelationId(extRelationId: string): Promise<boolean> {
    try {
      log(`Deleting VirtFusion user by extRelationId: ${extRelationId}`, 'virtfusion');
      // URL-encode the extRelationId since it may contain special characters
      const encodedExtRelationId = encodeURIComponent(extRelationId);

      // Try with relStr=true first (for string extRelationIds)
      try {
        await this.request(`/users/${encodedExtRelationId}/byExtRelation?relStr=true`, {
          method: 'DELETE',
        });
        log(`Successfully deleted VirtFusion user with extRelationId ${extRelationId} (relStr=true)`, 'virtfusion');
        return true;
      } catch (err1: any) {
        log(`Delete with relStr=true failed: ${err1.message}`, 'virtfusion');

        // If 404, user already deleted
        if (err1.message?.includes('404')) {
          log(`VirtFusion user with extRelationId ${extRelationId} already deleted`, 'virtfusion');
          return true;
        }

        // Try without relStr parameter (for numeric extRelationIds)
        try {
          await this.request(`/users/${encodedExtRelationId}/byExtRelation`, {
            method: 'DELETE',
          });
          log(`Successfully deleted VirtFusion user with extRelationId ${extRelationId} (no relStr)`, 'virtfusion');
          return true;
        } catch (err2: any) {
          log(`Delete without relStr also failed: ${err2.message}`, 'virtfusion');
          if (err2.message?.includes('404')) {
            return true;
          }
          throw err2;
        }
      }
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        log(`VirtFusion user with extRelationId ${extRelationId} already deleted or not found`, 'virtfusion');
        return true;
      }
      log(`Failed to delete VirtFusion user by extRelationId ${extRelationId}: ${error.message}`, 'virtfusion');
      return false;
    }
  }

  // Check if user has any active servers
  async userHasActiveServers(userId: number): Promise<{ hasServers: boolean; serverCount: number; servers: { id: string; name: string }[] }> {
    try {
      const servers = await this.listServersByUserId(userId);
      return {
        hasServers: servers.length > 0,
        serverCount: servers.length,
        servers: servers.map(s => ({ id: s.id, name: s.name || `Server ${s.id}` })),
      };
    } catch (error: any) {
      log(`Failed to check servers for user ${userId}: ${error}`, 'virtfusion');
      return { hasServers: false, serverCount: 0, servers: [] };
    }
  }

  async provisionServer(params: {
    userId: number;
    packageId: number;
    hostname: string;
    extRelationId: string;
    osId?: number; // Optional - if not provided, server is created without OS (awaiting setup)
    hypervisorGroupId?: number;
  }): Promise<{ serverId: number; name: string; uuid?: string; password?: string; primaryIp?: string; osName?: string }> {
    const { userId, packageId, hostname, extRelationId, osId, hypervisorGroupId } = params;

    log(`Provisioning server for user ${userId} with package ${packageId}, OS ${osId || 'none (awaiting setup)'}, hypervisorGroupId ${hypervisorGroupId}`, 'virtfusion');

    try {
      // Step 1: Create the server
      const createPayload: Record<string, any> = {
        userId,
        packageId,
        name: hostname,
        ipv4: 1,
      };

      if (hypervisorGroupId) {
        createPayload.hypervisorId = hypervisorGroupId;
      }

      const response = await this.request<{ data: any }>('/servers', {
        method: 'POST',
        body: JSON.stringify(createPayload),
      });

      const server = response.data;
      log(`Server created: ID=${server.id}, name=${server.name}`, 'virtfusion');
      log(`CREATE response data: ${JSON.stringify(server)}`, 'virtfusion');

      let password: string | undefined = undefined;
      let primaryIp: string | undefined = undefined;

      // Try to get IP from CREATE response first
      primaryIp = server.primaryIp || server.primary_ip || server.ip || server.ipAddress || undefined;
      if (server.network?.primaryIp) primaryIp = server.network.primaryIp;
      if (server.networks?.[0]?.ip) primaryIp = server.networks[0].ip;

      log(`IP from CREATE response: ${primaryIp || 'not found'}`, 'virtfusion');

      // Step 2: Build the OS on the server
      if (osId) {
        try {
          log(`Building server ${server.id} with OS template ${osId}`, 'virtfusion');
          const buildBody: Record<string, any> = {
            operatingSystemId: osId,
            name: hostname,
          };

          const buildResponse = await this.request<{ data: any }>(`/servers/${server.id}/build`, {
            method: 'POST',
            body: JSON.stringify(buildBody),
          });

          log(`BUILD response: ${JSON.stringify(buildResponse)}`, 'virtfusion');

          // VirtFusion returns password in the build response - check multiple locations
          const buildData = buildResponse.data;
          password =
            buildData?.settings?.decryptedPassword ||
            buildData?.settings?.password ||
            buildData?.decryptedPassword ||
            buildData?.password ||
            buildData?.rootPassword ||
            buildData?.credentials?.password ||
            undefined;

          log(`Password from BUILD response: ${password ? 'FOUND' : 'NOT FOUND'}`, 'virtfusion');

          // If we didn't get IP from CREATE, try BUILD response
          if (!primaryIp) {
            primaryIp = buildData?.primaryIp || buildData?.ip || buildData?.ipAddress || undefined;
            log(`IP from BUILD response: ${primaryIp || 'not found'}`, 'virtfusion');
          }

          log(`Server ${server.id} build initiated`, 'virtfusion');

          // If still no IP, wait a moment and fetch server details (IP assigned async)
          if (!primaryIp) {
            log(`No IP yet, waiting 2 seconds then fetching server details...`, 'virtfusion');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Try up to 3 times with 2 second delays
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const serverDetails = await this.getServer(server.id.toString(), false);
                primaryIp = serverDetails?.primaryIp;
                log(`Attempt ${attempt}: Fetched IP = ${primaryIp || 'not found'}`, 'virtfusion');
                if (primaryIp) break;
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 2000));
              } catch (ipError: any) {
                log(`Attempt ${attempt}: Failed to fetch server details: ${ipError.message}`, 'virtfusion');
              }
            }
          }
        } catch (buildError: any) {
          log(`Server build failed: ${buildError.message}`, 'virtfusion');
        }
      } else {
        log(`Server ${server.id} created without OS - awaiting setup`, 'virtfusion');
      }

      log(`FINAL: serverId=${server.id}, uuid=${server.uuid || 'NONE'}, password=${password ? 'SET' : 'NONE'}, primaryIp=${primaryIp || 'NONE'}`, 'virtfusion');

      return {
        serverId: server.id,
        name: server.name,
        uuid: server.uuid,
        password,
        primaryIp,
      };
    } catch (error: any) {
      log(`Failed to provision server: ${error.message}`, 'virtfusion');
      throw new Error(`Server provisioning failed: ${error.message}`);
    }
  }

  async cleanupUserAndServers(virtFusionUserId: number): Promise<{ success: boolean; serversDeleted: number; errors: string[] }> {
    const errors: string[] = [];
    let serversDeleted = 0;

    try {
      log(`Starting cleanup for VirtFusion user ${virtFusionUserId}`, 'virtfusion');

      const servers = await this.listServersByUserId(virtFusionUserId);
      log(`Found ${servers.length} servers for user ${virtFusionUserId}`, 'virtfusion');

      for (const server of servers) {
        const serverId = parseInt(server.id, 10);
        const deleted = await this.deleteServer(serverId);
        if (deleted) {
          serversDeleted++;
        } else {
          errors.push(`Failed to delete server ${serverId}`);
        }
      }

      if (errors.length === 0) {
        const userDeleted = await this.deleteUserById(virtFusionUserId);
        if (!userDeleted) {
          errors.push(`Failed to delete VirtFusion user ${virtFusionUserId}`);
        }
      }

      const success = errors.length === 0;
      log(`Cleanup for user ${virtFusionUserId}: success=${success}, serversDeleted=${serversDeleted}, errors=${errors.length}`, 'virtfusion');
      
      return { success, serversDeleted, errors };
    } catch (error: any) {
      errors.push(`Cleanup error: ${error.message}`);
      log(`Cleanup failed for user ${virtFusionUserId}: ${error}`, 'virtfusion');
      return { success: false, serversDeleted, errors };
    }
  }

  // Get hypervisor groups from VirtFusion
  async getHypervisorGroups(): Promise<Array<{ id: number; name: string; enabled: boolean }>> {
    try {
      const response = await this.request<{ data: any[] }>('/hypervisorGroups');
      const groups = response.data || [];
      log(`Fetched ${groups.length} hypervisor groups from VirtFusion`, 'virtfusion');
      return groups.map(g => ({
        id: g.id,
        name: g.name || `Group ${g.id}`,
        enabled: g.enabled !== false,
      }));
    } catch (error) {
      log(`Failed to fetch hypervisor groups: ${error}`, 'virtfusion');
      return [];
    }
  }

  // Get all packages from VirtFusion for syncing to local plans table
  async getPackages(): Promise<Array<{
    id: number;
    code: string;
    name: string;
    cpuCores: number;
    memory: number;       // MB
    primaryStorage: number; // GB
    traffic: number;      // GB
    enabled: boolean;
    prices?: Array<{
      price: number;      // in cents
      billingPeriod?: string;
    }>;
  }>> {
    try {
      const response = await this.request<{ data: any[] }>('/packages');
      const packages = response.data || [];
      
      log(`Fetched ${packages.length} packages from VirtFusion`, 'virtfusion');
      
      return packages.map(pkg => {
        // Try to extract prices from various VirtFusion formats
        let prices: Array<{ price: number; billingPeriod?: string }> = [];

        // Format 1: prices array with billingPeriod
        if (Array.isArray(pkg.prices) && pkg.prices.length > 0) {
          prices = pkg.prices.map((p: any) => ({
            price: p.price || p.amount || 0,
            billingPeriod: p.billingPeriod || p.period || p.term || 'monthly',
          }));
        }
        // Format 2: packagePrices array (VirtFusion v2)
        else if (Array.isArray(pkg.packagePrices) && pkg.packagePrices.length > 0) {
          prices = pkg.packagePrices.map((p: any) => ({
            price: p.price || p.amount || 0,
            billingPeriod: p.billingPeriod || p.term?.name || 'monthly',
          }));
        }
        // Format 3: defaultPrice or price field
        else if (pkg.defaultPrice || pkg.price) {
          prices = [{ price: pkg.defaultPrice || pkg.price, billingPeriod: 'monthly' }];
        }
        // Format 4: monthlyPrice field
        else if (pkg.monthlyPrice) {
          prices = [{ price: pkg.monthlyPrice, billingPeriod: 'monthly' }];
        }

        // Log price info for debugging
        if (prices.length === 0 || prices.every(p => p.price === 0)) {
          log(`Package ${pkg.id} (${pkg.name}) has no valid pricing data`, 'virtfusion');
        }

        // Parse enabled status - check multiple possible fields
        // VirtFusion may use 'enabled', 'status', or 'active'
        let enabled = true; // Default to enabled if no field found
        if (typeof pkg.enabled === 'boolean') {
          enabled = pkg.enabled;
        } else if (typeof pkg.active === 'boolean') {
          enabled = pkg.active;
        } else if (pkg.status) {
          enabled = pkg.status === 'active' || pkg.status === 'enabled' || pkg.status === 1;
        }

        // Log raw package data for debugging
        log(`VirtFusion Package ${pkg.id}: name="${pkg.name}", enabled field="${pkg.enabled}", active field="${pkg.active}", status field="${pkg.status}", parsed enabled=${enabled}`, 'virtfusion');

        return {
          id: pkg.id,
          code: pkg.code || `pkg-${pkg.id}`,
          name: pkg.name || `Package ${pkg.id}`,
          cpuCores: pkg.cpuCores || 1,
          memory: pkg.memory || 1024,
          primaryStorage: pkg.primaryStorage || 20,
          traffic: pkg.traffic || 1000,
          enabled,
          prices,
        };
      });
    } catch (error) {
      log(`Failed to fetch packages from VirtFusion: ${error}`, 'virtfusion');
      return [];
    }
  }

  async getOsTemplatesForPackage(packageId: number) {
    try {
      log(`Fetching OS templates for package ${packageId}`, 'virtfusion');
      const data = await this.request<{ data: any }>(`/media/templates/fromServerPackageSpec/${packageId}`);

      return data.data;
    } catch (error) {
      log(`Failed to fetch OS templates for package ${packageId}: ${error}`, 'virtfusion');
      return null;
    }
  }

// ========== ADMIN-ONLY METHODS ==========
  // These methods are for the admin panel and should only be called by authenticated admins

  // Get all hypervisors with detailed metrics
  async getHypervisors(): Promise<Array<{
    id: number;
    name: string;
    hostname: string;
    ip: string;
    enabled: boolean;
    maintenance: boolean;
    maxCpu: number;
    maxMemory: number;
    maxServers: number;
    vmCount: number;
    maxVms: number;
    memoryUsage: number | null;
    diskUsage: number | null;
    cpuUsage: number | null;
    ramTotalMb: number | null;
    ramUsedMb: number | null;
    diskTotalGb: number | null;
    diskUsedGb: number | null;
    lastSeenAt: string | null;
    group?: { id: number; name: string };
    networks?: Array<{ id: number; type: string; bridge: string }>;
    created: string;
  }>> {
    try {
      // Try fetching with stats included
      const response = await this.request<{ data: any[] }>('/compute/hypervisors?with=servers,stats&results=200');
      const hypervisors = response.data || [];
      log(`Fetched ${hypervisors.length} hypervisors`, 'virtfusion');

      // Debug log first hypervisor structure to understand the response
      if (hypervisors.length > 0) {
        const sample = hypervisors[0];
        log(`Hypervisor sample keys: ${Object.keys(sample).join(', ')}`, 'virtfusion');
        if (sample.resources) log(`Resources keys: ${Object.keys(sample.resources).join(', ')}`, 'virtfusion');
        if (sample.stats) log(`Stats keys: ${Object.keys(sample.stats).join(', ')}`, 'virtfusion');
        if (sample.settings) log(`Settings keys: ${Object.keys(sample.settings).join(', ')}`, 'virtfusion');
      }

      return hypervisors.map(h => {
        // Extract resource usage from VirtFusion response - check multiple possible locations
        const resources = h.resources || h.resource || h.usage || {};
        const stats = h.stats || h.statistics || {};
        const settings = h.settings || {};

        // Helper to get first defined value (including 0) or null
        const getFirstDefined = (...values: any[]): number | null => {
          for (const v of values) {
            if (v !== undefined && v !== null) return v;
          }
          return null;
        };

        // Memory calculations - check multiple possible field names
        // VirtFusion might use: maxMemory, memoryMb, memory, ramMb, etc.
        const ramTotalMb = getFirstDefined(
          resources.memoryTotal, resources.memory_total, resources.totalMemory,
          h.maxMemory, h.memoryMb, h.memory, h.ramMb, h.ram,
          settings.maxMemory, stats.memoryTotal
        );
        const ramUsedMb = getFirstDefined(
          resources.memoryUsed, resources.memory_used, resources.usedMemory,
          stats.memoryUsed, stats.memory_used, stats.usedMemory,
          h.usedMemory, h.memoryUsed
        );
        const memoryUsage = (ramTotalMb !== null && ramUsedMb !== null && ramTotalMb > 0)
          ? Math.round((ramUsedMb / ramTotalMb) * 100)
          : null;

        // Disk calculations - check multiple possible field names
        const diskTotalGb = getFirstDefined(
          resources.diskTotal, resources.disk_total, resources.totalDisk,
          h.diskGb, h.disk, h.storage, stats.diskTotal
        );
        const diskUsedGb = getFirstDefined(
          resources.diskUsed, resources.disk_used, resources.usedDisk,
          stats.diskUsed, stats.disk_used, stats.usedDisk,
          h.usedDisk, h.diskUsed
        );
        const diskUsage = (diskTotalGb !== null && diskUsedGb !== null && diskTotalGb > 0)
          ? Math.round((diskUsedGb / diskTotalGb) * 100)
          : null;

        // VM counts - use servers array length if available
        const vmCount = getFirstDefined(stats.instances, stats.servers, stats.vms, h.servers?.length) ?? 0;
        const maxVms = h.maxServers ?? settings.maxServers ?? 100;

        // CPU usage - check multiple possible field names
        const cpuUsage = getFirstDefined(
          resources.cpuUsage, resources.cpu_usage, resources.cpu,
          stats.cpu, stats.cpuUsage, stats.cpu_usage,
          h.cpuUsage, h.cpu
        );
        
        return {
          id: h.id,
          name: h.name || `Hypervisor ${h.id}`,
          hostname: h.hostname || h.name || '',
          ip: h.ip || h.ipAlt || 'Unknown',
          enabled: h.enabled !== false,
          maintenance: h.maintenance === true,
          maxCpu: h.maxCpu || 0,
          maxMemory: h.maxMemory || 0,
          maxServers: h.maxServers || 100,
          vmCount,
          maxVms,
          memoryUsage,
          diskUsage,
          cpuUsage,
          ramTotalMb,
          ramUsedMb,
          diskTotalGb,
          diskUsedGb,
          lastSeenAt: h.lastSeenAt || h.last_seen_at || h.lastSeen || null,
          group: h.group ? { id: h.group.id, name: h.group.name } : undefined,
          networks: h.networks?.map((n: any) => ({ id: n.id, type: n.type, bridge: n.bridge })) || [],
          created: h.created || h.created_at || '',
        };
      });
    } catch (error) {
      log(`Failed to fetch hypervisors: ${error}`, 'virtfusion');
      return [];
    }
  }

  // Get single hypervisor with full details
  async getHypervisor(hypervisorId: number): Promise<{
    id: number;
    name: string;
    ip: string;
    enabled: boolean;
    maintenance: boolean;
    maxCpu: number;
    maxMemory: number;
    commissioned: number;
    networks: Array<{ id: number; type: string; bridge: string; primary: boolean }>;
    storage: any[];
    group?: { id: number; name: string };
  } | null> {
    try {
      const response = await this.request<{ data: any }>(`/compute/hypervisors/${hypervisorId}`);
      const h = response.data;
      return {
        id: h.id,
        name: h.name,
        ip: h.ip || h.ipAlt || 'Unknown',
        enabled: h.enabled !== false,
        maintenance: h.maintenance === true,
        maxCpu: h.maxCpu || 0,
        maxMemory: h.maxMemory || 0,
        commissioned: h.commissioned || 0,
        networks: h.networks?.map((n: any) => ({ 
          id: n.id, 
          type: n.type, 
          bridge: n.bridge,
          primary: n.primary === true,
        })) || [],
        storage: h.storage || [],
        group: h.group ? { id: h.group.id, name: h.group.name } : undefined,
      };
    } catch (error) {
      log(`Failed to fetch hypervisor ${hypervisorId}: ${error}`, 'virtfusion');
      return null;
    }
  }

  // Get IP blocks
  async getIpBlocks(): Promise<Array<{
    id: number;
    name: string;
    type: 'ipv4' | 'ipv6';
    subnet: string;
    gateway?: string;
    totalAddresses: number;
    usedAddresses: number;
    available: number;
  }>> {
    try {
      const response = await this.request<{ data: any[] }>('/ipAddressBlocks?results=200');
      const blocks = response.data || [];
      log(`Fetched ${blocks.length} IP blocks`, 'virtfusion');
      return blocks.map(b => ({
        id: b.id,
        name: b.name || b.subnet || `Block ${b.id}`,
        type: b.type === 6 ? 'ipv6' : 'ipv4',
        subnet: b.subnet || '',
        gateway: b.gateway || undefined,
        totalAddresses: b.totalAddresses || b.size || 0,
        usedAddresses: b.usedAddresses || b.used || 0,
        available: (b.totalAddresses || b.size || 0) - (b.usedAddresses || b.used || 0),
      }));
    } catch (error: any) {
      if (!error?.message?.includes('404')) {
        log(`Failed to fetch IP blocks: ${error}`, 'virtfusion');
      }
      return [];
    }
  }

  // Get individual IP addresses from a block
  async getIpAddressesFromBlock(blockId: number): Promise<Array<{
    id: number;
    address: string;
    serverId?: number;
    serverName?: string;
  }>> {
    try {
      // VirtFusion API: /ipAddressBlocks/{id}/addresses
      const response = await this.request<{ data: any[] }>(`/ipAddressBlocks/${blockId}/addresses?results=500`);
      const addresses = response.data || [];
      return addresses.map(ip => ({
        id: ip.id,
        address: ip.address || ip.ip || '',
        serverId: ip.serverId || ip.server_id || undefined,
        serverName: ip.server?.name || undefined,
      }));
    } catch (error: any) {
      // This endpoint may not exist in all VirtFusion versions
      if (!error?.message?.includes('404') && !error?.message?.includes('405')) {
        log(`Failed to fetch IPs from block ${blockId}: ${error}`, 'virtfusion');
      }
      return [];
    }
  }

  // Get IP allocations - Enhanced to fetch from multiple sources
  async getIpAllocations(): Promise<Array<{
    id: number;
    address: string;
    type: 'ipv4' | 'ipv6';
    serverId?: number;
    serverName?: string;
    userId?: number;
    blockId: number;
    inUse: boolean;
  }>> {
    try {
      const allocations: Array<{
        id: number;
        address: string;
        type: 'ipv4' | 'ipv6';
        serverId?: number;
        serverName?: string;
        userId?: number;
        blockId: number;
        inUse: boolean;
      }> = [];
      let globalId = 1;

      // Strategy 1: Try to get IP blocks and their addresses directly
      try {
        const ipBlocks = await this.getIpBlocks();
        log(`Found ${ipBlocks.length} IP blocks`, 'virtfusion');

        for (const block of ipBlocks) {
          const blockIps = await this.getIpAddressesFromBlock(block.id);
          log(`Block ${block.id} (${block.name}): ${blockIps.length} addresses`, 'virtfusion');

          for (const ip of blockIps) {
            allocations.push({
              id: globalId++,
              address: ip.address,
              type: block.type,
              serverId: ip.serverId,
              serverName: ip.serverName,
              userId: undefined,
              blockId: block.id,
              inUse: !!ip.serverId,
            });
          }
        }
      } catch (blockError: any) {
        log(`Failed to fetch from IP blocks: ${blockError.message}`, 'virtfusion');
      }

      // Strategy 2: Fetch servers and extract all network interfaces
      try {
        const response = await this.request<{ data: VirtFusionServerResponse[] }>('/servers?results=500&remoteState=true');
        const servers = response.data || [];
        log(`Fetching IPs from ${servers.length} servers`, 'virtfusion');

        for (const server of servers) {
          const serverData = this.transformServer(server);

          // Extract IPs from network interfaces
          if (server.network?.interfaces && Array.isArray(server.network.interfaces)) {
            for (const iface of server.network.interfaces) {
              // Add IPv4 addresses
              if (iface.ipv4 && Array.isArray(iface.ipv4)) {
                for (const ipv4 of iface.ipv4) {
                  if (ipv4.address && ipv4.address !== '0.0.0.0') {
                    allocations.push({
                      id: globalId++,
                      address: ipv4.address,
                      type: 'ipv4',
                      serverId: server.id,
                      serverName: server.name || `Server ${server.id}`,
                      userId: server.ownerId,
                      blockId: 0,
                      inUse: true,
                    });
                  }
                }
              }

              // Add IPv6 addresses
              if (iface.ipv6 && Array.isArray(iface.ipv6)) {
                for (const ipv6 of iface.ipv6) {
                  if (ipv6.address && ipv6.address !== '::') {
                    allocations.push({
                      id: globalId++,
                      address: ipv6.address,
                      type: 'ipv6',
                      serverId: server.id,
                      serverName: server.name || `Server ${server.id}`,
                      userId: server.ownerId,
                      blockId: 0,
                      inUse: true,
                    });
                  }
                }
              }
            }
          }

          // Fallback: If no network interfaces, use primary IP
          if (serverData.primaryIp && serverData.primaryIp !== 'N/A') {
            // Check if this IP was already added from network interfaces
            const alreadyExists = allocations.some(a => a.address === serverData.primaryIp);
            if (!alreadyExists) {
              allocations.push({
                id: globalId++,
                address: serverData.primaryIp,
                type: serverData.primaryIp.includes(':') ? 'ipv6' : 'ipv4',
                serverId: server.id,
                serverName: server.name || `Server ${server.id}`,
                userId: server.ownerId,
                blockId: 0,
                inUse: true,
              });
            }
          }
        }
      } catch (serverError: any) {
        log(`Failed to fetch from servers: ${serverError.message}`, 'virtfusion');
      }

      // Remove duplicates based on IP address
      const uniqueAllocations = allocations.filter((allocation, index, self) =>
        index === self.findIndex(a => a.address === allocation.address)
      );

      log(`Fetched ${uniqueAllocations.length} unique IP allocations (${allocations.length} total before dedup)`, 'virtfusion');
      return uniqueAllocations;
    } catch (error: any) {
      log(`Failed to fetch IP allocations: ${error.message}`, 'virtfusion');
      return [];
    }
  }

  // Transfer server to new owner
  async transferServerOwnership(serverId: number, newOwnerId: number): Promise<boolean> {
    try {
      log(`Transferring server ${serverId} to user ${newOwnerId}`, 'virtfusion');
      await this.request(`/servers/${serverId}/owner/${newOwnerId}`, {
        method: 'PUT',
      });
      log(`Successfully transferred server ${serverId} to user ${newOwnerId}`, 'virtfusion');
      return true;
    } catch (error) {
      log(`Failed to transfer server ${serverId} ownership: ${error}`, 'virtfusion');
      return false;
    }
  }

  // Modify server resources (CPU, RAM)
  async modifyServerResources(serverId: number, resources: {
    cpuCores?: number;
    memory?: number; // MB
  }): Promise<boolean> {
    try {
      const updates: Record<string, any> = {};
      if (resources.cpuCores !== undefined) {
        updates.cpuCores = resources.cpuCores;
      }
      if (resources.memory !== undefined) {
        updates.memory = resources.memory;
      }
      
      log(`Modifying server ${serverId} resources: ${JSON.stringify(updates)}`, 'virtfusion');
      await this.request(`/servers/${serverId}/resources`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      log(`Successfully modified server ${serverId} resources`, 'virtfusion');
      return true;
    } catch (error) {
      log(`Failed to modify server ${serverId} resources: ${error}`, 'virtfusion');
      return false;
    }
  }

  // Throttle server CPU
  async throttleServerCpu(serverId: number, throttlePercent: number): Promise<boolean> {
    try {
      log(`Throttling server ${serverId} CPU to ${throttlePercent}%`, 'virtfusion');
      await this.request(`/servers/${serverId}/throttleCpu`, {
        method: 'POST',
        body: JSON.stringify({ throttle: throttlePercent }),
      });
      log(`Successfully throttled server ${serverId} CPU`, 'virtfusion');
      return true;
    } catch (error) {
      log(`Failed to throttle server ${serverId} CPU: ${error}`, 'virtfusion');
      return false;
    }
  }

  // Get all users (paginated) - Admin only
  async getAllUsers(page: number = 1, limit: number = 50): Promise<{
    users: Array<{
      id: number;
      name: string;
      email: string;
      extRelationId: string | null;
      enabled: boolean;
      created: string;
    }>;
    total: number;
    currentPage: number;
    lastPage: number;
  }> {
    try {
      // VirtFusion API may not support listing all users directly
      // This might need adjustment based on actual API capabilities
      const response = await this.request<{ 
        data: any[];
        total?: number;
        current_page?: number;
        last_page?: number;
      }>(`/users?results=${limit}&page=${page}`);
      
      const users = (response.data || []).map(u => ({
        id: u.id,
        name: u.name || u.email || `User ${u.id}`,
        email: u.email || '',
        extRelationId: u.extRelationId || null,
        enabled: u.enabled !== false,
        created: u.created || u.created_at || '',
      }));
      
      log(`Fetched ${users.length} users (page ${page})`, 'virtfusion');
      return {
        users,
        total: response.total || users.length,
        currentPage: response.current_page || page,
        lastPage: response.last_page || 1,
      };
    } catch (error) {
      log(`Failed to fetch users list: ${error}`, 'virtfusion');
      return { users: [], total: 0, currentPage: 1, lastPage: 1 };
    }
  }

  // Get server count per hypervisor (for capacity display)
  async getHypervisorServerCounts(): Promise<Map<number, number>> {
    try {
      const servers = await this.listServers();
      const counts = new Map<number, number>();
      
      for (const server of servers) {
        const hypervisorId = (server as any).hypervisorId;
        if (hypervisorId) {
          counts.set(hypervisorId, (counts.get(hypervisorId) || 0) + 1);
        }
      }
      
      return counts;
    } catch (error) {
      log(`Failed to get hypervisor server counts: ${error}`, 'virtfusion');
      return new Map();
    }
  }

  // Get all servers with owner info (for admin server list)
  async getAllServersWithOwners(): Promise<Array<{
    id: string;
    name: string;
    hostname?: string;
    status: string;
    suspended?: boolean;
    primaryIp?: string;
    ipAddress?: string;
    owner?: { id: number; name: string; email: string };
    resources?: { cpu: number; ram: number; storage: number };
    hypervisor?: { id: number; name: string };
    created: string;
  }>> {
    try {
      const response = await this.request<{ data: any[] }>('/servers?with=owner&remoteState=true&results=500');
      const servers = response.data || [];
      log(`Fetched ${servers.length} servers with owners`, 'virtfusion');

      return servers.map(s => ({
        id: String(s.id),
        name: s.name || `Server ${s.id}`,
        hostname: s.hostname || undefined,
        status: this.mapStatus(s.remoteState?.state || s.state || 'unknown', s.suspended, s.buildFailed),
        suspended: s.suspended === true || s.suspended === 1,
        primaryIp: s.network?.interfaces?.[0]?.ipv4?.[0]?.address || undefined,
        ipAddress: s.network?.interfaces?.[0]?.ipv4?.[0]?.address || undefined,
        owner: s.owner ? {
          id: s.owner.id,
          name: s.owner.name || s.owner.email,
          email: s.owner.email || '',
        } : undefined,
        resources: s.resources ? {
          cpu: s.resources.cpuCores || 0,
          ram: s.resources.memory || 0,
          storage: s.resources.storage || 0,
        } : undefined,
        hypervisor: s.hypervisor ? {
          id: s.hypervisor.id,
          name: s.hypervisor.name,
        } : undefined,
        created: s.created || s.created_at || '',
      }));
    } catch (error) {
      log(`Failed to fetch all servers: ${error}`, 'virtfusion');
      return [];
    }
  }

}

export const virtfusionClient = new VirtFusionClient();
