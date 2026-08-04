import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const provisionCalls: Array<{ sessionId: string; userId?: string }> = [];

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => ({
    user: { id: "user-1", username: "local-user" },
  }),
}));

mock.module("@/lib/botid", () => ({
  checkBotProtection: async () => ({ isBot: false }),
}));

mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: async () => null,
  rateLimitKey: (parts: string[]) => parts.join(":"),
}));

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => ({
    ok: true as const,
    userId: "user-1",
  }),
  requireOwnedSession: async () => ({
    ok: true as const,
    sessionRecord: {
      id: "session-1",
      userId: "user-1",
      branch: "main",
      sandboxState: { type: "docker" as const },
    },
  }),
}));

mock.module("@/lib/sandbox/provider", () => ({
  getConfiguredSandboxProvider: () => "docker" as const,
}));

mock.module("@/lib/sandbox/provisioning", () => ({
  provisionSessionSandbox: async (input: {
    sessionId: string;
    userId?: string;
  }) => {
    provisionCalls.push(input);
    return {
      sandboxState: {
        type: "docker" as const,
        sandboxName: `session_${input.sessionId}`,
      },
      currentBranch: "feature/sandbox-auth",
      session: { branch: "main" },
    };
  },
}));

mock.module("@open-agents/sandbox", () => ({
  connectSandbox: async () => ({ stop: async () => {} }),
}));

mock.module("@/lib/db/sessions", () => ({
  updateSession: async () => ({}),
}));

const routeModulePromise = import("./route");

describe("/api/sandbox", () => {
  beforeEach(() => {
    provisionCalls.length = 0;
  });

  test("delegates Docker creation to the shared provisioning service", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          sandboxType: "docker",
        }),
      }),
    );
    const payload = (await response.json()) as {
      mode: string;
      currentBranch: string;
    };

    expect(response.ok).toBe(true);
    expect(provisionCalls).toEqual([
      { sessionId: "session-1", userId: "user-1" },
    ]);
    expect(payload.mode).toBe("docker");
    expect(payload.currentBranch).toBe("feature/sandbox-auth");
  });

  test("rejects a provider that is not configured for the deployment", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          sandboxType: "vercel",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid sandbox type" });
    expect(provisionCalls).toHaveLength(0);
  });
});
