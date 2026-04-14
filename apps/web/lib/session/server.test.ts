import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "./types";

const decryptJWEMock = mock(
  (async () => undefined) as (value: string) => Promise<Session | undefined>,
);
const getLocalAuthSessionMock = mock(
  (async () => undefined) as () => Promise<Session | undefined>,
);
const isLocalAuthEnabledMock = mock(() => false);

mock.module("@/lib/jwe/decrypt", () => ({
  decryptJWE: decryptJWEMock,
}));

mock.module("./local-auth", () => ({
  getLocalAuthSession: getLocalAuthSessionMock,
  isLocalAuthEnabled: isLocalAuthEnabledMock,
}));

const sessionServerModulePromise = import("./server");

describe("session server", () => {
  beforeEach(() => {
    decryptJWEMock.mockReset();
    getLocalAuthSessionMock.mockReset();
    isLocalAuthEnabledMock.mockReset();
    isLocalAuthEnabledMock.mockReturnValue(false);
  });
  test("returns the local auth session when local auth is enabled", async () => {
    const localSession: Session = {
      created: Date.now(),
      authProvider: "local" as const,
      user: {
        id: "local-user",
        username: "local",
        email: "local@open-agents.local",
        avatar: "/favicon.ico",
        name: "Local User",
      },
    };

    isLocalAuthEnabledMock.mockReturnValue(true);
    getLocalAuthSessionMock.mockResolvedValue(localSession);

    const { getSessionFromCookie } = await sessionServerModulePromise;
    await expect(getSessionFromCookie("ignored-cookie")).resolves.toEqual(
      localSession,
    );
    expect(getLocalAuthSessionMock).toHaveBeenCalledTimes(1);
    expect(decryptJWEMock).not.toHaveBeenCalled();
  });

  test("decrypts the cookie when local auth is disabled", async () => {
    const cookieSession: Session = {
      created: Date.now(),
      authProvider: "vercel" as const,
      user: {
        id: "user-123",
        username: "kesku",
        email: "kesku@example.com",
        avatar: "/avatar.png",
        name: "Kesku",
      },
    };

    decryptJWEMock.mockResolvedValue(cookieSession);

    const { getSessionFromCookie } = await sessionServerModulePromise;
    await expect(getSessionFromCookie("cookie-value")).resolves.toEqual(
      cookieSession,
    );
    expect(decryptJWEMock).toHaveBeenCalledWith("cookie-value");
    expect(getLocalAuthSessionMock).not.toHaveBeenCalled();
  });
});
