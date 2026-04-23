import { beforeEach, describe, expect, mock, test } from "bun:test";

let currentSession: {
  user: {
    id: string;
    username: string;
    name: string;
    email?: string;
  };
} | null = {
  user: {
    id: "user-1",
    username: "nico",
    name: "Nico",
  },
};
const createCalls: Array<Record<string, unknown>> = [];
let preferencesState = {
  defaultModelId: "openai/gpt-5.4",
  autoCommitPush: false,
  autoCreatePr: false,
  defaultBranchNameTemplate: "",
  globalSkillRefs: [{ source: "local/skills", skillName: "ai-sdk" }],
};

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/random-city", () => ({
  getRandomCityName: () => "Oslo",
}));

mock.module("@/lib/db/user-preferences", () => ({
  getUserPreferences: async () => preferencesState,
}));

mock.module("@/lib/db/sessions", () => ({
  createSessionWithInitialChat: async (input: {
    session: Record<string, unknown>;
    initialChat: Record<string, unknown>;
  }) => {
    createCalls.push(input.session);
    return {
      session: {
        ...input.session,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      chat: {
        id: String(input.initialChat.id),
        sessionId: String(input.session.id),
        title: String(input.initialChat.title),
        modelId: String(input.initialChat.modelId),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  },
  getArchivedSessionCountByUserId: async () => 0,
  getSessionsWithUnreadByUserId: async () => [],
  getUsedSessionTitles: async () => new Set<string>(),
}));

const routeModulePromise = import("./route");

function createJsonRequest(
  body: unknown,
  url = "http://localhost/api/sessions",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/sessions POST", () => {
  beforeEach(() => {
    currentSession = {
      user: {
        id: "user-1",
        username: "nico",
        name: "Nico",
      },
    };
    createCalls.length = 0;
    preferencesState = {
      defaultModelId: "openai/gpt-5.4",
      autoCommitPush: false,
      autoCreatePr: false,
      defaultBranchNameTemplate: "",
      globalSkillRefs: [{ source: "local/skills", skillName: "ai-sdk" }],
    };
  });

  test("returns 401 when no local workspace session exists", async () => {
    currentSession = null;
    const { POST } = await routeModulePromise;

    const response = await POST(createJsonRequest({}));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Not authenticated");
    expect(createCalls).toHaveLength(0);
  });

  test("creates a local-first session with the configured sandbox backend", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-harness",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-harness",
      }),
    );
    const body = (await response.json()) as {
      session: Record<string, unknown>;
      chat: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      repoOwner: "vercel",
      repoName: "open-harness",
      branch: "main",
      sandboxState: { type: "docker-container" },
      globalSkillRefs: [{ source: "local/skills", skillName: "ai-sdk" }],
      autoCommitPushOverride: false,
      autoCreatePrOverride: false,
    });
    expect(body.session.sandboxState).toEqual({ type: "docker-container" });
    expect(body.chat.modelId).toBe("openai/gpt-5.4");
  });

  test("generates a new branch name when requested", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-harness",
        cloneUrl: "https://github.com/vercel/open-harness",
        isNewBranch: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      isNewBranch: true,
    });
    expect(createCalls[0]?.branch).toEqual(
      expect.stringMatching(/^n\/[a-f0-9]{8}$/),
    );
  });

  test("uses explicit session titles and custom new branch names", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        title: "Fix Checkout",
        repoOwner: "vercel",
        repoName: "open-harness",
        cloneUrl: "https://github.com/vercel/open-harness",
        branch: "kesku/fix-checkout",
        isNewBranch: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      title: "Fix Checkout",
      branch: "kesku/fix-checkout",
      isNewBranch: true,
    });
  });

  test("uses the default branch template for generated new branches", async () => {
    preferencesState.defaultBranchNameTemplate = "kesku/[worktree]";
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        title: "Fix Checkout Flow",
        repoOwner: "vercel",
        repoName: "open-harness",
        cloneUrl: "https://github.com/vercel/open-harness",
        isNewBranch: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      title: "Fix Checkout Flow",
      branch: "kesku/fix-checkout-flow",
      isNewBranch: true,
    });
  });

  test("rejects invalid custom new branch names", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-harness",
        cloneUrl: "https://github.com/vercel/open-harness",
        branch: "bad branch",
        isNewBranch: true,
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid branch name");
    expect(createCalls).toHaveLength(0);
  });

  test("rejects invalid repository owners", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: 'vercel" && echo nope && "',
        repoName: "open-harness",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-harness",
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid repository owner");
    expect(createCalls).toHaveLength(0);
  });

  test("persists autoCreatePr only when autoCommitPush is enabled", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-harness",
        branch: "feature/auto-pr",
        cloneUrl: "https://github.com/vercel/open-harness",
        autoCommitPush: false,
        autoCreatePr: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      autoCommitPushOverride: false,
      autoCreatePrOverride: false,
    });
  });
});
