let csrfToken: string | null = null;

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  // Add CSRF token for non-GET requests
  if (options.method && options.method !== "GET" && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || "Request failed");
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: any) =>
    request<T>(path, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),
  put: <T>(path: string, data?: any) =>
    request<T>(path, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    }),
  patch: <T>(path: string, data?: any) =>
    request<T>(path, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    }),
  delete: <T>(path: string, data?: any) =>
    request<T>(path, {
      method: "DELETE",
      body: data ? JSON.stringify(data) : undefined,
    }),
};

// Auth API
export const authApi = {
  getSession: () =>
    api.get<{
      authenticated: boolean;
      user?: { email: string; name: string | null };
      csrfToken?: string;
      bootstrapMode?: boolean;
    }>("/auth/session"),

  login: (email: string, password: string) =>
    api.post<{
      requires2FA?: boolean;
      pendingLoginToken?: string;
      requires2FASetup?: boolean;
      error?: string;
    }>("/auth/login", { email, password }),

  verify2FA: (pendingLoginToken: string, code: string) =>
    api.post<{
      success: boolean;
      user: { email: string; name: string | null };
      csrfToken: string;
    }>("/auth/verify-2fa", { pendingLoginToken, code }),

  logout: () => api.post("/auth/logout"),
};

// Users API
export const usersApi = {
  list: (page = 1, perPage = 50) =>
    api.get<{ users: any[]; pagination: any }>(`/users?page=${page}&perPage=${perPage}`),

  search: (query: string) =>
    api.get<{ users: any[] }>(`/users/search?q=${encodeURIComponent(query)}`),

  getUser: (auth0UserId: string) =>
    api.get<{ user: any }>(`/users/${encodeURIComponent(auth0UserId)}`),

  getTransactions: (auth0UserId: string, limit = 100) =>
    api.get<{ transactions: any[] }>(
      `/users/${encodeURIComponent(auth0UserId)}/transactions?limit=${limit}`
    ),

  blockUser: (auth0UserId: string, blocked: boolean, reason?: string) =>
    api.post(`/users/${encodeURIComponent(auth0UserId)}/block`, { blocked, reason }),

  suspendUser: (auth0UserId: string, suspended: boolean, reason?: string) =>
    api.post(`/users/${encodeURIComponent(auth0UserId)}/suspend`, { suspended, reason }),

  verifyEmail: (auth0UserId: string) =>
    api.post(`/users/${encodeURIComponent(auth0UserId)}/verify-email`),

  resendVerification: (auth0UserId: string) =>
    api.post(`/users/${encodeURIComponent(auth0UserId)}/resend-verification`),

  adjustWallet: (auth0UserId: string, amountCents: number, description: string, reason?: string) =>
    api.post(`/users/${encodeURIComponent(auth0UserId)}/wallet/adjust`, {
      amountCents,
      description,
      reason,
    }),

  listWallets: (limit = 50, offset = 0) =>
    api.get<{ wallets: any[] }>(`/wallets?limit=${limit}&offset=${offset}`),

  purgeUser: (auth0UserId: string) =>
    api.post<{
      success: boolean;
      results: {
        auth0Deleted: boolean;
        virtfusionUserDeleted: boolean;
        stripeCustomerDeleted: boolean;
        localRecordsDeleted: Record<string, number>;
        errors: string[];
      };
    }>(`/users/${encodeURIComponent(auth0UserId)}/purge`, { confirm: "PURGE" }),
};

