import { beforeEach, describe, expect, mock, test } from "bun:test";

type AuthSession = { user: { id: string } } | null;

type SessionRecord = {
  id: string;
  userId: string;
  branch: string | null;
};

type CreatePullRequestResult = {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
};

type FindPullRequestByBranchResult = {
  found: boolean;
  prNumber?: number;
  prStatus?: "open" | "closed" | "merged";
  prUrl?: string;
  prTitle?: string;
  error?: string;
};

type EnableAutoMergeResult = {
  success: boolean;
  mergeMethod?: "merge" | "squash" | "rebase";
  error?: string;
  statusCode?: number;
};

let authSession: AuthSession = { user: { id: "user-1" } };
let sessionRecord: SessionRecord | null = {
  id: "session-1",
  userId: "user-1",
  branch: "feature/auto-merge",
};
let createPullRequestResult: CreatePullRequestResult = {
  success: true,
  prUrl: "https://github.com/acme/rocket/pull/77",
  prNumber: 77,
};
let enableAutoMergeResult: EnableAutoMergeResult = {
  success: true,
  mergeMethod: "squash",
};
let userToken: string | null = "user-token";
let resolvedBaseBranch = "main";
let findPullRequestByBranchResult: FindPullRequestByBranchResult = {
  found: false,
};

const createCalls: Array<Record<string, unknown>> = [];
const autoMergeCalls: Array<Record<string, unknown>> = [];
const findPullRequestCalls: Array<Record<string, unknown>> = [];
const updateCalls: Array<{
  sessionId: string;
  patch: Record<string, unknown>;
}> = [];

