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
}

export const STATIC_PLANS: StaticPlan[] = [
  {
    code: 'nano',
    name: 'Nano',
    vcpu: 1,
    ramMb: 1024,
    storageGb: 25,
    transferGb: 1000,
    priceMonthly: 999,
    virtfusionPackageId: 1,
    active: true,
  },
  {
    code: 'starter',
    name: 'Starter',
    vcpu: 2,
    ramMb: 2048,
    storageGb: 50,
    transferGb: 2000,
    priceMonthly: 1499,
    virtfusionPackageId: 2,
    active: true,
  },
  {
    code: 'dev',
    name: 'Dev',
    vcpu: 3,
    ramMb: 4096,
    storageGb: 80,
    transferGb: 3000,
    priceMonthly: 2199,
    virtfusionPackageId: 3,
    active: true,
  },
  {
    code: 'lite',
    name: 'Lite',
    vcpu: 4,
    ramMb: 6144,
    storageGb: 120,
    transferGb: 4000,
    priceMonthly: 2799,
    virtfusionPackageId: 4,
    active: true,
  },
  {
    code: 'value',
    name: 'Value',
    vcpu: 6,
    ramMb: 8192,
    storageGb: 180,
    transferGb: 5000,
    priceMonthly: 3699,
    virtfusionPackageId: 5,
    active: true,
  },
  {
    code: 'ubw-micro',
    name: 'Unlimited Bandwidth - Micro',
    vcpu: 8,
    ramMb: 16384,
    storageGb: 320,
    transferGb: -1,
    priceMonthly: 5999,
    virtfusionPackageId: 6,
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
