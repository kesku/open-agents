const GITHUB_REPO_PATH_SEGMENT_PATTERN = /^[.\w-]+$/;
const GITHUB_REPO_REFERENCE_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([.\w-]+)\/([.\w-]+?)(?:\.git)?(?:[/?#].*)?$/i;
const GITHUB_SSH_REFERENCE_PATTERN =
  /^git@github\.com:([.\w-]+)\/([.\w-]+?)(?:\.git)?$/i;

export function isValidGitHubRepoOwner(owner: string): boolean {
  return GITHUB_REPO_PATH_SEGMENT_PATTERN.test(owner);
}

export function isValidGitHubRepoName(repoName: string): boolean {
  return GITHUB_REPO_PATH_SEGMENT_PATTERN.test(repoName);
}

export function parseGitHubRepoReference(
  value: string,
): { owner: string; repo: string } | null {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  const bareSegments = normalizedValue.split("/");
  if (bareSegments.length === 2) {
    const [owner, repo] = bareSegments;
    if (
      owner &&
      repo &&
      isValidGitHubRepoOwner(owner) &&
      isValidGitHubRepoName(repo)
    ) {
      return { owner, repo };
    }
  }

  const match =
    normalizedValue.match(GITHUB_REPO_REFERENCE_PATTERN) ??
    normalizedValue.match(GITHUB_SSH_REFERENCE_PATTERN);

  const owner = match?.[1];
  const repo = match?.[2];

  if (
    !owner ||
    !repo ||
    !isValidGitHubRepoOwner(owner) ||
    !isValidGitHubRepoName(repo)
  ) {
    return null;
  }

  return { owner, repo };
}

export function buildGitHubAuthRemoteUrl(params: {
  token: string;
  owner: string;
  repo: string;
}): string | null {
  const { token, owner, repo } = params;

  if (!isValidGitHubRepoOwner(owner) || !isValidGitHubRepoName(repo)) {
    return null;
  }

  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git`;
}
