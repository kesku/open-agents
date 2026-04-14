import { filterDisabledModels } from "./model-availability";
export { DEFAULT_FAST_MODEL_ID, DEFAULT_MODEL_ID } from "./model-defaults";
export const DEFAULT_CONTEXT_LIMIT = 200_000;
const TOKENS_PER_MILLION = 1_000_000;

export interface AvailableModelCostTier {
  input?: number;
  output?: number;
  cache_read?: number;
}

export interface AvailableModelCost extends AvailableModelCostTier {
  context_over_200k?: AvailableModelCostTier;
}

export interface AvailableModel {
  id: string;
  modelType: "language";
  name: string;
  provider: "openai" | "anthropic";
  description?: string;
  context_window?: number;
  cost?: AvailableModelCost;
}

const AVAILABLE_LANGUAGE_MODELS_BY_PROVIDER: Record<
  AvailableModel["provider"],
  AvailableModel[]
> = {
  openai: [
    {
      id: "openai/gpt-5.4",
      name: "GPT-5.4",
      provider: "openai",
      modelType: "language",
      description: "OpenAI default frontier model",
    },
    {
      id: "openai/gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      provider: "openai",
      modelType: "language",
      description: "Fast OpenAI model for helper flows",
    },
    {
      id: "openai/gpt-5.4-nano",
      name: "GPT-5.4 Nano",
      provider: "openai",
      modelType: "language",
      description: "Lowest-cost OpenAI option",
    },
    {
      id: "openai/gpt-5",
      name: "GPT-5",
      provider: "openai",
      modelType: "language",
      description: "General OpenAI GPT-5 model",
    },
  ],
  anthropic: [
    {
      id: "anthropic/claude-opus-4.6",
      name: "Claude Opus 4.6",
      provider: "anthropic",
      modelType: "language",
      description: "Anthropic high-capability model",
    },
    {
      id: "anthropic/claude-sonnet-4.6",
      name: "Claude Sonnet 4.6",
      provider: "anthropic",
      modelType: "language",
      description: "Balanced Anthropic model",
    },
    {
      id: "anthropic/claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      provider: "anthropic",
      modelType: "language",
      description: "Fast Anthropic model",
    },
  ],
};

function hasConfiguredEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function getConfiguredProviderIds(): AvailableModel["provider"][] {
  const configuredProviders: AvailableModel["provider"][] = [];

  if (
    hasConfiguredEnv("OPENAI_API_KEY") ||
    hasConfiguredEnv("OPENAI_BASE_URL") ||
    hasConfiguredEnv("NEXT_PUBLIC_OPENAI_BASE_URL")
  ) {
    configuredProviders.push("openai");
  }

  if (
    hasConfiguredEnv("ANTHROPIC_API_KEY") ||
    hasConfiguredEnv("ANTHROPIC_AUTH_TOKEN") ||
    hasConfiguredEnv("ANTHROPIC_BASE_URL")
  ) {
    configuredProviders.push("anthropic");
  }

  return configuredProviders;
}

export function getAvailableLanguageModelsFromCatalog(): AvailableModel[] {
  const configuredProviders = getConfiguredProviderIds();
  const providerIds =
    configuredProviders.length > 0
      ? configuredProviders
      : (["openai"] as AvailableModel["provider"][]);

  return filterDisabledModels(
    providerIds.flatMap(
      (providerId) =>
        AVAILABLE_LANGUAGE_MODELS_BY_PROVIDER[
          providerId as AvailableModel["provider"]
        ] ?? [],
    ),
  );
}

export function getModelDisplayName(model: AvailableModel): string {
  return model.name ?? model.id;
}

export function getModelContextLimit(
  modelId: string,
  models: AvailableModel[],
): number | undefined {
  const directMatch = models.find((model) => model.id === modelId);
  if (
    typeof directMatch?.context_window !== "number" ||
    directMatch.context_window <= 0
  ) {
    return undefined;
  }

  return directMatch.context_window;
}

function resolveCostTier(
  usage: { inputTokens: number },
  cost: AvailableModelCost | undefined,
): AvailableModelCostTier | undefined {
  if (!cost) {
    return undefined;
  }

  if (
    usage.inputTokens > 200_000 &&
    (typeof cost.context_over_200k?.input === "number" ||
      typeof cost.context_over_200k?.output === "number")
  ) {
    return {
      input: cost.context_over_200k.input ?? cost.input,
      output: cost.context_over_200k.output ?? cost.output,
      cache_read: cost.context_over_200k.cache_read ?? cost.cache_read,
    };
  }

  return cost;
}

export function estimateModelUsageCost(
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  },
  cost: AvailableModelCost | undefined,
): number | undefined {
  const costTier = resolveCostTier(usage, cost);
  const inputPrice = costTier?.input;
  const outputPrice = costTier?.output;
  if (typeof inputPrice !== "number" || typeof outputPrice !== "number") {
    return undefined;
  }

  const cachedInputTokens = Math.max(0, usage.cachedInputTokens);
  const uncachedInputTokens = Math.max(
    0,
    usage.inputTokens - cachedInputTokens,
  );
  const cacheReadPrice = costTier?.cache_read ?? inputPrice;

  return (
    (uncachedInputTokens * inputPrice) / TOKENS_PER_MILLION +
    (cachedInputTokens * cacheReadPrice) / TOKENS_PER_MILLION +
    (Math.max(0, usage.outputTokens) * outputPrice) / TOKENS_PER_MILLION
  );
}
