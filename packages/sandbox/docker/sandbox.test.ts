import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

type DockerCall = {
  args: string[];
  input?: string | Buffer;
};

const calls: DockerCall[] = [];
let mainContainerCreated = false;
let runningContainers = "";

class MockDockerClient {
  async run(args: string[], options: { input?: string | Buffer } = {}) {
    calls.push({ args, input: options.input });
    if (args[0] === "ps") {
      return {
        exitCode: 0,
        stdout: runningContainers,
        stderr: "",
        timedOut: false,
        truncated: false,
      };
    }
    const command = args.at(-1) ?? "";
    const checkingGitDirectory =
      command.includes("test -e") && command.includes("/.git");
    return {
      exitCode: checkingGitDirectory ? 1 : 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      truncated: false,
    };
  }

  async inspectContainer() {
    return mainContainerCreated ? { id: "container-1", running: true } : null;
  }

  async volumeExists() {
    return mainContainerCreated;
  }

  async requireSuccess(args: string[], input?: string | Buffer) {
    calls.push({ args, input });
    if (args[0] === "create" && args.includes("open-agents-sandbox:local")) {
      mainContainerCreated = true;
    }
  }
}

mock.module("./client.ts", () => ({ DockerClient: MockDockerClient }));

let sandboxModule: typeof import("./sandbox");

beforeAll(async () => {
  sandboxModule = await import("./sandbox");
});

beforeEach(() => {
  calls.length = 0;
  mainContainerCreated = false;
  runningContainers = "";
  process.env.SANDBOX_IMAGE = "open-agents-sandbox:local";
  delete process.env.SANDBOX_MAX_RUNNING;
});

describe("DockerSandbox GitHub auth", () => {
  test("executes askpass from helper tmpfs without exposing its token in Docker arguments", async () => {
    const token = "github-secret-token";
    const source = {
      repo: "https://github.com/open-agents/open-agents.git",
      branch: "main",
      newBranch: "feature/sandbox-auth",
    };
    const sandbox = await sandboxModule.DockerSandbox.connect(
      { sandboxName: "session-secure", source },
      { createIfMissing: true, githubToken: token },
    );

    const helperCreate = calls.find(
      ({ args }) =>
        args[0] === "create" && args.some((value) => value.includes("-git-")),
    );
    expect(helperCreate).toBeDefined();
    expect(helperCreate?.args).toContain("--rm");
    expect(helperCreate?.args.at(-1)).toBe("360");
    const entrypointIndex = helperCreate?.args.indexOf("--entrypoint") ?? -1;
    expect(helperCreate?.args[entrypointIndex + 1]).toBe("sleep");
    expect(helperCreate?.args).toContain("no-new-privileges");
    expect(helperCreate?.args).toContain("--cap-drop");
    const tmpfs = helperCreate?.args[helperCreate.args.indexOf("--tmpfs") + 1];
    expect(tmpfs).toContain("exec");
    expect(tmpfs).not.toContain("noexec");

    expect(calls.some(({ input }) => input === token)).toBe(true);
    expect(calls.flatMap(({ args }) => args).join(" ")).not.toContain(token);
    expect(sandbox.environmentDetails).toContain("local Docker container");
    expect(sandbox.environmentDetails).not.toContain("runs on Vercel");
    expect(sandbox.getState()).toMatchObject({
      type: "docker",
      sandboxName: "session-secure",
      source,
    });
  });

  test("refuses to start more than the configured sandbox capacity", async () => {
    process.env.SANDBOX_MAX_RUNNING = "1";
    runningContainers = "open-agents-existing\n";

    await expect(
      sandboxModule.DockerSandbox.connect(
        { sandboxName: "session-over-capacity" },
        { createIfMissing: true },
      ),
    ).rejects.toThrow("Docker sandbox capacity reached (1/1)");

    expect(
      calls.some(({ args }) => args[0] === "volume" && args[1] === "create"),
    ).toBe(false);
  });
});
