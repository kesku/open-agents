export type GitHubConnectionStatus =
  | "not_connected"
  | "connected"
  | "reconnect_required";

export type GitHubConnectionReason =
  | "token_unavailable"
  | "installations_missing"
  | "sync_auth_failed"
  | "local_token_invalid"
  | "local_github_unavailable";

export interface GitHubConnectionStatusResponse {
  status: GitHubConnectionStatus;
  reason: GitHubConnectionReason | null;
  hasInstallations: boolean;
  syncedInstallationsCount: number | null;
}
