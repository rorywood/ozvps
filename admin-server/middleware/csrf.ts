import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// CSRF token storage (in-memory, per session)
const csrfTokens = new Map<string, { token: string; createdAt: number }>();
const CSRF_TOKEN_EXPIRY = 8 * 60 * 60 * 1000; // 8 hours (match session expiry)

export function generateCsrfToken(sessionId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  csrfTokens.set(sessionId, { token, createdAt: Date.now() });
  return token;
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

  return crypto.timingSafeEquals(
    Buffer.from(stored.token),
    Buffer.from(token)
  );
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
