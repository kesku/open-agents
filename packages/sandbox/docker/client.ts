import { spawn } from "node:child_process";

const MAX_CAPTURE_LENGTH = 100_000;

export interface DockerCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export interface DockerContainerInspection {
  id: string;
  running: boolean;
}

function dockerEnvironment(): NodeJS.ProcessEnv {
  const socketPath = process.env.DOCKER_SOCKET_PATH?.trim();
  if (!socketPath || process.env.DOCKER_HOST) {
    return process.env;
  }
  return { ...process.env, DOCKER_HOST: `unix://${socketPath}` };
}

function appendCaptured(current: string, chunk: string) {
  const next = current + chunk;
  return next.length <= MAX_CAPTURE_LENGTH
    ? { value: next, truncated: false }
    : { value: next.slice(-MAX_CAPTURE_LENGTH), truncated: true };
}

export class DockerClient {
  async run(
    args: string[],
    options: {
      input?: string | Buffer;
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ): Promise<DockerCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("docker", args, {
        env: dockerEnvironment(),
        stdio: "pipe",
      });
      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;
      let settled = false;

      const timeoutId = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeoutMs)
        : undefined;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        options.signal?.removeEventListener("abort", handleAbort);
      };
      const handleAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        child.kill("SIGTERM");
        const error = new Error("Docker command aborted");
        error.name = "AbortError";
        reject(error);
      };

      if (options.signal?.aborted) {
        handleAbort();
        return;
      }
      options.signal?.addEventListener("abort", handleAbort, { once: true });

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        const captured = appendCaptured(stdout, chunk);
        stdout = captured.value;
        truncated ||= captured.truncated;
      });
      child.stderr.on("data", (chunk: string) => {
        const captured = appendCaptured(stderr, chunk);
        stderr = captured.value;
        truncated ||= captured.truncated;
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ exitCode, stdout, stderr, timedOut, truncated });
      });

      if (options.input !== undefined) child.stdin.end(options.input);
      else child.stdin.end();
    });
  }

  async inspectContainer(
    name: string,
  ): Promise<DockerContainerInspection | null> {
    const result = await this.run(["inspect", "--type", "container", name]);
    if (result.exitCode !== 0) {
      const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
      if (output.includes("no such") || output.includes("not found"))
        return null;
      throw new Error(
        result.stderr || result.stdout || "Docker inspect failed",
      );
    }
    const parsed = JSON.parse(result.stdout) as unknown;
    if (!Array.isArray(parsed) || !parsed[0] || typeof parsed[0] !== "object") {
      return null;
    }
    const item = parsed[0] as Record<string, unknown>;
    const state =
      item.State && typeof item.State === "object"
        ? (item.State as Record<string, unknown>)
        : {};
    return {
      id: typeof item.Id === "string" ? item.Id : name,
      running: state.Running === true,
    };
  }

  async volumeExists(name: string): Promise<boolean> {
    const result = await this.run(["volume", "inspect", name]);
    if (result.exitCode === 0) return true;
    const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
    if (output.includes("no such") || output.includes("not found"))
      return false;
    throw new Error(
      result.stderr || result.stdout || "Docker volume inspect failed",
    );
  }

  async requireSuccess(args: string[], input?: string | Buffer): Promise<void> {
    const result = await this.run(args, { input, timeoutMs: 60_000 });
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || result.stdout || `docker ${args[0]} failed`,
      );
    }
  }
}
