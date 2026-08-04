import { NextResponse } from "next/server";
import { getInstallationsByUserId } from "@/lib/db/installations";
import type { GitHubConnectionStatusResponse } from "@/lib/github/status";
import {
  isGitHubInstallationsAuthError,
  syncUserInstallations,
} from "@/lib/github/sync";
import { getUserGitHubToken } from "@/lib/github/token";
import { getGitHubUsername, hasGitHubAccount } from "@/lib/github/users";
import { getServerSession } from "@/lib/session/get-server-session";
import { isLocalDeployment } from "@/lib/deployment/mode";
import {
  getLocalGitHubToken,
  validateLocalGitHubToken,
} from "@/lib/github/local";

export async function GET() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (isLocalDeployment()) {
    const token = getLocalGitHubToken();
    if (!token) {
      return NextResponse.json({
        status: "not_connected",
        reason: null,
        hasInstallations: false,
        syncedInstallationsCount: 0,
      } satisfies GitHubConnectionStatusResponse);
    }

    const validation = await validateLocalGitHubToken();
    const connected = validation.status === "valid";
    return NextResponse.json({
      status: connected ? "connected" : "reconnect_required",
      reason: connected
        ? null
        : validation.status === "invalid"
          ? "local_token_invalid"
          : "local_github_unavailable",
      hasInstallations: connected,
      syncedInstallationsCount: connected ? 1 : null,
    } satisfies GitHubConnectionStatusResponse);
  }

  const [linked, installations] = await Promise.all([
    hasGitHubAccount(session.user.id),
    getInstallationsByUserId(session.user.id),
  ]);

  if (!linked) {
    return NextResponse.json({
      status: "not_connected",
      reason: null,
      hasInstallations: installations.length > 0,
      syncedInstallationsCount: installations.length,
    } satisfies GitHubConnectionStatusResponse);
  }

  const token = await getUserGitHubToken(session.user.id);
  if (!token) {
    return NextResponse.json({
      status: "reconnect_required",
      reason: "token_unavailable",
      hasInstallations: installations.length > 0,
      syncedInstallationsCount: null,
    } satisfies GitHubConnectionStatusResponse);
  }

  try {
    const username = await getGitHubUsername(session.user.id);
    if (!username) {
      return NextResponse.json({
        status: "reconnect_required",
        reason: "sync_auth_failed",
        hasInstallations: installations.length > 0,
        syncedInstallationsCount: null,
      } satisfies GitHubConnectionStatusResponse);
    }

    const syncedInstallationsCount = await syncUserInstallations(
      session.user.id,
      token,
      username,
    );
    const reconnectRequired =
      installations.length > 0 && syncedInstallationsCount === 0;

    return NextResponse.json({
      status: reconnectRequired ? "reconnect_required" : "connected",
      reason: reconnectRequired ? "installations_missing" : null,
      hasInstallations: syncedInstallationsCount > 0,
      syncedInstallationsCount,
    } satisfies GitHubConnectionStatusResponse);
  } catch (error) {
    if (isGitHubInstallationsAuthError(error)) {
      return NextResponse.json({
        status: "reconnect_required",
        reason: "sync_auth_failed",
        hasInstallations: installations.length > 0,
        syncedInstallationsCount: null,
      } satisfies GitHubConnectionStatusResponse);
    }

    console.error("Failed to validate GitHub connection status:", error);

    return NextResponse.json({
      status: "connected",
      reason: null,
      hasInstallations: installations.length > 0,
      syncedInstallationsCount: installations.length,
    } satisfies GitHubConnectionStatusResponse);
  }
}
