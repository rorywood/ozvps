const VIRTFUSION_PANEL_URL = "https://panel.ozvps.com.au";

const OS_LOGO_MAP: Record<string, string> = {
  almalinux: `${VIRTFUSION_PANEL_URL}/img/logo/almalinux_logo.png`,
  alma: `${VIRTFUSION_PANEL_URL}/img/logo/almalinux_logo.png`,
  centos: `${VIRTFUSION_PANEL_URL}/img/logo/centos_logo.png`,
  debian: `${VIRTFUSION_PANEL_URL}/img/logo/debian_logo.png`,
  fedora: `${VIRTFUSION_PANEL_URL}/img/logo/fedora_logo.png`,
  ubuntu: `${VIRTFUSION_PANEL_URL}/img/logo/ubuntu_logo.png`,
  opensuse: `${VIRTFUSION_PANEL_URL}/img/logo/opensuse_logo.png`,
  suse: `${VIRTFUSION_PANEL_URL}/img/logo/opensuse_logo.png`,
  oracle: `${VIRTFUSION_PANEL_URL}/img/logo/oracle_linux_logo.png`,
  oraclelinux: `${VIRTFUSION_PANEL_URL}/img/logo/oracle_linux_logo.png`,
};

const FALLBACK_LOGO = `${VIRTFUSION_PANEL_URL}/img/logo/linux_logo.png`;

function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/[\s_-]+/g, '');
}

export interface OsTemplate {
  id: string | number;
  uuid?: string;
  name: string;
  version?: string;
  variant?: string;
  distro?: string;
  slug?: string;
  description?: string;
  group?: string;
}

export function getOsLogoUrl(template: OsTemplate): string {
  const candidates = [
    template.distro,
    template.slug,
    template.name,
    template.group,
  ].filter(Boolean).map(s => normalizeString(s || ''));

  for (const candidate of candidates) {
    for (const [key, url] of Object.entries(OS_LOGO_MAP)) {
      if (candidate.includes(key)) {
        return url;
      }
    }
  }

  return FALLBACK_LOGO;
}

export function getOsCategory(template: OsTemplate): string {
  const normalized = normalizeString(
    template.distro || template.slug || template.name || template.group || ''
  );

  if (normalized.includes('debian') || normalized.includes('ubuntu')) {
    return 'Debian-based';
  }
  if (
    normalized.includes('centos') ||
    normalized.includes('almalinux') ||
    normalized.includes('alma') ||
    normalized.includes('fedora') ||
    normalized.includes('oracle') ||
    normalized.includes('rhel') ||
    normalized.includes('rocky')
  ) {
    return 'RHEL-based';
  }
  if (normalized.includes('suse') || normalized.includes('opensuse')) {
    return 'SUSE';
  }
  return 'Other';
}

export { FALLBACK_LOGO };
