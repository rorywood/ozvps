import { Request, Response, NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "crypto";
import { redisClient } from "../../server/redis";

const CSRF_TOKEN_EXPIRY = 8 * 60 * 60; // 8 hours in seconds (match session expiry)
const CSRF_TOKEN_PREFIX = "admin:csrf:";

// Fallback in-memory storage (used when Redis is unavailable)
const memoryFallback = new Map<string, { token: string; createdAt: number }>();

// Safe string comparison that works with esbuild
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  try {
    // Try to use native timingSafeEqual
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    // Fallback to constant-time comparison
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

function isRedisAvailable(): boolean {
  return redisClient !== null && redisClient.isReady;
}

export async function generateCsrfToken(sessionId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");

  if (isRedisAvailable()) {
    try {
      await redisClient!.set(`${CSRF_TOKEN_PREFIX}${sessionId}`, token, {
        EX: CSRF_TOKEN_EXPIRY,
      });
    } catch (err) {
      console.error("[csrf] Redis error, falling back to memory:", (err as Error).message);
      memoryFallback.set(sessionId, { token, createdAt: Date.now() });
    }
  } else {
    memoryFallback.set(sessionId, { token, createdAt: Date.now() });
  }

  return token;
}

export async function validateCsrfToken(sessionId: string, token: string): Promise<boolean> {
  let storedToken: string | null = null;

  if (isRedisAvailable()) {
    try {
      storedToken = await redisClient!.get(`${CSRF_TOKEN_PREFIX}${sessionId}`);
    } catch (err) {
      console.error("[csrf] Redis error, checking memory fallback:", (err as Error).message);
      // Fall through to check memory
    }
  }

  // Check memory fallback if Redis didn't have it
  if (!storedToken) {
    const stored = memoryFallback.get(sessionId);
    if (stored) {
      // Check expiry for memory fallback
      if (Date.now() - stored.createdAt > CSRF_TOKEN_EXPIRY * 1000) {
        memoryFallback.delete(sessionId);
        return false;
      }
      storedToken = stored.token;
    }
  }

  if (!storedToken) {
    return false;
  }

  return safeCompare(storedToken, token);
}

export async function clearCsrfToken(sessionId: string): Promise<void> {
  if (isRedisAvailable()) {
    try {
      await redisClient!.del(`${CSRF_TOKEN_PREFIX}${sessionId}`);
    } catch (err) {
      console.error("[csrf] Redis error clearing token:", (err as Error).message);
    }
  }
  // Always try to clear from memory too
  memoryFallback.delete(sessionId);
}

// Clean up expired tokens from memory fallback periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of memoryFallback.entries()) {
    if (now - data.createdAt > CSRF_TOKEN_EXPIRY * 1000) {
      memoryFallback.delete(sessionId);
    }
  }
}, 60 * 60 * 1000); // Run every hour

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF check for GET, HEAD, OPTIONS requests (they should be idempotent)
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const sessionId = req.cookies?.["admin_session"];
  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Check for CSRF token in header
  const csrfToken = req.headers["x-csrf-token"] as string;
  if (!csrfToken) {
    return res.status(403).json({ error: "CSRF token required" });
  }

  // Async validation
  validateCsrfToken(sessionId, csrfToken)
    .then((valid) => {
      if (!valid) {
        return res.status(403).json({ error: "Invalid CSRF token" });
      }
      next();
    })
    .catch((err) => {
      console.error("[csrf] Validation error:", err.message);
      res.status(500).json({ error: "CSRF validation failed" });
    });
}
