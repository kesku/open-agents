import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const requestedUrls: string[] = [];

let modelsDevApiData: unknown = {};
let openAiModelsApiData: unknown = {};

const originalFetch = globalThis.fetch;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
const originalPublicOpenAiBaseUrl = process.env.NEXT_PUBLIC_OPENAI_BASE_URL;
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
const originalPerplexityApiKey = process.env.PERPLEXITY_API_KEY;
const originalPerplexityBaseUrl = process.env.PERPLEXITY_BASE_URL;

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

const routeModulePromise = import("./route");
const modelsWithContextModulePromise = import("@/lib/models-with-context");

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }

  if (originalAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
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

  if (originalPerplexityApiKey === undefined) {
    delete process.env.PERPLEXITY_API_KEY;
  } else {
    process.env.PERPLEXITY_API_KEY = originalPerplexityApiKey;
  }

  if (originalPerplexityBaseUrl === undefined) {
    delete process.env.PERPLEXITY_BASE_URL;
  } else {
    process.env.PERPLEXITY_BASE_URL = originalPerplexityBaseUrl;
  }
});

describe("/api/models context window enrichment", () => {
  beforeEach(() => {
    requestedUrls.length = 0;
    modelsDevApiData = {};
    openAiModelsApiData = {};
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_BASE_URL;
    delete process.env.NEXT_PUBLIC_OPENAI_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_BASE_URL;

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

      return Promise.resolve(
        new Response(JSON.stringify(openAiModelsApiData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as unknown as typeof fetch;
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

  test("keeps catalog context window unchanged when models.dev only has related ids", async () => {
    openAiModelsApiData = {
      data: [
        { id: "gpt-5.4" },
        { id: "gpt-5.4-mini" },
        { id: "gpt-5.2" },
        { id: "gpt-5.1" },
        { id: "gpt-5-mini" },
      ],
    };
    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5.4-preview": {
            limit: { context: 400_000 },
          },
          "gpt-5.2": {
            limit: { context: 272_000 },
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

    expect(body.models.map((model) => model.id)).toEqual([
      "openai/gpt-5.4",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.2",
      "openai/gpt-5.1",
      "openai/gpt-5-mini",
    ]);
    expect(contextById.get("openai/gpt-5.4")).toBeUndefined();
    expect(contextById.get("openai/gpt-5.2")).toBe(272_000);
  });
});
