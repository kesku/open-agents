import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { userExists } from "@/lib/db/users";
import {
  getGitHubConnectionModeForUser,
  getLocalGitHubAccessToken,
} from "@/lib/github/local-github";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { getSessionFromReq } from "@/lib/session/server";
import type { SessionUserInfo } from "@/lib/session/types";

const UNAUTHENTICATED: SessionUserInfo = { user: undefined };

export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req);

  if (!session?.user?.id) {
    return Response.json(UNAUTHENTICATED);
  }

  const exists = await userExists(session.user.id);

  // The session cookie (JWE) is self-contained and can outlive the user record.
  // If the user no longer exists, clear the stale cookie.
  if (!exists) {
    const store = await cookies();
    store.delete(SESSION_COOKIE_NAME);
    return Response.json(UNAUTHENTICATED);
  }

  const hasGitHub = getLocalGitHubAccessToken(session.user.id) !== null;
  const githubConnectionMode =
    hasGitHub && session.user.id
      ? (getGitHubConnectionModeForUser(session.user.id) ?? undefined)
      : undefined;

  const data: SessionUserInfo = {
    user: session.user,
    authProvider: session.authProvider,
    hasGitHub,
    hasGitHubAccount: hasGitHub,
    hasGitHubInstallations: false,
    githubConnectionMode,
  };

  return Response.json(data);
}
