import "server-only";

import type { OpenAICompatibleProviderConfig } from "@open-agents/agent";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { decryptSecret, encryptSecret } from "@/lib/encrypted-secret";
import { isDirectModelProvidersEnabled } from "@/lib/model-provider-access";
import { db } from "./client";
import { modelProviders, type ModelProvider } from "./schema";

export interface StoredModelProviderInput {
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
}

export interface ModelProviderSettingsItem {
  providerId: string;
  displayName: string;
  baseUrl: string;
  hasApiKey: boolean;
}

export class DirectModelProvidersDisabledError extends Error {
  constructor() {
    super("Direct model providers are disabled for this deployment");
    this.name = "DirectModelProvidersDisabledError";
  }
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizeProviderId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeBaseUrl(value: string): string {
  return trimTrailingSlashes(value.trim());
}

function getSecretPurpose(userId: string, providerId: string): string {
  return `model-provider:${userId}:${providerId}`;
}

function toSettingsItem(row: ModelProvider): ModelProviderSettingsItem {
  return {
    providerId: row.providerId,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    hasApiKey: Boolean(row.encryptedApiKey),
  };
}

function toRuntimeConfig(row: ModelProvider): OpenAICompatibleProviderConfig {
  return {
    id: row.providerId,
    name: row.displayName,
    baseURL: row.baseUrl,
    ...(row.encryptedApiKey
      ? {
          apiKey: decryptSecret(
            row.encryptedApiKey,
            getSecretPurpose(row.userId, row.providerId),
          ),
        }
      : {}),
  };
}

export async function getModelProvidersForSettings(
  userId: string,
): Promise<ModelProviderSettingsItem[]> {
  if (!isDirectModelProvidersEnabled()) {
    return [];
  }

  const rows = await db
    .select()
    .from(modelProviders)
    .where(eq(modelProviders.userId, userId))
    .orderBy(asc(modelProviders.displayName));

  return rows.map(toSettingsItem);
}

export async function getModelProviderRuntimeConfigs(
  userId: string,
): Promise<OpenAICompatibleProviderConfig[]> {
  if (!isDirectModelProvidersEnabled()) {
    return [];
  }

  const rows = await db
    .select()
    .from(modelProviders)
    .where(eq(modelProviders.userId, userId));

  return rows.map(toRuntimeConfig);
}

export async function upsertModelProvider(
  userId: string,
  input: StoredModelProviderInput,
): Promise<ModelProviderSettingsItem> {
  if (!isDirectModelProvidersEnabled()) {
    throw new DirectModelProvidersDisabledError();
  }

  const providerId = normalizeProviderId(input.providerId);
  const displayName = input.displayName.trim();
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const hasApiKeyUpdate = Object.hasOwn(input, "apiKey");
  const apiKey = input.apiKey?.trim() ?? "";

  const [existing] = await db
    .select()
    .from(modelProviders)
    .where(
      and(
        eq(modelProviders.userId, userId),
        eq(modelProviders.providerId, providerId),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(modelProviders)
      .set({
        displayName,
        baseUrl,
        ...(hasApiKeyUpdate
          ? {
              encryptedApiKey: apiKey
                ? encryptSecret(apiKey, getSecretPurpose(userId, providerId))
                : null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(modelProviders.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update model provider");
    }

    return toSettingsItem(updated);
  }

  const [created] = await db
    .insert(modelProviders)
    .values({
      id: nanoid(),
      userId,
      providerId,
      displayName,
      baseUrl,
      encryptedApiKey: apiKey
        ? encryptSecret(apiKey, getSecretPurpose(userId, providerId))
        : null,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create model provider");
  }

  return toSettingsItem(created);
}

export async function deleteModelProvider(
  userId: string,
  providerIdInput: string,
): Promise<boolean> {
  if (!isDirectModelProvidersEnabled()) {
    throw new DirectModelProvidersDisabledError();
  }

  const providerId = normalizeProviderId(providerIdInput);
  const [deleted] = await db
    .delete(modelProviders)
    .where(
      and(
        eq(modelProviders.userId, userId),
        eq(modelProviders.providerId, providerId),
      ),
    )
    .returning({ id: modelProviders.id });

  return Boolean(deleted);
}
