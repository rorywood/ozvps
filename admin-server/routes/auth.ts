import { Express, Request, Response } from "express";
import { db } from "../../server/db";
import { twoFactorAuth } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { verifySync as otplibVerifySync } from "otplib";
import { isEncrypted, decryptSecret } from "../../server/crypto";
import argon2 from "argon2";
import { createHmac, timingSafeEqual } from "crypto";
import {
  isUserAdmin,
  createAdminSession,
  revokeAdminSession,
  ADMIN_SESSION_EXPIRY,
} from "../middleware/admin-auth";
import { generateCsrfToken, clearCsrfToken } from "../middleware/csrf";
import { getClientIp } from "../middleware/ip-whitelist";
import { log } from "../../server/logger";

// HMAC secret for signing pending login tokens
// SECURITY: Must use SESSION_SECRET in production - no fallbacks allowed
const PENDING_TOKEN_SECRET = process.env.SESSION_SECRET;
if (!PENDING_TOKEN_SECRET || PENDING_TOKEN_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: SESSION_SECRET must be set and at least 32 characters in production');
  }
  console.warn('WARNING: SESSION_SECRET not set or too short - using insecure fallback for development only');
}
const EFFECTIVE_TOKEN_SECRET = PENDING_TOKEN_SECRET || 'dev-only-insecure-token-secret-do-not-use-in-prod';

/**
 * Create a signed pending login token with HMAC
 */
function createPendingLoginToken(data: { auth0UserId: string; email: string; name: string | null; exp: number }): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = createHmac("sha256", EFFECTIVE_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verify and decode a pending login token
 */
function verifyPendingLoginToken(token: string): { auth0UserId: string; email: string; name: string | null; exp: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const [payload, signature] = parts;

    // Verify signature
    const expectedSignature = createHmac("sha256", EFFECTIVE_TOKEN_SECRET)
      .update(payload)
      .digest("base64url");

    if (signature.length !== expectedSignature.length) {
      return null;
    }

    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    // Decode payload
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());

    // Check expiry
    if (Date.now() > data.exp) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

// Verify password using Auth0 Resource Owner Password Grant
// This requires the Auth0 application to have "Password" grant type enabled
async function verifyAuth0Password(email: string, password: string): Promise<{ success: boolean; auth0UserId?: string; name?: string; error?: string }> {
  const auth0Domain = process.env.AUTH0_DOMAIN;
  const auth0ClientId = process.env.AUTH0_CLIENT_ID;
  const auth0ClientSecret = process.env.AUTH0_CLIENT_SECRET;

  if (!auth0Domain || !auth0ClientId || !auth0ClientSecret) {
    return { success: false, error: "Auth0 configuration missing" };
  }

  try {
    const response = await fetch(`https://${auth0Domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "password",
        client_id: auth0ClientId,
        client_secret: auth0ClientSecret,
        username: email,
        password: password,
        scope: "openid profile email",
        audience: `https://${auth0Domain}/api/v2/`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      log(`Auth0 login failed: ${error.error_description || error.error}`, 'admin-auth', { level: 'warn' });
      return { success: false, error: error.error_description || "Invalid credentials" };
    }

    const tokens = await response.json();

    // Decode the ID token to get user info (includes name from Auth0)
    const idToken = tokens.id_token;
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());

    // Get name from Auth0 - prefer name, fall back to nickname or email prefix
    const name = payload.name || payload.nickname || email.split('@')[0];

    return { success: true, auth0UserId: payload.sub, name };
  } catch (error: any) {
    log(`Auth0 error: ${error.message}`, 'admin-auth', { level: 'error' });
    return { success: false, error: "Authentication service error" };
  }
}

