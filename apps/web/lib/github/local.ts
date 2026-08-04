import "server-only";

import { z } from "zod";

export const LOCAL_GITHUB_INSTALLATION_ID = -1;

const LOCAL_GITHUB_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

const githubUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  avatar_url: z.string(),
  name: z.string().nullable().optional(),
});

const githubOrgSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  avatar_url: z.string(),
});

export interface LocalGitHubAccount {
  githubId: number;
  login: string;
  avatarUrl: string;
  accountType: "User" | "Organization";
}

export interface LocalGitHubProfile extends LocalGitHubAccount {
  accountType: "User";
  name: string | null;
}

export type LocalGitHubValidation =
  | { status: "not_configured" | "invalid" | "unavailable" }
  | { status: "valid"; profile: LocalGitHubProfile };

let cachedValidation:
  | { token: string; expiresAt: number; result: LocalGitHubValidation }
  | undefined;

export function getLocalGitHubToken(): string | null {
  const token = process.env.LOCAL_GITHUB_ACCESS_TOKEN?.trim();
  return token || null;
}

export function isLocalGitHubToken(token: string): boolean {
  const localToken = getLocalGitHubToken();
  return localToken !== null && token === localToken;
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function validateLocalGitHubToken(): Promise<LocalGitHubValidation> {
  const token = getLocalGitHubToken();
  if (!token) return { status: "not_configured" };

  const now = Date.now();
  if (cachedValidation?.token === token && cachedValidation.expiresAt > now) {
    return cachedValidation.result;
  }

  let result: LocalGitHubValidation = { status: "unavailable" };
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: githubHeaders(token),
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      result = { status: "invalid" };
    } else if (response.ok) {
      const parsed = githubUserSchema.safeParse(await response.json());
      if (parsed.success) {
        result = {
          status: "valid",
          profile: {
            githubId: parsed.data.id,
            login: parsed.data.login,
            avatarUrl: parsed.data.avatar_url,
            accountType: "User",
            name: parsed.data.name ?? null,
          },
        };
      }
    }
  } catch {
    result = { status: "unavailable" };
  }

  cachedValidation = {
    token,
    expiresAt: now + LOCAL_GITHUB_PROFILE_CACHE_TTL_MS,
    result,
  };
  return result;
}

export async function getLocalGitHubProfile(): Promise<LocalGitHubProfile | null> {
  const validation = await validateLocalGitHubToken();
  return validation.status === "valid" ? validation.profile : null;
}

export async function listLocalGitHubAccounts(): Promise<LocalGitHubAccount[]> {
  const token = getLocalGitHubToken();
  const profile = await getLocalGitHubProfile();
  if (!token || !profile) return [];

  let organizations: LocalGitHubAccount[] = [];
  try {
    const response = await fetch(
      "https://api.github.com/user/orgs?per_page=100",
      {
        headers: githubHeaders(token),
        cache: "no-store",
      },
    );
    if (response.ok) {
      const parsed = z.array(githubOrgSchema).safeParse(await response.json());
      if (parsed.success) {
        organizations = parsed.data.map((organization) => ({
          githubId: organization.id,
          login: organization.login,
          avatarUrl: organization.avatar_url,
          accountType: "Organization" as const,
        }));
      }
    }
  } catch {
    organizations = [];
  }

  return [
    profile,
    ...organizations.sort((a, b) => a.login.localeCompare(b.login)),
  ];
}

export function resetLocalGitHubProfileCache(): void {
  cachedValidation = undefined;
}
