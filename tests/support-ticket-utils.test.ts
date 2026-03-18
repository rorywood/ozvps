import { describe, expect, it } from "vitest";
import {
  resolveEffectiveVirtFusionUserId,
  validatePublicContactSubmission,
} from "../server/support-ticket-utils";

describe("support ticket utilities", () => {
  it("uses the session VirtFusion user id when present", () => {
    expect(resolveEffectiveVirtFusionUserId(42, 99)).toBe(42);
  });

  it("falls back to the wallet VirtFusion user id when the session is missing it", () => {
    expect(resolveEffectiveVirtFusionUserId(null, 99)).toBe(99);
  });

  it("returns null when no VirtFusion mapping is available", () => {
    expect(resolveEffectiveVirtFusionUserId(undefined, null)).toBeNull();
  });

  it("normalizes a valid public contact submission", () => {
    expect(
      validatePublicContactSubmission({
        name: "  Rory Wood  ",
        email: " Rory@example.com ",
        category: "sales",
        title: " Need help ",
        message: "I would like help moving services across next week.",
      }),
    ).toEqual({
      ok: true,
      value: {
        category: "sales",
        cleanEmail: "rory@example.com",
        cleanTitle: "Need help",
        cleanMessage: "I would like help moving services across next week.",
        resolvedName: "Rory Wood",
      },
    });
  });

  it("rejects a public contact submission with a too-short subject", () => {
    expect(
      validatePublicContactSubmission({
        email: "rory@example.com",
        category: "sales",
        title: "A",
        message: "This message is definitely long enough to pass validation.",
      }),
    ).toEqual({
      ok: false,
      error: "Subject must be at least 2 characters.",
    });
  });

  it("rejects a public contact submission with a too-short message", () => {
    expect(
      validatePublicContactSubmission({
        email: "rory@example.com",
        category: "abuse",
        title: "Abuse report",
        message: "Too short",
      }),
    ).toEqual({
      ok: false,
      error: "Message must be at least 20 characters.",
    });
  });
});
