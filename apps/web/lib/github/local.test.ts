import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const originalFetch = globalThis.fetch;
const originalLocalGitHubToken = process.env.LOCAL_GITHUB_ACCESS_TOKEN;
const fetchSpy = mock(
  async (_input: RequestInfo | URL) => new Response(null, { status: 500 }),
);

globalThis.fetch = fetchSpy as unknown as typeof fetch;

const localModulePromise = import("./local");

afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalGitHubToken === undefined) {
    delete process.env.LOCAL_GITHUB_ACCESS_TOKEN;
  } else {
    process.env.LOCAL_GITHUB_ACCESS_TOKEN = originalLocalGitHubToken;
  }
});

describe("local GitHub configuration", () => {
  beforeEach(async () => {
    process.env.LOCAL_GITHUB_ACCESS_TOKEN = "github_pat_local";
    fetchSpy.mockClear();
    fetchSpy.mockImplementation(
      async () => new Response(null, { status: 500 }),
    );
    const { resetLocalGitHubProfileCache } = await localModulePromise;
    resetLocalGitHubProfileCache();
  });

  test("normalizes an empty local token to null", async () => {
    process.env.LOCAL_GITHUB_ACCESS_TOKEN = "  ";
    const { getLocalGitHubToken } = await localModulePromise;

    expect(getLocalGitHubToken()).toBeNull();
  });

  test("validates and caches the authenticated GitHub profile", async () => {
    fetchSpy.mockImplementation(async () =>
      Response.json({
        id: 1,
        login: "octocat",
        avatar_url: "https://avatars.example/octocat",
        name: "Octo Cat",
      }),
    );
    const { getLocalGitHubProfile } = await localModulePromise;

    const first = await getLocalGitHubProfile();
    const second = await getLocalGitHubProfile();

    expect(first).toEqual({
      githubId: 1,
      login: "octocat",
      avatarUrl: "https://avatars.example/octocat",
      accountType: "User",
      name: "Octo Cat",
    });
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("lists the authenticated user and organizations as local accounts", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith("/user")) {
        return Response.json({
          id: 1,
          login: "octocat",
          avatar_url: "https://avatars.example/octocat",
          name: null,
        });
      }

      return Response.json([
        {
          id: 3,
          login: "zebra-org",
          avatar_url: "https://avatars.example/zebra",
        },
        {
          id: 2,
          login: "acme",
          avatar_url: "https://avatars.example/acme",
        },
      ]);
    });
    const { listLocalGitHubAccounts } = await localModulePromise;

    const accounts = await listLocalGitHubAccounts();

    expect(accounts.map((account) => account.login)).toEqual([
      "octocat",
      "acme",
      "zebra-org",
    ]);
  });

  test("distinguishes an invalid token from GitHub unavailability", async () => {
    fetchSpy.mockImplementation(
      async () => new Response(null, { status: 401 }),
    );
    const { getLocalGitHubProfile, validateLocalGitHubToken } =
      await localModulePromise;

    expect(await validateLocalGitHubToken()).toEqual({ status: "invalid" });
    expect(await getLocalGitHubProfile()).toBeNull();

    const { resetLocalGitHubProfileCache } = await localModulePromise;
    resetLocalGitHubProfileCache();
    fetchSpy.mockImplementation(async () => {
      throw new Error("network unavailable");
    });

    expect(await validateLocalGitHubToken()).toEqual({
      status: "unavailable",
    });
  });
});
