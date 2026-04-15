import { connectSandbox } from "@open-harness/sandbox";
import { runCreateRepoWorkflow } from "@/app/api/github/create-repo/_lib/create-repo-workflow";
import { getGitHubAccount } from "@/lib/db/accounts";
import {
  getSessionById,
  hasActiveChatStreamsInSession,
  updateSession,
} from "@/lib/db/sessions";
import { SessionGitMutationBusyError } from "@/lib/git/session-git-mutation";
import { getUserGitHubToken } from "@/lib/github/user-token";
import { isSandboxActive } from "@/lib/sandbox/utils";
import { getServerSession } from "@/lib/session/get-server-session";

// Allow up to 2 minutes for git operations
export const maxDuration = 120;

interface CreateRepoRequest {
  sessionId: string;
  repoName: string;
  description?: string;
  isPrivate?: boolean;
  sessionTitle: string;
  /** The account login to create the repo under (org name or username) */
  owner?: string;
}

export async function POST(req: Request) {
  // 1. Validate session
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2. Parse request
  let body: CreateRepoRequest;
  try {
    body = (await req.json()) as CreateRepoRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, repoName, description, isPrivate, sessionTitle, owner } =
    body;

  if (!sessionId) {
    return Response.json({ error: "Session ID is required" }, { status: 400 });
  }
  if (!repoName) {
    return Response.json(
      { error: "Repository name is required" },
      { status: 400 },
    );
  }

  // 3. Verify session ownership
  const sessionRecord = await getSessionById(sessionId);
  if (!sessionRecord) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  if (sessionRecord.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Session should not already have a repo
  if (sessionRecord.cloneUrl) {
    return Response.json(
      { error: "Session already has a repository" },
      { status: 400 },
    );
  }

  if (!isSandboxActive(sessionRecord.sandboxState)) {
    return Response.json({ error: "Sandbox not initialized" }, { status: 400 });
  }

  if (await hasActiveChatStreamsInSession(sessionId)) {
    return Response.json(
      {
        error:
          "Wait for the active agent run in this session to finish before creating a repository.",
      },
      { status: 409 },
    );
  }

  // 4. Resolve GitHub OAuth token for repo creation
  const githubAccount = await getGitHubAccount(session.user.id);
  const repoToken = await getUserGitHubToken(session.user.id);

  if (!repoToken) {
    return Response.json({ error: "GitHub not connected" }, { status: 401 });
  }

  const githubUsername = githubAccount?.username?.trim();
  let accountType: "User" | "Organization" | undefined;

  if (owner) {
    accountType =
      githubUsername && owner.toLowerCase() === githubUsername.toLowerCase()
        ? "User"
        : "Organization";
  }

  // 5. Connect to sandbox
  const sandbox = await connectSandbox(sessionRecord.sandboxState);
  const cwd = sandbox.workingDirectory;

  let workflowResult;
  try {
    workflowResult = await runCreateRepoWorkflow({
      sessionId,
      sandbox,
      cwd,
      repoName,
      description,
      isPrivate,
      sessionTitle,
      owner,
      accountType,
      repoToken,
      sessionUser: {
        id: session.user.id,
        username: session.user.username,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
      },
    });
  } catch (error) {
    if (error instanceof SessionGitMutationBusyError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    throw error;
  }
  if (!workflowResult.ok) {
    return workflowResult.response;
  }

  // 16. Update session with new repo info
  await updateSession(sessionId, {
    repoOwner: workflowResult.owner,
    repoName: workflowResult.repoName,
    cloneUrl: `https://github.com/${workflowResult.owner}/${workflowResult.repoName}`,
    branch: workflowResult.branch,
    isNewBranch: false,
  });

  // 17. Return success response
  return Response.json({
    success: true,
    repoUrl: workflowResult.repoUrl,
    cloneUrl: workflowResult.cloneUrl,
    owner: workflowResult.owner,
    repoName: workflowResult.repoName,
    branch: workflowResult.branch,
  });
}
