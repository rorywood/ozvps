import { describe, expect, it, vi } from "vitest";
import { resolveVirtFusionUserIdentity } from "../admin-server/services/virtfusion-user-sync";

describe("resolveVirtFusionUserIdentity", () => {
  it("uses the Auth0 email instead of the Auth0 user ID", async () => {
    const auth0Client = {
      getUserById: vi.fn().mockResolvedValue({
        email: "customer@example.com",
        name: "Customer Example",
      }),
    };

    await expect(
      resolveVirtFusionUserIdentity("auth0|abc123", auth0Client),
    ).resolves.toEqual({
      email: "customer@example.com",
      name: "Customer Example",
    });
  });

  it("falls back to the mailbox name when Auth0 has no display name", async () => {
    const auth0Client = {
      getUserById: vi.fn().mockResolvedValue({
        email: "customer@example.com",
      }),
    };

    await expect(
      resolveVirtFusionUserIdentity("auth0|abc123", auth0Client),
    ).resolves.toEqual({
      email: "customer@example.com",
      name: "customer",
    });
  });

  it("throws when Auth0 does not return an email", async () => {
    const auth0Client = {
      getUserById: vi.fn().mockResolvedValue({
        name: "Missing Email",
      }),
    };

    await expect(
      resolveVirtFusionUserIdentity("auth0|abc123", auth0Client),
    ).rejects.toThrow("Unable to resolve a valid email address for this Auth0 user");
  });
});
