import { describe, expect, it, vi } from "vitest";
import type { TrustedTwoFactorDevice } from "@shared/schema";
import {
  buildTrustedTwoFactorDeviceLabel,
  createTrustedTwoFactorDevice,
  hashTrustedTwoFactorToken,
  hashTrustedTwoFactorUserAgent,
  trustedTwoFactorUserAgentMatches,
  validateTrustedTwoFactorDevice,
} from "../server/trusted-two-factor-devices";

function buildDevice(overrides: Partial<TrustedTwoFactorDevice> = {}): TrustedTwoFactorDevice {
  return {
    id: 1,
    auth0UserId: "auth0|user_123",
    tokenHash: hashTrustedTwoFactorToken("trusted-token"),
    userAgentHash: hashTrustedTwoFactorUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0"),
    deviceLabel: "Chrome on Windows PC",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0",
    ipAddress: "203.0.113.1",
    createdAt: new Date("2026-03-18T00:00:00Z"),
    lastUsedAt: new Date("2026-03-18T00:00:00Z"),
    expiresAt: new Date("2026-04-17T00:00:00Z"),
    revokedAt: null,
    ...overrides,
  };
}

describe("trusted two-factor devices", () => {
  it("builds a readable label from the browser user agent", () => {
    const label = buildTrustedTwoFactorDeviceLabel(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15",
    );

    expect(label).toBe("Safari on Mac");
  });

  it("matches trusted devices against the same user agent", () => {
    expect(
      trustedTwoFactorUserAgentMatches(
        hashTrustedTwoFactorUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0"),
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0",
      ),
    ).toBe(true);
  });

  it("rejects trusted devices when the user agent changes", async () => {
    const store = {
      getTrustedTwoFactorDeviceByToken: vi.fn().mockResolvedValue(buildDevice()),
      touchTrustedTwoFactorDevice: vi.fn(),
    } as any;

    const result = await validateTrustedTwoFactorDevice(store, {
      auth0UserId: "auth0|user_123",
      token: "trusted-token",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
      ipAddress: "203.0.113.5",
    });

    expect(result).toEqual({
      trusted: false,
      reason: "user_agent_mismatch",
    });
    expect(store.touchTrustedTwoFactorDevice).not.toHaveBeenCalled();
  });

  it("extends expiry when a trusted device is accepted", async () => {
    const store = {
      getTrustedTwoFactorDeviceByToken: vi.fn().mockResolvedValue(buildDevice()),
      touchTrustedTwoFactorDevice: vi.fn().mockResolvedValue(buildDevice()),
    } as any;

    const result = await validateTrustedTwoFactorDevice(store, {
      auth0UserId: "auth0|user_123",
      token: "trusted-token",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0",
      ipAddress: "203.0.113.5",
    });

    expect(result.trusted).toBe(true);
    expect(store.touchTrustedTwoFactorDevice).toHaveBeenCalledOnce();
    expect(store.touchTrustedTwoFactorDevice).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        ipAddress: "203.0.113.5",
      }),
    );
  });

  it("stores only hashed token data when creating a trusted device", async () => {
    const store = {
      createTrustedTwoFactorDevice: vi.fn().mockImplementation(async (data: any) =>
        buildDevice({
          tokenHash: data.tokenHash,
          userAgentHash: data.userAgentHash,
          deviceLabel: data.deviceLabel,
          userAgent: data.userAgent ?? null,
          ipAddress: data.ipAddress ?? null,
          expiresAt: data.expiresAt,
        }),
      ),
    } as any;

    const result = await createTrustedTwoFactorDevice(store, {
      auth0UserId: "auth0|user_123",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0",
      ipAddress: "203.0.113.9",
    });

    expect(result.token).not.toBe(result.device.tokenHash);
    expect(store.createTrustedTwoFactorDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        auth0UserId: "auth0|user_123",
        tokenHash: hashTrustedTwoFactorToken(result.token),
        userAgentHash: hashTrustedTwoFactorUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0"),
      }),
    );
  });
});
