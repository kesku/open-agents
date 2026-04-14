import type { Sandbox, SandboxHooks } from "../interface";
import { ProxmoxLxcSandbox } from "./sandbox";
import type { ProxmoxLxcState } from "./state";

interface ConnectOptions {
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  ports?: number[];
}

export async function connectProxmoxLxc(
  state: ProxmoxLxcState,
  options?: ConnectOptions,
): Promise<Sandbox> {
  return ProxmoxLxcSandbox.connect(state, options);
}
