import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  buildContainerName,
  buildQuarantineRoot,
  buildSandboxHost,
  buildStableRouteSlug,
  buildWorkspaceHostPath,
} from "./docker-route";

describe("docker sandbox routing helpers", () => {
  test("buildStableRouteSlug is deterministic and opaque", () => {
    const slug = buildStableRouteSlug("session-123");

    expect(slug).toBe(buildStableRouteSlug("session-123"));
    expect(slug).toMatch(/^oa-[a-f0-9]{12}$/);
    expect(slug).not.toContain("session-123");
  });

  test("builds container, workspace, quarantine, and host paths", () => {
    const routeSlug = "oa-123456789abc";
    const workspaceRoot = "/var/lib/open-agents/workspaces";

    expect(buildContainerName(routeSlug)).toBe("open-agents-oa-123456789abc");
    expect(buildWorkspaceHostPath(workspaceRoot, routeSlug)).toBe(
      path.join(workspaceRoot, routeSlug),
    );
    expect(buildQuarantineRoot(workspaceRoot)).toBe(
      path.join(workspaceRoot, "_quarantine"),
    );
    expect(buildSandboxHost(routeSlug, 3000, "sandboxes.example.test")).toBe(
      "oa-123456789abc-3000.sandboxes.example.test",
    );
  });
});
