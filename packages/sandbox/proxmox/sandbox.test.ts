import { beforeEach, describe, expect, mock, test } from "bun:test";

const sshExecCalls: string[] = [];
let sshExecResult = {
  exitCode: 0,
  stdout: "12345",
  stderr: "",
};

mock.module("./ssh-client", () => ({
  SshClient: class MockSshClient {
    async exec(remoteCommand: string) {
      sshExecCalls.push(remoteCommand);
      return sshExecResult;
    }
  },
}));

const { ProxmoxLxcSandbox } = await import("./sandbox");

describe("ProxmoxLxcSandbox.execDetached", () => {
  beforeEach(() => {
    sshExecCalls.length = 0;
    sshExecResult = {
      exitCode: 0,
      stdout: "12345",
      stderr: "",
    };
  });

  test("builds a detached command without invalid shell chaining", async () => {
    const sandbox = await ProxmoxLxcSandbox.connect({
      host: "127.0.0.1",
      port: 22,
      sshUser: "root",
      workspacePath: "/workspace",
      leaseId: "lease-1",
      leasedAt: Date.now(),
      nodeId: "oa-1",
      expiresAt: Date.now() + 60_000,
    });

    const result = await sandbox.execDetached("echo hello", "/workspace");

    expect(result).toEqual({ commandId: "12345" });
    const detachedCall = sshExecCalls.at(-1);
    expect(detachedCall).toBeDefined();
    expect(detachedCall).not.toContain("& && echo $!");
    expect(detachedCall).toContain(
      "mkdir -p /tmp/open-harness-detached && (nohup sh -lc",
    );
    expect(detachedCall).toContain("& echo $!)");
  });
});

describe("ProxmoxLxcSandbox.environmentDetails", () => {
  test("mentions GitHub auth when a token is provided", async () => {
    const sandbox = await ProxmoxLxcSandbox.connect(
      {
        host: "127.0.0.1",
        port: 22,
        sshUser: "root",
        workspacePath: "/workspace",
        leaseId: "lease-1",
        leasedAt: Date.now(),
        nodeId: "oa-1",
        expiresAt: Date.now() + 60_000,
      },
      {
        githubToken: "github-token",
      },
    );

    expect(sandbox.environmentDetails).toContain("GH_TOKEN");
    expect(sandbox.environmentDetails).toContain("GITHUB_TOKEN");
    expect(sandbox.environmentDetails).toContain("Prefer `gh`");
  });
});

describe("ProxmoxLxcSandbox command environment", () => {
  test("exports GitHub auth env for the full remote shell command", async () => {
    const sandbox = await ProxmoxLxcSandbox.connect(
      {
        host: "127.0.0.1",
        port: 22,
        sshUser: "root",
        workspacePath: "/workspace",
        leaseId: "lease-1",
        leasedAt: Date.now(),
        nodeId: "oa-1",
        expiresAt: Date.now() + 60_000,
      },
      {
        githubToken: "github-token",
      },
    );

    await sandbox.exec("printf '%s' \"$GH_TOKEN\"", "/workspace", 30_000);

    const execCall = sshExecCalls.at(-1);
    expect(execCall).toBeDefined();
    expect(execCall).toContain("export GITHUB_TOKEN=");
    expect(execCall).toContain("GH_TOKEN=");
    expect(execCall).toContain("; cd ");
    expect(execCall).not.toContain("GH_TOKEN='\\''github-token'\\'' cd ");
  });
});
