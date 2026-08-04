const DEFAULT_IMAGE = "open-agents-sandbox:local";
const DEFAULT_NETWORK = "open-agents";
const DEFAULT_DOMAIN_SUFFIX = "127.0.0.1.sslip.io";

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(optionalEnv(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface DockerSandboxConfig {
  image: string;
  network: string;
  domainSuffix: string;
  publicProtocol: "http" | "https";
  cpu: number;
  memoryMb: number;
  pidsLimit: number;
  maxRunning: number;
  user: string;
}

export function getDockerSandboxConfig(): DockerSandboxConfig {
  return {
    image: optionalEnv("SANDBOX_IMAGE") ?? DEFAULT_IMAGE,
    network: optionalEnv("SANDBOX_NETWORK") ?? DEFAULT_NETWORK,
    domainSuffix: optionalEnv("SANDBOX_DOMAIN_SUFFIX") ?? DEFAULT_DOMAIN_SUFFIX,
    publicProtocol:
      optionalEnv("SANDBOX_PUBLIC_PROTOCOL") === "https" ? "https" : "http",
    cpu: positiveNumber("SANDBOX_CONTAINER_CPU", 1),
    memoryMb: positiveNumber("SANDBOX_CONTAINER_MEMORY_MB", 2048),
    pidsLimit: positiveNumber("SANDBOX_CONTAINER_PIDS_LIMIT", 512),
    maxRunning: positiveNumber("SANDBOX_MAX_RUNNING", 8),
    user: optionalEnv("SANDBOX_CONTAINER_USER") ?? "1000:1000",
  };
}
