import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let moduleVersion = 0;

async function loadBaseBranchModule() {
  moduleVersion += 1;
  return import(`./base-branch?test=${moduleVersion}`);
}

const originalFetch = globalThis.fetch;

describe("resolveGitHubBaseBranch", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("keeps the requested branch when it exists", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/branches/release%2F2026.04")) {
        return new Response("{}", { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { resolveGitHubBaseBranch } = await loadBaseBranchModule();
    const resolved = await resolveGitHubBaseBranch({
      owner: "kesku",
      repo: "kesku.me",
      token: "token",
      requestedBranch: "release/2026.04",
    });

    expect(resolved).toBe("release/2026.04");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("falls back to the repository default branch when the request is stale", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/branches/main")) {
        return new Response("{}", { status: 404 });
      }

      if (url.endsWith("/repos/kesku/kesku.me")) {
        return new Response(JSON.stringify({ default_branch: "master" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { resolveGitHubBaseBranch } = await loadBaseBranchModule();
    const resolved = await resolveGitHubBaseBranch({
      owner: "kesku",
      repo: "kesku.me",
      token: "token",
      requestedBranch: "main",
    });

    expect(resolved).toBe("master");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("returns the requested branch when GitHub lookup fails", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { resolveGitHubBaseBranch } = await loadBaseBranchModule();
    const resolved = await resolveGitHubBaseBranch({
      owner: "kesku",
      repo: "kesku.me",
      token: "token",
      requestedBranch: "main",
    });

    expect(resolved).toBe("main");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
