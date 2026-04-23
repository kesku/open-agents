import "server-only";

import type { OpenAICompatibleProviderConfig } from "@open-harness/agent";
import { getModelProviderRuntimeConfigs } from "./db/model-providers";
import { filterDisabledModels } from "./model-availability";
import type { AvailableModel } from "./models";

const MODELS_TIMEOUT_MS = 1_500;
const MODELS_CACHE_TTL_MS = 15 * 60 * 1_000;
const MODELS_ENDPOINT_PATH = "/models";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const FEATURED_OPENAI_MODEL_IDS = [
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.2",
  "openai/gpt-5.1",
  "openai/gpt-5-mini",
] as const;

const FEATURED_OPENAI_MODEL_RANK = new Map<string, number>(
  FEATURED_OPENAI_MODEL_IDS.map((modelId, index) => [modelId, index]),
);

const OPENAI_FALLBACK_LANGUAGE_MODELS: AvailableModel[] = [
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
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    provider: "openai",
    modelType: "language",
    description: "Reliable OpenAI reasoning model",
  },
  {
    id: "openai/gpt-5.1",
    name: "GPT-5.1",
    provider: "openai",
    modelType: "language",
    description: "Stable OpenAI GPT-5 generation",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    modelType: "language",
    description: "Low-latency OpenAI GPT-5 option",
  },
];

type RuntimeProviderConfig = OpenAICompatibleProviderConfig & {
  fallbackModels?: AvailableModel[];
};

let cachedProviderModels:
  | Map<string, { expiresAt: number; models: AvailableModel[] }>
  | undefined;
let inFlightProviderModels: Map<string, Promise<AvailableModel[]>> | undefined;

function hasConfiguredEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getModelsEndpointUrl(baseURL: string): string {
  return `${withoutTrailingSlash(baseURL)}${withLeadingSlash(MODELS_ENDPOINT_PATH)}`;
}

function toTitleWord(value: string): string {
  if (/^\d+(\.\d+)*$/.test(value)) {
    return value;
  }

  if (/^[a-z]$/.test(value)) {
    return value.toUpperCase();
  }

  return value[0]?.toUpperCase() + value.slice(1);
}

function formatOpenAIModelName(providerModelId: string): string {
  if (providerModelId.startsWith("gpt-")) {
    const rest = providerModelId.slice("gpt-".length);
    return `GPT-${rest.split("-").filter(Boolean).map(toTitleWord).join(" ")}`;
  }

  if (providerModelId.startsWith("chatgpt-")) {
    const rest = providerModelId.slice("chatgpt-".length);
    return `ChatGPT-${rest
      .split("-")
      .filter(Boolean)
      .map(toTitleWord)
      .join(" ")}`;
  }

  return providerModelId
    .split("-")
    .filter(Boolean)
    .map((segment) => {
      if (segment === "gpt") {
        return "GPT";
      }

      if (segment === "chatgpt") {
        return "ChatGPT";
      }

      return toTitleWord(segment);
    })
    .join(" ");
}

function isOpenAILanguageModelId(modelId: string): boolean {
  const normalizedId = modelId.trim().toLowerCase();
  if (normalizedId.length === 0) {
    return false;
  }

  const allowlistedPrefix =
    normalizedId.startsWith("gpt-") ||
    normalizedId.startsWith("chatgpt-") ||
    normalizedId.startsWith("codex") ||
    /^o\d/.test(normalizedId);

  if (!allowlistedPrefix) {
    return false;
  }

  const excludedKeywords = [
    "audio",
    "image",
    "embedding",
    "moderation",
    "transcribe",
    "translation",
    "tts",
    "speech",
    "realtime",
    "search",
    "vision-preview",
  ];

  return !excludedKeywords.some((keyword) => normalizedId.includes(keyword));
}

function isOpenAICompatibleLanguageModelId(modelId: string): boolean {
  const normalizedId = modelId.trim().toLowerCase();
  if (normalizedId.length === 0) {
    return false;
  }

  const excludedKeywords = [
    "audio",
    "image",
    "embedding",
    "moderation",
    "transcribe",
    "translation",
    "tts",
    "speech",
    "realtime",
  ];

  return !excludedKeywords.some((keyword) => normalizedId.includes(keyword));
}

function sortOpenAIModels(models: AvailableModel[]): AvailableModel[] {
  return [...models].sort((left, right) => {
    const leftFeaturedRank =
      FEATURED_OPENAI_MODEL_RANK.get(left.id) ?? Number.POSITIVE_INFINITY;
    const rightFeaturedRank =
      FEATURED_OPENAI_MODEL_RANK.get(right.id) ?? Number.POSITIVE_INFINITY;

    if (leftFeaturedRank !== rightFeaturedRank) {
      return leftFeaturedRank - rightFeaturedRank;
    }

    return (
      collator.compare(left.name, right.name) ||
      collator.compare(left.id, right.id)
    );
  });
}

