import crypto, { randomBytes, timingSafeEqual } from "crypto";
import type { TrustedTwoFactorDevice } from "@shared/schema";

export const TRUSTED_TWO_FACTOR_DEVICE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TrustedTwoFactorDeviceStore {
  createTrustedTwoFactorDevice(data: {
    auth0UserId: string;
    tokenHash: string;
    userAgentHash: string;
    deviceLabel: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    expiresAt: Date;
  }): Promise<TrustedTwoFactorDevice>;
  getTrustedTwoFactorDeviceByToken(auth0UserId: string, tokenHash: string): Promise<TrustedTwoFactorDevice | undefined>;
  touchTrustedTwoFactorDevice(id: number, updates: {
    lastUsedAt?: Date;
    expiresAt?: Date;
    ipAddress?: string | null;
  }): Promise<TrustedTwoFactorDevice | undefined>;
}

export function hashTrustedTwoFactorToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashTrustedTwoFactorUserAgent(userAgent?: string | null): string {
  const normalizedUserAgent = (userAgent || "unknown").trim().toLowerCase();
  return crypto.createHash("sha256").update(normalizedUserAgent).digest("hex");
}

export function trustedTwoFactorUserAgentMatches(expectedHash: string, userAgent?: string | null): boolean {
  const actualHash = hashTrustedTwoFactorUserAgent(userAgent);
  if (expectedHash.length !== actualHash.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash));
}

function detectPlatform(userAgent: string): string {
  if (/ipad/i.test(userAgent)) return "iPad";
  if (/iphone|ios/i.test(userAgent)) return "iPhone";
  if (/android/i.test(userAgent)) return /tablet/i.test(userAgent) ? "Android tablet" : "Android phone";
  if (/mac os x|macintosh/i.test(userAgent)) return "Mac";
  if (/windows nt/i.test(userAgent)) return "Windows PC";
  if (/linux/i.test(userAgent)) return "Linux PC";
  return "this device";
}

function detectBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) return "Opera";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent) && !/opr\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return "Safari";
  return "Browser";
}

export function buildTrustedTwoFactorDeviceLabel(userAgent?: string | null): string {
  const normalizedUserAgent = (userAgent || "").trim();
  if (!normalizedUserAgent) {
    return "Trusted device";
  }

  const browser = detectBrowser(normalizedUserAgent);
  const platform = detectPlatform(normalizedUserAgent);
  return `${browser} on ${platform}`;
}

export async function createTrustedTwoFactorDevice(
  store: TrustedTwoFactorDeviceStore,
  options: {
    auth0UserId: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  },
): Promise<{ token: string; expiresAt: Date; device: TrustedTwoFactorDevice }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TRUSTED_TWO_FACTOR_DEVICE_DURATION_MS);
  const device = await store.createTrustedTwoFactorDevice({
    auth0UserId: options.auth0UserId,
    tokenHash: hashTrustedTwoFactorToken(token),
    userAgentHash: hashTrustedTwoFactorUserAgent(options.userAgent),
    deviceLabel: buildTrustedTwoFactorDeviceLabel(options.userAgent),
    userAgent: options.userAgent ?? null,
    ipAddress: options.ipAddress ?? null,
    expiresAt,
  });

  return { token, expiresAt, device };
}

export async function validateTrustedTwoFactorDevice(
  store: TrustedTwoFactorDeviceStore,
  options: {
    auth0UserId: string;
    token?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
  },
): Promise<
  | { trusted: true; device: TrustedTwoFactorDevice; expiresAt: Date }
  | { trusted: false; reason: "missing_cookie" | "missing_record" | "user_agent_mismatch" }
> {
  if (!options.token) {
    return { trusted: false, reason: "missing_cookie" };
  }

  const device = await store.getTrustedTwoFactorDeviceByToken(
    options.auth0UserId,
    hashTrustedTwoFactorToken(options.token),
  );

  if (!device) {
    return { trusted: false, reason: "missing_record" };
  }

  if (!trustedTwoFactorUserAgentMatches(device.userAgentHash, options.userAgent)) {
    return { trusted: false, reason: "user_agent_mismatch" };
  }

  const expiresAt = new Date(Date.now() + TRUSTED_TWO_FACTOR_DEVICE_DURATION_MS);
  await store.touchTrustedTwoFactorDevice(device.id, {
    lastUsedAt: new Date(),
    expiresAt,
    ipAddress: options.ipAddress ?? null,
  });

  return { trusted: true, device, expiresAt };
}
