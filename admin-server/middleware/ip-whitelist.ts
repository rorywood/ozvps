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

  // For API requests, return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({
      error: "Access denied",
      message: "Your IP address is not authorized to access the admin panel",
    });
  }

  // For page requests, return a styled HTML error page
  return res.status(403).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied - OzVPS Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #e2e8f0;
    }
    .container {
      text-align: center;
      padding: 3rem;
      max-width: 500px;
    }
    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg {
      width: 40px;
      height: 40px;
      color: #ef4444;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      color: #f1f5f9;
    }
    p {
      color: #94a3b8;
      margin-bottom: 0.5rem;
      line-height: 1.6;
    }
    .ip {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.5rem 1rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.5rem;
      font-family: monospace;
      font-size: 0.875rem;
      color: #cbd5e1;
    }
    .help {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 0.875rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v.01M12 12v-2m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <h1>Access Denied</h1>
    <p>Your IP address is not authorized to access the admin panel.</p>
    <p>Contact an administrator if you need access.</p>
    <div class="ip">Your IP: ${clientIp}</div>
    <div class="help">
      If you believe this is an error, please contact the system administrator.
    </div>
  </div>
</body>
</html>
  `);
}
