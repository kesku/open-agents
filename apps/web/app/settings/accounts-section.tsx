"use client";

import { Github, KeyRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useGitHubAccounts } from "@/hooks/use-github-accounts";
import { useSession } from "@/hooks/use-session";

function GitHubConnectionCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-background p-2 text-muted-foreground">
          <Github className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AccountsSectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border/50 bg-muted/10 p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border/50 bg-muted/10 p-4">
        <div className="space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function AccountsSection() {
  const { hasGitHub, isLocalGitHub } = useSession();
  const {
    accounts,
    isLoading: accountsLoading,
    error,
  } = useGitHubAccounts(hasGitHub);

  const primaryAccount = accounts[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          This local workspace uses a single server-managed GitHub token. There
          is no per-user OAuth or GitHub App installation flow anymore.
        </p>
      </div>

      {!hasGitHub ? (
        <GitHubConnectionCard
          title="GitHub token not configured"
          description="Set LOCAL_GITHUB_ACCESS_TOKEN in the server environment and restart Open Agents to browse repositories, create repos, and open pull requests."
        />
      ) : (
        <GitHubConnectionCard
          title={
            isLocalGitHub
              ? "GitHub connected through the server token"
              : "GitHub connected"
          }
          description="Repository access is controlled by the single local token configured on the server. To change the connection, update LOCAL_GITHUB_ACCESS_TOKEN and restart the app."
        />
      )}

      <div className="rounded-lg border border-border/50 bg-muted/10 p-4">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Accessible accounts</h2>
        </div>

        {!hasGitHub ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Once the server GitHub token is configured, this page will show the
            personal account and organizations visible to that token.
          </p>
        ) : accountsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : error ? (
          <p className="text-sm leading-6 text-destructive">{error}</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            The token is configured, but no GitHub accounts could be resolved
            from it.
          </p>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div
                key={`${account.accountType}:${account.login}`}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-background/70 px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage
                      src={account.avatarUrl ?? undefined}
                      alt={account.login}
                    />
                    <AvatarFallback>
                      {account.login.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {account.login}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.accountType === "Organization"
                        ? "Organization"
                        : "Personal account"}
                    </p>
                  </div>
                </div>
                {primaryAccount?.login === account.login ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700">
                    Primary
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
