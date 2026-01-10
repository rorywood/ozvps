export interface Server {
  id: string;
  name: string;
  uuid: string;
  status: 'running' | 'stopped' | 'provisioning' | 'error';
  suspended: boolean;
  needsSetup?: boolean;
  bandwidthExceeded?: boolean;
  primaryIp: string;
  location: {
    id: string;
    name: string;
    flag: string;
  };
  plan: {
    id: string;
    name: string;
    specs: {
      vcpu: number;
      ram: number; // in MB
      disk: number; // in GB
      traffic?: number; // in GB, monthly allowance
    };
  };
  image?: {
    id: string;
    name: string;
    distro?: 'linux' | 'windows';
    version?: string;
    variant?: string;
  };
  stats: {
    cpu_usage: number;
    ram_usage: number;
    disk_usage: number;
    net_in: number;
    net_out: number;
  };
  billing?: {
    status: string; // 'paid' | 'unpaid' | 'suspended' | 'cancelled'
    nextBillAt: string;
    suspendAt: string | null;
    monthlyPriceCents: number;
    autoRenew: boolean;
    deployedAt?: string;
  } | null;
  created_at: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  balance: number;
  currency: string;
}

export interface UserProfile {
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
}

export interface Invoice {
  id: string;
  amount: number;
  status: 'paid' | 'unpaid' | 'cancelled';
  date: string;
  items: Array<{ description: string; amount: number }>;
}

export interface IpAddress {
  id: string;
  address: string;
  type: 'ipv4' | 'ipv6';
  gateway: string;
  netmask: string;
  reverse_dns: string | null;
  server_id: string | null;
}

export type TicketCategory = 'billing' | 'server' | 'network' | 'panel' | 'abuse' | 'general';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'new' | 'open' | 'waiting_user' | 'waiting_admin' | 'resolved' | 'closed';

export interface SupportTicket {
  id: number;
  auth0UserId: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  virtfusionServerId: string | null;
  assignedAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  closedAt: string | null;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  authorType: 'user' | 'admin';
  authorId: string;
  authorEmail: string;
  authorName: string | null;
  message: string;
  createdAt: string;
}
