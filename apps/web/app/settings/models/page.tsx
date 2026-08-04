import type { Metadata } from "next";
import { isDirectModelProvidersEnabled } from "@/lib/model-provider-access";
import { ModelProvidersSection } from "../model-providers-section";
import { ModelVariantsSection } from "../model-variants-section";
import { ModelPreferencesSection } from "../preferences-section";

export const metadata: Metadata = {
  title: "Models",
  description:
    "Configure model preferences, direct providers, and model variants.",
};

export default function ModelsPage() {
  const directModelProvidersEnabled = isDirectModelProvidersEnabled();

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Models</h1>
        <p className="text-sm text-muted-foreground">
          Set your default models and create named variants with provider-
          specific settings.
        </p>
      </div>

      <ModelPreferencesSection />

      <div className="border-t border-border/50" />

      {directModelProvidersEnabled ? (
        <>
          <ModelProvidersSection />
          <div className="border-t border-border/50" />
        </>
      ) : null}

      <ModelVariantsSection />
    </div>
  );
}
