import type { Source } from "../types";

/**
 * State configuration for the Proxmox LXC sandbox backend.
 *
 * The web app allocates one fixed node from the configured local pool and
 * persists the lease metadata in session state so later requests can reconnect
 * over SSH without holding in-memory process state.
 */
export interface ProxmoxLxcState {
  /** Optional git source to clone into the workspace during first bootstrap */
  source?: Source;
  /** Lease identifier used to scope one active session to one node */
  leaseId?: string;
  /** Stable node identifier from the configured fixed pool */
  nodeId?: string;
  /** SSH host for the leased LXC */
  host?: string;
  /** SSH port for the leased LXC */
  port?: number;
  /** SSH username for the leased LXC */
  sshUser?: string;
  /** Working directory inside the LXC */
  workspacePath?: string;
  /** Optional host used for direct preview URLs */
  previewHost?: string;
  /** Optional template for preview URLs, e.g. "http://{host}:{port}" */
  previewUrlTemplate?: string;
  /** Optional remote hard-reset command executed when the lease is released */
  resetCommand?: string;
  /** Timestamp (ms) when the current lease should be treated as expired */
  expiresAt?: number;
  /** Timestamp (ms) when the current lease was reserved */
  leasedAt?: number;
}
