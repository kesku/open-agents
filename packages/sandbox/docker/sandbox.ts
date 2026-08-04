import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import type {
  ExecResult,
  Sandbox,
  SandboxHooks,
  SandboxStats,
} from "../interface.ts";
import type { Source } from "../types.ts";
import { DockerClient } from "./client.ts";
import { getDockerSandboxConfig, type DockerSandboxConfig } from "./config.ts";
import type { DockerState } from "./state.ts";

const WORKING_DIRECTORY = "/vercel/sandbox";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const GITHUB_SECRET_PATH = "/run/open-agents/github-token";
const GITHUB_ASKPASS_PATH = "/run/open-agents/github-askpass";
const GITHUB_HELPER_MAX_LIFETIME_SECONDS = 6 * 60;

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function resourceSlug(sandboxName: string): string {
  return createHash("sha256").update(sandboxName).digest("hex").slice(0, 20);
}

export function getDockerResourceNames(sandboxName: string) {
  const slug = resourceSlug(sandboxName);
  return {
    containerName: `open-agents-${slug}`,
    volumeName: `open-agents-${slug}-workspace`,
    routeSlug: `oa-${slug}`,
  };
}

function commandError(result: { stdout: string; stderr: string }): string {
  return (
    result.stderr.trim() || result.stdout.trim() || "Docker command failed"
  );
}

function previewUrl(
  config: DockerSandboxConfig,
  routeSlug: string,
  port: number,
): string {
  return `${config.publicProtocol}://${routeSlug}-${port}.${config.domainSuffix}`;
}

function toExecEnv(env: Record<string, string> | undefined): string[] {
  if (!env) return [];
  return Object.entries(env).flatMap(([key, value]) => [
    "-e",
    `${key}=${value}`,
  ]);
}

function isTrustedGitCommand(command: string): boolean {
  const trimmed = command.trim();
  return /^(?:GIT_TERMINAL_PROMPT=0\s+)?git(?:\s|$)/.test(trimmed);
}

type ConnectOptions = {
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  ports?: number[];
  resume?: boolean;
  createIfMissing?: boolean;
};

export class DockerSandbox implements Sandbox {
  readonly type = "container" as const;
  readonly workingDirectory = WORKING_DIRECTORY;
  readonly env?: Record<string, string>;
  readonly currentBranch?: string;
  readonly hooks?: SandboxHooks;
  readonly environmentDetails: string;

  private expiresAtValue?: number;
  private helperContainerName?: string;
  private stopped = false;

  private constructor(
    private readonly client: DockerClient,
    private readonly config: DockerSandboxConfig,
    private readonly state: DockerState & { sandboxName: string },
    private readonly containerName: string,
    private readonly volumeName: string,
    private readonly routeSlug: string,
    private readonly ports: number[],
    options: ConnectOptions,
    expiresAt: number,
  ) {
    this.env = options.env;
    this.currentBranch = state.source?.newBranch ?? state.source?.branch;
    this.hooks = options.hooks;
    this.expiresAtValue = expiresAt;
    const urls = ports
      .map((port) => `  - Port ${port}: ${this.domain(port)}`)
      .join("\n");
    this.environmentDetails = `- The sandbox is an isolated local Docker container with a persistent workspace
- The working directory is ${WORKING_DIRECTORY}
- GitHub credentials are never available inside this container; clone and fetch are handled by the app
- GitHub writes (commits, pushes, PRs) are handled by the app, not by git push or gh inside the sandbox
- All bash commands already run in the working directory by default${urls ? `\n- Dev server URLs:\n${urls}` : ""}`;
  }

  static async connect(
    state: DockerState,
    options: ConnectOptions = {},
  ): Promise<DockerSandbox> {
    if (!state.sandboxName) {
      throw new Error("Persistent Docker sandbox name is required");
    }
    const client = new DockerClient();
    const config = getDockerSandboxConfig();
    const names = getDockerResourceNames(state.sandboxName);
    const ports = options.ports ?? [3000, 5173, 4321, 8000];
    let inspection = await client.inspectContainer(names.containerName);
    let created = false;

    if (!inspection) {
      if (!options.createIfMissing) {
        throw new Error(`Docker sandbox not found: ${state.sandboxName}`);
      }
      await DockerSandbox.ensureRunningCapacity(client, config);
      await DockerSandbox.createResources({
        client,
        config,
        sandboxName: state.sandboxName,
        ...names,
        ports,
      });
      inspection = await client.inspectContainer(names.containerName);
      created = true;
    }

    if (!inspection) {
      throw new Error(`Docker sandbox not found: ${state.sandboxName}`);
    }
    if (!inspection.running) {
      if (!options.resume && !created) {
        throw new Error(`Docker sandbox is stopped: ${state.sandboxName}`);
      }
      if (!created) {
        await DockerSandbox.ensureRunningCapacity(client, config);
      }
      await client.requireSuccess(["start", names.containerName]);
    }

    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const expiresAt =
      created || options.resume
        ? Date.now() + timeout
        : (state.expiresAt ?? Date.now() + timeout);
    const sandbox = new DockerSandbox(
      client,
      config,
      { ...state, sandboxName: state.sandboxName },
      names.containerName,
      names.volumeName,
      names.routeSlug,
      ports,
      options,
      expiresAt,
    );

    if (created) {
      try {
        await sandbox.prepareWorkspace(state.source, options);
      } catch (error) {
        await sandbox.clearGitHubHelperBestEffort();
        await DockerSandbox.destroy(state);
        throw error;
      }
    }
    if (options.hooks?.afterStart) await options.hooks.afterStart(sandbox);
    return sandbox;
  }

