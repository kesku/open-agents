import "server-only";
import { getInstallationsByUserId } from "@/lib/db/installations";
import { isLocalDeployment } from "@/lib/deployment/mode";
import { hasGitHubAccount } from "@/lib/github/users";

/**
 * Check whether a user needs to go through onboarding.
 * Returns true when GitHub account is not linked or no installations exist.
 */
export async function needsOnboarding(userId: string): Promise<boolean> {
  if (isLocalDeployment()) {
    return false;
  }

  const [linked, installations] = await Promise.all([
    hasGitHubAccount(userId),
    getInstallationsByUserId(userId),
  ]);

  return !linked || installations.length === 0;
}
