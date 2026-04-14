import type { Dirent } from "fs";
import type {
  ExecResult,
  Sandbox,
  SandboxHooks,
  SandboxStats,
} from "../interface";
import type { Source } from "../types";
import { SshClient } from "./ssh-client";
import type { ProxmoxLxcState } from "./state";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
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

function buildPreviewUrl(template: string, host: string, port: number): string {
  return template.replaceAll("{host}", host).replaceAll("{port}", String(port));
}

type ConnectOptions = {
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  ports?: number[];
};

export class ProxmoxLxcSandbox implements Sandbox {
  readonly type = "cloud" as const;
  readonly workingDirectory: string;
  readonly env?: Record<string, string>;
  readonly currentBranch?: string;
  readonly hooks?: SandboxHooks;

  private readonly client: SshClient;
  private readonly previewHost?: string;
  private readonly previewUrlTemplate?: string;
  private readonly resetCommand?: string;
  private readonly state: ProxmoxLxcState;
  private readonly timeoutValue?: number;
  private readonly ports?: number[];
  private expiresAtValue?: number;
  private stopped = false;

  private constructor(params: {
    client: SshClient;
    state: ProxmoxLxcState;
    env?: Record<string, string>;
    currentBranch?: string;
    hooks?: SandboxHooks;
    timeout?: number;
    ports?: number[];
  }) {
    this.client = params.client;
    this.state = params.state;
    this.workingDirectory = params.state.workspacePath ?? "/workspace";
    this.env = params.env;
    this.currentBranch = params.currentBranch;
    this.hooks = params.hooks;
    this.previewHost = params.state.previewHost ?? params.state.host;
    this.previewUrlTemplate = params.state.previewUrlTemplate;
    this.resetCommand = params.state.resetCommand;
    this.timeoutValue = params.timeout;
    this.ports = params.ports;
    this.expiresAtValue = params.state.expiresAt;
  }

  static async connect(
    state: ProxmoxLxcState,
    options: ConnectOptions = {},
  ): Promise<ProxmoxLxcSandbox> {
    if (!state.host || !state.port || !state.sshUser || !state.workspacePath) {
      throw new Error("Incomplete Proxmox LXC sandbox state");
    }

    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const env = buildSandboxEnv({
      env: options.env,
      githubToken: options.githubToken,
      host: state.previewHost ?? state.host,
      ports: options.ports ?? [],
      previewUrlTemplate: state.previewUrlTemplate,
    });

    const sandbox = new ProxmoxLxcSandbox({
      client: new SshClient({
        host: state.host,
        port: state.port,
        sshUser: state.sshUser,
      }),
      state,
      env,
      currentBranch: state.source?.newBranch ?? state.source?.branch,
      hooks: options.hooks,
      timeout,
      ports: options.ports,
    });

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
    return this.previewHost;
  }

  get expiresAt(): number | undefined {
    return this.expiresAtValue;
  }

  get timeout(): number | undefined {
    return this.timeoutValue;
  }

  get environmentDetails(): string {
    const host = this.host;
    const ports = this.ports ?? [];
    const previewLines = host
      ? ports.map((port) => `  - Port ${port}: ${this.domain(port)}`)
      : [];

    const previewText =
      previewLines.length > 0
        ? `\n- Direct preview URLs for common ports:\n${previewLines.join("\n")}`
        : "";

    return `- Sandbox runtime is a leased Proxmox LXC reached over SSH
- The working directory is ${this.workingDirectory}
- All bash commands already run in the working directory by default — never prepend \`cd <working-directory> &&\`; just run the command directly
- The lease is hard-reset when the sandbox is released, so filesystem state is not resumable between sessions${previewText}`;
  }

