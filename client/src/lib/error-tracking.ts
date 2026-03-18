import * as Sentry from "@sentry/browser";

export type ClientErrorLevel = "info" | "warning" | "error" | "fatal";

export interface ClientErrorReport {
  source: string;
  message: string;
  level?: ClientErrorLevel;
  error?: unknown;
  route?: string;
  requestUrl?: string;
  method?: string;
  statusCode?: number;
  stack?: string;
  componentStack?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

const EXPECTED_AUTH_ERROR_PATTERNS = [
  "invalid email or password",
  "invalid email or password format",
  "invalid two-factor authentication code",
  "invalid verification code",
  "verification code has expired",
  "no verification code pending",
  "two-factor authentication required",
  "too many 2fa attempts",
  "invalid login token",
];

interface TrackingUser {
  id?: string | number | null;
  email?: string | null;
  username?: string | null;
}

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const SENTRY_ENVIRONMENT = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || "development";
const SENTRY_RELEASE = import.meta.env.VITE_APP_VERSION || "dev";
const RECENT_EVENT_WINDOW_MS = 30_000;
const recentEventCache = new Map<string, number>();
const CSRF_COOKIE = "ozvps_csrf";
const CRITICAL_CLIENT_ERROR_SOURCES = new Set([
  "window.error",
  "window.unhandledrejection",
  "react.error-boundary",
]);

let sentryInitialized = false;
let browserHandlersRegistered = false;

function toError(value: unknown): Error | null {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return new Error(value);
  }

  if (value && typeof value === "object") {
    const maybeMessage = "message" in value && typeof value.message === "string" ? value.message : null;
    if (maybeMessage) {
      const error = new Error(maybeMessage);
      if ("name" in value && typeof value.name === "string") {
        error.name = value.name;
      }
      if ("stack" in value && typeof value.stack === "string") {
        error.stack = value.stack;
      }
      return error;
    }
  }

  return null;
}

function getReportMessage(report: Pick<ClientErrorReport, "message" | "error">): string {
  const error = toError(report.error);
  return (report.message || error?.message || "").trim().toLowerCase();
}

export function shouldIgnoreClientErrorReport(report: Pick<ClientErrorReport, "message" | "error">): boolean {
  const message = getReportMessage(report);
  if (!message) {
    return false;
  }

  return EXPECTED_AUTH_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function isCriticalClientErrorReport(report: ClientErrorReport): boolean {
  if (report.tags?.critical === "true") {
    return true;
  }

  if (report.level === "fatal") {
    return true;
  }

  if (report.statusCode !== undefined && report.statusCode >= 500) {
    return true;
  }

  return CRITICAL_CLIENT_ERROR_SOURCES.has(report.source);
}

function getCurrentRoute(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

function buildFingerprint(report: ClientErrorReport): string {
  return [
    report.source,
    report.level || "error",
    report.message,
    report.route || getCurrentRoute() || "",
    report.requestUrl || "",
    report.method || "",
    report.statusCode || "",
  ].join("|");
}

function shouldSkipDuplicate(report: ClientErrorReport): boolean {
  const fingerprint = buildFingerprint(report);
  const now = Date.now();

  for (const [key, timestamp] of recentEventCache) {
    if (timestamp < now - RECENT_EVENT_WINDOW_MS) {
      recentEventCache.delete(key);
    }
  }

  const previousTimestamp = recentEventCache.get(fingerprint);
  recentEventCache.set(fingerprint, now);
  return previousTimestamp !== undefined && now - previousTimestamp < RECENT_EVENT_WINDOW_MS;
}

function serializeExtra(extra?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!extra) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(extra));
  } catch {
    return { serializationError: true };
  }
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === CSRF_COOKIE) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function getPayload(report: ClientErrorReport) {
  const error = toError(report.error);

  return {
    source: report.source,
    level: report.level || "error",
    message: report.message || error?.message || "Unknown client error",
    route: report.route || getCurrentRoute(),
    requestUrl: report.requestUrl,
    method: report.method,
    statusCode: report.statusCode,
    stack: report.stack || error?.stack,
    componentStack: report.componentStack,
    tags: report.tags,
    extra: serializeExtra(report.extra),
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
  };
}

