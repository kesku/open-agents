import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const gatewayCalls: Array<{
  modelId: string;
  options: Record<string, unknown>;
}> = [];
let defaultModelId = "openrouter/google/gemini-2.5-pro";
let modelVariants: Array<{
  id: string;
  name: string;
  baseModelId: string;
  providerOptions: Record<string, never>;
}> = [];
let runtimeProviders = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "or-key",
  },
];

mock.module("@open-agents/agent", () => ({
  gateway: (modelId: string, options: Record<string, unknown>) => {
    gatewayCalls.push({ modelId, options });
    return { modelId };
  },
}));

mock.module("@/lib/db/user-preferences", () => ({
  getUserPreferences: async () => ({ defaultModelId, modelVariants }),
}));

mock.module("@/lib/db/model-providers", () => ({
  getModelProviderRuntimeConfigs: async () => runtimeProviders,
}));

const { getHelperLanguageModel } = await import("./model-runtime");

beforeEach(() => {
  gatewayCalls.length = 0;
  defaultModelId = "openrouter/google/gemini-2.5-pro";
  modelVariants = [];
  runtimeProviders = [
    {
      id: "openrouter",
      name: "OpenRouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "or-key",
    },
  ];
});

describe("helper model runtime", () => {
  test("uses the user's default model when its direct provider is configured", async () => {
    await getHelperLanguageModel("user-1");

    expect(gatewayCalls).toEqual([
      {
        modelId: "openrouter/google/gemini-2.5-pro",
        options: {
          providerOptionsOverrides: undefined,
          openAICompatibleProviders: runtimeProviders,
        },
      },
    ]);
  });

  test("preserves the existing fast Gateway model when no direct provider matches", async () => {
    defaultModelId = "openai/gpt-5.4";

    await getHelperLanguageModel("user-1");

    expect(gatewayCalls[0]?.modelId).toBe("anthropic/claude-haiku-4.5");
    expect(gatewayCalls[0]?.options.openAICompatibleProviders).toBe(
      runtimeProviders,
    );
  });
});
