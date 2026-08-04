import "server-only";

import { gateway } from "@open-agents/agent";
import { resolveChatModelSelection } from "@/app/api/chat/_lib/model-selection";
import { getModelProviderRuntimeConfigs } from "@/lib/db/model-providers";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { getAllVariants } from "@/lib/model-variants";
import { DEFAULT_MODEL_ID } from "@/lib/models";

export async function getHelperLanguageModel(userId: string) {
  const [preferences, openAICompatibleProviders] = await Promise.all([
    getUserPreferences(userId),
    getModelProviderRuntimeConfigs(userId),
  ]);
  const preferredSelection = resolveChatModelSelection({
    selectedModelId: preferences.defaultModelId,
    modelVariants: getAllVariants(preferences.modelVariants),
    missingVariantLabel: "Default helper model variant",
  });
  const preferredProviderId = preferredSelection.id.split("/")[0];
  const hasDirectProvider = openAICompatibleProviders.some(
    (provider) => provider.id === preferredProviderId,
  );
  const selection = hasDirectProvider
    ? preferredSelection
    : { id: DEFAULT_MODEL_ID };

  return gateway(selection.id, {
    providerOptionsOverrides: selection.providerOptionsOverrides,
    openAICompatibleProviders,
  });
}
