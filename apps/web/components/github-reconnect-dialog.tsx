"use client";

import Link from "next/link";
import type { GitHubConnectionReason } from "@/lib/github/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function getReconnectDescription(
  reason: GitHubConnectionReason | null,
): string {
  switch (reason) {
    case "local_token_invalid":
      return "GitHub rejected LOCAL_GITHUB_ACCESS_TOKEN. Update the server environment with a valid token and restart Open Agents.";
    case "local_github_unavailable":
      return "Open Agents could not reach GitHub to validate the server-managed token. Check GitHub availability and this server's network connection.";
    case "installations_missing":
      return "GitHub no longer reports your app installation. This usually happens after app permission changes or an installation being invalidated.";
    case "sync_auth_failed":
      return "GitHub rejected the saved connection while we refreshed your installation access.";
    case "token_unavailable":
      return "Your saved GitHub token is no longer usable.";
    default:
      return "Your GitHub connection needs to be refreshed before you continue.";
  }
}

export function GitHubReconnectDialog({
  open,
  reason,
}: {
  open: boolean;
  reason: GitHubConnectionReason | null;
}) {
  const localTokenProblem =
    reason === "local_token_invalid" || reason === "local_github_unavailable";

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {localTokenProblem
              ? "GitHub connection needs attention"
              : "Reconnect GitHub"}
          </DialogTitle>
          <DialogDescription>
            {getReconnectDescription(reason)}
            {localTokenProblem
              ? " Repository access will resume after the server restarts with the updated environment."
              : " Reconnect now to restore repository access and keep using the app."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button asChild>
            <Link href="/settings/connections">
              {localTokenProblem
                ? "Open connection settings"
                : "Reconnect GitHub"}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
