import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AuthSession = {
  user: {
    id: string;
  };
} | null;

let authSession: AuthSession;
let userToken: string | null;
let repositories: Array<{
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  clone_url: string;
  updated_at: string;
  language: string | null;
  owner: { login: string };
}> | null;

const fetchAccessibleGitHubRepositoriesSpy = mock(async () => repositories);

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => authSession,
}));

mock.module("@/lib/github/user-token", () => ({
  getUserGitHubToken: async () => userToken,
}));

mock.module("@/lib/github/api", () => ({
  fetchAccessibleGitHubRepositories: fetchAccessibleGitHubRepositoriesSpy,
  fetchGitHubUser: async () => null,
  fetchGitHubOrgs: async () => [],
}));

const routeModulePromise = import("./route");

describe("GET /api/github/repos", () => {
  beforeEach(() => {
    authSession = { user: { id: "user-1" } };
    userToken = "ghu_user";
    repositories = [
      {
        name: "open-harness",
        full_name: "vercel/open-harness",
        description: "Repo",
        private: false,
        clone_url: "https://github.com/vercel/open-harness.git",
        updated_at: "2026-04-14T12:00:00Z",
        language: "TypeScript",
        owner: { login: "vercel" },
      },
    ];
    fetchAccessibleGitHubRepositoriesSpy.mockClear();
  });

  test("returns 401 when unauthenticated", async () => {
    authSession = null;
    const { GET } = await routeModulePromise;

    const request = new Request("http://localhost/api/github/repos");
    const response = await GET(request as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "GitHub not connected",
    });
  });

  test("returns 400 for invalid owners", async () => {
    const { GET } = await routeModulePromise;

    const request = new Request(
      'http://localhost/api/github/repos?owner=vercel"bad',
    );
    const response = await GET(request as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid repository owner",
    });
  });

  test("passes owner, query, and limit to the repository fetcher", async () => {
    const { GET } = await routeModulePromise;

    const request = new Request(
      "http://localhost/api/github/repos?owner=vercel&query=harness&limit=25",
    );
    const response = await GET(request as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(repositories);
    expect(fetchAccessibleGitHubRepositoriesSpy).toHaveBeenCalledWith(
      "ghu_user",
      {
        owner: "vercel",
        query: "harness",
        limit: 25,
      },
    );
  });
});
