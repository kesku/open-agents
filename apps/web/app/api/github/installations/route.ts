import { NextResponse } from "next/server";
import { getInstallationsByUserId } from "@/lib/db/installations";
import { getInstallationManageUrl } from "@/lib/github/urls";
import { getServerSession } from "@/lib/session/get-server-session";
import { isLocalDeployment } from "@/lib/deployment/mode";
import { listLocalGitHubAccounts } from "@/lib/github/local";

export async function GET() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    if (isLocalDeployment()) {
      const accounts = await listLocalGitHubAccounts();
      return NextResponse.json(
        accounts.map((account) => ({
          installationId: account.githubId,
          accountLogin: account.login,
          accountType: account.accountType,
          repositorySelection: "all" as const,
          installationUrl: null,
        })),
      );
    }

    const installations = await getInstallationsByUserId(session.user.id);

    return NextResponse.json(
      installations.map((installation) => ({
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        repositorySelection: installation.repositorySelection,
        installationUrl: getInstallationManageUrl(
          installation.installationId,
          installation.installationUrl,
        ),
      })),
    );
  } catch (error) {
    console.error("Failed to fetch GitHub installations:", error);
    return NextResponse.json(
      { error: "Failed to fetch installations" },
      { status: 500 },
    );
  }
}
