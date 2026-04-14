"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { z } from "zod";
import { fetcher } from "@/lib/swr";

const accessibleGitHubRepositorySchema = z.object({
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
  clone_url: z.string().url(),
  updated_at: z.string(),
  language: z.string().nullable(),
  owner: z.object({
    login: z.string(),
  }),
});

const accessibleGitHubRepositoriesSchema = z.array(
  accessibleGitHubRepositorySchema,
);

export type AccessibleGitHubRepository = z.infer<
  typeof accessibleGitHubRepositorySchema
>;

interface UseAccessibleGitHubRepositoriesOptions {
  enabled?: boolean;
  owner?: string;
  query?: string;
  limit?: number;
}

async function fetchAccessibleGitHubRepositories(
  url: string,
): Promise<AccessibleGitHubRepository[]> {
  const json = await fetcher<unknown>(url);
  const parsed = accessibleGitHubRepositoriesSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Invalid GitHub repositories response");
  }

  return parsed.data;
}

export function useAccessibleGitHubRepositories({
  enabled = true,
  owner,
  query,
  limit = 50,
}: UseAccessibleGitHubRepositoriesOptions) {
  const repositoriesUrl = useMemo(() => {
    if (!enabled) {
      return null;
    }

    const params = new URLSearchParams({
      limit: `${limit}`,
    });

    const normalizedOwner = owner?.trim();
    if (normalizedOwner) {
      params.set("owner", normalizedOwner);
    }

    const normalizedQuery = query?.trim();
    if (normalizedQuery) {
      params.set("query", normalizedQuery);
    }

    return `/api/github/repos?${params.toString()}`;
  }, [enabled, limit, owner, query]);

  const { data, error, isLoading, mutate } = useSWR<
    AccessibleGitHubRepository[]
  >(repositoriesUrl, fetchAccessibleGitHubRepositories, {
    dedupingInterval: 5_000,
  });

  const refresh = useCallback(async () => {
    if (!repositoriesUrl) {
      return undefined;
    }

    const refreshUrl = `${repositoriesUrl}&refresh=1`;
    const freshRepositories =
      await fetchAccessibleGitHubRepositories(refreshUrl);
    await mutate(freshRepositories, { revalidate: false });

    return freshRepositories;
  }, [repositoriesUrl, mutate]);

  return {
    repositories: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh,
  };
}
