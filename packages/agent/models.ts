import {
  createAnthropic,
  type AnthropicLanguageModelOptions,
} from "@ai-sdk/anthropic";
import { devToolsMiddleware } from "@ai-sdk/devtools";
import {
  createOpenAI,
  type OpenAIResponsesProviderOptions,
} from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type JSONValue,
  type LanguageModel,
} from "ai";

const defaultOpenAIProvider = createOpenAI();
const defaultAnthropicProvider = createAnthropic();

// Kept as a compatibility alias for existing call sites. Model ids are now
// resolved directly through the provider registry instead of AI Gateway.
export type GatewayModelId = string;

function getAnthropicSettings(modelId: string): AnthropicLanguageModelOptions {
  if (modelId.includes("4.6")) {
    return {
      effort: "medium",
      thinking: { type: "adaptive" },
    } satisfies AnthropicLanguageModelOptions;
  }

  return {
    thinking: { type: "enabled", budgetTokens: 8000 },
  };
}

function isJsonObject(value: unknown): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toProviderOptionsRecord(
  options: Record<string, unknown>,
): Record<string, JSONValue> {
  return options as Record<string, JSONValue>;
}

function mergeRecords(
  base: Record<string, JSONValue>,
  override: Record<string, JSONValue>,
): Record<string, JSONValue> {
  const merged: Record<string, JSONValue> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existingValue = merged[key];

    if (isJsonObject(existingValue) && isJsonObject(value)) {
      merged[key] = mergeRecords(existingValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export type ProviderOptionsByProvider = Record<
  string,
  Record<string, JSONValue>
>;

export function mergeProviderOptions(
  defaults: ProviderOptionsByProvider,
  overrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  if (!overrides || Object.keys(overrides).length === 0) {
    return defaults;
  }

  const merged: ProviderOptionsByProvider = { ...defaults };

  for (const [provider, providerOverrides] of Object.entries(overrides)) {
    const providerDefaults = merged[provider];

    if (!providerDefaults) {
      merged[provider] = providerOverrides;
      continue;
    }

    merged[provider] = mergeRecords(providerDefaults, providerOverrides);
  }

  return merged;
}

export interface GatewayConfig {
  baseURL: string;
  apiKey: string;
}

export interface GatewayOptions {
  devtools?: boolean;
  config?: GatewayConfig;
  providerOptionsOverrides?: ProviderOptionsByProvider;
}

export type { LanguageModel, JSONValue };

export function shouldApplyOpenAIReasoningDefaults(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5");
}

function shouldApplyOpenAITextVerbosityDefaults(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5.4");
}

export function getProviderOptionsForModel(
  modelId: string,
  providerOptionsOverrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  const defaultProviderOptions: ProviderOptionsByProvider = {};

  if (modelId.startsWith("anthropic/")) {
    defaultProviderOptions.anthropic = toProviderOptionsRecord(
      getAnthropicSettings(modelId),
    );
  }

  if (modelId.startsWith("openai/")) {
    defaultProviderOptions.openai = toProviderOptionsRecord({
      store: false,
    } satisfies OpenAIResponsesProviderOptions);
  }

  if (shouldApplyOpenAIReasoningDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        reasoningSummary: "detailed",
        include: ["reasoning.encrypted_content"],
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  if (shouldApplyOpenAITextVerbosityDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        textVerbosity: "low",
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  const providerOptions = mergeProviderOptions(
    defaultProviderOptions,
    providerOptionsOverrides,
  );

  if (modelId.startsWith("openai/")) {
    providerOptions.openai = mergeRecords(
      providerOptions.openai ?? {},
      toProviderOptionsRecord({
        store: false,
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  return providerOptions;
}

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function getConfiguredProviderIds(): string[] {
  const configuredProviders: string[] = [];

  if (
    hasEnv("OPENAI_API_KEY") ||
    hasEnv("OPENAI_BASE_URL") ||
    hasEnv("NEXT_PUBLIC_OPENAI_BASE_URL")
  ) {
    configuredProviders.push("openai");
  }

  if (
    hasEnv("ANTHROPIC_API_KEY") ||
    hasEnv("ANTHROPIC_AUTH_TOKEN") ||
    hasEnv("ANTHROPIC_BASE_URL")
  ) {
    configuredProviders.push("anthropic");
  }

  return configuredProviders;
}

function splitModelId(modelId: string): {
  providerId: string;
  providerModelId: string;
} {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex <= 0 || slashIndex === modelId.length - 1) {
    throw new Error(
      `Invalid model id "${modelId}". Expected "provider/model".`,
    );
  }

  return {
    providerId: modelId.slice(0, slashIndex),
    providerModelId: modelId.slice(slashIndex + 1),
  };
}

function createProviderModel(
  providerId: string,
  providerModelId: string,
  config?: GatewayConfig,
): LanguageModelV3 {
  if (providerId === "openai") {
    const provider = config
      ? createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
        })
      : defaultOpenAIProvider;

    return provider(providerModelId);
  }

  if (providerId === "anthropic") {
    const provider = config
      ? createAnthropic({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
        })
      : defaultAnthropicProvider;

    return provider(providerModelId);
  }

  throw new Error(`Unsupported model provider "${providerId}".`);
}

export function gateway(
  modelId: GatewayModelId,
  options: GatewayOptions = {},
): LanguageModelV3 {
  const { devtools = false, config, providerOptionsOverrides } = options;
  const { providerId, providerModelId } = splitModelId(modelId);

  let model: LanguageModelV3 = createProviderModel(
    providerId,
    providerModelId,
    config,
  );

  const providerOptions = getProviderOptionsForModel(
    modelId,
    providerOptionsOverrides,
  );

  if (Object.keys(providerOptions).length > 0) {
    model = wrapLanguageModel({
      model,
      middleware: defaultSettingsMiddleware({
        settings: { providerOptions },
      }),
    });
  }

  if (devtools) {
    model = wrapLanguageModel({ model, middleware: devToolsMiddleware() });
  }

  return model;
}
