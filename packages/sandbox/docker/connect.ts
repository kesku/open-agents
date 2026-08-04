import type { Sandbox } from "../interface.ts";
import type { ConnectOptions } from "../factory.ts";
import { DockerSandbox } from "./sandbox.ts";
import type { DockerState } from "./state.ts";

export function connectDocker(
  state: DockerState,
  options?: ConnectOptions,
): Promise<Sandbox> {
  return DockerSandbox.connect(state, options);
}

export function destroyDocker(state: DockerState): Promise<void> {
  return DockerSandbox.destroy(state);
}