// Servers API
export const serversApi = {
  list: (page = 1, perPage = 50, search?: string) => {
    let url = `/servers?page=${page}&perPage=${perPage}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return api.get<{ servers: any[]; pagination: any; meta: any }>(url);
  },

  get: (serverId: number) => api.get<{ server: any; billing: any; owner: any }>(`/servers/${serverId}`),

  getStats: (serverId: number) =>
    api.get<{
      stats: {
        cpu_usage: number;
        ram_usage: number;
        disk_usage: number;
        memory_total_mb: number;
        memory_used_mb: number;
        memory_free_mb: number;
        disk_used_gb: number;
        disk_total_gb: number;
      };
    }>(`/servers/${serverId}/stats`),

  powerAction: (serverId: number, action: string) =>
    api.post(`/servers/${serverId}/power/${action}`),

  suspend: (serverId: number, reason?: string) =>
    api.post(`/servers/${serverId}/suspend`, { reason }),

  unsuspend: (serverId: number) => api.post(`/servers/${serverId}/unsuspend`),

  installOs: (serverId: number, osId: number, hostname?: string, sendCredentials?: boolean) =>
    api.post<{ success: boolean; password?: string; osName?: string }>(
      `/servers/${serverId}/install-os`,
      { osId, hostname, sendCredentials }
    ),

  adminSuspend: (serverId: number, reason: string) =>
    api.post(`/servers/${serverId}/admin-suspend`, { reason }),

  adminUnsuspend: (serverId: number) =>
    api.post(`/servers/${serverId}/admin-unsuspend`),

  delete: (serverId: number, reason?: string) =>
    api.delete(`/servers/${serverId}`, { confirm: "DELETE", reason }),

  transfer: (serverId: number, newAuth0UserId: string) =>
    api.post(`/servers/${serverId}/transfer`, { newAuth0UserId }),

  listCancellations: () => api.get<{ cancellations: any[] }>("/cancellations"),

  revokeCancellation: (id: number) => api.post(`/cancellations/${id}/revoke`),

  provision: (data: {
    auth0UserId: string;
    planId: number;
    hostname: string;
    osId?: number;
    locationCode?: string;
    freeServer?: boolean;
    sendCredentials?: boolean;
    notes?: string;
  }) => api.post<{
    success: boolean;
    server: {
      id: number;
      name: string;
      uuid?: string;
      primaryIp?: string;
      password?: string;
      osName?: string;
    };
    billing: any;
  }>("/servers/provision", data),
};

// Billing API
export const billingApi = {
  listRecords: (limit = 50, offset = 0, status?: string) => {
    let url = `/billing/records?limit=${limit}&offset=${offset}`;
    if (status) url += `&status=${status}`;
    return api.get<{ records: any[] }>(url);
  },

  getRecord: (id: number) => api.get<{ record: any; ledgerEntries: any[] }>(`/billing/records/${id}`),

  updateRecord: (id: number, data: any) => api.put(`/billing/records/${id}`, data),

  suspendRecord: (id: number, reason?: string) => api.post(`/billing/records/${id}/suspend`, { reason }),

  unsuspendRecord: (id: number) => api.post(`/billing/records/${id}/unsuspend`),

  runBillingJob: () => api.post("/billing/run-job"),

  cleanupOrphaned: () => api.post<{ cleaned: number; total: number; errors?: string[] }>("/billing/cleanup-orphaned"),

  getLedger: (limit = 100, offset = 0, auth0UserId?: string, serverId?: string) => {
    let url = `/billing/ledger?limit=${limit}&offset=${offset}`;
    if (auth0UserId) url += `&auth0UserId=${encodeURIComponent(auth0UserId)}`;
    if (serverId) url += `&serverId=${serverId}`;
    return api.get<{ entries: any[] }>(url);
  },

  getStats: () => api.get<{
    statusCounts: Record<string, number>;
    mrr: number;
    freeServerCount: number;
    dueSoonCount: number;
  }>("/billing/stats"),
};

// Tickets API
export const ticketsApi = {
  getCounts: () => api.get<{ counts: Record<string, number> }>("/tickets/counts"),

  list: (params: {
    limit?: number;
    offset?: number;
    status?: string;
    category?: string;
    priority?: string;
    assignedToMe?: boolean;
    unassigned?: boolean;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.offset) searchParams.set("offset", String(params.offset));
    if (params.status) searchParams.set("status", params.status);
    if (params.category) searchParams.set("category", params.category);
    if (params.priority) searchParams.set("priority", params.priority);
    if (params.assignedToMe) searchParams.set("assignedToMe", "true");
    if (params.unassigned) searchParams.set("unassigned", "true");
    return api.get<{ tickets: any[] }>(`/tickets?${searchParams.toString()}`);
  },

  get: (id: number) => api.get<{ ticket: any; messages: any[] }>(`/tickets/${id}`),

  addMessage: (id: number, message: string) => api.post(`/tickets/${id}/messages`, { message }),

  update: (id: number, data: any) => api.patch(`/tickets/${id}`, data),

  close: (id: number) => api.post(`/tickets/${id}/close`),

  reopen: (id: number) => api.post(`/tickets/${id}/reopen`),

  delete: (id: number) => api.delete(`/tickets/${id}`, { confirm: "DELETE" }),
};

// Whitelist API
export const whitelistApi = {
  list: () => api.get<{ entries: any[] }>("/whitelist"),

  add: (data: { ipAddress: string; cidr?: string; label: string; expiresAt?: string }) =>
    api.post<{ entry: any }>("/whitelist", data),

  addCurrent: (label: string) =>
    api.post<{ entry: any; currentIp: string }>("/whitelist/add-current", { label }),

  update: (id: number, data: { enabled?: boolean; label?: string; expiresAt?: string | null }) =>
    api.patch<{ entry: any }>(`/whitelist/${id}`, data),

  delete: (id: number) => api.delete(`/whitelist/${id}`),

  getCurrentIp: () => api.get<{ ip: string }>("/whitelist/current-ip"),
};

// Health API
export const healthApi = {
  get: () =>
    api.get<{
      status: string;
      timestamp: string;
      services: { name: string; status: string; latencyMs?: number; message?: string }[];
      system: any;
    }>("/health"),

  getDetailed: () =>
    api.get<{
      status: string;
      timestamp: string;
      services: any[];
      system: any;
      environment: any;
    }>("/admin/health/detailed"),

  getServiceStatus: () =>
    api.get<{ services: Record<string, { running: boolean; enabled: boolean }> }>("/services/status"),

  controlService: (service: string, action: "start" | "stop" | "restart") =>
    api.post<{ success: boolean; message: string }>(`/services/${service}/${action}`),
};

// Settings API
export const settingsApi = {
  getRegistration: () => api.get<{ enabled: boolean }>("/settings/registration"),
  updateRegistration: (enabled: boolean) =>
    api.put<{ enabled: boolean }>("/settings/registration", { enabled }),
};

// Plans API (local database)
export const plansApi = {
  list: () => api.get<{ plans: any[] }>("/plans"),
  getTemplates: (planId: number) => api.get<{ templates: any[] }>(`/plans/${planId}/templates`),
};

// VirtFusion API
export const virtfusionApi = {
  getHypervisors: () => api.get<{ hypervisors: any[] }>("/vf/hypervisors"),
  getHypervisor: (id: number) => api.get<{ hypervisor: any }>(`/vf/hypervisors/${id}`),
  getHypervisorGroups: () => api.get<{ groups: any[] }>("/vf/hypervisor-groups"),
  getIpBlocks: () => api.get<{ ipBlocks: any[] }>("/vf/ip-blocks"),
  getIpAllocations: () => api.get<{ allocations: any[] }>("/vf/ip-allocations"),
  listUsers: (page = 1, perPage = 50) =>
    api.get<{ users: any[]; pagination: any; meta: any }>(`/vf/users?page=${page}&perPage=${perPage}`),
  getUser: (id: number) => api.get<{ user: any }>(`/vf/users/${id}`),
  deleteUser: (id: number) => api.delete(`/vf/users/${id}`, { confirm: "DELETE" }),
  getPackages: () => api.get<{ packages: any[] }>("/vf/packages"),
  getPackageTemplates: (id: number) => api.get<{ templates: any[] }>(`/vf/packages/${id}/templates`),
  getStats: () => api.get<{ stats: any }>("/vf/stats"),
};

// Promo Codes types
export interface PromoCode {
  id: number;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  appliesTo: "all" | "specific";
  planIds: number[] | null;
  maxUsesTotal: number | null;
  maxUsesPerUser: number | null;
  currentUses: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromoCodeUsage {
  id: number;
  promoCodeId: number;
  auth0UserId: string;
  deployOrderId: number | null;
  discountAppliedCents: number;
  originalPriceCents: number;
  finalPriceCents: number;
  usedAt: string;
  userEmail?: string;
}

export interface CreatePromoCodeInput {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  appliesTo?: "all" | "specific";
  planIds?: number[];
  maxUsesTotal?: number | null;
  maxUsesPerUser?: number;
  validFrom?: string;
  validUntil?: string | null;
  active?: boolean;
}

export interface UpdatePromoCodeInput {
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  appliesTo?: "all" | "specific";
  planIds?: number[];
  maxUsesTotal?: number | null;
  maxUsesPerUser?: number;
  validFrom?: string;
  validUntil?: string | null;
  active?: boolean;
}

// Promo Codes API
export const promoCodesApi = {
  list: () => api.get<{ promoCodes: PromoCode[] }>("/promo-codes"),

  get: (id: number) =>
    api.get<{ promoCode: PromoCode; usageHistory: PromoCodeUsage[] }>(`/promo-codes/${id}`),

  create: (data: CreatePromoCodeInput) =>
    api.post<{ promoCode: PromoCode }>("/promo-codes", data),

  update: (id: number, data: UpdatePromoCodeInput) =>
    api.put<{ promoCode: PromoCode }>(`/promo-codes/${id}`, data),

  toggle: (id: number) =>
    api.post<{ promoCode: PromoCode }>(`/promo-codes/${id}/toggle`),

  delete: (id: number) =>
    api.delete<{ success: boolean }>(`/promo-codes/${id}`, { confirm: "DELETE" }),

  getStats: () =>
    api.get<{
      totalCodes: number;
      activeCodes: number;
      inactiveCodes: number;
      totalUsage: number;
    }>("/promo-codes-stats"),
};
