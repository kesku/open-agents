import { NextRequest, NextResponse } from "next/server";
import { fetchAccessibleGitHubRepositories } from "@/lib/github/api";
import { isValidGitHubRepoOwner } from "@/lib/github/repo-identifiers";
import { getUserGitHubToken } from "@/lib/github/user-token";
import { getServerSession } from "@/lib/session/get-server-session";

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const ownerParam = searchParams.get("owner")?.trim();
  const query = searchParams.get("query")?.trim() || undefined;
  const limit = parseLimit(searchParams.get("limit"));

  if (ownerParam && !isValidGitHubRepoOwner(ownerParam)) {
    return NextResponse.json(
      { error: "Invalid repository owner" },
      { status: 400 },
    );
  }

  try {
    const repositories = await fetchAccessibleGitHubRepositories(token, {
      owner: ownerParam,
      query,
      limit,
    });

    if (!repositories) {
      return NextResponse.json(
        { error: "Failed to fetch repositories" },
        { status: 500 },
      );
    }

    return NextResponse.json(repositories);
  } catch (error) {
    console.error("Error fetching GitHub repositories:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 },
    );
  }
}
