import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const BRISBANE_TZ = 'Australia/Brisbane';

/** Format a date string as "16 Mar 2026" in Brisbane time */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-AU', {
    year: 'numeric', month: 'short', day: 'numeric',
    timeZone: BRISBANE_TZ,
  });
}

/** Format a date string as "16 Mar" (no year) in Brisbane time */
export function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short',
    timeZone: BRISBANE_TZ,
  });
}

/** Format a date string as "16 Mar 2026, 6:00 pm" in Brisbane time */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-AU', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: BRISBANE_TZ,
  });
}

/** Format a time string as "18:00:00" in Brisbane time */
export function formatTime(dateString: string | number): string {
  return new Date(dateString).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: BRISBANE_TZ,
  });
}
