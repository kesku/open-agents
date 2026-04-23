import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const requestedUrls: string[] = [];

let modelsDevApiData: unknown = {};
let openAiModelsApiData: unknown = {};
let customProviderModelsApiData: unknown = {};
let currentSession: { user: { id: string } } | null = {
  user: { id: "user-1" },
};
let customProviders: Array<{
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
}> = [];

const originalFetch = globalThis.fetch;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
const originalPublicOpenAiBaseUrl = process.env.NEXT_PUBLIC_OPENAI_BASE_URL;

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

mock.module("server-only", () => ({}));
mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));
mock.module("@/lib/db/model-providers", () => ({
  getModelProviderRuntimeConfigs: async () => customProviders,
}));

const routeModulePromise = import("./route");
const modelsWithContextModulePromise = import("@/lib/models-with-context");

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }

  if (originalOpenAiBaseUrl === undefined) {
    delete process.env.OPENAI_BASE_URL;
  } else {
    process.env.OPENAI_BASE_URL = originalOpenAiBaseUrl;
  }

  if (originalPublicOpenAiBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_OPENAI_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_OPENAI_BASE_URL = originalPublicOpenAiBaseUrl;
  }
});

describe("/api/models context window enrichment", () => {
  beforeEach(() => {
    requestedUrls.length = 0;
    modelsDevApiData = {};
    openAiModelsApiData = {};
    customProviderModelsApiData = {};
    currentSession = { user: { id: "user-1" } };
    customProviders = [];
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_BASE_URL;
    delete process.env.NEXT_PUBLIC_OPENAI_BASE_URL;

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const requestUrl = getRequestUrl(input);
      requestedUrls.push(requestUrl);

      if (requestUrl === "https://models.dev/api.json") {
        return Promise.resolve(
          new Response(JSON.stringify(modelsDevApiData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (requestUrl === "https://api.openai.com/v1/models") {
        return Promise.resolve(
          new Response(JSON.stringify(openAiModelsApiData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify(customProviderModelsApiData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as unknown as typeof fetch;
  });

  test("returns 401 when unauthenticated", async () => {
    currentSession = null;
    const { GET } = await routeModulePromise;

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Not authenticated");
  });

  test("overrides catalog context windows from models.dev", async () => {
    openAiModelsApiData = {
      data: [{ id: "gpt-5.4" }, { id: "gpt-5.4-mini" }, { id: "gpt-5-mini" }],
    };
    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5.4": {
            limit: { context: 400_000 },
          },
          "gpt-5.4-mini": {
            limit: { context: 128_000 },
          },
          "gpt-5-mini": {
            limit: { context: 200_000 },
          },
        },
      },
    };

    const { clearAvailableLanguageModelsCacheForTests } =
      await modelsWithContextModulePromise;
    clearAvailableLanguageModelsCacheForTests();

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{ id: string; context_window?: number }>;
    };
    const contextById = new Map(
      body.models.map((model) => [model.id, model.context_window]),
    );

    expect(contextById.get("openai/gpt-5.4")).toBe(400_000);
    expect(contextById.get("openai/gpt-5.4-mini")).toBe(128_000);
    expect(contextById.get("openai/gpt-5-mini")).toBe(200_000);
    expect(requestedUrls).toContain("https://api.openai.com/v1/models");
    expect(requestedUrls).toContain("https://models.dev/api.json");
  });

  test("applies base metadata to custom provider models", async () => {
    delete process.env.OPENAI_API_KEY;
    customProviders = [
      {
        id: "openrouter",
        name: "OpenRouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: "or-key",
      },
    ];
    customProviderModelsApiData = {
      data: [{ id: "openai/gpt-5.4" }],
    };
    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5.4": {
            limit: { context: 400_000 },
          },
        },
      },
    };

    const { clearAvailableLanguageModelsCacheForTests } =
      await modelsWithContextModulePromise;
    clearAvailableLanguageModelsCacheForTests();

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{ id: string; context_window?: number }>;
    };
    const model = body.models.find(
      (entry) => entry.id === "openrouter/openai/gpt-5.4",
    );

    expect(model?.context_window).toBe(400_000);
    expect(requestedUrls).toContain("https://openrouter.ai/api/v1/models");
  });
});
