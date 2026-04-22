import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

type MockContainer = {
  id: string;
  name: string;
  state: {
    running: boolean;
    status?: string;
  };
  config: {
    labels: Record<string, string>;
  };
  networkSettings: {
    networks: Record<string, { IPAddress?: string }>;
  };
};

type PersistedSessionRow = {
  id: string;
  status: "running" | "completed" | "failed" | "archived";
  sandboxState: Record<string, unknown> | null;
};

const persistedSessionRows: PersistedSessionRow[] = [];
const updateSessionCalls: Array<{
  sessionId: string;
  patch: Record<string, unknown>;
}> = [];
const dockerState = {
  exec: mock(async () => ({
    exitCode: 0,
    stdout: "container-id",
    stderr: "",
  })),
  inspectContainer: mock(async () => null as MockContainer | null),
  listContainersByLabel: mock(async () => [] as MockContainer[]),
  removeContainer: mock(async () => undefined),
  getInfo: mock(async () => ({
    ncpu: 8,
    memTotalBytes: 8 * 1024 * 1024 * 1024,
  })),
};

let dockerConfig = {
  image: "open-agents-sandbox:test",
  network: "open-agents",
  domainSuffix: "sandboxes.example.test",
  publicProtocol: "https" as const,
  workspaceRoot: "/tmp/open-agents-test",
  workingDirectory: "/workspace",
  containerCpu: 1,
  containerMemoryMb: 1024,
  containerPidsLimit: 512,
  platformReservedCpu: 1,
  platformReservedMemoryMb: 1536,
  maxContainers: 8,
  orphanWorkspaceTtlMs: 60_000,
  reconcileIntervalMs: 60_000,
};

mock.module("@open-harness/sandbox", () => ({
  DockerClient: class MockDockerClient {
    exec(...args: Parameters<typeof dockerState.exec>) {
      return dockerState.exec(...args);
    }

    inspectContainer(...args: Parameters<typeof dockerState.inspectContainer>) {
      return dockerState.inspectContainer(...args);
    }

    listContainersByLabel(
      ...args: Parameters<typeof dockerState.listContainersByLabel>
    ) {
      return dockerState.listContainersByLabel(...args);
    }

    removeContainer(...args: Parameters<typeof dockerState.removeContainer>) {
      return dockerState.removeContainer(...args);
    }

    getInfo(...args: Parameters<typeof dockerState.getInfo>) {
      return dockerState.getInfo(...args);
    }
  },
}));

mock.module("./docker-config", () => ({
  getDockerSandboxPlatformConfig: () => dockerConfig,
}));

mock.module("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => persistedSessionRows,
      }),
    }),
  },
}));

mock.module("@/lib/db/schema", () => ({
  sessions: {},
  userPreferences: {},
}));

mock.module("@/lib/db/sessions", () => ({
  normalizeLegacySandboxState: (state: unknown) =>
    typeof state === "object" && state !== null ? state : null,
  updateSession: async (sessionId: string, patch: Record<string, unknown>) => {
    updateSessionCalls.push({ sessionId, patch });
    return { id: sessionId, ...patch };
  },
}));

mock.module("@/lib/sandbox/lifecycle", () => ({
  buildStoppedLifecycleUpdate: () => ({
    lifecycleState: "stopped",
    sandboxExpiresAt: null,
    hibernateAfter: null,
  }),
}));

const routeModulePromise = import("./docker-route");
const supervisorModulePromise = import("./docker-supervisor");
const errorModulePromise = import("./docker-supervisor-errors");

