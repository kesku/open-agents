import { beforeEach, describe, expect, mock, test } from "bun:test";

const claimSessionGitMutationLease = mock(() => Promise.resolve(true));
const releaseSessionGitMutationLease = mock(() => Promise.resolve(true));

mock.module("@/lib/db/sessions", () => ({
  claimSessionGitMutationLease,
  releaseSessionGitMutationLease,
}));

const {
  SessionGitMutationBusyError,
  cleanupStaleGitIndexLock,
  withSessionGitMutation,
} = await import("./session-git-mutation");

describe("session git mutation lease", () => {
  beforeEach(() => {
    claimSessionGitMutationLease.mockClear();
    claimSessionGitMutationLease.mockImplementation(() =>
      Promise.resolve(true),
    );
    releaseSessionGitMutationLease.mockClear();
    releaseSessionGitMutationLease.mockImplementation(() =>
      Promise.resolve(true),
    );
  });

  test("runs the callback while holding a lease and releases it after", async () => {
    const exec = mock(() =>
      Promise.resolve({
        success: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
        truncated: false,
      }),
    );

    const result = await withSessionGitMutation(
      {
        sessionId: "session-1",
        leaseType: "generate-pr",
        sandbox: {
          exec: exec as never,
          workingDirectory: "/workspace",
        },
      },
      async () => "ok",
    );

    expect(result).toBe("ok");
    expect(claimSessionGitMutationLease).toHaveBeenCalledTimes(1);
    expect(releaseSessionGitMutationLease).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  test("releases the lease when the callback throws", async () => {
    const exec = mock(() =>
      Promise.resolve({
        success: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
        truncated: false,
      }),
    );

    await expect(
      withSessionGitMutation(
        {
          sessionId: "session-1",
          leaseType: "generate-pr",
          sandbox: {
            exec: exec as never,
            workingDirectory: "/workspace",
          },
        },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");

    expect(releaseSessionGitMutationLease).toHaveBeenCalledTimes(1);
  });

  test("throws a busy error when the lease cannot be claimed in time", async () => {
    claimSessionGitMutationLease.mockImplementation(() =>
      Promise.resolve(false),
    );

    await expect(
      withSessionGitMutation(
        {
          sessionId: "session-1",
          leaseType: "generate-pr",
          maxWaitMs: 0,
        },
        async () => "never",
      ),
    ).rejects.toBeInstanceOf(SessionGitMutationBusyError);

    expect(releaseSessionGitMutationLease).not.toHaveBeenCalled();
  });

  test("cleanupStaleGitIndexLock returns true only when the lock was removed", async () => {
    const removedExec = mock(() =>
      Promise.resolve({
        success: true,
        stdout: "__open_agents_removed_stale_index_lock__",
        stderr: "",
        exitCode: 0,
        truncated: false,
      }),
    );

    const keptExec = mock(() =>
      Promise.resolve({
        success: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
        truncated: false,
      }),
    );

    await expect(
      cleanupStaleGitIndexLock({
        exec: removedExec as never,
        workingDirectory: "/workspace",
      }),
    ).resolves.toBe(true);

    await expect(
      cleanupStaleGitIndexLock({
        exec: keptExec as never,
        workingDirectory: "/workspace",
      }),
    ).resolves.toBe(false);
  });
});
