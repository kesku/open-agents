import "server-only";

interface GitHubRepoInfo {
  default_branch: string;
}

function getGitHubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function parseRepoInfo(value: unknown): GitHubRepoInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const defaultBranch = Reflect.get(value, "default_branch");
  if (typeof defaultBranch !== "string" || defaultBranch.trim().length === 0) {
    return null;
  }

  return { default_branch: defaultBranch.trim() };
}

async function fetchGitHubRepoInfo(params: {
  owner: string;
  repo: string;
  token: string;
}): Promise<GitHubRepoInfo | null> {
  const { owner, repo, token } = params;
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: getGitHubHeaders(token),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const data: unknown = await response.json();
  return parseRepoInfo(data);
}

async function doesGitHubBranchExist(params: {
  owner: string;
  repo: string;
  token: string;
  branch: string;
}): Promise<boolean | null> {
  const { owner, repo, token, branch } = params;
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    {
      headers: getGitHubHeaders(token),
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    return null;
  }

  return true;
}

export async function resolveGitHubBaseBranch(params: {
  owner: string;
  repo: string;
  token: string;
  requestedBranch: string;
}): Promise<string> {
  const { owner, repo, token, requestedBranch } = params;
  const trimmedRequestedBranch = requestedBranch.trim();

  if (!trimmedRequestedBranch) {
    const repoInfo = await fetchGitHubRepoInfo({ owner, repo, token });
    return repoInfo?.default_branch ?? requestedBranch;
  }

  const branchExists = await doesGitHubBranchExist({
    owner,
    repo,
    token,
    branch: trimmedRequestedBranch,
  });

  if (branchExists === true) {
    return trimmedRequestedBranch;
  }

  const repoInfo = await fetchGitHubRepoInfo({ owner, repo, token });
  return repoInfo?.default_branch ?? trimmedRequestedBranch;
}
