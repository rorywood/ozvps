// Mock data for the VPS control panel

export interface Server {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'provisioning' | 'error';
  ip: string;
  location: string;
  plan: string;
  cpu: number;
  ram: string;
  disk: string;
  usage_cpu: number;
  usage_ram: number;
  usage_disk: number;
  image: string;
}

export const mockServers: Server[] = [
  {
    id: "srv-01",
    name: "web-prod-01",
    status: "running",
    ip: "192.168.1.101",
    location: "NYC-1",
    plan: "Pro 4GB",
    cpu: 2,
    ram: "4GB",
    disk: "80GB NVMe",
    usage_cpu: 45,
    usage_ram: 62,
    usage_disk: 35,
    image: "Ubuntu 22.04 LTS"
  },
  {
    id: "srv-02",
    name: "db-primary",
    status: "running",
    ip: "192.168.1.102",
    location: "NYC-1",
    plan: "Pro 8GB",
    cpu: 4,
    ram: "8GB",
    disk: "160GB NVMe",
    usage_cpu: 12,
    usage_ram: 78,
    usage_disk: 55,
    image: "Debian 12"
  },
  {
    id: "srv-03",
    name: "worker-node-alpha",
    status: "stopped",
    ip: "192.168.1.103",
    location: "AMS-2",
    plan: "Standard 2GB",
    cpu: 1,
    ram: "2GB",
    disk: "40GB NVMe",
    usage_cpu: 0,
    usage_ram: 0,
    usage_disk: 10,
    image: "AlmaLinux 9"
  },
  {
    id: "srv-04",
    name: "staging-env",
    status: "provisioning",
    ip: "Pending...",
    location: "SGP-1",
    plan: "Standard 4GB",
    cpu: 2,
    ram: "4GB",
    disk: "80GB NVMe",
    usage_cpu: 0,
    usage_ram: 0,
    usage_disk: 0,
    image: "Ubuntu 24.04 LTS"
  }
];

export const mockStats = {
  total_servers: 4,
  active_servers: 2,
  stopped_servers: 1,
  provisioning_servers: 1,
  total_cpu_cores: 9,
  total_ram_gb: 18,
  credit_balance: 145.50,
  projected_cost: 45.00,
  bandwidth_usage_gb: 450,
  bandwidth_limit_gb: 2000
};

export const locations = [
  { id: "nyc1", name: "New York (NYC1)", flag: "🇺🇸" },
  { id: "ams2", name: "Amsterdam (AMS2)", flag: "🇳🇱" },
  { id: "sgp1", name: "Singapore (SGP1)", flag: "🇸🇬" },
  { id: "lon1", name: "London (LON1)", flag: "🇬🇧" }
];

export const osImages = [
  { id: "ubuntu-22", name: "Ubuntu 22.04 LTS", type: "linux" },
  { id: "ubuntu-24", name: "Ubuntu 24.04 LTS", type: "linux" },
  { id: "debian-12", name: "Debian 12", type: "linux" },
  { id: "almalinux-9", name: "AlmaLinux 9", type: "linux" },
  { id: "rocky-9", name: "Rocky Linux 9", type: "linux" },
  { id: "windows-2022", name: "Windows Server 2022", type: "windows" }
];

export const plans = [
  { id: "std-1", name: "Standard 1GB", cpu: 1, ram: "1GB", disk: "25GB", price: 5 },
  { id: "std-2", name: "Standard 2GB", cpu: 1, ram: "2GB", disk: "50GB", price: 10 },
  { id: "pro-4", name: "Pro 4GB", cpu: 2, ram: "4GB", disk: "80GB", price: 20 },
  { id: "pro-8", name: "Pro 8GB", cpu: 4, ram: "8GB", disk: "160GB", price: 40 },
  { id: "ent-16", name: "Enterprise 16GB", cpu: 8, ram: "16GB", disk: "320GB", price: 80 },
];
