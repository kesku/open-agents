import "server-only";

import type { OpenAICompatibleProviderConfig } from "@open-agents/agent";
import { z } from "zod";
import type { AvailableModel } from "./models";

const MODELS_TIMEOUT_MS = 1_500;

const modelsResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string().trim().min(1),
        name: z.string().trim().min(1).optional(),
      })
      .passthrough(),
  ),
});

const EXCLUDED_MODEL_ID_PARTS = [
  "audio",
  "embedding",
  "image",
  "moderation",
  "realtime",
  "speech",
  "transcribe",
  "translation",
  "tts",
] as const;

function isLikelyLanguageModel(modelId: string): boolean {
  const normalizedModelId = modelId.toLowerCase();
  return !EXCLUDED_MODEL_ID_PARTS.some((part) =>
    normalizedModelId.includes(part),
  );
}

function getModelsUrl(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, "")}/models`;
}

async function fetchProviderModels(
  provider: OpenAICompatibleProviderConfig,
): Promise<AvailableModel[]> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    MODELS_TIMEOUT_MS,
  );

  try {
    const response = await fetch(getModelsUrl(provider.baseURL), {
      ...(provider.apiKey
        ? { headers: { Authorization: `Bearer ${provider.apiKey}` } }
        : {}),
      signal: abortController.signal,
    });
    if (!response.ok) {
      return [];
    }

    const parsedResponse = modelsResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsedResponse.success) {
      return [];
    }

    const modelsById = new Map<string, AvailableModel>();
    for (const model of parsedResponse.data.data) {
      if (!isLikelyLanguageModel(model.id)) {
        continue;
      }

      const id = `${provider.id}/${model.id}`;
      modelsById.set(id, {
        id,
        name: model.name ?? model.id,
        description: `Discovered from ${provider.name} via /models`,
        modelType: "language",
      });
    }

    return [...modelsById.values()].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchOpenAICompatibleLanguageModels(
  providers: OpenAICompatibleProviderConfig[],
): Promise<AvailableModel[]> {
  const modelsByProvider = await Promise.all(
    providers.map((provider) => fetchProviderModels(provider)),
  );
  return modelsByProvider.flat();
}
