import { md5 } from './md5';

export function getGravatarUrl(email: string, size: number = 80): string {
  const hash = md5(email.toLowerCase().trim());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp`;
}

export function getGravatarUrlWithFallback(email: string, size: number = 80, fallback: 'mp' | 'identicon' | 'monsterid' | 'wavatar' | 'retro' | 'robohash' | 'blank' = 'mp'): string {
  const hash = md5(email.toLowerCase().trim());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${fallback}`;
}
