import "server-only";

import type { ProxmoxLxcState, Source } from "@open-harness/sandbox";
import { ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  getSessionById,
  normalizeLegacySandboxState,
  updateSession,
} from "@/lib/db/sessions";
import { sessions } from "@/lib/db/schema";

const DEFAULT_WORKSPACE_PATH = "/workspace";
const DEFAULT_SSH_PORT = 22;
const DEFAULT_PROVISIONING_STALE_MS = 5 * 60 * 1000;

const proxmoxPoolNodeSchema = z.object({
  id: z.string().trim().min(1),
  host: z.string().trim().min(1),
  port: z.number().int().positive().default(DEFAULT_SSH_PORT),
  sshUser: z.string().trim().min(1).default("root"),
  workspacePath: z.string().trim().min(1).default(DEFAULT_WORKSPACE_PATH),
  previewHost: z.string().trim().min(1).optional(),
  previewUrlTemplate: z.string().trim().min(1).optional(),
  resetCommand: z.string().trim().min(1).optional(),
});

const proxmoxPoolSchema = z.array(proxmoxPoolNodeSchema).length(4);

type ProxmoxPoolNode = z.infer<typeof proxmoxPoolNodeSchema>;

export class ProxmoxPoolCapacityError extends Error {
  readonly reason = "pool-exhausted";

  constructor() {
    super("All local Proxmox sandboxes are currently in use.");
    this.name = "ProxmoxPoolCapacityError";
  }
}

let poolMutationLock: Promise<void> = Promise.resolve();

function withPoolMutationLock<T>(callback: () => Promise<T>): Promise<T> {
  const run = (async () => {
    try {
      await poolMutationLock;
    } catch {
      // Ignore prior lease errors so the next caller can proceed.
    }

    return callback();
  })();

  poolMutationLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function getProvisioningStaleMs(): number {
  const raw = process.env.PROXMOX_LXC_PROVISIONING_STALE_MS;
  if (!raw) {
    return DEFAULT_PROVISIONING_STALE_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PROVISIONING_STALE_MS;
}

export function getProxmoxPoolConfig(): ProxmoxPoolNode[] {
  const raw = process.env.PROXMOX_LXC_POOL;
  if (!raw) {
    throw new Error(
      "PROXMOX_LXC_POOL must be configured when SANDBOX_BACKEND=proxmox-lxc",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `PROXMOX_LXC_POOL must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const fallbackSshUser = process.env.PROXMOX_SSH_USER?.trim();
  const fallbackWorkspacePath =
    process.env.PROXMOX_LXC_WORKSPACE_PATH?.trim() || DEFAULT_WORKSPACE_PATH;
  const fallbackPreviewUrlTemplate =
    process.env.PROXMOX_LXC_PREVIEW_URL_TEMPLATE?.trim();
  const fallbackResetCommand = process.env.PROXMOX_LXC_RESET_COMMAND?.trim();

  const normalizedNodes = Array.isArray(parsed)
    ? parsed.map((node) => {
        if (!node || typeof node !== "object") {
          return node;
        }

        return {
          sshUser: fallbackSshUser,
          workspacePath: fallbackWorkspacePath,
          previewUrlTemplate: fallbackPreviewUrlTemplate,
          resetCommand: fallbackResetCommand,
          ...node,
        };
      })
    : parsed;

  return proxmoxPoolSchema.parse(normalizedNodes);
}

function isReservedProxmoxState(
  state: unknown,
  nowMs: number,
): state is { type: "proxmox-lxc" } & ProxmoxLxcState {
  const normalizedState = normalizeLegacySandboxState(state);
  if (!normalizedState || normalizedState.type !== "proxmox-lxc") {
    return false;
  }

  if (
    typeof normalizedState.nodeId !== "string" ||
    normalizedState.nodeId.length === 0
  ) {
    return false;
  }

  if (
    typeof normalizedState.expiresAt === "number" &&
    normalizedState.expiresAt > nowMs
  ) {
    return true;
  }

  if (
    typeof normalizedState.leasedAt === "number" &&
    nowMs - normalizedState.leasedAt <= getProvisioningStaleMs()
  ) {
    return true;
  }

  return false;
}

async function listReservedNodeIds(
  excludedSessionId: string,
): Promise<Set<string>> {
  const nowMs = Date.now();
  const records = await db
    .select({
      id: sessions.id,
      sandboxState: sessions.sandboxState,
    })
    .from(sessions)
    .where(ne(sessions.status, "archived"));

  return new Set(
    records
      .filter((record) => record.id !== excludedSessionId)
      .map((record) => normalizeLegacySandboxState(record.sandboxState))
      .filter((state) => isReservedProxmoxState(state, nowMs))
      .map((state) => state.nodeId as string),
  );
}

function buildLeaseState(
  node: ProxmoxPoolNode,
  source: Source | undefined,
): { type: "proxmox-lxc" } & ProxmoxLxcState {
  return {
    type: "proxmox-lxc",
    ...(source ? { source } : {}),
    leaseId: `proxmox:${node.id}:${crypto.randomUUID()}`,
    leasedAt: Date.now(),
    nodeId: node.id,
    host: node.host,
    port: node.port,
    sshUser: node.sshUser,
    workspacePath: node.workspacePath,
    ...(node.previewHost ? { previewHost: node.previewHost } : {}),
    ...(node.previewUrlTemplate
      ? { previewUrlTemplate: node.previewUrlTemplate }
      : {}),
    ...(node.resetCommand ? { resetCommand: node.resetCommand } : {}),
  };
}

export async function reserveProxmoxLease(
  sessionId: string,
  source?: Source,
): Promise<{ type: "proxmox-lxc" } & ProxmoxLxcState> {
  return withPoolMutationLock(async () => {
    const sessionRecord = await getSessionById(sessionId);
    if (!sessionRecord) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const currentState =
      sessionRecord.sandboxState?.type === "proxmox-lxc"
        ? sessionRecord.sandboxState
        : null;

    const pool = getProxmoxPoolConfig();
    const reservedNodeIds = await listReservedNodeIds(sessionId);

    if (
      currentState?.nodeId &&
      pool.some((node) => node.id === currentState.nodeId) &&
      !reservedNodeIds.has(currentState.nodeId)
    ) {
      const existingNode = pool.find((node) => node.id === currentState.nodeId);
      if (!existingNode) {
        throw new Error(
          `Proxmox node ${currentState.nodeId} is not configured`,
        );
      }

      const refreshedLease = buildLeaseState(
        existingNode,
        source ?? currentState.source,
      );
      await updateSession(sessionId, { sandboxState: refreshedLease });
      return refreshedLease;
    }

    const availableNode = pool.find((node) => !reservedNodeIds.has(node.id));
    if (!availableNode) {
      throw new ProxmoxPoolCapacityError();
    }

    const leaseState = buildLeaseState(
      availableNode,
      source ?? currentState?.source,
    );
    await updateSession(sessionId, { sandboxState: leaseState });
    return leaseState;
  });
}
