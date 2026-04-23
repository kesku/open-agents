"use client";

import useSWR, { useSWRConfig } from "swr";
import { fetcher } from "@/lib/swr";

export type ModelProviderSettingsItem = {
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
};

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
    provider: ModelProviderSettingsItem,
  ): Promise<ModelProvidersResponse> => {
    const response = await fetch("/api/settings/model-providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Failed to save model provider");
    }

    const nextData = (await response.json()) as ModelProvidersResponse;
    mutate(nextData, { revalidate: false });
    void globalMutate("/api/models");
    return nextData;
  };

  const removeProvider = async (
    providerId: string,
  ): Promise<ModelProvidersResponse> => {
    const response = await fetch("/api/settings/model-providers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Failed to delete model provider");
    }

    const nextData = (await response.json()) as ModelProvidersResponse;
    mutate(nextData, { revalidate: false });
    void globalMutate("/api/models");
    return nextData;
  };

  return {
    providers: data?.providers ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    saveProvider,
    removeProvider,
    refreshProviders: mutate,
  };
}
