import "server-only";

export class DockerSandboxCapacityError extends Error {
  readonly reason = "capacity-exhausted";

  constructor(message = "All local sandbox capacity is currently in use.") {
    super(message);
    this.name = "DockerSandboxCapacityError";
  }
}
