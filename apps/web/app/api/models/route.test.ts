import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

interface MockGatewayModel extends Record<string, unknown> {
  id: string;
  name?: string;
  description?: string | null;
  modelType: string;
  context_window?: number;
}

const gatewayModels: MockGatewayModel[] = [];
const requestedUrls: string[] = [];

let gatewayError: unknown = null;
let modelsDevApiData: unknown = {};
let customProviderModelsApiData: unknown = {};
let customProviders: Array<{
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
}> = [];
let currentSession: {
  authProvider?: "vercel" | "github";
  user: { id: string; email?: string; username?: string; avatar?: string };
} | null = null;

const originalFetch = globalThis.fetch;
const originalDeploymentMode = process.env.OPEN_AGENTS_DEPLOYMENT_MODE;

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

mock.module("ai", () => ({
  gateway: {
    getAvailableModels: async () => {
      if (gatewayError) {
        throw gatewayError;
      }

      return { models: gatewayModels };
    },
  },
}));

mock.module("server-only", () => ({}));

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/db/model-providers", () => ({
  getModelProviderRuntimeConfigs: async () => customProviders,
}));

const routeModulePromise = import("./route");

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalDeploymentMode === undefined) {
    delete process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
  } else {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = originalDeploymentMode;
  }
});

describe("/api/models context window enrichment", () => {
  beforeEach(() => {
    gatewayModels.length = 0;
    requestedUrls.length = 0;
    gatewayError = null;
    modelsDevApiData = {};
    customProviderModelsApiData = {};
    customProviders = [];
    currentSession = null;
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "local";

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const requestUrl = getRequestUrl(input);
      requestedUrls.push(requestUrl);
      return Promise.resolve(
        new Response(
          JSON.stringify(
            requestUrl === "https://models.dev/api.json"
              ? modelsDevApiData
              : customProviderModelsApiData,
          ),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }) as unknown as typeof fetch;
  });

  test("overrides gateway context windows from models.dev", async () => {
    gatewayModels.push(
      {
        id: "openai/gpt-5.3-codex",
        modelType: "language",
        context_window: 200_000,
      },
      {
        id: "anthropic/claude-opus-4.6",
        modelType: "language",
        context_window: 200_000,
      },
      {
        id: "openai/gpt-4o-mini",
        modelType: "language",
        context_window: 128_000,
      },
      {
        id: "openai/image-gen",
        modelType: "image",
        context_window: 200_000,
      },
    );

    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5.3-codex": {
            limit: { context: 400_000 },
          },
        },
      },
      anthropic: {
        models: {
          "claude-opus-4.6": {
            limit: { context: 1_000_000 },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{ id: string; context_window?: number }>;
    };
    const contextById = new Map(
      body.models.map((model) => [model.id, model.context_window]),
    );

    expect(contextById.get("openai/gpt-5.3-codex")).toBe(400_000);
    expect(contextById.get("anthropic/claude-opus-4.6")).toBe(1_000_000);
    expect(contextById.get("openai/gpt-4o-mini")).toBe(128_000);
    expect(contextById.has("openai/image-gen")).toBe(false);
    expect(requestedUrls).toContain("https://models.dev/api.json");
  });

  test("hides Claude Opus models for managed trial users", async () => {
    gatewayModels.push(
      {
        id: "anthropic/claude-opus-4.6",
        modelType: "language",
      },
      {
        id: "anthropic/claude-haiku-4.5",
        modelType: "language",
      },
    );
    currentSession = {
      authProvider: "vercel",
      user: { id: "user-1", email: "person@example.com" },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request("https://open-agents.dev/api/models"),
    );
    const body = (await response.json()) as {
      models: Array<{ id: string }>;
    };

    expect(body.models.map((model) => model.id)).toEqual([
      "anthropic/claude-haiku-4.5",
    ]);
  });

  test("keeps gateway context window when models.dev only has related ids", async () => {
    gatewayModels.push({
      id: "openai/gpt-5.3-codex-2026-02-15",
      modelType: "language",
      context_window: 200_000,
    });

    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5": {
            limit: { context: 272_000 },
          },
          "gpt-5.3-codex": {
            limit: { context: 400_000 },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{ id: string; context_window?: number }>;
    };

    expect(body.models).toHaveLength(1);
    expect(body.models[0]?.context_window).toBe(200_000);
  });

  test("keeps valid models.dev metadata when sibling fields are invalid", async () => {
    gatewayModels.push({
      id: "openai/gpt-5.3-codex",
      modelType: "language",
      context_window: 200_000,
    });

    modelsDevApiData = {
      invalidProvider: "bad",
      openai: {
        models: {
          "gpt-5.3-codex": {
            limit: { context: "400_000" },
            cost: {
              input: 1.25,
              output: 10,
              context_over_200k: {
                input: 2.5,
              },
            },
          },
          broken: {
            limit: { context: "not-a-number" },
            cost: { input: "expensive" },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{
        id: string;
        context_window?: number;
        cost?: {
          input?: number;
          output?: number;
          context_over_200k?: {
            input?: number;
          };
        };
      }>;
    };

    expect(body.models).toHaveLength(1);
    expect(body.models[0]).toMatchObject({
      id: "openai/gpt-5.3-codex",
      context_window: 200_000,
      cost: {
        input: 1.25,
        output: 10,
        context_over_200k: {
          input: 2.5,
        },
      },
    });
  });

  test("recovers from gateway validation errors when response still includes models", async () => {
    gatewayError = {
      response: {
        models: [
          {
            id: "openai/gpt-5.4",
            name: "GPT 5.4",
            description: "Latest GPT model",
            modelType: "language",
          },
          {
            id: "openai/gpt-5.4-broken",
            modelType: "language",
          },
          {
            id: "cohere/rerank-v3.5",
            name: "Cohere Rerank 3.5",
            description: "Reranking model",
            modelType: "reranking",
          },
        ],
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{
        id: string;
        name: string;
        description?: string | null;
        modelType?: string;
      }>;
    };

    expect(body.models).toEqual([
      {
        id: "openai/gpt-5.4",
        name: "GPT 5.4",
        description: "Latest GPT model",
        modelType: "language",
      },
    ]);
  });

  test("discovers per-user provider models when AI Gateway is unavailable", async () => {
    currentSession = {
      authProvider: "github",
      user: { id: "user-1", email: "person@example.com" },
    };
    gatewayError = new Error("AI Gateway is not configured");
    customProviders = [
      {
        id: "openrouter",
        name: "OpenRouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: "or-key",
      },
    ];
    customProviderModelsApiData = {
      data: [
        { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
        { id: "text-embedding-3-small" },
      ],
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));
    const body = (await response.json()) as {
      models: Array<{ id: string; name: string }>;
    };

    expect(response.ok).toBe(true);
    expect(body.models).toEqual([
      expect.objectContaining({
        id: "openrouter/google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
      }),
    ]);
    expect(requestedUrls).toContain("https://openrouter.ai/api/v1/models");
  });

  test("returns an empty catalog locally when no model backend is configured", async () => {
    currentSession = {
      authProvider: "github",
      user: { id: "user-1", email: "person@example.com" },
    };
    gatewayError = new Error("AI Gateway is not configured");

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));
    const body = (await response.json()) as { models: unknown[] };

    expect(response.ok).toBe(true);
    expect(body.models).toEqual([]);
  });

  test("preserves Gateway discovery failure semantics for hosted deployments", async () => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "vercel";
    gatewayError = new Error("AI Gateway is not configured");

    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request("https://open-agents.dev/api/models"),
    );

    expect(response.status).toBe(500);
  });
});
