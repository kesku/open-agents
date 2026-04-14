"use client";

import useSWR from "swr";
import { z } from "zod";
import { fetcher } from "@/lib/swr";

const githubAccountSchema = z.object({
  login: z.string(),
  accountType: z.enum(["User", "Organization"]),
  avatarUrl: z.string().nullable(),
});

const githubAccountsSchema = z.array(githubAccountSchema);

export type GitHubAccountOption = z.infer<typeof githubAccountSchema>;

async function fetchGitHubAccounts(
  url: string,
): Promise<GitHubAccountOption[]> {
  const json = await fetcher<unknown>(url);
  const parsed = githubAccountsSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Invalid GitHub accounts response");
  }

  return parsed.data;
}

export function useGitHubAccounts(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<GitHubAccountOption[]>(
    enabled ? "/api/github/accounts" : null,
    fetchGitHubAccounts,
    {
      dedupingInterval: 10_000,
    },
  );

  return {
    accounts: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: mutate,
  };
}
