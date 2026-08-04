import { describe, expect, mock, test } from "bun:test";
import type { ProviderOptionsByProvider } from "./models";

const createGatewayCalls: Array<Record<string, unknown>> = [];
const createOpenAICalls: Array<Record<string, unknown>> = [];

mock.module("ai", () => {
  const gateway = (modelId: string) => ({ modelId });

  return {
    createGateway: (settings?: Record<string, unknown>) => {
      createGatewayCalls.push(settings ?? {});
      return gateway;
    },
    defaultSettingsMiddleware: (_settings: unknown) => ({
      kind: "default-settings-middleware",
    }),
    gateway,
    wrapLanguageModel: ({ model }: { model: unknown }) => model,
  };
});

mock.module("@ai-sdk/devtools", () => ({
  devToolsMiddleware: () => ({ kind: "devtools-middleware" }),
}));

mock.module("@ai-sdk/openai", () => ({
  createOpenAI: (settings?: Record<string, unknown>) => {
    createOpenAICalls.push(settings ?? {});
    return {
      chat: (modelId: string) => ({ api: "chat", modelId }),
      responses: (modelId: string) => ({ api: "responses", modelId }),
    };
  },
}));

const {
  gateway,
  getProviderOptionsForModel,
  mergeProviderOptions,
  shouldApplyOpenAIReasoningDefaults,
} = await import("./models");

describe("shouldApplyOpenAIReasoningDefaults", () => {
  test("returns true for existing GPT-5 variants", () => {
    expect(shouldApplyOpenAIReasoningDefaults("openai/gpt-5.3")).toBe(true);
    expect(shouldApplyOpenAIReasoningDefaults("openai/gpt-5.4")).toBe(true);
  });

  test("returns true for future GPT-5 variants", () => {
    expect(shouldApplyOpenAIReasoningDefaults("openai/gpt-5.9")).toBe(true);
  });

  test("returns false for non-GPT-5 OpenAI models", () => {
    expect(shouldApplyOpenAIReasoningDefaults("openai/gpt-4o")).toBe(false);
  });
});

describe("getProviderOptionsForModel", () => {
  test("applies adaptive thinking defaults to Anthropic 4.6 models", () => {
    const result = getProviderOptionsForModel("anthropic/claude-sonnet-4.6");

    expect(result).toEqual({
      anthropic: {
        effort: "medium",
        thinking: { type: "adaptive" },
      },
    });
  });

  test("applies adaptive thinking defaults to Anthropic 4.7 models", () => {
    const result = getProviderOptionsForModel("anthropic/claude-opus-4.7");

    expect(result).toEqual({
      anthropic: {
        effort: "medium",
        thinking: { type: "adaptive" },
      },
    });
  });

  test("preserves legacy thinking defaults for older Anthropic models", () => {
    const result = getProviderOptionsForModel("anthropic/claude-opus-4.5");

    expect(result).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 8000,
        },
      },
    });
  });

  test("merges OpenAI defaults with custom variant options", () => {
    const result = getProviderOptionsForModel("openai/gpt-5", {
      openai: {
        reasoningEffort: "medium",
      },
    });

    expect(result).toEqual({
      openai: {
        reasoningSummary: "detailed",
        include: ["reasoning.encrypted_content"],
        reasoningEffort: "medium",
        store: false,
      },
    });
  });

  test("applies low text verbosity defaults to GPT-5.4 snapshots", () => {
    const result = getProviderOptionsForModel("openai/gpt-5.4-2026-03-05");

    expect(result).toEqual({
      openai: {
        reasoningSummary: "detailed",
        include: ["reasoning.encrypted_content"],
        store: false,
        textVerbosity: "low",
      },
    });
  });

  test("preserves store false and encrypted reasoning content for the built-in GPT-5.4 variant", () => {
    const result = getProviderOptionsForModel("openai/gpt-5.4", {
      openai: {
        reasoningEffort: "xhigh",
        reasoningSummary: "auto",
      },
    });

    expect(result).toEqual({
      openai: {
        reasoningEffort: "xhigh",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
        store: false,
        textVerbosity: "low",
      },
    });
  });

  test("enforces store false for OpenAI models even when variant overrides it", () => {
    const result = getProviderOptionsForModel("openai/gpt-5", {
      openai: {
        store: true,
      },
    });

    expect(result).toEqual({
      openai: {
        reasoningSummary: "detailed",
        include: ["reasoning.encrypted_content"],
        store: false,
      },
    });
  });

  test("applies store false to non-GPT-5 OpenAI models", () => {
    const result = getProviderOptionsForModel("openai/gpt-4o");

    expect(result).toEqual({
      openai: {
        store: false,
      },
    });
  });
});

