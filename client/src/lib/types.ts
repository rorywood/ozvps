export interface Server {
  id: string;
  name: string;
  uuid: string;
  status: 'running' | 'stopped' | 'provisioning' | 'error';
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
    };
  };
  image: {
    id: string;
    name: string;
    distro: 'linux' | 'windows';
  };
  stats: {
    cpu_usage: number;
    ram_usage: number;
    disk_usage: number;
    net_in: number;
    net_out: number;
  };
  created_at: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  balance: number;
  currency: string;
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
