import "server-only";

const DEFAULT_SANDBOX_IMAGE = "open-agents-sandbox:local";
const DEFAULT_SANDBOX_NETWORK = "open-agents";
const DEFAULT_SANDBOX_DOMAIN_SUFFIX = "127.0.0.1.sslip.io";
const DEFAULT_SANDBOX_WORKSPACE_ROOT = "/var/lib/open-agents/workspaces";
const DEFAULT_SANDBOX_CONTAINER_CPU = 1;
const DEFAULT_SANDBOX_CONTAINER_MEMORY_MB = 1024;
const DEFAULT_SANDBOX_CONTAINER_PIDS_LIMIT = 512;
const DEFAULT_SANDBOX_PLATFORM_RESERVED_CPU = 1;
const DEFAULT_SANDBOX_PLATFORM_RESERVED_MEMORY_MB = 1536;
const DEFAULT_SANDBOX_MAX_CONTAINERS = 8;
const DEFAULT_SANDBOX_ORPHAN_WORKSPACE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_SANDBOX_RECONCILE_INTERVAL_MS = 60 * 1000;

function getOptionalEnvString(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = getOptionalEnvString(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumberEnv(name: string, fallback: number): number {
  const raw = getOptionalEnvString(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePublicProtocol(): "http" | "https" {
  const raw = getOptionalEnvString("SANDBOX_PUBLIC_PROTOCOL");
  return raw === "https" ? "https" : "http";
}

export interface DockerSandboxPlatformConfig {
  image: string;
  network: string;
  domainSuffix: string;
  publicProtocol: "http" | "https";
  workspaceRoot: string;
  workingDirectory: string;
  containerCpu: number;
  containerMemoryMb: number;
  containerPidsLimit: number;
  platformReservedCpu: number;
  platformReservedMemoryMb: number;
  maxContainers: number;
  orphanWorkspaceTtlMs: number;
  reconcileIntervalMs: number;
}

export function getDockerSandboxPlatformConfig(): DockerSandboxPlatformConfig {
  return {
    image: getOptionalEnvString("SANDBOX_IMAGE") ?? DEFAULT_SANDBOX_IMAGE,
    network: getOptionalEnvString("SANDBOX_NETWORK") ?? DEFAULT_SANDBOX_NETWORK,
    domainSuffix:
      getOptionalEnvString("SANDBOX_DOMAIN_SUFFIX") ??
      DEFAULT_SANDBOX_DOMAIN_SUFFIX,
    publicProtocol: parsePublicProtocol(),
    workspaceRoot:
      getOptionalEnvString("SANDBOX_WORKSPACE_ROOT") ??
      DEFAULT_SANDBOX_WORKSPACE_ROOT,
    workingDirectory: "/workspace",
    containerCpu: parsePositiveNumberEnv(
      "SANDBOX_CONTAINER_CPU",
      DEFAULT_SANDBOX_CONTAINER_CPU,
    ),
    containerMemoryMb: parsePositiveIntegerEnv(
      "SANDBOX_CONTAINER_MEMORY_MB",
      DEFAULT_SANDBOX_CONTAINER_MEMORY_MB,
    ),
    containerPidsLimit: parsePositiveIntegerEnv(
      "SANDBOX_CONTAINER_PIDS_LIMIT",
      DEFAULT_SANDBOX_CONTAINER_PIDS_LIMIT,
    ),
    platformReservedCpu: parsePositiveNumberEnv(
      "SANDBOX_PLATFORM_RESERVED_CPU",
      DEFAULT_SANDBOX_PLATFORM_RESERVED_CPU,
    ),
    platformReservedMemoryMb: parsePositiveIntegerEnv(
      "SANDBOX_PLATFORM_RESERVED_MEMORY_MB",
      DEFAULT_SANDBOX_PLATFORM_RESERVED_MEMORY_MB,
    ),
    maxContainers: parsePositiveIntegerEnv(
      "SANDBOX_MAX_CONTAINERS",
      DEFAULT_SANDBOX_MAX_CONTAINERS,
    ),
    orphanWorkspaceTtlMs: parsePositiveIntegerEnv(
      "SANDBOX_ORPHAN_WORKSPACE_TTL_MS",
      DEFAULT_SANDBOX_ORPHAN_WORKSPACE_TTL_MS,
    ),
    reconcileIntervalMs: parsePositiveIntegerEnv(
      "SANDBOX_RECONCILE_INTERVAL_MS",
      DEFAULT_SANDBOX_RECONCILE_INTERVAL_MS,
    ),
  };
}