function parseGitHubUrl(repoUrl: string) {
  const match = repoUrl.match(/github\.com\/([.\w-]+)\/([.\w-]+?)(\.git)?$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

function registerRouteMocks() {
  mock.module("@/lib/session/get-server-session", () => ({
    getServerSession: async () => authSession,
  }));

  mock.module("@/lib/db/sessions", () => ({
    getSessionById: async (sessionId: string) =>
      sessionRecord && sessionRecord.id === sessionId ? sessionRecord : null,
    updateSession: async (
      sessionId: string,
      patch: Record<string, unknown>,
    ) => {
      updateCalls.push({ sessionId, patch });
      return sessionRecord ? { ...sessionRecord, ...patch } : null;
    },
  }));

  mock.module("@/lib/github/user-token", () => ({
    getUserGitHubToken: async () => userToken,
  }));

  mock.module("@/lib/github/base-branch", () => ({
    resolveGitHubBaseBranch: async () => resolvedBaseBranch,
  }));

  mock.module("@/lib/github/client", () => ({
    parseGitHubUrl,
    createPullRequest: async (input: Record<string, unknown>) => {
      createCalls.push(input);
      return createPullRequestResult;
    },
    findPullRequestByBranch: async (input: Record<string, unknown>) => {
      findPullRequestCalls.push(input);
      return findPullRequestByBranchResult;
    },
    enablePullRequestAutoMerge: async (input: Record<string, unknown>) => {
      autoMergeCalls.push(input);
      return enableAutoMergeResult;
    },
  }));
}

let routeImportVersion = 0;

async function loadRouteModule() {
  routeImportVersion += 1;
  return import(`./route?test=${routeImportVersion}`);
}

describe("/api/pr", () => {
  beforeEach(() => {
    authSession = { user: { id: "user-1" } };
    sessionRecord = {
      id: "session-1",
      userId: "user-1",
      branch: "feature/auto-merge",
    };
    createPullRequestResult = {
      success: true,
      prUrl: "https://github.com/acme/rocket/pull/77",
      prNumber: 77,
    };
    enableAutoMergeResult = {
      success: true,
      mergeMethod: "squash",
    };
    userToken = "user-token";
    resolvedBaseBranch = "main";
    findPullRequestByBranchResult = { found: false };
    createCalls.length = 0;
    autoMergeCalls.length = 0;
    findPullRequestCalls.length = 0;
    updateCalls.length = 0;
    registerRouteMocks();
  });

  test("creates a pull request with auto-merge enabled", async () => {
    const { POST } = await loadRouteModule();

    const response = await POST(
      new Request("http://localhost/api/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          repoUrl: "https://github.com/acme/rocket.git",
          branchName: "feature/auto-merge",
          title: "Ship auto-merge",
          body: "Lets go",
          baseBranch: "main",
          enableAutoMerge: true,
        }),
      }),
    );

    const body = (await response.json()) as {
      success?: boolean;
      prNumber?: number;
      prUrl?: string;
      prStatus?: string;
      autoMergeEnabled?: boolean;
      autoMergeError?: string;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.prNumber).toBe(77);
    expect(body.prStatus).toBe("open");
    expect(body.autoMergeEnabled).toBe(true);
    expect(body.autoMergeError).toBeUndefined();
    expect(createCalls).toHaveLength(1);
    expect(autoMergeCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      token: "user-token",
      isDraft: false,
    });
    expect(autoMergeCalls[0]).toMatchObject({
      prNumber: 77,
      token: "user-token",
    });
    expect(updateCalls).toEqual([
      {
        sessionId: "session-1",
        patch: {
          prNumber: 77,
          prStatus: "open",
        },
      },
    ]);
  });

  test("returns a compare URL and warning when auto-merge cannot be enabled", async () => {
    createPullRequestResult = {
      success: false,
      error: "Permission denied",
    };

    const { POST } = await loadRouteModule();

    const response = await POST(
      new Request("http://localhost/api/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          repoUrl: "https://github.com/acme/rocket.git",
          branchName: "feature/auto-merge",
          title: "Ship auto-merge",
          baseBranch: "main",
          enableAutoMerge: true,
        }),
      }),
    );

    const body = (await response.json()) as {
      success?: boolean;
      prUrl?: string;
      requiresManualCreation?: boolean;
      autoMergeEnabled?: boolean;
      autoMergeError?: string;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.requiresManualCreation).toBe(true);
    expect(body.autoMergeEnabled).toBe(false);
    expect(body.autoMergeError).toBe(
      "Auto-merge can only be enabled for pull requests created through the GitHub API.",
    );
    expect(body.prUrl).toContain("/compare/main...feature%2Fauto-merge");
    expect(createCalls).toHaveLength(1);
    expect(autoMergeCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  test("reuses an existing open pull request when GitHub reports one already exists", async () => {
    createPullRequestResult = {
      success: false,
      error: "PR already exists or branch not found",
    };
    findPullRequestByBranchResult = {
      found: true,
      prNumber: 81,
      prStatus: "open",
      prUrl: "https://github.com/acme/rocket/pull/81",
    };

    const { POST } = await loadRouteModule();

    const response = await POST(
      new Request("http://localhost/api/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          repoUrl: "https://github.com/acme/rocket.git",
          branchName: "feature/auto-merge",
          title: "Ship auto-merge",
          baseBranch: "main",
          enableAutoMerge: true,
        }),
      }),
    );

    const body = (await response.json()) as {
      success?: boolean;
      existing?: boolean;
      prNumber?: number;
      prUrl?: string;
      prStatus?: string;
      autoMergeEnabled?: boolean;
      autoMergeError?: string;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.existing).toBe(true);
    expect(body.prNumber).toBe(81);
    expect(body.prStatus).toBe("open");
    expect(body.prUrl).toBe("https://github.com/acme/rocket/pull/81");
    expect(body.autoMergeEnabled).toBe(false);
    expect(body.autoMergeError).toBe(
      "This branch already has an open pull request.",
    );
    expect(createCalls).toHaveLength(1);
    expect(findPullRequestCalls).toHaveLength(1);
    expect(updateCalls).toEqual([
      {
        sessionId: "session-1",
        patch: {
          prNumber: 81,
          prStatus: "open",
        },
      },
    ]);
  });

  test("rejects auto-merge for draft pull requests", async () => {
    const { POST } = await loadRouteModule();

    const response = await POST(
      new Request("http://localhost/api/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          repoUrl: "https://github.com/acme/rocket.git",
          branchName: "feature/auto-merge",
          title: "Ship auto-merge",
          baseBranch: "main",
          isDraft: true,
          enableAutoMerge: true,
        }),
      }),
    );

    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Auto-merge is not available for draft pull requests",
    );
    expect(createCalls).toHaveLength(0);
    expect(autoMergeCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });
});
