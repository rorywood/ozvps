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
    code: 'micro',
    name: 'Micro',
    vcpu: 1,
    ramMb: 1024, // 1 GB
    storageGb: 20,
    transferGb: 1000, // 1 TB
    priceMonthly: 700, // $7.00
    virtfusionPackageId: 1,
    active: false, // Out of Stock
  },
  {
    code: 'mini',
    name: 'Mini',
    vcpu: 2,
    ramMb: 2048, // 2 GB
    storageGb: 40,
    transferGb: 2000, // 2 TB
    priceMonthly: 1200, // $12.00
    virtfusionPackageId: 2,
    active: false, // Out of Stock
  },
  {
    code: 'core',
    name: 'Core',
    vcpu: 3,
    ramMb: 4096, // 4 GB
    storageGb: 80,
    transferGb: 3000, // 3 TB
    priceMonthly: 1800, // $18.00
    virtfusionPackageId: 3,
    active: false, // Out of Stock
    popular: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    vcpu: 4,
    ramMb: 6144, // 6 GB
    storageGb: 120,
    transferGb: 4000, // 4 TB
    priceMonthly: 2600, // $26.00
    virtfusionPackageId: 4,
    active: false, // Out of Stock
  },
  {
    code: 'max',
    name: 'Max',
    vcpu: 6,
    ramMb: 8192, // 8 GB
    storageGb: 160,
    transferGb: 5000, // 5 TB
    priceMonthly: 3800, // $38.00
    virtfusionPackageId: 5,
    active: true, // Available
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
