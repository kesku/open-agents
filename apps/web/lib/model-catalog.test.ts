import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let customProviders: Array<{
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
}> = [];

mock.module("@/lib/db/model-providers", () => ({
  getModelProviderRuntimeConfigs: async () => customProviders,
}));

const originalFetch = globalThis.fetch;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
const originalPublicOpenAiBaseUrl = process.env.NEXT_PUBLIC_OPENAI_BASE_URL;

let openAiModelsApiData: unknown = {};
let customProviderModelsApiData: unknown = {};
const requestedUrls: string[] = [];

const {
  clearModelCatalogCacheForTests,
  getAvailableLanguageModelsFromCatalog,
} = await import("./model-catalog");

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

describe("model catalog", () => {
  beforeEach(() => {
    requestedUrls.length = 0;
    openAiModelsApiData = {};
    customProviderModelsApiData = {};
    customProviders = [];
    clearModelCatalogCacheForTests();
    delete process.env.OPENAI_BASE_URL;
    delete process.env.NEXT_PUBLIC_OPENAI_BASE_URL;

    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const requestUrl = getRequestUrl(input);
      requestedUrls.push(requestUrl);

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

  afterEach(() => {
    clearModelCatalogCacheForTests();
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

  test("filters OpenAI /v1/models down to usable chat and responses models", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    openAiModelsApiData = {
      data: [
        { id: "gpt-5.4" },
        { id: "gpt-5-mini" },
        { id: "o4-mini" },
        { id: "codex-mini-latest" },
        { id: "gpt-image-1" },
        { id: "text-embedding-3-small" },
        { id: "whisper-1" },
      ],
    };

    const models = await getAvailableLanguageModelsFromCatalog();
    const modelIds = models.map((model) => model.id);

    expect(modelIds).toContain("openai/gpt-5.4");
    expect(modelIds).toContain("openai/gpt-5-mini");
    expect(modelIds).toContain("openai/o4-mini");
    expect(modelIds).toContain("openai/codex-mini-latest");
    expect(modelIds).not.toContain("openai/gpt-image-1");
    expect(modelIds).not.toContain("openai/text-embedding-3-small");
    expect(modelIds).not.toContain("openai/whisper-1");
    expect(requestedUrls).toEqual(["https://api.openai.com/v1/models"]);
  });

  test("discovers models from custom OpenAI-compatible providers", async () => {
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
      data: [
        { id: "google/gemini-2.5-pro" },
        { id: "openai/gpt-5.1" },
        { id: "text-embedding-3-small" },
      ],
    };

    const models = await getAvailableLanguageModelsFromCatalog("user-1");
    const modelIds = models.map((model) => model.id);

    expect(modelIds).toContain("openrouter/google/gemini-2.5-pro");
    expect(modelIds).toContain("openrouter/openai/gpt-5.1");
    expect(modelIds).not.toContain("openrouter/text-embedding-3-small");
    expect(requestedUrls).toEqual(["https://openrouter.ai/api/v1/models"]);
  });
});
