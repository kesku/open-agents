import type { Source } from "../types";

export interface DockerRecoverableWorkspaceState {
  detectedAt: number;
  reason?: string;
}

export interface DockerContainerState {
  source?: Source;
  containerId?: string;
  containerName?: string;
  image?: string;
  network?: string;
  workingDirectory?: string;
  workspaceHostPath?: string;
  routeSlug?: string;
  domainSuffix?: string;
  publicProtocol?: "http" | "https";
  expiresAt?: number;
  createdAt?: number;
  recoverableWorkspace?: DockerRecoverableWorkspaceState;
}
