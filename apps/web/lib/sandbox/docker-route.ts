import { createHash } from "node:crypto";
import path from "node:path";

const ROUTE_SLUG_PREFIX = "oa";
const ROUTE_SLUG_HASH_LENGTH = 12;
const CONTAINER_NAME_PREFIX = "open-agents";

export function buildStableRouteSlug(sessionId: string): string {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  return `${ROUTE_SLUG_PREFIX}-${digest.slice(0, ROUTE_SLUG_HASH_LENGTH)}`;
}

export function buildContainerName(routeSlug: string): string {
  return `${CONTAINER_NAME_PREFIX}-${routeSlug}`;
}

export function buildWorkspaceHostPath(
  workspaceRoot: string,
  routeSlug: string,
): string {
  return path.join(workspaceRoot, routeSlug);
}

export function buildQuarantineRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, "_quarantine");
}

export function buildSandboxHost(
  routeSlug: string,
  port: number,
  domainSuffix: string,
): string {
  return `${routeSlug}-${port}.${domainSuffix}`;
}
