import "server-only";

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

interface GitHubOrg {
  login: string;
  avatar_url: string;
}

interface GitHubBranch {
  name: string;
}

interface GitHubRepoInfo {
  default_branch: string;
}

interface GitHubRepositoryOwner {
  login: string;
}

interface GitHubRepository {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  clone_url: string;
  updated_at: string;
  language: string | null;
  owner: GitHubRepositoryOwner;
}

export interface GitHubRepositorySummary {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  clone_url: string;
  updated_at: string;
  language: string | null;
  owner: GitHubRepositoryOwner;
}

const ACCESSIBLE_REPOS_MAX_PAGES = 20;

function normalizeGitHubLimit(limit: number | undefined): number | undefined {
  return typeof limit === "number" && Number.isFinite(limit)
    ? Math.max(1, Math.min(limit, 100))
    : undefined;
}

async function fetchGitHubAPI<T>(
  endpoint: string,
  token: string,
): Promise<T | null> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<T>;
}

export async function fetchGitHubUser(token: string) {
  const user = await fetchGitHubAPI<GitHubUser>("/user", token);
  if (!user) return null;

  return {
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
  };
}

export async function fetchGitHubOrgs(token: string) {
  const orgs = await fetchGitHubAPI<GitHubOrg[]>("/user/orgs", token);
  if (!orgs) return null;

  return orgs.map((org) => ({
    login: org.login,
    name: org.login,
    avatar_url: org.avatar_url,
  }));
}

export async function fetchGitHubBranches(
  token: string,
  owner: string,
  repo: string,
  limit?: number,
) {
  // Fetch repo info for default branch
  const repoInfo = await fetchGitHubAPI<GitHubRepoInfo>(
    `/repos/${owner}/${repo}`,
    token,
  );
  if (!repoInfo) return null;

  const defaultBranch = repoInfo.default_branch;
  const normalizedLimit = normalizeGitHubLimit(limit);

  // Fetch branches with pagination only when needed
  const allBranches: string[] = [];
  let page = 1;
  const perPage = normalizedLimit ?? 100;
  const maxPages = normalizedLimit ? 1 : 50;

  while (page <= maxPages) {
    const branches = await fetchGitHubAPI<GitHubBranch[]>(
      `/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`,
      token,
    );

    if (!branches) {
      // API error on first page means failure; on subsequent pages, return what we have
      if (page === 1) return null;
      break;
    }
    if (branches.length === 0) break;

    allBranches.push(...branches.map((b) => b.name));
    if (normalizedLimit && allBranches.length >= normalizedLimit) {
      break;
    }
    if (branches.length < perPage) break;
    page++;
  }

  if (normalizedLimit && !allBranches.includes(defaultBranch)) {
    allBranches.push(defaultBranch);
  }

  // Sort with default branch first
  allBranches.sort((a, b) => {
    if (a === defaultBranch) return -1;
    if (b === defaultBranch) return 1;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  return {
    branches: normalizedLimit
      ? allBranches.slice(0, normalizedLimit)
      : allBranches,
    defaultBranch,
  };
}

interface FetchAccessibleGitHubRepositoriesOptions {
  owner?: string;
  query?: string;
  limit?: number;
}

export async function fetchAccessibleGitHubRepositories(
  token: string,
  options?: FetchAccessibleGitHubRepositoriesOptions,
): Promise<GitHubRepositorySummary[] | null> {
  const ownerFilter = options?.owner?.trim().toLowerCase();
  const queryFilter = options?.query?.trim().toLowerCase();
  const normalizedLimit = normalizeGitHubLimit(options?.limit) ?? 50;
  const allMatches: GitHubRepositorySummary[] = [];

  const perPage = 100;

  for (let page = 1; page <= ACCESSIBLE_REPOS_MAX_PAGES; page += 1) {
    const repositories = await fetchGitHubAPI<GitHubRepository[]>(
      `/user/repos?sort=updated&direction=desc&affiliation=owner,collaborator,organization_member&per_page=${perPage}&page=${page}`,
      token,
    );

    if (!repositories) {
      return page === 1 ? null : allMatches;
    }

    if (repositories.length === 0) {
      break;
    }

    const pageMatches = repositories.filter((repository) => {
      const matchesOwner = ownerFilter
        ? repository.owner.login.toLowerCase() === ownerFilter
        : true;
      const matchesQuery = queryFilter
        ? repository.full_name.toLowerCase().includes(queryFilter) ||
          repository.name.toLowerCase().includes(queryFilter)
        : true;

      return matchesOwner && matchesQuery;
    });

    allMatches.push(...pageMatches);

    if (allMatches.length >= normalizedLimit) {
      break;
    }

    if (repositories.length < perPage) {
      break;
    }
  }

  return allMatches.slice(0, normalizedLimit);
}