  static async destroy(state: DockerState): Promise<void> {
    if (!state.sandboxName) return;
    const client = new DockerClient();
    const names = getDockerResourceNames(state.sandboxName);
    const inspection = await client.inspectContainer(names.containerName);
    if (inspection) {
      await client.requireSuccess(["rm", "-f", names.containerName]);
    }
    if (await client.volumeExists(names.volumeName)) {
      await client.requireSuccess(["volume", "rm", "-f", names.volumeName]);
    }
  }

  get expiresAt(): number | undefined {
    return this.expiresAtValue;
  }

  get timeout(): number | undefined {
    return this.expiresAtValue ? this.expiresAtValue - Date.now() : undefined;
  }

  get host(): string {
    const defaultPort = this.ports[0] ?? 3000;
    return new URL(this.domain(defaultPort)).host;
  }

  domain(port: number): string {
    return previewUrl(this.config, this.routeSlug, port);
  }

  async readFile(path: string, _encoding: "utf-8"): Promise<string> {
    const result = await this.exec(
      `cat ${shellEscape(path)}`,
      "/",
      COMMAND_TIMEOUT_MS,
    );
    if (!result.success) throw new Error(commandError(result));
    return result.stdout;
  }

  async readFileBuffer(path: string): Promise<Buffer> {
    const result = await this.client.run([
      "exec",
      this.containerName,
      "sh",
      "-lc",
      `base64 < ${shellEscape(path)}`,
    ]);
    if (result.exitCode !== 0) throw new Error(commandError(result));
    return Buffer.from(result.stdout.replaceAll(/\s/g, ""), "base64");
  }

  async writeFile(
    path: string,
    content: string,
    _encoding: "utf-8",
  ): Promise<void> {
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    const result = await this.client.run(
      [
        "exec",
        "-i",
        this.containerName,
        "sh",
        "-lc",
        `mkdir -p ${shellEscape(parent)} && cat > ${shellEscape(path)}`,
      ],
      { input: content, timeoutMs: COMMAND_TIMEOUT_MS },
    );
    if (result.exitCode !== 0) throw new Error(commandError(result));
  }

  async stat(path: string): Promise<SandboxStats> {
    const result = await this.exec(
      `stat -c '%F\t%s\t%Y' ${shellEscape(path)}`,
      "/",
      10_000,
    );
    if (!result.success) throw new Error(`ENOENT: ${path}`);
    const [kind, rawSize, rawMtime] = result.stdout.trim().split("\t");
    return {
      isDirectory: () => kind === "directory",
      isFile: () => kind === "regular file",
      size: Number(rawSize) || 0,
      mtimeMs: (Number(rawMtime) || 0) * 1000,
    };
  }

  async access(path: string): Promise<void> {
    const result = await this.exec(`test -e ${shellEscape(path)}`, "/", 10_000);
    if (!result.success) throw new Error(`ENOENT: ${path}`);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const result = await this.exec(
      `mkdir ${options?.recursive ? "-p " : ""}${shellEscape(path)}`,
      "/",
      10_000,
    );
    if (!result.success) throw new Error(commandError(result));
  }

