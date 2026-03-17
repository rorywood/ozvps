import { afterEach, describe, expect, it } from "vitest";
import { getRateLimitIp } from "../server/rate-limit";

describe("rate limit IP resolution", () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    process.env.TRUST_PROXY = originalTrustProxy;
  });

  it("uses the forwarded client IP when trust proxy is enabled", () => {
    process.env.TRUST_PROXY = "true";

    const req = {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      },
      ip: "10.0.0.1",
      socket: {
        remoteAddress: "10.0.0.1",
      },
    } as any;

    expect(getRateLimitIp(req)).toBe("203.0.113.10");
  });

  it("falls back to the Express IP when trust proxy is disabled", () => {
    process.env.TRUST_PROXY = "false";

    const req = {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      },
      ip: "::ffff:198.51.100.42",
      socket: {
        remoteAddress: "::ffff:198.51.100.42",
      },
    } as any;

    expect(getRateLimitIp(req)).toBe("::ffff:198.51.100.42");
  });
});
