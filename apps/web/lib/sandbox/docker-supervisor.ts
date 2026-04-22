import "server-only";

import { chown, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  DockerClient,
  type DockerContainerState,
  type DockerInspectContainer,
  type Source,
} from "@open-harness/sandbox";
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { normalizeLegacySandboxState, updateSession } from "@/lib/db/sessions";
import { sessions } from "@/lib/db/schema";
import { buildStoppedLifecycleUpdate } from "@/lib/sandbox/lifecycle";
import {
  buildContainerName,
  buildQuarantineRoot,
  buildSandboxHost,
  buildStableRouteSlug,
  buildWorkspaceHostPath,
} from "./docker-route";
import { getDockerSandboxPlatformConfig } from "./docker-config";
import { DockerSandboxCapacityError } from "./docker-supervisor-errors";

const SANDBOX_LABEL_MANAGED = "open-agents.managed";
const SANDBOX_LABEL_SESSION_ID = "open-agents.session-id";
const SANDBOX_LABEL_ROUTE_SLUG = "open-agents.route-slug";
const SANDBOX_LABEL_WORKSPACE = "open-agents.workspace-path";
const SANDBOX_LABEL_KIND = "open-agents.kind";
const SANDBOX_KIND_INTERACTIVE = "interactive";
const SANDBOX_USER_UID = 1000;
const SANDBOX_USER_GID = 1000;

interface EnsureSessionSandboxParams {
  sessionId: string;
  currentState: DockerContainerState | null | undefined;
  source?: Source;
  timeoutMs: number;
  ports: number[];
}

type PersistedDockerSession = {
  id: string;
  status: "running" | "completed" | "failed" | "archived";
  sandboxState: ({ type: "docker-container" } & DockerContainerState) | null;
};

let supervisorMutationLock: Promise<void> = Promise.resolve();

function withSupervisorMutationLock<T>(callback: () => Promise<T>): Promise<T> {
  const run = (async () => {
    try {
      await supervisorMutationLock;
    } catch {
      // Ignore prior mutation failures so later callers can continue.
    }

    return callback();
  })();

  supervisorMutationLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function hasRuntimeHandle(
  state: DockerContainerState | null | undefined,
): state is DockerContainerState &
  Required<
    Pick<
      DockerContainerState,
      | "containerName"
      | "workspaceHostPath"
      | "routeSlug"
      | "domainSuffix"
      | "expiresAt"
    >
  > {
  return Boolean(
    state?.containerName &&
    state.workspaceHostPath &&
    state.routeSlug &&
    state.domainSuffix &&
    typeof state.expiresAt === "number",
  );
}

function createBaseState(
  sessionId: string,
  currentState: DockerContainerState | null | undefined,
): DockerContainerState {
  const config = getDockerSandboxPlatformConfig();
  const routeSlug = currentState?.routeSlug ?? buildStableRouteSlug(sessionId);
  const workspaceHostPath =
    currentState?.workspaceHostPath ??
    buildWorkspaceHostPath(config.workspaceRoot, routeSlug);

  return {
    ...currentState,
    image: currentState?.image ?? config.image,
    network: currentState?.network ?? config.network,
    workingDirectory: currentState?.workingDirectory ?? config.workingDirectory,
    routeSlug,
    workspaceHostPath,
    domainSuffix: currentState?.domainSuffix ?? config.domainSuffix,
    publicProtocol: currentState?.publicProtocol ?? config.publicProtocol,
    containerName: currentState?.containerName ?? buildContainerName(routeSlug),
  };
}

function buildRuntimeState(params: {
  sessionId: string;
  currentState: DockerContainerState | null | undefined;
  source?: Source;
  container: DockerInspectContainer;
  timeoutMs: number;
}): { type: "docker-container" } & DockerContainerState {
  const baseState = createBaseState(params.sessionId, params.currentState);
  const now = Date.now();

  return {
    type: "docker-container",
    ...baseState,
    ...(params.source ? { source: params.source } : {}),
    containerId: params.container.id,
    containerName: params.container.name,
    createdAt: baseState.createdAt ?? now,
    expiresAt: now + params.timeoutMs,
    recoverableWorkspace: undefined,
  };
}

function buildTraefikRouterName(routeSlug: string, port: number): string {
  return `oa-${routeSlug}-${port}`;
}

function buildContainerLabels(params: {
  sessionId: string;
  routeSlug: string;
  workspaceHostPath: string;
  domainSuffix: string;
  network: string;
  ports: number[];
}): Record<string, string> {
  const labels: Record<string, string> = {
    [SANDBOX_LABEL_MANAGED]: "true",
    [SANDBOX_LABEL_KIND]: SANDBOX_KIND_INTERACTIVE,
    [SANDBOX_LABEL_SESSION_ID]: params.sessionId,
    [SANDBOX_LABEL_ROUTE_SLUG]: params.routeSlug,
    [SANDBOX_LABEL_WORKSPACE]: params.workspaceHostPath,
    "traefik.enable": "true",
    "traefik.docker.network": params.network,
  };

  for (const port of params.ports) {
    const routerName = buildTraefikRouterName(params.routeSlug, port);
    labels[`traefik.http.routers.${routerName}.rule`] =
      `Host(\`${buildSandboxHost(
        params.routeSlug,
        port,
        params.domainSuffix,
      )}\`)`;
    labels[`traefik.http.routers.${routerName}.entrypoints`] = "web";
    labels[`traefik.http.routers.${routerName}.service`] = routerName;
    labels[`traefik.http.services.${routerName}.loadbalancer.server.port`] =
      String(port);
  }

  return labels;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getPersistedDockerSessions(): Promise<PersistedDockerSession[]> {
  const records = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      sandboxState: sessions.sandboxState,
    })
    .from(sessions)
    .where(isNotNull(sessions.sandboxState));

  return records
    .map((record) => {
      const normalized = normalizeLegacySandboxState(record.sandboxState);
      if (!normalized || normalized.type !== "docker-container") {
        return null;
      }

      return {
        id: record.id,
        status: record.status,
        sandboxState: normalized,
      } satisfies PersistedDockerSession;
    })
    .filter((record) => record !== null);
}

