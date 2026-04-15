"use client";

import { useState } from "react";
import { LocalGitHubRepoSelector } from "@/components/local-github-repo-selector";
import { useSession } from "@/hooks/use-session";

export function RepoSelector({
  onRepoSelect,
}: {
  onRepoSelect: (owner: string, repo: string) => void;
}) {
  const { hasGitHub, loading } = useSession();
  const [selectedOwner, setSelectedOwner] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");

  if (loading) {
    return (
      <div className="rounded-lg border border-border/70 px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/10">
        Loading GitHub access…
      </div>
    );
  }

  if (!hasGitHub) {
    return (
      <div className="rounded-lg border border-border/70 px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/10">
        Configure LOCAL_GITHUB_ACCESS_TOKEN on the server to browse
        repositories.
      </div>
    );
  }

  return (
    <LocalGitHubRepoSelector
      selectedOwner={selectedOwner}
      selectedRepo={selectedRepo}
      onSelect={(owner, repo) => {
        setSelectedOwner(owner);
        setSelectedRepo(repo);
        onRepoSelect(owner, repo);
      }}
    />
  );
}