  async readdir(
    path: string,
    _options: { withFileTypes: true },
  ): Promise<Dirent[]> {
    const result = await this.exec(
      `find ${shellEscape(path)} -mindepth 1 -maxdepth 1 -printf '%y\\t%f\\n'`,
      "/",
      10_000,
    );
    if (!result.success) throw new Error(commandError(result));
    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [kind, ...nameParts] = line.split("\t");
        const name = nameParts.join("\t");
        return {
          name,
          isDirectory: () => kind === "d",
          isFile: () => kind === "f",
          isSymbolicLink: () => kind === "l",
        } as Dirent;
      });
  }

  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    if (this.helperContainerName && !isTrustedGitCommand(command)) {
      throw new Error(
        "Only trusted Git commands may use temporary GitHub auth",
      );
    }
    const target = this.helperContainerName ?? this.containerName;
    const commandEnv = {
      ...this.env,
      SANDBOX_HOST: this.host,
      ...Object.fromEntries(
        this.ports.map((port) => [`SANDBOX_URL_${port}`, this.domain(port)]),
      ),
      ...(this.helperContainerName
        ? {
            GIT_ASKPASS: GITHUB_ASKPASS_PATH,
            GIT_TERMINAL_PROMPT: "0",
          }
        : {}),
    };
    const result = await this.client.run(
      [
        "exec",
        "--user",
        this.config.user,
        "-w",
        cwd,
        ...toExecEnv(commandEnv),
        target,
        "bash",
        "-lc",
        command,
      ],
      { timeoutMs, signal: options?.signal },
    );
    return {
      success: result.exitCode === 0 && !result.timedOut,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.timedOut
        ? `Command timed out after ${timeoutMs}ms`
        : result.stderr,
      truncated: result.truncated,
    };
  }

  async execDetached(
    command: string,
    cwd: string,
  ): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    const result = await this.exec(
      `mkdir -p /tmp/open-agents-detached && nohup bash -lc ${shellEscape(command)} >/tmp/open-agents-detached/${commandId}.log 2>&1 </dev/null &`,
      cwd,
      10_000,
    );
    if (!result.success) throw new Error(commandError(result));
    return { commandId };
  }

  async setGitHubAuthToken(token?: string): Promise<void> {
    await this.clearGitHubHelper();
    if (!token) return;

    const helperName = `${this.containerName}-git-${randomUUID().slice(0, 8)}`;
    try {
      await this.client.requireSuccess([
        "create",
        "--rm",
        "--name",
        helperName,
        "--network",
        this.config.network,
        "--user",
        this.config.user,
        "--cpus",
        String(this.config.cpu),
        "--memory",
        `${this.config.memoryMb}m`,
        "--pids-limit",
        String(this.config.pidsLimit),
        "--security-opt",
        "no-new-privileges",
        "--cap-drop",
        "ALL",
        "--mount",
        `type=volume,source=${this.volumeName},target=${WORKING_DIRECTORY}`,
        "--tmpfs",
        "/run/open-agents:rw,nosuid,nodev,exec,size=65536",
        "--entrypoint",
        "sleep",
        this.config.image,
        String(GITHUB_HELPER_MAX_LIFETIME_SECONDS),
      ]);
      await this.client.requireSuccess(["start", helperName]);
      await this.client.requireSuccess(
        [
          "exec",
          "-i",
          helperName,
          "sh",
          "-c",
          `umask 077; cat > ${GITHUB_SECRET_PATH}`,
        ],
        token,
      );
      const askpass = `#!/bin/sh\ncase "$1" in\n  *Username*) printf '%s\\n' x-access-token ;;\n  *) cat ${GITHUB_SECRET_PATH} ;;\nesac\n`;
      await this.client.requireSuccess(
        [
          "exec",
          "-i",
          helperName,
          "sh",
          "-c",
          `umask 077; cat > ${GITHUB_ASKPASS_PATH}; chmod 0500 ${GITHUB_ASKPASS_PATH}`,
        ],
        askpass,
      );
      this.helperContainerName = helperName;
    } catch (error) {
      await this.client.run(["rm", "-f", helperName]);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    await this.clearGitHubHelper();
    if (this.hooks?.beforeStop) {
      try {
        await this.hooks.beforeStop(this);
      } catch (error) {
        console.error("[DockerSandbox] beforeStop hook failed:", error);
      }
    }
    const inspection = await this.client.inspectContainer(this.containerName);
    if (inspection?.running) {
      await this.client.requireSuccess([
        "stop",
        "--time",
        "10",
        this.containerName,
      ]);
    }
    this.stopped = true;
    this.expiresAtValue = undefined;
  }

  async extendTimeout(additionalMs: number): Promise<{ expiresAt: number }> {
    this.expiresAtValue =
      (this.expiresAtValue ?? Date.now()) + Math.max(additionalMs, 0);
    return { expiresAt: this.expiresAtValue };
  }

  getState(): { type: "docker" } & DockerState {
    return {
      type: "docker",
      sandboxName: this.state.sandboxName,
      ...(this.state.source ? { source: this.state.source } : {}),
      ...(this.expiresAtValue === undefined
        ? {}
        : { expiresAt: this.expiresAtValue }),
    };
  }

  private static async createResources(params: {
    client: DockerClient;
    config: DockerSandboxConfig;
    sandboxName: string;
    containerName: string;
    volumeName: string;
    routeSlug: string;
    ports: number[];
  }): Promise<void> {
    await params.client.requireSuccess([
      "volume",
      "create",
      "--label",
      "open-agents.managed=true",
      "--label",
      `open-agents.sandbox-name=${params.sandboxName}`,
      params.volumeName,
    ]);
    const labels = [
      "open-agents.managed=true",
      `open-agents.sandbox-name=${params.sandboxName}`,
      "traefik.enable=true",
      `traefik.docker.network=${params.config.network}`,
      ...params.ports.flatMap((port) => {
        const router = `${params.routeSlug}-${port}`;
        return [
          `traefik.http.routers.${router}.rule=Host(\`${params.routeSlug}-${port}.${params.config.domainSuffix}\`)`,
          `traefik.http.routers.${router}.entrypoints=web`,
          `traefik.http.services.${router}.loadbalancer.server.port=${port}`,
        ];
      }),
    ];
    await params.client.requireSuccess([
      "create",
      "--name",
      params.containerName,
      "--hostname",
      params.containerName,
      "--network",
      params.config.network,
      "--user",
      params.config.user,
      "--cpus",
      String(params.config.cpu),
      "--memory",
      `${params.config.memoryMb}m`,
      "--pids-limit",
      String(params.config.pidsLimit),
      "--security-opt",
      "no-new-privileges",
      "--cap-drop",
      "ALL",
      "--mount",
      `type=volume,source=${params.volumeName},target=${WORKING_DIRECTORY}`,
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,exec,size=268435456",
      ...labels.flatMap((label) => ["--label", label]),
      params.config.image,
      "sleep",
      "infinity",
    ]);
  }

  private static async ensureRunningCapacity(
    client: DockerClient,
    config: DockerSandboxConfig,
  ): Promise<void> {
    const result = await client.run([
      "ps",
      "--filter",
      "label=open-agents.managed=true",
      "--format",
      "{{.Names}}",
    ]);
    if (result.exitCode !== 0) {
      throw new Error(commandError(result));
    }

    const runningCount = result.stdout.split("\n").filter(Boolean).length;
    if (runningCount >= config.maxRunning) {
      throw new Error(
        `Docker sandbox capacity reached (${runningCount}/${config.maxRunning})`,
      );
    }
  }

  private async prepareWorkspace(
    source: Source | undefined,
    options: ConnectOptions,
  ): Promise<void> {
    try {
      await this.access(`${WORKING_DIRECTORY}/.git`);
      return;
    } catch {
      // A newly created container may be reconnecting to an existing volume.
    }

    if (source) {
      const clone = async () => {
        const branch = source.branch
          ? `--branch ${shellEscape(source.branch)} `
          : "";
        const result = await this.exec(
          `git clone ${branch}${shellEscape(source.repo)} .`,
          WORKING_DIRECTORY,
          COMMAND_TIMEOUT_MS,
        );
        if (!result.success) throw new Error(commandError(result));
      };
      if (options.githubToken) {
        await this.setGitHubAuthToken(options.githubToken);
        try {
          await clone();
        } finally {
          await this.setGitHubAuthToken(undefined);
        }
      } else {
        await clone();
      }
    } else {
      const result = await this.exec("git init", WORKING_DIRECTORY, 10_000);
      if (!result.success) throw new Error(commandError(result));
    }

    if (options.gitUser) {
      const result = await this.exec(
        `git config user.name ${shellEscape(options.gitUser.name)} && git config user.email ${shellEscape(options.gitUser.email)}`,
        WORKING_DIRECTORY,
        10_000,
      );
      if (!result.success) throw new Error(commandError(result));
    }
    if (!source && options.gitUser) {
      await this.exec(
        "git commit --allow-empty -m 'Initial commit'",
        WORKING_DIRECTORY,
        10_000,
      );
    }
    if (source?.newBranch) {
      const result = await this.exec(
        `git checkout -b ${shellEscape(source.newBranch)}`,
        WORKING_DIRECTORY,
        10_000,
      );
      if (!result.success) throw new Error(commandError(result));
    }
  }

  private async clearGitHubHelper(): Promise<void> {
    if (!this.helperContainerName) return;
    const helperName = this.helperContainerName;
    this.helperContainerName = undefined;
    const result = await this.client.run(["rm", "-f", helperName]);
    if (result.exitCode !== 0) {
      const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
      if (!output.includes("no such") && !output.includes("not found")) {
        throw new Error(commandError(result));
      }
    }
  }

  private async clearGitHubHelperBestEffort(): Promise<void> {
    try {
      await this.clearGitHubHelper();
    } catch (error) {
      console.warn(
        "[DockerSandbox] failed to remove GitHub auth helper:",
        error,
      );
    }
  }
}
