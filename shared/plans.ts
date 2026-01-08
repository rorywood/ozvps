export interface StaticPlan {
  code: string;
  name: string;
  vcpu: number;
  ramMb: number;
  storageGb: number;
  transferGb: number;
  priceMonthly: number;
  virtfusionPackageId: number;
  active: boolean;
  popular?: boolean;
}

export const STATIC_PLANS: StaticPlan[] = [
  {
    code: 'nano',
    name: 'Nano',
    vcpu: 1,
    ramMb: 512,
    storageGb: 15,
    transferGb: 500,
    priceMonthly: 700,
    virtfusionPackageId: 1,
    active: true,
  },
  {
    code: 'starter',
    name: 'Starter',
    vcpu: 1,
    ramMb: 1024,
    storageGb: 30,
    transferGb: 1000,
    priceMonthly: 1200,
    virtfusionPackageId: 2,
    active: true,
  },
  {
    code: 'dev',
    name: 'Dev',
    vcpu: 2,
    ramMb: 2048,
    storageGb: 60,
    transferGb: 2000,
    priceMonthly: 1800,
    virtfusionPackageId: 3,
    active: true,
  },
  {
    code: 'lite',
    name: 'Lite',
    vcpu: 2,
    ramMb: 3072,
    storageGb: 80,
    transferGb: 3000,
    priceMonthly: 2400,
    virtfusionPackageId: 4,
    active: true,
    popular: true,
  },
  {
    code: 'value',
    name: 'Value',
    vcpu: 3,
    ramMb: 4096,
    storageGb: 120,
    transferGb: 5000,
    priceMonthly: 3500,
    virtfusionPackageId: 5,
    active: true,
  },
];

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatRam(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`;
}

export function formatTransfer(gb: number): string {
  return gb === -1 ? 'Unlimited' : `${gb >= 1000 ? `${(gb / 1000).toFixed(0)} TB` : `${gb} GB`}`;
}
