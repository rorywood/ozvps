import { Express, Request, Response } from "express";
import { db } from "../../server/db";
import { userMappings, twoFactorAuth } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { authenticator } from "otplib";
import argon2 from "argon2";
import {
  isUserAdmin,
  createAdminSession,
  revokeAdminSession,
  ADMIN_SESSION_EXPIRY,
} from "../middleware/admin-auth";
import { generateCsrfToken, clearCsrfToken } from "../middleware/csrf";
import { getClientIp } from "../middleware/ip-whitelist";

// Verify password using Auth0 Resource Owner Password Grant
// This requires the Auth0 application to have "Password" grant type enabled
async function verifyAuth0Password(email: string, password: string): Promise<{ success: boolean; auth0UserId?: string; error?: string }> {
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
      console.log(`[admin-auth] Auth0 login failed for ${email}:`, error.error_description || error.error);
      return { success: false, error: error.error_description || "Invalid credentials" };
    }

    const tokens = await response.json();

    // Decode the ID token to get user info
    const idToken = tokens.id_token;
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());

    return { success: true, auth0UserId: payload.sub };
  } catch (error: any) {
    console.log(`[admin-auth] Auth0 error:`, error.message);
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
    const csrfToken = generateCsrfToken(sessionId);

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
      console.log(`[admin-auth] Non-admin login attempt: ${email} (${auth0UserId})`);
      return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }

    // Check if user exists in our database
    const [mapping] = await db
      .select()
      .from(userMappings)
      .where(eq(userMappings.auth0UserId, auth0UserId));

    if (!mapping) {
      console.log(`[admin-auth] Admin ${email} has no user mapping`);
      return res.status(403).json({ error: "Account not found in system" });
    }

    // Check if 2FA is enabled
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

    // 2FA is enabled, return a temporary token for the second step
    // Store in memory with short expiry (5 minutes)
    const pendingLoginToken = Buffer.from(JSON.stringify({
      auth0UserId,
      email,
      name: mapping.name,
      exp: Date.now() + 5 * 60 * 1000,
    })).toString("base64");

    return res.json({
      requires2FA: true,
      pendingLoginToken,
    });
  });

  // Step 2: Verify 2FA code and create session
  app.post("/api/auth/verify-2fa", async (req: Request, res: Response) => {
    const { pendingLoginToken, code } = req.body;

    if (!pendingLoginToken || !code) {
      return res.status(400).json({ error: "Token and 2FA code required" });
    }

    // Decode and validate the pending login token
    let tokenData: { auth0UserId: string; email: string; name: string | null; exp: number };
    try {
      tokenData = JSON.parse(Buffer.from(pendingLoginToken, "base64").toString());
      if (Date.now() > tokenData.exp) {
        return res.status(401).json({ error: "Login session expired. Please start over." });
      }
    } catch {
      return res.status(400).json({ error: "Invalid token" });
    }

    // Get the user's 2FA secret
    const [tfa] = await db
      .select()
      .from(twoFactorAuth)
      .where(and(eq(twoFactorAuth.auth0UserId, tokenData.auth0UserId), eq(twoFactorAuth.enabled, true)));

    if (!tfa) {
      return res.status(403).json({ error: "2FA not enabled" });
    }

    // Verify the TOTP code
    const isValid = authenticator.verify({ token: code, secret: tfa.secret });

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
              console.log(`[admin-auth] Backup code used for ${tokenData.email}`);
              break;
            }
          }

          if (!backupCodeUsed) {
            console.log(`[admin-auth] Invalid 2FA code for ${tokenData.email}`);
            return res.status(401).json({ error: "Invalid 2FA code" });
          }
        } catch {
          console.log(`[admin-auth] Invalid 2FA code for ${tokenData.email}`);
          return res.status(401).json({ error: "Invalid 2FA code" });
        }
      } else {
        console.log(`[admin-auth] Invalid 2FA code for ${tokenData.email}`);
        return res.status(401).json({ error: "Invalid 2FA code" });
      }
    } else {
      // Update last used timestamp
      await db
        .update(twoFactorAuth)
        .set({ lastUsedAt: new Date() })
        .where(eq(twoFactorAuth.auth0UserId, tokenData.auth0UserId));
    }

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
    const csrfToken = generateCsrfToken(sessionId);

    // Set session cookie
    res.cookie("admin_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: ADMIN_SESSION_EXPIRY,
    });

    console.log(`[admin-auth] Admin login successful: ${tokenData.email} from ${clientIp}`);

    return res.json({
      success: true,
      user: {
        email: tokenData.email,
        name: tokenData.name,
      },
      csrfToken,
    });
  });

  // Logout
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const sessionId = req.cookies?.["admin_session"];

    if (sessionId) {
      await revokeAdminSession(sessionId, "LOGOUT");
      clearCsrfToken(sessionId);
    }

    res.clearCookie("admin_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.json({ success: true });
  });
}
