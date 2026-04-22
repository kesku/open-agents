import type { Sandbox, SandboxHooks } from "../interface";
import { DockerContainerSandbox } from "./sandbox";
import type { DockerContainerState } from "./state";

interface ConnectOptions {
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  ports?: number[];
}

export async function connectDockerContainer(
  state: DockerContainerState,
  options?: ConnectOptions,
): Promise<Sandbox> {
  return DockerContainerSandbox.connect(state, options);
}
