"use client";

import { Github } from "lucide-react";
import Link from "next/link";
import { LocalGitHubRepoSelector } from "@/components/local-github-repo-selector";
import { useSession } from "@/hooks/use-session";

interface RepoSelectorCompactProps {
  selectedOwner: string;
  selectedRepo: string;
  onSelect: (owner: string, repo: string) => void;
}

function GitHubActionCard({
  title,
  description,
  buttonLabel,
  buttonHref,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  buttonHref: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border/70 px-4 py-6 text-center dark:border-white/10">
      <Github className="size-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Link
        href={buttonHref}
        className="rounded-md bg-neutral-200 px-4 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-300"
      >
        {buttonLabel}
      </Link>
    </div>
  );
}

export function RepoSelectorCompact({
  selectedOwner,
  selectedRepo,
  onSelect,
}: RepoSelectorCompactProps) {
  const { hasGitHub, loading } = useSession();

  if (loading) {
    return (
      <div className="rounded-lg border border-border/70 px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/10">
        Loading GitHub access…
      </div>
    );
  }

  if (!hasGitHub) {
    return (
      <GitHubActionCard
        title="GitHub token not configured"
        description="Add LOCAL_GITHUB_ACCESS_TOKEN on the server to browse repositories or paste a repo URL."
        buttonLabel="Connections"
        buttonHref="/settings/connections"
      />
    );
  }

  return (
    <LocalGitHubRepoSelector
      selectedOwner={selectedOwner}
      selectedRepo={selectedRepo}
      onSelect={onSelect}
    />
  );
}