async function listManagedContainers(
  client: DockerClient,
): Promise<DockerInspectContainer[]> {
  return client.listContainersByLabel({
    labels: {
      [SANDBOX_LABEL_MANAGED]: "true",
    },
    all: true,
  });
}

async function ensureWorkspaceRoot(): Promise<void> {
  const config = getDockerSandboxPlatformConfig();
  await mkdir(config.workspaceRoot, { recursive: true });
  await mkdir(buildQuarantineRoot(config.workspaceRoot), { recursive: true });
}

async function prepareWorkspaceDirectory(
  workspaceHostPath: string,
): Promise<void> {
  await mkdir(workspaceHostPath, { recursive: true });
  await chown(workspaceHostPath, SANDBOX_USER_UID, SANDBOX_USER_GID);
}

async function quarantineWorkspace(
  workspaceHostPath: string,
  reason: string,
): Promise<string | null> {
  if (!(await pathExists(workspaceHostPath))) {
    return null;
  }

  const quarantineRoot = buildQuarantineRoot(
    getDockerSandboxPlatformConfig().workspaceRoot,
  );
  const destination = path.join(
    quarantineRoot,
    `${path.basename(workspaceHostPath)}-${Date.now()}-${reason}`,
  );

  await mkdir(quarantineRoot, { recursive: true });
  await rename(workspaceHostPath, destination);
  return destination;
}

async function garbageCollectQuarantinedWorkspaces(): Promise<void> {
  const config = getDockerSandboxPlatformConfig();
  const quarantineRoot = buildQuarantineRoot(config.workspaceRoot);
  if (!(await pathExists(quarantineRoot))) {
    return;
  }

  const entries = await readdir(quarantineRoot, { withFileTypes: true });
  const cutoff = Date.now() - config.orphanWorkspaceTtlMs;

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const entryPath = path.join(quarantineRoot, entry.name);
        const entryStat = await stat(entryPath);
        if (entryStat.mtimeMs <= cutoff) {
          await rm(entryPath, { recursive: true, force: true });
        }
      }),
  );
}

async function removeUntrackedContainers(
  client: DockerClient,
  containers: DockerInspectContainer[],
  trackedSessionIds: Set<string>,
): Promise<void> {
  for (const container of containers) {
    const sessionId = container.config.labels[SANDBOX_LABEL_SESSION_ID];
    if (!sessionId || trackedSessionIds.has(sessionId)) {
      continue;
    }

    await client.removeContainer(container.name, { force: true });
  }
}

