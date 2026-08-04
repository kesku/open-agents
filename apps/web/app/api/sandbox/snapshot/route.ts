import { connectSandbox } from "@open-agents/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSession,
  requireOwnedSessionWithSandboxGuard,
} from "@/app/api/sessions/_lib/session-context";
import { updateSession } from "@/lib/db/sessions";
import {
  buildHibernatedLifecycleUpdate,
  getNextLifecycleVersion,
} from "@/lib/sandbox/lifecycle";
import { provisionSessionSandbox } from "@/lib/sandbox/provisioning";
import {
  canOperateOnSandbox,
  clearSandboxState,
  getResumableSandboxName,
  hasRuntimeSandboxState,
} from "@/lib/sandbox/utils";

interface CreateSnapshotRequest {
  sessionId: string;
}

interface RestoreSnapshotRequest {
  sessionId: string;
}

/**
 * POST - Compatibility pause endpoint.
 * Stops the current persistent sandbox session and preserves resumability via sandboxName.
 */
export async function POST(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: CreateSnapshotRequest;
  try {
    body = (await req.json()) as CreateSnapshotRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId } = body;

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const sessionContext = await requireOwnedSessionWithSandboxGuard({
    userId: authResult.userId,
    sessionId,
    sandboxGuard: canOperateOnSandbox,
    sandboxErrorMessage: "Sandbox not initialized",
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;
  const sandboxState = sessionRecord.sandboxState;
  if (!sandboxState) {
    return Response.json({ error: "Sandbox not initialized" }, { status: 400 });
  }

  try {
    const sandbox = await connectSandbox(sandboxState);
    await sandbox.stop();

    const clearedState = clearSandboxState(sessionRecord.sandboxState);
    await updateSession(sessionId, {
      snapshotUrl: null,
      snapshotCreatedAt: null,
      sandboxState: clearedState,
      lifecycleVersion: getNextLifecycleVersion(sessionRecord.lifecycleVersion),
      ...buildHibernatedLifecycleUpdate(),
    });

    return Response.json({
      snapshotId:
        getResumableSandboxName(clearedState) ??
        sessionRecord.snapshotUrl ??
        null,
      createdAt: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to pause sandbox: ${message}` },
      { status: 500 },
    );
  }
}

/**
 * PUT - Compatibility resume endpoint.
 * Resumes a named persistent sandbox, or lazily migrates a legacy snapshot-backed session.
 */
export async function PUT(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: RestoreSnapshotRequest;
  try {
    body = (await req.json()) as RestoreSnapshotRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId } = body;

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const sessionContext = await requireOwnedSession({
    userId: authResult.userId,
    sessionId,
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;
  if (hasRuntimeSandboxState(sessionRecord.sandboxState)) {
    const restoredFrom =
      getResumableSandboxName(sessionRecord.sandboxState) ??
      sessionRecord.snapshotUrl ??
      undefined;
    console.log(`[Sandbox Resume] session=${sessionId} already_running=true`);
    return Response.json({
      success: true,
      alreadyRunning: true,
      restoredFrom,
    });
  }

  const persistentSandboxName = getResumableSandboxName(
    sessionRecord.sandboxState,
  );
  if (!persistentSandboxName) {
    console.error(
      `[Sandbox Resume] session=${sessionId} error=no_resume_state`,
    );
    return Response.json(
      { error: "No sandbox available for resume" },
      { status: 404 },
    );
  }

  try {
    const result = await provisionSessionSandbox({
      sessionId,
      userId: authResult.userId,
    });
    console.log(
      `[Sandbox Resume] session=${sessionId} success=true sandboxName=${getResumableSandboxName(result.sandboxState) ?? "unknown"}`,
    );

    return Response.json({
      success: true,
      restoredFrom: persistentSandboxName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[Sandbox Resume] session=${sessionId} success=false error=${message}`,
    );
    return Response.json(
      { error: `Failed to restore snapshot: ${message}` },
      { status: 500 },
    );
  }
}
