import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "./types";

const getLocalAuthSessionMock = mock(
  (async () => ({}) as Session) as () => Promise<Session>,
);

mock.module("./local-auth", () => ({
  getLocalAuthSession: getLocalAuthSessionMock,
}));

const sessionServerModulePromise = import("./server");

describe("session server", () => {
  beforeEach(() => {
    getLocalAuthSessionMock.mockReset();
  });

  test("always resolves the local auth session from cookies", async () => {
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

    getLocalAuthSessionMock.mockResolvedValue(localSession);

    const { getSessionFromCookie } = await sessionServerModulePromise;
    await expect(getSessionFromCookie("ignored-cookie")).resolves.toEqual(
      localSession,
    );
    expect(getLocalAuthSessionMock).toHaveBeenCalledTimes(1);
  });

  test("always resolves the local auth session from requests", async () => {
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

    getLocalAuthSessionMock.mockResolvedValue(localSession);

    const { getSessionFromReq } = await sessionServerModulePromise;
    await expect(
      getSessionFromReq({ cookies: { get: () => undefined } } as never),
    ).resolves.toEqual(localSession);
    expect(getLocalAuthSessionMock).toHaveBeenCalledTimes(1);
  });
});