async function reconcileWorkspaceDirectories(
  trackedWorkspacePaths: Set<string>,
): Promise<void> {
  const config = getDockerSandboxPlatformConfig();
  if (!(await pathExists(config.workspaceRoot))) {
    return;
  }

  const quarantineRoot = buildQuarantineRoot(config.workspaceRoot);
  const entries = await readdir(config.workspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === path.basename(quarantineRoot)) {
      continue;
    }

    const entryPath = path.join(config.workspaceRoot, entry.name);
    if (!trackedWorkspacePaths.has(entryPath)) {
      await quarantineWorkspace(entryPath, "orphan");
    }
  }
}

async function inspectActiveContainerForState(
  client: DockerClient,
  state: DockerContainerState | null | undefined,
): Promise<DockerInspectContainer | null> {
  if (!state?.containerName) {
    return null;
  }

  return client.inspectContainer(state.containerName);
}

export class DockerSandboxSupervisor {
  private readonly client = new DockerClient();

  async ensureSessionSandbox(
    params: EnsureSessionSandboxParams,
  ): Promise<{ type: "docker-container" } & DockerContainerState> {
    return withSupervisorMutationLock(async () => {
      await ensureWorkspaceRoot();

      const currentState = createBaseState(
        params.sessionId,
        params.currentState,
      );
      const existingContainer = await inspectActiveContainerForState(
        this.client,
        currentState,
      );

      if (existingContainer?.state.running) {
        return buildRuntimeState({
          sessionId: params.sessionId,
          currentState,
          source: params.source ?? currentState.source,
          container: existingContainer,
          timeoutMs: params.timeoutMs,
        });
      }

      await this.enforceCapacity(params.sessionId);

      if (currentState.containerName) {
        await this.client.removeContainer(currentState.containerName, {
          force: true,
        });
      }

      await prepareWorkspaceDirectory(currentState.workspaceHostPath!);

      const labels = buildContainerLabels({
        sessionId: params.sessionId,
        routeSlug: currentState.routeSlug!,
        workspaceHostPath: currentState.workspaceHostPath!,
        domainSuffix: currentState.domainSuffix!,
        network: currentState.network!,
        ports: params.ports,
      });

      const runArgs = [
        "run",
        "-d",
        "--name",
        currentState.containerName!,
        "--hostname",
        currentState.containerName!,
        "--network",
        currentState.network!,
        "--cpus",
        String(getDockerSandboxPlatformConfig().containerCpu),
        "--memory",
        `${getDockerSandboxPlatformConfig().containerMemoryMb}m`,
        "--pids-limit",
        String(getDockerSandboxPlatformConfig().containerPidsLimit),
        "--security-opt",
        "no-new-privileges",
        "--cap-drop",
        "ALL",
        "--mount",
        `type=bind,src=${currentState.workspaceHostPath},dst=${currentState.workingDirectory}`,
        "--tmpfs",
        "/tmp:exec,size=268435456",
        ...Object.entries(labels).flatMap(([key, value]) => [
          "--label",
          `${key}=${value}`,
        ]),
        currentState.image!,
        "sleep",
        "infinity",
      ];

      const runResult = await this.client.exec(runArgs);
      if (runResult.exitCode !== 0) {
        throw new Error(
          runResult.stderr ||
            runResult.stdout ||
            "Failed to start Docker sandbox container",
        );
      }

      const container = await this.client.inspectContainer(
        currentState.containerName!,
      );
      if (!container) {
        throw new Error("Started sandbox container could not be inspected");
      }

      return buildRuntimeState({
        sessionId: params.sessionId,
        currentState,
        source: params.source ?? currentState.source,
        container,
        timeoutMs: params.timeoutMs,
      });
    });
  }

