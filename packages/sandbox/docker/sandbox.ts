import { rm } from "node:fs/promises";
import type { Dirent } from "fs";
import type {
  ExecResult,
  Sandbox,
  SandboxHooks,
  SandboxStats,
} from "../interface";
import type { Source } from "../types";
import { DockerClient } from "./client";
import type { DockerContainerState } from "./state";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_WORKING_DIRECTORY = "/workspace";
const MAX_OUTPUT_LENGTH = 50_000;

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function toOutput(
  stdout: string,
  stderr: string,
): Pick<ExecResult, "stdout" | "stderr" | "truncated"> {
  const combinedLength = stdout.length + stderr.length;
  if (combinedLength <= MAX_OUTPUT_LENGTH) {
    return { stdout, stderr, truncated: false };
  }

  const remainingStdout = Math.min(stdout.length, MAX_OUTPUT_LENGTH);
  const remainingStderr = Math.max(0, MAX_OUTPUT_LENGTH - remainingStdout);

  return {
    stdout: stdout.slice(-remainingStdout),
    stderr: stderr.slice(-remainingStderr),
    truncated: true,
  };
}

function toDirentType(type: string): "file" | "directory" | "symlink" {
  if (type === "d") {
    return "directory";
  }
  if (type === "l") {
    return "symlink";
  }
  return "file";
}

function createDirentLike(
  name: string,
  type: "file" | "directory" | "symlink",
): Dirent {
  return {
    name,
    isDirectory: () => type === "directory",
    isFile: () => type === "file",
    isSymbolicLink: () => type === "symlink",
  } as Dirent;
}

