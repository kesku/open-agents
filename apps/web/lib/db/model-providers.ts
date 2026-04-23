import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { OpenAICompatibleProviderConfig } from "@open-harness/agent";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "./client";
import { modelProviders, type ModelProvider } from "./schema";

export interface StoredModelProviderInput {
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
}

export type ModelProviderSettingsItem = StoredModelProviderInput;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function normalizeProviderId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeBaseUrl(value: string): string {
  return trimTrailingSlash(value.trim());
}

function toSettingsItem(row: ModelProvider): ModelProviderSettingsItem {
  return {
    providerId: row.providerId,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    apiKey: decrypt(row.encryptedApiKey),
  };
}

function toRuntimeConfig(
  row: ModelProvider,
): OpenAICompatibleProviderConfig | null {
  try {
    return {
      id: row.providerId,
      name: row.displayName,
      baseURL: row.baseUrl,
      apiKey: decrypt(row.encryptedApiKey),
    };
  } catch {
    return null;
  }
}

export async function getModelProvidersForSettings(
  userId: string,
): Promise<ModelProviderSettingsItem[]> {
  const rows = await db
    .select()
    .from(modelProviders)
    .where(eq(modelProviders.userId, userId));

  return rows.map(toSettingsItem);
}

export async function getModelProviderRuntimeConfigs(
  userId: string,
): Promise<OpenAICompatibleProviderConfig[]> {
  const rows = await db
    .select()
    .from(modelProviders)
    .where(eq(modelProviders.userId, userId));

  return rows
    .map(toRuntimeConfig)
    .filter(
      (provider): provider is NonNullable<ReturnType<typeof toRuntimeConfig>> =>
        provider !== null,
    );
}

export async function upsertModelProvider(
  userId: string,
  input: StoredModelProviderInput,
): Promise<ModelProviderSettingsItem> {
  const providerId = normalizeProviderId(input.providerId);
  const displayName = input.displayName.trim() || providerId;
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const encryptedApiKey = encrypt(input.apiKey.trim());

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
        encryptedApiKey,
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
      encryptedApiKey,
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
