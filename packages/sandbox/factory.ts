import { connectDockerContainer } from "./docker/connect";
import type { DockerContainerState } from "./docker/state";
import type { Sandbox, SandboxHooks } from "./interface";
import type { SandboxStatus } from "./types";
import { connectProxmoxLxc } from "./proxmox/connect";
import type { ProxmoxLxcState } from "./proxmox/state";
import { connectVercel } from "./vercel/connect";
import type { VercelState } from "./vercel/state";

// Re-export SandboxStatus from types for convenience
export type { SandboxStatus };

/**
 * Unified sandbox state type.
 * Use `type` discriminator to determine which sandbox implementation to use.
 */
export type SandboxState =
  | ({ type: "vercel" } & VercelState)
  | ({ type: "proxmox-lxc" } & ProxmoxLxcState)
  | ({ type: "docker-container" } & DockerContainerState);

/**
 * Base connect options for all sandbox types.
 */
export interface ConnectOptions {
  /** Environment variables available to sandbox commands */
  env?: Record<string, string>;
  /** GitHub token used for credential brokering; never exposed inside the sandbox */
  githubToken?: string;
  /** Git user for commits */
  gitUser?: { name: string; email: string };
  /** Lifecycle hooks */
  hooks?: SandboxHooks;
  /** Timeout in milliseconds for sandboxes (default: 300,000 = 5 minutes) */
  timeout?: number;
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

function connectByType(
  state: SandboxState,
  options?: ConnectOptions,
): Promise<Sandbox> {
  if (state.type === "docker-container") {
    return connectDockerContainer(state, options);
  }

  if (state.type === "proxmox-lxc") {
    return connectProxmoxLxc(state, options);
  }

  return connectVercel(state, options);
}