describe("DockerSandboxSupervisor", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), "oa-docker-supervisor-"));
    dockerConfig = {
      ...dockerConfig,
      workspaceRoot,
    };
    persistedSessionRows.length = 0;
    updateSessionCalls.length = 0;
    dockerState.exec.mockClear();
    dockerState.inspectContainer.mockClear();
    dockerState.listContainersByLabel.mockClear();
    dockerState.removeContainer.mockClear();
    dockerState.getInfo.mockClear();
    dockerState.exec.mockResolvedValue({
      exitCode: 0,
      stdout: "container-id",
      stderr: "",
    });
    dockerState.inspectContainer.mockResolvedValue(null);
    dockerState.listContainersByLabel.mockResolvedValue([]);
    dockerState.removeContainer.mockResolvedValue(undefined);
    dockerState.getInfo.mockResolvedValue({
      ncpu: 8,
      memTotalBytes: 8 * 1024 * 1024 * 1024,
    });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  test("reuses an existing running container for the session", async () => {
    const { DockerSandboxSupervisor } = await supervisorModulePromise;
    const { buildStableRouteSlug, buildContainerName } =
      await routeModulePromise;
    const routeSlug = buildStableRouteSlug("session-1");
    const containerName = buildContainerName(routeSlug);

    dockerState.inspectContainer.mockResolvedValue({
      id: "container-1",
      name: containerName,
      state: { running: true, status: "running" },
      config: { labels: {} },
      networkSettings: { networks: {} },
    });

    const supervisor = new DockerSandboxSupervisor();
    const runtimeState = await supervisor.ensureSessionSandbox({
      sessionId: "session-1",
      currentState: null,
      timeoutMs: 90_000,
      ports: [3000, 5173],
    });

    expect(runtimeState.type).toBe("docker-container");
    expect(runtimeState.containerId).toBe("container-1");
    expect(runtimeState.containerName).toBe(containerName);
    expect(runtimeState.routeSlug).toBe(routeSlug);
    expect(dockerState.exec).not.toHaveBeenCalled();
  });

  test("rejects new sandboxes when budgeted capacity is exhausted", async () => {
    const { DockerSandboxSupervisor } = await supervisorModulePromise;
    const { DockerSandboxCapacityError } = await errorModulePromise;

    dockerConfig = {
      ...dockerConfig,
      containerCpu: 1,
      platformReservedCpu: 1,
      containerMemoryMb: 1024,
      platformReservedMemoryMb: 0,
    };
    dockerState.getInfo.mockResolvedValue({
      ncpu: 1,
      memTotalBytes: 4 * 1024 * 1024 * 1024,
    });

    const supervisor = new DockerSandboxSupervisor();

    await expect(
      supervisor.ensureSessionSandbox({
        sessionId: "session-capacity",
        currentState: null,
        timeoutMs: 60_000,
        ports: [3000],
      }),
    ).rejects.toBeInstanceOf(DockerSandboxCapacityError);

    expect(dockerState.exec).not.toHaveBeenCalled();
  });

  test("preserves recoverable workspace metadata when a runtime container disappears", async () => {
    const { DockerSandboxSupervisor } = await supervisorModulePromise;
    const { buildContainerName, buildStableRouteSlug, buildWorkspaceHostPath } =
      await routeModulePromise;
    const routeSlug = buildStableRouteSlug("session-recover");
    const workspaceHostPath = buildWorkspaceHostPath(workspaceRoot, routeSlug);

    await mkdir(workspaceHostPath, { recursive: true });

    persistedSessionRows.push({
      id: "session-recover",
      status: "running",
      sandboxState: {
        type: "docker-container",
        containerId: "container-missing",
        containerName: buildContainerName(routeSlug),
        image: dockerConfig.image,
        network: dockerConfig.network,
        workingDirectory: dockerConfig.workingDirectory,
        workspaceHostPath,
        routeSlug,
        domainSuffix: dockerConfig.domainSuffix,
        publicProtocol: dockerConfig.publicProtocol,
        createdAt: Date.now() - 10_000,
        expiresAt: Date.now() + 60_000,
      },
    });

    const supervisor = new DockerSandboxSupervisor();
    await supervisor.reconcile("startup");

    expect(updateSessionCalls).toHaveLength(1);
    expect(updateSessionCalls[0]?.sessionId).toBe("session-recover");
    expect(updateSessionCalls[0]?.patch.lifecycleError).toBe(
      "Sandbox container missing; workspace preserved for resume.",
    );
    expect(updateSessionCalls[0]?.patch.sandboxState).toMatchObject({
      type: "docker-container",
      routeSlug,
      workspaceHostPath,
      recoverableWorkspace: {
        reason: "container-missing",
      },
    });
    expect(dockerState.removeContainer).not.toHaveBeenCalled();
  });
});