function sortGenericModels(models: AvailableModel[]): AvailableModel[] {
  return [...models].sort(
    (left, right) =>
      collator.compare(left.name, right.name) ||
      collator.compare(left.id, right.id),
  );
}

function dedupeModels(models: AvailableModel[]): AvailableModel[] {
  const modelsById = new Map<string, AvailableModel>();

  for (const model of models) {
    modelsById.set(model.id, model);
  }

  return [...modelsById.values()];
}

function normalizeDiscoveredModels(
  provider: RuntimeProviderConfig,
  modelIds: string[],
): AvailableModel[] {
  const discoveredModels = dedupeModels(
    modelIds.map((providerModelId) => ({
      id: `${provider.id}/${providerModelId}`,
      name:
        provider.id === "openai"
          ? formatOpenAIModelName(providerModelId)
          : providerModelId,
      provider: provider.id,
      modelType: "language" as const,
      description:
        provider.id === "openai"
          ? "Discovered from the OpenAI models API"
          : `Discovered from ${provider.name} via /models`,
    })),
  );

  return provider.id === "openai"
    ? sortOpenAIModels(discoveredModels)
    : sortGenericModels(discoveredModels);
}

async function fetchProviderLanguageModelsFromApi(
  provider: RuntimeProviderConfig,
): Promise<AvailableModel[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }

    const response = await fetch(getModelsEndpointUrl(provider.baseURL), {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return provider.fallbackModels ?? [];
    }

    const data: unknown = await response.json();
    const responseData =
      typeof data === "object" && data !== null && "data" in data
        ? data.data
        : undefined;

    if (!Array.isArray(responseData)) {
      return provider.fallbackModels ?? [];
    }

    const modelIds = responseData
      .map((value) =>
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        typeof value.id === "string"
          ? value.id
          : undefined,
      )
      .filter((value): value is string => value !== undefined)
      .filter((value) =>
        provider.id === "openai"
          ? isOpenAILanguageModelId(value)
          : isOpenAICompatibleLanguageModelId(value),
      );

    if (modelIds.length === 0) {
      return provider.fallbackModels ?? [];
    }

    return normalizeDiscoveredModels(provider, modelIds);
  } catch {
    return provider.fallbackModels ?? [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function getProviderCacheKey(provider: RuntimeProviderConfig): string {
  return `${provider.id}|${provider.baseURL}|${provider.apiKey}`;
}

async function getProviderModels(
  provider: RuntimeProviderConfig,
): Promise<AvailableModel[]> {
  const now = Date.now();
  cachedProviderModels ??= new Map();
  inFlightProviderModels ??= new Map();

  const cacheKey = getProviderCacheKey(provider);
  const cachedModels = cachedProviderModels.get(cacheKey);
  if (cachedModels && cachedModels.expiresAt > now) {
    return cachedModels.models;
  }

  const existingPromise = inFlightProviderModels.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const requestPromise = fetchProviderLanguageModelsFromApi(provider).then(
    (models) => {
      cachedProviderModels?.set(cacheKey, {
        expiresAt: Date.now() + MODELS_CACHE_TTL_MS,
        models,
      });
      return models;
    },
  );

  inFlightProviderModels.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightProviderModels.delete(cacheKey);
  }
}

function getOpenAIProviderConfig(): RuntimeProviderConfig {
  return {
    id: "openai",
    name: "OpenAI",
    baseURL:
      process.env.OPENAI_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_OPENAI_BASE_URL?.trim() ||
      DEFAULT_OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY?.trim() || "",
    fallbackModels: OPENAI_FALLBACK_LANGUAGE_MODELS,
  };
}

async function getRuntimeProviders(
  userId?: string,
): Promise<RuntimeProviderConfig[]> {
  const customProviders = userId
    ? await getModelProviderRuntimeConfigs(userId)
    : [];

  const providers: RuntimeProviderConfig[] = [];

  const hasOpenAIConfigured =
    hasConfiguredEnv("OPENAI_API_KEY") ||
    hasConfiguredEnv("OPENAI_BASE_URL") ||
    hasConfiguredEnv("NEXT_PUBLIC_OPENAI_BASE_URL");

  if (hasOpenAIConfigured || customProviders.length === 0) {
    providers.push(getOpenAIProviderConfig());
  }

  providers.push(...customProviders);
  return providers;
}

export async function getAvailableLanguageModelsFromCatalog(
  userId?: string,
): Promise<AvailableModel[]> {
  const providers = await getRuntimeProviders(userId);
  const modelsByProvider = await Promise.all(
    providers.map((provider) => getProviderModels(provider)),
  );
  return filterDisabledModels(modelsByProvider.flat());
}

export function clearModelCatalogCacheForTests(): void {
  cachedProviderModels = undefined;
  inFlightProviderModels = undefined;
}