  async reconcile(reason: "startup" | "periodic" = "periodic"): Promise<void> {
    return withSupervisorMutationLock(async () => {
      await ensureWorkspaceRoot();

      const persistedSessions = await getPersistedDockerSessions();
      const containers = await listManagedContainers(this.client);
      const trackedSessionIds = new Set<string>();
      const trackedWorkspacePaths = new Set<string>();

      const containersBySessionId = new Map<string, DockerInspectContainer>();
      for (const container of containers) {
        const sessionId = container.config.labels[SANDBOX_LABEL_SESSION_ID];
        if (sessionId) {
          containersBySessionId.set(sessionId, container);
        }

        const workspacePath = container.config.labels[SANDBOX_LABEL_WORKSPACE];
        if (workspacePath) {
          trackedWorkspacePaths.add(workspacePath);
        }
      }

      for (const sessionRecord of persistedSessions) {
        trackedSessionIds.add(sessionRecord.id);
        const state = sessionRecord.sandboxState;
        if (!state) {
          continue;
        }
        if (state.workspaceHostPath) {
          trackedWorkspacePaths.add(state.workspaceHostPath);
        }

        const runtimeContainer = hasRuntimeHandle(state)
          ? (containersBySessionId.get(sessionRecord.id) ?? null)
          : null;

        if (hasRuntimeHandle(state) && !runtimeContainer) {
          const workspaceExists = await pathExists(state.workspaceHostPath);
          const preservedState: {
            type: "docker-container";
          } & DockerContainerState = {
            type: "docker-container",
            ...createBaseState(sessionRecord.id, state),
            source: state.source,
            recoverableWorkspace: workspaceExists
              ? {
                  detectedAt: Date.now(),
                  reason: "container-missing",
                }
              : undefined,
            containerId: undefined,
            expiresAt: undefined,
          };

          if (!workspaceExists || sessionRecord.status === "archived") {
            if (workspaceExists) {
              await quarantineWorkspace(state.workspaceHostPath, "abandoned");
            }

            await updateSession(sessionRecord.id, {
              sandboxState: {
                type: "docker-container",
                ...createBaseState(sessionRecord.id, state),
                source: state.source,
                containerId: undefined,
                expiresAt: undefined,
                recoverableWorkspace: undefined,
              },
              ...(sessionRecord.status === "archived"
                ? {
                    lifecycleState: "archived",
                    sandboxExpiresAt: null,
                    hibernateAfter: null,
                  }
                : buildStoppedLifecycleUpdate(false)),
              lifecycleError: `Sandbox container missing${reason === "startup" ? " during startup" : ""}.`,
            });
            continue;
          }

          await updateSession(sessionRecord.id, {
            sandboxState: preservedState,
            ...buildStoppedLifecycleUpdate(false),
            lifecycleError:
              "Sandbox container missing; workspace preserved for resume.",
          });
          continue;
        }

        if (!hasRuntimeHandle(state) && runtimeContainer) {
          await this.client.removeContainer(runtimeContainer.name, {
            force: true,
          });
        }
      }

      await removeUntrackedContainers(
        this.client,
        containers,
        trackedSessionIds,
      );
      await reconcileWorkspaceDirectories(trackedWorkspacePaths);
      await garbageCollectQuarantinedWorkspaces();
    });
  }

  private async enforceCapacity(sessionId: string): Promise<void> {
    const config = getDockerSandboxPlatformConfig();
    const [info, containers] = await Promise.all([
      this.client.getInfo(),
      this.client.listContainersByLabel({
        labels: {
          [SANDBOX_LABEL_MANAGED]: "true",
        },
      }),
    ]);

    const activeCount = containers.filter((container) => {
      const ownerSessionId = container.config.labels[SANDBOX_LABEL_SESSION_ID];
      return ownerSessionId !== sessionId && container.state.running;
    }).length;

    if (activeCount >= config.maxContainers) {
      throw new DockerSandboxCapacityError(
        `Sandbox capacity exhausted: reached hard limit of ${config.maxContainers} containers.`,
      );
    }

    const allowedCpu = Math.max(info.ncpu - config.platformReservedCpu, 0);
    const allowedMemoryMb = Math.max(
      Math.floor(info.memTotalBytes / (1024 * 1024)) -
        config.platformReservedMemoryMb,
      0,
    );
    const projectedCpu = (activeCount + 1) * config.containerCpu;
    const projectedMemoryMb = (activeCount + 1) * config.containerMemoryMb;

    if (projectedCpu > allowedCpu || projectedMemoryMb > allowedMemoryMb) {
      throw new DockerSandboxCapacityError(
        `Sandbox capacity exhausted: need ${config.containerCpu} CPU and ${config.containerMemoryMb}MB per sandbox, but only ${allowedCpu} CPU and ${allowedMemoryMb}MB are allocatable after platform reserve.`,
      );
    }
  }
}