function buildAuthenticatedGitHubUrl(
  repoUrl: string,
  token: string,
): string | null {
  const githubUrlMatch = repoUrl.match(
    /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/,
  );

  if (!githubUrlMatch) {
    return null;
  }

  const [, owner, repo] = githubUrlMatch;
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

function buildPreviewUrl(
  protocol: "http" | "https",
  routeSlug: string,
  domainSuffix: string,
  port: number,
): string {
  return `${protocol}://${routeSlug}-${port}.${domainSuffix}`;
}

type ConnectOptions = {
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  ports?: number[];
};

export class DockerContainerSandbox implements Sandbox {
  readonly type = "cloud" as const;
  readonly workingDirectory: string;
  readonly env?: Record<string, string>;
  readonly currentBranch?: string;
  readonly hooks?: SandboxHooks;

  private readonly client: DockerClient;
  private readonly containerName: string;
  private readonly routeSlug?: string;
  private readonly domainSuffix?: string;
  private readonly publicProtocol: "http" | "https";
  private readonly state: DockerContainerState;
  private readonly timeoutValue?: number;
  private readonly ports?: number[];
  private readonly workspaceHostPath?: string;
  private expiresAtValue?: number;
  private stopped = false;

  private constructor(params: {
    client: DockerClient;
    state: DockerContainerState;
    env?: Record<string, string>;
    currentBranch?: string;
    hooks?: SandboxHooks;
    timeout?: number;
    ports?: number[];
  }) {
    if (!params.state.containerName) {
      throw new Error("Incomplete Docker sandbox state");
    }

    this.client = params.client;
    this.state = params.state;
    this.containerName = params.state.containerName;
    this.workingDirectory =
      params.state.workingDirectory ?? DEFAULT_WORKING_DIRECTORY;
    this.env = params.env;
    this.currentBranch = params.currentBranch;
    this.hooks = params.hooks;
    this.routeSlug = params.state.routeSlug;
    this.domainSuffix = params.state.domainSuffix;
    this.publicProtocol = params.state.publicProtocol ?? "http";
    this.timeoutValue = params.timeout;
    this.ports = params.ports;
    this.workspaceHostPath = params.state.workspaceHostPath;
    this.expiresAtValue = params.state.expiresAt;
  }

  static async connect(
    state: DockerContainerState,
    options: ConnectOptions = {},
  ): Promise<DockerContainerSandbox> {
    if (
      !state.containerName ||
      !state.workspaceHostPath ||
      !state.routeSlug ||
      !state.domainSuffix
    ) {
      throw new Error("Incomplete Docker container sandbox state");
    }

    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const env = buildSandboxEnv({
      env: options.env,
      githubToken: options.githubToken,
      ports: options.ports ?? [],
      routeSlug: state.routeSlug,
      domainSuffix: state.domainSuffix,
      publicProtocol: state.publicProtocol ?? "http",
    });

    const sandbox = new DockerContainerSandbox({
      client: new DockerClient(),
      state,
      env,
      currentBranch: state.source?.newBranch ?? state.source?.branch,
      hooks: options.hooks,
      timeout,
      ports: options.ports,
    });

    await sandbox.ensureContainerExists();
    await sandbox.prepareWorkspace(
      state.source,
      options.githubToken,
      options.gitUser,
    );

    if (options.hooks?.afterStart) {
      await options.hooks.afterStart(sandbox);
    }

    if (state.expiresAt === undefined) {
      sandbox.expiresAtValue = Date.now() + timeout;
    }

    return sandbox;
  }

  get host(): string | undefined {
    return this.routeSlug && this.domainSuffix
      ? `${this.routeSlug}.${this.domainSuffix}`
      : undefined;
  }

  get expiresAt(): number | undefined {
    return this.expiresAtValue;
  }

  get timeout(): number | undefined {
    return this.timeoutValue;
  }

  get environmentDetails(): string {
    const ports = this.ports ?? [];
    const hasGitHubAuth = Boolean(this.env?.GH_TOKEN || this.env?.GITHUB_TOKEN);
    const previewLines =
      this.routeSlug && this.domainSuffix
        ? ports.map((port) => `  - Port ${port}: ${this.domain(port)}`)
        : [];

    const previewText =
      previewLines.length > 0
        ? `\n- Direct preview URLs for common ports:\n${previewLines.join("\n")}`
        : "";
    const githubText = hasGitHubAuth
      ? [
          "\n- GitHub auth is already available inside bash commands via `GH_TOKEN` and `GITHUB_TOKEN`",
          "- Prefer `gh` for PR, branch, and repo operations when it is installed; otherwise fall back to GitHub HTTPS APIs with `curl`",
        ].join("\n")
      : "";

    return `- Sandbox runtime is an ephemeral Docker container managed by the local platform
- The working directory is ${this.workingDirectory}
- All bash commands already run in the working directory by default — never prepend \`cd <working-directory> &&\`; just run the command directly
- Common project tooling is preinstalled: Node.js/npm, bun, pnpm, Yarn, Python/pip/venv/uv, git, gh, ripgrep/fd, build-essential, Chromium, and code-server
- Detached processes live for as long as the sandbox container stays alive and are killed when the sandbox is removed
- Releasing the sandbox removes the container and its mounted workspace${githubText}${previewText}`;
  }

  async readFile(path: string, _encoding: "utf-8"): Promise<string> {
    const result = await this.runContainerCommand(`cat ${shellEscape(path)}`);
    if (!result.success) {
      throw new Error(
        result.stderr || result.stdout || `Failed to read ${path}`,
      );
    }
    return result.stdout;
  }

  async writeFile(
    path: string,
    content: string,
    _encoding: "utf-8",
  ): Promise<void> {
    const parentDirectory = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/")) || "/"
      : ".";
    const command = [
      `mkdir -p ${shellEscape(parentDirectory)}`,
      `cat > ${shellEscape(path)}`,
    ].join(" && ");

    const result = await this.execRawContainerCommand(command, {
      input: content,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || result.stdout || `Failed to write ${path}`,
      );
    }
  }

  async stat(path: string): Promise<SandboxStats> {
    const command = [
      `if [ -d ${shellEscape(path)} ]; then printf 'directory\\t';`,
      `elif [ -f ${shellEscape(path)} ]; then printf 'file\\t';`,
      `elif [ -L ${shellEscape(path)} ]; then printf 'symlink\\t';`,
      "else exit 1; fi;",
      `stat -Lc '%s\\t%Y' ${shellEscape(path)}`,
    ].join(" ");
    const result = await this.runContainerCommand(command);
    if (!result.success) {
      throw new Error(
        result.stderr || result.stdout || `Failed to stat ${path}`,
      );
    }

    const [type = "file", sizeValue = "0", mtimeValue = "0"] = result.stdout
      .trim()
      .split("\t");
    const normalizedType = toDirentType(
      type === "directory" ? "d" : type === "symlink" ? "l" : "f",
    );
    const size = Number.parseInt(sizeValue, 10);
    const mtimeSeconds = Number.parseInt(mtimeValue, 10);

    return {
      isDirectory: () => normalizedType === "directory",
      isFile: () => normalizedType === "file",
      size: Number.isFinite(size) ? size : 0,
      mtimeMs: Number.isFinite(mtimeSeconds) ? mtimeSeconds * 1000 : 0,
    };
  }

  async access(path: string): Promise<void> {
    const result = await this.runContainerCommand(
      `test -e ${shellEscape(path)}`,
    );
    if (!result.success) {
      throw new Error(
        result.stderr || result.stdout || `Missing path: ${path}`,
      );
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const recursiveFlag = options?.recursive ? "-p " : "";
    const result = await this.runContainerCommand(
      `mkdir ${recursiveFlag}${shellEscape(path)}`,
    );
    if (!result.success) {
      throw new Error(
        result.stderr || result.stdout || `Failed to mkdir ${path}`,
      );
    }
  }

  async readdir(
    path: string,
    _options: { withFileTypes: true },
  ): Promise<Dirent[]> {
    const command = `find ${shellEscape(path)} -mindepth 1 -maxdepth 1 -printf '%f\\t%y\\n'`;
    const result = await this.runContainerCommand(command);
    if (!result.success) {
      throw new Error(
        result.stderr || result.stdout || `Failed to read ${path}`,
      );
    }

    return result.stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [name = "", type = "f"] = line.split("\t");
        return createDirentLike(name, toDirentType(type));
      });
  }

  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    return this.runContainerCommand(command, {
      cwd,
      timeoutMs,
      signal: options?.signal,
    });
  }

  async execDetached(
    command: string,
    cwd: string,
  ): Promise<{ commandId: string }> {
    const logPath = `/tmp/open-harness-detached/${Date.now()}.log`;
    const detachedCommand = [
      `mkdir -p /tmp/open-harness-detached`,
      `(nohup sh -lc ${shellEscape(command)} >${shellEscape(logPath)} 2>&1 < /dev/null & echo $!)`,
    ].join(" && ");

    const result = await this.execRawContainerCommand(detachedCommand, {
      cwd,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || result.stdout || "Failed to start detached command",
      );
    }

    return { commandId: result.stdout.trim() || crypto.randomUUID() };
  }

  domain(port: number): string {
    if (!this.routeSlug || !this.domainSuffix) {
      throw new Error("Preview domain is not configured for this sandbox");
    }

    return buildPreviewUrl(
      this.publicProtocol,
      this.routeSlug,
      this.domainSuffix,
      port,
    );
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }

    if (this.hooks?.beforeStop) {
      await this.hooks.beforeStop(this);
    }

    await this.client.removeContainer(this.containerName, { force: true });

    if (this.workspaceHostPath) {
      await rm(this.workspaceHostPath, { recursive: true, force: true });
    }

    this.stopped = true;
    this.expiresAtValue = undefined;
  }

  async extendTimeout(additionalMs: number): Promise<{ expiresAt: number }> {
    const nextExpiresAt =
      (this.expiresAtValue ?? Date.now()) + Math.max(additionalMs, 0);
    this.expiresAtValue = nextExpiresAt;
    return { expiresAt: nextExpiresAt };
  }

  getState(): DockerContainerState {
    return {
      ...this.state,
      expiresAt: this.expiresAtValue,
    };
  }

  private async prepareWorkspace(
    source: Source | undefined,
    githubToken: string | undefined,
    gitUser: { name: string; email: string } | undefined,
  ): Promise<void> {
    await this.mkdir(this.workingDirectory, { recursive: true });

    if (source) {
      const gitDirectory = `${this.workingDirectory}/.git`;
      try {
        await this.access(gitDirectory);
      } catch {
        const cloneUrl =
          githubToken && source.repo.includes("github.com")
            ? (buildAuthenticatedGitHubUrl(source.repo, githubToken) ??
              source.repo)
            : source.repo;
        const cloneCommand = source.branch
          ? `git clone --branch ${shellEscape(source.branch)} ${shellEscape(cloneUrl)} ${shellEscape(this.workingDirectory)}`
          : `git clone ${shellEscape(cloneUrl)} ${shellEscape(this.workingDirectory)}`;
        const cloneResult = await this.execRawContainerCommand(cloneCommand, {
          cwd: "/",
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
        if (cloneResult.exitCode !== 0) {
          throw new Error(
            cloneResult.stderr ||
              cloneResult.stdout ||
              `Failed to clone ${source.repo}`,
          );
        }
      }

      if (source.newBranch) {
        const branchResult = await this.runContainerCommand(
          `git checkout -B ${shellEscape(source.newBranch)}`,
          {
            cwd: this.workingDirectory,
            timeoutMs: DEFAULT_TIMEOUT_MS,
          },
        );
        if (!branchResult.success) {
          throw new Error(
            branchResult.stderr ||
              branchResult.stdout ||
              `Failed to create branch ${source.newBranch}`,
          );
        }
      }
    } else {
      const gitDirectory = `${this.workingDirectory}/.git`;
      try {
        await this.access(gitDirectory);
      } catch {
        const initResult = await this.runContainerCommand("git init", {
          cwd: this.workingDirectory,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
        if (!initResult.success) {
          throw new Error(
            initResult.stderr ||
              initResult.stdout ||
              "Failed to initialize git workspace",
          );
        }
      }
    }

    if (gitUser) {
      await this.runContainerCommand(
        `git config user.name ${shellEscape(gitUser.name)} && git config user.email ${shellEscape(gitUser.email)}`,
        {
          cwd: this.workingDirectory,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        },
      );
    }
  }

  private async ensureContainerExists(): Promise<void> {
    const inspection = await this.client.inspectContainer(this.containerName);
    if (!inspection || !inspection.state.running) {
      throw new Error(
        `Docker sandbox container ${this.containerName} is unavailable`,
      );
    }
  }

  private async runContainerCommand(
    command: string,
    options?: {
      cwd?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<ExecResult> {
    const result = await this.execRawContainerCommand(command, options);
    const output = toOutput(result.stdout, result.stderr);

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      ...output,
    };
  }

  private async execRawContainerCommand(
    command: string,
    options?: {
      cwd?: string;
      input?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ) {
    const args = [
      "exec",
      ...(typeof options?.input === "string" ? ["-i"] : []),
      "-w",
      options?.cwd ?? this.workingDirectory,
      ...toExecEnvArgs(this.env),
      this.containerName,
      "sh",
      "-lc",
      command,
    ];

    return this.client.exec(args, {
      input: options?.input,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    });
  }
}

function buildSandboxEnv(params: {
  env?: Record<string, string>;
  githubToken?: string;
  routeSlug: string;
  domainSuffix: string;
  publicProtocol: "http" | "https";
  ports: number[];
}): Record<string, string> | undefined {
  const env: Record<string, string> = {
    ...params.env,
  };

  if (params.githubToken) {
    env.GITHUB_TOKEN = params.githubToken;
    env.GH_TOKEN = params.githubToken;
  }

  env.SANDBOX_HOST = `${params.routeSlug}.${params.domainSuffix}`;
  for (const port of params.ports) {
    env[`SANDBOX_URL_${port}`] = buildPreviewUrl(
      params.publicProtocol,
      params.routeSlug,
      params.domainSuffix,
      port,
    );
  }

  return Object.keys(env).length > 0 ? env : undefined;
}

function toExecEnvArgs(env: Record<string, string> | undefined): string[] {
  if (!env) {
    return [];
  }

  return Object.entries(env).flatMap(([key, value]) => [
    "-e",
    `${key}=${value}`,
  ]);
}
