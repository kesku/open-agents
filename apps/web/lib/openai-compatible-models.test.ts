import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const originalFetch = globalThis.fetch;
const requestedUrls: string[] = [];

const { fetchOpenAICompatibleLanguageModels } =
  await import("./openai-compatible-models");

beforeEach(() => {
  requestedUrls.length = 0;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("OpenAI-compatible model discovery", () => {
  test("prefixes discovered language models with the configured provider", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      requestedUrls.push(input.toString());
      return Promise.resolve(
        Response.json({
          data: [
            { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
            { id: "text-embedding-3-small" },
            { id: "flux-image" },
          ],
        }),
      );
    }) as unknown as typeof fetch;

    const models = await fetchOpenAICompatibleLanguageModels([
      {
        id: "openrouter",
        name: "OpenRouter",
        baseURL: "https://openrouter.ai/api/v1/",
        apiKey: "or-key",
      },
    ]);

    expect(requestedUrls).toEqual(["https://openrouter.ai/api/v1/models"]);
    expect(models).toEqual([
      {
        id: "openrouter/google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        description: "Discovered from OpenRouter via /models",
        modelType: "language",
      },
    ]);
  });

  test("isolates failures to the provider that failed", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.startsWith("https://offline.example")) {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve(Response.json({ data: [{ id: "local-model" }] }));
    }) as unknown as typeof fetch;

    const models = await fetchOpenAICompatibleLanguageModels([
      {
        id: "offline",
        name: "Offline",
        baseURL: "https://offline.example/v1",
        apiKey: "offline-key",
      },
      {
        id: "working",
        name: "Working",
        baseURL: "https://working.example/v1",
        apiKey: "working-key",
      },
    ]);

    expect(models.map((model) => model.id)).toEqual(["working/local-model"]);
  });

  test("omits authorization for keyless local providers", async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return Promise.resolve(Response.json({ data: [{ id: "qwen3" }] }));
    }) as unknown as typeof fetch;

    const models = await fetchOpenAICompatibleLanguageModels([
      {
        id: "ollama",
        name: "Ollama",
        baseURL: "http://ollama:11434/v1",
      },
    ]);

    expect(models[0]?.id).toBe("ollama/qwen3");
    expect(requestInit?.headers).toBeUndefined();
  });
});
