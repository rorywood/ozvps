import { db } from "./db";
import { userAuditLogs } from "../shared/schema";
import type { Request } from "express";

interface UserAuditParams {
  auth0UserId: string;
  email: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Get IP address from request
 */
function getIpAddress(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  return forwardedFor
    ? (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(",")[0]).trim()
    : req.socket?.remoteAddress || "unknown";
}

/**
 * Remove sensitive fields from details before logging
 */
function sanitizeDetails(details: any): any {
  if (!details || typeof details !== "object") {
    return details;
  }

  const sensitiveFields = [
    "password",
    "newPassword",
    "currentPassword",
    "secret",
    "token",
    "apiKey",
    "accessToken",
    "refreshToken",
    "backupCodes",
    "totpSecret",
  ];

  const sanitized = { ...details };
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

/**
 * Log a user action to the audit log table
 */
export async function logUserAction(params: UserAuditParams): Promise<void> {
  try {
    await db.insert(userAuditLogs).values({
      auth0UserId: params.auth0UserId,
      email: params.email,
      action: params.action,
      targetType: params.targetType || null,
      targetId: params.targetId || null,
      details: params.details ? sanitizeDetails(params.details) : null,
      ipAddress: params.ipAddress || "unknown",
      userAgent: params.userAgent || "unknown",
    });
  } catch (error: any) {
    // Log to console but don't throw - audit logging should not break the main operation
    console.error(`[user-audit] Failed to log action ${params.action}: ${error.message}`);
  }
}

/**
 * Helper to log user action from request context
 */
export async function auditUserAction(
  req: Request,
  auth0UserId: string,
  email: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: any
): Promise<void> {
  return logUserAction({
    auth0UserId,
    email,
    action,
    targetType,
    targetId,
    details,
    ipAddress: getIpAddress(req),
    userAgent: req.headers["user-agent"] || "unknown",
  });
}

// Common action types for consistency
export const UserActions = {
  // Authentication
  LOGIN_SUCCESS: "login_success",
  LOGIN_FAILURE: "login_failure",
  LOGOUT: "logout",

  // Password
  PASSWORD_CHANGE: "password_change",
  PASSWORD_RESET_REQUEST: "password_reset_request",
  PASSWORD_RESET_COMPLETE: "password_reset_complete",

  // 2FA
  TWO_FA_ENABLE: "2fa_enable",
  TWO_FA_DISABLE: "2fa_disable",
  TWO_FA_VERIFY: "2fa_verify",
  BACKUP_CODES_GENERATE: "backup_codes_generate",
  EMAIL_2FA_CODE_SENT: "email_2fa_code_sent",

  // Server operations
  SERVER_CREATE: "server_create",
  SERVER_CANCEL: "server_cancel",
  SERVER_DELETE: "server_delete",
  SERVER_REINSTALL: "server_reinstall",
  SERVER_PASSWORD_RESET: "server_password_reset",

  // Account
  PROFILE_UPDATE: "profile_update",
  EMAIL_CHANGE: "email_change",
  ACCOUNT_DELETE: "account_delete",
} as const;
