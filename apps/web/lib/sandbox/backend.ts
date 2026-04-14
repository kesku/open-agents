import type { SandboxState } from "@open-harness/sandbox";

export const SANDBOX_TYPES = ["vercel", "proxmox-lxc"] as const;

export type AppSandboxType = (typeof SANDBOX_TYPES)[number];

export interface SandboxCapabilities {
  supportsDiff: boolean;
  supportsPreviewUrls: boolean;
  supportsRepoCreation: boolean;
  supportsResume: boolean;
  supportsSnapshots: boolean;
}

const DEFAULT_SANDBOX_BACKEND: AppSandboxType = "vercel";

const SANDBOX_CAPABILITIES: Record<AppSandboxType, SandboxCapabilities> = {
  vercel: {
    supportsDiff: true,
    supportsPreviewUrls: true,
    supportsRepoCreation: true,
    supportsResume: true,
    supportsSnapshots: true,
  },
  "proxmox-lxc": {
    supportsDiff: true,
    supportsPreviewUrls: true,
    supportsRepoCreation: true,
    supportsResume: false,
    supportsSnapshots: false,
  },
};

function normalizeSandboxType(value: string | undefined): AppSandboxType {
  if (value === "proxmox-lxc") {
    return value;
  }

  return DEFAULT_SANDBOX_BACKEND;
}

export function getConfiguredSandboxBackend(): AppSandboxType {
  return normalizeSandboxType(
    process.env.NEXT_PUBLIC_SANDBOX_BACKEND ?? process.env.SANDBOX_BACKEND,
  );
}

export function getAvailableSandboxTypes(): AppSandboxType[] {
  return [getConfiguredSandboxBackend()];
}

export function isSupportedSandboxType(
  value: unknown,
): value is AppSandboxType {
  return (
    typeof value === "string" &&
    getAvailableSandboxTypes().includes(value as AppSandboxType)
  );
}

export function getSandboxCapabilities(
  sandbox:
    | AppSandboxType
    | SandboxState
    | Pick<SandboxState, "type">
    | null
    | undefined,
): SandboxCapabilities {
  const type =
    typeof sandbox === "string" ? sandbox : normalizeSandboxType(sandbox?.type);

  return SANDBOX_CAPABILITIES[type];
}

export function getSandboxOptionLabel(type: AppSandboxType): string {
  return type === "proxmox-lxc" ? "Proxmox LXC" : "Vercel";
}

export function getSandboxOptionDescription(type: AppSandboxType): string {
  return type === "proxmox-lxc" ? "Local SSH pool" : "Cloud sandbox";
}
