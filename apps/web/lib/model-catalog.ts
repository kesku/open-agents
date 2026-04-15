import "server-only";

import { filterDisabledModels } from "./model-availability";
import type { AvailableModel, AvailableModelProvider } from "./models";

const OPENAI_MODELS_TIMEOUT_MS = 1_500;
const OPENAI_MODELS_CACHE_TTL_MS = 15 * 60 * 1_000;
const OPENAI_MODELS_ENDPOINT_PATH = "/models";
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

const PERPLEXITY_LANGUAGE_MODELS: AvailableModel[] = [
  {
    id: "perplexity/sonar",
    name: "Sonar",
    provider: "perplexity",
    modelType: "language",
    description: "Perplexity native search and answer model",
  },
  {
    id: "perplexity/anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6 via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "Anthropic Opus routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/anthropic/claude-opus-4-5",
    name: "Claude Opus 4.5 via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "Anthropic Opus routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "Anthropic Sonnet routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5 via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "Anthropic Sonnet routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/anthropic/claude-haiku-4-5",
    name: "Claude Haiku 4.5 via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "Anthropic Haiku routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/openai/gpt-5.4",
    name: "GPT-5.4 via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "OpenAI GPT-5.4 routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/openai/gpt-5.2",
    name: "GPT-5.2 via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "OpenAI GPT-5.2 routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/openai/gpt-5.1",
    name: "GPT-5.1 via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "OpenAI GPT-5.1 routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/openai/gpt-5-mini",
    name: "GPT-5 Mini via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "OpenAI GPT-5 Mini routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "Google Gemini routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/google/gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "Google Gemini routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/nvidia/nemotron-3-super-120b-a12b",
    name: "Nemotron 3 Super 120B A12B via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description:
      "NVIDIA Nemotron routed through Perplexity's OpenAI-compatible API",
  },
  {
    id: "perplexity/xai/grok-4-1-fast-non-reasoning",
    name: "Grok 4.1 Fast Non-Reasoning via Perplexity",
    provider: "perplexity",
    modelType: "language",
    description: "xAI Grok routed through Perplexity's OpenAI-compatible API",
  },
];

let cachedOpenAILanguageModels:
  | { expiresAt: number; models: AvailableModel[] }
  | undefined;
let inFlightOpenAILanguageModels: Promise<AvailableModel[]> | undefined;

function hasConfiguredEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function getConfiguredProviderIds(): AvailableModelProvider[] {
  const configuredProviders: AvailableModelProvider[] = [];

  if (
    hasConfiguredEnv("OPENAI_API_KEY") ||
    hasConfiguredEnv("OPENAI_BASE_URL") ||
    hasConfiguredEnv("NEXT_PUBLIC_OPENAI_BASE_URL")
  ) {
    configuredProviders.push("openai");
  }

  if (
    hasConfiguredEnv("PERPLEXITY_API_KEY") ||
    hasConfiguredEnv("PERPLEXITY_BASE_URL")
  ) {
    configuredProviders.push("perplexity");
  }

  return configuredProviders;
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getOpenAIModelsEndpointUrl(): string {
  const configuredBaseURL =
    process.env.OPENAI_BASE_URL ??
    process.env.NEXT_PUBLIC_OPENAI_BASE_URL ??
    DEFAULT_OPENAI_BASE_URL;

  return `${withoutTrailingSlash(configuredBaseURL)}${withLeadingSlash(OPENAI_MODELS_ENDPOINT_PATH)}`;
}

function shouldFetchOpenAIModelsFromApi(): boolean {
  return (
    hasConfiguredEnv("OPENAI_API_KEY") ||
    hasConfiguredEnv("OPENAI_BASE_URL") ||
    hasConfiguredEnv("NEXT_PUBLIC_OPENAI_BASE_URL")
  );
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

function dedupeModels(models: AvailableModel[]): AvailableModel[] {
  const modelsById = new Map<string, AvailableModel>();

  for (const model of models) {
    modelsById.set(model.id, model);
  }

  return [...modelsById.values()];
}

function normalizeOpenAIModels(modelIds: string[]): AvailableModel[] {
  return sortOpenAIModels(
    dedupeModels(
      modelIds.map((providerModelId) => ({
        id: `openai/${providerModelId}`,
        name: formatOpenAIModelName(providerModelId),
        provider: "openai",
        modelType: "language",
        description: "Discovered from the OpenAI models API",
      })),
    ),
  );
}

async function fetchOpenAILanguageModelsFromApi(): Promise<AvailableModel[]> {
  if (!shouldFetchOpenAIModelsFromApi()) {
    return OPENAI_FALLBACK_LANGUAGE_MODELS;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    OPENAI_MODELS_TIMEOUT_MS,
  );

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(getOpenAIModelsEndpointUrl(), {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return OPENAI_FALLBACK_LANGUAGE_MODELS;
    }

    const data: unknown = await response.json();
    const responseData =
      typeof data === "object" && data !== null && "data" in data
        ? data.data
        : undefined;

    if (!Array.isArray(responseData)) {
      return OPENAI_FALLBACK_LANGUAGE_MODELS;
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
      .filter(isOpenAILanguageModelId);

    if (modelIds.length === 0) {
      return OPENAI_FALLBACK_LANGUAGE_MODELS;
    }

    return normalizeOpenAIModels(modelIds);
  } catch {
    return OPENAI_FALLBACK_LANGUAGE_MODELS;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getOpenAILanguageModels(): Promise<AvailableModel[]> {
  const now = Date.now();
  if (
    cachedOpenAILanguageModels &&
    cachedOpenAILanguageModels.expiresAt > now
  ) {
    return cachedOpenAILanguageModels.models;
  }

  if (!inFlightOpenAILanguageModels) {
    inFlightOpenAILanguageModels = fetchOpenAILanguageModelsFromApi().then(
      (models) => {
        const nextModels = sortOpenAIModels(dedupeModels(models));
        cachedOpenAILanguageModels = {
          expiresAt: Date.now() + OPENAI_MODELS_CACHE_TTL_MS,
          models: nextModels,
        };
        return nextModels;
      },
    );
  }

  try {
    return await inFlightOpenAILanguageModels;
  } finally {
    inFlightOpenAILanguageModels = undefined;
  }
}

async function getModelsForProvider(
  providerId: AvailableModelProvider,
): Promise<AvailableModel[]> {
  switch (providerId) {
    case "openai":
      return getOpenAILanguageModels();
    case "perplexity":
      return PERPLEXITY_LANGUAGE_MODELS;
    case "anthropic":
      return [];
  }
}

export async function getAvailableLanguageModelsFromCatalog(): Promise<
  AvailableModel[]
> {
  const configuredProviders = getConfiguredProviderIds();
  const providerIds =
    configuredProviders.length > 0
      ? configuredProviders
      : (["openai"] as const satisfies readonly AvailableModelProvider[]);

  const modelsByProvider = await Promise.all(
    providerIds.map((providerId) => getModelsForProvider(providerId)),
  );

  return filterDisabledModels(modelsByProvider.flat());
}

export function clearModelCatalogCacheForTests(): void {
  cachedOpenAILanguageModels = undefined;
  inFlightOpenAILanguageModels = undefined;
}
