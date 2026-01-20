import { db } from "../../server/db";
import { adminAuditLogs } from "../../shared/schema";
import type { Request } from "express";

interface AuditLogParams {
  req: Request;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  payload?: any;
  result?: any;
  status?: "success" | "failure" | "pending";
  errorMessage?: string;
  reason?: string;
}

/**
 * Log an admin action to the audit log table
 * Should be called for all admin actions that modify data
 */
export async function logAdminAction(params: AuditLogParams): Promise<void> {
  const {
    req,
    action,
    targetType,
    targetId,
    targetLabel,
    payload,
    result,
    status = "success",
    errorMessage,
    reason,
  } = params;

  const session = req.adminSession;
  if (!session) {
    console.error("[audit-log] No admin session found, skipping audit log");
    return;
  }

  // Get IP address from request
  const forwardedFor = req.headers["x-forwarded-for"];
  const ipAddress = forwardedFor
    ? (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(",")[0]).trim()
    : req.socket?.remoteAddress || "unknown";

  const userAgent = req.headers["user-agent"] || "unknown";

  try {
    await db.insert(adminAuditLogs).values({
      adminAuth0UserId: session.auth0UserId,
      adminEmail: session.email,
      action,
      targetType,
      targetId: targetId || null,
      targetLabel: targetLabel || null,
      payload: payload ? sanitizePayload(payload) : null,
      result: result || null,
      status,
      errorMessage: errorMessage || null,
      ipAddress,
      userAgent,
      reason: reason || null,
    });
  } catch (error: any) {
    // Log to console but don't throw - audit logging should not break the main operation
    console.error(`[audit-log] Failed to log action ${action}: ${error.message}`);
  }
}

/**
 * Remove sensitive fields from payload before logging
 */
function sanitizePayload(payload: any): any {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const sensitiveFields = [
    "password",
    "newPassword",
    "currentPassword",
    "secret",
    "token",
    "apiKey",
    "apiToken",
    "accessToken",
    "refreshToken",
    "backupCodes",
  ];

  const sanitized = { ...payload };
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

/**
 * Helper to create a standard audit log for successful operations
 */
export function auditSuccess(
  req: Request,
  action: string,
  targetType: string,
  targetId?: string,
  targetLabel?: string,
  result?: any
): Promise<void> {
  return logAdminAction({
    req,
    action,
    targetType,
    targetId,
    targetLabel,
    payload: req.body,
    result,
    status: "success",
  });
}

/**
 * Helper to create a standard audit log for failed operations
 */
export function auditFailure(
  req: Request,
  action: string,
  targetType: string,
  errorMessage: string,
  targetId?: string,
  targetLabel?: string
): Promise<void> {
  return logAdminAction({
    req,
    action,
    targetType,
    targetId,
    targetLabel,
    payload: req.body,
    status: "failure",
    errorMessage,
  });
}
