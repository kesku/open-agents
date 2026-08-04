"use client";

import useSWR, { useSWRConfig } from "swr";
import { fetcher } from "@/lib/swr";

export interface ModelProviderSettingsItem {
  providerId: string;
  displayName: string;
  baseUrl: string;
  hasApiKey: boolean;
}

export interface SaveModelProviderInput {
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
}

interface ModelProvidersResponse {
  providers: ModelProviderSettingsItem[];
}

export function useModelProviders() {
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR<ModelProvidersResponse>(
    "/api/settings/model-providers",
    fetcher,
  );

  const saveProvider = async (
    provider: SaveModelProviderInput,
  ): Promise<ModelProvidersResponse> => {
    const response = await fetch("/api/settings/model-providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider),
    });
    const responseData = (await response.json()) as
      | ModelProvidersResponse
      | { error?: string };

    if (!response.ok || !("providers" in responseData)) {
      throw new Error(
        "error" in responseData
          ? (responseData.error ?? "Failed to save model provider")
          : "Failed to save model provider",
      );
    }

    await mutate(responseData, { revalidate: false });
    void globalMutate("/api/models");
    return responseData;
  };

  const removeProvider = async (
    providerId: string,
  ): Promise<ModelProvidersResponse> => {
    const response = await fetch("/api/settings/model-providers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    const responseData = (await response.json()) as
      | ModelProvidersResponse
      | { error?: string };

    if (!response.ok || !("providers" in responseData)) {
      throw new Error(
        "error" in responseData
          ? (responseData.error ?? "Failed to delete model provider")
          : "Failed to delete model provider",
      );
    }

    await mutate(responseData, { revalidate: false });
    void globalMutate("/api/models");
    return responseData;
  };

  return {
    providers: data?.providers ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    saveProvider,
    removeProvider,
  };
}
