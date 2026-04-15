import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const originalFetch = globalThis.fetch;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
const originalPublicOpenAiBaseUrl = process.env.NEXT_PUBLIC_OPENAI_BASE_URL;
const originalPerplexityApiKey = process.env.PERPLEXITY_API_KEY;
const originalPerplexityBaseUrl = process.env.PERPLEXITY_BASE_URL;

let openAiModelsApiData: unknown = {};
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
    clearModelCatalogCacheForTests();
    delete process.env.OPENAI_BASE_URL;
    delete process.env.NEXT_PUBLIC_OPENAI_BASE_URL;
    delete process.env.PERPLEXITY_BASE_URL;

    globalThis.fetch = mock((input: RequestInfo | URL) => {
      requestedUrls.push(getRequestUrl(input));
      return Promise.resolve(
        new Response(JSON.stringify(openAiModelsApiData), {
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

  test("filters OpenAI /v1/models down to usable chat and responses models", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.PERPLEXITY_API_KEY;
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

  test("surfaces Perplexity catalog entries without reintroducing direct Anthropic models", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.PERPLEXITY_API_KEY = "test-perplexity-key";

    const models = await getAvailableLanguageModelsFromCatalog();
    const modelIds = models.map((model) => model.id);

    expect(modelIds).toContain("perplexity/sonar");
    expect(modelIds).toContain("perplexity/openai/gpt-5.4");
    expect(modelIds).toContain("perplexity/anthropic/claude-opus-4-6");
    expect(modelIds).toContain("perplexity/google/gemini-3.1-pro-preview");
    expect(modelIds).not.toContain("anthropic/claude-opus-4.6");
    expect(requestedUrls).toHaveLength(0);
  });
});
