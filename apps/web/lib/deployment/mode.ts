export type DeploymentMode = "local" | "vercel";

const DEFAULT_DEPLOYMENT_MODE: DeploymentMode = "local";

export function parseDeploymentMode(value: string | undefined): DeploymentMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_DEPLOYMENT_MODE;
  }

  if (normalized === "local" || normalized === "vercel") {
    return normalized;
  }

  throw new Error(
    `Invalid Open Agents deployment mode: ${value}. Expected "local" or "vercel".`,
  );
}

export function getDeploymentMode(): DeploymentMode {
  const serverValue = process.env.OPEN_AGENTS_DEPLOYMENT_MODE?.trim();
  const publicValue =
    process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE?.trim();
  const serverMode = serverValue ? parseDeploymentMode(serverValue) : undefined;
  const publicMode = publicValue ? parseDeploymentMode(publicValue) : undefined;

  if (serverMode && publicMode && serverMode !== publicMode) {
    throw new Error(
      "OPEN_AGENTS_DEPLOYMENT_MODE and NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE must match",
    );
  }

  return serverMode ?? publicMode ?? DEFAULT_DEPLOYMENT_MODE;
}

export function getPublicDeploymentMode(): DeploymentMode {
  return parseDeploymentMode(
    process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE,
  );
}

export function isLocalDeployment(): boolean {
  return getDeploymentMode() === "local";
}

export function isLocalDeploymentClient(): boolean {
  return getPublicDeploymentMode() === "local";
}
