import { Express, Request, Response } from "express";
import { auth0Client } from "../../server/auth0";
import {
  isUserAdmin,
  createAdminSession,
  revokeAdminSession,
  ADMIN_SESSION_EXPIRY,
} from "../middleware/admin-auth";
import { generateCsrfToken, clearCsrfToken } from "../middleware/csrf";
import { getClientIp } from "../middleware/ip-whitelist";
import { log } from "../../server/logger";

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

  const twoFactorTemporarilyUnavailable = (res: Response) => {
    return res.status(503).json({
      error: "Two-factor authentication is temporarily unavailable",
      code: "TWO_FACTOR_TEMPORARILY_DISABLED",
    });
  };

  // Verify credentials and create a session directly while 2FA is disabled
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

    const clientIp = getClientIp(req);
    const userAgent = req.headers["user-agent"] || null;
    const sessionId = await createAdminSession(
      auth0UserId,
      email,
      userName,
      clientIp,
      userAgent
    );

    const csrfToken = await generateCsrfToken(sessionId);

    res.cookie("admin_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: ADMIN_SESSION_EXPIRY,
    });

    log(`Admin login successful with 2FA temporarily disabled from ${clientIp}`, 'admin-auth', { level: 'warn' });

    return res.json({
      success: true,
      user: {
        email,
        name: userName,
      },
      csrfToken,
      bootstrapMode: (req as any).bootstrapMode || false,
      twoFactorTemporarilyDisabled: true,
    });
  });

  app.post("/api/auth/send-email-2fa", async (req: Request, res: Response) => {
    return twoFactorTemporarilyUnavailable(res);
  });

  app.post("/api/auth/verify-2fa", async (req: Request, res: Response) => {
    return twoFactorTemporarilyUnavailable(res);
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
