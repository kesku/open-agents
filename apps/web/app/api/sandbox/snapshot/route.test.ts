import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type TestSandboxState = {
  type: "docker";
  sandboxName?: string;
  expiresAt?: number;
};

type TestSessionRecord = {
  id: string;
  userId: string;
  sandboxState: TestSandboxState | null;
  snapshotUrl: string | null;
  snapshotCreatedAt: Date | null;
  lifecycleVersion: number;
  lifecycleState: string | null;
  sandboxExpiresAt: Date | null;
  hibernateAfter: Date | null;
};

const updateCalls: Array<Record<string, unknown>> = [];
const provisionCalls: Array<{ sessionId: string; userId?: string }> = [];
let stopCallCount = 0;
let sessionRecord: TestSessionRecord;

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => ({
    ok: true as const,
    userId: "user-1",
  }),
  requireOwnedSession: async () => ({
    ok: true as const,
    sessionRecord,
  }),
  requireOwnedSessionWithSandboxGuard: async ({
    sandboxGuard,
  }: {
    sandboxGuard: (state: TestSandboxState | null) => boolean;
  }) =>
    sandboxGuard(sessionRecord.sandboxState)
      ? ({ ok: true as const, sessionRecord } as const)
      : ({
          ok: false as const,
          response: Response.json(
            { error: "Sandbox not initialized" },
            { status: 400 },
          ),
        } as const),
}));

mock.module("@/lib/db/sessions", () => ({
  getChatsBySessionId: async () => [],
  getSessionById: async () => sessionRecord,
  updateSession: async (_sessionId: string, patch: Record<string, unknown>) => {
    updateCalls.push(patch);
    sessionRecord = {
      ...sessionRecord,
      ...(patch as Partial<TestSessionRecord>),
    };
    return sessionRecord;
  },
}));

mock.module("@open-agents/sandbox", () => ({
  connectSandbox: async () => ({
    stop: async () => {
      stopCallCount += 1;
    },
  }),
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
        sandboxName: "session_session-1",
        expiresAt: Date.now() + 120_000,
      },
    };
  },
}));

const routeModulePromise = import("./route");

function makeSessionRecord(
  overrides: Partial<TestSessionRecord> = {},
): TestSessionRecord {
  return {
    id: "session-1",
    userId: "user-1",
    sandboxState: {
      type: "docker",
      sandboxName: "session_session-1",
      expiresAt: Date.now() + 60_000,
    },
    snapshotUrl: null,
    snapshotCreatedAt: null,
    lifecycleVersion: 2,
    lifecycleState: "active",
    sandboxExpiresAt: new Date(Date.now() + 60_000),
    hibernateAfter: new Date(Date.now() + 30_000),
    ...overrides,
  };
}

describe("/api/sandbox/snapshot", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    provisionCalls.length = 0;
    stopCallCount = 0;
    sessionRecord = makeSessionRecord();
  });

  test("POST pauses Docker while preserving its persistent workspace handle", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    expect(response.ok).toBe(true);
    expect(stopCallCount).toBe(1);
    expect(await response.json()).toMatchObject({
      snapshotId: "session_session-1",
    });
    expect(updateCalls[0]).toMatchObject({
      sandboxState: {
        type: "docker",
        sandboxName: "session_session-1",
      },
      lifecycleState: "hibernated",
    });
  });

  test("PUT resumes Docker through shared provisioning", async () => {
    const { PUT } = await routeModulePromise;
    sessionRecord = makeSessionRecord({
      sandboxState: {
        type: "docker",
        sandboxName: "session_session-1",
      },
      lifecycleState: "hibernated",
      sandboxExpiresAt: null,
      hibernateAfter: null,
    });

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    expect(response.ok).toBe(true);
    expect(provisionCalls).toEqual([
      { sessionId: "session-1", userId: "user-1" },
    ]);
    expect(await response.json()).toEqual({
      success: true,
      restoredFrom: "session_session-1",
    });
  });

  test("PUT rejects state without a persistent provider handle", async () => {
    const { PUT } = await routeModulePromise;
    sessionRecord = makeSessionRecord({
      sandboxState: { type: "docker" },
      lifecycleState: "hibernated",
      sandboxExpiresAt: null,
      hibernateAfter: null,
    });

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(provisionCalls).toHaveLength(0);
  });
});
