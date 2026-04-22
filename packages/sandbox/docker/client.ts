import { spawn } from "node:child_process";

export interface DockerExecOptions {
  input?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DockerExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface DockerInfo {
  ncpu: number;
  memTotalBytes: number;
}

export interface DockerInspectNetwork {
  IPAddress?: string;
}

export interface DockerInspectContainer {
  id: string;
  name: string;
  created?: string;
  state: {
    running: boolean;
    status?: string;
  };
  config: {
    labels: Record<string, string>;
  };
  networkSettings: {
    networks: Record<string, DockerInspectNetwork>;
  };
}

function getOptionalEnvString(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getDockerEnv(): NodeJS.ProcessEnv {
  const socketPath = getOptionalEnvString("DOCKER_SOCKET_PATH");
  if (!socketPath || getOptionalEnvString("DOCKER_HOST")) {
    return process.env;
  }

  return {
    ...process.env,
    DOCKER_HOST: `unix://${socketPath}`,
  };
}

function getDockerBin(): string {
  return getOptionalEnvString("DOCKER_BIN") ?? "docker";
}

function parseInspectContainer(value: unknown): DockerInspectContainer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const stateRecord =
    record.State && typeof record.State === "object"
      ? (record.State as Record<string, unknown>)
      : {};
  const configRecord =
    record.Config && typeof record.Config === "object"
      ? (record.Config as Record<string, unknown>)
      : {};
  const networkSettingsRecord =
    record.NetworkSettings && typeof record.NetworkSettings === "object"
      ? (record.NetworkSettings as Record<string, unknown>)
      : {};
  const labelsRecord =
    configRecord.Labels && typeof configRecord.Labels === "object"
      ? (configRecord.Labels as Record<string, unknown>)
      : {};
  const networksRecord =
    networkSettingsRecord.Networks &&
    typeof networkSettingsRecord.Networks === "object"
      ? (networkSettingsRecord.Networks as Record<string, unknown>)
      : {};

  const labels = Object.fromEntries(
    Object.entries(labelsRecord).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const networks = Object.fromEntries(
    Object.entries(networksRecord).map(([name, networkValue]) => {
      const networkRecord =
        networkValue && typeof networkValue === "object"
          ? (networkValue as Record<string, unknown>)
          : {};

      return [
        name,
        {
          IPAddress:
            typeof networkRecord.IPAddress === "string"
              ? networkRecord.IPAddress
              : undefined,
        },
      ];
    }),
  );

  const id = typeof record.Id === "string" ? record.Id : "";
  const rawName = typeof record.Name === "string" ? record.Name : "";
  const name = rawName.replace(/^\//, "");
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    created: typeof record.Created === "string" ? record.Created : undefined,
    state: {
      running: stateRecord.Running === true,
      status:
        typeof stateRecord.Status === "string" ? stateRecord.Status : undefined,
    },
    config: {
      labels,
    },
    networkSettings: {
      networks,
    },
  };
}

export class DockerClient {
  async exec(
    args: string[],
    options: DockerExecOptions = {},
  ): Promise<DockerExecResult> {
    const dockerBin = getDockerBin();

    return new Promise<DockerExecResult>((resolve, reject) => {
      const child = spawn(dockerBin, args, {
        env: getDockerEnv(),
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
          reject(new Error("Docker command aborted"));
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

  async inspectContainer(
    container: string,
  ): Promise<DockerInspectContainer | null> {
    const result = await this.exec(["inspect", container]);
    if (result.exitCode !== 0) {
      const normalizedError =
        `${result.stderr}\n${result.stdout}`.toLowerCase();
      if (
        normalizedError.includes("no such object") ||
        normalizedError.includes("no such container")
      ) {
        return null;
      }
      throw new Error(
        result.stderr ||
          result.stdout ||
          `Failed to inspect container ${container}`,
      );
    }

    const parsed = JSON.parse(result.stdout) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    return parseInspectContainer(parsed[0]);
  }

  async inspectContainers(
    containers: string[],
  ): Promise<DockerInspectContainer[]> {
    if (containers.length === 0) {
      return [];
    }

    const result = await this.exec(["inspect", ...containers]);
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || result.stdout || "Failed to inspect Docker containers",
      );
    }

    const parsed = JSON.parse(result.stdout) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => parseInspectContainer(entry))
      .filter((entry): entry is DockerInspectContainer => entry !== null);
  }

  async listContainerIdsByLabel(params: {
    labels: Record<string, string | undefined>;
    all?: boolean;
  }): Promise<string[]> {
    const args = ["ps"];
    if (params.all) {
      args.push("-a");
    }
    args.push("-q");

    for (const [key, value] of Object.entries(params.labels)) {
      if (typeof value === "string" && value.length > 0) {
        args.push("--filter", `label=${key}=${value}`);
      } else {
        args.push("--filter", `label=${key}`);
      }
    }

    const result = await this.exec(args);
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || result.stdout || "Failed to list Docker containers",
      );
    }

    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async listContainersByLabel(params: {
    labels: Record<string, string | undefined>;
    all?: boolean;
  }): Promise<DockerInspectContainer[]> {
    const ids = await this.listContainerIdsByLabel(params);
    return this.inspectContainers(ids);
  }

  async removeContainer(
    container: string,
    options?: { force?: boolean },
  ): Promise<void> {
    const args = ["rm"];
    if (options?.force ?? true) {
      args.push("-f");
    }
    args.push(container);

    const result = await this.exec(args);
    if (result.exitCode !== 0) {
      const normalizedError =
        `${result.stderr}\n${result.stdout}`.toLowerCase();
      if (
        normalizedError.includes("no such container") ||
        normalizedError.includes("no such object")
      ) {
        return;
      }
      throw new Error(
        result.stderr ||
          result.stdout ||
          `Failed to remove container ${container}`,
      );
    }
  }

  async getInfo(): Promise<DockerInfo> {
    const result = await this.exec(["info", "--format", "{{json .}}"]);
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || result.stdout || "Failed to read Docker info",
      );
    }

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    return {
      ncpu:
        typeof parsed.NCPU === "number" && Number.isFinite(parsed.NCPU)
          ? parsed.NCPU
          : 0,
      memTotalBytes:
        typeof parsed.MemTotal === "number" && Number.isFinite(parsed.MemTotal)
          ? parsed.MemTotal
          : 0,
    };
  }
}
