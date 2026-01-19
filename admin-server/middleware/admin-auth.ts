import { Request, Response, NextFunction } from "express";
import { db } from "../../server/db";
import { adminSessions, twoFactorAuth, userMappings } from "../../shared/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import crypto from "crypto";
import { getClientIp } from "./ip-whitelist";
import { auth0Client } from "../../server/auth0";

// Admin session settings
export const ADMIN_SESSION_EXPIRY = 8 * 60 * 60 * 1000; // 8 hours
export const ADMIN_IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes of inactivity

/**
 * Check if a user is an admin via Auth0's app_metadata.is_admin
 * This uses the Auth0 Management API to fetch the user and check their metadata
 */
export async function isUserAdmin(auth0UserId: string): Promise<boolean> {
  return auth0Client.isUserAdmin(auth0UserId);
}

export interface AdminSessionData {
  id: string;
  auth0UserId: string;
  email: string;
  name: string | null;
  ipAddress: string;
}

export function generateSessionId(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createAdminSession(
  auth0UserId: string,
  email: string,
  name: string | null,
  ipAddress: string,
  userAgent: string | null
): Promise<string> {
  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_EXPIRY);

  await db.insert(adminSessions).values({
    id: sessionId,
    auth0UserId,
    email,
    name,
    ipAddress,
    userAgent,
    expiresAt,
    createdAt: now,
    lastActivityAt: now,
  });

  return sessionId;
}

export async function validateAdminSession(
  sessionId: string,
  currentIp: string
): Promise<AdminSessionData | null> {
  const now = new Date();

  const [session] = await db
    .select()
    .from(adminSessions)
    .where(
      and(
        eq(adminSessions.id, sessionId),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, now)
      )
    );

  if (!session) {
    return null;
  }

  // Check IP binding - session must come from same IP
  if (session.ipAddress !== currentIp) {
    console.log(`[admin-auth] Session IP mismatch: expected ${session.ipAddress}, got ${currentIp}`);
    return null;
  }

  // Check idle timeout
  const lastActivity = new Date(session.lastActivityAt).getTime();
  if (now.getTime() - lastActivity > ADMIN_IDLE_TIMEOUT) {
    console.log(`[admin-auth] Session idle timeout for ${session.email}`);
    // Revoke the session
    await db
      .update(adminSessions)
      .set({ revokedAt: now, revokedReason: "IDLE_TIMEOUT" })
      .where(eq(adminSessions.id, sessionId));
    return null;
  }

  // Update last activity
  await db
    .update(adminSessions)
    .set({ lastActivityAt: now })
    .where(eq(adminSessions.id, sessionId));

  return {
    id: session.id,
    auth0UserId: session.auth0UserId,
    email: session.email,
    name: session.name,
    ipAddress: session.ipAddress,
  };
}

export async function revokeAdminSession(sessionId: string, reason: string): Promise<void> {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(eq(adminSessions.id, sessionId));
}

export async function revokeAllAdminSessions(auth0UserId: string, reason: string): Promise<void> {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(
      and(eq(adminSessions.auth0UserId, auth0UserId), isNull(adminSessions.revokedAt))
    );
}

export async function checkUserHas2FA(auth0UserId: string): Promise<boolean> {
  const [tfa] = await db
    .select()
    .from(twoFactorAuth)
    .where(and(eq(twoFactorAuth.auth0UserId, auth0UserId), eq(twoFactorAuth.enabled, true)));

  return !!tfa;
}

export async function getAdminUserInfo(auth0UserId: string): Promise<{ email: string; name: string | null } | null> {
  const [mapping] = await db
    .select()
    .from(userMappings)
    .where(eq(userMappings.auth0UserId, auth0UserId));

  if (!mapping) {
    return null;
  }

  return {
    email: mapping.email,
    name: mapping.name,
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      adminSession?: AdminSessionData;
      bootstrapMode?: boolean;
    }
  }
}

export async function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.["admin_session"];

  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const clientIp = getClientIp(req);
  const session = await validateAdminSession(sessionId, clientIp);

  if (!session) {
    // Clear the invalid cookie
    res.clearCookie("admin_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  // Verify the user is still an admin via Auth0
  const stillAdmin = await isUserAdmin(session.auth0UserId);
  if (!stillAdmin) {
    await revokeAdminSession(sessionId, "NOT_ADMIN");
    res.clearCookie("admin_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    return res.status(403).json({ error: "Not authorized" });
  }

  req.adminSession = session;
  next();
}
