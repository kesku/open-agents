"use client";

import {
  GitBranch,
  Link2,
  LockIcon,
  RefreshCw,
  SearchIcon,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccessibleGitHubRepositories } from "@/hooks/use-accessible-github-repositories";
import { parseGitHubRepoReference } from "@/lib/github/repo-identifiers";
import { cn } from "@/lib/utils";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1mo ago" : `${months}mo ago`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

interface LocalGitHubRepoSelectorProps {
  selectedOwner: string;
  selectedRepo: string;
  onSelect: (owner: string, repo: string) => void;
}

export function LocalGitHubRepoSelector({
  selectedOwner,
  selectedRepo,
  onSelect,
}: LocalGitHubRepoSelectorProps) {
  const [repoSearch, setRepoSearch] = useState("");
  const [repoReference, setRepoReference] = useState("");
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const deferredRepoSearch = useDeferredValue(repoSearch.trim());

  const {
    repositories,
    isLoading,
    error,
    refresh: refreshRepositories,
  } = useAccessibleGitHubRepositories({
    query: deferredRepoSearch,
    limit: 50,
  });

  const hasSelection = Boolean(selectedOwner && selectedRepo);
  const selectedRepository = repositories.find(
    (repository) =>
      repository.owner.login === selectedOwner &&
      repository.name === selectedRepo,
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await refreshRepositories();
    } catch (refreshError) {
      console.error("Failed to refresh repositories:", refreshError);
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleUseRepoReference() {
    const parsedReference = parseGitHubRepoReference(repoReference);
    if (!parsedReference) {
      setReferenceError(
        "Enter a GitHub URL like https://github.com/owner/repo or owner/repo.",
      );
      return;
    }

    setReferenceError(null);
    setRepoReference("");
    onSelect(parsedReference.owner, parsedReference.repo);
  }

  if (hasSelection) {
    return (
      <div className="flex items-center gap-0 overflow-hidden rounded-lg border border-border/70 dark:border-white/10">
        <div className="flex min-w-0 flex-1 items-center gap-2 bg-background/80 px-3 py-2.5 dark:bg-white/[0.03]">
          <GitHubIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {selectedOwner}/{selectedRepo}
          </span>
          {selectedRepository?.private && (
            <LockIcon className="size-3 shrink-0 text-muted-foreground" />
          )}
          {selectedRepository?.updated_at && (
            <span className="shrink-0 text-xs text-muted-foreground">
              · {formatRelativeDate(selectedRepository.updated_at)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSelect("", "")}
          className="shrink-0 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border/70 bg-background/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="size-4 text-muted-foreground" />
          Use a repo URL
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={repoReference}
            onChange={(event) => {
              setRepoReference(event.target.value);
              if (referenceError) {
                setReferenceError(null);
              }
            }}
            placeholder="https://github.com/owner/repo or owner/repo"
            className="flex-1"
          />
          <Button
            type="button"
            onClick={handleUseRepoReference}
            className="sm:self-start"
          >
            Use repo
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Paste any repository the server GitHub token can clone, including
          private repos.
        </p>
        {referenceError ? (
          <p className="mt-2 text-xs text-destructive">{referenceError}</p>
        ) : null}
      </div>

      <div className="flex items-stretch gap-0 overflow-hidden rounded-t-lg border border-border/70 dark:border-white/10">
        <div className="flex flex-1 items-center gap-2 bg-background/80 px-3 dark:bg-white/[0.03]">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search repositories your token can access..."
            value={repoSearch}
            onChange={(event) => setRepoSearch(event.target.value)}
            className="h-full w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {repoSearch ? (
            <button
              type="button"
              onClick={() => setRepoSearch("")}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Esc
            </button>
          ) : null}
        </div>
      </div>

      <div className="h-[280px] overflow-y-auto rounded-b-lg border border-t-0 border-border/70 dark:border-white/10">
        {isLoading ? (
          <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
            Loading repositories...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
            {error}
          </div>
        ) : repositories.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
            No repositories found.
          </div>
        ) : (
          <div className="divide-y divide-border/50 dark:divide-white/[0.06]">
            {repositories.map((repository) => (
              <div
                key={repository.full_name}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/30 dark:hover:bg-white/[0.03]"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {repository.full_name}
                    </span>
                    {repository.private ? (
                      <LockIcon className="size-3 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      · {formatRelativeDate(repository.updated_at)}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <GitBranch className="size-3 shrink-0" />
                    <span className="truncate">
                      {repository.description?.trim() || "No description"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelect(repository.owner.login, repository.name)
                  }
                  className="shrink-0 rounded-md border border-border/70 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent dark:border-white/20 dark:bg-white/[0.06] dark:hover:bg-white/10"
                >
                  Select
                </button>
              </div>
            ))}
            {repositories.length === 50 && !deferredRepoSearch ? (
              <div className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                Showing the 50 most recent repositories. Search to narrow or
                paste a URL above.
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 text-xs">
        <p className="text-muted-foreground">
          Local mode uses repositories visible to the server GitHub token.
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3", isRefreshing && "animate-spin")} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
