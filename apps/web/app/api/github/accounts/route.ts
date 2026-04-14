import { NextResponse } from "next/server";
import { fetchGitHubOrgs, fetchGitHubUser } from "@/lib/github/api";
import { getUserGitHubToken } from "@/lib/github/user-token";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "GitHub not connected" },
      { status: 401 },
    );
  }

  const token = await getUserGitHubToken(session.user.id);

  if (!token) {
    return NextResponse.json(
      { error: "GitHub not connected" },
      { status: 401 },
    );
  }

  try {
    const [user, orgs] = await Promise.all([
      fetchGitHubUser(token),
      fetchGitHubOrgs(token),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: "Failed to fetch GitHub accounts" },
        { status: 500 },
      );
    }

    return NextResponse.json([
      {
        login: user.login,
        accountType: "User" as const,
        avatarUrl: user.avatar_url,
      },
      ...(orgs ?? [])
        .slice()
        .sort((a, b) => a.login.localeCompare(b.login))
        .map((org) => ({
          login: org.login,
          accountType: "Organization" as const,
          avatarUrl: org.avatar_url,
        })),
    ]);
  } catch (error) {
    console.error("Error fetching GitHub accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch GitHub accounts" },
      { status: 500 },
    );
  }
}
