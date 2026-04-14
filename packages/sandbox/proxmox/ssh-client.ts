import { spawn } from "node:child_process";

const DEFAULT_CONNECT_TIMEOUT_SECONDS = 10;

export interface SshConnectionConfig {
  host: string;
  port: number;
  sshUser: string;
}

export interface SshExecOptions {
  input?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SshExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function getOptionalEnvString(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function shouldUseStrictHostKeyChecking(): boolean {
  return (
    getOptionalEnvString("PROXMOX_SSH_STRICT_HOST_KEY_CHECKING") === "true"
  );
}

function buildSshArgs(
  config: SshConnectionConfig,
  remoteCommand: string,
): string[] {
  const args = [
    "-T",
    "-p",
    String(config.port),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${DEFAULT_CONNECT_TIMEOUT_SECONDS}`,
  ];

  const privateKeyPath = getOptionalEnvString("PROXMOX_SSH_PRIVATE_KEY_PATH");
  if (privateKeyPath) {
    args.push("-i", privateKeyPath);
  }

  const knownHostsPath = getOptionalEnvString("PROXMOX_SSH_KNOWN_HOSTS_PATH");
  if (knownHostsPath) {
    args.push("-o", `UserKnownHostsFile=${knownHostsPath}`);
  }

  if (!shouldUseStrictHostKeyChecking()) {
    args.push("-o", "StrictHostKeyChecking=no");
  }

  args.push(`${config.sshUser}@${config.host}`, remoteCommand);
  return args;
}

export class SshClient {
  constructor(private readonly config: SshConnectionConfig) {}

  async exec(
    remoteCommand: string,
    options: SshExecOptions = {},
  ): Promise<SshExecResult> {
    const args = buildSshArgs(this.config, remoteCommand);

    return new Promise<SshExecResult>((resolve, reject) => {
      const child = spawn("ssh", args, {
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";
      let didFinish = false;

      const finish = (
        callback: () => void,
        cleanupTimeout: ReturnType<typeof setTimeout> | null,
      ) => {
        if (didFinish) {
          return;
        }
        didFinish = true;
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
        }
        options.signal?.removeEventListener("abort", handleAbort);
        callback();
      };

      const timeoutId =
        typeof options.timeoutMs === "number" && options.timeoutMs > 0
          ? setTimeout(() => {
              child.kill("SIGTERM");
            }, options.timeoutMs)
          : null;

      const handleAbort = () => {
        finish(() => {
          child.kill("SIGTERM");
          reject(new Error("SSH command aborted"));
        }, timeoutId);
      };

      if (options.signal) {
        if (options.signal.aborted) {
          handleAbort();
          return;
        }
        options.signal.addEventListener("abort", handleAbort, { once: true });
      }

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        finish(() => reject(error), timeoutId);
      });

      child.on("close", (exitCode) => {
        finish(
          () =>
            resolve({
              exitCode,
              stdout,
              stderr,
            }),
          timeoutId,
        );
      });

      if (typeof options.input === "string" && options.input.length > 0) {
        child.stdin.write(options.input, "utf8");
      }
      child.stdin.end();
    });
  }
}