export function registerAuthRoutes(app: Express) {
  // Get current session info
  app.get("/api/auth/session", async (req: Request, res: Response) => {
    const sessionId = req.cookies?.["admin_session"];
    if (!sessionId) {
      return res.json({ authenticated: false });
    }

    // Import here to avoid circular deps
    const { validateAdminSession } = await import("../middleware/admin-auth");
    const clientIp = getClientIp(req);
    const session = await validateAdminSession(sessionId, clientIp);

    if (!session) {
      res.clearCookie("admin_session", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      return res.json({ authenticated: false });
    }

    // Generate CSRF token for the session
    const csrfToken = await generateCsrfToken(sessionId);

    return res.json({
      authenticated: true,
      user: {
        email: session.email,
        name: session.name,
      },
      csrfToken,
      bootstrapMode: (req as any).bootstrapMode || false,
    });
  });

  // Step 1: Verify credentials and check 2FA status
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // Verify credentials with Auth0 FIRST
    const authResult = await verifyAuth0Password(email, password);
    if (!authResult.success || !authResult.auth0UserId) {
      return res.status(401).json({ error: authResult.error || "Invalid credentials" });
    }

    const auth0UserId = authResult.auth0UserId;

    // Check if user is an admin via Auth0 app_metadata
    const isAdmin = await isUserAdmin(auth0UserId);
    if (!isAdmin) {
      log('Non-admin login attempt blocked', 'admin-auth', { level: 'warn' });
      return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }

    // Get name from Auth0 (already fetched during password verification)
    const userName = authResult.name || email.split('@')[0];

    // TEMPORARY: Allow bypassing 2FA via environment variable for recovery
    // Set ADMIN_BYPASS_2FA=true in .env to skip 2FA (remove after re-enabling 2FA!)
    if (process.env.ADMIN_BYPASS_2FA === 'true') {
      log('WARNING: 2FA bypassed via ADMIN_BYPASS_2FA env var', 'admin-auth', { level: 'warn' });

      // Create session directly without 2FA
      const clientIp = getClientIp(req);
      const userAgent = req.headers["user-agent"] || null;
      const sessionId = await createAdminSession(
        auth0UserId,
        email,
        userName,
        clientIp,
        userAgent
      );

      // Generate CSRF token
      const csrfToken = await generateCsrfToken(sessionId);

      // Set session cookie
      res.cookie("admin_session", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: ADMIN_SESSION_EXPIRY,
      });

      log(`Admin login successful (2FA bypassed) from ${clientIp}`, 'admin-auth');

      return res.json({
        success: true,
        user: {
          email,
          name: userName,
        },
        csrfToken,
        bootstrapMode: (req as any).bootstrapMode || false,
      });
    }

    // Check if 2FA is enabled (this is the only thing we need from the database)
    const [tfa] = await db
      .select()
      .from(twoFactorAuth)
      .where(and(eq(twoFactorAuth.auth0UserId, auth0UserId), eq(twoFactorAuth.enabled, true)));

    if (!tfa) {
      return res.status(403).json({
        error: "2FA required",
        message: "Two-factor authentication must be enabled to access the admin panel. Please enable 2FA in the main panel first.",
        requires2FASetup: true,
      });
    }

    // 2FA is enabled, return a signed temporary token for the second step
    // Token is HMAC-signed and expires in 5 minutes
    const pendingLoginToken = createPendingLoginToken({
      auth0UserId,
      email,
      name: userName,
      exp: Date.now() + 5 * 60 * 1000,
    });

    return res.json({
      requires2FA: true,
      pendingLoginToken,
    });
  });

  // Step 2: Verify 2FA code and create session
  app.post("/api/auth/verify-2fa", async (req: Request, res: Response) => {
    try {
      const { pendingLoginToken, code } = req.body;

      if (!pendingLoginToken || !code) {
        return res.status(400).json({ error: "Token and 2FA code required" });
      }

      // Verify and decode the pending login token (HMAC-signed)
      const tokenData = verifyPendingLoginToken(pendingLoginToken);
      if (!tokenData) {
        return res.status(401).json({ error: "Invalid or expired login token. Please start over." });
      }

      log('Verifying 2FA for admin login', 'admin-auth');

      // Get the user's 2FA secret
      const [tfa] = await db
        .select()
        .from(twoFactorAuth)
        .where(and(eq(twoFactorAuth.auth0UserId, tokenData.auth0UserId), eq(twoFactorAuth.enabled, true)));

      if (!tfa) {
        log('No 2FA record found for admin user', 'admin-auth', { level: 'warn' });
        return res.status(403).json({ error: "2FA not enabled for this account" });
      }

      // Decrypt the secret if encrypted
      let plaintextSecret: string;
      try {
        plaintextSecret = isEncrypted(tfa.secret) ? decryptSecret(tfa.secret) : tfa.secret;
      } catch (decryptError: any) {
        log(`Failed to decrypt 2FA secret: ${decryptError.message}`, 'admin-auth', { level: 'error' });
        return res.status(500).json({ error: "Authentication error" });
      }

      // Verify the TOTP code
      const isValid = otplibVerifySync({ token: code, secret: plaintextSecret });

      if (!isValid) {
        // Check backup codes
        if (tfa.backupCodes) {
          try {
            const backupCodes: string[] = JSON.parse(tfa.backupCodes);
            let backupCodeUsed = false;

            for (let i = 0; i < backupCodes.length; i++) {
              // Backup codes are stored hashed
              const isMatch = await argon2.verify(backupCodes[i], code);
              if (isMatch) {
                // Remove the used backup code
                backupCodes.splice(i, 1);
                await db
                  .update(twoFactorAuth)
                  .set({ backupCodes: JSON.stringify(backupCodes), lastUsedAt: new Date() })
                  .where(eq(twoFactorAuth.auth0UserId, tokenData.auth0UserId));
                backupCodeUsed = true;
                log('Backup code used for admin login', 'admin-auth');
                break;
              }
            }

            if (!backupCodeUsed) {
              log('Invalid 2FA code for admin login', 'admin-auth', { level: 'warn' });
              return res.status(401).json({ error: "Invalid 2FA code" });
            }
          } catch (backupError: any) {
            log(`Backup code check error: ${backupError.message}`, 'admin-auth', { level: 'warn' });
            return res.status(401).json({ error: "Invalid 2FA code" });
          }
        } else {
          log('Invalid 2FA code for admin login', 'admin-auth', { level: 'warn' });
          return res.status(401).json({ error: "Invalid 2FA code" });
        }
      } else {
        // Update last used timestamp
        await db
          .update(twoFactorAuth)
          .set({ lastUsedAt: new Date() })
          .where(eq(twoFactorAuth.auth0UserId, tokenData.auth0UserId));
      }

      log('2FA verified for admin login', 'admin-auth');

      // 2FA verified - create admin session
      const clientIp = getClientIp(req);
      const userAgent = req.headers["user-agent"] || null;
      const sessionId = await createAdminSession(
        tokenData.auth0UserId,
        tokenData.email,
        tokenData.name,
        clientIp,
        userAgent
      );

      // Generate CSRF token
      const csrfToken = await generateCsrfToken(sessionId);

      // Set session cookie
      res.cookie("admin_session", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: ADMIN_SESSION_EXPIRY,
      });

      log(`Admin login successful from ${clientIp}`, 'admin-auth');

      return res.json({
        success: true,
        user: {
          email: tokenData.email,
          name: tokenData.name,
        },
        csrfToken,
        bootstrapMode: (req as any).bootstrapMode || false,
      });
    } catch (error: any) {
      log(`2FA verification error: ${error.message}`, 'admin-auth', { level: 'error' });
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const sessionId = req.cookies?.["admin_session"];

    if (sessionId) {
      await revokeAdminSession(sessionId, "LOGOUT");
      await clearCsrfToken(sessionId);
    }

    res.clearCookie("admin_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.json({ success: true });
  });
}