  async readFile(path: string, _encoding: "utf-8"): Promise<string> {
    const result = await this.runRemoteCommand(`cat ${shellEscape(path)}`);
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
    const remoteCommand = [
      `mkdir -p ${shellEscape(parentDirectory)}`,
      `cat > ${shellEscape(path)}`,
    ].join(" && ");

    const result = await this.execRawRemoteCommand(remoteCommand, {
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
    const result = await this.runRemoteCommand(command);
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
    const result = await this.runRemoteCommand(`test -e ${shellEscape(path)}`);
    if (!result.success) {
      throw new Error(
        result.stderr || result.stdout || `Missing path: ${path}`,
      );
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const recursiveFlag = options?.recursive ? "-p " : "";
    const result = await this.runRemoteCommand(
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
    const result = await this.runRemoteCommand(command);
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
    return this.runRemoteCommand(command, {
      cwd,
      timeoutMs,
      signal: options?.signal,
    });
  }

  async execDetached(
    command: string,
    cwd: string,
  ): Promise<{ commandId: string }> {
    const detachedCommand = [
      `mkdir -p /tmp/open-harness-detached`,
      `nohup sh -lc ${shellEscape(command)} >/tmp/open-harness-detached/${Date.now()}.log 2>&1 < /dev/null &`,
      "echo $!",
    ].join(" && ");

    const result = await this.execRawRemoteCommand(detachedCommand, {
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
    if (!this.previewHost) {
      throw new Error("Preview host is not configured for this sandbox");
    }

    const template = this.previewUrlTemplate ?? "http://{host}:{port}";
    return buildPreviewUrl(template, this.previewHost, port);
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }

    if (this.hooks?.beforeStop) {
      await this.hooks.beforeStop(this);
    }

    if (this.resetCommand) {
      const result = await this.execRawRemoteCommand(this.resetCommand, {
        cwd: "/",
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          result.stderr ||
            result.stdout ||
            "Failed to hard-reset the leased Proxmox sandbox",
        );
      }
    }

    this.stopped = true;
    this.expiresAtValue = undefined;
  }

  getState(): ProxmoxLxcState {
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
        const cloneResult = await this.execRawRemoteCommand(cloneCommand, {
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
        const branchResult = await this.runRemoteCommand(
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
        const initResult = await this.runRemoteCommand("git init", {
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
      await this.runRemoteCommand(
        `git config user.name ${shellEscape(gitUser.name)} && git config user.email ${shellEscape(gitUser.email)}`,
        {
          cwd: this.workingDirectory,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        },
      );
    }
  }

  private async runRemoteCommand(
    command: string,
    options?: {
      cwd?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<ExecResult> {
    const result = await this.execRawRemoteCommand(command, options);
    const output = toOutput(result.stdout, result.stderr);

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      ...output,
    };
  }

  private async execRawRemoteCommand(
    command: string,
    options?: {
      cwd?: string;
      input?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ) {
    const remoteCommand = buildRemoteShellCommand({
      command,
      cwd: options?.cwd ?? this.workingDirectory,
      env: this.env,
    });

    return this.client.exec(remoteCommand, {
      input: options?.input,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    });
  }
}

function buildSandboxEnv(params: {
  env?: Record<string, string>;
  githubToken?: string;
  host?: string;
  ports: number[];
  previewUrlTemplate?: string;
}): Record<string, string> | undefined {
  const env: Record<string, string> = {
    ...params.env,
  };

  if (params.githubToken) {
    env.GITHUB_TOKEN = params.githubToken;
    env.GH_TOKEN = params.githubToken;
  }

  if (params.host) {
    env.SANDBOX_HOST = params.host;
    const template = params.previewUrlTemplate ?? "http://{host}:{port}";
    for (const port of params.ports) {
      env[`SANDBOX_URL_${port}`] = buildPreviewUrl(template, params.host, port);
    }
  }

  return Object.keys(env).length > 0 ? env : undefined;
}

function buildRemoteShellCommand(params: {
  command: string;
  cwd: string;
  env?: Record<string, string>;
}): string {
  const envPrefix = Object.entries(params.env ?? {})
    .map(([key, value]) => `${key}=${shellEscape(value)}`)
    .join(" ");
  const cwdPrefix = `cd ${shellEscape(params.cwd)}`;
  const commandBody = [cwdPrefix, params.command].join(" && ");
  const bodyWithEnv =
    envPrefix.length > 0 ? `${envPrefix} ${commandBody}` : commandBody;

  return `sh -lc ${shellEscape(bodyWithEnv)}`;
}
