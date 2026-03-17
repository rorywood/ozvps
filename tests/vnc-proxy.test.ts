import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getSession: vi.fn(),
    deleteSession: vi.fn(),
  },
}));

vi.mock("../server/storage", () => ({
  storage: storageMock,
}));

import { getCookieValue, validateVncProxyRequest } from "../server/vnc-proxy";

describe("VNC proxy request validation", () => {
  beforeEach(() => {
    storageMock.getSession.mockReset();
    storageMock.deleteSession.mockReset();
  });

  it("extracts the named session cookie from the header", () => {
    expect(getCookieValue("foo=bar; ozvps_session=session-123; theme=dark", "ozvps_session")).toBe("session-123");
  });

  it("rejects WebSocket upgrades without the session cookie", async () => {
    await expect(validateVncProxyRequest(undefined, "session-123", "auth0|user")).resolves.toEqual({
      ok: false,
      statusCode: 401,
      reason: "missing session cookie",
    });
  });

  it("rejects when the cookie does not match the session that opened the console", async () => {
    await expect(
      validateVncProxyRequest("ozvps_session=other-session", "session-123", "auth0|user"),
    ).resolves.toEqual({
      ok: false,
      statusCode: 403,
      reason: "session cookie mismatch",
    });

    expect(storageMock.getSession).not.toHaveBeenCalled();
  });

  it("rejects expired sessions and deletes them from storage", async () => {
    storageMock.getSession.mockResolvedValue({
      id: "session-123",
      auth0UserId: "auth0|user",
      email: "test@example.com",
      expiresAt: new Date(Date.now() - 1_000),
      lastActivityAt: new Date(),
    });

    await expect(
      validateVncProxyRequest("ozvps_session=session-123", "session-123", "auth0|user"),
    ).resolves.toEqual({
      ok: false,
      statusCode: 401,
      reason: "session expired",
    });

    expect(storageMock.deleteSession).toHaveBeenCalledWith("session-123");
  });

  it("accepts the originating authenticated session", async () => {
    storageMock.getSession.mockResolvedValue({
      id: "session-123",
      auth0UserId: "auth0|user",
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      lastActivityAt: new Date(),
    });

    await expect(
      validateVncProxyRequest("ozvps_session=session-123", "session-123", "auth0|user"),
    ).resolves.toEqual({
      ok: true,
    });
  });
});
