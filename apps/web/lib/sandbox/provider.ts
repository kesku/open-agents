export const SANDBOX_PROVIDER_TYPES = ["docker", "vercel"] as const;

export type SandboxProviderType = (typeof SANDBOX_PROVIDER_TYPES)[number];

export function isSandboxProviderType(
  value: unknown,
): value is SandboxProviderType {
  return (
    typeof value === "string" &&
    SANDBOX_PROVIDER_TYPES.includes(value as SandboxProviderType)
  );
}

function parseConfiguredProvider(
  name: string,
  value: string | undefined,
): SandboxProviderType | undefined {
  const configured = value?.trim();
  if (!configured) return undefined;
  if (!isSandboxProviderType(configured)) {
    throw new Error(
      `${name} must be one of: ${SANDBOX_PROVIDER_TYPES.join(", ")}`,
    );
  }
  return configured;
}

/** Active sandbox provider for this deployment. */
export function getConfiguredSandboxProvider(): SandboxProviderType {
  const serverProvider =
    typeof window === "undefined"
      ? parseConfiguredProvider(
          "SANDBOX_PROVIDER",
          process.env.SANDBOX_PROVIDER,
        )
      : undefined;
  const publicProvider = parseConfiguredProvider(
    "NEXT_PUBLIC_SANDBOX_PROVIDER",
    process.env.NEXT_PUBLIC_SANDBOX_PROVIDER,
  );

  if (serverProvider && publicProvider && serverProvider !== publicProvider) {
    throw new Error(
      "SANDBOX_PROVIDER and NEXT_PUBLIC_SANDBOX_PROVIDER must match",
    );
  }

  return serverProvider ?? publicProvider ?? "docker";
}

export function getSandboxProviderLabel(type: SandboxProviderType): string {
  return type === "docker" ? "Local Docker" : "Vercel";
}

export function getSandboxProviderDescription(
  type: SandboxProviderType,
): string {
  return type === "docker" ? "Self-hosted container" : "Cloud sandbox";
}
