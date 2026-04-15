import "server-only";
import { LOCAL_WORKSPACE_USER_ID } from "@/lib/session/local-workspace-user";

const LOCAL_GITHUB_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

export type GitHubConnectionMode = "oauth-app" | "local-token";

export interface LocalGitHubProfile {
  githubId: number;
  login: string;
  avatarUrl: string;
  name?: string | null;
}

let cachedLocalGitHubProfile: LocalGitHubProfile | null = null;
let cachedLocalGitHubProfileExpiresAt = 0;
let inflightLocalGitHubProfilePromise: Promise<LocalGitHubProfile | null> | null =
  null;

function getOptionalEnvString(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function canUseLocalGitHubForUser(userId?: string): boolean {
  const localToken = getOptionalEnvString("LOCAL_GITHUB_ACCESS_TOKEN");
  if (!localToken) {
    return false;
  }

  if (!userId) {
    return true;
  }

  return userId === LOCAL_WORKSPACE_USER_ID;
}

function buildFallbackAvatarUrl(githubId: number | undefined, login: string) {
  if (githubId && Number.isFinite(githubId) && githubId > 0) {
    return `https://avatars.githubusercontent.com/u/${githubId}?v=4`;
  }

  return `https://github.com/${login}.png`;
}

async function fetchLocalGitHubProfileFromApi(
  token: string,
): Promise<LocalGitHubProfile | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      id?: unknown;
      login?: unknown;
      avatar_url?: unknown;
      name?: unknown;
    };

    if (
      typeof data.id !== "number" ||
      !Number.isFinite(data.id) ||
      data.id <= 0 ||
      typeof data.login !== "string" ||
      data.login.trim().length === 0
    ) {
      return null;
    }

    return {
      githubId: data.id,
      login: data.login.trim(),
      avatarUrl:
        typeof data.avatar_url === "string" && data.avatar_url.trim().length > 0
          ? data.avatar_url
          : buildFallbackAvatarUrl(data.id, data.login.trim()),
      name: typeof data.name === "string" ? data.name : null,
    };
  } catch {
    return null;
  }
}

export function getLocalGitHubAccessToken(userId?: string): string | null {
  if (!canUseLocalGitHubForUser(userId)) {
    return null;
  }

  return getOptionalEnvString("LOCAL_GITHUB_ACCESS_TOKEN") ?? null;
}

export function getGitHubConnectionModeForUser(
  userId?: string,
): GitHubConnectionMode | null {
  return getLocalGitHubAccessToken(userId) ? "local-token" : null;
}

export async function getLocalGitHubProfile(
  userId?: string,
): Promise<LocalGitHubProfile | null> {
  const token = getLocalGitHubAccessToken(userId);
  if (!token) {
    return null;
  }

  const now = Date.now();
  if (cachedLocalGitHubProfile && cachedLocalGitHubProfileExpiresAt > now) {
    return cachedLocalGitHubProfile;
  }

  if (inflightLocalGitHubProfilePromise) {
    return inflightLocalGitHubProfilePromise;
  }

  inflightLocalGitHubProfilePromise = (async () => {
    const profile = await fetchLocalGitHubProfileFromApi(token);
    if (!profile) {
      return null;
    }

    cachedLocalGitHubProfile = profile;
    cachedLocalGitHubProfileExpiresAt =
      Date.now() + LOCAL_GITHUB_PROFILE_CACHE_TTL_MS;
    return profile;
  })();

  try {
    return await inflightLocalGitHubProfilePromise;
  } finally {
    inflightLocalGitHubProfilePromise = null;
  }
}