async function persistClientError(payload: ReturnType<typeof getPayload>): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (payload.requestUrl?.includes("/api/client-errors")) {
    return;
  }

  try {
    const csrfToken = getCsrfToken();
    await fetch("/api/client-errors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch {
    // Don't recurse if the logger endpoint itself is unavailable.
  }
}

function captureWithSentry(payload: ReturnType<typeof getPayload>, report: ClientErrorReport): void {
  if (!sentryInitialized) {
    return;
  }

  const error = toError(report.error);
  const sentryLevel: Sentry.SeverityLevel =
    payload.level === "fatal"
      ? "fatal"
      : payload.level === "warning"
        ? "warning"
        : payload.level === "info"
          ? "info"
          : "error";

  Sentry.withScope((scope) => {
    scope.setLevel(sentryLevel);
    scope.setTag("source", payload.source);
    if (payload.route) {
      scope.setTag("route", payload.route);
    }
    if (payload.method) {
      scope.setTag("method", payload.method);
    }
    if (payload.statusCode) {
      scope.setTag("status_code", String(payload.statusCode));
    }
    Object.entries(payload.tags || {}).forEach(([key, value]) => scope.setTag(key, value));
    scope.setContext("client_error", {
      route: payload.route,
      requestUrl: payload.requestUrl,
      method: payload.method,
      statusCode: payload.statusCode,
      componentStack: payload.componentStack,
      extra: payload.extra,
    });

    if (error) {
      Sentry.captureException(error);
      return;
    }

    Sentry.captureMessage(payload.message, sentryLevel);
  });
}

export function initErrorTracking(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!browserHandlersRegistered) {
    window.addEventListener("error", (event) => {
      void captureClientError({
        source: "window.error",
        level: "error",
        message: event.message || "Unhandled browser error",
        error: event.error,
        stack: event.error?.stack,
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      const rejectionError = toError(event.reason);
      void captureClientError({
        source: "window.unhandledrejection",
        level: "error",
        message: rejectionError?.message || "Unhandled promise rejection",
        error: rejectionError || event.reason,
        stack: rejectionError?.stack,
        extra: {
          reason: typeof event.reason === "string" ? event.reason : undefined,
        },
      });
    });

    browserHandlersRegistered = true;
  }

  if (sentryInitialized || !SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE,
    enabled: true,
    sampleRate: 1,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Network request failed",
      "Failed to fetch",
    ],
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
        delete event.request.headers["x-csrf-token"];
      }

      return event;
    },
  });

  sentryInitialized = true;
}

export function setErrorTrackingUser(user: TrackingUser | null): void {
  if (!sentryInitialized) {
    return;
  }

  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id ? String(user.id) : undefined,
    email: user.email || undefined,
    username: user.username || undefined,
  });
}

export async function captureClientError(report: ClientErrorReport): Promise<void> {
  const normalizedReport: ClientErrorReport = {
    level: "error",
    ...report,
    route: report.route || getCurrentRoute(),
  };

  if (shouldIgnoreClientErrorReport(normalizedReport)) {
    return;
  }

  if (!isCriticalClientErrorReport(normalizedReport)) {
    return;
  }

  if (shouldSkipDuplicate(normalizedReport)) {
    return;
  }

  const payload = getPayload(normalizedReport);
  captureWithSentry(payload, normalizedReport);
  await persistClientError(payload);
}

export function addClientBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!sentryInitialized) {
    return;
  }

  Sentry.addBreadcrumb({
    category: "app",
    level: "info",
    message,
    data: serializeExtra(data),
  });
}

export function isClientSentryEnabled(): boolean {
  return sentryInitialized;
}
