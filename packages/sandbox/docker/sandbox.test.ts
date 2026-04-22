import { beforeEach, describe, expect, mock, test } from "bun:test";

const dockerExecCalls: Array<{
  args: string[];
  input?: string;
}> = [];

mock.module("./client", () => ({
  DockerClient: class MockDockerClient {
    async exec(args: string[], options?: { input?: string }) {
      dockerExecCalls.push({ args, input: options?.input });

      const command = args.at(-1) ?? "";
      if (command === "test -e '/workspace/.git'") {
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
        };
      }

      return {
        exitCode: 0,
        stdout: "12345",
        stderr: "",
      };
    }

    async inspectContainer(name: string) {
      return {
        id: "container-1",
        name,
        state: { running: true, status: "running" },
        config: { labels: {} },
        networkSettings: { networks: {} },
      };
    }

    async removeContainer() {}
  },
}));

const { DockerContainerSandbox } = await import("./sandbox");

describe("DockerContainerSandbox.execDetached", () => {
  beforeEach(() => {
    dockerExecCalls.length = 0;
  });

  test("builds a detached command without invalid shell chaining", async () => {
    const sandbox = await DockerContainerSandbox.connect({
      containerName: "open-agents-oa-123",
      workspaceHostPath: "/var/lib/open-agents/workspaces/oa-123",
      routeSlug: "oa-123",
      domainSuffix: "sandboxes.example.test",
      workingDirectory: "/workspace",
    });

    const result = await sandbox.execDetached("echo hello", "/workspace");

    expect(result).toEqual({ commandId: "12345" });
    const detachedCall = dockerExecCalls.at(-1);
    expect(detachedCall).toBeDefined();
    expect(detachedCall?.args).toContain("exec");
    expect(detachedCall?.args).toContain("sh");
    expect(detachedCall?.args.at(-1)).not.toContain("& && echo $!");
    expect(detachedCall?.args.at(-1)).toContain(
      "mkdir -p /tmp/open-harness-detached && (nohup sh -lc",
    );
    expect(detachedCall?.args.at(-1)).toContain("& echo $!)");
  });
});

describe("DockerContainerSandbox.environmentDetails", () => {
  test("mentions GitHub auth and preview URLs when configured", async () => {
    const sandbox = await DockerContainerSandbox.connect(
      {
        containerName: "open-agents-oa-123",
        workspaceHostPath: "/var/lib/open-agents/workspaces/oa-123",
        routeSlug: "oa-123",
        domainSuffix: "sandboxes.example.test",
        publicProtocol: "https",
        workingDirectory: "/workspace",
      },
      {
        githubToken: "github-token",
        ports: [3000],
      },
    );

    expect(sandbox.environmentDetails).toContain("GH_TOKEN");
    expect(sandbox.environmentDetails).toContain("GITHUB_TOKEN");
    expect(sandbox.environmentDetails).toContain("Prefer `gh`");
    expect(sandbox.environmentDetails).toContain(
      "https://oa-123-3000.sandboxes.example.test",
    );
  });
});

describe("DockerContainerSandbox command environment", () => {
  test("passes GitHub auth into docker exec environment", async () => {
    const sandbox = await DockerContainerSandbox.connect(
      {
        containerName: "open-agents-oa-123",
        workspaceHostPath: "/var/lib/open-agents/workspaces/oa-123",
        routeSlug: "oa-123",
        domainSuffix: "sandboxes.example.test",
        workingDirectory: "/workspace",
      },
      {
        githubToken: "github-token",
      },
    );

    await sandbox.exec("printf '%s' \"$GH_TOKEN\"", "/workspace", 30_000);

    const execCall = dockerExecCalls.at(-1);
    expect(execCall).toBeDefined();
    expect(execCall?.args).toContain("-e");
    expect(execCall?.args).toContain("GITHUB_TOKEN=github-token");
    expect(execCall?.args).toContain("GH_TOKEN=github-token");
    expect(execCall?.args).toContain("/workspace");
    expect(execCall?.args.at(-1)).toBe("printf '%s' \"$GH_TOKEN\"");
  });
});
