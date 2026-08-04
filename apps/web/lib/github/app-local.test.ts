import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const originalFetch = globalThis.fetch;
const originalLocalGitHubToken = process.env.LOCAL_GITHUB_ACCESS_TOKEN;
const fetchSpy = mock(async () => new Response(null, { status: 500 }));

globalThis.fetch = fetchSpy as unknown as typeof fetch;

const appModulePromise = import("./app");
const localModulePromise = import("./local");

afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalGitHubToken === undefined) {
    delete process.env.LOCAL_GITHUB_ACCESS_TOKEN;
  } else {
    process.env.LOCAL_GITHUB_ACCESS_TOKEN = originalLocalGitHubToken;
  }
});

describe("local GitHub installation token", () => {
  beforeEach(() => {
    process.env.LOCAL_GITHUB_ACCESS_TOKEN = "github_pat_local";
    fetchSpy.mockClear();
  });

  test("returns the local PAT for the local installation id", async () => {
    const { mintInstallationToken } = await appModulePromise;
    const { LOCAL_GITHUB_INSTALLATION_ID } = await localModulePromise;

    const token = await mintInstallationToken({
      installationId: LOCAL_GITHUB_INSTALLATION_ID,
      repositoryIds: [42],
      permissions: { contents: "write" },
    });

    expect(token).toEqual({
      token: "github_pat_local",
      expiresAt: null,
      installationId: LOCAL_GITHUB_INSTALLATION_ID,
      repositoryIds: [42],
      permissions: { contents: "write" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("does not revoke the local PAT", async () => {
    const { revokeInstallationToken } = await appModulePromise;

    await revokeInstallationToken("github_pat_local");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
