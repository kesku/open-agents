import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AuthSession = {
  user: {
    id: string;
  };
} | null;

let authSession: AuthSession;
let githubConnectionMode: "oauth-app" | "local-token" | null;
let localProfile: {
  githubId: number;
  login: string;
  avatarUrl: string;
} | null;
let githubAppConfigured: boolean;

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => authSession,
}));

mock.module("@/lib/github/local-github", () => ({
  getGitHubConnectionModeForUser: () => githubConnectionMode,
  getLocalGitHubProfile: async () => localProfile,
}));

mock.module("@/lib/github/app-auth", () => ({
  isGitHubAppConfigured: () => githubAppConfigured,
}));

mock.module("@/lib/github/user-token", () => ({
  getUserGitHubToken: async () => "ghu_user",
}));

mock.module("@/lib/db/accounts", () => ({
  getGitHubAccount: async () => null,
}));

mock.module("@/lib/db/installations", () => ({
  getInstallationsByUserId: async () => [],
}));

const routeModulePromise = import("./route");

describe("GET /api/github/orgs/install-status", () => {
  beforeEach(() => {
    authSession = { user: { id: "user-1" } };
    githubConnectionMode = null;
    localProfile = {
      githubId: 123,
      login: "octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/123?v=4",
    };
    githubAppConfigured = true;
  });

  test("returns 401 when unauthenticated", async () => {
    authSession = null;
    const { GET } = await routeModulePromise;

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not authenticated" });
  });

  test("returns local token-backed GitHub status without app configuration", async () => {
    githubConnectionMode = "local-token";
    githubAppConfigured = false;
    const { GET } = await routeModulePromise;

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: "local-token",
      user: {
        githubId: 123,
        login: "octocat",
        avatarUrl: "https://avatars.githubusercontent.com/u/123?v=4",
      },
      personalInstallStatus: "installed",
      personalInstallationUrl: null,
      personalRepositorySelection: "all",
      orgs: [],
    });
  });
});
