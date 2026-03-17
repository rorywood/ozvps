export interface LocationConfig {
  name: string;
  country: string;
  countryCode: string;
  hypervisorGroupId: number;
  enabled: boolean;
}

export const LOCATION_CONFIG: Record<string, LocationConfig> = {
  BNE: { name: "Brisbane", country: "Australia", countryCode: "AU", hypervisorGroupId: 2, enabled: true },
  SYD: { name: "Sydney", country: "Australia", countryCode: "AU", hypervisorGroupId: 2, enabled: false },
};

export function getPublicLocations() {
  return Object.entries(LOCATION_CONFIG).map(([code, config]) => ({
    code,
    name: config.name,
    country: config.country,
    countryCode: config.countryCode,
    enabled: config.enabled,
  }));
}
