import type { Source } from "../types.ts";

/** State needed to reconnect to a Docker sandbox. */
export interface DockerState {
  source?: Source;
  sandboxName?: string;
  expiresAt?: number;
}
