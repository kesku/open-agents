import "server-only";
import { getLocalGitHubAccessToken } from "@/lib/github/local-github";
import { getServerSession } from "@/lib/session/get-server-session";

export async function getUserGitHubToken(
  userId?: string,
): Promise<string | null> {
  const resolvedUserId = userId ?? (await getServerSession())?.user?.id;
  if (!resolvedUserId) {
    return null;
  }

  return getLocalGitHubAccessToken(resolvedUserId);
}
