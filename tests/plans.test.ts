import { describe, it, expect } from 'vitest';
import { STATIC_PLANS, formatPrice, formatRam, formatTransfer } from '../shared/plans';

describe('STATIC_PLANS', () => {
  it('should have 5 plans defined', () => {
    expect(STATIC_PLANS).toHaveLength(5);
  });

  it('should have all required plan properties', () => {
    const requiredKeys = ['code', 'name', 'vcpu', 'ramMb', 'storageGb', 'transferGb', 'priceMonthly', 'virtfusionPackageId', 'active'];

    for (const plan of STATIC_PLANS) {
      for (const key of requiredKeys) {
        expect(plan).toHaveProperty(key);
      }
    }
  });

  it('should have unique plan codes', () => {
    const codes = STATIC_PLANS.map(p => p.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should have unique virtfusion package IDs', () => {
    const ids = STATIC_PLANS.map(p => p.virtfusionPackageId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have prices as positive integers (cents)', () => {
    for (const plan of STATIC_PLANS) {
      expect(plan.priceMonthly).toBeGreaterThan(0);
      expect(Number.isInteger(plan.priceMonthly)).toBe(true);
    }
  });

  it('should have exactly one popular plan', () => {
    const popularPlans = STATIC_PLANS.filter(p => p.popular);
    expect(popularPlans.length).toBe(1);
    expect(popularPlans[0].code).toBe('core');
  });

  it('should have valid spec ranges', () => {
    for (const plan of STATIC_PLANS) {
      expect(plan.vcpu).toBeGreaterThanOrEqual(1);
      expect(plan.vcpu).toBeLessThanOrEqual(16);
      expect(plan.ramMb).toBeGreaterThanOrEqual(512);
      expect(plan.storageGb).toBeGreaterThanOrEqual(10);
      expect(plan.transferGb).toBeGreaterThanOrEqual(500);
    }
  });
});

describe('formatPrice', () => {
  it('should format cents to dollars with 2 decimal places', () => {
    expect(formatPrice(700)).toBe('$7.00');
    expect(formatPrice(1200)).toBe('$12.00');
    expect(formatPrice(1850)).toBe('$18.50');
    expect(formatPrice(0)).toBe('$0.00');
  });
});

describe('formatRam', () => {
  it('should format MB to GB for values >= 1024', () => {
    expect(formatRam(1024)).toBe('1 GB');
    expect(formatRam(2048)).toBe('2 GB');
    expect(formatRam(4096)).toBe('4 GB');
    expect(formatRam(8192)).toBe('8 GB');
    expect(formatRam(12288)).toBe('12 GB');
  });

  it('should keep MB for values < 1024', () => {
    expect(formatRam(512)).toBe('512 MB');
    expect(formatRam(768)).toBe('768 MB');
  });
});

describe('formatTransfer', () => {
  it('should format GB to TB for values >= 1000', () => {
    expect(formatTransfer(1000)).toBe('1 TB');
    expect(formatTransfer(2000)).toBe('2 TB');
    expect(formatTransfer(5000)).toBe('5 TB');
  });

  it('should keep GB for values < 1000', () => {
    expect(formatTransfer(500)).toBe('500 GB');
    expect(formatTransfer(750)).toBe('750 GB');
  });

  it('should return Unlimited for -1', () => {
    expect(formatTransfer(-1)).toBe('Unlimited');
  });
});
