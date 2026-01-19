import { Request, Response, NextFunction } from "express";
import { db } from "../../server/db";
import { adminIpWhitelist } from "../../shared/schema";
import { eq, and, gt, or, isNull } from "drizzle-orm";

// Cache whitelist for 60 seconds to avoid DB hits on every request
let whitelistCache: { entries: typeof adminIpWhitelist.$inferSelect[]; updatedAt: number } | null = null;
const CACHE_TTL = 60 * 1000; // 60 seconds

async function getWhitelistEntries() {
  const now = Date.now();
  if (whitelistCache && now - whitelistCache.updatedAt < CACHE_TTL) {
    return whitelistCache.entries;
  }

  const entries = await db
    .select()
    .from(adminIpWhitelist)
    .where(
      and(
        eq(adminIpWhitelist.enabled, true),
        or(isNull(adminIpWhitelist.expiresAt), gt(adminIpWhitelist.expiresAt, new Date()))
      )
    );

  whitelistCache = { entries, updatedAt: now };
  return entries;
}

// Force refresh cache (call after whitelist changes)
export function invalidateWhitelistCache() {
  whitelistCache = null;
}

export function getClientIp(req: Request): string {
  // Check X-Forwarded-For header (set by nginx/load balancer)
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    // First IP is the original client
    const clientIp = ips.split(",")[0].trim();
    return normalizeIp(clientIp);
  }

  // Check X-Real-IP header (nginx)
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    const ip = Array.isArray(realIp) ? realIp[0] : realIp;
    return normalizeIp(ip);
  }

  // Fall back to socket address
  return normalizeIp(req.socket.remoteAddress || "unknown");
}

function normalizeIp(ip: string): string {
  // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }
  return ip;
}

function ipToNumber(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return -1; // Invalid IPv4
  }
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const num = parseInt(p, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
}

function isIpInCidr(ip: string, cidrIp: string, cidrMask: string): boolean {
  // Only support IPv4 CIDR for simplicity
  if (!isIpv4(ip) || !isIpv4(cidrIp)) {
    return false;
  }

  const maskBits = parseInt(cidrMask.replace("/", ""), 10);
  if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) {
    return false;
  }

  const ipNum = ipToNumber(ip);
  const cidrNum = ipToNumber(cidrIp);
  if (ipNum === -1 || cidrNum === -1) {
    return false;
  }

  // Create subnet mask
  const mask = maskBits === 0 ? 0 : ~((1 << (32 - maskBits)) - 1);

  return (ipNum & mask) === (cidrNum & mask);
}

function isIpWhitelisted(clientIp: string, entries: typeof adminIpWhitelist.$inferSelect[]): boolean {
  const normalizedClientIp = normalizeIp(clientIp);

  for (const entry of entries) {
    const entryIp = normalizeIp(entry.ipAddress);

    // Check exact match
    if (normalizedClientIp === entryIp) {
      return true;
    }

    // Check CIDR match
    if (entry.cidr) {
      if (isIpInCidr(normalizedClientIp, entryIp, entry.cidr)) {
        return true;
      }
    }
  }

  return false;
}

export async function ipWhitelistMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const entries = await getWhitelistEntries();

  // Bootstrap mode: if whitelist is empty, allow all requests
  // This allows initial setup before any IPs are whitelisted
  if (entries.length === 0) {
    (req as any).bootstrapMode = true;
    return next();
  }

  if (isIpWhitelisted(clientIp, entries)) {
    return next();
  }

  // IP not whitelisted - block access
  console.log(`[admin] IP ${clientIp} blocked - not in whitelist`);
  return res.status(403).json({
    error: "Access denied",
    message: "Your IP address is not authorized to access the admin panel",
  });
}
