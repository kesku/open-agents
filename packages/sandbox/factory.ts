import type { Sandbox, SandboxHooks } from "./interface.ts";
import type { SandboxStatus } from "./types.ts";
import type { DockerState } from "./docker/state.ts";
import type { VercelState } from "./vercel/state.ts";

// Re-export SandboxStatus from types for convenience
export type { SandboxStatus };

/**
 * Unified sandbox state type.
 * Use `type` discriminator to determine which sandbox implementation to use.
 */
export type SandboxState =
  | ({ type: "vercel" } & VercelState)
  | ({ type: "docker" } & DockerState);

/**
 * Base connect options for all sandbox types.
 */
export interface ConnectOptions {
  /** Environment variables available to sandbox commands */
  env?: Record<string, string>;
  /** GitHub token used only during setup clone/fetch, then cleared */
  githubToken?: string;
  /** Git user for commits */
  gitUser?: { name: string; email: string };
  /** Lifecycle hooks */
  hooks?: SandboxHooks;
  /** Timeout in milliseconds for sandboxes (default: 300,000 = 5 minutes) */
  timeout?: number;
  /** Number of vCPUs for new sandboxes */
  vcpus?: number;
  /** Ports to expose from the sandbox for dev server preview URLs */
  ports?: number[];
  /** Snapshot ID used as the base image for new sandboxes */
  baseSnapshotId?: string;
  /** Whether to resume a stopped persistent sandbox session */
  resume?: boolean;
  /** Whether to create the named sandbox when it does not already exist */
  createIfMissing?: boolean;
  /** Whether new sandboxes should persist filesystem state between sessions */
  persistent?: boolean;
  /** Default expiration for automatic persistent-sandbox snapshots */
  snapshotExpiration?: number;
  /**
   * Skip git init in an empty workspace (e.g. when refreshing a Vercel base snapshot).
   */
  skipGitWorkspaceBootstrap?: boolean;
}

/**
 * Configuration for connecting to a sandbox.
 */
export type SandboxConnectConfig = {
  state: SandboxState;
  options?: ConnectOptions;
};

/**
 * Connect to a sandbox based on the provided configuration.
 */
export async function connectSandbox(
  configOrState: SandboxConnectConfig | SandboxState,
  legacyOptions?: ConnectOptions,
): Promise<Sandbox> {
  const isNewApi =
    typeof configOrState === "object" &&
    "state" in configOrState &&
    typeof configOrState.state === "object" &&
    "type" in configOrState.state;

  if (isNewApi) {
    const config = configOrState as SandboxConnectConfig;
    return connectByType(config.state, config.options);
  }

  const state = configOrState as SandboxState;
  return connectByType(state, legacyOptions);
}

async function connectByType(
  state: SandboxState,
  options?: ConnectOptions,
): Promise<Sandbox> {
  if (state.type === "docker") {
    const { connectDocker } = await import("./docker/connect.ts");
    return connectDocker(state, options);
  }

  const { connectVercel } = await import("./vercel/connect.ts");
  return connectVercel(state, options);
}

/** Stop the sandbox and delete its persisted workspace. */
export async function destroySandbox(state: SandboxState): Promise<void> {
  if (state.type === "docker") {
    const { destroyDocker } = await import("./docker/connect.ts");
    await destroyDocker(state);
    return;
  }

  const { connectVercel } = await import("./vercel/connect.ts");
  const sandbox = await connectVercel(state, { resume: false });
  await sandbox.stop();
}