describe("mergeProviderOptions", () => {
  test("returns defaults when overrides are undefined", () => {
    const defaults: ProviderOptionsByProvider = {
      openai: {
        reasoningEffort: "high",
      },
    };

    expect(mergeProviderOptions(defaults)).toEqual(defaults);
  });

  test("deep merges nested provider options", () => {
    const defaults: ProviderOptionsByProvider = {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 8000,
        },
      },
    };

    const overrides: ProviderOptionsByProvider = {
      anthropic: {
        thinking: {
          budgetTokens: 4000,
        },
      },
    };

    expect(mergeProviderOptions(defaults, overrides)).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 4000,
        },
      },
    });
  });

  test("adds provider overrides that do not exist in defaults", () => {
    const defaults: ProviderOptionsByProvider = {
      openai: {
        store: false,
      },
    };

    const overrides: ProviderOptionsByProvider = {
      anthropic: {
        effort: "low",
      },
    };

    expect(mergeProviderOptions(defaults, overrides)).toEqual({
      openai: {
        store: false,
      },
      anthropic: {
        effort: "low",
      },
    });
  });

  test("replaces arrays instead of deep-merging arrays", () => {
    const defaults: ProviderOptionsByProvider = {
      openai: {
        include: ["reasoning.encrypted_content"],
      },
    };

    const overrides: ProviderOptionsByProvider = {
      openai: {
        include: ["reasoning.summary"],
      },
    };

    expect(mergeProviderOptions(defaults, overrides)).toEqual({
      openai: {
        include: ["reasoning.summary"],
      },
    });
  });
});

describe("gateway attribution headers", () => {
  test("sends default attribution headers", () => {
    createGatewayCalls.length = 0;
    gateway("anthropic/claude-sonnet-4.6" as never);

    expect(createGatewayCalls).toEqual([
      {
        headers: {
          "http-referer": "https://open-agents.dev",
          "x-title": "Open Agents",
        },
      },
    ]);
  });

  test("allows overriding attribution via appName and appUrl", () => {
    createGatewayCalls.length = 0;
    gateway("anthropic/claude-sonnet-4.6" as never, {
      appName: "My App",
      appUrl: "https://myapp.com",
    });

    expect(createGatewayCalls).toEqual([
      {
        headers: {
          "http-referer": "https://myapp.com",
          "x-title": "My App",
        },
      },
    ]);
  });

  test("passes attribution headers with custom gateway config", () => {
    createGatewayCalls.length = 0;
    gateway("anthropic/claude-sonnet-4.6" as never, {
      config: { baseURL: "https://custom.api", apiKey: "sk-test" },
    });

    expect(createGatewayCalls).toEqual([
      {
        baseURL: "https://custom.api",
        apiKey: "sk-test",
        headers: {
          "http-referer": "https://open-agents.dev",
          "x-title": "Open Agents",
        },
      },
    ]);
  });
});

describe("OpenAI-compatible providers", () => {
  test("uses a configured provider instead of AI Gateway", () => {
    createGatewayCalls.length = 0;
    createOpenAICalls.length = 0;

    const model = gateway("openrouter/google/gemini-2.5-pro", {
      openAICompatibleProviders: [
        {
          id: "openrouter",
          name: "OpenRouter",
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: "or-key",
        },
      ],
    });

    expect(model as unknown).toEqual({
      api: "chat",
      modelId: "google/gemini-2.5-pro",
    });
    expect(createOpenAICalls).toEqual([
      {
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: "or-key",
      },
    ]);
    expect(createGatewayCalls).toEqual([]);
  });

  test("uses the Responses API for a directly configured OpenAI provider", () => {
    createGatewayCalls.length = 0;
    createOpenAICalls.length = 0;

    const model = gateway("openai/gpt-5.4", {
      openAICompatibleProviders: [
        {
          id: "openai",
          name: "OpenAI",
          baseURL: "https://api.openai.com/v1",
          apiKey: "sk-test",
        },
      ],
    });

    expect(model as unknown).toEqual({
      api: "responses",
      modelId: "gpt-5.4",
    });
    expect(createGatewayCalls).toEqual([]);
  });

  test("keeps AI Gateway as the fallback for unmatched providers", () => {
    createGatewayCalls.length = 0;
    createOpenAICalls.length = 0;

    gateway("anthropic/claude-sonnet-4.6", {
      openAICompatibleProviders: [
        {
          id: "openrouter",
          name: "OpenRouter",
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: "or-key",
        },
      ],
    });

    expect(createOpenAICalls).toEqual([]);
    expect(createGatewayCalls).toHaveLength(1);
  });

  test("supports keyless local OpenAI-compatible providers", () => {
    createGatewayCalls.length = 0;
    createOpenAICalls.length = 0;

    gateway("ollama/qwen3-coder", {
      openAICompatibleProviders: [
        {
          id: "ollama",
          name: "Ollama",
          baseURL: "http://ollama:11434/v1",
        },
      ],
    });

    expect(createOpenAICalls).toEqual([
      {
        name: "ollama",
        baseURL: "http://ollama:11434/v1",
        apiKey: "open-agents-keyless",
      },
    ]);
    expect(createGatewayCalls).toEqual([]);
  });
});
