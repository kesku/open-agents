import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AuthSession = {
  user: {
    id: string;
  };
} | null;

let authSession: AuthSession;
let userToken: string | null;
let githubUser: {
  login: string;
  name: string | null;
  avatar_url: string;
} | null;
let githubOrgs: Array<{
  login: string;
  name: string | null;
  avatar_url: string;
}> | null;

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => authSession,
}));

mock.module("@/lib/github/user-token", () => ({
  getUserGitHubToken: async () => userToken,
}));

mock.module("@/lib/github/api", () => ({
  fetchGitHubUser: async () => githubUser,
  fetchGitHubOrgs: async () => githubOrgs,
  fetchAccessibleGitHubRepositories: async () => [],
}));

const routeModulePromise = import("./route");

describe("GET /api/github/accounts", () => {
  beforeEach(() => {
    authSession = { user: { id: "user-1" } };
    userToken = "ghu_user";
    githubUser = {
      login: "octocat",
      name: "The Octocat",
      avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    };
    githubOrgs = [
      {
        login: "beta",
        name: "Beta",
        avatar_url: "https://avatars.githubusercontent.com/u/2?v=4",
      },
      {
        login: "alpha",
        name: "Alpha",
        avatar_url: "https://avatars.githubusercontent.com/u/3?v=4",
      },
    ];
  });

  test("returns 401 when unauthenticated", async () => {
    authSession = null;
    const { GET } = await routeModulePromise;

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "GitHub not connected",
    });
  });

  test("returns the user followed by sorted organizations", async () => {
    const { GET } = await routeModulePromise;

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        login: "octocat",
        accountType: "User",
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      },
      {
        login: "alpha",
        accountType: "Organization",
        avatarUrl: "https://avatars.githubusercontent.com/u/3?v=4",
      },
      {
        login: "beta",
        accountType: "Organization",
        avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
      },
    ]);
  });

  test("still returns the user when organizations cannot be loaded", async () => {
    githubOrgs = null;
    const { GET } = await routeModulePromise;

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        login: "octocat",
        accountType: "User",
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      },
    ]);
  });
});
