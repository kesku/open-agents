import type { Sandbox } from "@open-harness/sandbox";
import {
  claimSessionGitMutationLease,
  releaseSessionGitMutationLease,
} from "@/lib/db/sessions";

const SESSION_GIT_MUTATION_LEASE_MS = 5 * 60 * 1000;
const SESSION_GIT_MUTATION_WAIT_MS = 15 * 1000;
const SESSION_GIT_MUTATION_POLL_MS = 500;
const STALE_GIT_INDEX_LOCK_AGE_SECONDS = 120;

type GitMutationSandbox = Pick<Sandbox, "exec" | "workingDirectory">;

export class SessionGitMutationBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionGitMutationBusyError";
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function cleanupStaleGitIndexLock(
  sandbox: GitMutationSandbox,
): Promise<boolean> {
  const cleanupCommand = [
    "if [ -f .git/index.lock ]; then",
    "  now=$(date +%s);",
    "  mtime=$(stat -c %Y .git/index.lock 2>/dev/null || stat -f %m .git/index.lock 2>/dev/null || echo 0);",
    "  age=$((now - mtime));",
    `  if [ "$age" -ge ${STALE_GIT_INDEX_LOCK_AGE_SECONDS} ]; then`,
    "    rm -f .git/index.lock;",
    "    echo '__open_agents_removed_stale_index_lock__';",
    "  fi;",
    "fi",
  ].join(" ");

  try {
    const result = await sandbox.exec(
      cleanupCommand,
      sandbox.workingDirectory,
      5000,
    );
    return (
      result.success &&
      result.stdout.includes("__open_agents_removed_stale_index_lock__")
    );
  } catch (error) {
    console.warn("[git-mutation] Failed to inspect stale index lock:", error);
    return false;
  }
}

export async function withSessionGitMutation<T>(
  params: {
    sessionId: string;
    leaseType: string;
    sandbox?: GitMutationSandbox;
    maxWaitMs?: number;
    busyMessage?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const leaseId = crypto.randomUUID();
  const maxWaitMs = params.maxWaitMs ?? SESSION_GIT_MUTATION_WAIT_MS;
  const deadline = Date.now() + maxWaitMs;

  while (true) {
    const claimed = await claimSessionGitMutationLease({
      sessionId: params.sessionId,
      leaseId,
      leaseType: params.leaseType,
      expiresAt: new Date(Date.now() + SESSION_GIT_MUTATION_LEASE_MS),
    });

    if (claimed) {
      try {
        if (params.sandbox) {
          const removedStaleLock = await cleanupStaleGitIndexLock(
            params.sandbox,
          );
          if (removedStaleLock) {
            console.warn(
              `[git-mutation] Removed stale .git/index.lock for session ${params.sessionId}`,
            );
          }
        }

        return await fn();
      } finally {
        await releaseSessionGitMutationLease(params.sessionId, leaseId).catch(
          (error) => {
            console.error(
              `[git-mutation] Failed to release git lease for session ${params.sessionId}:`,
              error,
            );
          },
        );
      }
    }

    if (Date.now() >= deadline) {
      throw new SessionGitMutationBusyError(
        params.busyMessage ??
          "Another git write is already running for this session. Wait for it to finish and try again.",
      );
    }

    await delay(SESSION_GIT_MUTATION_POLL_MS);
  }
}
