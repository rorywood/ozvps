import { Request, Response, NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "crypto";

// CSRF token storage (in-memory, per session)
const csrfTokens = new Map<string, { token: string; createdAt: number }>();
const CSRF_TOKEN_EXPIRY = 8 * 60 * 60 * 1000; // 8 hours (match session expiry)

export function generateCsrfToken(sessionId: string): string {
  const token = randomBytes(32).toString("hex");
  csrfTokens.set(sessionId, { token, createdAt: Date.now() });
  return token;
}

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

export function validateCsrfToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  if (!stored) {
    return false;
  }

  // Check expiry
  if (Date.now() - stored.createdAt > CSRF_TOKEN_EXPIRY) {
    csrfTokens.delete(sessionId);
    return false;
  }

  return safeCompare(stored.token, token);
}

export function clearCsrfToken(sessionId: string): void {
  csrfTokens.delete(sessionId);
}

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of csrfTokens.entries()) {
    if (now - data.createdAt > CSRF_TOKEN_EXPIRY) {
      csrfTokens.delete(sessionId);
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

  if (!validateCsrfToken(sessionId, csrfToken)) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
}
