import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

let getAccessTokenResult: { accessToken?: string | null } | null;
let getAccessTokenError: Error | null;

const getAccessTokenSpy = mock(
  async (_input: { body: { providerId: string; userId: string } }) => {
    if (getAccessTokenError) {
      throw getAccessTokenError;
    }

    return getAccessTokenResult;
  },
);

mock.module("server-only", () => ({}));

mock.module("next/headers", () => ({
  headers: async () => {
    throw new Error("headers should not be called");
  },
}));

mock.module("@/lib/auth/config", () => ({
  auth: {
    api: {
      getAccessToken: getAccessTokenSpy,
    },
  },
}));

mock.module("@/lib/db/client", () => ({
  db: {},
}));

mock.module("@/lib/db/schema", () => ({
  accounts: {},
}));

const tokenModulePromise = import("./token");
const originalDeploymentMode = process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
const originalLocalGitHubToken = process.env.LOCAL_GITHUB_ACCESS_TOKEN;

afterAll(() => {
  if (originalDeploymentMode === undefined) {
    delete process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
  } else {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = originalDeploymentMode;
  }
  if (originalLocalGitHubToken === undefined) {
    delete process.env.LOCAL_GITHUB_ACCESS_TOKEN;
  } else {
    process.env.LOCAL_GITHUB_ACCESS_TOKEN = originalLocalGitHubToken;
  }
});

describe("getUserGitHubToken", () => {
  beforeEach(() => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "vercel";
    delete process.env.LOCAL_GITHUB_ACCESS_TOKEN;
    getAccessTokenSpy.mockClear();
    getAccessTokenResult = { accessToken: "ghu_test" };
    getAccessTokenError = null;
  });

  test("looks up access tokens by user id without request headers", async () => {
    const { getUserGitHubToken } = await tokenModulePromise;

    const token = await getUserGitHubToken("user-1");

    expect(token).toBe("ghu_test");
    expect(getAccessTokenSpy).toHaveBeenCalledTimes(1);
    expect(getAccessTokenSpy.mock.calls[0]?.[0]).toEqual({
      body: { providerId: "github", userId: "user-1" },
    });
  });

  test("returns null when better-auth token lookup fails", async () => {
    const { getUserGitHubToken } = await tokenModulePromise;
    getAccessTokenError = new Error("boom");

    const token = await getUserGitHubToken("user-1");

    expect(token).toBeNull();
  });

  test("uses the configured local token without calling better-auth", async () => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "local";
    process.env.LOCAL_GITHUB_ACCESS_TOKEN = "github_pat_local";
    const { getUserGitHubToken } = await tokenModulePromise;

    const token = await getUserGitHubToken("user-1");

    expect(token).toBe("github_pat_local");
    expect(getAccessTokenSpy).not.toHaveBeenCalled();
  });
});

describe("getGitHubAppUserToken", () => {
  beforeEach(() => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "vercel";
    delete process.env.LOCAL_GITHUB_ACCESS_TOKEN;
    getAccessTokenSpy.mockClear();
    getAccessTokenResult = { accessToken: "ghu_test" };
    getAccessTokenError = null;
  });

  test("returns GitHub App user-to-server tokens", async () => {
    const { getGitHubAppUserToken } = await tokenModulePromise;

    const token = await getGitHubAppUserToken("user-1");

    expect(token).toBe("ghu_test");
  });
});
