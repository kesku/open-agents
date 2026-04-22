import "server-only";

import type { DockerContainerState, Source } from "@open-harness/sandbox";
import { getConfiguredSandboxBackend } from "./backend";
import { DockerSandboxSupervisor } from "./docker-supervisor";
import { DockerSandboxCapacityError } from "./docker-supervisor-errors";

export interface EnsureSessionSandboxParams {
  sessionId: string;
  currentState: DockerContainerState | null | undefined;
  source?: Source;
  timeoutMs: number;
  ports: number[];
}

export interface SandboxSupervisor {
  ensureSessionSandbox(
    params: EnsureSessionSandboxParams,
  ): Promise<{ type: "docker-container" } & DockerContainerState>;
  reconcile(reason?: "startup" | "periodic"): Promise<void>;
}

let dockerSandboxSupervisor: DockerSandboxSupervisor | null = null;

export function getSandboxSupervisor(): SandboxSupervisor {
  const backend = getConfiguredSandboxBackend();
  if (backend !== "docker-container") {
    throw new Error(
      `Sandbox supervisor is only available for docker-container backend (got ${backend})`,
    );
  }

  if (!dockerSandboxSupervisor) {
    dockerSandboxSupervisor = new DockerSandboxSupervisor();
  }

  return dockerSandboxSupervisor;
}

export { DockerSandboxCapacityError };
