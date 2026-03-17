import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request } from "express";

function getForwardedClientIp(req: Request): string | undefined {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (!forwardedFor) {
    return undefined;
  }

  const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return value.split(",")[0]?.trim() || undefined;
}

export function getRateLimitIp(req: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const forwardedIp = getForwardedClientIp(req);
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

export function createIpRateLimit(options: Partial<Options>) {
  return rateLimit({
    ...options,
    keyGenerator: (req) => ipKeyGenerator(getRateLimitIp(req)),
  });
}
