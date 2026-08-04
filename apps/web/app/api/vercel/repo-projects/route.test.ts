import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { VercelProjectSelection } from "@/lib/vercel/types";

let currentSession: { user: { id: string } } | null = {
  user: { id: "user-1" },
};
let currentToken: string | null = "token";
let savedLink: VercelProjectSelection | null = null;
let projects: VercelProjectSelection[] = [];
let projectsError: Error | null = null;
const originalServerMode = process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
const originalPublicMode = process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE;

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/vercel/token", () => ({
  getUserVercelToken: async () => currentToken,
}));

mock.module("@/lib/db/vercel-project-links", () => ({
  getVercelProjectLinkByRepo: async () => savedLink,
}));

mock.module("@/lib/vercel/projects", () => ({
  isVercelInvalidTokenError: (error: unknown) =>
    projectsError !== null && error === projectsError,
  listMatchingVercelProjects: async () => {
    if (projectsError) {
      throw projectsError;
    }
    return projects;
  },
}));

const routeModulePromise = import("./route");

afterAll(() => {
  if (originalServerMode === undefined) {
    delete process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
  } else {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = originalServerMode;
  }
  if (originalPublicMode === undefined) {
    delete process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE;
  } else {
    process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE = originalPublicMode;
  }
});

describe("/api/vercel/repo-projects", () => {
  beforeEach(() => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "vercel";
    process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE = "vercel";
    currentSession = { user: { id: "user-1" } };
    currentToken = "token";
    savedLink = null;
    projects = [];
    projectsError = null;
  });

  test("is unavailable in local deployments", async () => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "local";
    process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE = "local";
    const { GET } = await routeModulePromise;

    const response = await GET(
      new Request(
        "http://localhost/api/vercel/repo-projects?repoOwner=vercel&repoName=open-agents",
      ),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  test("returns the remembered default when it still exists in live candidates", async () => {
    const { GET } = await routeModulePromise;

    savedLink = {
      projectId: "project-2",
      projectName: "marketing",
      teamId: "team-1",
      teamSlug: "acme",
    };
    projects = [
      {
        projectId: "project-1",
        projectName: "app",
        teamId: null,
        teamSlug: null,
      },
      savedLink,
    ];

    const response = await GET(
      new Request(
        "http://localhost/api/vercel/repo-projects?repoOwner=vercel&repoName=open-agents",
      ),
    );
    const body = (await response.json()) as {
      projects: VercelProjectSelection[];
      selectedProjectId: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.projects).toEqual(projects);
    expect(body.selectedProjectId).toBe("project-2");
  });

  test("auto-selects the lone matching live project when there is no saved default", async () => {
    const { GET } = await routeModulePromise;

    projects = [
      {
        projectId: "project-1",
        projectName: "app",
        teamId: null,
        teamSlug: null,
      },
    ];

    const response = await GET(
      new Request(
        "http://localhost/api/vercel/repo-projects?repoOwner=vercel&repoName=open-agents",
      ),
    );
    const body = (await response.json()) as {
      selectedProjectId: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.selectedProjectId).toBe("project-1");
  });

  test("asks the client to reconnect Vercel when the token is invalid", async () => {
    const { GET } = await routeModulePromise;

    projectsError = new Error("invalid Vercel token");

    const response = await GET(
      new Request(
        "http://localhost/api/vercel/repo-projects?repoOwner=vercel&repoName=open-agents",
      ),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Reconnect Vercel to load matching projects");
  });
});
