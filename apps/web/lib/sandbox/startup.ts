import "server-only";

import { getConfiguredSandboxBackend } from "./backend";
import { getDockerSandboxPlatformConfig } from "./docker-config";
import { getSandboxSupervisor } from "./supervisor";

let supervisorStarted = false;

export function ensureSandboxSupervisorStarted(): void {
  if (supervisorStarted) {
    return;
  }

  if (getConfiguredSandboxBackend() !== "docker-container") {
    return;
  }

  supervisorStarted = true;

  const supervisor = getSandboxSupervisor();
  void supervisor.reconcile("startup").catch((error) => {
    console.error("Initial sandbox reconciliation failed:", error);
  });

  const interval = setInterval(() => {
    void supervisor.reconcile("periodic").catch((error) => {
      console.error("Periodic sandbox reconciliation failed:", error);
    });
  }, getDockerSandboxPlatformConfig().reconcileIntervalMs);

  interval.unref?.();
}
